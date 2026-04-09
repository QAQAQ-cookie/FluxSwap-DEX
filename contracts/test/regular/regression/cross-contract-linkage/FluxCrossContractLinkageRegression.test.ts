import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

// 回归目标：
// 1. 锁住 revenueDistributor / buybackExecutor / manager 的 treasury 指针、recipient 约束和回购分发链路保持一致。
// 2. 锁住 treasury pause 与各依赖合约本地 pause 的传播顺序，避免链路半恢复或半失效。
// 3. 锁住 managed pool handoff、owner 迁移、reward configuration 切换时的跨合约状态一致性。
// 4. 锁住 operator 权限只能走 setOperator，避免多合约角色管理被 grantRole 绕过。
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

  async function configureTreasuryFluxRecipient(recipient: `0x${string}`, spendCap: bigint) {
    const allowTokenOp = await treasury.read.hashSetAllowedToken([fluxToken.address, true]);
    await scheduleAndExecute(allowTokenOp, () =>
      treasury.write.executeSetAllowedToken([fluxToken.address, true, allowTokenOp])
    );

    const allowRecipientOp = await treasury.read.hashSetAllowedRecipient([recipient, true]);
    await scheduleAndExecute(allowRecipientOp, () =>
      treasury.write.executeSetAllowedRecipient([recipient, true, allowRecipientOp])
    );

    const capOp = await treasury.read.hashSetDailySpendCap([fluxToken.address, spendCap]);
    await scheduleAndExecute(capOp, () =>
      treasury.write.executeSetDailySpendCap([fluxToken.address, spendCap, capOp])
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

  // 模块一：treasury 指针一致性与 distributor / buyback 主链路
  // 对应 README 已覆盖点：
  // - manager 与 buyback executor 的 treasury 指针一旦分叉，FluxRevenueDistributor 的两个入口都会拒绝执行。
  // - formal buyback 成功链路会把 treasury 内交易手续费正确拆分为“回购后销毁 + manager 奖励分发”。
  // - direct treasury FLUX 发奖也必须经过 manager / pool 同步后真正进入 staker 账户，不能只停留在 pending 状态。
  // - buyback 执行结果不能被重定向到 treasury 之外地址，避免回购资产绕开金库。
  // - treasury 迁移后，buybackExecutor 的 defaultRecipient 也必须同步迁移，不能残留旧 treasury。
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

  it("should route direct treasury rewards all the way through manager sync and staker exit", async function () {
    const userFunding = 1_000n * 10n ** 18n;
    const rewardAmount = 500n * 10n ** 18n;
    const stakeAmount = 100n * 10n ** 18n;

    await configureTreasuryFluxRecipient(stakerClient.account.address, 5_000n * 10n ** 18n);
    await approveTreasurySpender(fluxToken.address, manager.address, rewardAmount);

    await treasury.write.allocate([fluxToken.address, stakerClient.account.address, userFunding], {
      account: operatorClient.account.address,
    });
    await fluxToken.write.approve([managerPool.address, userFunding], {
      account: stakerClient.account.address,
    });
    await managerPool.write.stake([stakeAmount], {
      account: stakerClient.account.address,
    });

    // 这里锁住 direct treasury reward 的成功链路：distributor 发奖后必须经 manager / pool 正确落到最终 staker 账户。
    await revenueDistributor.write.distributeTreasuryRewards([rewardAmount], {
      account: operatorClient.account.address,
    });

    strictEqual(await fluxToken.read.balanceOf([manager.address]), rewardAmount);
    strictEqual(await manager.read.pendingPoolRewards([managerPool.address]), rewardAmount);

    await managerPool.write.syncRewards();

    strictEqual(await manager.read.pendingPoolRewards([managerPool.address]), 0n);
    strictEqual(await fluxToken.read.balanceOf([manager.address]), 0n);
    strictEqual(await managerPool.read.rewardReserve(), rewardAmount);
    strictEqual(await managerPool.read.earned([stakerClient.account.address]), rewardAmount);

    const stakerFluxBeforeExit = await fluxToken.read.balanceOf([stakerClient.account.address]);

    await managerPool.write.exit({
      account: stakerClient.account.address,
    });

    strictEqual(
      (await fluxToken.read.balanceOf([stakerClient.account.address])) - stakerFluxBeforeExit,
      stakeAmount + rewardAmount
    );
    strictEqual(await managerPool.read.totalStaked(), 0n);
    strictEqual(await managerPool.read.rewardReserve(), 0n);
    strictEqual(await fluxToken.read.balanceOf([managerPool.address]), 0n);
  });

  it("should keep buyback output locked to treasury instead of allowing arbitrary recipient overrides", async function () {
    // 这里锁住之前收紧过的收款地址约束：buyback 结果只能回到 treasury，不能被重定向到任意外部地址。
    await expectRevert(
      buybackExecutor.write.executeBuyback(
        [
          revenueToken.address,
          100n * 10n ** 18n,
          0n,
          [revenueToken.address, fluxToken.address],
          stakerClient.account.address,
          await getDeadline(),
        ],
        { account: multisigClient.account.address }
      ),
      "InvalidRecipient"
    );
  });

  it("should keep the buyback default recipient pinned to the active treasury after treasury migration", async function () {
    const alternateTreasury = await viem.deployContract("FluxSwapTreasury", [
      multisigClient.account.address,
      guardianClient.account.address,
      operatorClient.account.address,
      timelockDelay,
    ]);

    await buybackExecutor.write.setTreasury([alternateTreasury.address], {
      account: multisigClient.account.address,
    });

    strictEqual((await buybackExecutor.read.treasury()).toLowerCase(), alternateTreasury.address.toLowerCase());
    strictEqual((await buybackExecutor.read.defaultRecipient()).toLowerCase(), alternateTreasury.address.toLowerCase());

    // 这里锁住 treasury 与 defaultRecipient 的强绑定，避免 treasury 迁移后默认收款地址仍停留在旧金库。
    await expectRevert(
      buybackExecutor.write.setDefaultRecipient([treasury.address], {
        account: multisigClient.account.address,
      }),
      "FluxBuybackExecutor: INVALID_RECIPIENT"
    );
  });

  // 模块二：pause 传播与依赖顺序恢复
  // 对应 README 已覆盖点：
  // - treasury pause 会向上游传播，阻断 manager 发奖、distributor 直发奖励、buyback 回购分发。
  // - distributor、manager、buybackExecutor 任一组件本地暂停时，对应分发链路都必须阻断，并且只有解除暂停后才允许恢复执行。
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

  // 模块三：managed pool handoff、替代池重建与用户资金安全
  // 对应 README 已覆盖点：
  // - managed pool 交接时会同步清理工厂映射与 manager 活跃状态，并允许同资产重建新池。
  // - managed pool 交接不能“转给当前 owner 自己”，避免治理流程出现无效 handoff。
  // - managed pool 交接后，旧池用户仍必须能安全退出领取已归属奖励，替代池也必须继续正常发奖退出。
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

  it("should reject handing a managed pool to its current owner during handoff", async function () {
    await poolFactory.write.createSingleTokenPool([fluxToken.address, 40n, true], {
      account: multisigClient.account.address,
    });

    const poolAddress = await poolFactory.read.singleTokenPools([fluxToken.address]);

    // 锁住 managed pool 交接不能接受“转给当前 owner 自己”的空操作，避免治理流程误以为已完成移交。
    await expectRevert(
      poolFactory.write.transferManagedPoolOwnership([poolAddress, poolFactory.address], {
        account: multisigClient.account.address,
      }),
      "FluxPoolFactory: SAME_OWNER"
    );

    strictEqual(await poolFactory.read.managedPools([poolAddress]), true);
    strictEqual((await manager.read.pools([1n]))[0].toLowerCase(), poolAddress.toLowerCase());
    strictEqual((await manager.read.pools([1n]))[2], true);
  });

  it("should let legacy stakers exit safely after a managed-pool handoff and still pay rewards from the replacement pool", async function () {
    const stakeAmount = 100n * 10n ** 18n;
    const legacyReward = 300n * 10n ** 18n;
    const replacementReward = 600n * 10n ** 18n;

    await manager.write.setPool([0n, 100n, false], {
      account: multisigClient.account.address,
    });

    await poolFactory.write.createSingleTokenPool([stakeToken.address, 100n, true], {
      account: multisigClient.account.address,
    });

    const legacyPoolAddress = await poolFactory.read.singleTokenPools([stakeToken.address]);
    const legacyPool = await viem.getContractAt("FluxSwapStakingRewards", legacyPoolAddress);

    await approveTreasurySpender(fluxToken.address, manager.address, legacyReward + replacementReward);
    await stakeToken.write.approve([legacyPool.address, stakeAmount], {
      account: stakerClient.account.address,
    });
    await legacyPool.write.stake([stakeAmount], {
      account: stakerClient.account.address,
    });

    await manager.write.distributeRewards([legacyReward], {
      account: multisigClient.account.address,
    });
    await legacyPool.write.syncRewards();

    strictEqual(await legacyPool.read.earned([stakerClient.account.address]), legacyReward);

    // 这里锁住 managed pool 交接后的用户资金安全：旧池解绑后，用户仍必须能拿回本金和已归属奖励。
    await poolFactory.write.transferManagedPoolOwnership([legacyPoolAddress, operatorClient.account.address], {
      account: multisigClient.account.address,
    });

    strictEqual(await poolFactory.read.managedPools([legacyPoolAddress]), false);
    strictEqual(await manager.read.totalAllocPoint(), 0n);

    const stakerStakeBeforeLegacyExit = await stakeToken.read.balanceOf([stakerClient.account.address]);
    const stakerFluxBeforeLegacyExit = await fluxToken.read.balanceOf([stakerClient.account.address]);

    await legacyPool.write.exit({
      account: stakerClient.account.address,
    });

    strictEqual((await stakeToken.read.balanceOf([stakerClient.account.address])) - stakerStakeBeforeLegacyExit, stakeAmount);
    strictEqual((await fluxToken.read.balanceOf([stakerClient.account.address])) - stakerFluxBeforeLegacyExit, legacyReward);
    strictEqual(await legacyPool.read.totalStaked(), 0n);
    strictEqual(await fluxToken.read.balanceOf([legacyPool.address]), 0n);

    await poolFactory.write.createSingleTokenPool([stakeToken.address, 100n, true], {
      account: multisigClient.account.address,
    });

    const replacementPoolAddress = await poolFactory.read.singleTokenPools([stakeToken.address]);
    const replacementPool = await viem.getContractAt("FluxSwapStakingRewards", replacementPoolAddress);

    await stakeToken.write.approve([replacementPool.address, stakeAmount], {
      account: stakerClient.account.address,
    });
    await replacementPool.write.stake([stakeAmount], {
      account: stakerClient.account.address,
    });

    await manager.write.distributeRewards([replacementReward], {
      account: multisigClient.account.address,
    });
    await replacementPool.write.syncRewards();

    strictEqual(await replacementPool.read.earned([stakerClient.account.address]), replacementReward);
    strictEqual(await manager.read.totalAllocPoint(), 100n);

    const stakerStakeBeforeReplacementExit = await stakeToken.read.balanceOf([stakerClient.account.address]);
    const stakerFluxBeforeReplacementExit = await fluxToken.read.balanceOf([stakerClient.account.address]);

    // 这里再锁住 replacement pool 不会因为前一次 handoff 留下脏状态，新的奖励链路仍要能完整兑现。
    await replacementPool.write.exit({
      account: stakerClient.account.address,
    });

    strictEqual(
      (await stakeToken.read.balanceOf([stakerClient.account.address])) - stakerStakeBeforeReplacementExit,
      stakeAmount
    );
    strictEqual(
      (await fluxToken.read.balanceOf([stakerClient.account.address])) - stakerFluxBeforeReplacementExit,
      replacementReward
    );
    strictEqual(await replacementPool.read.totalStaked(), 0n);
    strictEqual(await replacementPool.read.rewardReserve(), 0n);
    strictEqual(await fluxToken.read.balanceOf([replacementPool.address]), 0n);
  });

  // 模块四：reward configuration 切换、owner 迁移与 operator 权限边界
  // 对应 README 已覆盖点：
  // - managed pool 仍处于 self-sync 模式时，奖励配置必须原子切换，不能拆成 rewardSource / rewardNotifier 半更新。
  // - poolFactory owner 迁移后，新的 owner 也必须继续能管理已经存在的 managed pool。
  // - distributor、manager、buybackExecutor 的 operator 权限都只能通过 setOperator 变更，不能被 grantRole 直接绕过。
  // - managed pool 奖励配置从 manager -> pool.syncRewards 切换到 treasury -> notifyRewardAmount 后，旧奖励累计与新奖励发放都保持正确。
  it("should require atomic reward-configuration updates while a managed pool is still in self-sync mode", async function () {
    await poolFactory.write.createSingleTokenPool([fluxToken.address, 40n, true], {
      account: multisigClient.account.address,
    });

    const poolAddress = await poolFactory.read.singleTokenPools([fluxToken.address]);

    // 这里锁住 self-sync 模式下的半更新禁令，避免只改 source 或只改 notifier 造成跨合约配置分叉。
    await expectRevert(
      poolFactory.write.setManagedPoolRewardSource([poolAddress, treasury.address], {
        account: multisigClient.account.address,
      }),
      "FluxSwapStakingRewards: USE_REWARD_CONFIGURATION"
    );

    await expectRevert(
      poolFactory.write.setManagedPoolRewardNotifier([poolAddress, operatorClient.account.address], {
        account: multisigClient.account.address,
      }),
      "FluxSwapStakingRewards: USE_REWARD_CONFIGURATION"
    );
  });

  it("should keep governance over existing managed pools after the pool factory owner changes", async function () {
    await poolFactory.write.createSingleTokenPool([fluxToken.address, 40n, true], {
      account: multisigClient.account.address,
    });

    const poolAddress = await poolFactory.read.singleTokenPools([fluxToken.address]);
    const pool = await viem.getContractAt("FluxSwapStakingRewards", poolAddress);

    await poolFactory.write.transferOwnership([operatorClient.account.address], {
      account: multisigClient.account.address,
    });

    // 这里锁住 factory owner 迁移后的治理连续性：旧 owner 必须失权，新 owner 必须还能继续管理既有 managed pool。
    await expectRevert(
      poolFactory.write.setManagedPoolRewardConfiguration([poolAddress, treasury.address, operatorClient.account.address], {
        account: multisigClient.account.address,
      }),
      "OwnableUnauthorizedAccount"
    );

    await poolFactory.write.setManagedPoolRewardConfiguration([poolAddress, treasury.address, operatorClient.account.address], {
      account: operatorClient.account.address,
    });

    strictEqual((await pool.read.rewardSource()).toLowerCase(), treasury.address.toLowerCase());
    strictEqual((await pool.read.rewardNotifier()).toLowerCase(), operatorClient.account.address.toLowerCase());
  });

  it("should keep operator-bearing contracts locked to setOperator instead of direct role grants", async function () {
    const distributorOperatorRole = await revenueDistributor.read.OPERATOR_ROLE();
    const managerOperatorRole = await manager.read.OPERATOR_ROLE();
    const buybackOperatorRole = await buybackExecutor.read.OPERATOR_ROLE();

    // 锁住 distributor / manager / buybackExecutor 的 operator 权限都只能走 setOperator，不能被 grantRole 绕过。
    await expectRevert(
      revenueDistributor.write.grantRole([distributorOperatorRole, traderClient.account.address], {
        account: multisigClient.account.address,
      }),
      "FluxRevenueDistributor: ROLE_MANAGED_BY_SET_OPERATOR"
    );

    await expectRevert(
      manager.write.grantRole([managerOperatorRole, traderClient.account.address], {
        account: multisigClient.account.address,
      }),
      "FluxMultiPoolManager: ROLE_MANAGED_BY_SET_OPERATOR"
    );

    await expectRevert(
      buybackExecutor.write.grantRole([buybackOperatorRole, traderClient.account.address], {
        account: multisigClient.account.address,
      }),
      "FluxBuybackExecutor: ROLE_MANAGED_BY_SET_OPERATOR"
    );

    strictEqual((await revenueDistributor.read.operator()).toLowerCase(), operatorClient.account.address.toLowerCase());
    strictEqual((await manager.read.operator()).toLowerCase(), revenueDistributor.address.toLowerCase());
    strictEqual((await buybackExecutor.read.operator()).toLowerCase(), revenueDistributor.address.toLowerCase());
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

  // 模块五：依赖合约本地 pause 的恢复顺序
  // 对应 README 已覆盖点：
  // - distributor、manager、buybackExecutor 任一组件本地暂停时，对应分发链路都必须阻断，并且只有解除暂停后才允许恢复执行。
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
