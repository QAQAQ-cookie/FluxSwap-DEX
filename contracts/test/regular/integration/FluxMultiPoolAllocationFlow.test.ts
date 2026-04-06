import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { strictEqual } from "node:assert";

describe("FluxMultiPoolAllocationFlow", async function () {
  const hardhatNetwork = await network.connect();
  const { viem, networkHelpers } = hardhatNetwork;
  const [multisigClient, guardianClient, operatorClient, stakerAClient, stakerBClient] =
    await viem.getWalletClients();

  const timelockDelay = 3600n;
  const initialSupply = 10_000_000n * 10n ** 18n;
  const cap = 100_000_000n * 10n ** 18n;

  let treasury: any;
  let fluxToken: any;
  let manager: any;
  let dexFactory: any;
  let poolFactory: any;
  let stakeTokenA: any;
  let stakeTokenB: any;

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

    stakeTokenA = await viem.deployContract("MockERC20", ["Stake Token A", "STA", 18]);
    stakeTokenB = await viem.deployContract("MockERC20", ["Stake Token B", "STB", 18]);

    await stakeTokenA.write.mint([stakerAClient.account.address, 100n * 10n ** 18n]);
    await stakeTokenB.write.mint([stakerBClient.account.address, 100n * 10n ** 18n]);
  });

  it("should split rewards by allocation points and stop distributing to a pool after it is deactivated", async function () {
    const firstReward = 1_000n * 10n ** 18n;
    const secondReward = 700n * 10n ** 18n;
    const stakeAmount = 100n * 10n ** 18n;

    await poolFactory.write.createSingleTokenPool([stakeTokenA.address, 30n, true], {
      account: multisigClient.account.address,
    });
    await poolFactory.write.createSingleTokenPool([stakeTokenB.address, 70n, true], {
      account: multisigClient.account.address,
    });

    const poolAAddress = await poolFactory.read.singleTokenPools([stakeTokenA.address]);
    const poolBAddress = await poolFactory.read.singleTokenPools([stakeTokenB.address]);
    const poolA = await viem.getContractAt("FluxSwapStakingRewards", poolAAddress);
    const poolB = await viem.getContractAt("FluxSwapStakingRewards", poolBAddress);

    await approveTreasurySpender(manager.address, firstReward + secondReward);

    await stakeTokenA.write.approve([poolA.address, stakeAmount], {
      account: stakerAClient.account.address,
    });
    await poolA.write.stake([stakeAmount], {
      account: stakerAClient.account.address,
    });

    await stakeTokenB.write.approve([poolB.address, stakeAmount], {
      account: stakerBClient.account.address,
    });
    await poolB.write.stake([stakeAmount], {
      account: stakerBClient.account.address,
    });

    await manager.write.distributeRewards([firstReward], {
      account: operatorClient.account.address,
    });

    strictEqual(await manager.read.pendingPoolRewards([poolA.address]), 300n * 10n ** 18n);
    strictEqual(await manager.read.pendingPoolRewards([poolB.address]), 700n * 10n ** 18n);

    await poolA.write.syncRewards();
    await poolB.write.syncRewards();

    strictEqual(await poolA.read.earned([stakerAClient.account.address]), 300n * 10n ** 18n);
    strictEqual(await poolB.read.earned([stakerBClient.account.address]), 700n * 10n ** 18n);

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

    strictEqual(await poolA.read.earned([stakerAClient.account.address]), 300n * 10n ** 18n);
    strictEqual(await poolB.read.earned([stakerBClient.account.address]), 1_400n * 10n ** 18n);

    const stakerAFluxBeforeExit = await fluxToken.read.balanceOf([stakerAClient.account.address]);
    const stakerBFluxBeforeExit = await fluxToken.read.balanceOf([stakerBClient.account.address]);

    await poolA.write.exit({
      account: stakerAClient.account.address,
    });
    await poolB.write.exit({
      account: stakerBClient.account.address,
    });

    strictEqual((await fluxToken.read.balanceOf([stakerAClient.account.address])) - stakerAFluxBeforeExit, 300n * 10n ** 18n);
    strictEqual((await fluxToken.read.balanceOf([stakerBClient.account.address])) - stakerBFluxBeforeExit, 1_400n * 10n ** 18n);
    strictEqual(await poolA.read.totalStaked(), 0n);
    strictEqual(await poolB.read.totalStaked(), 0n);
    strictEqual(await manager.read.totalAllocPoint(), 70n);
  });
});
