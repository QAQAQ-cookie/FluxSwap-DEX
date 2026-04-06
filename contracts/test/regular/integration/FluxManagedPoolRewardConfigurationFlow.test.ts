import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { strictEqual } from "node:assert";

describe("FluxManagedPoolRewardConfigurationFlow", async function () {
  const hardhatNetwork = await network.connect();
  const { viem, networkHelpers } = hardhatNetwork;
  const [multisigClient, guardianClient, operatorClient, stakerClient] = await viem.getWalletClients();

  const timelockDelay = 3600n;
  const initialSupply = 10_000_000n * 10n ** 18n;
  const cap = 100_000_000n * 10n ** 18n;

  let treasury: any;
  let fluxToken: any;
  let manager: any;
  let dexFactory: any;
  let poolFactory: any;
  let stakeToken: any;

  async function scheduleAndExecute(operationId: `0x${string}`, execute: () => Promise<unknown>) {
    await treasury.write.scheduleOperation([operationId, timelockDelay], {
      account: multisigClient.account.address,
    });
    await networkHelpers.time.increase(Number(timelockDelay));
    await execute();
  }

  async function approveTreasurySpender(spender: `0x${string}`, amount: bigint) {
    const approveOp = await treasury.read.hashApproveSpender([fluxToken.address, spender, amount]);
    await scheduleAndExecute(approveOp, () =>
      treasury.write.executeApproveSpender([fluxToken.address, spender, amount, approveOp])
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

    stakeToken = await viem.deployContract("MockERC20", ["Stake Token", "STK", 18]);
    await stakeToken.write.mint([stakerClient.account.address, 1_000n * 10n ** 18n]);
  });

  it("should claim manager-funded rewards through sync, then switch to treasury-configured rewards and pay them out under the new configuration", async function () {
    const stakeAmount = 100n * 10n ** 18n;
    const managerReward = 300n * 10n ** 18n;
    const treasuryReward = 200n * 10n ** 18n;

    await poolFactory.write.createSingleTokenPool([stakeToken.address, 100n, true], {
      account: multisigClient.account.address,
    });

    const poolAddress = await poolFactory.read.singleTokenPools([stakeToken.address]);
    const pool = await viem.getContractAt("FluxSwapStakingRewards", poolAddress);

    strictEqual((await pool.read.rewardSource()).toLowerCase(), manager.address.toLowerCase());
    strictEqual((await pool.read.rewardNotifier()).toLowerCase(), pool.address.toLowerCase());

    await stakeToken.write.approve([pool.address, stakeAmount], {
      account: stakerClient.account.address,
    });
    await pool.write.stake([stakeAmount], {
      account: stakerClient.account.address,
    });

    await approveTreasurySpender(manager.address, managerReward);
    await manager.write.distributeRewards([managerReward], {
      account: operatorClient.account.address,
    });

    strictEqual(await manager.read.pendingPoolRewards([pool.address]), managerReward);

    await pool.write.syncRewards();

    strictEqual(await manager.read.pendingPoolRewards([pool.address]), 0n);
    strictEqual(await fluxToken.read.balanceOf([manager.address]), 0n);
    strictEqual(await fluxToken.read.balanceOf([pool.address]), managerReward);
    strictEqual(await pool.read.rewardReserve(), managerReward);
    strictEqual(await pool.read.earned([stakerClient.account.address]), managerReward);

    await poolFactory.write.setManagedPoolRewardConfiguration([
      poolAddress,
      treasury.address,
      operatorClient.account.address,
    ], {
      account: multisigClient.account.address,
    });

    strictEqual((await pool.read.rewardSource()).toLowerCase(), treasury.address.toLowerCase());
    strictEqual((await pool.read.rewardNotifier()).toLowerCase(), operatorClient.account.address.toLowerCase());

    await approveTreasurySpender(pool.address, treasuryReward);
    await pool.write.notifyRewardAmount([treasuryReward], {
      account: operatorClient.account.address,
    });

    strictEqual(await fluxToken.read.balanceOf([pool.address]), managerReward + treasuryReward);
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
    strictEqual(await pool.read.totalStaked(), 0n);
    strictEqual(await pool.read.rewardReserve(), 0n);
    strictEqual(await fluxToken.read.balanceOf([pool.address]), 0n);
  });
});
