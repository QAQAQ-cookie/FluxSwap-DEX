import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

describe("FluxEthWethFlow", async function () {
  const hardhatNetwork = await network.connect();
  const { viem, networkHelpers } = hardhatNetwork;
  const publicClient = await viem.getPublicClient();
  const [multisigClient, guardianClient, operatorClient, lpClient, traderClient, recipientClient] =
    await viem.getWalletClients();

  const timelockDelay = 3600n;
  const maxUint256 = (1n << 256n) - 1n;
  const protocolFeeBps = 5n;
  const feeBase = 10000n;

  let treasury: any;
  let factory: any;
  let router: any;
  let WETH: any;
  let token: any;

  async function getDeadline() {
    return (await publicClient.getBlock()).timestamp + 3600n;
  }

  async function scheduleAndExecute(operationId: `0x${string}`, execute: () => Promise<unknown>) {
    await treasury.write.scheduleOperation([operationId, timelockDelay], {
      account: multisigClient.account.address,
    });
    await networkHelpers.time.increase(Number(timelockDelay));
    await execute();
  }

  async function configureTreasuryAllocation(tokenAddress: `0x${string}`, recipient: `0x${string}`, cap: bigint) {
    const allowTokenOp = await treasury.read.hashSetAllowedToken([tokenAddress, true]);
    await scheduleAndExecute(allowTokenOp, () =>
      treasury.write.executeSetAllowedToken([tokenAddress, true, allowTokenOp])
    );

    const allowRecipientOp = await treasury.read.hashSetAllowedRecipient([recipient, true]);
    await scheduleAndExecute(allowRecipientOp, () =>
      treasury.write.executeSetAllowedRecipient([recipient, true, allowRecipientOp])
    );

    const capOp = await treasury.read.hashSetDailySpendCap([tokenAddress, cap]);
    await scheduleAndExecute(capOp, () => treasury.write.executeSetDailySpendCap([tokenAddress, cap, capOp]));
  }

  beforeEach(async function () {
    treasury = await viem.deployContract("FluxSwapTreasury", [
      multisigClient.account.address,
      guardianClient.account.address,
      operatorClient.account.address,
      timelockDelay,
    ]);

    WETH = await viem.deployContract("MockWETH", []);
    factory = await viem.deployContract("FluxSwapFactory", [multisigClient.account.address]);
    router = await viem.deployContract("FluxSwapRouter", [factory.address, WETH.address]);
    token = await viem.deployContract("MockERC20", ["Wrapped Flow Token", "WFT", 18]);

    await factory.write.setTreasury([treasury.address], {
      account: multisigClient.account.address,
    });

    await token.write.mint([lpClient.account.address, 1_000_000n * 10n ** 18n]);
    await token.write.mint([traderClient.account.address, 1_000_000n * 10n ** 18n]);

    await token.write.approve([router.address, maxUint256], {
      account: lpClient.account.address,
    });
    await token.write.approve([router.address, maxUint256], {
      account: traderClient.account.address,
    });
  });

  it("should run the ETH-WETH liquidity and swap flow end to end while routing protocol fees into treasury", async function () {
    await router.write.addLiquidityETH(
      [token.address, 10_000n * 10n ** 18n, 0n, 0n, lpClient.account.address, await getDeadline()],
      { account: lpClient.account.address, value: 10n * 10n ** 18n }
    );

    const pairAddress = await factory.read.getPair([token.address, WETH.address]);
    const pair = await viem.getContractAt("FluxSwapPair", pairAddress);
    const lpLiquidity = await pair.read.balanceOf([lpClient.account.address]);

    ok(lpLiquidity > 0n, "liquidity provider should receive LP tokens");

    const ethIn = 1n * 10n ** 18n;
    const wethFee = (ethIn * protocolFeeBps) / feeBase;
    const expectedTokenOut = (
      await router.read.getAmountsOut([ethIn, [WETH.address, token.address]])
    )[1];
    const traderTokenBefore = await token.read.balanceOf([traderClient.account.address]);
    const treasuryWethBefore = await WETH.read.balanceOf([treasury.address]);

    await router.write.swapExactETHForTokens(
      [0n, [WETH.address, token.address], traderClient.account.address, await getDeadline()],
      { account: traderClient.account.address, value: ethIn }
    );

    strictEqual((await token.read.balanceOf([traderClient.account.address])) - traderTokenBefore, expectedTokenOut);
    strictEqual((await WETH.read.balanceOf([treasury.address])) - treasuryWethBefore, wethFee);

    await configureTreasuryAllocation(WETH.address, recipientClient.account.address, wethFee);
    const recipientWethBefore = await WETH.read.balanceOf([recipientClient.account.address]);

    await treasury.write.allocate([WETH.address, recipientClient.account.address, wethFee], {
      account: operatorClient.account.address,
    });

    strictEqual((await WETH.read.balanceOf([recipientClient.account.address])) - recipientWethBefore, wethFee);
    strictEqual(await WETH.read.balanceOf([treasury.address]), 0n);

    const tokenIn = 100n * 10n ** 18n;
    const tokenFee = (tokenIn * protocolFeeBps) / feeBase;
    const expectedEthOut = (
      await router.read.getAmountsOut([tokenIn, [token.address, WETH.address]])
    )[1];
    const recipientEthBeforeSwap = await publicClient.getBalance({ address: recipientClient.account.address });
    const treasuryTokenBefore = await token.read.balanceOf([treasury.address]);

    await router.write.swapExactTokensForETH(
      [tokenIn, 0n, [token.address, WETH.address], recipientClient.account.address, await getDeadline()],
      { account: traderClient.account.address }
    );

    strictEqual(
      (await publicClient.getBalance({ address: recipientClient.account.address })) - recipientEthBeforeSwap,
      expectedEthOut
    );
    strictEqual((await token.read.balanceOf([treasury.address])) - treasuryTokenBefore, tokenFee);

    await configureTreasuryAllocation(token.address, recipientClient.account.address, tokenFee);
    const recipientTokenBeforeTreasuryRelease = await token.read.balanceOf([recipientClient.account.address]);

    await treasury.write.allocate([token.address, recipientClient.account.address, tokenFee], {
      account: operatorClient.account.address,
    });

    strictEqual(
      (await token.read.balanceOf([recipientClient.account.address])) - recipientTokenBeforeTreasuryRelease,
      tokenFee
    );
    strictEqual(await token.read.balanceOf([treasury.address]), 0n);

    await pair.write.approve([router.address, lpLiquidity], {
      account: lpClient.account.address,
    });

    const recipientTokenBeforeRemove = await token.read.balanceOf([recipientClient.account.address]);
    const recipientEthBeforeRemove = await publicClient.getBalance({ address: recipientClient.account.address });

    await router.write.removeLiquidityETH(
      [token.address, lpLiquidity, 0n, 0n, recipientClient.account.address, await getDeadline()],
      { account: lpClient.account.address }
    );

    ok(await token.read.balanceOf([recipientClient.account.address]) > recipientTokenBeforeRemove);
    ok((await publicClient.getBalance({ address: recipientClient.account.address })) > recipientEthBeforeRemove);
    strictEqual(await pair.read.balanceOf([lpClient.account.address]), 0n);

    const [reserve0AfterRemove, reserve1AfterRemove] = await pair.read.getReserves();
    ok(reserve0AfterRemove > 0n && reserve1AfterRemove > 0n, "minimum liquidity should remain locked in the pair");
  });
});
