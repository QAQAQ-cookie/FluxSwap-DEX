import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

describe("FluxBuybackExecutor", async function () {
  const hardhatNetwork = await network.connect();
  const { viem, networkHelpers } = hardhatNetwork;
  const publicClient = await viem.getPublicClient();
  const [multisigClient, guardianClient, operatorClient, lpClient, stakerClient, otherClient] =
    await viem.getWalletClients();

  const timelockDelay = 3600n;
  const initialSupply = 10_000_000n * 10n ** 18n;
  const cap = 100_000_000n * 10n ** 18n;
  const maxUint256 = (1n << 256n) - 1n;

  let treasury: any;
  let fluxToken: any;
  let revenueToken: any;
  let WETH: any;
  let factory: any;
  let router: any;
  let stakingRewards: any;
  let buybackExecutor: any;

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

  async function configureTreasuryForFlux(spendingCap: bigint) {
    const allowTokenOp = await treasury.read.hashSetAllowedToken([fluxToken.address, true]);
    await scheduleAndExecute(allowTokenOp, () =>
      treasury.write.executeSetAllowedToken([fluxToken.address, true, allowTokenOp])
    );

    const allowRecipientOp = await treasury.read.hashSetAllowedRecipient([stakerClient.account.address, true]);
    await scheduleAndExecute(allowRecipientOp, () =>
      treasury.write.executeSetAllowedRecipient([stakerClient.account.address, true, allowRecipientOp])
    );

    const capOp = await treasury.read.hashSetDailySpendCap([fluxToken.address, spendingCap]);
    await scheduleAndExecute(capOp, () =>
      treasury.write.executeSetDailySpendCap([fluxToken.address, spendingCap, capOp])
    );
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

    stakingRewards = await viem.deployContract("FluxSwapStakingRewards", [
      multisigClient.account.address,
      fluxToken.address,
      fluxToken.address,
      treasury.address,
      operatorClient.account.address,
    ]);

    buybackExecutor = await viem.deployContract("FluxBuybackExecutor", [
      multisigClient.account.address,
      treasury.address,
      operatorClient.account.address,
      router.address,
      fluxToken.address,
      treasury.address,
    ]);

    await fluxToken.write.mint([lpClient.account.address, 200_000n * 10n ** 18n], {
      account: multisigClient.account.address,
    });
    await revenueToken.write.mint([lpClient.account.address, 200_000n * 10n ** 18n]);
    await revenueToken.write.mint([treasury.address, 10_000n * 10n ** 18n]);

    await fluxToken.write.approve([router.address, maxUint256], {
      account: lpClient.account.address,
    });
    await revenueToken.write.approve([router.address, maxUint256], {
      account: lpClient.account.address,
    });

    await router.write.addLiquidity([
      fluxToken.address,
      revenueToken.address,
      100_000n * 10n ** 18n,
      100_000n * 10n ** 18n,
      0n,
      0n,
      lpClient.account.address,
      await getDeadline(),
    ], { account: lpClient.account.address });
  });

  it("should pull treasury revenue token and buy back FLUX to treasury", async function () {
    const amountIn = 1_000n * 10n ** 18n;
    const expectedOut = (await router.read.getAmountsOut([amountIn, [revenueToken.address, fluxToken.address]]))[1];

    await approveTreasurySpender(revenueToken.address, buybackExecutor.address, amountIn);

    const treasuryRevenueBefore = await revenueToken.read.balanceOf([treasury.address]);
    const treasuryFluxBefore = await fluxToken.read.balanceOf([treasury.address]);

    await buybackExecutor.write.executeBuyback(
      [revenueToken.address, amountIn, expectedOut, [revenueToken.address, fluxToken.address], treasury.address, await getDeadline()],
      { account: operatorClient.account.address }
    );

    strictEqual(await revenueToken.read.balanceOf([treasury.address]), treasuryRevenueBefore - amountIn);
    strictEqual(await fluxToken.read.balanceOf([treasury.address]), treasuryFluxBefore + expectedOut);
  });

  it("should route bought-back FLUX into treasury-funded staking rewards", async function () {
    const buybackAmountIn = 1_000n * 10n ** 18n;
    const userFunding = 1_000n * 10n ** 18n;
    const stakeAmount = 100n * 10n ** 18n;
    const buybackOut = (await router.read.getAmountsOut([buybackAmountIn, [revenueToken.address, fluxToken.address]]))[1];

    await configureTreasuryForFlux(5_000n * 10n ** 18n);
    await approveTreasurySpender(revenueToken.address, buybackExecutor.address, buybackAmountIn);

    await buybackExecutor.write.executeBuyback(
      [revenueToken.address, buybackAmountIn, buybackOut, [revenueToken.address, fluxToken.address], treasury.address, await getDeadline()],
      { account: operatorClient.account.address }
    );

    await treasury.write.allocate([fluxToken.address, stakerClient.account.address, userFunding], {
      account: operatorClient.account.address,
    });

    await fluxToken.write.approve([stakingRewards.address, userFunding], {
      account: stakerClient.account.address,
    });
    await stakingRewards.write.stake([stakeAmount], {
      account: stakerClient.account.address,
    });

    await approveTreasurySpender(fluxToken.address, stakingRewards.address, buybackOut);
    await stakingRewards.write.notifyRewardAmount([buybackOut], {
      account: operatorClient.account.address,
    });

    await stakingRewards.write.exit({ account: stakerClient.account.address });
    const remainingRewardReserve = await stakingRewards.read.rewardReserve();
    const stakingRewardsBalance = await fluxToken.read.balanceOf([stakingRewards.address]);
    const stakerFinalBalance = await fluxToken.read.balanceOf([stakerClient.account.address]);

    strictEqual(remainingRewardReserve, stakingRewardsBalance);
    strictEqual(stakerFinalBalance + stakingRewardsBalance, userFunding + buybackOut);
  });

  it("should block unauthorized or paused buyback execution", async function () {
    const amountIn = 100n * 10n ** 18n;
    await approveTreasurySpender(revenueToken.address, buybackExecutor.address, amountIn);

    await expectRevert(
      buybackExecutor.write.executeBuyback(
        [revenueToken.address, amountIn, 0n, [revenueToken.address, fluxToken.address], treasury.address, await getDeadline()],
        { account: otherClient.account.address }
      ),
      "FluxBuybackExecutor: FORBIDDEN"
    );

    await buybackExecutor.write.pause({ account: multisigClient.account.address });

    await expectRevert(
      buybackExecutor.write.executeBuyback(
        [revenueToken.address, amountIn, 0n, [revenueToken.address, fluxToken.address], treasury.address, await getDeadline()],
        { account: operatorClient.account.address }
      ),
      "FluxBuybackExecutor: PAUSED"
    );
  });

  it("should reject buyback recipients outside treasury", async function () {
    const amountIn = 100n * 10n ** 18n;
    await approveTreasurySpender(revenueToken.address, buybackExecutor.address, amountIn);

    await expectRevert(
      buybackExecutor.write.executeBuyback(
        [
          revenueToken.address,
          amountIn,
          0n,
          [revenueToken.address, fluxToken.address],
          stakerClient.account.address,
          await getDeadline(),
        ],
        { account: operatorClient.account.address }
      ),
      "InvalidRecipient"
    );
  });

  it("should block buyback execution when treasury is paused", async function () {
    const amountIn = 100n * 10n ** 18n;
    await approveTreasurySpender(revenueToken.address, buybackExecutor.address, amountIn);

    await treasury.write.pause({ account: guardianClient.account.address });

    await expectRevert(
      buybackExecutor.write.executeBuyback(
        [revenueToken.address, amountIn, 0n, [revenueToken.address, fluxToken.address], treasury.address, await getDeadline()],
        { account: operatorClient.account.address }
      ),
      "FluxBuybackExecutor: TREASURY_PAUSED"
    );
  });

  it("should reject direct operator role grants outside setOperator", async function () {
    const operatorRole = await buybackExecutor.read.OPERATOR_ROLE();

    await expectRevert(
      buybackExecutor.write.grantRole([operatorRole, otherClient.account.address], {
        account: multisigClient.account.address,
      }),
      "FluxBuybackExecutor: ROLE_MANAGED_BY_SET_OPERATOR"
    );
  });

  it("should allow the updated operator to execute buyback", async function () {
    const amountIn = 100n * 10n ** 18n;
    const expectedOut = (await router.read.getAmountsOut([amountIn, [revenueToken.address, fluxToken.address]]))[1];

    await approveTreasurySpender(revenueToken.address, buybackExecutor.address, amountIn);
    await buybackExecutor.write.setOperator([otherClient.account.address], {
      account: multisigClient.account.address,
    });

    await buybackExecutor.write.executeBuyback(
      [revenueToken.address, amountIn, expectedOut, [revenueToken.address, fluxToken.address], treasury.address, await getDeadline()],
      { account: otherClient.account.address }
    );

    strictEqual(await fluxToken.read.balanceOf([treasury.address]) > 0n, true);
  });

  it("should reject setting the same operator again", async function () {
    await expectRevert(
      buybackExecutor.write.setOperator([operatorClient.account.address], {
        account: multisigClient.account.address,
      }),
      "FluxBuybackExecutor: SAME_OPERATOR"
    );
  });

  it("should revoke operator execution when owner and operator overlap across ownership transfer", async function () {
    const overlappingExecutor = await viem.deployContract("FluxBuybackExecutor", [
      multisigClient.account.address,
      treasury.address,
      multisigClient.account.address,
      router.address,
      fluxToken.address,
      treasury.address,
    ]);
    const operatorRole = await overlappingExecutor.read.OPERATOR_ROLE();

    await overlappingExecutor.write.transferOwnership([otherClient.account.address], {
      account: multisigClient.account.address,
    });

    strictEqual(await overlappingExecutor.read.operator(), "0x0000000000000000000000000000000000000000");
    strictEqual(await overlappingExecutor.read.hasRole([operatorRole, multisigClient.account.address]), false);
  });
});
