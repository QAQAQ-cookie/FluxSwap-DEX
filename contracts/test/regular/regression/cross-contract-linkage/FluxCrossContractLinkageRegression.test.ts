import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

// 回归目标：
// 1. 锁住 revenueDistributor / buybackExecutor / manager 的 treasury 指针必须保持一致。
// 2. 锁住 treasury 暂停后，奖励分发链路和回购链路必须一起被联动阻断。
// 3. 锁住 managed pool 交接时，工厂映射、manager 状态、同资产重建能力必须同步更新。
describe("FluxCrossContractLinkageRegression", async function () {
  const hardhatNetwork = await network.connect();
  const { viem, networkHelpers } = hardhatNetwork;
  const publicClient = await viem.getPublicClient();
  const [multisigClient, guardianClient, operatorClient, lpClient, traderClient, stakerClient] =
    await viem.getWalletClients();

  const timelockDelay = 3600n;
  const initialSupply = 10_000_000n * 10n ** 18n;
  const cap = 100_000_000n * 10n ** 18n;
  const buybackBps = 2500n;
  const burnBps = 2000n;
  const maxUint256 = (1n << 256n) - 1n;
  const zeroAddress = "0x0000000000000000000000000000000000000000";

  let treasury: any;
  let fluxToken: any;
  let revenueToken: any;
  let WETH: any;
  let factory: any;
  let router: any;
  let manager: any;
  let managerPool: any;
  let buybackExecutor: any;
  let revenueDistributor: any;
  let poolFactory: any;
  let stakeToken: any;

  const expectRevert = async (promise: Promise<unknown>, reason: string) => {
    let error: any;
    try {
      await promise;
    } catch (e) {
      error = e;
    }

    ok(error, `Expected revert with reason: ${reason}`);

    const errorText = [error?.details, error?.shortMessage, error?.message, String(error)]
      .filter((value): value is string => typeof value === "string")
      .join("\n");

    ok(errorText.includes(reason), `Expected revert reason "${reason}", got: ${errorText}`);
  };

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

  async function approveTreasurySpender(tokenAddress: `0x${string}`, spender: `0x${string}`, amount: bigint) {
    const approveOp = await treasury.read.hashApproveSpender([tokenAddress, spender, amount]);
    await scheduleAndExecute(approveOp, () =>
      treasury.write.executeApproveSpender([tokenAddress, spender, amount, approveOp])
    );
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

    // 给 manager 挂一个最小可用的活跃池，确保奖励分发路径能走到 treasury pause / linkage 校验。
    managerPool = await viem.deployContract("FluxSwapStakingRewards", [
      multisigClient.account.address,
      fluxToken.address,
      fluxToken.address,
      manager.address,
      manager.address,
    ]);
    await managerPool.write.setRewardConfiguration([manager.address, managerPool.address], {
      account: multisigClient.account.address,
    });
    await manager.write.addPool([managerPool.address, 100n, true], {
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
      buybackBps,
      burnBps,
    ]);

    await buybackExecutor.write.setOperator([revenueDistributor.address], {
      account: multisigClient.account.address,
    });
    await manager.write.setOperator([revenueDistributor.address], {
      account: multisigClient.account.address,
    });

    poolFactory = await viem.deployContract("FluxPoolFactory", [
      multisigClient.account.address,
      manager.address,
      factory.address,
      fluxToken.address,
    ]);
    await manager.write.setPoolFactory([poolFactory.address], {
      account: multisigClient.account.address,
    });

    stakeToken = await viem.deployContract("MockERC20", ["Stake Token", "STK", 18]);
    await stakeToken.write.mint([stakerClient.account.address, 1_000n * 10n ** 18n]);
  });

  it("should reject distributor entrypoints as soon as manager and buyback executor treasury pointers diverge", async function () {
    const alternateTreasury = await viem.deployContract("FluxSwapTreasury", [
      multisigClient.account.address,
      guardianClient.account.address,
      operatorClient.account.address,
      timelockDelay,
    ]);

    // 这里只改 manager 的 treasury，模拟多合约升级/改配置后出现“半同步”状态。
    await manager.write.setTreasury([alternateTreasury.address], {
      account: multisigClient.account.address,
    });

    await expectRevert(
      revenueDistributor.write.distributeTreasuryRewards([1n], {
        account: operatorClient.account.address,
      }),
      "FluxRevenueDistributor: TREASURY_MISMATCH"
    );

    await expectRevert(
      revenueDistributor.write.executeBuybackAndDistribute(
        [revenueToken.address, 100n, 1n, [revenueToken.address, fluxToken.address], await getDeadline()],
        { account: operatorClient.account.address }
      ),
      "FluxRevenueDistributor: TREASURY_MISMATCH"
    );
  });

  it("should keep the successful buyback pipeline burning rewards and feeding the manager end to end", async function () {
    const liquidityAmount = 100_000n * 10n ** 18n;
    const traderFunding = 50_000n * 10n ** 18n;
    const stakerFunding = 1_000n * 10n ** 18n;
    const stakeAmount = 100n * 10n ** 18n;
    const swapAmount = 1_000n * 10n ** 18n;
    const protocolFee = (swapAmount * 5n) / 10000n;
    const buybackAmountIn = (protocolFee * buybackBps) / 10000n;
    const buybackProtocolFee = (buybackAmountIn * 5n) / 10000n;

    await factory.write.setTreasury([treasury.address], {
      account: multisigClient.account.address,
    });

    await fluxToken.write.mint([lpClient.account.address, liquidityAmount * 2n], {
      account: multisigClient.account.address,
    });
    await fluxToken.write.mint([stakerClient.account.address, stakerFunding], {
      account: multisigClient.account.address,
    });
    await revenueToken.write.mint([lpClient.account.address, liquidityAmount * 2n]);
    await revenueToken.write.mint([traderClient.account.address, traderFunding]);

    await fluxToken.write.approve([router.address, maxUint256], {
      account: lpClient.account.address,
    });
    await revenueToken.write.approve([router.address, maxUint256], {
      account: lpClient.account.address,
    });
    await revenueToken.write.approve([router.address, maxUint256], {
      account: traderClient.account.address,
    });
    await fluxToken.write.approve([managerPool.address, stakerFunding], {
      account: stakerClient.account.address,
    });

    await router.write.addLiquidity(
      [
        fluxToken.address,
        revenueToken.address,
        liquidityAmount,
        liquidityAmount,
        0n,
        0n,
        lpClient.account.address,
        await getDeadline(),
      ],
      { account: lpClient.account.address }
    );

    await managerPool.write.stake([stakeAmount], {
      account: stakerClient.account.address,
    });

    await router.write.swapExactTokensForTokens(
      [swapAmount, 0n, [revenueToken.address, fluxToken.address], traderClient.account.address, await getDeadline()],
      { account: traderClient.account.address }
    );

    strictEqual(await revenueToken.read.balanceOf([treasury.address]), protocolFee);

    await approveTreasurySpender(revenueToken.address, buybackExecutor.address, protocolFee);
    await approveTreasurySpender(fluxToken.address, manager.address, 10_000n * 10n ** 18n);
    await approveTreasurySpender(fluxToken.address, revenueDistributor.address, 10_000n * 10n ** 18n);

    const expectedOut = (await router.read.getAmountsOut([buybackAmountIn, [revenueToken.address, fluxToken.address]]))[1];
    const burnedAmount = (expectedOut * burnBps) / 10000n;
    const distributedAmount = expectedOut - burnedAmount;
    const totalSupplyBefore = await fluxToken.read.totalSupply();

    // 这里锁住正式回购链路：treasury 手续费先被回购成 FLUX，再按 burn / distribute 拆分到总供应量与 manager 奖励池。
    await revenueDistributor.write.executeBuybackAndDistribute(
      [revenueToken.address, protocolFee, expectedOut, [revenueToken.address, fluxToken.address], await getDeadline()],
      { account: operatorClient.account.address }
    );

    strictEqual(
      await revenueToken.read.balanceOf([treasury.address]),
      protocolFee - buybackAmountIn + buybackProtocolFee
    );
    strictEqual(await fluxToken.read.totalSupply(), totalSupplyBefore - burnedAmount);
    strictEqual(await manager.read.pendingPoolRewards([managerPool.address]), distributedAmount);
    strictEqual(await fluxToken.read.balanceOf([manager.address]), distributedAmount);

    await managerPool.write.syncRewards();

    strictEqual(await manager.read.pendingPoolRewards([managerPool.address]), 0n);
    strictEqual(await managerPool.read.rewardReserve(), distributedAmount);
    strictEqual(await managerPool.read.earned([stakerClient.account.address]), distributedAmount);
  });

  it("should propagate a treasury pause through manager rewards and distributor buyback flows", async function () {
    const rewardAmount = 100n * 10n ** 18n;
    const revenueAmount = 200n * 10n ** 18n;

    // 这里锁住“底层 treasury 熔断，上层调用必须一起失败”，避免出现只停一层的链路分叉。
    await treasury.write.pause({
      account: guardianClient.account.address,
    });

    await expectRevert(
      manager.write.distributeRewards([rewardAmount], {
        account: multisigClient.account.address,
      }),
      "FluxMultiPoolManager: TREASURY_PAUSED"
    );

    await expectRevert(
      revenueDistributor.write.distributeTreasuryRewards([rewardAmount], {
        account: operatorClient.account.address,
      }),
      "FluxMultiPoolManager: TREASURY_PAUSED"
    );

    await expectRevert(
      revenueDistributor.write.executeBuybackAndDistribute(
        [revenueToken.address, revenueAmount, 1n, [revenueToken.address, fluxToken.address], await getDeadline()],
        { account: operatorClient.account.address }
      ),
      "FluxBuybackExecutor: TREASURY_PAUSED"
    );
  });

  it("should clear legacy managed-pool linkage before allowing the same asset to create a replacement pool", async function () {
    await poolFactory.write.createSingleTokenPool([stakeToken.address, 40n, true], {
      account: multisigClient.account.address,
    });

    const legacyPoolAddress = await poolFactory.read.singleTokenPools([stakeToken.address]);
    const legacyPool = await viem.getContractAt("FluxSwapStakingRewards", legacyPoolAddress);

    strictEqual(await poolFactory.read.managedPools([legacyPoolAddress]), true);
    strictEqual(
      (await poolFactory.read.managedPoolStakingAsset([legacyPoolAddress])).toLowerCase(),
      stakeToken.address.toLowerCase()
    );
    strictEqual(await manager.read.totalAllocPoint(), 140n);

    // 这里锁住“交接旧池”必须把工厂索引和 manager 活跃状态同时清干净，否则同资产会卡死无法重建。
    await poolFactory.write.transferManagedPoolOwnership([legacyPoolAddress, operatorClient.account.address], {
      account: multisigClient.account.address,
    });

    strictEqual(await poolFactory.read.managedPools([legacyPoolAddress]), false);
    strictEqual(await poolFactory.read.singleTokenPools([stakeToken.address]), zeroAddress);
    strictEqual(await poolFactory.read.managedPoolStakingAsset([legacyPoolAddress]), zeroAddress);
    strictEqual(await poolFactory.read.managedPoolIsLP([legacyPoolAddress]), false);
    strictEqual((await legacyPool.read.owner()).toLowerCase(), operatorClient.account.address.toLowerCase());
    strictEqual((await manager.read.pools([1n]))[2], false);
    strictEqual(await manager.read.totalAllocPoint(), 100n);

    await poolFactory.write.createSingleTokenPool([stakeToken.address, 60n, true], {
      account: multisigClient.account.address,
    });

    const replacementPoolAddress = await poolFactory.read.singleTokenPools([stakeToken.address]);

    ok(replacementPoolAddress !== legacyPoolAddress, "replacement pool should be a new contract");
    strictEqual(await poolFactory.read.managedPools([replacementPoolAddress]), true);
    strictEqual(
      (await poolFactory.read.managedPoolStakingAsset([replacementPoolAddress])).toLowerCase(),
      stakeToken.address.toLowerCase()
    );
    strictEqual((await manager.read.pools([2n]))[0].toLowerCase(), replacementPoolAddress.toLowerCase());
    strictEqual((await manager.read.pools([2n]))[2], true);
    strictEqual(await manager.read.totalAllocPoint(), 160n);
  });

  it("should keep reward delivery working after a managed pool switches from manager-sync mode to treasury-notify mode", async function () {
    const stakeAmount = 100n * 10n ** 18n;
    const managerReward = 300n * 10n ** 18n;
    const treasuryReward = 200n * 10n ** 18n;

    // 这里先停掉公共夹具里的演示池，避免它参与 allocPoint 分账，干扰本回归要锁定的单池切换路径。
    await manager.write.setPool([0n, 100n, false], {
      account: multisigClient.account.address,
    });

    await poolFactory.write.createSingleTokenPool([stakeToken.address, 100n, true], {
      account: multisigClient.account.address,
    });

    const poolAddress = await poolFactory.read.singleTokenPools([stakeToken.address]);
    const pool = await viem.getContractAt("FluxSwapStakingRewards", poolAddress);

    await stakeToken.write.approve([pool.address, stakeAmount], {
      account: stakerClient.account.address,
    });
    await pool.write.stake([stakeAmount], {
      account: stakerClient.account.address,
    });

    // 先锁住默认的 manager -> pool.syncRewards 发奖链路，避免后续切配置前已经坏掉却被误判。
    strictEqual((await pool.read.rewardSource()).toLowerCase(), manager.address.toLowerCase());
    strictEqual((await pool.read.rewardNotifier()).toLowerCase(), pool.address.toLowerCase());

    await approveTreasurySpender(fluxToken.address, manager.address, managerReward);
    await manager.write.distributeRewards([managerReward], {
      account: multisigClient.account.address,
    });
    await pool.write.syncRewards();

    strictEqual(await manager.read.pendingPoolRewards([pool.address]), 0n);
    strictEqual(await pool.read.rewardReserve(), managerReward);
    strictEqual(await pool.read.earned([stakerClient.account.address]), managerReward);

    // 再锁住切到 treasury / operator 模式后，旧奖励不丢失、新奖励还能继续累计。
    await poolFactory.write.setManagedPoolRewardConfiguration([
      poolAddress,
      treasury.address,
      operatorClient.account.address,
    ], {
      account: multisigClient.account.address,
    });

    strictEqual((await pool.read.rewardSource()).toLowerCase(), treasury.address.toLowerCase());
    strictEqual((await pool.read.rewardNotifier()).toLowerCase(), operatorClient.account.address.toLowerCase());

    await approveTreasurySpender(fluxToken.address, pool.address, treasuryReward);
    await pool.write.notifyRewardAmount([treasuryReward], {
      account: operatorClient.account.address,
    });

    strictEqual(await pool.read.rewardReserve(), managerReward + treasuryReward);
    strictEqual(await pool.read.earned([stakerClient.account.address]), managerReward + treasuryReward);

    const stakerStakeBeforeExit = await stakeToken.read.balanceOf([stakerClient.account.address]);
    const stakerFluxBeforeExit = await fluxToken.read.balanceOf([stakerClient.account.address]);

    await pool.write.exit({
      account: stakerClient.account.address,
    });

    strictEqual((await stakeToken.read.balanceOf([stakerClient.account.address])) - stakerStakeBeforeExit, stakeAmount);
    strictEqual(
      (await fluxToken.read.balanceOf([stakerClient.account.address])) - stakerFluxBeforeExit,
      managerReward + treasuryReward
    );
    strictEqual(await pool.read.rewardReserve(), 0n);
    strictEqual(await fluxToken.read.balanceOf([pool.address]), 0n);
  });

  it("should resume the distributor flow only after local pause switches are cleared in dependency order", async function () {
    const rewardAmount = 400n * 10n ** 18n;
    const revenueAmount = 800n * 10n ** 18n;

    await approveTreasurySpender(fluxToken.address, manager.address, rewardAmount);
    await approveTreasurySpender(revenueToken.address, buybackExecutor.address, revenueAmount);

    // 这里锁住 distributor 自身暂停时，直发奖励入口必须先被阻断。
    await revenueDistributor.write.pause({
      account: multisigClient.account.address,
    });

    await expectRevert(
      revenueDistributor.write.distributeTreasuryRewards([rewardAmount], {
        account: operatorClient.account.address,
      }),
      "FluxRevenueDistributor: PAUSED"
    );

    await revenueDistributor.write.unpause({
      account: multisigClient.account.address,
    });

    // 这里再锁住依赖方 manager 暂停时，即便 distributor 已恢复，也不能越过下游暂停态继续执行。
    await manager.write.pause({
      account: multisigClient.account.address,
    });

    await expectRevert(
      revenueDistributor.write.distributeTreasuryRewards([rewardAmount], {
        account: operatorClient.account.address,
      }),
      "FluxMultiPoolManager: PAUSED"
    );

    await manager.write.unpause({
      account: multisigClient.account.address,
    });

    // 最后锁住 buybackExecutor 暂停时，回购链路仍然必须被拦住，直到它自己恢复。
    await buybackExecutor.write.pause({
      account: multisigClient.account.address,
    });

    await expectRevert(
      revenueDistributor.write.executeBuybackAndDistribute(
        [revenueToken.address, revenueAmount, 1n, [revenueToken.address, fluxToken.address], await getDeadline()],
        { account: operatorClient.account.address }
      ),
      "FluxBuybackExecutor: PAUSED"
    );

    await buybackExecutor.write.unpause({
      account: multisigClient.account.address,
    });

    await revenueDistributor.write.distributeTreasuryRewards([rewardAmount], {
      account: operatorClient.account.address,
    });

    strictEqual(await manager.read.pendingPoolRewards([managerPool.address]), rewardAmount);
    strictEqual(await revenueDistributor.read.paused(), false);
    strictEqual(await manager.read.paused(), false);
    strictEqual(await buybackExecutor.read.paused(), false);
  });
});
