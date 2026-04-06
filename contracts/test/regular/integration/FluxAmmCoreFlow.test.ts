import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

describe("FluxAmmCoreFlow", async function () {
  const hardhatNetwork = await network.connect();
  const { viem, networkHelpers } = hardhatNetwork;
  const publicClient = await viem.getPublicClient();
  const [multisigClient, guardianClient, operatorClient, lpClient, traderClient, recipientClient] =
    await viem.getWalletClients();

  const zeroAddress = "0x0000000000000000000000000000000000000000";
  const timelockDelay = 3600n;
  const maxUint256 = (1n << 256n) - 1n;
  const protocolFeeBps = 5n;
  const feeBase = 10000n;

  let treasury: any;
  let factory: any;
  let router: any;
  let WETH: any;
  let tokenA: any;
  let tokenB: any;

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

    tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
    tokenB = await viem.deployContract("MockERC20", ["Token B", "TKNB", 18]);

    await tokenA.write.mint([lpClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenB.write.mint([lpClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenA.write.mint([traderClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenB.write.mint([traderClient.account.address, 1_000_000n * 10n ** 18n]);

    await tokenA.write.approve([router.address, maxUint256], { account: lpClient.account.address });
    await tokenB.write.approve([router.address, maxUint256], { account: lpClient.account.address });
    await tokenA.write.approve([router.address, maxUint256], { account: traderClient.account.address });
    await tokenB.write.approve([router.address, maxUint256], { account: traderClient.account.address });
  });

  it("should create a treasury-enabled pair, collect swap fees, release them through treasury, and let the LP unwind liquidity", async function () {
    strictEqual(await factory.read.allPairsLength(), 0n);
    strictEqual(await factory.read.getPair([tokenA.address, tokenB.address]), zeroAddress);

    await factory.write.setTreasury([treasury.address], {
      account: multisigClient.account.address,
    });

    await router.write.addLiquidity(
      [
        tokenA.address,
        tokenB.address,
        10_000n * 10n ** 18n,
        10_000n * 10n ** 18n,
        0n,
        0n,
        lpClient.account.address,
        await getDeadline(),
      ],
      { account: lpClient.account.address }
    );

    const pairAddress = await factory.read.getPair([tokenA.address, tokenB.address]);
    ok(pairAddress !== zeroAddress, "router liquidity provision should create the pair");
    strictEqual(await factory.read.allPairsLength(), 1n);

    const pair = await viem.getContractAt("FluxSwapPair", pairAddress);
    const [reserve0BeforeSwap, reserve1BeforeSwap] = await pair.read.getReserves();
    const pairToken0 = String(await pair.read.token0()).toLowerCase();
    const tokenAAddress = String(tokenA.address).toLowerCase();

    ok(
      (await tokenA.read.balanceOf([pair.address])) + (await tokenB.read.balanceOf([pair.address])) > 0n,
      "pair should hold liquidity after provisioning"
    );

    const amountIn = 100n * 10n ** 18n;
    const protocolFee = (amountIn * protocolFeeBps) / feeBase;
    const expectedAmountsOut = await router.read.getAmountsOut([amountIn, [tokenA.address, tokenB.address]]);
    const traderTokenBBefore = await tokenB.read.balanceOf([traderClient.account.address]);
    const treasuryTokenABefore = await tokenA.read.balanceOf([treasury.address]);

    await router.write.swapExactTokensForTokens(
      [amountIn, 0n, [tokenA.address, tokenB.address], traderClient.account.address, await getDeadline()],
      { account: traderClient.account.address }
    );

    strictEqual((await tokenA.read.balanceOf([treasury.address])) - treasuryTokenABefore, protocolFee);
    strictEqual(
      (await tokenB.read.balanceOf([traderClient.account.address])) - traderTokenBBefore,
      expectedAmountsOut[1]
    );

    const [reserve0AfterSwap, reserve1AfterSwap] = await pair.read.getReserves();
    ok(reserve0AfterSwap !== reserve0BeforeSwap || reserve1AfterSwap !== reserve1BeforeSwap);
    strictEqual(
      await tokenA.read.balanceOf([pair.address]),
      pairToken0 === tokenAAddress ? reserve0AfterSwap : reserve1AfterSwap
    );
    strictEqual(
      await tokenB.read.balanceOf([pair.address]),
      pairToken0 === tokenAAddress ? reserve1AfterSwap : reserve0AfterSwap
    );

    await configureTreasuryAllocation(tokenA.address, recipientClient.account.address, protocolFee);

    const recipientTokenABefore = await tokenA.read.balanceOf([recipientClient.account.address]);
    await treasury.write.allocate([tokenA.address, recipientClient.account.address, protocolFee], {
      account: operatorClient.account.address,
    });

    strictEqual(
      (await tokenA.read.balanceOf([recipientClient.account.address])) - recipientTokenABefore,
      protocolFee
    );
    strictEqual(await tokenA.read.balanceOf([treasury.address]), 0n);

    const lpLiquidity = await pair.read.balanceOf([lpClient.account.address]);
    const lpTokenABeforeRemove = await tokenA.read.balanceOf([lpClient.account.address]);
    const lpTokenBBeforeRemove = await tokenB.read.balanceOf([lpClient.account.address]);

    await pair.write.approve([router.address, lpLiquidity], {
      account: lpClient.account.address,
    });
    await router.write.removeLiquidity(
      [
        tokenA.address,
        tokenB.address,
        lpLiquidity,
        0n,
        0n,
        lpClient.account.address,
        await getDeadline(),
      ],
      { account: lpClient.account.address }
    );

    ok(await tokenA.read.balanceOf([lpClient.account.address]) > lpTokenABeforeRemove);
    ok(await tokenB.read.balanceOf([lpClient.account.address]) > lpTokenBBeforeRemove);
    strictEqual(await pair.read.balanceOf([lpClient.account.address]), 0n);

    const [reserve0AfterRemove, reserve1AfterRemove] = await pair.read.getReserves();
    ok(reserve0AfterRemove > 0n && reserve1AfterRemove > 0n, "minimum liquidity should leave dust in the pair");
    strictEqual(
      await tokenA.read.balanceOf([pair.address]),
      pairToken0 === tokenAAddress ? reserve0AfterRemove : reserve1AfterRemove
    );
    strictEqual(
      await tokenB.read.balanceOf([pair.address]),
      pairToken0 === tokenAAddress ? reserve1AfterRemove : reserve0AfterRemove
    );
  });
});
