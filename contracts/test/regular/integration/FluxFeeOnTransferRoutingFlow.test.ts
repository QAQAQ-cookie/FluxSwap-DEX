import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

describe("FluxFeeOnTransferRoutingFlow", async function () {
  const hardhatNetwork = await network.connect();
  const { viem, networkHelpers } = hardhatNetwork;
  const publicClient = await viem.getPublicClient();
  const [multisigClient, guardianClient, operatorClient, lpClient, traderClient, recipientClient] =
    await viem.getWalletClients();

  const timelockDelay = 3600n;
  const maxUint256 = (1n << 256n) - 1n;
  const protocolFeeBps = 5n;
  const feeBase = 10000n;
  const feeOnTransferBps = 100n;

  let treasury: any;
  let factory: any;
  let router: any;
  let WETH: any;
  let feeToken: any;
  let quoteToken: any;

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

  function applyTransferFee(amount: bigint) {
    return amount - (amount * feeOnTransferBps) / feeBase;
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
    feeToken = await viem.deployContract("MockFeeOnTransferERC20", ["Tax Token", "TAX", 18, feeOnTransferBps]);
    quoteToken = await viem.deployContract("MockERC20", ["Quote Token", "USDX", 18]);

    await factory.write.setTreasury([treasury.address], {
      account: multisigClient.account.address,
    });

    await feeToken.write.mint([lpClient.account.address, 50_000n * 10n ** 18n]);
    await feeToken.write.mint([traderClient.account.address, 5_000n * 10n ** 18n]);
    await quoteToken.write.mint([lpClient.account.address, 20_000n * 10n ** 18n]);

    await feeToken.write.approve([router.address, maxUint256], { account: traderClient.account.address });

    await factory.write.createPair([feeToken.address, quoteToken.address]);
    const feeQuotePairAddress = await factory.read.getPair([feeToken.address, quoteToken.address]);
    const feeQuotePair = await viem.getContractAt("FluxSwapPair", feeQuotePairAddress);

    await feeToken.write.transfer([feeQuotePair.address, 10_000n * 10n ** 18n], {
      account: lpClient.account.address,
    });
    await quoteToken.write.transfer([feeQuotePair.address, 9_900n * 10n ** 18n], {
      account: lpClient.account.address,
    });
    await feeQuotePair.write.mint([lpClient.account.address], {
      account: lpClient.account.address,
    });

    await factory.write.createPair([feeToken.address, WETH.address]);
    const feeEthPairAddress = await factory.read.getPair([feeToken.address, WETH.address]);
    const feeEthPair = await viem.getContractAt("FluxSwapPair", feeEthPairAddress);

    await feeToken.write.transfer([feeEthPair.address, 10_000n * 10n ** 18n], {
      account: lpClient.account.address,
    });
    await WETH.write.deposit({ account: lpClient.account.address, value: 10n * 10n ** 18n });
    await WETH.write.transfer([feeEthPair.address, 10n * 10n ** 18n], {
      account: lpClient.account.address,
    });
    await feeEthPair.write.mint([lpClient.account.address], {
      account: lpClient.account.address,
    });
  });

  it("should keep fee-on-transfer routing working end to end while still accruing treasury fees in the real input asset", async function () {
    const taxedInput = 100n * 10n ** 18n;
    const netTaxedInput = applyTransferFee(taxedInput);
    const grossTaxedProtocolFee = (netTaxedInput * protocolFeeBps) / feeBase;
    const netTaxedProtocolFee = applyTransferFee(grossTaxedProtocolFee);
    const wethInput = 1n * 10n ** 18n;
    const wethProtocolFee = (wethInput * protocolFeeBps) / feeBase;

    const quoteRecipientBefore = await quoteToken.read.balanceOf([recipientClient.account.address]);
    const treasuryFeeTokenBefore = await feeToken.read.balanceOf([treasury.address]);

    await router.write.swapExactTokensForTokensSupportingFeeOnTransferTokens(
      [taxedInput, 1n, [feeToken.address, quoteToken.address], recipientClient.account.address, await getDeadline()],
      { account: traderClient.account.address }
    );

    ok(await quoteToken.read.balanceOf([recipientClient.account.address]) > quoteRecipientBefore);
    strictEqual((await feeToken.read.balanceOf([treasury.address])) - treasuryFeeTokenBefore, netTaxedProtocolFee);

    const feeTokenRecipientBefore = await feeToken.read.balanceOf([recipientClient.account.address]);
    const treasuryWethBefore = await WETH.read.balanceOf([treasury.address]);

    await router.write.swapExactETHForTokensSupportingFeeOnTransferTokens(
      [1n, [WETH.address, feeToken.address], recipientClient.account.address, await getDeadline()],
      { account: traderClient.account.address, value: wethInput }
    );

    ok(await feeToken.read.balanceOf([recipientClient.account.address]) > feeTokenRecipientBefore);
    strictEqual((await WETH.read.balanceOf([treasury.address])) - treasuryWethBefore, wethProtocolFee);

    const ethRecipientBefore = await publicClient.getBalance({ address: recipientClient.account.address });
    const treasuryFeeTokenMid = await feeToken.read.balanceOf([treasury.address]);

    await router.write.swapExactTokensForETHSupportingFeeOnTransferTokens(
      [taxedInput, 1n, [feeToken.address, WETH.address], recipientClient.account.address, await getDeadline()],
      { account: traderClient.account.address }
    );

    ok((await publicClient.getBalance({ address: recipientClient.account.address })) > ethRecipientBefore);
    strictEqual((await feeToken.read.balanceOf([treasury.address])) - treasuryFeeTokenMid, netTaxedProtocolFee);

    const totalTreasuryFeeToken = netTaxedProtocolFee * 2n;
    await configureTreasuryAllocation(feeToken.address, recipientClient.account.address, totalTreasuryFeeToken);
    await configureTreasuryAllocation(WETH.address, recipientClient.account.address, wethProtocolFee);

    const feeTokenRecipientBeforeAllocation = await feeToken.read.balanceOf([recipientClient.account.address]);
    const wethRecipientBeforeAllocation = await WETH.read.balanceOf([recipientClient.account.address]);

    await treasury.write.allocate([feeToken.address, recipientClient.account.address, totalTreasuryFeeToken], {
      account: operatorClient.account.address,
    });
    await treasury.write.allocate([WETH.address, recipientClient.account.address, wethProtocolFee], {
      account: operatorClient.account.address,
    });

    strictEqual(
      (await feeToken.read.balanceOf([recipientClient.account.address])) - feeTokenRecipientBeforeAllocation,
      applyTransferFee(totalTreasuryFeeToken)
    );
    strictEqual(
      (await WETH.read.balanceOf([recipientClient.account.address])) - wethRecipientBeforeAllocation,
      wethProtocolFee
    );
    strictEqual(await feeToken.read.balanceOf([treasury.address]), 0n);
    strictEqual(await WETH.read.balanceOf([treasury.address]), 0n);
    strictEqual(await factory.read.allPairsLength(), 2n);
  });
});
