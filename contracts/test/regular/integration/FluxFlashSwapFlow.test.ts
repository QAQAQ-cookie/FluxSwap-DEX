import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";
import { encodeAbiParameters } from "viem";

describe("FluxFlashSwapFlow", async function () {
  const hardhatNetwork = await network.connect();
  const { viem, networkHelpers } = hardhatNetwork;
  const publicClient = await viem.getPublicClient();
  const [multisigClient, guardianClient, operatorClient, lpClient, traderClient, recipientClient] =
    await viem.getWalletClients();

  const timelockDelay = 3600n;
  const maxUint256 = (1n << 256n) - 1n;
  const feeBase = 10000n;
  const totalFeeBps = 30n;
  const protocolFeeBps = 5n;

  let treasury: any;
  let factory: any;
  let router: any;
  let WETH: any;
  let tokenA: any;
  let tokenB: any;

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
    await treasury.write.scheduleOperation([operationId, timelockDelay], {
      account: multisigClient.account.address,
    });
    await networkHelpers.time.increase(Number(timelockDelay));
    await execute();
  }

  async function configureTreasuryAllocation(tokenAddress: `0x${string}`, recipient: `0x${string}`, cap: bigint) {
    const allowTokenOp = await treasury.read.hashSetAllowedToken([tokenAddress, true]);
    await scheduleAndExecute(allowTokenOp, () =>
      treasury.write.executeSetAllowedToken([tokenAddress, true, allowTokenOp])
    );

    const allowRecipientOp = await treasury.read.hashSetAllowedRecipient([recipient, true]);
    await scheduleAndExecute(allowRecipientOp, () =>
      treasury.write.executeSetAllowedRecipient([recipient, true, allowRecipientOp])
    );

    const capOp = await treasury.read.hashSetDailySpendCap([tokenAddress, cap]);
    await scheduleAndExecute(capOp, () => treasury.write.executeSetDailySpendCap([tokenAddress, cap, capOp]));
  }

  beforeEach(async function () {
    treasury = await viem.deployContract("FluxSwapTreasury", [
      multisigClient.account.address,
      guardianClient.account.address,
      operatorClient.account.address,
      timelockDelay,
    ]);

    WETH = await viem.deployContract("MockWETH", []);
    factory = await viem.deployContract("FluxSwapFactory", [multisigClient.account.address]);
    router = await viem.deployContract("FluxSwapRouter", [factory.address, WETH.address]);
    tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
    tokenB = await viem.deployContract("MockERC20", ["Token B", "TKNB", 18]);

    await factory.write.setTreasury([treasury.address], {
      account: multisigClient.account.address,
    });

    await tokenA.write.mint([lpClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenB.write.mint([lpClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenA.write.approve([router.address, maxUint256], { account: lpClient.account.address });
    await tokenB.write.approve([router.address, maxUint256], { account: lpClient.account.address });

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
  });

  it("should complete a flash swap with callback repayment, accrue treasury protocol fees, and release them through treasury", async function () {
    const pairAddress = await factory.read.getPair([tokenA.address, tokenB.address]);
    const pair = await viem.getContractAt("FluxSwapPair", pairAddress);
    const flashReceiver = await viem.deployContract("MockFlashSwapReceiver", []);

    const token0Address = String(await pair.read.token0()).toLowerCase();
    const flashToken = token0Address === String(tokenA.address).toLowerCase() ? tokenA : tokenB;
    const [reserve0Before, reserve1Before] = await pair.read.getReserves();

    const amountOut = 100n * 10n ** 18n;
    const repayAmount = (amountOut * feeBase) / (feeBase - totalFeeBps) + 1n;
    const protocolFee = (repayAmount * protocolFeeBps) / feeBase;
    const expectedReserve0After = reserve0Before - amountOut + repayAmount - protocolFee;
    const data = encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [flashToken.address, repayAmount]);

    await flashToken.write.mint([flashReceiver.address, repayAmount]);

    const treasuryBefore = await flashToken.read.balanceOf([treasury.address]);

    await pair.write.swap([amountOut, 0n, flashReceiver.address, data], {
      account: traderClient.account.address,
    });

    strictEqual((await flashToken.read.balanceOf([treasury.address])) - treasuryBefore, protocolFee);
    strictEqual(await flashToken.read.balanceOf([flashReceiver.address]), amountOut);
    strictEqual((await pair.read.getReserves())[0], expectedReserve0After);
    strictEqual((await pair.read.getReserves())[1], reserve1Before);

    await configureTreasuryAllocation(flashToken.address, recipientClient.account.address, protocolFee);
    const recipientBefore = await flashToken.read.balanceOf([recipientClient.account.address]);

    await treasury.write.allocate([flashToken.address, recipientClient.account.address, protocolFee], {
      account: operatorClient.account.address,
    });

    strictEqual((await flashToken.read.balanceOf([recipientClient.account.address])) - recipientBefore, protocolFee);
    strictEqual(await flashToken.read.balanceOf([treasury.address]), 0n);
  });

  it("should revert a flash swap when the callback only returns the principal without the fee", async function () {
    const pairAddress = await factory.read.getPair([tokenA.address, tokenB.address]);
    const pair = await viem.getContractAt("FluxSwapPair", pairAddress);
    const partialReceiver = await viem.deployContract("MockPartialFlashSwapReceiver", []);

    await expectRevert(
      pair.write.swap([100n * 10n ** 18n, 0n, partialReceiver.address, "0x01"], {
        account: traderClient.account.address,
      }),
      "FluxSwap: K"
    );
  });
});
