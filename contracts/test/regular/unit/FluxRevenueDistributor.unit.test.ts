import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

/*
 * 单元目标：
 * 1. 验证构造参数与 ERC165 支持。
 * 2. 验证 treasury FLUX 直发奖励到 manager。
 * 3. 验证收入资产经 buyback 后再 burn / distribute 的分发链路。
 * 4. 验证 manager 与 buyback executor treasury 指针分叉时必须拒绝执行。
 * 5. 验证 pause、收入配置更新、BPS 边界。
 * 6. 验证 operator 权限管理、替换 buyback executor / manager 时的一致性约束，以及 ownership 迁移后的权限清理。
 */
describe("FluxRevenueDistributor Unit", async function () {
  const hardhatNetwork = await network.connect();
  const { viem, networkHelpers } = hardhatNetwork;
  const publicClient = await viem.getPublicClient();
  const [multisigClient, guardianClient, operatorClient, lpClient, traderClient, otherClient] =
    await viem.getWalletClients();

  const timelockDelay = 3600n;
  const initialSupply = 10_000_000n * 10n ** 18n;
  const cap = 100_000_000n * 10n ** 18n;
  const maxUint256 = (1n << 256n) - 1n;
  const buybackBps = 2500n;
  const burnBps = 2000n;

  let treasury: any;
  let fluxToken: any;
  let revenueToken: any;
  let WETH: any;
  let factory: any;
  let router: any;
  let manager: any;
  let stakingPool: any;
  let buybackExecutor: any;
  let distributor: any;

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

  async function approveTreasurySpender(tokenAddress: `0x${string}`, spender: `0x${string}`, amount: bigint) {
    const approveOp = await treasury.read.hashApproveSpender([tokenAddress, spender, amount]);
    await scheduleAndExecute(approveOp, () =>
      treasury.write.executeApproveSpender([tokenAddress, spender, amount, approveOp])
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

    revenueToken = await viem.deployContract("MockERC20", ["Revenue Token", "USDX", 18]);
    WETH = await viem.deployContract("MockWETH", []);
    factory = await viem.deployContract("FluxSwapFactory", [multisigClient.account.address]);
    router = await viem.deployContract("FluxSwapRouter", [factory.address, WETH.address]);

    manager = await viem.deployContract("FluxMultiPoolManager", [
      multisigClient.account.address,
      treasury.address,
      operatorClient.account.address,
      fluxToken.address,
    ]);

    stakingPool = await viem.deployContract("FluxSwapStakingRewards", [
      multisigClient.account.address,
      fluxToken.address,
      fluxToken.address,
      manager.address,
      manager.address,
    ]);
    await stakingPool.write.setRewardConfiguration([manager.address, stakingPool.address], {
      account: multisigClient.account.address,
    });
    await manager.write.addPool([stakingPool.address, 100n, true], {
      account: multisigClient.account.address,
    });

    buybackExecutor = await viem.deployContract("FluxBuybackExecutor", [
      multisigClient.account.address,
      treasury.address,
      operatorClient.account.address,
      router.address,
      fluxToken.address,
      treasury.address,
    ]);

    distributor = await viem.deployContract("FluxRevenueDistributor", [
      multisigClient.account.address,
      operatorClient.account.address,
      buybackExecutor.address,
      manager.address,
      buybackBps,
      burnBps,
    ]);

    await buybackExecutor.write.setOperator([distributor.address], {
      account: multisigClient.account.address,
    });
    await manager.write.setOperator([distributor.address], {
      account: multisigClient.account.address,
    });
    await factory.write.setTreasury([treasury.address], {
      account: multisigClient.account.address,
    });

    await fluxToken.write.mint([lpClient.account.address, 200_000n * 10n ** 18n], {
      account: multisigClient.account.address,
    });
    await revenueToken.write.mint([lpClient.account.address, 200_000n * 10n ** 18n]);
    await revenueToken.write.mint([traderClient.account.address, 50_000n * 10n ** 18n]);

    await fluxToken.write.approve([router.address, maxUint256], { account: lpClient.account.address });
    await revenueToken.write.approve([router.address, maxUint256], { account: lpClient.account.address });
    await revenueToken.write.approve([router.address, maxUint256], { account: traderClient.account.address });

    await router.write.addLiquidity(
      [
        fluxToken.address,
        revenueToken.address,
        100_000n * 10n ** 18n,
        100_000n * 10n ** 18n,
        0n,
        0n,
        lpClient.account.address,
        await getDeadline(),
      ],
      { account: lpClient.account.address }
    );
  });

  it("should validate constructor inputs and expose ERC165 support", async function () {
    await expectRevert(
      viem.deployContract("FluxRevenueDistributor", [
        multisigClient.account.address,
        "0x0000000000000000000000000000000000000000",
        buybackExecutor.address,
        manager.address,
        buybackBps,
        burnBps,
      ]),
      "FluxRevenueDistributor: ZERO_ADDRESS"
    );

    await expectRevert(
      viem.deployContract("FluxRevenueDistributor", [
        multisigClient.account.address,
        operatorClient.account.address,
        "0x0000000000000000000000000000000000000000",
        manager.address,
        buybackBps,
        burnBps,
      ]),
      "FluxRevenueDistributor: ZERO_ADDRESS"
    );

    await expectRevert(
      viem.deployContract("FluxRevenueDistributor", [
        multisigClient.account.address,
        operatorClient.account.address,
        buybackExecutor.address,
        "0x0000000000000000000000000000000000000000",
        buybackBps,
        burnBps,
      ]),
      "FluxRevenueDistributor: ZERO_ADDRESS"
    );

    await expectRevert(
      viem.deployContract("FluxRevenueDistributor", [
        multisigClient.account.address,
        operatorClient.account.address,
        buybackExecutor.address,
        manager.address,
        0n,
        burnBps,
      ]),
      "FluxRevenueDistributor: INVALID_BPS"
    );

    await expectRevert(
      viem.deployContract("FluxRevenueDistributor", [
        multisigClient.account.address,
        operatorClient.account.address,
        buybackExecutor.address,
        manager.address,
        buybackBps,
        10001n,
      ]),
      "FluxRevenueDistributor: INVALID_BPS"
    );

    const invalidRewardManager = await viem.deployContract("FluxMultiPoolManager", [
      multisigClient.account.address,
      treasury.address,
      operatorClient.account.address,
      revenueToken.address,
    ]);
    const alternateTreasury = await viem.deployContract("FluxSwapTreasury", [
      multisigClient.account.address,
      guardianClient.account.address,
      operatorClient.account.address,
      timelockDelay,
    ]);
    const mismatchedManager = await viem.deployContract("FluxMultiPoolManager", [
      multisigClient.account.address,
      alternateTreasury.address,
      operatorClient.account.address,
      fluxToken.address,
    ]);

    await expectRevert(
      viem.deployContract("FluxRevenueDistributor", [
        multisigClient.account.address,
        operatorClient.account.address,
        buybackExecutor.address,
        invalidRewardManager.address,
        buybackBps,
        burnBps,
      ]),
      "FluxRevenueDistributor: INVALID_REWARD_TOKEN"
    );

    await expectRevert(
      viem.deployContract("FluxRevenueDistributor", [
        multisigClient.account.address,
        operatorClient.account.address,
        buybackExecutor.address,
        mismatchedManager.address,
        buybackBps,
        burnBps,
      ]),
      "FluxRevenueDistributor: TREASURY_MISMATCH"
    );

    strictEqual(await distributor.read.supportsInterface(["0x01ffc9a7"]), true);
    strictEqual(await distributor.read.supportsInterface(["0x7965db0b"]), true);
    strictEqual(await distributor.read.supportsInterface(["0xffffffff"]), false);
  });

  it("should distribute treasury FLUX rewards through the manager", async function () {
    const rewardAmount = 500n * 10n ** 18n;

    await approveTreasurySpender(fluxToken.address, manager.address, rewardAmount);
    await distributor.write.distributeTreasuryRewards([rewardAmount], {
      account: operatorClient.account.address,
    });

    strictEqual(await fluxToken.read.balanceOf([manager.address]), rewardAmount);
  });

  it("should convert treasury revenue through buyback and distribution", async function () {
    const swapAmount = 1_000n * 10n ** 18n;
    const protocolFee = (swapAmount * 5n) / 10000n;

    await router.write.swapExactTokensForTokens(
      [swapAmount, 0n, [revenueToken.address, fluxToken.address], traderClient.account.address, await getDeadline()],
      { account: traderClient.account.address }
    );

    await approveTreasurySpender(revenueToken.address, buybackExecutor.address, protocolFee);
    await approveTreasurySpender(fluxToken.address, manager.address, 10_000n * 10n ** 18n);
    await approveTreasurySpender(fluxToken.address, distributor.address, 10_000n * 10n ** 18n);

    await distributor.write.executeBuybackAndDistribute(
      [revenueToken.address, protocolFee, 1n, [revenueToken.address, fluxToken.address], await getDeadline()],
      { account: operatorClient.account.address }
    );

    ok(await fluxToken.read.balanceOf([manager.address]) > 0n);
  });

  it("should reject execution when manager and buyback executor treasuries diverge", async function () {
    const alternateTreasury = await viem.deployContract("FluxSwapTreasury", [
      multisigClient.account.address,
      guardianClient.account.address,
      operatorClient.account.address,
      timelockDelay,
    ]);

    await manager.write.setTreasury([alternateTreasury.address], {
      account: multisigClient.account.address,
    });

    await expectRevert(
      distributor.write.distributeTreasuryRewards([1n], {
        account: operatorClient.account.address,
      }),
      "FluxRevenueDistributor: TREASURY_MISMATCH"
    );
  });

  it("should block execution while paused and allow valid config updates", async function () {
    await distributor.write.setRevenueConfiguration([3000n, 1000n], {
      account: multisigClient.account.address,
    });
    strictEqual(await distributor.read.buybackBps(), 3000n);
    strictEqual(await distributor.read.burnBps(), 1000n);

    await distributor.write.pause({ account: multisigClient.account.address });
    await expectRevert(
      distributor.write.distributeTreasuryRewards([1n], {
        account: operatorClient.account.address,
      }),
      "FluxRevenueDistributor: PAUSED"
    );

    await distributor.write.unpause({ account: multisigClient.account.address });
    strictEqual(await distributor.read.paused(), false);
  });

  it("should validate revenue configuration bounds and operator role management", async function () {
    const operatorRole = await distributor.read.OPERATOR_ROLE();

    await expectRevert(
      distributor.write.setRevenueConfiguration([0n, burnBps], {
        account: multisigClient.account.address,
      }),
      "FluxRevenueDistributor: INVALID_BPS"
    );

    await expectRevert(
      distributor.write.setRevenueConfiguration([buybackBps, 10001n], {
        account: multisigClient.account.address,
      }),
      "FluxRevenueDistributor: INVALID_BPS"
    );

    await distributor.write.setOperator([otherClient.account.address], {
      account: multisigClient.account.address,
    });

    strictEqual((await distributor.read.operator()).toLowerCase(), otherClient.account.address.toLowerCase());

    await expectRevert(
      distributor.write.grantRole([operatorRole, traderClient.account.address], {
        account: multisigClient.account.address,
      }),
      "FluxRevenueDistributor: ROLE_MANAGED_BY_SET_OPERATOR"
    );

    await expectRevert(
      distributor.write.revokeRole([operatorRole, otherClient.account.address], {
        account: multisigClient.account.address,
      }),
      "FluxRevenueDistributor: ROLE_MANAGED_BY_SET_OPERATOR"
    );

    await expectRevert(
      distributor.write.renounceRole([operatorRole, otherClient.account.address], {
        account: otherClient.account.address,
      }),
      "FluxRevenueDistributor: ROLE_MANAGED_BY_SET_OPERATOR"
    );

    await expectRevert(
      distributor.write.setOperator([otherClient.account.address], {
        account: multisigClient.account.address,
      }),
      "FluxRevenueDistributor: SAME_OPERATOR"
    );
  });

  it("should update buyback executor and manager when replacements stay aligned", async function () {
    const alternateExecutor = await viem.deployContract("FluxBuybackExecutor", [
      multisigClient.account.address,
      treasury.address,
      operatorClient.account.address,
      router.address,
      fluxToken.address,
      treasury.address,
    ]);
    const invalidRewardExecutor = await viem.deployContract("FluxBuybackExecutor", [
      multisigClient.account.address,
      treasury.address,
      operatorClient.account.address,
      router.address,
      revenueToken.address,
      treasury.address,
    ]);
    const alternateTreasury = await viem.deployContract("FluxSwapTreasury", [
      multisigClient.account.address,
      guardianClient.account.address,
      operatorClient.account.address,
      timelockDelay,
    ]);
    const mismatchedExecutor = await viem.deployContract("FluxBuybackExecutor", [
      multisigClient.account.address,
      alternateTreasury.address,
      operatorClient.account.address,
      router.address,
      fluxToken.address,
      alternateTreasury.address,
    ]);
    const alternateManager = await viem.deployContract("FluxMultiPoolManager", [
      multisigClient.account.address,
      treasury.address,
      operatorClient.account.address,
      fluxToken.address,
    ]);
    const invalidRewardManager = await viem.deployContract("FluxMultiPoolManager", [
      multisigClient.account.address,
      treasury.address,
      operatorClient.account.address,
      revenueToken.address,
    ]);

    await distributor.write.setBuybackExecutor([alternateExecutor.address], {
      account: multisigClient.account.address,
    });
    strictEqual(
      (await distributor.read.buybackExecutor()).toLowerCase(),
      alternateExecutor.address.toLowerCase()
    );

    await expectRevert(
      distributor.write.setBuybackExecutor([invalidRewardExecutor.address], {
        account: multisigClient.account.address,
      }),
      "FluxRevenueDistributor: INVALID_REWARD_TOKEN"
    );

    await expectRevert(
      distributor.write.setBuybackExecutor([mismatchedExecutor.address], {
        account: multisigClient.account.address,
      }),
      "FluxRevenueDistributor: TREASURY_MISMATCH"
    );

    await distributor.write.setManager([alternateManager.address], {
      account: multisigClient.account.address,
    });
    strictEqual((await distributor.read.manager()).toLowerCase(), alternateManager.address.toLowerCase());

    await expectRevert(
      distributor.write.setManager([invalidRewardManager.address], {
        account: multisigClient.account.address,
      }),
      "FluxRevenueDistributor: INVALID_REWARD_TOKEN"
    );
  });

  it("should recover stray tokens held by the distributor", async function () {
    await revenueToken.write.mint([distributor.address, 25n * 10n ** 18n]);

    await distributor.write.recoverToken([revenueToken.address, otherClient.account.address, 25n * 10n ** 18n], {
      account: multisigClient.account.address,
    });

    strictEqual(await revenueToken.read.balanceOf([distributor.address]), 0n);
    strictEqual(await revenueToken.read.balanceOf([otherClient.account.address]), 25n * 10n ** 18n);
  });

  it("should revoke overlapping operator authority on ownership transfer", async function () {
    const overlappingDistributor = await viem.deployContract("FluxRevenueDistributor", [
      multisigClient.account.address,
      multisigClient.account.address,
      buybackExecutor.address,
      manager.address,
      buybackBps,
      burnBps,
    ]);
    const operatorRole = await overlappingDistributor.read.OPERATOR_ROLE();

    await overlappingDistributor.write.transferOwnership([otherClient.account.address], {
      account: multisigClient.account.address,
    });

    strictEqual(await overlappingDistributor.read.operator(), "0x0000000000000000000000000000000000000000");
    strictEqual(await overlappingDistributor.read.hasRole([operatorRole, multisigClient.account.address]), false);

    await overlappingDistributor.write.setRevenueConfiguration([3500n, 500n], {
      account: otherClient.account.address,
    });

    strictEqual(await overlappingDistributor.read.buybackBps(), 3500n);
    strictEqual(await overlappingDistributor.read.burnBps(), 500n);
  });
});
