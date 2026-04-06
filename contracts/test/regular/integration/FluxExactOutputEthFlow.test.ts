import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { strictEqual } from "node:assert";

describe("FluxExactOutputEthFlow", async function () {
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
    token = await viem.deployContract("MockERC20", ["Output Flow Token", "OFT", 18]);

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

    await router.write.addLiquidityETH(
      [token.address, 10_000n * 10n ** 18n, 0n, 0n, lpClient.account.address, await getDeadline()],
      { account: lpClient.account.address, value: 10n * 10n ** 18n }
    );
  });

  it("should fulfill exact-output token and ETH routes while still routing the protocol fee asset into treasury", async function () {
    const desiredEthOut = 5n * 10n ** 17n;
    const tokenToEthPath = [token.address, WETH.address];
    const tokenToEthAmounts = await router.read.getAmountsIn([desiredEthOut, tokenToEthPath]);
    const tokenFee = (tokenToEthAmounts[0] * protocolFeeBps) / feeBase;

    const traderTokenBefore = await token.read.balanceOf([traderClient.account.address]);
    const recipientEthBefore = await publicClient.getBalance({ address: recipientClient.account.address });
    const treasuryTokenBefore = await token.read.balanceOf([treasury.address]);

    await router.write.swapTokensForExactETH(
      [desiredEthOut, tokenToEthAmounts[0], tokenToEthPath, recipientClient.account.address, await getDeadline()],
      { account: traderClient.account.address }
    );

    strictEqual(traderTokenBefore - (await token.read.balanceOf([traderClient.account.address])), tokenToEthAmounts[0]);
    strictEqual((await publicClient.getBalance({ address: recipientClient.account.address })) - recipientEthBefore, desiredEthOut);
    strictEqual((await token.read.balanceOf([treasury.address])) - treasuryTokenBefore, tokenFee);

    const desiredTokenOut = 50n * 10n ** 18n;
    const ethToTokenPath = [WETH.address, token.address];
    const ethToTokenAmounts = await router.read.getAmountsIn([desiredTokenOut, ethToTokenPath]);
    const wethFee = (ethToTokenAmounts[0] * protocolFeeBps) / feeBase;

    const recipientTokenBefore = await token.read.balanceOf([recipientClient.account.address]);
    const treasuryWethBefore = await WETH.read.balanceOf([treasury.address]);

    await router.write.swapETHForExactTokens(
      [desiredTokenOut, ethToTokenPath, recipientClient.account.address, await getDeadline()],
      { account: traderClient.account.address, value: ethToTokenAmounts[0] }
    );

    strictEqual((await token.read.balanceOf([recipientClient.account.address])) - recipientTokenBefore, desiredTokenOut);
    strictEqual((await WETH.read.balanceOf([treasury.address])) - treasuryWethBefore, wethFee);

    await configureTreasuryAllocation(token.address, recipientClient.account.address, tokenFee);
    await configureTreasuryAllocation(WETH.address, recipientClient.account.address, wethFee);

    const recipientTokenBeforeAllocation = await token.read.balanceOf([recipientClient.account.address]);
    const recipientWethBeforeAllocation = await WETH.read.balanceOf([recipientClient.account.address]);

    await treasury.write.allocate([token.address, recipientClient.account.address, tokenFee], {
      account: operatorClient.account.address,
    });
    await treasury.write.allocate([WETH.address, recipientClient.account.address, wethFee], {
      account: operatorClient.account.address,
    });

    strictEqual((await token.read.balanceOf([recipientClient.account.address])) - recipientTokenBeforeAllocation, tokenFee);
    strictEqual((await WETH.read.balanceOf([recipientClient.account.address])) - recipientWethBeforeAllocation, wethFee);
    strictEqual(await token.read.balanceOf([treasury.address]), 0n);
    strictEqual(await WETH.read.balanceOf([treasury.address]), 0n);
  });
});
