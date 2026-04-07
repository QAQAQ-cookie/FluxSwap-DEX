import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

// 回归目标：
// 1. 锁住 treasury 暂停时“禁止支出但仍可继续收协议费”的行为。
// 2. 锁住 approved spender 只能通过 treasury 记账接口拿钱，不能拿到底层 ERC20 allowance。
// 3. 锁住原生 ETH 额度与 ERC20 额度相互隔离，避免后续改动把两套记账混在一起。
describe("FluxTreasuryAccountingRegression", async function () {
  const hardhatNetwork = await network.connect();
  const { viem, networkHelpers } = hardhatNetwork;
  const publicClient = await viem.getPublicClient();
  const [multisigClient, guardianClient, operatorClient, recipientClient, spenderClient, lpClient, traderClient] =
    await viem.getWalletClients();

  const timelockDelay = 3600n;
  const maxUint256 = (1n << 256n) - 1n;
  const zeroAddress = "0x0000000000000000000000000000000000000000";
  const fluxInitialSupply = 500n * 10n ** 18n;
  const fluxCap = 1_000n * 10n ** 18n;

  let treasury: any;
  let token: any;
  let burnToken: any;
  let tokenA: any;
  let tokenB: any;
  let WETH: any;
  let factory: any;
  let router: any;

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
    // 统一复用 timelock 流程，避免每个回归点都重复拼治理步骤。
    await treasury.write.scheduleOperation([operationId, timelockDelay], {
      account: multisigClient.account.address,
    });
    await networkHelpers.time.increase(Number(timelockDelay));
    await execute();
  }

  beforeEach(async function () {
    treasury = await viem.deployContract("FluxSwapTreasury", [
      multisigClient.account.address,
      guardianClient.account.address,
      operatorClient.account.address,
      timelockDelay,
    ]);

    token = await viem.deployContract("MockERC20", ["Treasury Token", "TT", 18]);
    burnToken = await viem.deployContract("FluxToken", [
      "Burnable Flux",
      "BFLUX",
      multisigClient.account.address,
      treasury.address,
      fluxInitialSupply,
      fluxCap,
    ]);
    tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
    tokenB = await viem.deployContract("MockERC20", ["Token B", "TKNB", 18]);
    WETH = await viem.deployContract("MockWETH", []);
    factory = await viem.deployContract("FluxSwapFactory", [multisigClient.account.address]);
    router = await viem.deployContract("FluxSwapRouter", [factory.address, WETH.address]);

    await factory.write.setTreasury([treasury.address], {
      account: multisigClient.account.address,
    });

    await tokenA.write.mint([lpClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenB.write.mint([lpClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenA.write.mint([traderClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenB.write.mint([traderClient.account.address, 1_000_000n * 10n ** 18n]);
    await token.write.mint([treasury.address, 500n * 10n ** 18n]);

    await tokenA.write.approve([router.address, maxUint256], { account: lpClient.account.address });
    await tokenB.write.approve([router.address, maxUint256], { account: lpClient.account.address });
    await tokenA.write.approve([router.address, maxUint256], { account: traderClient.account.address });
    await tokenB.write.approve([router.address, maxUint256], { account: traderClient.account.address });

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

  it("should keep collecting swap fees while treasury is paused and only allow token spending after unpause", async function () {
    const swapAmount = 100n * 10n ** 18n;
    const expectedProtocolFee = (swapAmount * 5n) / 10000n;

    // 金库暂停后应只阻断支出，不应阻断 Pair 继续把协议费打入 treasury。
    await treasury.write.pause({
      account: guardianClient.account.address,
    });

    await router.write.swapExactTokensForTokens(
      [swapAmount, 0n, [tokenA.address, tokenB.address], traderClient.account.address, await getDeadline()],
      { account: traderClient.account.address }
    );

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

    await expectRevert(
      treasury.write.allocate([tokenA.address, recipientClient.account.address, expectedProtocolFee], {
        account: operatorClient.account.address,
      }),
      "FluxSwapTreasury: PAUSED"
    );

    await treasury.write.unpause({
      account: multisigClient.account.address,
    });

    await treasury.write.allocate([tokenA.address, recipientClient.account.address, expectedProtocolFee], {
      account: operatorClient.account.address,
    });

    strictEqual(await tokenA.read.balanceOf([recipientClient.account.address]), expectedProtocolFee);
    strictEqual(await tokenA.read.balanceOf([treasury.address]), 0n);
  });

  it("should keep spender-facing ERC20 allowance at zero and only move funds through treasury pull accounting", async function () {
    const approvedAmount = 125n * 10n ** 18n;
    const approveOp = await treasury.read.hashApproveSpender([
      token.address,
      spenderClient.account.address,
      approvedAmount,
    ]);
    await scheduleAndExecute(approveOp, () =>
      treasury.write.executeApproveSpender([token.address, spenderClient.account.address, approvedAmount, approveOp])
    );

    // 这里锁死一个关键回归点：approved spender 不能拿到底层 ERC20 allowance 绕过 treasury 记账。
    strictEqual(await treasury.read.approvedSpendRemaining([token.address, spenderClient.account.address]), approvedAmount);
    strictEqual(await token.read.allowance([treasury.address, spenderClient.account.address]), 0n);

    await expectRevert(
      token.write.transferFrom([treasury.address, recipientClient.account.address, 1n], {
        account: spenderClient.account.address,
      }),
      "Insufficient allowance"
    );

    await treasury.write.pullApprovedToken([token.address, approvedAmount], {
      account: spenderClient.account.address,
    });

    strictEqual(await token.read.balanceOf([spenderClient.account.address]), approvedAmount);
    strictEqual(await treasury.read.approvedSpendRemaining([token.address, spenderClient.account.address]), 0n);
    strictEqual(await token.read.allowance([treasury.address, spenderClient.account.address]), 0n);
  });

  it("should account native ETH through the dedicated zero-address cap instead of token caps", async function () {
    const nativeCap = 1n * 10n ** 18n;
    const allowRecipientOp = await treasury.read.hashSetAllowedRecipient([recipientClient.account.address, true]);
    await scheduleAndExecute(allowRecipientOp, () =>
      treasury.write.executeSetAllowedRecipient([recipientClient.account.address, true, allowRecipientOp])
    );

    // 原生 ETH 走 address(0) 的独立额度，不能和任意 ERC20 的 spend cap 混用。
    const nativeCapOp = await treasury.read.hashSetDailySpendCap([zeroAddress, nativeCap]);
    await scheduleAndExecute(nativeCapOp, () =>
      treasury.write.executeSetDailySpendCap([zeroAddress, nativeCap, nativeCapOp])
    );

    const tokenCapOp = await treasury.read.hashSetDailySpendCap([token.address, 500n * 10n ** 18n]);
    await scheduleAndExecute(tokenCapOp, () =>
      treasury.write.executeSetDailySpendCap([token.address, 500n * 10n ** 18n, tokenCapOp])
    );

    await multisigClient.sendTransaction({
      to: treasury.address,
      value: 2n * 10n ** 18n,
    });

    const recipientEthBefore = await publicClient.getBalance({ address: recipientClient.account.address });
    const treasuryEthBefore = await publicClient.getBalance({ address: treasury.address });

    await treasury.write.allocateETH([recipientClient.account.address, nativeCap], {
      account: operatorClient.account.address,
    });

    strictEqual(
      (await publicClient.getBalance({ address: recipientClient.account.address })) - recipientEthBefore,
      nativeCap
    );
    strictEqual(treasuryEthBefore - (await publicClient.getBalance({ address: treasury.address })), nativeCap);
    strictEqual(await treasury.read.spentToday([zeroAddress]), nativeCap);
    strictEqual(await treasury.read.spentToday([token.address]), 0n);

    await expectRevert(
      treasury.write.allocateETH([recipientClient.account.address, 1n], {
        account: operatorClient.account.address,
      }),
      "FluxSwapTreasury: DAILY_CAP_EXCEEDED"
    );
  });

  it("should make burnApprovedToken consume the same spender allowance and daily cap accounting as a normal spend", async function () {
    const approvedAmount = 100n * 10n ** 18n;
    const dailyCap = 50n * 10n ** 18n;
    const burnAmount = 40n * 10n ** 18n;

    const capOp = await treasury.read.hashSetDailySpendCap([burnToken.address, dailyCap]);
    await scheduleAndExecute(capOp, () =>
      treasury.write.executeSetDailySpendCap([burnToken.address, dailyCap, capOp])
    );

    const approveOp = await treasury.read.hashApproveSpender([
      burnToken.address,
      spenderClient.account.address,
      approvedAmount,
    ]);
    await scheduleAndExecute(approveOp, () =>
      treasury.write.executeApproveSpender([burnToken.address, spenderClient.account.address, approvedAmount, approveOp])
    );

    const totalSupplyBefore = await burnToken.read.totalSupply();
    const treasuryBalanceBefore = await burnToken.read.balanceOf([treasury.address]);

    // 锁住 burn 路径不能绕过 approved spender / daily cap 这两层记账。
    await treasury.write.burnApprovedToken([burnToken.address, burnAmount], {
      account: spenderClient.account.address,
    });

    strictEqual(totalSupplyBefore - (await burnToken.read.totalSupply()), burnAmount);
    strictEqual(treasuryBalanceBefore - (await burnToken.read.balanceOf([treasury.address])), burnAmount);
    strictEqual(await treasury.read.approvedSpendRemaining([burnToken.address, spenderClient.account.address]), approvedAmount - burnAmount);
    strictEqual(await treasury.read.spentToday([burnToken.address]), burnAmount);

    await expectRevert(
      treasury.write.pullApprovedToken([burnToken.address, 11n * 10n ** 18n], {
        account: spenderClient.account.address,
      }),
      "FluxSwapTreasury: DAILY_CAP_EXCEEDED"
    );
  });

  it("should zero any remaining spender quota after revoke and block further treasury pulls", async function () {
    const approvedAmount = 125n * 10n ** 18n;
    const firstPullAmount = 25n * 10n ** 18n;

    const approveOp = await treasury.read.hashApproveSpender([
      token.address,
      spenderClient.account.address,
      approvedAmount,
    ]);
    await scheduleAndExecute(approveOp, () =>
      treasury.write.executeApproveSpender([token.address, spenderClient.account.address, approvedAmount, approveOp])
    );

    await treasury.write.pullApprovedToken([token.address, firstPullAmount], {
      account: spenderClient.account.address,
    });

    strictEqual(
      await treasury.read.approvedSpendRemaining([token.address, spenderClient.account.address]),
      approvedAmount - firstPullAmount
    );

    const revokeOp = await treasury.read.hashRevokeSpender([token.address, spenderClient.account.address]);
    await scheduleAndExecute(revokeOp, () =>
      treasury.write.executeRevokeSpender([token.address, spenderClient.account.address, revokeOp])
    );

    // 锁住 revoke 必须一次性清空残余额度，不能让 spender 继续把剩余额度提走。
    strictEqual(await treasury.read.approvedSpendRemaining([token.address, spenderClient.account.address]), 0n);

    await expectRevert(
      treasury.write.pullApprovedToken([token.address, 1n], {
        account: spenderClient.account.address,
      }),
      "FluxSwapTreasury: SPENDER_ALLOWANCE_EXCEEDED"
    );
  });

  it("should keep native ETH and ERC20 spend caps independent even when both are consumed in the same day", async function () {
    const tokenCap = 100n * 10n ** 18n;
    const nativeCap = 1n * 10n ** 18n;
    const tokenSpend = 60n * 10n ** 18n;
    const nativeSpend = 6n * 10n ** 17n;

    const allowTokenOp = await treasury.read.hashSetAllowedToken([token.address, true]);
    await scheduleAndExecute(allowTokenOp, () =>
      treasury.write.executeSetAllowedToken([token.address, true, allowTokenOp])
    );

    const allowRecipientOp = await treasury.read.hashSetAllowedRecipient([recipientClient.account.address, true]);
    await scheduleAndExecute(allowRecipientOp, () =>
      treasury.write.executeSetAllowedRecipient([recipientClient.account.address, true, allowRecipientOp])
    );

    const tokenCapOp = await treasury.read.hashSetDailySpendCap([token.address, tokenCap]);
    await scheduleAndExecute(tokenCapOp, () =>
      treasury.write.executeSetDailySpendCap([token.address, tokenCap, tokenCapOp])
    );

    const nativeCapOp = await treasury.read.hashSetDailySpendCap([zeroAddress, nativeCap]);
    await scheduleAndExecute(nativeCapOp, () =>
      treasury.write.executeSetDailySpendCap([zeroAddress, nativeCap, nativeCapOp])
    );

    await multisigClient.sendTransaction({
      to: treasury.address,
      value: 2n * 10n ** 18n,
    });

    // 锁住 token / native 双额度同时被消费时，双方 spentToday 必须各记各的账。
    await treasury.write.allocate([token.address, recipientClient.account.address, tokenSpend], {
      account: operatorClient.account.address,
    });
    await treasury.write.allocateETH([recipientClient.account.address, nativeSpend], {
      account: operatorClient.account.address,
    });

    strictEqual(await treasury.read.spentToday([token.address]), tokenSpend);
    strictEqual(await treasury.read.spentToday([zeroAddress]), nativeSpend);

    await treasury.write.allocate([token.address, recipientClient.account.address, tokenCap - tokenSpend], {
      account: operatorClient.account.address,
    });
    await treasury.write.allocateETH([recipientClient.account.address, nativeCap - nativeSpend], {
      account: operatorClient.account.address,
    });

    await expectRevert(
      treasury.write.allocate([token.address, recipientClient.account.address, 1n], {
        account: operatorClient.account.address,
      }),
      "FluxSwapTreasury: DAILY_CAP_EXCEEDED"
    );
    await expectRevert(
      treasury.write.allocateETH([recipientClient.account.address, 1n], {
        account: operatorClient.account.address,
      }),
      "FluxSwapTreasury: DAILY_CAP_EXCEEDED"
    );
  });

  it("should keep timelocked emergency withdrawals available while paused and isolated from normal spend controls", async function () {
    const tokenEmergencyAmount = 120n * 10n ** 18n;
    const nativeEmergencyAmount = 5n * 10n ** 17n;

    const tokenCapOp = await treasury.read.hashSetDailySpendCap([token.address, 1n]);
    await scheduleAndExecute(tokenCapOp, () =>
      treasury.write.executeSetDailySpendCap([token.address, 1n, tokenCapOp])
    );

    const nativeCapOp = await treasury.read.hashSetDailySpendCap([zeroAddress, 1n]);
    await scheduleAndExecute(nativeCapOp, () =>
      treasury.write.executeSetDailySpendCap([zeroAddress, 1n, nativeCapOp])
    );

    await multisigClient.sendTransaction({
      to: treasury.address,
      value: 1n * 10n ** 18n,
    });

    await treasury.write.pause({
      account: guardianClient.account.address,
    });

    const tokenOperationId = await treasury.read.hashEmergencyWithdraw([
      token.address,
      recipientClient.account.address,
      tokenEmergencyAmount,
    ]);
    const nativeOperationId = await treasury.read.hashEmergencyWithdrawETH([
      recipientClient.account.address,
      nativeEmergencyAmount,
    ]);

    await treasury.write.scheduleOperation([tokenOperationId, timelockDelay], {
      account: multisigClient.account.address,
    });
    await treasury.write.scheduleOperation([nativeOperationId, timelockDelay], {
      account: multisigClient.account.address,
    });
    await networkHelpers.time.increase(Number(timelockDelay));

    const recipientTokenBefore = await token.read.balanceOf([recipientClient.account.address]);
    const recipientEthBefore = await publicClient.getBalance({ address: recipientClient.account.address });

    // 锁住 emergency 路径与普通 allocate 隔离：即使 treasury 已 pause，也仍可按 timelock 执行事故转移。
    await treasury.write.executeEmergencyWithdraw(
      [token.address, recipientClient.account.address, tokenEmergencyAmount, tokenOperationId],
      { account: multisigClient.account.address }
    );
    await treasury.write.executeEmergencyWithdrawETH(
      [recipientClient.account.address, nativeEmergencyAmount, nativeOperationId],
      { account: multisigClient.account.address }
    );

    strictEqual((await token.read.balanceOf([recipientClient.account.address])) - recipientTokenBefore, tokenEmergencyAmount);
    strictEqual(
      (await publicClient.getBalance({ address: recipientClient.account.address })) - recipientEthBefore,
      nativeEmergencyAmount
    );
    strictEqual(await treasury.read.spentToday([token.address]), 0n);
    strictEqual(await treasury.read.spentToday([zeroAddress]), 0n);
    strictEqual(await treasury.read.paused(), true);
  });

  it("should bind each emergency operationId to its exact payload and make it unusable after execution", async function () {
    const emergencyAmount = 120n * 10n ** 18n;
    const operationId = await treasury.read.hashEmergencyWithdraw([
      token.address,
      recipientClient.account.address,
      emergencyAmount,
    ]);

    await treasury.write.scheduleOperation([operationId, timelockDelay], {
      account: multisigClient.account.address,
    });

    // 锁住 operationId 与参数强绑定，不能拿同一个 id 去执行另一笔 emergency withdraw。
    await expectRevert(
      treasury.write.executeEmergencyWithdraw(
        [token.address, recipientClient.account.address, emergencyAmount - 1n, operationId],
        { account: multisigClient.account.address }
      ),
      "FluxSwapTreasury: INVALID_OPERATION"
    );

    await networkHelpers.time.increase(Number(timelockDelay));
    await treasury.write.executeEmergencyWithdraw(
      [token.address, recipientClient.account.address, emergencyAmount, operationId],
      { account: multisigClient.account.address }
    );

    // 再锁住已执行 operationId 不能被直接重放，除非重新 schedule。
    await expectRevert(
      treasury.write.executeEmergencyWithdraw(
        [token.address, recipientClient.account.address, emergencyAmount, operationId],
        { account: multisigClient.account.address }
      ),
      "FluxSwapTreasury: UNKNOWN_OPERATION"
    );
  });

  it("should require a canceled emergency withdrawal to be rescheduled before it can execute again", async function () {
    const emergencyAmount = 80n * 10n ** 18n;
    const operationId = await treasury.read.hashEmergencyWithdraw([
      token.address,
      recipientClient.account.address,
      emergencyAmount,
    ]);

    await treasury.write.scheduleOperation([operationId, timelockDelay], {
      account: multisigClient.account.address,
    });
    await treasury.write.cancelOperation([operationId], {
      account: multisigClient.account.address,
    });

    // 锁住 cancel 之后旧 operationId 进入失效态，不能直接等时间到了再执行。
    await networkHelpers.time.increase(Number(timelockDelay));
    await expectRevert(
      treasury.write.executeEmergencyWithdraw(
        [token.address, recipientClient.account.address, emergencyAmount, operationId],
        { account: multisigClient.account.address }
      ),
      "FluxSwapTreasury: UNKNOWN_OPERATION"
    );

    await treasury.write.scheduleOperation([operationId, timelockDelay], {
      account: multisigClient.account.address,
    });
    await networkHelpers.time.increase(Number(timelockDelay));

    const recipientTokenBefore = await token.read.balanceOf([recipientClient.account.address]);
    await treasury.write.executeEmergencyWithdraw(
      [token.address, recipientClient.account.address, emergencyAmount, operationId],
      { account: multisigClient.account.address }
    );

    strictEqual((await token.read.balanceOf([recipientClient.account.address])) - recipientTokenBefore, emergencyAmount);
  });
});
