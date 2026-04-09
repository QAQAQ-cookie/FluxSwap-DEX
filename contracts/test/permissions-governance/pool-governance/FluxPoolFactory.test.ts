import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

/*
 * 池治理目标：
 * 1. 锁定 FluxPoolFactory 的 owner 是唯一可以创建池、变更 managed pool 配置、移交池 ownership 的治理入口。
 * 2. 锁定 managed pool 在 self-sync 模式下只能通过原子配置切换，离开 self-sync 后才允许细粒度半更新。
 * 3. 锁定 factory owner 迁移后，对既有 managed pool 的治理能力仍然连续。
 * 4. 锁定 managed pool handoff 后会正确注销管理权，避免旧池与新池并存时发生静默失配。
 */
describe("FluxPoolFactory", async function () {
  const hardhatNetwork = await network.connect();
  const { viem, networkHelpers } = hardhatNetwork;
  const publicClient = await viem.getPublicClient();
  const [multisigClient, guardianClient, operatorClient, lpClient] = await viem.getWalletClients();

  const timelockDelay = 3600n;
  const initialSupply = 10_000_000n * 10n ** 18n;
  const cap = 100_000_000n * 10n ** 18n;
  const maxUint256 = (1n << 256n) - 1n;

  let treasury: any;
  let fluxToken: any;
  let tokenA: any;
  let tokenB: any;
  let WETH: any;
  let dexFactory: any;
  let router: any;
  let pair: any;
  let manager: any;
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

    ok(
      errorText.includes(reason),
      `Expected revert reason "${reason}", got: ${errorText}`
    );
  };

  async function getDeadline() {
    return (await publicClient.getBlock()).timestamp + 3600n;
  }

  async function scheduleAndExecute(operationId: `0x${string}`, execute: () => Promise<unknown>) {
    await treasury.write.scheduleOperation([operationId, timelockDelay], { account: multisigClient.account.address });
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

    tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
    tokenB = await viem.deployContract("MockERC20", ["Token B", "TKNB", 18]);
    WETH = await viem.deployContract("MockWETH", []);
    dexFactory = await viem.deployContract("FluxSwapFactory", [multisigClient.account.address]);
    router = await viem.deployContract("FluxSwapRouter", [dexFactory.address, WETH.address]);

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

    const pairAddress = await dexFactory.read.getPair([tokenA.address, tokenB.address]);
    pair = await viem.getContractAt("FluxSwapPair", pairAddress);

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

  it("should create a single token pool and auto-register it in the manager", async function () {
    await poolFactory.write.createSingleTokenPool([fluxToken.address, 40n, true], {
      account: multisigClient.account.address,
    });

    const poolAddress = await poolFactory.read.singleTokenPools([fluxToken.address]);
    const poolInfo = await manager.read.pools([0n]);
    const pool = await viem.getContractAt("FluxSwapStakingRewards", poolAddress);

    strictEqual(poolInfo[0].toLowerCase(), poolAddress.toLowerCase());
    strictEqual(poolInfo[1], 40n);
    strictEqual(poolInfo[2], true);
    strictEqual((await pool.read.owner()).toLowerCase(), poolFactory.address.toLowerCase());
    strictEqual((await pool.read.rewardSource()).toLowerCase(), manager.address.toLowerCase());
    strictEqual((await pool.read.rewardNotifier()).toLowerCase(), poolAddress.toLowerCase());
  });

  it("should create an LP pool and auto-register it in the manager", async function () {
    await poolFactory.write.createLPPool([pair.address, 60n, true], {
      account: multisigClient.account.address,
    });

    const poolAddress = await poolFactory.read.lpTokenPools([pair.address]);
    const poolInfo = await manager.read.pools([0n]);
    const pool = await viem.getContractAt("FluxSwapLPStakingPool", poolAddress);

    strictEqual(poolInfo[0].toLowerCase(), poolAddress.toLowerCase());
    strictEqual(poolInfo[1], 60n);
    strictEqual(poolInfo[2], true);
    strictEqual((await pool.read.owner()).toLowerCase(), poolFactory.address.toLowerCase());
    strictEqual((await pool.read.lpToken()).toLowerCase(), pair.address.toLowerCase());
    strictEqual((await pool.read.factory()).toLowerCase(), dexFactory.address.toLowerCase());
  });

  it("should prevent duplicate pool creation", async function () {
    await poolFactory.write.createSingleTokenPool([fluxToken.address, 40n, true], {
      account: multisigClient.account.address,
    });

    await expectRevert(
      poolFactory.write.createSingleTokenPool([fluxToken.address, 50n, true], {
        account: multisigClient.account.address,
      }),
      "FluxPoolFactory: POOL_EXISTS"
    );
  });

  it("should keep governance over existing pools after factory ownership transfer", async function () {
    await poolFactory.write.createSingleTokenPool([fluxToken.address, 40n, true], {
      account: multisigClient.account.address,
    });

    const poolAddress = await poolFactory.read.singleTokenPools([fluxToken.address]);
    const pool = await viem.getContractAt("FluxSwapStakingRewards", poolAddress);

    await poolFactory.write.transferOwnership([operatorClient.account.address], {
      account: multisigClient.account.address,
    });

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

  it("should allow fine-grained managed pool reward updates only after leaving self-sync mode", async function () {
    await poolFactory.write.createSingleTokenPool([fluxToken.address, 40n, true], {
      account: multisigClient.account.address,
    });

    const poolAddress = await poolFactory.read.singleTokenPools([fluxToken.address]);
    const pool = await viem.getContractAt("FluxSwapStakingRewards", poolAddress);

    await expectRevert(
      poolFactory.write.setManagedPoolRewardSource([poolAddress, treasury.address], {
        account: operatorClient.account.address,
      }),
      "OwnableUnauthorizedAccount"
    );

    await poolFactory.write.setManagedPoolRewardConfiguration([poolAddress, treasury.address, operatorClient.account.address], {
      account: multisigClient.account.address,
    });

    await poolFactory.write.setManagedPoolRewardSource([poolAddress, multisigClient.account.address], {
      account: multisigClient.account.address,
    });
    await poolFactory.write.setManagedPoolRewardNotifier([poolAddress, lpClient.account.address], {
      account: multisigClient.account.address,
    });

    strictEqual((await pool.read.rewardSource()).toLowerCase(), multisigClient.account.address.toLowerCase());
    strictEqual((await pool.read.rewardNotifier()).toLowerCase(), lpClient.account.address.toLowerCase());

    await poolFactory.write.transferOwnership([operatorClient.account.address], {
      account: multisigClient.account.address,
    });

    await expectRevert(
      poolFactory.write.setManagedPoolRewardNotifier([poolAddress, treasury.address], {
        account: multisigClient.account.address,
      }),
      "OwnableUnauthorizedAccount"
    );

    await poolFactory.write.setManagedPoolRewardNotifier([poolAddress, treasury.address], {
      account: operatorClient.account.address,
    });

    strictEqual((await pool.read.rewardNotifier()).toLowerCase(), treasury.address.toLowerCase());
  });

  it("should allow the factory owner to hand off pool ownership explicitly", async function () {
    await poolFactory.write.createSingleTokenPool([fluxToken.address, 40n, true], {
      account: multisigClient.account.address,
    });

    const poolAddress = await poolFactory.read.singleTokenPools([fluxToken.address]);
    const pool = await viem.getContractAt("FluxSwapStakingRewards", poolAddress);

    await poolFactory.write.transferManagedPoolOwnership([poolAddress, operatorClient.account.address], {
      account: multisigClient.account.address,
    });

    strictEqual((await pool.read.owner()).toLowerCase(), operatorClient.account.address.toLowerCase());
    strictEqual(await poolFactory.read.managedPools([poolAddress]), false);
    strictEqual((await manager.read.pools([0n]))[2], false);

    await expectRevert(
      poolFactory.write.setManagedPoolRewardSource([poolAddress, treasury.address], {
        account: multisigClient.account.address,
      }),
      "FluxPoolFactory: POOL_NOT_MANAGED"
    );
  });

  it("should allow recreating a managed pool for the same asset after ownership handoff", async function () {
    const stakingToken = await viem.deployContract("MockERC20", ["Stake Token", "STK", 18]);

    await poolFactory.write.createSingleTokenPool([stakingToken.address, 40n, true], {
      account: multisigClient.account.address,
    });

    const originalPool = await poolFactory.read.singleTokenPools([stakingToken.address]);

    await poolFactory.write.transferManagedPoolOwnership([originalPool, operatorClient.account.address], {
      account: multisigClient.account.address,
    });

    await poolFactory.write.createSingleTokenPool([stakingToken.address, 60n, true], {
      account: multisigClient.account.address,
    });

    const replacementPool = await poolFactory.read.singleTokenPools([stakingToken.address]);
    const originalPoolInfo = await manager.read.pools([0n]);
    const replacementPoolInfo = await manager.read.pools([1n]);

    ok(replacementPool !== originalPool, "expected a newly created managed pool");
    strictEqual(await poolFactory.read.managedPools([replacementPool]), true);
    strictEqual(originalPoolInfo[0].toLowerCase(), originalPool.toLowerCase());
    strictEqual(originalPoolInfo[2], false);
    strictEqual(replacementPoolInfo[0].toLowerCase(), replacementPool.toLowerCase());
    strictEqual(replacementPoolInfo[2], true);
    strictEqual(await manager.read.totalAllocPoint(), 60n);
  });

  it("should reject handing a managed pool to its current owner", async function () {
    await poolFactory.write.createSingleTokenPool([fluxToken.address, 40n, true], {
      account: multisigClient.account.address,
    });

    const poolAddress = await poolFactory.read.singleTokenPools([fluxToken.address]);

    await expectRevert(
      poolFactory.write.transferManagedPoolOwnership([poolAddress, poolFactory.address], {
        account: multisigClient.account.address,
      }),
      "FluxPoolFactory: SAME_OWNER"
    );

    strictEqual(await poolFactory.read.managedPools([poolAddress]), true);
  });

  it("should allow the factory owner to recover unallocated rewards from a managed pool", async function () {
    const totalReward = 500n * 10n ** 18n;

    await poolFactory.write.createSingleTokenPool([fluxToken.address, 100n, true], {
      account: multisigClient.account.address,
    });

    const poolAddress = await poolFactory.read.singleTokenPools([fluxToken.address]);
    await approveTreasurySpender(manager.address, totalReward);

    const treasuryBalanceBefore = await fluxToken.read.balanceOf([treasury.address]);
    await manager.write.distributeRewards([totalReward], {
      account: operatorClient.account.address,
    });

    await poolFactory.write.recoverManagedPoolUnallocatedRewards([poolAddress, treasury.address], {
      account: multisigClient.account.address,
    });

    strictEqual(await fluxToken.read.balanceOf([treasury.address]), treasuryBalanceBefore);
    strictEqual(await fluxToken.read.balanceOf([poolAddress]), 0n);
  });

  it("should require atomic reward configuration changes when a managed pool is in self-sync mode", async function () {
    await poolFactory.write.createSingleTokenPool([fluxToken.address, 40n, true], {
      account: multisigClient.account.address,
    });

    const poolAddress = await poolFactory.read.singleTokenPools([fluxToken.address]);

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
});
