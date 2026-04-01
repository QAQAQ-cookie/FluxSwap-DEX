import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

describe("Flux Protocol Flow", async function () {
  const hardhatNetwork = await network.connect();
  const { viem, networkHelpers } = hardhatNetwork;
  const [multisigClient, guardianClient, operatorClient, userAClient, userBClient] = await viem.getWalletClients();

  const timelockDelay = 3600n;
  const rewardsDuration = 7n;
  const initialSupply = 10_000_000n * 10n ** 18n;
  const cap = 100_000_000n * 10n ** 18n;

  let treasury: any;
  let fluxToken: any;
  let stakingRewards: any;

  async function scheduleAndExecute(operationId: `0x${string}`, execute: () => Promise<unknown>) {
    await treasury.write.scheduleOperation([operationId, timelockDelay], { account: multisigClient.account.address });
    await networkHelpers.time.increase(Number(timelockDelay));
    await execute();
  }

  async function configureTreasuryForFlux(recipientA: `0x${string}`, recipientB: `0x${string}`, spendingCap: bigint) {
    const allowTokenOp = await treasury.read.hashSetAllowedToken([fluxToken.address, true]);
    await scheduleAndExecute(allowTokenOp, () =>
      treasury.write.executeSetAllowedToken([fluxToken.address, true, allowTokenOp])
    );

    const allowRecipientAOp = await treasury.read.hashSetAllowedRecipient([recipientA, true]);
    await scheduleAndExecute(allowRecipientAOp, () =>
      treasury.write.executeSetAllowedRecipient([recipientA, true, allowRecipientAOp])
    );

    const allowRecipientBOp = await treasury.read.hashSetAllowedRecipient([recipientB, true]);
    await scheduleAndExecute(allowRecipientBOp, () =>
      treasury.write.executeSetAllowedRecipient([recipientB, true, allowRecipientBOp])
    );

    const capOp = await treasury.read.hashSetDailySpendCap([fluxToken.address, spendingCap]);
    await scheduleAndExecute(capOp, () =>
      treasury.write.executeSetDailySpendCap([fluxToken.address, spendingCap, capOp])
    );
  }

  async function approveStakingRewardsSpender(amount: bigint) {
    const approveOp = await treasury.read.hashApproveSpender([fluxToken.address, stakingRewards.address, amount]);
    await scheduleAndExecute(approveOp, () =>
      treasury.write.executeApproveSpender([fluxToken.address, stakingRewards.address, amount, approveOp])
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

    stakingRewards = await viem.deployContract("FluxSwapStakingRewards", [
      multisigClient.account.address,
      fluxToken.address,
      fluxToken.address,
      treasury.address,
      operatorClient.account.address,
      rewardsDuration,
    ]);
  });

  it("should fund same-token staking rewards from treasury without mixing principal and reward reserves", async function () {
    const userFunding = 1_000n * 10n ** 18n;
    const rewardAmount = 700n * 10n ** 18n;
    const stakeAmount = 100n * 10n ** 18n;

    await configureTreasuryForFlux(userAClient.account.address, userBClient.account.address, 5_000n * 10n ** 18n);
    await approveStakingRewardsSpender(rewardAmount);

    await treasury.write.allocate([fluxToken.address, userAClient.account.address, userFunding], {
      account: operatorClient.account.address,
    });

    await fluxToken.write.approve([stakingRewards.address, userFunding], {
      account: userAClient.account.address,
    });
    await stakingRewards.write.stake([stakeAmount], {
      account: userAClient.account.address,
    });

    const treasuryBalanceBefore = await fluxToken.read.balanceOf([treasury.address]);
    await stakingRewards.write.notifyRewardAmount([rewardAmount], {
      account: operatorClient.account.address,
    });

    strictEqual(await stakingRewards.read.rewardReserve(), rewardAmount);
    strictEqual(await fluxToken.read.balanceOf([stakingRewards.address]), stakeAmount + rewardAmount);
    strictEqual(await fluxToken.read.balanceOf([treasury.address]), treasuryBalanceBefore - rewardAmount);
  });

  it("should complete the treasury to flux staking reward flow end to end", async function () {
    const userFunding = 1_000n * 10n ** 18n;
    const rewardAmount = 700n * 10n ** 18n;
    const stakeAmount = 100n * 10n ** 18n;

    await configureTreasuryForFlux(userAClient.account.address, userBClient.account.address, 5_000n * 10n ** 18n);
    await approveStakingRewardsSpender(rewardAmount);

    await treasury.write.allocate([fluxToken.address, userAClient.account.address, userFunding], {
      account: operatorClient.account.address,
    });
    await treasury.write.allocate([fluxToken.address, userBClient.account.address, userFunding], {
      account: operatorClient.account.address,
    });

    await fluxToken.write.approve([stakingRewards.address, userFunding], {
      account: userAClient.account.address,
    });
    await fluxToken.write.approve([stakingRewards.address, userFunding], {
      account: userBClient.account.address,
    });

    const userABalanceBeforeStake = await fluxToken.read.balanceOf([userAClient.account.address]);
    const userBBalanceBeforeStake = await fluxToken.read.balanceOf([userBClient.account.address]);

    await stakingRewards.write.stake([stakeAmount], {
      account: userAClient.account.address,
    });
    await stakingRewards.write.notifyRewardAmount([rewardAmount], {
      account: operatorClient.account.address,
    });

    await networkHelpers.time.increase(2);
    await stakingRewards.write.stake([stakeAmount], {
      account: userBClient.account.address,
    });

    await networkHelpers.time.increase(10);

    await stakingRewards.write.exit({ account: userAClient.account.address });
    await stakingRewards.write.exit({ account: userBClient.account.address });

    const userAFinalBalance = await fluxToken.read.balanceOf([userAClient.account.address]);
    const userBFinalBalance = await fluxToken.read.balanceOf([userBClient.account.address]);
    const userAReward = userAFinalBalance - userABalanceBeforeStake;
    const userBReward = userBFinalBalance - userBBalanceBeforeStake;

    strictEqual(userAReward + userBReward, rewardAmount);
    ok(userAReward > userBReward, "earlier staker should receive more rewards");
    strictEqual(await stakingRewards.read.totalStaked(), 0n);
    strictEqual(await stakingRewards.read.rewardReserve(), 0n);
    strictEqual(await fluxToken.read.balanceOf([stakingRewards.address]), 0n);
  });
});
