import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

/*
 * 权限治理目标：
 * 1. 锁定 FluxRevenueDistributor 的 owner / operator / pauser 权限边界。
 * 2. 锁定 setOperator 是唯一的 OPERATOR_ROLE 入口，禁止直接 grant / revoke / renounce。
 * 3. 锁定 manager / buybackExecutor / revenueConfiguration 的治理更新只能由 owner 执行。
 * 4. 锁定 manager 与 buybackExecutor 的 reward token / treasury 指针必须保持一致。
 * 5. 锁定 ownership 迁移后的 admin / pauser 权限收敛，以及 owner 与 operator 重叠时的权限清理。
 */
describe("FluxRevenueDistributor", async function () {
  const hardhatNetwork = await network.connect();
  const { viem, networkHelpers } = hardhatNetwork;
  const publicClient = await viem.getPublicClient();
  const [multisigClient, guardianClient, operatorClient, lpClient, traderClient, otherClient] =
    await viem.getWalletClients();

  const timelockDelay = 3600n;
  const initialSupply = 10_000_000n * 10n ** 18n;
  const cap = 100_000_000n * 10n ** 18n;
  const buybackBps = 2500n;
  const burnBps = 2000n;
  const maxUint256 = (1n << 256n) - 1n;
  const zeroAddress = "0x0000000000000000000000000000000000000000";

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

  // RevenueDistributor 依赖 treasury 给 buybackExecutor / manager 放行 spender 配额。
  async function approveTreasurySpender(tokenAddress: `0x${string}`, spender: `0x${string}`, amount: bigint) {
    const approveOp = await treasury.read.hashApproveSpender([tokenAddress, spender, amount]);
    await scheduleAndExecute(approveOp, () =>
      treasury.write.executeApproveSpender([tokenAddress, spender, amount, approveOp])
    );
  }

  async function getDeadline() {
    return (await publicClient.getBlock()).timestamp + 3600n;
  }

  async function accrueTreasuryRevenue(swapAmount: bigint) {
    const treasuryRevenueBefore = await revenueToken.read.balanceOf([treasury.address]);
    await router.write.swapExactTokensForTokens(
      [swapAmount, 0n, [revenueToken.address, fluxToken.address], traderClient.account.address, await getDeadline()],
      { account: traderClient.account.address }
    );
    return (await revenueToken.read.balanceOf([treasury.address])) - treasuryRevenueBefore;
  }

  async function approveBuybackAndDistributionFlow(revenueAmount: bigint) {
    await approveTreasurySpender(revenueToken.address, buybackExecutor.address, revenueAmount);
    await approveTreasurySpender(fluxToken.address, manager.address, 10_000n * 10n ** 18n);
    await approveTreasurySpender(fluxToken.address, distributor.address, 10_000n * 10n ** 18n);
  }

  async function deployManager(
    treasuryAddress: `0x${string}`,
    rewardTokenAddress: `0x${string}`,
    operatorAddress: `0x${string}`
  ) {
    return viem.deployContract("FluxMultiPoolManager", [
      multisigClient.account.address,
      treasuryAddress,
      operatorAddress,
      rewardTokenAddress,
    ]);
  }

  async function deployBuybackExecutor(
    treasuryAddress: `0x${string}`,
    operatorAddress: `0x${string}`,
    buyTokenAddress: `0x${string}`
  ) {
    return viem.deployContract("FluxBuybackExecutor", [
      multisigClient.account.address,
      treasuryAddress,
      operatorAddress,
      router.address,
      buyTokenAddress,
      treasuryAddress,
    ]);
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

    manager = await deployManager(treasury.address, fluxToken.address, operatorClient.account.address);

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

    buybackExecutor = await deployBuybackExecutor(
      treasury.address,
      operatorClient.account.address,
      fluxToken.address
    );

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

    await fluxToken.write.approve([router.address, maxUint256], {
      account: lpClient.account.address,
    });
    await revenueToken.write.approve([router.address, maxUint256], {
      account: lpClient.account.address,
    });
    await revenueToken.write.approve([router.address, maxUint256], {
      account: traderClient.account.address,
    });

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

  it("should restrict distributor entrypoints to the owner or configured operator and rotate execution rights with setOperator", async function () {
    await approveTreasurySpender(fluxToken.address, manager.address, 1_000n * 10n ** 18n);

    await expectRevert(
      distributor.write.distributeTreasuryRewards([100n * 10n ** 18n], {
        account: otherClient.account.address,
      }),
      "FluxRevenueDistributor: FORBIDDEN"
    );

    await distributor.write.distributeTreasuryRewards([100n * 10n ** 18n], {
      account: operatorClient.account.address,
    });
    strictEqual(await fluxToken.read.balanceOf([manager.address]), 100n * 10n ** 18n);

    await distributor.write.setOperator([otherClient.account.address], {
      account: multisigClient.account.address,
    });
    strictEqual((await distributor.read.operator()).toLowerCase(), otherClient.account.address.toLowerCase());

    await expectRevert(
      distributor.write.distributeTreasuryRewards([1n], {
        account: operatorClient.account.address,
      }),
      "FluxRevenueDistributor: FORBIDDEN"
    );

    await distributor.write.distributeTreasuryRewards([1n], {
      account: otherClient.account.address,
    });
    strictEqual(await fluxToken.read.balanceOf([manager.address]), 100n * 10n ** 18n + 1n);
  });

  it("should apply owner or operator gating to executeBuybackAndDistribute and rotate that execution right with setOperator", async function () {
    const revenueAmount = await accrueTreasuryRevenue(1_000n * 10n ** 18n);

    await approveBuybackAndDistributionFlow(revenueAmount);

    await expectRevert(
      distributor.write.executeBuybackAndDistribute(
        [revenueToken.address, revenueAmount, 1n, [revenueToken.address, fluxToken.address], await getDeadline()],
        { account: traderClient.account.address }
      ),
      "FluxRevenueDistributor: FORBIDDEN"
    );

    await distributor.write.executeBuybackAndDistribute(
      [revenueToken.address, revenueAmount, 1n, [revenueToken.address, fluxToken.address], await getDeadline()],
      { account: operatorClient.account.address }
    );

    ok(await fluxToken.read.balanceOf([manager.address]) > 0n);

    await distributor.write.setOperator([otherClient.account.address], {
      account: multisigClient.account.address,
    });

    const secondRevenueAmount = await accrueTreasuryRevenue(1_000n * 10n ** 18n);
    await approveBuybackAndDistributionFlow(secondRevenueAmount);

    await expectRevert(
      distributor.write.executeBuybackAndDistribute(
        [revenueToken.address, secondRevenueAmount, 1n, [revenueToken.address, fluxToken.address], await getDeadline()],
        { account: operatorClient.account.address }
      ),
      "FluxRevenueDistributor: FORBIDDEN"
    );

    await distributor.write.executeBuybackAndDistribute(
      [revenueToken.address, secondRevenueAmount, 1n, [revenueToken.address, fluxToken.address], await getDeadline()],
      { account: otherClient.account.address }
    );

    ok(await fluxToken.read.balanceOf([manager.address]) > 0n);
  });

  it("should keep governance updates owner-only while allowing aligned manager and executor replacements", async function () {
    const alternateManager = await deployManager(treasury.address, fluxToken.address, distributor.address);
    const alternateExecutor = await deployBuybackExecutor(treasury.address, distributor.address, fluxToken.address);

    await expectRevert(
      distributor.write.setRevenueConfiguration([3000n, 1000n], {
        account: otherClient.account.address,
      }),
      "OwnableUnauthorizedAccount"
    );

    await expectRevert(
      distributor.write.setManager([alternateManager.address], {
        account: otherClient.account.address,
      }),
      "OwnableUnauthorizedAccount"
    );

    await expectRevert(
      distributor.write.setBuybackExecutor([alternateExecutor.address], {
        account: otherClient.account.address,
      }),
      "OwnableUnauthorizedAccount"
    );

    await revenueToken.write.mint([distributor.address, 25n * 10n ** 18n]);
    await expectRevert(
      distributor.write.recoverToken([revenueToken.address, otherClient.account.address, 25n * 10n ** 18n], {
        account: traderClient.account.address,
      }),
      "OwnableUnauthorizedAccount"
    );

    await distributor.write.setRevenueConfiguration([3000n, 1000n], {
      account: multisigClient.account.address,
    });
    strictEqual(await distributor.read.buybackBps(), 3000n);
    strictEqual(await distributor.read.burnBps(), 1000n);

    await distributor.write.setBuybackExecutor([alternateExecutor.address], {
      account: multisigClient.account.address,
    });
    strictEqual(
      (await distributor.read.buybackExecutor()).toLowerCase(),
      alternateExecutor.address.toLowerCase()
    );

    await distributor.write.setManager([alternateManager.address], {
      account: multisigClient.account.address,
    });
    strictEqual((await distributor.read.manager()).toLowerCase(), alternateManager.address.toLowerCase());

    await distributor.write.recoverToken([revenueToken.address, otherClient.account.address, 25n * 10n ** 18n], {
      account: multisigClient.account.address,
    });
    strictEqual(await revenueToken.read.balanceOf([distributor.address]), 0n);
    strictEqual(await revenueToken.read.balanceOf([otherClient.account.address]), 25n * 10n ** 18n);
  });

  it("should enforce the pauser role and block distributor execution while paused", async function () {
    await approveTreasurySpender(fluxToken.address, manager.address, 100n * 10n ** 18n);
    const revenueAmount = await accrueTreasuryRevenue(500n * 10n ** 18n);
    await approveBuybackAndDistributionFlow(revenueAmount);

    await expectRevert(
      distributor.write.pause({ account: otherClient.account.address }),
      "FluxRevenueDistributor: FORBIDDEN"
    );

    await distributor.write.pause({ account: multisigClient.account.address });
    strictEqual(await distributor.read.paused(), true);

    await expectRevert(
      distributor.write.distributeTreasuryRewards([1n], {
        account: operatorClient.account.address,
      }),
      "FluxRevenueDistributor: PAUSED"
    );

    await expectRevert(
      distributor.write.executeBuybackAndDistribute(
        [revenueToken.address, revenueAmount, 1n, [revenueToken.address, fluxToken.address], await getDeadline()],
        { account: operatorClient.account.address }
      ),
      "FluxRevenueDistributor: PAUSED"
    );

    await expectRevert(
      distributor.write.unpause({ account: otherClient.account.address }),
      "FluxRevenueDistributor: FORBIDDEN"
    );

    await distributor.write.unpause({ account: multisigClient.account.address });
    strictEqual(await distributor.read.paused(), false);

    await distributor.write.distributeTreasuryRewards([1n], {
      account: operatorClient.account.address,
    });
    strictEqual(await fluxToken.read.balanceOf([manager.address]), 1n);
  });

  it("should reject direct operator role mutations outside setOperator", async function () {
    const operatorRole = await distributor.read.OPERATOR_ROLE();

    await expectRevert(
      distributor.write.grantRole([operatorRole, otherClient.account.address], {
        account: multisigClient.account.address,
      }),
      "FluxRevenueDistributor: ROLE_MANAGED_BY_SET_OPERATOR"
    );

    await expectRevert(
      distributor.write.revokeRole([operatorRole, operatorClient.account.address], {
        account: multisigClient.account.address,
      }),
      "FluxRevenueDistributor: ROLE_MANAGED_BY_SET_OPERATOR"
    );

    await expectRevert(
      distributor.write.renounceRole([operatorRole, operatorClient.account.address], {
        account: operatorClient.account.address,
      }),
      "FluxRevenueDistributor: ROLE_MANAGED_BY_SET_OPERATOR"
    );
  });

  it("should reject manager replacements whose reward token or treasury pointer diverges", async function () {
    const invalidRewardManager = await deployManager(treasury.address, revenueToken.address, distributor.address);
    const alternateTreasury = await viem.deployContract("FluxSwapTreasury", [
      multisigClient.account.address,
      guardianClient.account.address,
      operatorClient.account.address,
      timelockDelay,
    ]);
    const mismatchedManager = await deployManager(alternateTreasury.address, fluxToken.address, distributor.address);

    await expectRevert(
      distributor.write.setManager([invalidRewardManager.address], {
        account: multisigClient.account.address,
      }),
      "FluxRevenueDistributor: INVALID_REWARD_TOKEN"
    );

    await expectRevert(
      distributor.write.setManager([mismatchedManager.address], {
        account: multisigClient.account.address,
      }),
      "FluxRevenueDistributor: TREASURY_MISMATCH"
    );
  });

  it("should reject buyback executor replacements whose reward token or treasury pointer diverges", async function () {
    const invalidRewardExecutor = await deployBuybackExecutor(
      treasury.address,
      distributor.address,
      revenueToken.address
    );
    const alternateTreasury = await viem.deployContract("FluxSwapTreasury", [
      multisigClient.account.address,
      guardianClient.account.address,
      operatorClient.account.address,
      timelockDelay,
    ]);
    const mismatchedExecutor = await deployBuybackExecutor(
      alternateTreasury.address,
      distributor.address,
      fluxToken.address
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
  });

  it("should migrate admin and pauser governance on ownership transfer and clear overlapping operator authority", async function () {
    const overlappingDistributor = await viem.deployContract("FluxRevenueDistributor", [
      multisigClient.account.address,
      multisigClient.account.address,
      buybackExecutor.address,
      manager.address,
      buybackBps,
      burnBps,
    ]);
    const operatorRole = await overlappingDistributor.read.OPERATOR_ROLE();
    const pauserRole = await overlappingDistributor.read.PAUSER_ROLE();
    const defaultAdminRole = await overlappingDistributor.read.DEFAULT_ADMIN_ROLE();

    await overlappingDistributor.write.transferOwnership([otherClient.account.address], {
      account: multisigClient.account.address,
    });

    strictEqual(await overlappingDistributor.read.operator(), zeroAddress);
    strictEqual(await overlappingDistributor.read.hasRole([operatorRole, multisigClient.account.address]), false);
    strictEqual(await overlappingDistributor.read.hasRole([pauserRole, multisigClient.account.address]), false);
    strictEqual(await overlappingDistributor.read.hasRole([defaultAdminRole, multisigClient.account.address]), false);
    strictEqual(await overlappingDistributor.read.hasRole([pauserRole, otherClient.account.address]), true);
    strictEqual(await overlappingDistributor.read.hasRole([defaultAdminRole, otherClient.account.address]), true);

    await expectRevert(
      overlappingDistributor.write.pause({ account: multisigClient.account.address }),
      "FluxRevenueDistributor: FORBIDDEN"
    );

    await expectRevert(
      overlappingDistributor.write.setOperator([otherClient.account.address], {
        account: multisigClient.account.address,
      }),
      "OwnableUnauthorizedAccount"
    );

    await overlappingDistributor.write.pause({ account: otherClient.account.address });
    strictEqual(await overlappingDistributor.read.paused(), true);
    await overlappingDistributor.write.unpause({ account: otherClient.account.address });
    strictEqual(await overlappingDistributor.read.paused(), false);

    await overlappingDistributor.write.setOperator([otherClient.account.address], {
      account: otherClient.account.address,
    });
    strictEqual((await overlappingDistributor.read.operator()).toLowerCase(), otherClient.account.address.toLowerCase());
  });
});
