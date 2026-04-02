import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

describe("FluxMultiPoolManager", async function () {
  const hardhatNetwork = await network.connect();
  const { viem, networkHelpers } = hardhatNetwork;
  const publicClient = await viem.getPublicClient();
  const [multisigClient, guardianClient, operatorClient, lpClient, stakerAClient, stakerBClient] =
    await viem.getWalletClients();

  const timelockDelay = 3600n;
  const initialSupply = 10_000_000n * 10n ** 18n;
  const cap = 100_000_000n * 10n ** 18n;
  const maxUint256 = (1n << 256n) - 1n;

  let treasury: any;
  let fluxToken: any;
  let tokenA: any;
  let tokenB: any;
  let extraToken: any;
  let WETH: any;
  let factory: any;
  let router: any;
  let pair: any;
  let singleTokenPool: any;
  let lpPool: any;
  let manager: any;

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

  async function scheduleAndExecute(operationId: `0x${string}`, execute: () => Promise<unknown>) {
    await treasury.write.scheduleOperation([operationId, timelockDelay], { account: multisigClient.account.address });
    await networkHelpers.time.increase(Number(timelockDelay));
    await execute();
  }

  async function configureTreasuryRecipientsAndCaps() {
    const allowFluxOp = await treasury.read.hashSetAllowedToken([fluxToken.address, true]);
    await scheduleAndExecute(allowFluxOp, () =>
      treasury.write.executeSetAllowedToken([fluxToken.address, true, allowFluxOp])
    );

    const allowRecipientAOp = await treasury.read.hashSetAllowedRecipient([stakerAClient.account.address, true]);
    await scheduleAndExecute(allowRecipientAOp, () =>
      treasury.write.executeSetAllowedRecipient([stakerAClient.account.address, true, allowRecipientAOp])
    );

    const capOp = await treasury.read.hashSetDailySpendCap([fluxToken.address, 10_000n * 10n ** 18n]);
    await scheduleAndExecute(capOp, () =>
      treasury.write.executeSetDailySpendCap([fluxToken.address, 10_000n * 10n ** 18n, capOp])
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

    manager = await viem.deployContract("FluxMultiPoolManager", [
      multisigClient.account.address,
      treasury.address,
      operatorClient.account.address,
      fluxToken.address,
    ]);

    singleTokenPool = await viem.deployContract("FluxSwapStakingRewards", [
      multisigClient.account.address,
      fluxToken.address,
      fluxToken.address,
      manager.address,
      manager.address,
    ]);
    await singleTokenPool.write.setRewardConfiguration([manager.address, singleTokenPool.address], {
      account: multisigClient.account.address,
    });

    tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
    tokenB = await viem.deployContract("MockERC20", ["Token B", "TKNB", 18]);
    extraToken = await viem.deployContract("MockERC20", ["Extra Token", "EXT", 18]);
    WETH = await viem.deployContract("MockWETH", []);
    factory = await viem.deployContract("FluxSwapFactory", [multisigClient.account.address]);
    router = await viem.deployContract("FluxSwapRouter", [factory.address, WETH.address]);

    await tokenA.write.mint([lpClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenB.write.mint([lpClient.account.address, 1_000_000n * 10n ** 18n]);

    await tokenA.write.approve([router.address, maxUint256], { account: lpClient.account.address });
    await tokenB.write.approve([router.address, maxUint256], { account: lpClient.account.address });

    await router.write.addLiquidity([
      tokenA.address,
      tokenB.address,
      10_000n * 10n ** 18n,
      10_000n * 10n ** 18n,
      0n,
      0n,
      lpClient.account.address,
      await getDeadline(),
    ], { account: lpClient.account.address });

    const pairAddress = await factory.read.getPair([tokenA.address, tokenB.address]);
    pair = await viem.getContractAt("FluxSwapPair", pairAddress);

    lpPool = await viem.deployContract("FluxSwapLPStakingPool", [
      multisigClient.account.address,
      factory.address,
      pair.address,
      fluxToken.address,
      manager.address,
      manager.address,
    ]);
    await lpPool.write.setRewardConfiguration([manager.address, lpPool.address], {
      account: multisigClient.account.address,
    });

    await manager.write.addPool([singleTokenPool.address, 40n, true], {
      account: multisigClient.account.address,
    });
    await manager.write.addPool([lpPool.address, 60n, true], {
      account: multisigClient.account.address,
    });
  });

  it("should distribute FLUX rewards across multiple pools by alloc point", async function () {
    const totalReward = 1_000n * 10n ** 18n;
    const singleStakeAmount = 100n * 10n ** 18n;
    const lpStakeAmount = 100n * 10n ** 18n;

    await configureTreasuryRecipientsAndCaps();
    await approveTreasurySpender(manager.address, totalReward);

    await treasury.write.allocate([fluxToken.address, stakerAClient.account.address, 1_000n * 10n ** 18n], {
      account: operatorClient.account.address,
    });

    await fluxToken.write.approve([singleTokenPool.address, 1_000n * 10n ** 18n], {
      account: stakerAClient.account.address,
    });
    await singleTokenPool.write.stake([singleStakeAmount], {
      account: stakerAClient.account.address,
    });

    await pair.write.transfer([stakerBClient.account.address, lpStakeAmount], {
      account: lpClient.account.address,
    });
    await pair.write.approve([lpPool.address, lpStakeAmount], {
      account: stakerBClient.account.address,
    });
    await lpPool.write.stake([lpStakeAmount], {
      account: stakerBClient.account.address,
    });

    await manager.write.distributeRewards([totalReward], {
      account: operatorClient.account.address,
    });
    await singleTokenPool.write.syncRewards();
    await lpPool.write.syncRewards();

    await singleTokenPool.write.exit({ account: stakerAClient.account.address });
    await lpPool.write.exit({ account: stakerBClient.account.address });

    strictEqual(await fluxToken.read.balanceOf([stakerAClient.account.address]), 1_400n * 10n ** 18n);
    strictEqual(await fluxToken.read.balanceOf([stakerBClient.account.address]), 600n * 10n ** 18n);
    strictEqual(await pair.read.balanceOf([stakerBClient.account.address]), lpStakeAmount);
    strictEqual(await manager.read.totalAllocPoint(), 100n);
    strictEqual(await fluxToken.read.balanceOf([manager.address]), 0n);
  });

  it("should support pausing and pool updates", async function () {
    await manager.write.setPool([1n, 80n, false], {
      account: multisigClient.account.address,
    });
    strictEqual(await manager.read.totalAllocPoint(), 40n);

    await manager.write.pause({ account: multisigClient.account.address });

    await expectRevert(
      manager.write.distributeRewards([100n * 10n ** 18n], {
        account: operatorClient.account.address,
      }),
      "FluxMultiPoolManager: PAUSED"
    );
  });

  it("should let each pool pull its own pending rewards without manager-side iteration", async function () {
    const totalReward = 100n * 10n ** 18n;

    await approveTreasurySpender(manager.address, totalReward);
    await manager.write.distributeRewards([totalReward], {
      account: operatorClient.account.address,
    });

    strictEqual(await manager.read.pendingPoolRewards([singleTokenPool.address]), 40n * 10n ** 18n);
    strictEqual(await manager.read.pendingPoolRewards([lpPool.address]), 60n * 10n ** 18n);
    strictEqual(await fluxToken.read.balanceOf([manager.address]), totalReward);

    await singleTokenPool.write.syncRewards();
    strictEqual(await manager.read.pendingPoolRewards([singleTokenPool.address]), 0n);
    strictEqual(await fluxToken.read.balanceOf([singleTokenPool.address]), 40n * 10n ** 18n);
    strictEqual(await fluxToken.read.balanceOf([manager.address]), 60n * 10n ** 18n);

    await lpPool.write.syncRewards();
    strictEqual(await manager.read.pendingPoolRewards([lpPool.address]), 0n);
    strictEqual(await fluxToken.read.balanceOf([lpPool.address]), 60n * 10n ** 18n);
    strictEqual(await fluxToken.read.balanceOf([manager.address]), 0n);
  });

  it("should allow tiny reward batches without reverting", async function () {
    await approveTreasurySpender(manager.address, 3n);

    await manager.write.distributeRewards([1n], {
      account: operatorClient.account.address,
    });

    strictEqual(await fluxToken.read.balanceOf([manager.address]), 1n);
    strictEqual(await manager.read.undistributedRewards(), 0n);
    strictEqual(await singleTokenPool.read.rewardReserve(), 0n);
    strictEqual(await lpPool.read.rewardReserve(), 0n);

    await singleTokenPool.write.syncRewards();
    strictEqual(await fluxToken.read.balanceOf([singleTokenPool.address]), 0n);
    strictEqual(await manager.read.pendingPoolRewards([singleTokenPool.address]), 0n);

    await manager.write.distributeRewards([1n], {
      account: operatorClient.account.address,
    });
    await singleTokenPool.write.syncRewards();
    strictEqual(await fluxToken.read.balanceOf([singleTokenPool.address]), 0n);

    await manager.write.distributeRewards([1n], {
      account: operatorClient.account.address,
    });
    await singleTokenPool.write.syncRewards();
    strictEqual(await fluxToken.read.balanceOf([singleTokenPool.address]), 1n);
  });

  it("should block reward distribution when treasury is paused", async function () {
    await approveTreasurySpender(manager.address, 100n * 10n ** 18n);
    await treasury.write.pause({ account: guardianClient.account.address });

    await expectRevert(
      manager.write.distributeRewards([100n * 10n ** 18n], {
        account: operatorClient.account.address,
      }),
      "FluxMultiPoolManager: TREASURY_PAUSED"
    );
  });

  it("should reject direct operator role grants outside setOperator", async function () {
    const operatorRole = await manager.read.OPERATOR_ROLE();

    await expectRevert(
      manager.write.grantRole([operatorRole, stakerAClient.account.address], {
        account: multisigClient.account.address,
      }),
      "FluxMultiPoolManager: ROLE_MANAGED_BY_SET_OPERATOR"
    );
  });

  it("should allow the updated operator to distribute rewards", async function () {
    const totalReward = 100n * 10n ** 18n;

    await approveTreasurySpender(manager.address, totalReward);
    await manager.write.setOperator([stakerAClient.account.address], {
      account: multisigClient.account.address,
    });

    await manager.write.distributeRewards([totalReward], {
      account: stakerAClient.account.address,
    });

    await singleTokenPool.write.syncRewards();
    await lpPool.write.syncRewards();

    strictEqual(await fluxToken.read.balanceOf([manager.address]), 0n);
    strictEqual(await manager.read.undistributedRewards(), 0n);
  });

  it("should not allow the owner to recover reward tokens reserved for pools", async function () {
    const totalReward = 100n * 10n ** 18n;

    await approveTreasurySpender(manager.address, totalReward);
    await manager.write.distributeRewards([totalReward], {
      account: operatorClient.account.address,
    });

    await expectRevert(
      manager.write.recoverToken([fluxToken.address, multisigClient.account.address, totalReward], {
        account: multisigClient.account.address,
      }),
      "FluxMultiPoolManager: REWARD_TOKEN_LOCKED"
    );
  });

  it("should still allow the owner to recover unrelated tokens", async function () {
    const strayAmount = 25n * 10n ** 18n;

    await extraToken.write.mint([manager.address, strayAmount]);
    await manager.write.recoverToken([extraToken.address, multisigClient.account.address, strayAmount], {
      account: multisigClient.account.address,
    });

    strictEqual(await extraToken.read.balanceOf([manager.address]), 0n);
    strictEqual(await extraToken.read.balanceOf([multisigClient.account.address]), strayAmount);
  });

  it("should reject setting the same operator again", async function () {
    await expectRevert(
      manager.write.setOperator([operatorClient.account.address], {
        account: multisigClient.account.address,
      }),
      "FluxMultiPoolManager: SAME_OPERATOR"
    );
  });

  it("should revoke operator execution when owner and operator overlap across ownership transfer", async function () {
    const overlappingManager = await viem.deployContract("FluxMultiPoolManager", [
      multisigClient.account.address,
      treasury.address,
      multisigClient.account.address,
      fluxToken.address,
    ]);
    const operatorRole = await overlappingManager.read.OPERATOR_ROLE();

    await overlappingManager.write.transferOwnership([stakerAClient.account.address], {
      account: multisigClient.account.address,
    });

    strictEqual(await overlappingManager.read.operator(), "0x0000000000000000000000000000000000000000");
    strictEqual(await overlappingManager.read.hasRole([operatorRole, multisigClient.account.address]), false);
  });
});
