import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

describe("FluxPausePropagationFlow", async function () {
  const hardhatNetwork = await network.connect();
  const { viem, networkHelpers } = hardhatNetwork;
  const publicClient = await viem.getPublicClient();
  const [multisigClient, guardianClient, operatorClient, lpClient, traderClient] = await viem.getWalletClients();

  const timelockDelay = 3600n;
  const initialSupply = 10_000_000n * 10n ** 18n;
  const cap = 100_000_000n * 10n ** 18n;
  const maxUint256 = (1n << 256n) - 1n;
  const buybackBps = 2500n;
  const burnBps = 2000n;

  let treasury: any;
  let fluxToken: any;
  let revenueToken: any;
  let stakeToken: any;
  let WETH: any;
  let factory: any;
  let router: any;
  let manager: any;
  let managerPool: any;
  let directPool: any;
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
    await treasury.write.scheduleOperation([operationId, timelockDelay], {
      account: multisigClient.account.address,
    });
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
    stakeToken = await viem.deployContract("MockERC20", ["Stake Token", "STK", 18]);
    WETH = await viem.deployContract("MockWETH", []);
    factory = await viem.deployContract("FluxSwapFactory", [multisigClient.account.address]);
    router = await viem.deployContract("FluxSwapRouter", [factory.address, WETH.address]);

    manager = await viem.deployContract("FluxMultiPoolManager", [
      multisigClient.account.address,
      treasury.address,
      operatorClient.account.address,
      fluxToken.address,
    ]);

    managerPool = await viem.deployContract("FluxSwapStakingRewards", [
      multisigClient.account.address,
      fluxToken.address,
      fluxToken.address,
      manager.address,
      manager.address,
    ]);
    await managerPool.write.setRewardConfiguration([manager.address, managerPool.address], {
      account: multisigClient.account.address,
    });
    await manager.write.addPool([managerPool.address, 100n, true], {
      account: multisigClient.account.address,
    });

    directPool = await viem.deployContract("FluxSwapStakingRewards", [
      multisigClient.account.address,
      stakeToken.address,
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
    await revenueToken.write.mint([treasury.address, 5_000n * 10n ** 18n]);

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

  it("should propagate a treasury pause through direct rewards, manager rewards, and revenue buybacks", async function () {
    const rewardAmount = 500n * 10n ** 18n;
    const revenueAmount = 1_000n * 10n ** 18n;

    await approveTreasurySpender(fluxToken.address, directPool.address, rewardAmount);
    await approveTreasurySpender(fluxToken.address, manager.address, rewardAmount);
    await approveTreasurySpender(revenueToken.address, buybackExecutor.address, revenueAmount);

    await treasury.write.pause({
      account: guardianClient.account.address,
    });

    await expectRevert(
      directPool.write.notifyRewardAmount([rewardAmount], {
        account: operatorClient.account.address,
      }),
      "FluxSwapStakingRewards: REWARD_SOURCE_PAUSED"
    );

    await expectRevert(
      manager.write.distributeRewards([rewardAmount], {
        account: multisigClient.account.address,
      }),
      "FluxMultiPoolManager: TREASURY_PAUSED"
    );

    await expectRevert(
      distributor.write.distributeTreasuryRewards([rewardAmount], {
        account: operatorClient.account.address,
      }),
      "FluxMultiPoolManager: TREASURY_PAUSED"
    );

    await expectRevert(
      distributor.write.executeBuybackAndDistribute(
        [revenueToken.address, revenueAmount, 1n, [revenueToken.address, fluxToken.address], await getDeadline()],
        { account: operatorClient.account.address }
      ),
      "FluxBuybackExecutor: TREASURY_PAUSED"
    );
  });

  it("should block flows when local pause switches are enabled and resume once unpaused", async function () {
    const rewardAmount = 400n * 10n ** 18n;
    const revenueAmount = 800n * 10n ** 18n;

    await approveTreasurySpender(fluxToken.address, manager.address, rewardAmount);
    await approveTreasurySpender(revenueToken.address, buybackExecutor.address, revenueAmount);

    await distributor.write.pause({
      account: multisigClient.account.address,
    });

    await expectRevert(
      distributor.write.distributeTreasuryRewards([rewardAmount], {
        account: operatorClient.account.address,
      }),
      "FluxRevenueDistributor: PAUSED"
    );

    await distributor.write.unpause({
      account: multisigClient.account.address,
    });

    await manager.write.pause({
      account: multisigClient.account.address,
    });

    await expectRevert(
      distributor.write.distributeTreasuryRewards([rewardAmount], {
        account: operatorClient.account.address,
      }),
      "FluxMultiPoolManager: PAUSED"
    );

    await manager.write.unpause({
      account: multisigClient.account.address,
    });

    await buybackExecutor.write.pause({
      account: multisigClient.account.address,
    });

    await expectRevert(
      distributor.write.executeBuybackAndDistribute(
        [revenueToken.address, revenueAmount, 1n, [revenueToken.address, fluxToken.address], await getDeadline()],
        { account: operatorClient.account.address }
      ),
      "FluxBuybackExecutor: PAUSED"
    );

    await buybackExecutor.write.unpause({
      account: multisigClient.account.address,
    });

    await distributor.write.distributeTreasuryRewards([rewardAmount], {
      account: operatorClient.account.address,
    });

    strictEqual(await fluxToken.read.balanceOf([manager.address]), rewardAmount);
    strictEqual(await manager.read.pendingPoolRewards([managerPool.address]), rewardAmount);
    strictEqual(await distributor.read.paused(), false);
    strictEqual(await manager.read.paused(), false);
    strictEqual(await buybackExecutor.read.paused(), false);
  });
});
