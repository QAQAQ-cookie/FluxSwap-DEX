import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

/**
 * 经济对抗场景测试
 * 1. 校验 buyback 在引用过期报价时，会因前置交易导致滑点失配而安全回滚，不消耗 treasury 资金或 allowance。
 * 2. 校验多跳 buyback 在连续前置交易同时打坏两跳价格后，也会安全回滚并保持 allowance 原样。
 * 3. 校验 treasury daily cap 被压低后，buyback 路径会整笔回滚，不会留下半消费状态。
 * 4. 校验 manager treasury 指针漂移时，direct reward 路径会在资金转移前失败，不偷耗 allowance。
 * 5. 校验微额 direct reward 在 rewardDelta 舍入为 0 时会整笔回滚，不留下 token 或 accounting 污染。
 * 6. 校验在重新报价、恢复 spend cap 或修复指针之后，收入流仍能继续执行，不会因前一次失败而卡死。
 */
describe("FluxEconomicAdversarial", async function () {
  const hardhatNetwork = await network.connect();
  const { viem, networkHelpers } = hardhatNetwork;
  const publicClient = await viem.getPublicClient();
  const [multisigClient, guardianClient, operatorClient, lpClient, traderClient, attackerClient] =
    await viem.getWalletClients();

  const bpsBase = 10_000n;
  const protocolFeeBps = 5n;
  const timelockDelay = 3_600n;
  const initialSupply = 10_000_000n * 10n ** 18n;
  const cap = 100_000_000n * 10n ** 18n;
  const maxUint256 = (1n << 256n) - 1n;
  const rewardPool = lpClient.account.address;

  let treasury: any;
  let fluxToken: any;
  let revenueToken: any;
  let WETH: any;
  let factory: any;
  let router: any;
  let manager: any;
  let buybackExecutor: any;
  let revenueDistributor: any;

  const getDeadline = async () => (await publicClient.getBlock()).timestamp + 3_600n;
  const getProtocolFee = (amountIn: bigint) => (amountIn * protocolFeeBps) / bpsBase;

  const expectRevert = async (promise: Promise<unknown>, reason: string) => {
    let error: any;
    try {
      await promise;
    } catch (caught) {
      error = caught;
    }

    ok(error, `Expected revert with reason: ${reason}`);

    const errorText = [error?.details, error?.shortMessage, error?.message, String(error)]
      .filter((value): value is string => typeof value === "string")
      .join("\n");

    ok(errorText.includes(reason), `Expected revert reason "${reason}", got: ${errorText}`);
  };

  async function scheduleAndExecute(operationId: `0x${string}`, execute: () => Promise<unknown>) {
    await treasury.write.scheduleOperation([operationId, timelockDelay], {
      account: multisigClient.account.address,
    });
    await networkHelpers.time.increase(Number(timelockDelay));
    await execute();
  }

  async function approveTreasurySpender(tokenAddress: `0x${string}`, spender: `0x${string}`, amount: bigint) {
    const approveOp = await treasury.read.hashApproveSpender([tokenAddress, spender, amount]);
    await scheduleAndExecute(approveOp, () =>
      treasury.write.executeApproveSpender([tokenAddress, spender, amount, approveOp])
    );
  }

  async function setDailySpendCap(tokenAddress: `0x${string}`, newCap: bigint) {
    const capOp = await treasury.read.hashSetDailySpendCap([tokenAddress, newCap]);
    await scheduleAndExecute(capOp, () =>
      treasury.write.executeSetDailySpendCap([tokenAddress, newCap, capOp])
    );
  }

  async function accrueProtocolRevenue(swapAmount: bigint) {
    await router.write.swapExactTokensForTokens([
      swapAmount,
      0n,
      [revenueToken.address, fluxToken.address],
      traderClient.account.address,
      await getDeadline(),
    ], { account: traderClient.account.address });

    return getProtocolFee(swapAmount);
  }

  beforeEach(async function () {
    treasury = await viem.deployContract("FluxSwapTreasury", [
      multisigClient.account.address,
      guardianClient.account.address,
      operatorClient.account.address,
      timelockDelay,
    ]);

    fluxToken = await viem.deployContract("FluxToken", [
      "Flux Token",
      "FLUX",
      multisigClient.account.address,
      treasury.address,
      initialSupply,
      cap,
    ]);

    revenueToken = await viem.deployContract("MockERC20", ["Revenue Token", "USDX", 18]);
    WETH = await viem.deployContract("MockWETH", []);
    factory = await viem.deployContract("FluxSwapFactory", [multisigClient.account.address]);
    router = await viem.deployContract("FluxSwapRouter", [factory.address, WETH.address]);

    manager = await viem.deployContract("FluxMultiPoolManager", [
      multisigClient.account.address,
      treasury.address,
      operatorClient.account.address,
      fluxToken.address,
    ]);
    await manager.write.addPool([rewardPool, 100n, true], {
      account: multisigClient.account.address,
    });

    buybackExecutor = await viem.deployContract("FluxBuybackExecutor", [
      multisigClient.account.address,
      treasury.address,
      operatorClient.account.address,
      router.address,
      fluxToken.address,
      treasury.address,
    ]);

    revenueDistributor = await viem.deployContract("FluxRevenueDistributor", [
      multisigClient.account.address,
      operatorClient.account.address,
      buybackExecutor.address,
      manager.address,
      bpsBase,
      0n,
    ]);

    await buybackExecutor.write.setOperator([revenueDistributor.address], {
      account: multisigClient.account.address,
    });
    await manager.write.setOperator([revenueDistributor.address], {
      account: multisigClient.account.address,
    });
    await factory.write.setTreasury([treasury.address], {
      account: multisigClient.account.address,
    });

    await fluxToken.write.mint([lpClient.account.address, 300_000n * 10n ** 18n], {
      account: multisigClient.account.address,
    });
    await revenueToken.write.mint([lpClient.account.address, 300_000n * 10n ** 18n]);
    await revenueToken.write.mint([traderClient.account.address, 300_000n * 10n ** 18n]);
    await revenueToken.write.mint([attackerClient.account.address, 300_000n * 10n ** 18n]);

    await fluxToken.write.approve([router.address, maxUint256], {
      account: lpClient.account.address,
    });

    for (const account of [lpClient.account.address, traderClient.account.address, attackerClient.account.address]) {
      await revenueToken.write.approve([router.address, maxUint256], { account });
    }

    await router.write.addLiquidity([
      fluxToken.address,
      revenueToken.address,
      100_000n * 10n ** 18n,
      100_000n * 10n ** 18n,
      0n,
      0n,
      lpClient.account.address,
      await getDeadline(),
    ], { account: lpClient.account.address });
  });

  it("should revert a stale buyback quote after an adverse pre-trade without leaking treasury value", async function () {
    const revenueAmount = await accrueProtocolRevenue(20_000n * 10n ** 18n);
    const attackerRevenue = getProtocolFee(40_000n * 10n ** 18n);
    const path = [revenueToken.address, fluxToken.address];
    const staleQuote = (await router.read.getAmountsOut([revenueAmount, path]))[1];

    await approveTreasurySpender(revenueToken.address, buybackExecutor.address, revenueAmount);

    await router.write.swapExactTokensForTokens([
      40_000n * 10n ** 18n,
      0n,
      path,
      attackerClient.account.address,
      await getDeadline(),
    ], { account: attackerClient.account.address });

    await expectRevert(
      revenueDistributor.write.executeBuybackAndDistribute(
        [revenueToken.address, revenueAmount, staleQuote, path, await getDeadline()],
        { account: operatorClient.account.address }
      ),
      "FluxSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT"
    );

    strictEqual(await revenueToken.read.balanceOf([treasury.address]), revenueAmount + attackerRevenue);
    strictEqual(
      await treasury.read.approvedSpendRemaining([revenueToken.address, buybackExecutor.address]),
      revenueAmount
    );
    strictEqual(await fluxToken.read.balanceOf([manager.address]), 0n);

    const freshQuote = (await router.read.getAmountsOut([revenueAmount, path]))[1];
    const buybackProtocolFee = getProtocolFee(revenueAmount);

    await approveTreasurySpender(fluxToken.address, manager.address, freshQuote);
    await revenueDistributor.write.executeBuybackAndDistribute(
      [revenueToken.address, revenueAmount, freshQuote, path, await getDeadline()],
      { account: operatorClient.account.address }
    );

    strictEqual(
      await revenueToken.read.balanceOf([treasury.address]),
      attackerRevenue + buybackProtocolFee
    );
    strictEqual(await fluxToken.read.balanceOf([manager.address]), freshQuote);
    strictEqual(await manager.read.pendingPoolRewards([rewardPool]), freshQuote);
    strictEqual(
      await treasury.read.approvedSpendRemaining([revenueToken.address, buybackExecutor.address]),
      0n
    );
    strictEqual(await treasury.read.approvedSpendRemaining([fluxToken.address, manager.address]), 0n);
  });

  it("should roll back the whole buyback when treasury daily cap is tighter than the approved spend", async function () {
    const revenueAmount = await accrueProtocolRevenue(10_000n * 10n ** 18n);
    const path = [revenueToken.address, fluxToken.address];

    await approveTreasurySpender(revenueToken.address, buybackExecutor.address, revenueAmount);
    await setDailySpendCap(revenueToken.address, revenueAmount - 1n);

    await expectRevert(
      revenueDistributor.write.executeBuybackAndDistribute(
        [revenueToken.address, revenueAmount, 1n, path, await getDeadline()],
        { account: operatorClient.account.address }
      ),
      "FluxSwapTreasury: DAILY_CAP_EXCEEDED"
    );

    strictEqual(await revenueToken.read.balanceOf([treasury.address]), revenueAmount);
    strictEqual(
      await treasury.read.approvedSpendRemaining([revenueToken.address, buybackExecutor.address]),
      revenueAmount
    );
    strictEqual(await fluxToken.read.balanceOf([manager.address]), 0n);

    await setDailySpendCap(revenueToken.address, revenueAmount);
    const freshQuote = (await router.read.getAmountsOut([revenueAmount, path]))[1];
    const buybackProtocolFee = getProtocolFee(revenueAmount);

    await approveTreasurySpender(fluxToken.address, manager.address, freshQuote);
    await revenueDistributor.write.executeBuybackAndDistribute(
      [revenueToken.address, revenueAmount, freshQuote, path, await getDeadline()],
      { account: operatorClient.account.address }
    );

    strictEqual(await revenueToken.read.balanceOf([treasury.address]), buybackProtocolFee);
    strictEqual(await fluxToken.read.balanceOf([manager.address]), freshQuote);
    strictEqual(await manager.read.pendingPoolRewards([rewardPool]), freshQuote);
    strictEqual(
      await treasury.read.approvedSpendRemaining([revenueToken.address, buybackExecutor.address]),
      0n
    );
    strictEqual(await treasury.read.approvedSpendRemaining([fluxToken.address, manager.address]), 0n);
  });

  it("should revert a stale multi-hop buyback quote after consecutive pre-trades across both hops", async function () {
    const revenueWethLiquidity = 100_000n * 10n ** 18n;
    const wethLiquidityPerPair = 1_000n * 10n ** 18n;
    const fluxWethLiquidity = 100_000n * 10n ** 18n;
    const revenueAmount = await accrueProtocolRevenue(50_000n * 10n ** 18n);
    const firstAttackAmount = 40_000n * 10n ** 18n;
    const secondAttackAmount = 300n * 10n ** 18n;
    const path = [revenueToken.address, WETH.address, fluxToken.address];

    await WETH.write.deposit({
      account: lpClient.account.address,
      value: 2_000n * 10n ** 18n,
    });
    await WETH.write.deposit({
      account: attackerClient.account.address,
      value: 500n * 10n ** 18n,
    });
    await WETH.write.approve([router.address, maxUint256], {
      account: lpClient.account.address,
    });
    await WETH.write.approve([router.address, maxUint256], {
      account: attackerClient.account.address,
    });

    await router.write.addLiquidity([
      revenueToken.address,
      WETH.address,
      revenueWethLiquidity,
      wethLiquidityPerPair,
      0n,
      0n,
      lpClient.account.address,
      await getDeadline(),
    ], { account: lpClient.account.address });

    await router.write.addLiquidity([
      WETH.address,
      fluxToken.address,
      wethLiquidityPerPair,
      fluxWethLiquidity,
      0n,
      0n,
      lpClient.account.address,
      await getDeadline(),
    ], { account: lpClient.account.address });

    const staleAmounts = await router.read.getAmountsOut([revenueAmount, path]);
    const staleQuote = staleAmounts[2];
    const attackerRevenueFee = getProtocolFee(firstAttackAmount);
    const attackerWethFee = getProtocolFee(secondAttackAmount);

    await approveTreasurySpender(revenueToken.address, buybackExecutor.address, revenueAmount);

    await router.write.swapExactTokensForTokens([
      firstAttackAmount,
      0n,
      [revenueToken.address, WETH.address],
      attackerClient.account.address,
      await getDeadline(),
    ], { account: attackerClient.account.address });

    await router.write.swapExactTokensForTokens([
      secondAttackAmount,
      0n,
      [WETH.address, fluxToken.address],
      attackerClient.account.address,
      await getDeadline(),
    ], { account: attackerClient.account.address });

    await expectRevert(
      revenueDistributor.write.executeBuybackAndDistribute(
        [revenueToken.address, revenueAmount, staleQuote, path, await getDeadline()],
        { account: operatorClient.account.address }
      ),
      "FluxSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT"
    );

    strictEqual(
      await revenueToken.read.balanceOf([treasury.address]),
      revenueAmount + attackerRevenueFee
    );
    strictEqual(await WETH.read.balanceOf([treasury.address]), attackerWethFee);
    strictEqual(
      await treasury.read.approvedSpendRemaining([revenueToken.address, buybackExecutor.address]),
      revenueAmount
    );
    strictEqual(await fluxToken.read.balanceOf([manager.address]), 0n);

    const freshAmounts = await router.read.getAmountsOut([revenueAmount, path]);
    const freshQuote = freshAmounts[2];
    const buybackRevenueFee = getProtocolFee(revenueAmount);
    const buybackWethFee = getProtocolFee(freshAmounts[1]);

    await approveTreasurySpender(fluxToken.address, manager.address, freshQuote);
    await revenueDistributor.write.executeBuybackAndDistribute(
      [revenueToken.address, revenueAmount, freshQuote, path, await getDeadline()],
      { account: operatorClient.account.address }
    );

    strictEqual(
      await revenueToken.read.balanceOf([treasury.address]),
      attackerRevenueFee + buybackRevenueFee
    );
    strictEqual(await WETH.read.balanceOf([treasury.address]), attackerWethFee + buybackWethFee);
    strictEqual(await fluxToken.read.balanceOf([manager.address]), freshQuote);
    strictEqual(await manager.read.pendingPoolRewards([rewardPool]), freshQuote);
    strictEqual(
      await treasury.read.approvedSpendRemaining([revenueToken.address, buybackExecutor.address]),
      0n
    );
    strictEqual(await treasury.read.approvedSpendRemaining([fluxToken.address, manager.address]), 0n);
  });

  it("should fail direct treasury rewards on treasury pointer drift before consuming any approved funds", async function () {
    const rewardAmount = 500n * 10n ** 18n;
    const alternateTreasury = await viem.deployContract("FluxSwapTreasury", [
      multisigClient.account.address,
      guardianClient.account.address,
      operatorClient.account.address,
      timelockDelay,
    ]);

    await approveTreasurySpender(fluxToken.address, manager.address, rewardAmount);
    const treasuryBalanceBefore = await fluxToken.read.balanceOf([treasury.address]);

    await manager.write.setTreasury([alternateTreasury.address], {
      account: multisigClient.account.address,
    });

    await expectRevert(
      revenueDistributor.write.distributeTreasuryRewards([rewardAmount], {
        account: operatorClient.account.address,
      }),
      "FluxRevenueDistributor: TREASURY_MISMATCH"
    );

    strictEqual(await fluxToken.read.balanceOf([treasury.address]), treasuryBalanceBefore);
    strictEqual(await fluxToken.read.balanceOf([manager.address]), 0n);
    strictEqual(await manager.read.pendingPoolRewards([rewardPool]), 0n);
    strictEqual(await manager.read.undistributedRewards(), 0n);
    strictEqual(await treasury.read.approvedSpendRemaining([fluxToken.address, manager.address]), rewardAmount);

    await manager.write.setTreasury([treasury.address], {
      account: multisigClient.account.address,
    });

    await revenueDistributor.write.distributeTreasuryRewards([rewardAmount], {
      account: operatorClient.account.address,
    });

    strictEqual(await fluxToken.read.balanceOf([manager.address]), rewardAmount);
    strictEqual(await manager.read.pendingPoolRewards([rewardPool]), rewardAmount);
    strictEqual(await treasury.read.approvedSpendRemaining([fluxToken.address, manager.address]), 0n);
  });

  it("should revert microscopic direct rewards that round rewardDelta down to zero without moving funds", async function () {
    const microscopicReward = 1n;

    await manager.write.setPool([0n, 2n * 10n ** 18n, true], {
      account: multisigClient.account.address,
    });
    await approveTreasurySpender(fluxToken.address, manager.address, microscopicReward);

    const treasuryBalanceBefore = await fluxToken.read.balanceOf([treasury.address]);

    await expectRevert(
      revenueDistributor.write.distributeTreasuryRewards([microscopicReward], {
        account: operatorClient.account.address,
      }),
      "FluxMultiPoolManager: REWARD_TOO_SMALL"
    );

    strictEqual(await fluxToken.read.balanceOf([treasury.address]), treasuryBalanceBefore);
    strictEqual(await fluxToken.read.balanceOf([manager.address]), 0n);
    strictEqual(await manager.read.pendingPoolRewards([rewardPool]), 0n);
    strictEqual(await manager.read.undistributedRewards(), 0n);
    strictEqual(
      await treasury.read.approvedSpendRemaining([fluxToken.address, manager.address]),
      microscopicReward
    );
  });
});
