import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

// 回归目标：
// 1. 锁住同币质押时“本金余额”和“奖励储备”不能串账。
// 2. 锁住 manager -> pool 的 syncRewards 清账链路，避免 pending 奖励残留。
// 3. 锁住 recoverUnallocatedRewards 只能回收未分配奖励，不能回收用户已归属奖励。
// 4. 锁住无质押用户时 queued reward 的回收行为，避免奖励凭空滞留。
describe("FluxRewardsAccountingRegression", async function () {
  const hardhatNetwork = await network.connect();
  const { viem, networkHelpers } = hardhatNetwork;
  const publicClient = await viem.getPublicClient();
  const [multisigClient, guardianClient, operatorClient, userAClient, userBClient] = await viem.getWalletClients();

  const timelockDelay = 3600n;
  const initialSupply = 10_000_000n * 10n ** 18n;
  const cap = 100_000_000n * 10n ** 18n;

  let treasury: any;
  let fluxToken: any;
  let stakeToken: any;
  let manager: any;
  let dexFactory: any;
  let poolFactory: any;

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

  async function scheduleAndExecute(operationId: `0x${string}`, execute: () => Promise<unknown>) {
    await treasury.write.scheduleOperation([operationId, timelockDelay], {
      account: multisigClient.account.address,
    });
    await networkHelpers.time.increase(Number(timelockDelay));
    await execute();
  }

  async function configureTreasuryForFlux(recipients: `0x${string}`[], spendCap: bigint) {
    const allowTokenOp = await treasury.read.hashSetAllowedToken([fluxToken.address, true]);
    await scheduleAndExecute(allowTokenOp, () =>
      treasury.write.executeSetAllowedToken([fluxToken.address, true, allowTokenOp])
    );

    for (const recipient of recipients) {
      const allowRecipientOp = await treasury.read.hashSetAllowedRecipient([recipient, true]);
      await scheduleAndExecute(allowRecipientOp, () =>
        treasury.write.executeSetAllowedRecipient([recipient, true, allowRecipientOp])
      );
    }

    const capOp = await treasury.read.hashSetDailySpendCap([fluxToken.address, spendCap]);
    await scheduleAndExecute(capOp, () =>
      treasury.write.executeSetDailySpendCap([fluxToken.address, spendCap, capOp])
    );
  }

  async function approveTreasurySpender(spender: `0x${string}`, amount: bigint) {
    const approveOp = await treasury.read.hashApproveSpender([fluxToken.address, spender, amount]);
    await scheduleAndExecute(approveOp, () =>
      treasury.write.executeApproveSpender([fluxToken.address, spender, amount, approveOp])
    );
  }

  async function getDeadline() {
    return (await publicClient.getBlock()).timestamp + 3600n;
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

    stakeToken = await viem.deployContract("MockERC20", ["Stake Token", "STK", 18]);
    await stakeToken.write.mint([userAClient.account.address, 1_000n * 10n ** 18n]);
    await stakeToken.write.mint([userBClient.account.address, 1_000n * 10n ** 18n]);

    manager = await viem.deployContract("FluxMultiPoolManager", [
      multisigClient.account.address,
      treasury.address,
      operatorClient.account.address,
      fluxToken.address,
    ]);

    dexFactory = await viem.deployContract("FluxSwapFactory", [multisigClient.account.address]);
    poolFactory = await viem.deployContract("FluxPoolFactory", [
      multisigClient.account.address,
      manager.address,
      dexFactory.address,
      fluxToken.address,
    ]);

    await manager.write.setPoolFactory([poolFactory.address], {
      account: multisigClient.account.address,
    });
  });

  it("should keep same-token staking principal separate from rewardReserve accounting", async function () {
    const userFunding = 1_000n * 10n ** 18n;
    const stakeAmount = 100n * 10n ** 18n;
    const rewardAmount = 700n * 10n ** 18n;

    const stakingRewards = await viem.deployContract("FluxSwapStakingRewards", [
      multisigClient.account.address,
      fluxToken.address,
      fluxToken.address,
      treasury.address,
      operatorClient.account.address,
    ]);

    await configureTreasuryForFlux([userAClient.account.address], 5_000n * 10n ** 18n);
    await approveTreasurySpender(stakingRewards.address, rewardAmount);

    await treasury.write.allocate([fluxToken.address, userAClient.account.address, userFunding], {
      account: operatorClient.account.address,
    });

    await fluxToken.write.approve([stakingRewards.address, userFunding], {
      account: userAClient.account.address,
    });
    await stakingRewards.write.stake([stakeAmount], {
      account: userAClient.account.address,
    });

    const userBalanceBeforeExit = await fluxToken.read.balanceOf([userAClient.account.address]);
    await stakingRewards.write.notifyRewardAmount([rewardAmount], {
      account: operatorClient.account.address,
    });

    // 这里锁住“池子总余额 = 本金 + 奖励，但 rewardReserve 只记奖励部分”。
    strictEqual(await stakingRewards.read.totalStaked(), stakeAmount);
    strictEqual(await stakingRewards.read.rewardReserve(), rewardAmount);
    strictEqual(await fluxToken.read.balanceOf([stakingRewards.address]), stakeAmount + rewardAmount);
    strictEqual(await stakingRewards.read.earned([userAClient.account.address]), rewardAmount);

    await stakingRewards.write.exit({
      account: userAClient.account.address,
    });

    strictEqual(
      (await fluxToken.read.balanceOf([userAClient.account.address])) - userBalanceBeforeExit,
      stakeAmount + rewardAmount
    );
    strictEqual(await stakingRewards.read.totalStaked(), 0n);
    strictEqual(await stakingRewards.read.rewardReserve(), 0n);
    strictEqual(await fluxToken.read.balanceOf([stakingRewards.address]), 0n);
  });

  it("should clear manager pending rewards as soon as syncRewards claims them into the pool reserve", async function () {
    const stakeAmount = 100n * 10n ** 18n;
    const rewardAmount = 300n * 10n ** 18n;

    await poolFactory.write.createSingleTokenPool([stakeToken.address, 100n, true], {
      account: multisigClient.account.address,
    });

    const poolAddress = await poolFactory.read.singleTokenPools([stakeToken.address]);
    const pool = await viem.getContractAt("FluxSwapStakingRewards", poolAddress);

    await stakeToken.write.approve([pool.address, stakeAmount], {
      account: userAClient.account.address,
    });
    await pool.write.stake([stakeAmount], {
      account: userAClient.account.address,
    });

    await approveTreasurySpender(manager.address, rewardAmount);
    await manager.write.distributeRewards([rewardAmount], {
      account: operatorClient.account.address,
    });

    strictEqual(await manager.read.pendingPoolRewards([pool.address]), rewardAmount);
    strictEqual(await fluxToken.read.balanceOf([manager.address]), rewardAmount);

    // 这里锁住 syncRewards 的核心职责：把 manager 待领取奖励变成 pool 的 rewardReserve。
    await pool.write.syncRewards();

    strictEqual(await manager.read.pendingPoolRewards([pool.address]), 0n);
    strictEqual(await fluxToken.read.balanceOf([manager.address]), 0n);
    strictEqual(await fluxToken.read.balanceOf([pool.address]), rewardAmount);
    strictEqual(await pool.read.rewardReserve(), rewardAmount);
    strictEqual(await pool.read.earned([userAClient.account.address]), rewardAmount);
  });

  it("should not recover rewards that have already been accrued to a user", async function () {
    // 这里特意用小整数，避免 18 decimals 下额外混入 1 wei rounding dust。
    const stakeAmount = 3n;
    const rewardAmount = 10n;

    const stakingRewards = await viem.deployContract("FluxSwapStakingRewards", [
      multisigClient.account.address,
      stakeToken.address,
      fluxToken.address,
      treasury.address,
      operatorClient.account.address,
    ]);

    await approveTreasurySpender(stakingRewards.address, rewardAmount);
    await stakeToken.write.approve([stakingRewards.address, stakeAmount], {
      account: userAClient.account.address,
    });
    await stakingRewards.write.stake([stakeAmount], {
      account: userAClient.account.address,
    });

    await stakingRewards.write.notifyRewardAmount([rewardAmount], {
      account: operatorClient.account.address,
    });

    await stakingRewards.write.withdraw([stakeAmount], {
      account: userAClient.account.address,
    });

    const pendingReward = await stakingRewards.read.pendingUserRewards();
    strictEqual(pendingReward, rewardAmount);

    // 这里锁住一个高风险点：用户已归属但尚未领取的奖励不能被 owner 当成“未分配奖励”回收走。
    let error: any;
    try {
      await stakingRewards.write.recoverUnallocatedRewards([userBClient.account.address], {
        account: multisigClient.account.address,
      });
    } catch (e) {
      error = e;
    }

    ok(error, "recoverUnallocatedRewards should revert when rewards are already owed to a user");

    const errorText = [error?.details, error?.shortMessage, error?.message, String(error)]
      .filter((value): value is string => typeof value === "string")
      .join("\n");
    ok(errorText.includes("FluxSwapStakingRewards: NO_UNALLOCATED_REWARDS"));

    strictEqual(await fluxToken.read.balanceOf([userBClient.account.address]), 0n);
    strictEqual(await stakingRewards.read.rewardReserve(), pendingReward);
    strictEqual(await stakingRewards.read.pendingUserRewards(), pendingReward);
  });

  it("should recover fully queued rewards when no staker has ever made them claimable", async function () {
    const rewardAmount = 700n * 10n ** 18n;

    const stakingRewards = await viem.deployContract("FluxSwapStakingRewards", [
      multisigClient.account.address,
      stakeToken.address,
      fluxToken.address,
      treasury.address,
      operatorClient.account.address,
    ]);

    await approveTreasurySpender(stakingRewards.address, rewardAmount);
    await stakingRewards.write.notifyRewardAmount([rewardAmount], {
      account: operatorClient.account.address,
    });

    strictEqual(await stakingRewards.read.rewardReserve(), rewardAmount);
    strictEqual(await stakingRewards.read.queuedRewards(), rewardAmount);
    strictEqual(await stakingRewards.read.pendingUserRewards(), 0n);

    await stakingRewards.write.recoverUnallocatedRewards([userBClient.account.address], {
      account: multisigClient.account.address,
    });

    strictEqual(await fluxToken.read.balanceOf([userBClient.account.address]), rewardAmount);
    strictEqual(await stakingRewards.read.rewardReserve(), 0n);
    strictEqual(await stakingRewards.read.queuedRewards(), 0n);
    strictEqual(await stakingRewards.read.pendingUserRewards(), 0n);
  });

  it("should keep allocPoint splits stable and stop accruing new rewards to a pool after it is deactivated", async function () {
    const firstReward = 1_000n * 10n ** 18n;
    const secondReward = 700n * 10n ** 18n;
    const stakeAmount = 100n * 10n ** 18n;
    const stakeTokenB = await viem.deployContract("MockERC20", ["Stake Token B", "STB", 18]);

    await stakeTokenB.write.mint([userBClient.account.address, 1_000n * 10n ** 18n]);

    await poolFactory.write.createSingleTokenPool([stakeToken.address, 30n, true], {
      account: multisigClient.account.address,
    });
    await poolFactory.write.createSingleTokenPool([stakeTokenB.address, 70n, true], {
      account: multisigClient.account.address,
    });

    const poolAAddress = await poolFactory.read.singleTokenPools([stakeToken.address]);
    const poolBAddress = await poolFactory.read.singleTokenPools([stakeTokenB.address]);
    const poolA = await viem.getContractAt("FluxSwapStakingRewards", poolAAddress);
    const poolB = await viem.getContractAt("FluxSwapStakingRewards", poolBAddress);

    await approveTreasurySpender(manager.address, firstReward + secondReward);

    await stakeToken.write.approve([poolA.address, stakeAmount], {
      account: userAClient.account.address,
    });
    await poolA.write.stake([stakeAmount], {
      account: userAClient.account.address,
    });

    await stakeTokenB.write.approve([poolB.address, stakeAmount], {
      account: userBClient.account.address,
    });
    await poolB.write.stake([stakeAmount], {
      account: userBClient.account.address,
    });

    // 这里锁住 allocPoint 分账：30/70 两个池在第一次发奖时必须稳定按比例分配。
    await manager.write.distributeRewards([firstReward], {
      account: operatorClient.account.address,
    });

    strictEqual(await manager.read.pendingPoolRewards([poolA.address]), 300n * 10n ** 18n);
    strictEqual(await manager.read.pendingPoolRewards([poolB.address]), 700n * 10n ** 18n);

    await poolA.write.syncRewards();
    await poolB.write.syncRewards();

    strictEqual(await poolA.read.earned([userAClient.account.address]), 300n * 10n ** 18n);
    strictEqual(await poolB.read.earned([userBClient.account.address]), 700n * 10n ** 18n);

    // 再锁住停用后的行为：旧池保留已归属奖励，但后续新增奖励不能继续流进去。
    await manager.write.setPool([0n, 30n, false], {
      account: multisigClient.account.address,
    });
    await manager.write.distributeRewards([secondReward], {
      account: operatorClient.account.address,
    });

    strictEqual(await manager.read.pendingPoolRewards([poolA.address]), 0n);
    strictEqual(await manager.read.pendingPoolRewards([poolB.address]), secondReward);

    await poolA.write.syncRewards();
    await poolB.write.syncRewards();

    strictEqual(await poolA.read.earned([userAClient.account.address]), 300n * 10n ** 18n);
    strictEqual(await poolB.read.earned([userBClient.account.address]), 1_400n * 10n ** 18n);
    strictEqual(await manager.read.totalAllocPoint(), 70n);
  });

  it("should keep tiny multi-pool rewards carrying forward until the smaller pool can finally claim them", async function () {
    const tinyReward = 1n;
    const stakeAmount = 1n;
    const stakeTokenB = await viem.deployContract("MockERC20", ["Stake Token B", "STKB", 18]);

    await poolFactory.write.createSingleTokenPool([stakeToken.address, 1n, true], {
      account: multisigClient.account.address,
    });
    await poolFactory.write.createSingleTokenPool([stakeTokenB.address, 2n, true], {
      account: multisigClient.account.address,
    });

    const poolAAddress = await poolFactory.read.singleTokenPools([stakeToken.address]);
    const poolBAddress = await poolFactory.read.singleTokenPools([stakeTokenB.address]);
    const poolA = await viem.getContractAt("FluxSwapStakingRewards", poolAAddress);

    await approveTreasurySpender(manager.address, 3n);
    await stakeToken.write.approve([poolA.address, stakeAmount], {
      account: userAClient.account.address,
    });
    await poolA.write.stake([stakeAmount], {
      account: userAClient.account.address,
    });

    // 这里锁住 manager 的小额 rounding carry-forward：前两次 1 wei 发奖对 1:2 分池仍不足以让小池子领取，第三次才应跨过阈值。
    await manager.write.distributeRewards([tinyReward], {
      account: operatorClient.account.address,
    });
    strictEqual(await manager.read.pendingPoolRewards([poolA.address]), 0n);
    strictEqual(await manager.read.undistributedRewards(), 1n);
    await poolA.write.syncRewards();
    strictEqual(await poolA.read.rewardReserve(), 0n);
    strictEqual(await poolA.read.earned([userAClient.account.address]), 0n);

    await manager.write.distributeRewards([tinyReward], {
      account: operatorClient.account.address,
    });
    strictEqual(await manager.read.pendingPoolRewards([poolA.address]), 0n);
    strictEqual(await manager.read.undistributedRewards(), 1n);
    await poolA.write.syncRewards();
    strictEqual(await poolA.read.rewardReserve(), 0n);

    await manager.write.distributeRewards([tinyReward], {
      account: operatorClient.account.address,
    });
    strictEqual(await manager.read.pendingPoolRewards([poolA.address]), 1n);
    strictEqual(await manager.read.pendingPoolRewards([poolBAddress]), 3n);
    strictEqual(await manager.read.undistributedRewards(), 1n);

    await poolA.write.syncRewards();

    strictEqual(await manager.read.pendingPoolRewards([poolA.address]), 0n);
    strictEqual(await poolA.read.rewardReserve(), 1n);
    strictEqual(await poolA.read.earned([userAClient.account.address]), 1n);
    strictEqual(await fluxToken.read.balanceOf([manager.address]), 2n);
  });

  it("should let the pool factory recover LP reward dust that remains queued after the staker exits", async function () {
    const WETH = await viem.deployContract("MockWETH", []);
    const router = await viem.deployContract("FluxSwapRouter", [dexFactory.address, WETH.address]);
    const tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
    const tokenB = await viem.deployContract("MockERC20", ["Token B", "TKNB", 18]);

    await tokenA.write.mint([userAClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenB.write.mint([userAClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenA.write.approve([router.address, 1_000_000n * 10n ** 18n], {
      account: userAClient.account.address,
    });
    await tokenB.write.approve([router.address, 1_000_000n * 10n ** 18n], {
      account: userAClient.account.address,
    });

    await router.write.addLiquidity(
      [
        tokenA.address,
        tokenB.address,
        10_000n * 10n ** 18n,
        10_000n * 10n ** 18n,
        0n,
        0n,
        userAClient.account.address,
        await getDeadline(),
      ],
      { account: userAClient.account.address }
    );

    const pairAddress = await dexFactory.read.getPair([tokenA.address, tokenB.address]);
    const pair = await viem.getContractAt("FluxSwapPair", pairAddress);
    const lpBalance = await pair.read.balanceOf([userAClient.account.address]);
    const rewardAmount = lpBalance + 1n;

    await poolFactory.write.createLPPool([pair.address, 100n, true], {
      account: multisigClient.account.address,
    });

    const poolAddress = await poolFactory.read.lpTokenPools([pair.address]);
    const pool = await viem.getContractAt("FluxSwapLPStakingPool", poolAddress);

    await approveTreasurySpender(manager.address, rewardAmount);
    await pair.write.approve([pool.address, lpBalance], {
      account: userAClient.account.address,
    });
    await pool.write.stake([lpBalance], {
      account: userAClient.account.address,
    });

    await manager.write.distributeRewards([rewardAmount], {
      account: operatorClient.account.address,
    });
    await pool.write.syncRewards();

    // 这里特意用 “lpBalance + 1” 做奖励，锁住退出后一定会留下 1 wei queued dust 的场景。
    strictEqual(await pool.read.earned([userAClient.account.address]), lpBalance);
    strictEqual(await pool.read.queuedRewards(), 1n);

    const treasuryFluxBeforeRecovery = await fluxToken.read.balanceOf([treasury.address]);
    await pool.write.exit({
      account: userAClient.account.address,
    });

    strictEqual(await fluxToken.read.balanceOf([pool.address]), 1n);
    strictEqual(await pool.read.rewardReserve(), 1n);

    await poolFactory.write.recoverManagedPoolUnallocatedRewards([pool.address, treasury.address], {
      account: multisigClient.account.address,
    });

    strictEqual((await fluxToken.read.balanceOf([treasury.address])) - treasuryFluxBeforeRecovery, 1n);
    strictEqual(await pool.read.queuedRewards(), 0n);
    strictEqual(await pool.read.rewardReserve(), 0n);
    strictEqual(await fluxToken.read.balanceOf([pool.address]), 0n);
  });

  it("should not let managed-pool reward recovery steal rewards that have already accrued to a staker", async function () {
    const stakeAmount = 3n;
    const rewardAmount = 10n;

    await poolFactory.write.createSingleTokenPool([stakeToken.address, 100n, true], {
      account: multisigClient.account.address,
    });

    const poolAddress = await poolFactory.read.singleTokenPools([stakeToken.address]);
    const pool = await viem.getContractAt("FluxSwapStakingRewards", poolAddress);

    await stakeToken.write.approve([pool.address, stakeAmount], {
      account: userAClient.account.address,
    });
    await pool.write.stake([stakeAmount], {
      account: userAClient.account.address,
    });

    await approveTreasurySpender(manager.address, rewardAmount);
    await manager.write.distributeRewards([rewardAmount], {
      account: operatorClient.account.address,
    });
    await pool.write.syncRewards();
    await pool.write.withdraw([stakeAmount], {
      account: userAClient.account.address,
    });

    strictEqual(await pool.read.totalStaked(), 0n);
    strictEqual(await pool.read.pendingUserRewards(), rewardAmount);

    // 锁住 managed pool 场景下的 recover 也不能把已经归属给用户的奖励当作“未分配奖励”回收。
    await expectRevert(
      poolFactory.write.recoverManagedPoolUnallocatedRewards([poolAddress, userBClient.account.address], {
        account: multisigClient.account.address,
      }),
      "FluxSwapStakingRewards: NO_UNALLOCATED_REWARDS"
    );

    strictEqual(await fluxToken.read.balanceOf([userBClient.account.address]), 0n);
    strictEqual(await pool.read.rewardReserve(), rewardAmount);
    strictEqual(await pool.read.pendingUserRewards(), rewardAmount);
  });
});
