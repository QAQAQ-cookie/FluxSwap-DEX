import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

describe("FluxManagedPoolLifecycleFlow", async function () {
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

  it("should hand off a managed pool, let users exit the legacy pool, and recreate a replacement pool for the same asset", async function () {
    const stakeAmount = 100n * 10n ** 18n;
    const legacyReward = 300n * 10n ** 18n;
    const replacementReward = 600n * 10n ** 18n;

    await poolFactory.write.createSingleTokenPool([stakeToken.address, 40n, true], {
      account: multisigClient.account.address,
    });

    const legacyPoolAddress = await poolFactory.read.singleTokenPools([stakeToken.address]);
    const legacyPool = await viem.getContractAt("FluxSwapStakingRewards", legacyPoolAddress);

    await approveTreasurySpender(manager.address, legacyReward + replacementReward);

    await stakeToken.write.approve([legacyPool.address, stakeAmount], {
      account: stakerClient.account.address,
    });
    await legacyPool.write.stake([stakeAmount], {
      account: stakerClient.account.address,
    });

    await manager.write.distributeRewards([legacyReward], {
      account: operatorClient.account.address,
    });
    await legacyPool.write.syncRewards();

    strictEqual(await legacyPool.read.earned([stakerClient.account.address]), legacyReward);

    await poolFactory.write.transferManagedPoolOwnership([legacyPoolAddress, operatorClient.account.address], {
      account: multisigClient.account.address,
    });

    strictEqual(await poolFactory.read.managedPools([legacyPoolAddress]), false);
    strictEqual((await legacyPool.read.owner()).toLowerCase(), operatorClient.account.address.toLowerCase());
    strictEqual((await manager.read.pools([0n]))[2], false);
    strictEqual(await manager.read.totalAllocPoint(), 0n);

    const stakerStakeBeforeLegacyExit = await stakeToken.read.balanceOf([stakerClient.account.address]);
    const stakerFluxBeforeLegacyExit = await fluxToken.read.balanceOf([stakerClient.account.address]);

    await legacyPool.write.exit({
      account: stakerClient.account.address,
    });

    strictEqual((await stakeToken.read.balanceOf([stakerClient.account.address])) - stakerStakeBeforeLegacyExit, stakeAmount);
    strictEqual((await fluxToken.read.balanceOf([stakerClient.account.address])) - stakerFluxBeforeLegacyExit, legacyReward);

    await poolFactory.write.createSingleTokenPool([stakeToken.address, 60n, true], {
      account: multisigClient.account.address,
    });

    const replacementPoolAddress = await poolFactory.read.singleTokenPools([stakeToken.address]);
    const replacementPool = await viem.getContractAt("FluxSwapStakingRewards", replacementPoolAddress);

    ok(replacementPoolAddress !== legacyPoolAddress, "replacement pool should be a new contract");
    strictEqual(await poolFactory.read.managedPools([replacementPoolAddress]), true);
    strictEqual((await manager.read.pools([1n]))[2], true);
    strictEqual(await manager.read.totalAllocPoint(), 60n);

    await stakeToken.write.approve([replacementPool.address, stakeAmount], {
      account: stakerClient.account.address,
    });
    await replacementPool.write.stake([stakeAmount], {
      account: stakerClient.account.address,
    });

    await manager.write.distributeRewards([replacementReward], {
      account: operatorClient.account.address,
    });
    await replacementPool.write.syncRewards();

    strictEqual(await replacementPool.read.earned([stakerClient.account.address]), replacementReward);

    const stakerStakeBeforeReplacementExit = await stakeToken.read.balanceOf([stakerClient.account.address]);
    const stakerFluxBeforeReplacementExit = await fluxToken.read.balanceOf([stakerClient.account.address]);

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
    strictEqual(await fluxToken.read.balanceOf([legacyPool.address]), 0n);
    strictEqual(await fluxToken.read.balanceOf([replacementPool.address]), 0n);
  });
});
