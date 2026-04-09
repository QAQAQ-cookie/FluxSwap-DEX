import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

/*
 * 单元目标：
 * 1. 验证构造参数与 treasury marker。
 * 2. 验证 timelock 操作的 schedule / cancel 只能由 multisig 执行。
 * 3. 验证 operator、guardian、minDelay 变更都受 timelock 保护。
 * 4. 验证 token allocate、allowlist、daily cap、次日额度重置。
 * 5. 验证 approved spender 的额度消耗、pull、burn、revoke 与 no-return ERC20 兼容。
 * 6. 验证 pause / unpause 权限边界、原生 ETH 分配路径，以及 token / native emergency withdraw 只能在 timelock 到期后执行。
 */
describe("FluxSwapTreasury Unit", async function () {
  const hardhatNetwork = await network.connect();
  const { viem, networkHelpers } = hardhatNetwork;
  const publicClient = await viem.getPublicClient();
  const [multisigClient, guardianClient, operatorClient, recipientClient, spenderClient, otherClient] =
    await viem.getWalletClients();

  const delay = 3600n;

  let treasury: any;
  let token: any;

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

  async function scheduleAndExecute(
    operationId: `0x${string}`,
    execute: () => Promise<unknown>,
    scheduledDelay?: bigint
  ) {
    const effectiveDelay = scheduledDelay ?? (await treasury.read.minDelay());
    await treasury.write.scheduleOperation([operationId, effectiveDelay], {
      account: multisigClient.account.address,
    });
    await networkHelpers.time.increase(Number(effectiveDelay));
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

  it("should validate constructor inputs and expose the treasury marker", async function () {
    strictEqual(await treasury.read.isFluxSwapTreasury(), true);

    await expectRevert(
      viem.deployContract("FluxSwapTreasury", [
        "0x0000000000000000000000000000000000000000",
        guardianClient.account.address,
        operatorClient.account.address,
        delay,
      ]),
      "FluxSwapTreasury: ZERO_ADDRESS"
    );

    await expectRevert(
      viem.deployContract("FluxSwapTreasury", [
        multisigClient.account.address,
        guardianClient.account.address,
        operatorClient.account.address,
        0n,
      ]),
      "FluxSwapTreasury: INVALID_DELAY"
    );
  });

  it("should schedule and cancel operations only through multisig", async function () {
    const operationId = await treasury.read.hashSetOperator([recipientClient.account.address]);

    await expectRevert(
      treasury.write.scheduleOperation([operationId, delay], {
        account: guardianClient.account.address,
      }),
      "FluxSwapTreasury: FORBIDDEN"
    );

    await expectRevert(
      treasury.write.scheduleOperation([
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        delay,
      ]),
      "FluxSwapTreasury: INVALID_OPERATION"
    );

    await expectRevert(
      treasury.write.scheduleOperation([operationId, delay - 1n], {
        account: multisigClient.account.address,
      }),
      "FluxSwapTreasury: DELAY_TOO_SHORT"
    );

    await treasury.write.scheduleOperation([operationId, delay], {
      account: multisigClient.account.address,
    });

    await expectRevert(
      treasury.write.scheduleOperation([operationId, delay], {
        account: multisigClient.account.address,
      }),
      "FluxSwapTreasury: OPERATION_EXISTS"
    );

    await treasury.write.cancelOperation([operationId], {
      account: multisigClient.account.address,
    });

    await expectRevert(
      treasury.write.executeSetOperator([recipientClient.account.address, operationId]),
      "FluxSwapTreasury: UNKNOWN_OPERATION"
    );

    await expectRevert(
      treasury.write.cancelOperation([operationId], {
        account: multisigClient.account.address,
      }),
      "FluxSwapTreasury: UNKNOWN_OPERATION"
    );
  });

  it("should enforce timelock for operator updates", async function () {
    const operationId = await treasury.read.hashSetOperator([recipientClient.account.address]);

    await treasury.write.scheduleOperation([operationId, delay], {
      account: multisigClient.account.address,
    });
    await expectRevert(
      treasury.write.executeSetOperator([recipientClient.account.address, operationId]),
      "FluxSwapTreasury: OPERATION_NOT_READY"
    );

    await networkHelpers.time.increase(Number(delay));
    await treasury.write.executeSetOperator([recipientClient.account.address, operationId]);

    strictEqual((await treasury.read.operator()).toLowerCase(), recipientClient.account.address.toLowerCase());
  });

  it("should update guardian and minimum delay through timelock", async function () {
    const guardianOperationId = await treasury.read.hashSetGuardian([recipientClient.account.address]);
    await scheduleAndExecute(guardianOperationId, () =>
      treasury.write.executeSetGuardian([recipientClient.account.address, guardianOperationId])
    );

    strictEqual((await treasury.read.guardian()).toLowerCase(), recipientClient.account.address.toLowerCase());

    await expectRevert(
      treasury.write.pause({ account: guardianClient.account.address }),
      "FluxSwapTreasury: FORBIDDEN"
    );

    await treasury.write.pause({ account: recipientClient.account.address });
    await treasury.write.unpause({ account: multisigClient.account.address });

    const minDelayOperationId = await treasury.read.hashSetMinDelay([7200n]);
    await scheduleAndExecute(minDelayOperationId, () =>
      treasury.write.executeSetMinDelay([7200n, minDelayOperationId])
    );

    strictEqual(await treasury.read.minDelay(), 7200n);
  });

  it("should allocate approved tokens within the daily cap and reset the cap on the next day", async function () {
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

    await token.write.mint([treasury.address, 150n * 10n ** 18n]);
    await treasury.write.allocate([token.address, recipientClient.account.address, 100n * 10n ** 18n], {
      account: operatorClient.account.address,
    });

    strictEqual(await token.read.balanceOf([recipientClient.account.address]), 100n * 10n ** 18n);

    await expectRevert(
      treasury.write.allocate([token.address, recipientClient.account.address, 1n], {
        account: operatorClient.account.address,
      }),
      "FluxSwapTreasury: DAILY_CAP_EXCEEDED"
    );

    await networkHelpers.time.increase(24 * 60 * 60);
    await treasury.write.allocate([token.address, recipientClient.account.address, 50n * 10n ** 18n], {
      account: operatorClient.account.address,
    });

    strictEqual(await token.read.balanceOf([recipientClient.account.address]), 150n * 10n ** 18n);
  });

  it("should enforce allowlists, spend caps, and operator permissions on allocations", async function () {
    await token.write.mint([treasury.address, 100n * 10n ** 18n]);

    await expectRevert(
      treasury.write.allocate([token.address, recipientClient.account.address, 10n * 10n ** 18n], {
        account: operatorClient.account.address,
      }),
      "FluxSwapTreasury: TOKEN_NOT_ALLOWED"
    );

    const allowTokenOp = await treasury.read.hashSetAllowedToken([token.address, true]);
    await scheduleAndExecute(allowTokenOp, () =>
      treasury.write.executeSetAllowedToken([token.address, true, allowTokenOp])
    );

    await expectRevert(
      treasury.write.allocate([token.address, recipientClient.account.address, 10n * 10n ** 18n], {
        account: operatorClient.account.address,
      }),
      "FluxSwapTreasury: RECIPIENT_NOT_ALLOWED"
    );

    const allowRecipientOp = await treasury.read.hashSetAllowedRecipient([recipientClient.account.address, true]);
    await scheduleAndExecute(allowRecipientOp, () =>
      treasury.write.executeSetAllowedRecipient([recipientClient.account.address, true, allowRecipientOp])
    );

    await expectRevert(
      treasury.write.allocate([token.address, recipientClient.account.address, 10n * 10n ** 18n], {
        account: operatorClient.account.address,
      }),
      "FluxSwapTreasury: SPEND_CAP_NOT_SET"
    );

    const capOp = await treasury.read.hashSetDailySpendCap([token.address, 10n * 10n ** 18n]);
    await scheduleAndExecute(capOp, () =>
      treasury.write.executeSetDailySpendCap([token.address, 10n * 10n ** 18n, capOp])
    );

    await expectRevert(
      treasury.write.allocate([token.address, recipientClient.account.address, 1n], {
        account: otherClient.account.address,
      }),
      "FluxSwapTreasury: FORBIDDEN"
    );
  });

  it("should manage spender caps through cap consumption and treasury pulls", async function () {
    await token.write.mint([treasury.address, 500n * 10n ** 18n]);

    const capOp = await treasury.read.hashSetDailySpendCap([token.address, 200n * 10n ** 18n]);
    await scheduleAndExecute(capOp, () =>
      treasury.write.executeSetDailySpendCap([token.address, 200n * 10n ** 18n, capOp])
    );

    const approveOp = await treasury.read.hashApproveSpender([
      token.address,
      spenderClient.account.address,
      250n * 10n ** 18n,
    ]);
    await scheduleAndExecute(approveOp, () =>
      treasury.write.executeApproveSpender([
        token.address,
        spenderClient.account.address,
        250n * 10n ** 18n,
        approveOp,
      ])
    );

    await expectRevert(
      token.write.transferFrom([treasury.address, recipientClient.account.address, 1n], {
        account: spenderClient.account.address,
      }),
      "Insufficient allowance"
    );

    await treasury.write.consumeApprovedSpenderCap([token.address, 50n * 10n ** 18n], {
      account: spenderClient.account.address,
    });

    strictEqual(
      await treasury.read.approvedSpendRemaining([token.address, spenderClient.account.address]),
      200n * 10n ** 18n
    );
    strictEqual(await treasury.read.spentToday([token.address]), 50n * 10n ** 18n);

    await treasury.write.pullApprovedToken([token.address, 100n * 10n ** 18n], {
      account: spenderClient.account.address,
    });

    strictEqual(await token.read.balanceOf([spenderClient.account.address]), 100n * 10n ** 18n);
    strictEqual(
      await treasury.read.approvedSpendRemaining([token.address, spenderClient.account.address]),
      100n * 10n ** 18n
    );
    strictEqual(await treasury.read.spentToday([token.address]), 150n * 10n ** 18n);

    await expectRevert(
      treasury.write.pullApprovedToken([token.address, 60n * 10n ** 18n], {
        account: spenderClient.account.address,
      }),
      "FluxSwapTreasury: DAILY_CAP_EXCEEDED"
    );
  });

  it("should support no-return token pulls, token burning, and spender revocation", async function () {
    const noReturnToken = await viem.deployContract("MockNoReturnERC20", ["No Return Token", "NRT", 18]);
    const burnToken = await viem.deployContract("FluxToken", [
      "Burnable Flux",
      "BFLUX",
      multisigClient.account.address,
      treasury.address,
      500n * 10n ** 18n,
      1_000n * 10n ** 18n,
    ]);

    await noReturnToken.write.mint([treasury.address, 1_000n * 10n ** 18n]);

    const approveNoReturnOp = await treasury.read.hashApproveSpender([
      noReturnToken.address,
      spenderClient.account.address,
      250n * 10n ** 18n,
    ]);
    await scheduleAndExecute(approveNoReturnOp, () =>
      treasury.write.executeApproveSpender([
        noReturnToken.address,
        spenderClient.account.address,
        250n * 10n ** 18n,
        approveNoReturnOp,
      ])
    );

    await treasury.write.pullApprovedToken([noReturnToken.address, 125n * 10n ** 18n], {
      account: spenderClient.account.address,
    });

    strictEqual(await noReturnToken.read.balanceOf([spenderClient.account.address]), 125n * 10n ** 18n);

    const approveBurnOp = await treasury.read.hashApproveSpender([
      burnToken.address,
      spenderClient.account.address,
      40n * 10n ** 18n,
    ]);
    await scheduleAndExecute(approveBurnOp, () =>
      treasury.write.executeApproveSpender([
        burnToken.address,
        spenderClient.account.address,
        40n * 10n ** 18n,
        approveBurnOp,
      ])
    );

    await treasury.write.burnApprovedToken([burnToken.address, 40n * 10n ** 18n], {
      account: spenderClient.account.address,
    });

    strictEqual(await burnToken.read.totalSupply(), 460n * 10n ** 18n);
    strictEqual(await burnToken.read.balanceOf([treasury.address]), 460n * 10n ** 18n);

    const revokeOp = await treasury.read.hashRevokeSpender([noReturnToken.address, spenderClient.account.address]);
    await scheduleAndExecute(revokeOp, () =>
      treasury.write.executeRevokeSpender([noReturnToken.address, spenderClient.account.address, revokeOp])
    );

    strictEqual(
      await treasury.read.approvedSpendRemaining([noReturnToken.address, spenderClient.account.address]),
      0n
    );

    await expectRevert(
      treasury.write.pullApprovedToken([noReturnToken.address, 1n], {
        account: spenderClient.account.address,
      }),
      "FluxSwapTreasury: SPENDER_ALLOWANCE_EXCEEDED"
    );
  });

  it("should enforce pause and unpause permissions", async function () {
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

    await expectRevert(
      treasury.write.pause({ account: otherClient.account.address }),
      "FluxSwapTreasury: FORBIDDEN"
    );

    await treasury.write.pause({ account: guardianClient.account.address });

    await expectRevert(
      treasury.write.allocate([token.address, recipientClient.account.address, 1n], {
        account: operatorClient.account.address,
      }),
      "FluxSwapTreasury: PAUSED"
    );

    await expectRevert(
      treasury.write.unpause({ account: guardianClient.account.address }),
      "FluxSwapTreasury: FORBIDDEN"
    );

    await treasury.write.unpause({ account: multisigClient.account.address });
    await treasury.write.allocate([token.address, recipientClient.account.address, 1n], {
      account: operatorClient.account.address,
    });

    strictEqual(await token.read.balanceOf([recipientClient.account.address]), 1n);
  });

  it("should release ETH through native allocations", async function () {
    const allowRecipientOp = await treasury.read.hashSetAllowedRecipient([recipientClient.account.address, true]);
    await scheduleAndExecute(allowRecipientOp, () =>
      treasury.write.executeSetAllowedRecipient([recipientClient.account.address, true, allowRecipientOp])
    );

    const capOp = await treasury.read.hashSetDailySpendCap([
      "0x0000000000000000000000000000000000000000",
      1n * 10n ** 18n,
    ]);
    await scheduleAndExecute(capOp, () =>
      treasury.write.executeSetDailySpendCap([
        "0x0000000000000000000000000000000000000000",
        1n * 10n ** 18n,
        capOp,
      ])
    );

    await multisigClient.sendTransaction({
      to: treasury.address,
      value: 1n * 10n ** 18n,
    });

    const balanceBefore = await publicClient.getBalance({ address: recipientClient.account.address });
    await treasury.write.allocateETH([recipientClient.account.address, 1n * 10n ** 18n], {
      account: operatorClient.account.address,
    });

    strictEqual(
      (await publicClient.getBalance({ address: recipientClient.account.address })) - balanceBefore,
      1n * 10n ** 18n
    );
  });

  it("should protect token and native emergency withdrawals behind timelock", async function () {
    await token.write.mint([treasury.address, 300n * 10n ** 18n]);
    await multisigClient.sendTransaction({
      to: treasury.address,
      value: 1n * 10n ** 18n,
    });

    const tokenOperationId = await treasury.read.hashEmergencyWithdraw([
      token.address,
      recipientClient.account.address,
      120n * 10n ** 18n,
    ]);
    await treasury.write.scheduleOperation([tokenOperationId, delay], {
      account: multisigClient.account.address,
    });

    await expectRevert(
      treasury.write.executeEmergencyWithdraw([
        token.address,
        recipientClient.account.address,
        120n * 10n ** 18n,
        tokenOperationId,
      ]),
      "FluxSwapTreasury: OPERATION_NOT_READY"
    );

    await networkHelpers.time.increase(Number(delay));
    await treasury.write.executeEmergencyWithdraw([
      token.address,
      recipientClient.account.address,
      120n * 10n ** 18n,
      tokenOperationId,
    ]);

    strictEqual(await token.read.balanceOf([recipientClient.account.address]), 120n * 10n ** 18n);

    const nativeOperationId = await treasury.read.hashEmergencyWithdrawETH([
      recipientClient.account.address,
      5n * 10n ** 17n,
    ]);
    await scheduleAndExecute(nativeOperationId, () =>
      treasury.write.executeEmergencyWithdrawETH([
        recipientClient.account.address,
        5n * 10n ** 17n,
        nativeOperationId,
      ])
    );

    ok((await publicClient.getBalance({ address: recipientClient.account.address })) > 0n);
  });
});
