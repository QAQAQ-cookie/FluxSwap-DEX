import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

describe("FluxSwapStakingRewards", async function () {
  const hardhatNetwork = await network.connect();
  const { viem, networkHelpers } = hardhatNetwork;
  const [multisigClient, guardianClient, operatorClient, userAClient, userBClient] = await viem.getWalletClients();

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

    ok(
      errorText.includes(reason),
      `Expected revert reason "${reason}", got: ${errorText}`
    );
  };

  const timelockDelay = 3600n;
  const rewardsDuration = 7n;

  let treasury: any;
  let stakeToken: any;
  let rewardToken: any;
  let stakingRewards: any;

  async function scheduleAndExecute(operationId: `0x${string}`, execute: () => Promise<unknown>) {
    await treasury.write.scheduleOperation([operationId, timelockDelay], { account: multisigClient.account.address });
    await networkHelpers.time.increase(Number(timelockDelay));
    await execute();
  }

  beforeEach(async function () {
    treasury = await viem.deployContract("FluxSwapTreasury", [
      multisigClient.account.address,
      guardianClient.account.address,
      operatorClient.account.address,
      timelockDelay,
    ]);

    stakeToken = await viem.deployContract("MockERC20", ["Stake Token", "STK", 18]);
    rewardToken = await viem.deployContract("MockERC20", ["Reward Token", "RWD", 18]);

    stakingRewards = await viem.deployContract("FluxSwapStakingRewards", [
      multisigClient.account.address,
      stakeToken.address,
      rewardToken.address,
      treasury.address,
      operatorClient.account.address,
      rewardsDuration,
    ]);

    await stakeToken.write.mint([userAClient.account.address, 1_000n * 10n ** 18n]);
    await stakeToken.write.mint([userBClient.account.address, 1_000n * 10n ** 18n]);
    await rewardToken.write.mint([treasury.address, 1_000n * 10n ** 18n]);

    await stakeToken.write.approve([stakingRewards.address, 1_000n * 10n ** 18n], {
      account: userAClient.account.address,
    });
    await stakeToken.write.approve([stakingRewards.address, 1_000n * 10n ** 18n], {
      account: userBClient.account.address,
    });
  });

  async function approveRewardSpender(amount: bigint) {
    const approveOp = await treasury.read.hashApproveSpender([rewardToken.address, stakingRewards.address, amount]);
    await scheduleAndExecute(approveOp, () =>
      treasury.write.executeApproveSpender([rewardToken.address, stakingRewards.address, amount, approveOp])
    );
  }

  it("should distribute treasury-funded rewards to a single staker over time", async function () {
    const rewardAmount = 700n * 10n ** 18n;

    await approveRewardSpender(rewardAmount);
    await stakingRewards.write.stake([100n * 10n ** 18n], { account: userAClient.account.address });
    await stakingRewards.write.notifyRewardAmount([rewardAmount], { account: operatorClient.account.address });

    await networkHelpers.time.increase(3);
    const earnedBeforeClaim = await stakingRewards.read.earned([userAClient.account.address]);

    ok(earnedBeforeClaim > 0n, "reward should accumulate over time");
    ok(earnedBeforeClaim < rewardAmount, "partial period reward should stay below total reward");

    await stakingRewards.write.getReward({ account: userAClient.account.address });
    const claimedReward = await rewardToken.read.balanceOf([userAClient.account.address]);
    const rewardRate = await stakingRewards.read.rewardRate();

    ok(claimedReward >= earnedBeforeClaim, "claimed reward should not be lower than previewed reward");
    ok(claimedReward <= earnedBeforeClaim + rewardRate, "claim should differ by at most one reward interval");
  });

  it("should split rewards by staking share when a second staker joins later", async function () {
    const rewardAmount = 700n * 10n ** 18n;

    await approveRewardSpender(rewardAmount);
    await stakingRewards.write.stake([100n * 10n ** 18n], { account: userAClient.account.address });
    await stakingRewards.write.notifyRewardAmount([rewardAmount], { account: operatorClient.account.address });

    await networkHelpers.time.increase(2);
    await stakingRewards.write.stake([100n * 10n ** 18n], { account: userBClient.account.address });
    const userAEarnedAtJoin = await stakingRewards.read.earned([userAClient.account.address]);

    await networkHelpers.time.increase(5);
    const userAFinalReward = await stakingRewards.read.earned([userAClient.account.address]);
    const userBFinalReward = await stakingRewards.read.earned([userBClient.account.address]);

    strictEqual(userAFinalReward + userBFinalReward, rewardAmount);
    strictEqual(userAFinalReward, userAEarnedAtJoin + userBFinalReward);
  });

  it("should allow users to exit with principal and reward", async function () {
    const rewardAmount = 700n * 10n ** 18n;
    const stakeAmount = 100n * 10n ** 18n;

    await approveRewardSpender(rewardAmount);

    const stakeBalanceBefore = await stakeToken.read.balanceOf([userAClient.account.address]);

    await stakingRewards.write.stake([stakeAmount], { account: userAClient.account.address });
    await stakingRewards.write.notifyRewardAmount([rewardAmount], { account: operatorClient.account.address });

    await networkHelpers.time.increase(7);
    await stakingRewards.write.exit({ account: userAClient.account.address });

    strictEqual(await stakeToken.read.balanceOf([userAClient.account.address]), stakeBalanceBefore);
    strictEqual(await rewardToken.read.balanceOf([userAClient.account.address]), rewardAmount);
    strictEqual(await stakingRewards.read.balanceOf([userAClient.account.address]), 0n);
  });

  it("should restrict reward notification to the configured notifier", async function () {
    await approveRewardSpender(100n * 10n ** 18n);

    await expectRevert(
      stakingRewards.write.notifyRewardAmount([100n * 10n ** 18n], { account: userAClient.account.address }),
      "FluxSwapStakingRewards: FORBIDDEN"
    );
  });

  it("should roll queued dust into the next reward period", async function () {
    await approveRewardSpender(28n);
    await stakingRewards.write.stake([1n], { account: userAClient.account.address });

    await stakingRewards.write.notifyRewardAmount([15n], { account: operatorClient.account.address });
    await networkHelpers.time.increase(Number(rewardsDuration));
    await stakingRewards.write.getReward({ account: userAClient.account.address });

    strictEqual(await rewardToken.read.balanceOf([userAClient.account.address]), 14n);
    strictEqual(await stakingRewards.read.rewardReserve(), 1n);
    strictEqual(await stakingRewards.read.queuedRewards(), 1n);

    await stakingRewards.write.notifyRewardAmount([13n], { account: operatorClient.account.address });
    strictEqual(await stakingRewards.read.rewardRate(), 2n);
    strictEqual(await stakingRewards.read.queuedRewards(), 0n);

    await networkHelpers.time.increase(Number(rewardsDuration));
    await stakingRewards.write.getReward({ account: userAClient.account.address });

    strictEqual(await rewardToken.read.balanceOf([userAClient.account.address]), 28n);
    strictEqual(await stakingRewards.read.rewardReserve(), 0n);
  });

  it("should queue tiny rewards until they are large enough to start a period", async function () {
    await approveRewardSpender(7n);
    await stakingRewards.write.stake([1n], { account: userAClient.account.address });

    await stakingRewards.write.notifyRewardAmount([1n], { account: operatorClient.account.address });

    strictEqual(await stakingRewards.read.rewardRate(), 0n);
    strictEqual(await stakingRewards.read.queuedRewards(), 1n);

    await stakingRewards.write.notifyRewardAmount([6n], { account: operatorClient.account.address });

    strictEqual(await stakingRewards.read.rewardRate(), 1n);
    strictEqual(await stakingRewards.read.queuedRewards(), 0n);

    await networkHelpers.time.increase(Number(rewardsDuration));
    await stakingRewards.write.getReward({ account: userAClient.account.address });

    strictEqual(await rewardToken.read.balanceOf([userAClient.account.address]), 7n);
    strictEqual(await stakingRewards.read.rewardReserve(), 0n);
  });

  it("should block reward notifications when the treasury reward source is paused", async function () {
    await approveRewardSpender(100n * 10n ** 18n);
    await treasury.write.pause({ account: guardianClient.account.address });

    await expectRevert(
      stakingRewards.write.notifyRewardAmount([100n * 10n ** 18n], { account: operatorClient.account.address }),
      "FluxSwapStakingRewards: REWARD_SOURCE_PAUSED"
    );
  });

  it("should recover unallocated rewards when the pool has no stakers", async function () {
    const rewardAmount = 700n * 10n ** 18n;

    await approveRewardSpender(rewardAmount);
    await stakingRewards.write.notifyRewardAmount([rewardAmount], { account: operatorClient.account.address });

    const recipientBalanceBefore = await rewardToken.read.balanceOf([userBClient.account.address]);
    await stakingRewards.write.recoverUnallocatedRewards([userBClient.account.address], {
      account: multisigClient.account.address,
    });

    strictEqual(await rewardToken.read.balanceOf([userBClient.account.address]), recipientBalanceBefore + rewardAmount);
    strictEqual(await stakingRewards.read.rewardReserve(), 0n);
    strictEqual(await stakingRewards.read.queuedRewards(), 0n);
  });

  it("should only recover rewards that are not already owed to users", async function () {
    const rewardAmount = 700n * 10n ** 18n;
    const stakeAmount = 100n * 10n ** 18n;

    await approveRewardSpender(rewardAmount);
    await stakingRewards.write.stake([stakeAmount], { account: userAClient.account.address });
    await stakingRewards.write.notifyRewardAmount([rewardAmount], { account: operatorClient.account.address });

    await networkHelpers.time.increase(3);
    await stakingRewards.write.withdraw([stakeAmount], { account: userAClient.account.address });
    const pendingReward = await stakingRewards.read.pendingUserRewards();

    ok(pendingReward > 0n);
    ok(pendingReward < rewardAmount);

    await stakingRewards.write.recoverUnallocatedRewards([userBClient.account.address], {
      account: multisigClient.account.address,
    });

    strictEqual(await rewardToken.read.balanceOf([userBClient.account.address]), rewardAmount - pendingReward);
    strictEqual(await stakingRewards.read.rewardReserve(), pendingReward);

    await stakingRewards.write.getReward({ account: userAClient.account.address });

    strictEqual(await rewardToken.read.balanceOf([userAClient.account.address]), pendingReward);
    strictEqual(await stakingRewards.read.rewardReserve(), 0n);
    strictEqual(await stakingRewards.read.pendingUserRewards(), 0n);
  });
});
