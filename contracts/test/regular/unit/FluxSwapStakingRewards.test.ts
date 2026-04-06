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
  let treasury: any;
  let stakeToken: any;
  let rewardToken: any;
  let stakingRewards: any;

  async function scheduleAndExecute(operationId: `0x${string}`, execute: () => Promise<unknown>) {
    await treasury.write.scheduleOperation([operationId, timelockDelay], { account: multisigClient.account.address });
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

    stakeToken = await viem.deployContract("MockERC20", ["Stake Token", "STK", 18]);
    rewardToken = await viem.deployContract("MockERC20", ["Reward Token", "RWD", 18]);

    stakingRewards = await viem.deployContract("FluxSwapStakingRewards", [
      multisigClient.account.address,
      stakeToken.address,
      rewardToken.address,
      treasury.address,
      operatorClient.account.address,
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
    await approveTreasurySpender(rewardToken.address, stakingRewards.address, amount);
  }

  it("should validate constructor inputs", async function () {
    await expectRevert(
      viem.deployContract("FluxSwapStakingRewards", [
        "0x0000000000000000000000000000000000000000",
        stakeToken.address,
        rewardToken.address,
        treasury.address,
        operatorClient.account.address,
      ]),
      "FluxSwapStakingRewards: ZERO_ADDRESS"
    );

    await expectRevert(
      viem.deployContract("FluxSwapStakingRewards", [
        multisigClient.account.address,
        "0x0000000000000000000000000000000000000000",
        rewardToken.address,
        treasury.address,
        operatorClient.account.address,
      ]),
      "FluxSwapStakingRewards: ZERO_ADDRESS"
    );

    await expectRevert(
      viem.deployContract("FluxSwapStakingRewards", [
        multisigClient.account.address,
        stakeToken.address,
        "0x0000000000000000000000000000000000000000",
        treasury.address,
        operatorClient.account.address,
      ]),
      "FluxSwapStakingRewards: ZERO_ADDRESS"
    );

    await expectRevert(
      viem.deployContract("FluxSwapStakingRewards", [
        multisigClient.account.address,
        stakeToken.address,
        rewardToken.address,
        "0x0000000000000000000000000000000000000000",
        operatorClient.account.address,
      ]),
      "FluxSwapStakingRewards: ZERO_ADDRESS"
    );

    await expectRevert(
      viem.deployContract("FluxSwapStakingRewards", [
        multisigClient.account.address,
        stakeToken.address,
        rewardToken.address,
        treasury.address,
        "0x0000000000000000000000000000000000000000",
      ]),
      "FluxSwapStakingRewards: ZERO_ADDRESS"
    );
  });

  it("should allow the owner to update reward source and notifier individually when not in self-sync mode", async function () {
    await stakingRewards.write.setRewardSource([userAClient.account.address], {
      account: multisigClient.account.address,
    });
    await stakingRewards.write.setRewardNotifier([userBClient.account.address], {
      account: multisigClient.account.address,
    });

    strictEqual((await stakingRewards.read.rewardSource()).toLowerCase(), userAClient.account.address.toLowerCase());
    strictEqual((await stakingRewards.read.rewardNotifier()).toLowerCase(), userBClient.account.address.toLowerCase());

    await expectRevert(
      stakingRewards.write.setRewardSource(["0x0000000000000000000000000000000000000000"], {
        account: multisigClient.account.address,
      }),
      "FluxSwapStakingRewards: ZERO_ADDRESS"
    );

    await expectRevert(
      stakingRewards.write.setRewardNotifier(["0x0000000000000000000000000000000000000000"], {
        account: multisigClient.account.address,
      }),
      "FluxSwapStakingRewards: ZERO_ADDRESS"
    );
  });

  it("should validate stake and withdraw amounts", async function () {
    await expectRevert(
      stakingRewards.write.stake([0n], { account: userAClient.account.address }),
      "FluxSwapStakingRewards: ZERO_AMOUNT"
    );

    await stakingRewards.write.stake([10n * 10n ** 18n], {
      account: userAClient.account.address,
    });

    await expectRevert(
      stakingRewards.write.withdraw([0n], { account: userAClient.account.address }),
      "FluxSwapStakingRewards: ZERO_AMOUNT"
    );

    await expectRevert(
      stakingRewards.write.withdraw([11n * 10n ** 18n], { account: userAClient.account.address }),
      "FluxSwapStakingRewards: INSUFFICIENT_BALANCE"
    );
  });

  it("should distribute treasury-funded rewards to a single staker immediately in the accounting", async function () {
    const rewardAmount = 700n * 10n ** 18n;

    await approveRewardSpender(rewardAmount);
    await stakingRewards.write.stake([100n * 10n ** 18n], { account: userAClient.account.address });
    await stakingRewards.write.notifyRewardAmount([rewardAmount], { account: operatorClient.account.address });

    strictEqual(await stakingRewards.read.earned([userAClient.account.address]), rewardAmount);

    await stakingRewards.write.getReward({ account: userAClient.account.address });
    strictEqual(await rewardToken.read.balanceOf([userAClient.account.address]), rewardAmount);
    strictEqual(await stakingRewards.read.rewardReserve(), 0n);
  });

  it("should split rewards by staking share across multiple reward batches", async function () {
    await approveRewardSpender(400n * 10n ** 18n);
    await stakingRewards.write.stake([100n * 10n ** 18n], { account: userAClient.account.address });
    await stakingRewards.write.notifyRewardAmount([200n * 10n ** 18n], { account: operatorClient.account.address });

    await stakingRewards.write.stake([100n * 10n ** 18n], { account: userBClient.account.address });
    await stakingRewards.write.notifyRewardAmount([200n * 10n ** 18n], { account: operatorClient.account.address });

    strictEqual(await stakingRewards.read.earned([userAClient.account.address]), 300n * 10n ** 18n);
    strictEqual(await stakingRewards.read.earned([userBClient.account.address]), 100n * 10n ** 18n);
  });

  it("should allow users to exit with principal and reward", async function () {
    const rewardAmount = 700n * 10n ** 18n;
    const stakeAmount = 100n * 10n ** 18n;

    await approveRewardSpender(rewardAmount);

    const stakeBalanceBefore = await stakeToken.read.balanceOf([userAClient.account.address]);

    await stakingRewards.write.stake([stakeAmount], { account: userAClient.account.address });
    await stakingRewards.write.notifyRewardAmount([rewardAmount], { account: operatorClient.account.address });
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

  it("should allow the owner to update reward configuration atomically", async function () {
    await stakingRewards.write.setRewardConfiguration([userAClient.account.address, userBClient.account.address], {
      account: multisigClient.account.address,
    });

    strictEqual((await stakingRewards.read.rewardSource()).toLowerCase(), userAClient.account.address.toLowerCase());
    strictEqual((await stakingRewards.read.rewardNotifier()).toLowerCase(), userBClient.account.address.toLowerCase());
  });

  it("should reject partial reward configuration changes while using self-sync mode", async function () {
    await stakingRewards.write.setRewardConfiguration([treasury.address, stakingRewards.address], {
      account: multisigClient.account.address,
    });

    await expectRevert(
      stakingRewards.write.setRewardSource([userAClient.account.address], {
        account: multisigClient.account.address,
      }),
      "FluxSwapStakingRewards: USE_REWARD_CONFIGURATION"
    );

    await expectRevert(
      stakingRewards.write.setRewardNotifier([userBClient.account.address], {
        account: multisigClient.account.address,
      }),
      "FluxSwapStakingRewards: USE_REWARD_CONFIGURATION"
    );
  });

  it("should transfer ownership and restrict config updates to the new owner", async function () {
    await stakingRewards.write.transferOwnership([userAClient.account.address], {
      account: multisigClient.account.address,
    });

    await expectRevert(
      stakingRewards.write.setRewardConfiguration([userAClient.account.address, userBClient.account.address], {
        account: multisigClient.account.address,
      }),
      "FluxSwapStakingRewards: FORBIDDEN"
    );

    await stakingRewards.write.setRewardConfiguration([userBClient.account.address, userAClient.account.address], {
      account: userAClient.account.address,
    });

    strictEqual((await stakingRewards.read.owner()).toLowerCase(), userAClient.account.address.toLowerCase());
    strictEqual((await stakingRewards.read.rewardSource()).toLowerCase(), userBClient.account.address.toLowerCase());
    strictEqual((await stakingRewards.read.rewardNotifier()).toLowerCase(), userAClient.account.address.toLowerCase());
  });

  it("should roll queued dust into the next reward distribution", async function () {
    await approveRewardSpender(28n);
    await stakingRewards.write.stake([7n], { account: userAClient.account.address });

    await stakingRewards.write.notifyRewardAmount([15n], { account: operatorClient.account.address });
    await stakingRewards.write.getReward({ account: userAClient.account.address });

    strictEqual(await rewardToken.read.balanceOf([userAClient.account.address]), 14n);
    strictEqual(await stakingRewards.read.rewardReserve(), 1n);
    strictEqual(await stakingRewards.read.queuedRewards(), 1n);

    await stakingRewards.write.notifyRewardAmount([13n], { account: operatorClient.account.address });
    strictEqual(await stakingRewards.read.queuedRewards(), 0n);

    await stakingRewards.write.getReward({ account: userAClient.account.address });

    strictEqual(await rewardToken.read.balanceOf([userAClient.account.address]), 28n);
    strictEqual(await stakingRewards.read.rewardReserve(), 0n);
  });

  it("should queue tiny rewards until they are large enough to distribute", async function () {
    await approveRewardSpender(7n);
    await stakingRewards.write.stake([7n], { account: userAClient.account.address });

    await stakingRewards.write.notifyRewardAmount([1n], { account: operatorClient.account.address });

    strictEqual(await stakingRewards.read.queuedRewards(), 1n);
    strictEqual(await stakingRewards.read.earned([userAClient.account.address]), 0n);

    await stakingRewards.write.notifyRewardAmount([6n], { account: operatorClient.account.address });

    strictEqual(await stakingRewards.read.queuedRewards(), 0n);
    strictEqual(await stakingRewards.read.earned([userAClient.account.address]), 7n);

    await stakingRewards.write.getReward({ account: userAClient.account.address });

    strictEqual(await rewardToken.read.balanceOf([userAClient.account.address]), 7n);
    strictEqual(await stakingRewards.read.rewardReserve(), 0n);
  });

  it("should keep previously queued rounding dust with existing stakers when a new staker joins", async function () {
    await approveRewardSpender(10n);

    await stakingRewards.write.stake([3n], { account: userAClient.account.address });
    await stakingRewards.write.notifyRewardAmount([10n], { account: operatorClient.account.address });

    strictEqual(await stakingRewards.read.earned([userAClient.account.address]), 9n);
    strictEqual(await stakingRewards.read.queuedRewards(), 1n);

    await stakingRewards.write.stake([1n], { account: userBClient.account.address });

    strictEqual(await stakingRewards.read.earned([userAClient.account.address]), 10n);
    strictEqual(await stakingRewards.read.earned([userBClient.account.address]), 0n);
    strictEqual(await stakingRewards.read.queuedRewards(), 0n);
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

  it("should sync rewards from a self-updating manager source", async function () {
    const manager = await viem.deployContract("FluxMultiPoolManager", [
      multisigClient.account.address,
      treasury.address,
      operatorClient.account.address,
      rewardToken.address,
    ]);

    const selfSyncPool = await viem.deployContract("FluxSwapStakingRewards", [
      multisigClient.account.address,
      stakeToken.address,
      rewardToken.address,
      manager.address,
      manager.address,
    ]);

    await selfSyncPool.write.setRewardConfiguration([manager.address, selfSyncPool.address], {
      account: multisigClient.account.address,
    });
    await manager.write.addPool([selfSyncPool.address, 100n, true], {
      account: multisigClient.account.address,
    });

    await stakeToken.write.approve([selfSyncPool.address, 1_000n * 10n ** 18n], {
      account: userAClient.account.address,
    });
    await selfSyncPool.write.stake([100n * 10n ** 18n], {
      account: userAClient.account.address,
    });

    await approveTreasurySpender(rewardToken.address, manager.address, 200n * 10n ** 18n);
    await manager.write.distributeRewards([200n * 10n ** 18n], {
      account: operatorClient.account.address,
    });

    await selfSyncPool.write.syncRewards();

    strictEqual(await rewardToken.read.balanceOf([selfSyncPool.address]), 200n * 10n ** 18n);
    strictEqual(await selfSyncPool.read.rewardReserve(), 200n * 10n ** 18n);
    strictEqual(await selfSyncPool.read.earned([userAClient.account.address]), 200n * 10n ** 18n);
  });

  it("should release queued rewards when the first staker enters after rewards arrived", async function () {
    await approveRewardSpender(10n);
    await stakingRewards.write.notifyRewardAmount([10n], { account: operatorClient.account.address });

    strictEqual(await stakingRewards.read.queuedRewards(), 10n);
    strictEqual(await stakingRewards.read.earned([userAClient.account.address]), 0n);

    await stakingRewards.write.stake([5n], { account: userAClient.account.address });

    strictEqual(await stakingRewards.read.queuedRewards(), 0n);
    strictEqual(await stakingRewards.read.earned([userAClient.account.address]), 10n);
  });

  it("should only recover rewards that are not already owed to users", async function () {
    await approveRewardSpender(10n);
    await stakingRewards.write.stake([3n], { account: userAClient.account.address });
    await stakingRewards.write.notifyRewardAmount([10n], { account: operatorClient.account.address });

    await stakingRewards.write.withdraw([3n], { account: userAClient.account.address });
    const pendingReward = await stakingRewards.read.pendingUserRewards();

    strictEqual(pendingReward, 10n);

    await expectRevert(
      stakingRewards.write.recoverUnallocatedRewards([userBClient.account.address], {
        account: multisigClient.account.address,
      }),
      "FluxSwapStakingRewards: NO_UNALLOCATED_REWARDS"
    );

    strictEqual(await rewardToken.read.balanceOf([userBClient.account.address]), 0n);
    strictEqual(await stakingRewards.read.rewardReserve(), pendingReward);

    await stakingRewards.write.getReward({ account: userAClient.account.address });

    strictEqual(await rewardToken.read.balanceOf([userAClient.account.address]), pendingReward);
    strictEqual(await stakingRewards.read.rewardReserve(), 0n);
    strictEqual(await stakingRewards.read.pendingUserRewards(), 0n);
  });
});
