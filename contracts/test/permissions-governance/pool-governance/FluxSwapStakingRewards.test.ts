import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

/*
 * 池治理目标：
 * 1. 锁定 FluxSwapStakingRewards 的 owner 是唯一可以调整 rewardSource / rewardNotifier / ownership 的治理入口。
 * 2. 锁定 rewardNotifier 是独立执行角色，owner 本身不能绕过该角色直接发奖。
 * 3. 锁定 self-sync 模式只能通过 setRewardConfiguration 原子进入或退出，避免半更新留下失配状态。
 * 4. 锁定 ownership handoff 后，旧 owner 的 recover / config 权限会被剥离，只保留新 owner 的治理权。
 */
describe("FluxSwapStakingRewards", async function () {
  const hardhatNetwork = await network.connect();
  const { viem } = hardhatNetwork;
  const [
    ownerClient,
    nextOwnerClient,
    rewardSourceClient,
    alternateSourceClient,
    rewardNotifierClient,
    nextNotifierClient,
    stakerClient,
    recipientClient,
    otherClient,
  ] = await viem.getWalletClients();

  let stakeToken: any;
  let rewardToken: any;
  let stakingRewards: any;

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

  // 用最小夹具模拟治理面：rewardSource 提供奖励，rewardNotifier 负责触发记账。
  async function notifyRewards(amount: bigint, notifier = rewardNotifierClient.account.address) {
    await rewardToken.write.mint([rewardSourceClient.account.address, amount]);
    await rewardToken.write.approve([stakingRewards.address, amount], {
      account: rewardSourceClient.account.address,
    });
    await stakingRewards.write.notifyRewardAmount([amount], {
      account: notifier,
    });
  }

  beforeEach(async function () {
    stakeToken = await viem.deployContract("MockERC20", ["Stake Token", "STK", 18]);
    rewardToken = await viem.deployContract("MockERC20", ["Reward Token", "RWD", 18]);

    stakingRewards = await viem.deployContract("FluxSwapStakingRewards", [
      ownerClient.account.address,
      stakeToken.address,
      rewardToken.address,
      rewardSourceClient.account.address,
      rewardNotifierClient.account.address,
    ]);

    await stakeToken.write.mint([stakerClient.account.address, 1_000n * 10n ** 18n]);
    await stakeToken.write.approve([stakingRewards.address, 1_000n * 10n ** 18n], {
      account: stakerClient.account.address,
    });
  });

  it("should keep reward configuration updates owner-only and rotate authority after ownership transfer", async function () {
    await expectRevert(
      stakingRewards.write.setRewardSource([alternateSourceClient.account.address], {
        account: otherClient.account.address,
      }),
      "FluxSwapStakingRewards: FORBIDDEN"
    );

    await expectRevert(
      stakingRewards.write.setRewardNotifier([nextNotifierClient.account.address], {
        account: otherClient.account.address,
      }),
      "FluxSwapStakingRewards: FORBIDDEN"
    );

    await expectRevert(
      stakingRewards.write.setRewardConfiguration([
        alternateSourceClient.account.address,
        nextNotifierClient.account.address,
      ], {
        account: otherClient.account.address,
      }),
      "FluxSwapStakingRewards: FORBIDDEN"
    );

    await expectRevert(
      stakingRewards.write.transferOwnership([nextOwnerClient.account.address], {
        account: otherClient.account.address,
      }),
      "FluxSwapStakingRewards: FORBIDDEN"
    );

    await stakingRewards.write.setRewardSource([alternateSourceClient.account.address], {
      account: ownerClient.account.address,
    });
    await stakingRewards.write.setRewardNotifier([nextNotifierClient.account.address], {
      account: ownerClient.account.address,
    });

    await stakingRewards.write.transferOwnership([nextOwnerClient.account.address], {
      account: ownerClient.account.address,
    });

    await expectRevert(
      stakingRewards.write.setRewardConfiguration([
        rewardSourceClient.account.address,
        rewardNotifierClient.account.address,
      ], {
        account: ownerClient.account.address,
      }),
      "FluxSwapStakingRewards: FORBIDDEN"
    );

    await stakingRewards.write.setRewardConfiguration([
      rewardSourceClient.account.address,
      rewardNotifierClient.account.address,
    ], {
      account: nextOwnerClient.account.address,
    });

    strictEqual((await stakingRewards.read.owner()).toLowerCase(), nextOwnerClient.account.address.toLowerCase());
    strictEqual(
      (await stakingRewards.read.rewardSource()).toLowerCase(),
      rewardSourceClient.account.address.toLowerCase()
    );
    strictEqual(
      (await stakingRewards.read.rewardNotifier()).toLowerCase(),
      rewardNotifierClient.account.address.toLowerCase()
    );
  });

  it("should enforce reward notifier execution as a separately governed role", async function () {
    const firstReward = 25n * 10n ** 18n;
    const secondReward = 40n * 10n ** 18n;

    await rewardToken.write.mint([rewardSourceClient.account.address, firstReward + secondReward]);
    await rewardToken.write.approve([stakingRewards.address, firstReward + secondReward], {
      account: rewardSourceClient.account.address,
    });

    await expectRevert(
      stakingRewards.write.notifyRewardAmount([firstReward], {
        account: ownerClient.account.address,
      }),
      "FluxSwapStakingRewards: FORBIDDEN"
    );

    await expectRevert(
      stakingRewards.write.notifyRewardAmount([firstReward], {
        account: otherClient.account.address,
      }),
      "FluxSwapStakingRewards: FORBIDDEN"
    );

    await stakingRewards.write.notifyRewardAmount([firstReward], {
      account: rewardNotifierClient.account.address,
    });

    await stakingRewards.write.setRewardNotifier([nextNotifierClient.account.address], {
      account: ownerClient.account.address,
    });

    await expectRevert(
      stakingRewards.write.notifyRewardAmount([secondReward], {
        account: rewardNotifierClient.account.address,
      }),
      "FluxSwapStakingRewards: FORBIDDEN"
    );

    await stakingRewards.write.notifyRewardAmount([secondReward], {
      account: nextNotifierClient.account.address,
    });

    strictEqual(await rewardToken.read.balanceOf([stakingRewards.address]), firstReward + secondReward);
    strictEqual(await stakingRewards.read.rewardReserve(), firstReward + secondReward);
    strictEqual(await stakingRewards.read.queuedRewards(), firstReward + secondReward);
  });

  it("should require atomic governance updates when entering and leaving self-sync mode", async function () {
    await expectRevert(
      stakingRewards.write.setRewardNotifier([stakingRewards.address], {
        account: ownerClient.account.address,
      }),
      "FluxSwapStakingRewards: USE_REWARD_CONFIGURATION"
    );

    await stakingRewards.write.setRewardConfiguration([alternateSourceClient.account.address, stakingRewards.address], {
      account: ownerClient.account.address,
    });

    strictEqual(
      (await stakingRewards.read.rewardSource()).toLowerCase(),
      alternateSourceClient.account.address.toLowerCase()
    );
    strictEqual((await stakingRewards.read.rewardNotifier()).toLowerCase(), stakingRewards.address.toLowerCase());

    await expectRevert(
      stakingRewards.write.setRewardSource([rewardSourceClient.account.address], {
        account: ownerClient.account.address,
      }),
      "FluxSwapStakingRewards: USE_REWARD_CONFIGURATION"
    );

    await expectRevert(
      stakingRewards.write.setRewardNotifier([nextNotifierClient.account.address], {
        account: ownerClient.account.address,
      }),
      "FluxSwapStakingRewards: USE_REWARD_CONFIGURATION"
    );

    await stakingRewards.write.transferOwnership([nextOwnerClient.account.address], {
      account: ownerClient.account.address,
    });

    await expectRevert(
      stakingRewards.write.setRewardConfiguration([
        rewardSourceClient.account.address,
        rewardNotifierClient.account.address,
      ], {
        account: ownerClient.account.address,
      }),
      "FluxSwapStakingRewards: FORBIDDEN"
    );

    await stakingRewards.write.setRewardConfiguration([
      rewardSourceClient.account.address,
      rewardNotifierClient.account.address,
    ], {
      account: nextOwnerClient.account.address,
    });

    strictEqual(
      (await stakingRewards.read.rewardSource()).toLowerCase(),
      rewardSourceClient.account.address.toLowerCase()
    );
    strictEqual(
      (await stakingRewards.read.rewardNotifier()).toLowerCase(),
      rewardNotifierClient.account.address.toLowerCase()
    );
  });

  it("should restrict unallocated reward recovery to the current owner after governance handoff", async function () {
    const rewardAmount = 60n * 10n ** 18n;

    await notifyRewards(rewardAmount);

    await expectRevert(
      stakingRewards.write.recoverUnallocatedRewards([recipientClient.account.address], {
        account: otherClient.account.address,
      }),
      "FluxSwapStakingRewards: FORBIDDEN"
    );

    await stakingRewards.write.transferOwnership([nextOwnerClient.account.address], {
      account: ownerClient.account.address,
    });

    await expectRevert(
      stakingRewards.write.recoverUnallocatedRewards([recipientClient.account.address], {
        account: ownerClient.account.address,
      }),
      "FluxSwapStakingRewards: FORBIDDEN"
    );

    await stakingRewards.write.recoverUnallocatedRewards([recipientClient.account.address], {
      account: nextOwnerClient.account.address,
    });

    strictEqual(await rewardToken.read.balanceOf([recipientClient.account.address]), rewardAmount);
    strictEqual(await stakingRewards.read.rewardReserve(), 0n);
    strictEqual(await stakingRewards.read.queuedRewards(), 0n);
  });
});
