import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

describe("FluxRevenueDistributor", async function () {
  const hardhatNetwork = await network.connect();
  const { viem, networkHelpers } = hardhatNetwork;
  const publicClient = await viem.getPublicClient();
  const [multisigClient, guardianClient, operatorClient, lpClient, traderClient, stakerClient] =
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
  let stakingPool: any;
  let manager: any;
  let buybackExecutor: any;
  let revenueDistributor: any;

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

  async function configureTreasuryForFluxRecipient(recipient: `0x${string}`, spendCap: bigint) {
    const allowTokenOp = await treasury.read.hashSetAllowedToken([fluxToken.address, true]);
    await scheduleAndExecute(allowTokenOp, () =>
      treasury.write.executeSetAllowedToken([fluxToken.address, true, allowTokenOp])
    );

    const allowRecipientOp = await treasury.read.hashSetAllowedRecipient([recipient, true]);
    await scheduleAndExecute(allowRecipientOp, () =>
      treasury.write.executeSetAllowedRecipient([recipient, true, allowRecipientOp])
    );

    const capOp = await treasury.read.hashSetDailySpendCap([fluxToken.address, spendCap]);
    await scheduleAndExecute(capOp, () =>
      treasury.write.executeSetDailySpendCap([fluxToken.address, spendCap, capOp])
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

    revenueDistributor = await viem.deployContract("FluxRevenueDistributor", [
      multisigClient.account.address,
      operatorClient.account.address,
      buybackExecutor.address,
      manager.address,
      buybackBps,
      burnBps,
    ]);

    await buybackExecutor.write.setOperator([revenueDistributor.address], {
      account: multisigClient.account.address,
    });
    await manager.write.setOperator([revenueDistributor.address], {
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

  it("should convert treasury swap fees into staking rewards through the formal revenue flow", async function () {
    const userFunding = 1_000n * 10n ** 18n;
    const stakeAmount = 100n * 10n ** 18n;
    const swapAmount = 1_000n * 10n ** 18n;
    const protocolFee = (swapAmount * 5n) / 10000n;
    const buybackAmountIn = (protocolFee * buybackBps) / 10000n;

    await configureTreasuryForFluxRecipient(stakerClient.account.address, 5_000n * 10n ** 18n);
    await treasury.write.allocate([fluxToken.address, stakerClient.account.address, userFunding], {
      account: operatorClient.account.address,
    });

    await fluxToken.write.approve([stakingPool.address, userFunding], {
      account: stakerClient.account.address,
    });
    await stakingPool.write.stake([stakeAmount], {
      account: stakerClient.account.address,
    });

    await router.write.swapExactTokensForTokens([
      swapAmount,
      0n,
      [revenueToken.address, fluxToken.address],
      traderClient.account.address,
      await getDeadline(),
    ], { account: traderClient.account.address });

    strictEqual(await revenueToken.read.balanceOf([treasury.address]), protocolFee);

    await approveTreasurySpender(revenueToken.address, buybackExecutor.address, protocolFee);
    await approveTreasurySpender(fluxToken.address, manager.address, 10_000n * 10n ** 18n);
    await approveTreasurySpender(fluxToken.address, revenueDistributor.address, 10_000n * 10n ** 18n);

    const expectedOut = (await router.read.getAmountsOut([buybackAmountIn, [revenueToken.address, fluxToken.address]]))[1];
    const burnedAmount = (expectedOut * burnBps) / 10000n;
    const distributedAmount = expectedOut - burnedAmount;
    const totalSupplyBefore = await fluxToken.read.totalSupply();

    await revenueDistributor.write.executeBuybackAndDistribute(
      [revenueToken.address, protocolFee, expectedOut, [revenueToken.address, fluxToken.address], await getDeadline()],
      { account: operatorClient.account.address }
    );

    strictEqual(await revenueToken.read.balanceOf([treasury.address]), protocolFee - buybackAmountIn);
    strictEqual(await fluxToken.read.totalSupply(), totalSupplyBefore - burnedAmount);
    strictEqual(await fluxToken.read.balanceOf([manager.address]), distributedAmount);

    await stakingPool.write.syncRewards();
    strictEqual(await stakingPool.read.earned([stakerClient.account.address]), distributedAmount);

    await stakingPool.write.exit({ account: stakerClient.account.address });

    strictEqual(await fluxToken.read.balanceOf([manager.address]), 0n);
    strictEqual(await fluxToken.read.balanceOf([stakingPool.address]), 0n);
    strictEqual(await fluxToken.read.balanceOf([stakerClient.account.address]), userFunding + distributedAmount);
  });

  it("should allow direct treasury FLUX distribution without a buyback step", async function () {
    const rewardAmount = 500n * 10n ** 18n;

    await approveTreasurySpender(fluxToken.address, manager.address, rewardAmount);
    await revenueDistributor.write.distributeTreasuryRewards([rewardAmount], {
      account: operatorClient.account.address,
    });

    strictEqual(await fluxToken.read.balanceOf([manager.address]), rewardAmount);
    strictEqual(await manager.read.pendingPoolRewards([stakingPool.address]), rewardAmount);
  });

  it("should block distributor execution while paused", async function () {
    await revenueDistributor.write.pause({ account: multisigClient.account.address });

    await expectRevert(
      revenueDistributor.write.distributeTreasuryRewards([1n], {
        account: operatorClient.account.address,
      }),
      "FluxRevenueDistributor: PAUSED"
    );
  });

  it("should expose the configured buyback and burn ratios", async function () {
    strictEqual(await revenueDistributor.read.buybackBps(), buybackBps);
    strictEqual(await revenueDistributor.read.burnBps(), burnBps);
  });
});
