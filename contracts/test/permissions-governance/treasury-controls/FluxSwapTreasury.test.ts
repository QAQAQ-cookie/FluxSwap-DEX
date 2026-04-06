import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

describe("FluxSwapTreasury", async function () {
  const hardhatNetwork = await network.connect();
  const { viem, networkHelpers } = hardhatNetwork;
  const publicClient = await viem.getPublicClient();
  const [multisigClient, guardianClient, operatorClient, recipientClient, spenderClient, lpClient, traderClient] =
    await viem.getWalletClients();

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

  const delay = 3600n;
  const getDeadline = async () => (await publicClient.getBlock()).timestamp + 3600n;

  let treasury: any;
  let token: any;

  async function scheduleAndExecute(operationId: `0x${string}`, execute: () => Promise<unknown>) {
    await treasury.write.scheduleOperation([operationId, delay], { account: multisigClient.account.address });
    await networkHelpers.time.increase(Number(delay));
    await execute();
  }

  beforeEach(async function () {
    token = await viem.deployContract("MockERC20", ["Treasury Token", "TT", 18]);
    treasury = await viem.deployContract("FluxSwapTreasury", [
      multisigClient.account.address,
      guardianClient.account.address,
      operatorClient.account.address,
      delay,
    ]);
  });

  async function deployDexWithTreasury() {
    const tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
    const tokenB = await viem.deployContract("MockERC20", ["Token B", "TKNB", 18]);
    const WETH = await viem.deployContract("MockWETH", []);
    const factory = await viem.deployContract("FluxSwapFactory", [multisigClient.account.address]);
    const router = await viem.deployContract("FluxSwapRouter", [factory.address, WETH.address]);

    const amount = 1_000_000n * 10n ** 18n;
    const liquidityAmount = 10_000n * 10n ** 18n;

    await factory.write.setTreasury([treasury.address], {
      account: multisigClient.account.address,
    });

    await tokenA.write.mint([lpClient.account.address, amount]);
    await tokenB.write.mint([lpClient.account.address, amount]);
    await tokenA.write.mint([traderClient.account.address, amount]);
    await tokenB.write.mint([traderClient.account.address, amount]);

    await tokenA.write.approve([router.address, amount], { account: lpClient.account.address });
    await tokenB.write.approve([router.address, amount], { account: lpClient.account.address });
    await tokenA.write.approve([router.address, amount], { account: traderClient.account.address });
    await tokenB.write.approve([router.address, amount], { account: traderClient.account.address });

    await router.write.addLiquidity([
      tokenA.address,
      tokenB.address,
      liquidityAmount,
      liquidityAmount,
      0n,
      0n,
      lpClient.account.address,
      await getDeadline(),
    ], { account: lpClient.account.address });

    return { tokenA, tokenB, WETH, factory, router };
  }

  it("should enforce timelock for operator updates", async function () {
    const operationId = await treasury.read.hashSetOperator([recipientClient.account.address]);

    await expectRevert(
      treasury.write.scheduleOperation([operationId, delay], { account: guardianClient.account.address }),
      "FluxSwapTreasury: FORBIDDEN"
    );

    await treasury.write.scheduleOperation([operationId, delay], { account: multisigClient.account.address });

    await expectRevert(
      treasury.write.executeSetOperator([recipientClient.account.address, operationId]),
      "FluxSwapTreasury: OPERATION_NOT_READY"
    );

    await networkHelpers.time.increase(Number(delay));
    await treasury.write.executeSetOperator([recipientClient.account.address, operationId]);

    strictEqual((await treasury.read.operator()).toLowerCase(), recipientClient.account.address.toLowerCase());
  });

  it("should allocate whitelisted tokens within daily caps", async function () {
    const allowTokenOp = await treasury.read.hashSetAllowedToken([token.address, true]);
    await scheduleAndExecute(allowTokenOp, () =>
      treasury.write.executeSetAllowedToken([token.address, true, allowTokenOp])
    );

    const allowRecipientOp = await treasury.read.hashSetAllowedRecipient([recipientClient.account.address, true]);
    await scheduleAndExecute(allowRecipientOp, () =>
      treasury.write.executeSetAllowedRecipient([recipientClient.account.address, true, allowRecipientOp])
    );

    const capOp = await treasury.read.hashSetDailySpendCap([token.address, 500n * 10n ** 18n]);
    await scheduleAndExecute(capOp, () =>
      treasury.write.executeSetDailySpendCap([token.address, 500n * 10n ** 18n, capOp])
    );

    await token.write.mint([treasury.address, 1000n * 10n ** 18n]);

    await treasury.write.allocate([token.address, recipientClient.account.address, 400n * 10n ** 18n], {
      account: operatorClient.account.address,
    });

    strictEqual(await token.read.balanceOf([recipientClient.account.address]), 400n * 10n ** 18n);

    await expectRevert(
      treasury.write.allocate([token.address, recipientClient.account.address, 200n * 10n ** 18n], {
        account: operatorClient.account.address,
      }),
      "FluxSwapTreasury: DAILY_CAP_EXCEEDED"
    );

    await networkHelpers.time.increase(24 * 60 * 60);
    await treasury.write.allocate([token.address, recipientClient.account.address, 100n * 10n ** 18n], {
      account: operatorClient.account.address,
    });

    strictEqual(await token.read.balanceOf([recipientClient.account.address]), 500n * 10n ** 18n);
  });

  it("should allow guardian to pause and multisig to unpause", async function () {
    const allowTokenOp = await treasury.read.hashSetAllowedToken([token.address, true]);
    await scheduleAndExecute(allowTokenOp, () =>
      treasury.write.executeSetAllowedToken([token.address, true, allowTokenOp])
    );

    const allowRecipientOp = await treasury.read.hashSetAllowedRecipient([recipientClient.account.address, true]);
    await scheduleAndExecute(allowRecipientOp, () =>
      treasury.write.executeSetAllowedRecipient([recipientClient.account.address, true, allowRecipientOp])
    );

    const capOp = await treasury.read.hashSetDailySpendCap([token.address, 100n * 10n ** 18n]);
    await scheduleAndExecute(capOp, () =>
      treasury.write.executeSetDailySpendCap([token.address, 100n * 10n ** 18n, capOp])
    );

    await token.write.mint([treasury.address, 100n * 10n ** 18n]);

    await treasury.write.pause({ account: guardianClient.account.address });

    await expectRevert(
      treasury.write.allocate([token.address, recipientClient.account.address, 10n * 10n ** 18n], {
        account: operatorClient.account.address,
      }),
      "FluxSwapTreasury: PAUSED"
    );

    await treasury.write.unpause({ account: multisigClient.account.address });
    await treasury.write.allocate([token.address, recipientClient.account.address, 10n * 10n ** 18n], {
      account: operatorClient.account.address,
    });

    strictEqual(await token.read.balanceOf([recipientClient.account.address]), 10n * 10n ** 18n);
  });

  it("should block allocations until a daily spend cap is configured", async function () {
    const allowTokenOp = await treasury.read.hashSetAllowedToken([token.address, true]);
    await scheduleAndExecute(allowTokenOp, () =>
      treasury.write.executeSetAllowedToken([token.address, true, allowTokenOp])
    );

    const allowRecipientOp = await treasury.read.hashSetAllowedRecipient([recipientClient.account.address, true]);
    await scheduleAndExecute(allowRecipientOp, () =>
      treasury.write.executeSetAllowedRecipient([recipientClient.account.address, true, allowRecipientOp])
    );

    await token.write.mint([treasury.address, 100n * 10n ** 18n]);

    await expectRevert(
      treasury.write.allocate([token.address, recipientClient.account.address, 10n * 10n ** 18n], {
        account: operatorClient.account.address,
      }),
      "FluxSwapTreasury: SPEND_CAP_NOT_SET"
    );
  });

  it("should manage treasury-enforced spender caps through timelocked operations", async function () {
    await token.write.mint([treasury.address, 1000n * 10n ** 18n]);

    const approveOp = await treasury.read.hashApproveSpender([token.address, spenderClient.account.address, 250n * 10n ** 18n]);
    await scheduleAndExecute(approveOp, () =>
      treasury.write.executeApproveSpender([token.address, spenderClient.account.address, 250n * 10n ** 18n, approveOp])
    );

    strictEqual(await treasury.read.approvedSpendRemaining([token.address, spenderClient.account.address]), 250n * 10n ** 18n);
    strictEqual(await token.read.allowance([treasury.address, spenderClient.account.address]), 0n);

    await treasury.write.pullApprovedToken([token.address, 100n * 10n ** 18n], {
      account: spenderClient.account.address,
    });

    strictEqual(await token.read.balanceOf([spenderClient.account.address]), 100n * 10n ** 18n);
    strictEqual(await treasury.read.approvedSpendRemaining([token.address, spenderClient.account.address]), 150n * 10n ** 18n);

    const revokeOp = await treasury.read.hashRevokeSpender([token.address, spenderClient.account.address]);
    await scheduleAndExecute(revokeOp, () =>
      treasury.write.executeRevokeSpender([token.address, spenderClient.account.address, revokeOp])
    );

    strictEqual(await treasury.read.approvedSpendRemaining([token.address, spenderClient.account.address]), 0n);
  });

  it("should block approved spenders from bypassing treasury accounting with raw transferFrom", async function () {
    await token.write.mint([treasury.address, 1000n * 10n ** 18n]);

    const approveOp = await treasury.read.hashApproveSpender([token.address, spenderClient.account.address, 250n * 10n ** 18n]);
    await scheduleAndExecute(approveOp, () =>
      treasury.write.executeApproveSpender([token.address, spenderClient.account.address, 250n * 10n ** 18n, approveOp])
    );

    await expectRevert(
      token.write.transferFrom([treasury.address, recipientClient.account.address, 250n * 10n ** 18n], {
        account: spenderClient.account.address,
      }),
      "Insufficient allowance"
    );

    strictEqual(await token.read.balanceOf([recipientClient.account.address]), 0n);
    strictEqual(await treasury.read.approvedSpendRemaining([token.address, spenderClient.account.address]), 250n * 10n ** 18n);
  });

  it("should support treasury-enforced spender pulls for tokens that do not return bool on approve", async function () {
    const noReturnToken = await viem.deployContract("MockNoReturnERC20", ["No Return Token", "NRT", 18]);
    await noReturnToken.write.mint([treasury.address, 1000n * 10n ** 18n]);

    const approveOp = await treasury.read.hashApproveSpender([
      noReturnToken.address,
      spenderClient.account.address,
      250n * 10n ** 18n,
    ]);
    await scheduleAndExecute(approveOp, () =>
      treasury.write.executeApproveSpender([
        noReturnToken.address,
        spenderClient.account.address,
        250n * 10n ** 18n,
        approveOp,
      ])
    );

    strictEqual(await treasury.read.approvedSpendRemaining([noReturnToken.address, spenderClient.account.address]), 250n * 10n ** 18n);
    strictEqual(await noReturnToken.read.allowance([treasury.address, spenderClient.account.address]), 0n);

    await treasury.write.pullApprovedToken([noReturnToken.address, 125n * 10n ** 18n], {
      account: spenderClient.account.address,
    });

    strictEqual(await noReturnToken.read.balanceOf([spenderClient.account.address]), 125n * 10n ** 18n);
    strictEqual(await treasury.read.approvedSpendRemaining([noReturnToken.address, spenderClient.account.address]), 125n * 10n ** 18n);

    const revokeOp = await treasury.read.hashRevokeSpender([noReturnToken.address, spenderClient.account.address]);
    await scheduleAndExecute(revokeOp, () =>
      treasury.write.executeRevokeSpender([noReturnToken.address, spenderClient.account.address, revokeOp])
    );

    strictEqual(await treasury.read.approvedSpendRemaining([noReturnToken.address, spenderClient.account.address]), 0n);
  });

  it("should release ETH through daily-capped native allocations", async function () {
    const allowRecipientOp = await treasury.read.hashSetAllowedRecipient([recipientClient.account.address, true]);
    await scheduleAndExecute(allowRecipientOp, () =>
      treasury.write.executeSetAllowedRecipient([recipientClient.account.address, true, allowRecipientOp])
    );

    const capOp = await treasury.read.hashSetDailySpendCap(["0x0000000000000000000000000000000000000000", 2n * 10n ** 18n]);
    await scheduleAndExecute(capOp, () =>
      treasury.write.executeSetDailySpendCap(["0x0000000000000000000000000000000000000000", 2n * 10n ** 18n, capOp])
    );

    await multisigClient.sendTransaction({
      to: treasury.address,
      value: 3n * 10n ** 18n,
    });

    const balanceBefore = await publicClient.getBalance({ address: recipientClient.account.address });

    await treasury.write.allocateETH([recipientClient.account.address, 1n * 10n ** 18n], {
      account: operatorClient.account.address,
    });

    const balanceAfter = await publicClient.getBalance({ address: recipientClient.account.address });
    strictEqual(balanceAfter - balanceBefore, 1n * 10n ** 18n);
  });

  it("should protect emergency withdrawals behind timelock", async function () {
    await token.write.mint([treasury.address, 300n * 10n ** 18n]);

    const operationId = await treasury.read.hashEmergencyWithdraw([token.address, recipientClient.account.address, 120n * 10n ** 18n]);
    await treasury.write.scheduleOperation([operationId, delay], { account: multisigClient.account.address });

    await expectRevert(
      treasury.write.executeEmergencyWithdraw([token.address, recipientClient.account.address, 120n * 10n ** 18n, operationId]),
      "FluxSwapTreasury: OPERATION_NOT_READY"
    );

    await networkHelpers.time.increase(Number(delay));
    await treasury.write.executeEmergencyWithdraw([token.address, recipientClient.account.address, 120n * 10n ** 18n, operationId]);

    strictEqual(await token.read.balanceOf([recipientClient.account.address]), 120n * 10n ** 18n);
  });

  it("should collect swap fees into treasury and distribute them through governed allocation", async function () {
    const { tokenA, tokenB, router } = await deployDexWithTreasury();
    const swapAmount = 100n * 10n ** 18n;
    const expectedProtocolFee = (swapAmount * 5n) / 10000n;

    await router.write.swapExactTokensForTokens([
      swapAmount,
      0n,
      [tokenA.address, tokenB.address],
      traderClient.account.address,
      await getDeadline(),
    ], { account: traderClient.account.address });

    strictEqual(await tokenA.read.balanceOf([treasury.address]), expectedProtocolFee);

    const allowTokenOp = await treasury.read.hashSetAllowedToken([tokenA.address, true]);
    await scheduleAndExecute(allowTokenOp, () =>
      treasury.write.executeSetAllowedToken([tokenA.address, true, allowTokenOp])
    );

    const allowRecipientOp = await treasury.read.hashSetAllowedRecipient([recipientClient.account.address, true]);
    await scheduleAndExecute(allowRecipientOp, () =>
      treasury.write.executeSetAllowedRecipient([recipientClient.account.address, true, allowRecipientOp])
    );

    const capOp = await treasury.read.hashSetDailySpendCap([tokenA.address, expectedProtocolFee]);
    await scheduleAndExecute(capOp, () =>
      treasury.write.executeSetDailySpendCap([tokenA.address, expectedProtocolFee, capOp])
    );

    await treasury.write.allocate([tokenA.address, recipientClient.account.address, expectedProtocolFee], {
      account: operatorClient.account.address,
    });

    strictEqual(await tokenA.read.balanceOf([recipientClient.account.address]), expectedProtocolFee);
    strictEqual(await tokenA.read.balanceOf([treasury.address]), 0n);
  });

  it("should keep collecting swap fees while treasury is paused and block operator spending", async function () {
    const { tokenA, tokenB, router } = await deployDexWithTreasury();
    const swapAmount = 50n * 10n ** 18n;
    const expectedProtocolFee = (swapAmount * 5n) / 10000n;

    await treasury.write.pause({ account: guardianClient.account.address });

    await router.write.swapExactTokensForTokens([
      swapAmount,
      0n,
      [tokenA.address, tokenB.address],
      traderClient.account.address,
      await getDeadline(),
    ], { account: traderClient.account.address });

    strictEqual(await tokenA.read.balanceOf([treasury.address]), expectedProtocolFee);

    const allowTokenOp = await treasury.read.hashSetAllowedToken([tokenA.address, true]);
    await scheduleAndExecute(allowTokenOp, () =>
      treasury.write.executeSetAllowedToken([tokenA.address, true, allowTokenOp])
    );

    const allowRecipientOp = await treasury.read.hashSetAllowedRecipient([recipientClient.account.address, true]);
    await scheduleAndExecute(allowRecipientOp, () =>
      treasury.write.executeSetAllowedRecipient([recipientClient.account.address, true, allowRecipientOp])
    );

    await expectRevert(
      treasury.write.allocate([tokenA.address, recipientClient.account.address, expectedProtocolFee], {
        account: operatorClient.account.address,
      }),
      "FluxSwapTreasury: PAUSED"
    );
  });
});
