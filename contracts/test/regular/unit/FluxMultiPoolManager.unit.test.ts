import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

/*
 * 单元目标：
 * 1. 验证构造参数与 ERC165 支持。
 * 2. 验证池子的添加、停用、allocPoint 统计，以及 poolFactory 代理操作权限。
 * 3. 验证奖励分发、pool claim、pool 配置更新、treasury 指针更新、poolFactory 指针更新。
 * 4. 验证暂停状态、treasury pause、非法 claim / distribute 的拒绝逻辑。
 * 5. 验证 reward token 不可被 recover，而无关 token 可被 recover。
 * 6. 验证 operator 轮换、禁止直接 grantRole 绕过、ownership 迁移后的权限清理。
 */
describe("FluxMultiPoolManager Unit", async function () {
  const hardhatNetwork = await network.connect();
  const { viem, networkHelpers } = hardhatNetwork;
  const [multisigClient, guardianClient, operatorClient, otherClient] = await viem.getWalletClients();

  const timelockDelay = 3600n;
  const initialSupply = 10_000_000n * 10n ** 18n;
  const cap = 100_000_000n * 10n ** 18n;

  let treasury: any;
  let fluxToken: any;
  let extraToken: any;
  let manager: any;
  let pool: any;

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
    extraToken = await viem.deployContract("MockERC20", ["Extra Token", "EXT", 18]);

    manager = await viem.deployContract("FluxMultiPoolManager", [
      multisigClient.account.address,
      treasury.address,
      operatorClient.account.address,
      fluxToken.address,
    ]);

    pool = await viem.deployContract("FluxSwapStakingRewards", [
      multisigClient.account.address,
      fluxToken.address,
      fluxToken.address,
      manager.address,
      manager.address,
    ]);
    await pool.write.setRewardConfiguration([manager.address, pool.address], {
      account: multisigClient.account.address,
    });

    await manager.write.addPool([pool.address, 100n, true], {
      account: multisigClient.account.address,
    });
  });

  it("should validate constructor inputs and expose ERC165 support", async function () {
    await expectRevert(
      viem.deployContract("FluxMultiPoolManager", [
        multisigClient.account.address,
        "0x0000000000000000000000000000000000000000",
        operatorClient.account.address,
        fluxToken.address,
      ]),
      "FluxMultiPoolManager: ZERO_ADDRESS"
    );

    await expectRevert(
      viem.deployContract("FluxMultiPoolManager", [
        multisigClient.account.address,
        treasury.address,
        "0x0000000000000000000000000000000000000000",
        fluxToken.address,
      ]),
      "FluxMultiPoolManager: ZERO_ADDRESS"
    );

    await expectRevert(
      viem.deployContract("FluxMultiPoolManager", [
        multisigClient.account.address,
        treasury.address,
        operatorClient.account.address,
        "0x0000000000000000000000000000000000000000",
      ]),
      "FluxMultiPoolManager: ZERO_ADDRESS"
    );

    strictEqual(await manager.read.supportsInterface(["0x01ffc9a7"]), true);
    strictEqual(await manager.read.supportsInterface(["0x7965db0b"]), true);
    strictEqual(await manager.read.supportsInterface(["0xffffffff"]), false);
  });

  it("should add and deactivate pools while tracking alloc points", async function () {
    strictEqual(await manager.read.totalAllocPoint(), 100n);

    await manager.write.deactivatePool([pool.address], {
      account: multisigClient.account.address,
    });

    strictEqual(await manager.read.totalAllocPoint(), 0n);
    strictEqual((await manager.read.pools([0n]))[2], false);
  });

  it("should allow the configured pool factory address to add and deactivate pools", async function () {
    const extraPool = await viem.deployContract("FluxSwapStakingRewards", [
      multisigClient.account.address,
      fluxToken.address,
      fluxToken.address,
      manager.address,
      manager.address,
    ]);

    await manager.write.setPoolFactory([otherClient.account.address], {
      account: multisigClient.account.address,
    });

    await manager.write.addPool([extraPool.address, 25n, true], {
      account: otherClient.account.address,
    });

    strictEqual(await manager.read.poolLength(), 2n);
    strictEqual(await manager.read.totalAllocPoint(), 125n);

    await manager.write.deactivatePool([extraPool.address], {
      account: otherClient.account.address,
    });

    strictEqual(await manager.read.totalAllocPoint(), 100n);
    strictEqual((await manager.read.pools([1n]))[2], false);
  });

  it("should distribute rewards and let a pool claim them", async function () {
    const totalReward = 500n * 10n ** 18n;

    await approveTreasurySpender(manager.address, totalReward);
    await manager.write.distributeRewards([totalReward], {
      account: operatorClient.account.address,
    });

    strictEqual(await manager.read.pendingPoolRewards([pool.address]), totalReward);
    await pool.write.syncRewards();
    strictEqual(await fluxToken.read.balanceOf([pool.address]), totalReward);
  });

  it("should update pool settings, treasury pointers, and pool factory pointers", async function () {
    await manager.write.setPool([0n, 40n, true], {
      account: multisigClient.account.address,
    });

    strictEqual(await manager.read.totalAllocPoint(), 40n);
    strictEqual((await manager.read.pools([0n]))[1], 40n);

    await manager.write.setPool([0n, 0n, false], {
      account: multisigClient.account.address,
    });

    strictEqual(await manager.read.totalAllocPoint(), 0n);
    strictEqual((await manager.read.pools([0n]))[2], false);

    await manager.write.setTreasury([otherClient.account.address], {
      account: multisigClient.account.address,
    });
    await manager.write.setPoolFactory([otherClient.account.address], {
      account: multisigClient.account.address,
    });

    strictEqual((await manager.read.treasury()).toLowerCase(), otherClient.account.address.toLowerCase());
    strictEqual((await manager.read.poolFactory()).toLowerCase(), otherClient.account.address.toLowerCase());
  });

  it("should validate reward distribution prerequisites and pause state", async function () {
    await expectRevert(
      manager.write.distributeRewards([0n], {
        account: operatorClient.account.address,
      }),
      "FluxMultiPoolManager: ZERO_AMOUNT"
    );

    await manager.write.deactivatePool([pool.address], {
      account: multisigClient.account.address,
    });

    await expectRevert(
      manager.write.distributeRewards([1n], {
        account: operatorClient.account.address,
      }),
      "FluxMultiPoolManager: NO_ACTIVE_POOLS"
    );

    await manager.write.pause({ account: multisigClient.account.address });

    await expectRevert(
      manager.write.distributeRewards([1n], {
        account: operatorClient.account.address,
      }),
      "FluxMultiPoolManager: PAUSED"
    );

    await manager.write.unpause({ account: multisigClient.account.address });
    strictEqual(await manager.read.paused(), false);
  });

  it("should reject invalid pool claims and reward distributions while treasury is paused", async function () {
    await expectRevert(
      manager.write.claimPoolRewards([otherClient.account.address], {
        account: otherClient.account.address,
      }),
      "FluxMultiPoolManager: INVALID_POOL"
    );

    await expectRevert(
      manager.write.claimPoolRewards([pool.address], {
        account: otherClient.account.address,
      }),
      "FluxMultiPoolManager: FORBIDDEN"
    );

    await approveTreasurySpender(manager.address, 100n * 10n ** 18n);
    await treasury.write.pause({ account: guardianClient.account.address });

    await expectRevert(
      manager.write.distributeRewards([100n * 10n ** 18n], {
        account: operatorClient.account.address,
      }),
      "FluxMultiPoolManager: TREASURY_PAUSED"
    );
  });

  it("should reject recovering the reward token and allow recovering unrelated tokens", async function () {
    await extraToken.write.mint([manager.address, 25n * 10n ** 18n]);

    await expectRevert(
      manager.write.recoverToken([fluxToken.address, multisigClient.account.address, 1n], {
        account: multisigClient.account.address,
      }),
      "FluxMultiPoolManager: REWARD_TOKEN_LOCKED"
    );

    await manager.write.recoverToken([extraToken.address, multisigClient.account.address, 25n * 10n ** 18n], {
      account: multisigClient.account.address,
    });

    strictEqual(await extraToken.read.balanceOf([manager.address]), 0n);
  });

  it("should let the owner rotate the operator and block direct role grants", async function () {
    const operatorRole = await manager.read.OPERATOR_ROLE();

    await manager.write.setOperator([otherClient.account.address], {
      account: multisigClient.account.address,
    });

    strictEqual((await manager.read.operator()).toLowerCase(), otherClient.account.address.toLowerCase());

    await expectRevert(
      manager.write.grantRole([operatorRole, guardianClient.account.address], {
        account: multisigClient.account.address,
      }),
      "FluxMultiPoolManager: ROLE_MANAGED_BY_SET_OPERATOR"
    );

    await expectRevert(
      manager.write.revokeRole([operatorRole, otherClient.account.address], {
        account: multisigClient.account.address,
      }),
      "FluxMultiPoolManager: ROLE_MANAGED_BY_SET_OPERATOR"
    );

    await expectRevert(
      manager.write.renounceRole([operatorRole, otherClient.account.address], {
        account: otherClient.account.address,
      }),
      "FluxMultiPoolManager: ROLE_MANAGED_BY_SET_OPERATOR"
    );

    await expectRevert(
      manager.write.setOperator([otherClient.account.address], {
        account: multisigClient.account.address,
      }),
      "FluxMultiPoolManager: SAME_OPERATOR"
    );
  });

  it("should transfer ownership cleanly and clear overlapping operator authority", async function () {
    const overlappingManager = await viem.deployContract("FluxMultiPoolManager", [
      multisigClient.account.address,
      treasury.address,
      multisigClient.account.address,
      fluxToken.address,
    ]);
    const operatorRole = await overlappingManager.read.OPERATOR_ROLE();

    await overlappingManager.write.transferOwnership([otherClient.account.address], {
      account: multisigClient.account.address,
    });

    strictEqual(await overlappingManager.read.operator(), "0x0000000000000000000000000000000000000000");
    strictEqual(await overlappingManager.read.hasRole([operatorRole, multisigClient.account.address]), false);

    await overlappingManager.write.setTreasury([guardianClient.account.address], {
      account: otherClient.account.address,
    });

    strictEqual(
      (await overlappingManager.read.treasury()).toLowerCase(),
      guardianClient.account.address.toLowerCase()
    );
  });
});
