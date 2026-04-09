import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

/*
 * 单元目标：
 * 1. 验证 LP pair 必须来自目标 factory。
 * 2. 验证构造参数合法性与 LP pair 元信息暴露。
 * 3. 验证用户质押 LP 后能够从 treasury 奖励源获得 FLUX 奖励并正常退出。
 */
describe("FluxSwapLPStakingPool", async function () {
  const hardhatNetwork = await network.connect();
  const { viem, networkHelpers } = hardhatNetwork;
  const publicClient = await viem.getPublicClient();
  const [multisigClient, guardianClient, operatorClient, lpClient, stakerClient] = await viem.getWalletClients();

  const timelockDelay = 3600n;
  const initialSupply = 10_000_000n * 10n ** 18n;
  const cap = 100_000_000n * 10n ** 18n;

  let treasury: any;
  let fluxToken: any;
  let tokenA: any;
  let tokenB: any;
  let factory: any;
  let router: any;
  let WETH: any;
  let pair: any;
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

    tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
    tokenB = await viem.deployContract("MockERC20", ["Token B", "TKNB", 18]);
    WETH = await viem.deployContract("MockWETH", []);
    factory = await viem.deployContract("FluxSwapFactory", [multisigClient.account.address]);
    router = await viem.deployContract("FluxSwapRouter", [factory.address, WETH.address]);

    await tokenA.write.mint([lpClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenB.write.mint([lpClient.account.address, 1_000_000n * 10n ** 18n]);

    await tokenA.write.approve([router.address, 1_000_000n * 10n ** 18n], { account: lpClient.account.address });
    await tokenB.write.approve([router.address, 1_000_000n * 10n ** 18n], { account: lpClient.account.address });

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

    pool = await viem.deployContract("FluxSwapLPStakingPool", [
      multisigClient.account.address,
      factory.address,
      pair.address,
      fluxToken.address,
      treasury.address,
      operatorClient.account.address,
    ]);
  });

  it("should validate the lp pair against factory", async function () {
    const otherFactory = await viem.deployContract("FluxSwapFactory", [multisigClient.account.address]);
    const tokenC = await viem.deployContract("MockERC20", ["Token C", "TKNC", 18]);
    const tokenD = await viem.deployContract("MockERC20", ["Token D", "TKND", 18]);

    await otherFactory.write.createPair([tokenC.address, tokenD.address]);
    const otherPairAddress = await otherFactory.read.getPair([tokenC.address, tokenD.address]);

    await expectRevert(
      viem.deployContract("FluxSwapLPStakingPool", [
        multisigClient.account.address,
        factory.address,
        otherPairAddress,
        fluxToken.address,
        treasury.address,
        operatorClient.account.address,
      ]),
      "FluxSwapLPStakingPool: INVALID_FACTORY"
    );
  });

  it("should validate constructor addresses", async function () {
    await expectRevert(
      viem.deployContract("FluxSwapLPStakingPool", [
        multisigClient.account.address,
        "0x0000000000000000000000000000000000000000",
        pair.address,
        fluxToken.address,
        treasury.address,
        operatorClient.account.address,
      ]),
      "FluxSwapLPStakingPool: ZERO_ADDRESS"
    );

    await expectRevert(
      viem.deployContract("FluxSwapLPStakingPool", [
        multisigClient.account.address,
        factory.address,
        "0x0000000000000000000000000000000000000000",
        fluxToken.address,
        treasury.address,
        operatorClient.account.address,
      ]),
      "FluxSwapStakingRewards: ZERO_ADDRESS"
    );

    await expectRevert(
      viem.deployContract("FluxSwapLPStakingPool", [
        multisigClient.account.address,
        factory.address,
        pair.address,
        "0x0000000000000000000000000000000000000000",
        treasury.address,
        operatorClient.account.address,
      ]),
      "FluxSwapStakingRewards: ZERO_ADDRESS"
    );

    await expectRevert(
      viem.deployContract("FluxSwapLPStakingPool", [
        multisigClient.account.address,
        factory.address,
        pair.address,
        fluxToken.address,
        "0x0000000000000000000000000000000000000000",
        operatorClient.account.address,
      ]),
      "FluxSwapStakingRewards: ZERO_ADDRESS"
    );

    await expectRevert(
      viem.deployContract("FluxSwapLPStakingPool", [
        multisigClient.account.address,
        factory.address,
        pair.address,
        fluxToken.address,
        treasury.address,
        "0x0000000000000000000000000000000000000000",
      ]),
      "FluxSwapStakingRewards: ZERO_ADDRESS"
    );
  });

  it("should expose immutable LP pair metadata", async function () {
    strictEqual((await pool.read.factory()).toLowerCase(), factory.address.toLowerCase());
    strictEqual((await pool.read.lpToken()).toLowerCase(), pair.address.toLowerCase());
    strictEqual((await pool.read.token0()).toLowerCase(), (await pair.read.token0()).toLowerCase());
    strictEqual((await pool.read.token1()).toLowerCase(), (await pair.read.token1()).toLowerCase());
  });

  it("should stake LP tokens and earn FLUX rewards from treasury", async function () {
    const lpStakeAmount = 100n * 10n ** 18n;
    const rewardAmount = 700n * 10n ** 18n;

    await approveTreasurySpender(fluxToken.address, pool.address, rewardAmount);

    await pair.write.transfer([stakerClient.account.address, lpStakeAmount], {
      account: lpClient.account.address,
    });
    await pair.write.approve([pool.address, lpStakeAmount], {
      account: stakerClient.account.address,
    });

    const lpBalanceBefore = await pair.read.balanceOf([stakerClient.account.address]);

    await pool.write.stake([lpStakeAmount], {
      account: stakerClient.account.address,
    });
    await pool.write.notifyRewardAmount([rewardAmount], {
      account: operatorClient.account.address,
    });

    await pool.write.exit({ account: stakerClient.account.address });

    strictEqual(await pair.read.balanceOf([stakerClient.account.address]), lpBalanceBefore);
    ok(await fluxToken.read.balanceOf([stakerClient.account.address]) > 0n, "staker should receive FLUX rewards");
    strictEqual(await pool.read.totalStaked(), 0n);
    strictEqual(await pair.read.balanceOf([pool.address]), 0n);
  });
});
