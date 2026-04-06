import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

describe("FluxExactOutputRoutingFlow", async function () {
  const hardhatNetwork = await network.connect();
  const { viem, networkHelpers } = hardhatNetwork;
  const publicClient = await viem.getPublicClient();
  const [multisigClient, guardianClient, operatorClient, lpClient, traderClient, recipientClient] =
    await viem.getWalletClients();

  const timelockDelay = 3600n;
  const maxUint256 = (1n << 256n) - 1n;
  const protocolFeeBps = 5n;
  const feeBase = 10000n;

  let treasury: any;
  let factory: any;
  let router: any;
  let WETH: any;
  let tokenA: any;
  let tokenB: any;
  let tokenC: any;

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
    tokenC = await viem.deployContract("MockERC20", ["Token C", "TKNC", 18]);

    await factory.write.setTreasury([treasury.address], {
      account: multisigClient.account.address,
    });

    await tokenA.write.mint([lpClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenB.write.mint([lpClient.account.address, 2_000_000n * 10n ** 18n]);
    await tokenC.write.mint([lpClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenA.write.mint([traderClient.account.address, 1_000_000n * 10n ** 18n]);

    await tokenA.write.approve([router.address, maxUint256], { account: lpClient.account.address });
    await tokenB.write.approve([router.address, maxUint256], { account: lpClient.account.address });
    await tokenC.write.approve([router.address, maxUint256], { account: lpClient.account.address });
    await tokenA.write.approve([router.address, maxUint256], { account: traderClient.account.address });

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

    await router.write.addLiquidity(
      [
        tokenB.address,
        tokenC.address,
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

  it("should fulfill an exact-output multi-hop swap and route protocol fees for both hop inputs into treasury", async function () {
    const desiredOutput = 75n * 10n ** 18n;
    const path = [tokenA.address, tokenB.address, tokenC.address];
    const amounts = await router.read.getAmountsIn([desiredOutput, path]);
    const tokenAFee = (amounts[0] * protocolFeeBps) / feeBase;
    const tokenBFee = (amounts[1] * protocolFeeBps) / feeBase;

    const traderTokenABefore = await tokenA.read.balanceOf([traderClient.account.address]);
    const recipientTokenCBefore = await tokenC.read.balanceOf([recipientClient.account.address]);
    const treasuryTokenABefore = await tokenA.read.balanceOf([treasury.address]);
    const treasuryTokenBBefore = await tokenB.read.balanceOf([treasury.address]);

    await router.write.swapTokensForExactTokens(
      [desiredOutput, amounts[0], path, recipientClient.account.address, await getDeadline()],
      { account: traderClient.account.address }
    );

    strictEqual(traderTokenABefore - (await tokenA.read.balanceOf([traderClient.account.address])), amounts[0]);
    strictEqual((await tokenC.read.balanceOf([recipientClient.account.address])) - recipientTokenCBefore, desiredOutput);
    strictEqual((await tokenA.read.balanceOf([treasury.address])) - treasuryTokenABefore, tokenAFee);
    strictEqual((await tokenB.read.balanceOf([treasury.address])) - treasuryTokenBBefore, tokenBFee);

    await configureTreasuryAllocation(tokenA.address, recipientClient.account.address, tokenAFee);
    await configureTreasuryAllocation(tokenB.address, recipientClient.account.address, tokenBFee);

    const recipientTokenABefore = await tokenA.read.balanceOf([recipientClient.account.address]);
    const recipientTokenBBefore = await tokenB.read.balanceOf([recipientClient.account.address]);

    await treasury.write.allocate([tokenA.address, recipientClient.account.address, tokenAFee], {
      account: operatorClient.account.address,
    });
    await treasury.write.allocate([tokenB.address, recipientClient.account.address, tokenBFee], {
      account: operatorClient.account.address,
    });

    strictEqual((await tokenA.read.balanceOf([recipientClient.account.address])) - recipientTokenABefore, tokenAFee);
    strictEqual((await tokenB.read.balanceOf([recipientClient.account.address])) - recipientTokenBBefore, tokenBFee);
    strictEqual(await tokenA.read.balanceOf([treasury.address]), 0n);
    strictEqual(await tokenB.read.balanceOf([treasury.address]), 0n);
    strictEqual(await factory.read.allPairsLength(), 2n);
    ok(amounts[0] > desiredOutput, "exact output flow should consume more input than final output");
  });
});
