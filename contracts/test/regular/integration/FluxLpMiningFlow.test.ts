import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

describe("FluxLpMiningFlow", async function () {
  const hardhatNetwork = await network.connect();
  const { viem, networkHelpers } = hardhatNetwork;
  const publicClient = await viem.getPublicClient();
  const [multisigClient, guardianClient, operatorClient, lpClient] = await viem.getWalletClients();

  const timelockDelay = 3600n;
  const initialSupply = 10_000_000n * 10n ** 18n;
  const cap = 100_000_000n * 10n ** 18n;

  let treasury: any;
  let fluxToken: any;
  let manager: any;
  let dexFactory: any;
  let router: any;
  let WETH: any;
  let poolFactory: any;
  let tokenA: any;
  let tokenB: any;

  async function getDeadline() {
    return (await publicClient.getBlock()).timestamp + 3600n;
  }

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

    WETH = await viem.deployContract("MockWETH", []);
    dexFactory = await viem.deployContract("FluxSwapFactory", [multisigClient.account.address]);
    router = await viem.deployContract("FluxSwapRouter", [dexFactory.address, WETH.address]);

    poolFactory = await viem.deployContract("FluxPoolFactory", [
      multisigClient.account.address,
      manager.address,
      dexFactory.address,
      fluxToken.address,
    ]);

    await manager.write.setPoolFactory([poolFactory.address], {
      account: multisigClient.account.address,
    });

    tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
    tokenB = await viem.deployContract("MockERC20", ["Token B", "TKNB", 18]);

    await tokenA.write.mint([lpClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenB.write.mint([lpClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenA.write.approve([router.address, 1_000_000n * 10n ** 18n], { account: lpClient.account.address });
    await tokenB.write.approve([router.address, 1_000_000n * 10n ** 18n], { account: lpClient.account.address });
  });

  it("should convert a live LP position into a managed mining position and let the LP exit with rewards plus LP principal", async function () {
    const rewardAmount = 750n * 10n ** 18n;

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
    const pair = await viem.getContractAt("FluxSwapPair", pairAddress);
    const lpBalance = await pair.read.balanceOf([lpClient.account.address]);

    ok(lpBalance > 0n, "liquidity provider should receive LP tokens");

    await poolFactory.write.createLPPool([pair.address, 100n, true], {
      account: multisigClient.account.address,
    });

    const poolAddress = await poolFactory.read.lpTokenPools([pair.address]);
    const poolInfo = await manager.read.pools([0n]);
    const pool = await viem.getContractAt("FluxSwapLPStakingPool", poolAddress);

    strictEqual(await poolFactory.read.managedPools([poolAddress]), true);
    strictEqual((await poolFactory.read.managedPoolStakingAsset([poolAddress])).toLowerCase(), pair.address.toLowerCase());
    strictEqual(await poolFactory.read.managedPoolIsLP([poolAddress]), true);
    strictEqual(poolInfo[0].toLowerCase(), poolAddress.toLowerCase());
    strictEqual(poolInfo[1], 100n);
    strictEqual(poolInfo[2], true);
    strictEqual((await pool.read.lpToken()).toLowerCase(), pair.address.toLowerCase());
    strictEqual((await pool.read.factory()).toLowerCase(), dexFactory.address.toLowerCase());
    strictEqual((await pool.read.rewardSource()).toLowerCase(), manager.address.toLowerCase());
    strictEqual((await pool.read.rewardNotifier()).toLowerCase(), pool.address.toLowerCase());

    await approveTreasurySpender(manager.address, rewardAmount);

    await pair.write.approve([pool.address, lpBalance], {
      account: lpClient.account.address,
    });
    await pool.write.stake([lpBalance], {
      account: lpClient.account.address,
    });

    strictEqual(await pool.read.totalStaked(), lpBalance);
    strictEqual(await pair.read.balanceOf([pool.address]), lpBalance);

    await manager.write.distributeRewards([rewardAmount], {
      account: operatorClient.account.address,
    });

    strictEqual(await fluxToken.read.balanceOf([manager.address]), rewardAmount);
    strictEqual(await manager.read.pendingPoolRewards([pool.address]), rewardAmount);

    await pool.write.syncRewards();

    const earnedReward = await pool.read.earned([lpClient.account.address]);
    const queuedDust = await pool.read.queuedRewards();

    strictEqual(await manager.read.pendingPoolRewards([pool.address]), 0n);
    strictEqual(await fluxToken.read.balanceOf([manager.address]), 0n);
    strictEqual(earnedReward + queuedDust, rewardAmount);

    const lpBalanceBeforeExit = await pair.read.balanceOf([lpClient.account.address]);
    const fluxBalanceBeforeExit = await fluxToken.read.balanceOf([lpClient.account.address]);
    const treasuryBalanceBeforeDustRecovery = await fluxToken.read.balanceOf([treasury.address]);

    await pool.write.exit({
      account: lpClient.account.address,
    });

    strictEqual((await pair.read.balanceOf([lpClient.account.address])) - lpBalanceBeforeExit, lpBalance);
    strictEqual((await fluxToken.read.balanceOf([lpClient.account.address])) - fluxBalanceBeforeExit, earnedReward);
    strictEqual(await pool.read.totalStaked(), 0n);
    strictEqual(await pair.read.balanceOf([pool.address]), 0n);
    strictEqual(await fluxToken.read.balanceOf([pool.address]), queuedDust);

    await poolFactory.write.recoverManagedPoolUnallocatedRewards([pool.address, treasury.address], {
      account: multisigClient.account.address,
    });

    strictEqual((await fluxToken.read.balanceOf([treasury.address])) - treasuryBalanceBeforeDustRecovery, queuedDust);
    strictEqual(await pool.read.queuedRewards(), 0n);
    strictEqual(await fluxToken.read.balanceOf([pool.address]), 0n);
  });
});
