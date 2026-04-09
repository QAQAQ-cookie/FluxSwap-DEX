import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

/*
 * 单元目标：
 * 1. 验证构造参数。
 * 2. 验证单币池、LP 池的创建与注册。
 * 3. 验证 managed pool 奖励配置的原子更新与后续细粒度更新。
 * 4. 验证 duplicate pool、unmanaged pool、self-sync 下半更新等非法路径。
 * 5. 验证 managed pool ownership handoff、旧池停用、同资产重建替代池。
 * 6. 验证工厂从 managed pool 回收未分配奖励，以及 owner 迁移后治理能力仍然连续。
 */
describe("FluxPoolFactory Unit", async function () {
  const hardhatNetwork = await network.connect();
  const { viem, networkHelpers } = hardhatNetwork;
  const publicClient = await viem.getPublicClient();
  const [multisigClient, guardianClient, operatorClient, lpClient, otherClient] = await viem.getWalletClients();

  const timelockDelay = 3600n;
  const initialSupply = 10_000_000n * 10n ** 18n;
  const cap = 100_000_000n * 10n ** 18n;

  let treasury: any;
  let fluxToken: any;
  let manager: any;
  let tokenA: any;
  let tokenB: any;
  let WETH: any;
  let dexFactory: any;
  let router: any;
  let pair: any;
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
    await tokenA.write.approve([router.address, 1_000_000n * 10n ** 18n], { account: lpClient.account.address });
    await tokenB.write.approve([router.address, 1_000_000n * 10n ** 18n], { account: lpClient.account.address });

    await router.write.addLiquidity(
      [
        tokenA.address,
        tokenB.address,
        10_000n * 10n ** 18n,
        10_000n * 10n ** 18n,
        0n,
        0n,
        lpClient.account.address,
        await getDeadline(),
      ],
      { account: lpClient.account.address }
    );

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

  it("should validate constructor inputs", async function () {
    await expectRevert(
      viem.deployContract("FluxPoolFactory", [
        multisigClient.account.address,
        "0x0000000000000000000000000000000000000000",
        dexFactory.address,
        fluxToken.address,
      ]),
      "FluxPoolFactory: ZERO_ADDRESS"
    );

    await expectRevert(
      viem.deployContract("FluxPoolFactory", [
        multisigClient.account.address,
        manager.address,
        "0x0000000000000000000000000000000000000000",
        fluxToken.address,
      ]),
      "FluxPoolFactory: ZERO_ADDRESS"
    );

    await expectRevert(
      viem.deployContract("FluxPoolFactory", [
        multisigClient.account.address,
        manager.address,
        dexFactory.address,
        "0x0000000000000000000000000000000000000000",
      ]),
      "FluxPoolFactory: ZERO_ADDRESS"
    );
  });

  it("should create and register single-token pools", async function () {
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

  it("should create and register LP pools", async function () {
    await poolFactory.write.createLPPool([pair.address, 60n, true], {
      account: multisigClient.account.address,
    });

    const poolAddress = await poolFactory.read.lpTokenPools([pair.address]);
    const poolInfo = await manager.read.pools([0n]);
    const pool = await viem.getContractAt("FluxSwapLPStakingPool", poolAddress);

    strictEqual(poolInfo[0].toLowerCase(), poolAddress.toLowerCase());
    strictEqual(poolInfo[1], 60n);
    strictEqual(poolInfo[2], true);
    strictEqual((await pool.read.lpToken()).toLowerCase(), pair.address.toLowerCase());
    strictEqual((await pool.read.factory()).toLowerCase(), dexFactory.address.toLowerCase());
  });

  it("should update managed pool reward configuration atomically and then allow granular updates", async function () {
    await poolFactory.write.createSingleTokenPool([fluxToken.address, 40n, true], {
      account: multisigClient.account.address,
    });

    const poolAddress = await poolFactory.read.singleTokenPools([fluxToken.address]);
    const pool = await viem.getContractAt("FluxSwapStakingRewards", poolAddress);

    await poolFactory.write.setManagedPoolRewardConfiguration([poolAddress, treasury.address, operatorClient.account.address], {
      account: multisigClient.account.address,
    });

    strictEqual((await pool.read.rewardSource()).toLowerCase(), treasury.address.toLowerCase());
    strictEqual((await pool.read.rewardNotifier()).toLowerCase(), operatorClient.account.address.toLowerCase());

    await poolFactory.write.setManagedPoolRewardSource([poolAddress, multisigClient.account.address], {
      account: multisigClient.account.address,
    });
    await poolFactory.write.setManagedPoolRewardNotifier([poolAddress, otherClient.account.address], {
      account: multisigClient.account.address,
    });

    strictEqual((await pool.read.rewardSource()).toLowerCase(), multisigClient.account.address.toLowerCase());
    strictEqual((await pool.read.rewardNotifier()).toLowerCase(), otherClient.account.address.toLowerCase());
  });

  it("should reject duplicate pools, unmanaged pools, and partial self-sync changes", async function () {
    await poolFactory.write.createSingleTokenPool([fluxToken.address, 40n, true], {
      account: multisigClient.account.address,
    });
    const poolAddress = await poolFactory.read.singleTokenPools([fluxToken.address]);

    await expectRevert(
      poolFactory.write.createSingleTokenPool([fluxToken.address, 50n, true], {
        account: multisigClient.account.address,
      }),
      "FluxPoolFactory: POOL_EXISTS"
    );

    await expectRevert(
      poolFactory.write.setManagedPoolRewardSource([poolAddress, treasury.address], {
        account: multisigClient.account.address,
      }),
      "FluxSwapStakingRewards: USE_REWARD_CONFIGURATION"
    );

    await expectRevert(
      poolFactory.write.setManagedPoolRewardConfiguration([otherClient.account.address, treasury.address, operatorClient.account.address], {
        account: multisigClient.account.address,
      }),
      "FluxPoolFactory: POOL_NOT_MANAGED"
    );

    await expectRevert(
      poolFactory.write.recoverManagedPoolUnallocatedRewards([otherClient.account.address, treasury.address], {
        account: multisigClient.account.address,
      }),
      "FluxPoolFactory: POOL_NOT_MANAGED"
    );
  });

  it("should hand off managed pool ownership, deactivate the old pool, and allow recreating the same asset", async function () {
    const stakingToken = await viem.deployContract("MockERC20", ["Stake Token", "STK", 18]);

    await poolFactory.write.createSingleTokenPool([stakingToken.address, 40n, true], {
      account: multisigClient.account.address,
    });

    const originalPool = await poolFactory.read.singleTokenPools([stakingToken.address]);

    await poolFactory.write.transferManagedPoolOwnership([originalPool, operatorClient.account.address], {
      account: multisigClient.account.address,
    });

    strictEqual(await poolFactory.read.managedPools([originalPool]), false);
    strictEqual((await manager.read.pools([0n]))[2], false);

    await poolFactory.write.createSingleTokenPool([stakingToken.address, 60n, true], {
      account: multisigClient.account.address,
    });

    const replacementPool = await poolFactory.read.singleTokenPools([stakingToken.address]);
    const replacementPoolInfo = await manager.read.pools([1n]);

    ok(replacementPool !== originalPool, "expected a new managed pool after ownership handoff");
    strictEqual(await poolFactory.read.managedPools([replacementPool]), true);
    strictEqual(replacementPoolInfo[0].toLowerCase(), replacementPool.toLowerCase());
    strictEqual(replacementPoolInfo[2], true);
    strictEqual(await manager.read.totalAllocPoint(), 60n);
  });

  it("should recover unallocated rewards from a managed pool", async function () {
    const totalReward = 500n * 10n ** 18n;

    await poolFactory.write.createSingleTokenPool([fluxToken.address, 100n, true], {
      account: multisigClient.account.address,
    });

    const poolAddress = await poolFactory.read.singleTokenPools([fluxToken.address]);
    const treasuryBalanceBefore = await fluxToken.read.balanceOf([treasury.address]);

    await approveTreasurySpender(manager.address, totalReward);
    await manager.write.distributeRewards([totalReward], {
      account: operatorClient.account.address,
    });

    await poolFactory.write.recoverManagedPoolUnallocatedRewards([poolAddress, treasury.address], {
      account: multisigClient.account.address,
    });

    strictEqual(await fluxToken.read.balanceOf([treasury.address]), treasuryBalanceBefore);
    strictEqual(await fluxToken.read.balanceOf([poolAddress]), 0n);
  });

  it("should preserve governance when the pool factory owner changes", async function () {
    await poolFactory.write.createSingleTokenPool([fluxToken.address, 40n, true], {
      account: multisigClient.account.address,
    });

    const poolAddress = await poolFactory.read.singleTokenPools([fluxToken.address]);
    const pool = await viem.getContractAt("FluxSwapStakingRewards", poolAddress);

    await poolFactory.write.transferOwnership([otherClient.account.address], {
      account: multisigClient.account.address,
    });

    await expectRevert(
      poolFactory.write.setManagedPoolRewardConfiguration([poolAddress, treasury.address, operatorClient.account.address], {
        account: multisigClient.account.address,
      }),
      "OwnableUnauthorizedAccount"
    );

    await poolFactory.write.setManagedPoolRewardConfiguration([poolAddress, treasury.address, operatorClient.account.address], {
      account: otherClient.account.address,
    });

    strictEqual((await pool.read.rewardSource()).toLowerCase(), treasury.address.toLowerCase());
    strictEqual((await pool.read.rewardNotifier()).toLowerCase(), operatorClient.account.address.toLowerCase());
  });
});
