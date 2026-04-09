import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

// 回归目标：
// 1. 锁住 treasury 的暂停、恢复、operator 变更等治理边界，不让支出权限意外放宽。
// 2. 锁住 approved spender / daily cap / revoke / burn 这套金库记账链路，避免绕过 treasury 内部会计。
// 3. 锁住原生 ETH 与 ERC20 的 spend cap、spentToday 统计彼此隔离。
// 4. 锁住 emergency withdraw 与普通 allocate 的边界，确保事故转移路径仍受 timelock 精确约束。
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

  // 模块一：暂停与治理边界
  // 对应 README 已覆盖点：
  // - treasury 暂停后，AMM 交易仍然可以把协议手续费打入 treasury。
  // - treasury 暂停后，operator 不能继续从 treasury 对外分配资产。
  // - guardian 可以暂停 treasury，但只有 multisig 可以恢复 treasury。
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

  it("should keep guardian pause and multisig-only unpause boundaries intact", async function () {
    const spendAmount = 25n * 10n ** 18n;
    const allowTokenOp = await treasury.read.hashSetAllowedToken([token.address, true]);
    await scheduleAndExecute(allowTokenOp, () =>
      treasury.write.executeSetAllowedToken([token.address, true, allowTokenOp])
    );

    const allowRecipientOp = await treasury.read.hashSetAllowedRecipient([recipientClient.account.address, true]);
    await scheduleAndExecute(allowRecipientOp, () =>
      treasury.write.executeSetAllowedRecipient([recipientClient.account.address, true, allowRecipientOp])
    );

    const capOp = await treasury.read.hashSetDailySpendCap([token.address, spendAmount]);
    await scheduleAndExecute(capOp, () =>
      treasury.write.executeSetDailySpendCap([token.address, spendAmount, capOp])
    );

    // 锁住 guardian 只能暂停、不能恢复；恢复权必须仍然只属于 multisig。
    await treasury.write.pause({
      account: guardianClient.account.address,
    });

    strictEqual(await treasury.read.paused(), true);

    await expectRevert(
      treasury.write.unpause({
        account: guardianClient.account.address,
      }),
      "FluxSwapTreasury: FORBIDDEN"
    );

    await treasury.write.unpause({
      account: multisigClient.account.address,
    });

    strictEqual(await treasury.read.paused(), false);

    await treasury.write.allocate([token.address, recipientClient.account.address, spendAmount], {
      account: operatorClient.account.address,
    });

    strictEqual(await token.read.balanceOf([recipientClient.account.address]), spendAmount);
  });

  // 模块二：approved spender、治理调度与 token 支出记账
  // 对应 README 已覆盖点：
  // - approved spender 不能通过 ERC20 allowance 直接绕过 treasury 记账。
  // - approved spender 只能通过 pullApprovedToken 等 treasury 入口消耗额度。
  // - operator 变更只能由 multisig schedule，且 timelock 未到期前不能提前执行。
  // - treasury 对非标准 ERC20 的 approved pull 路径也必须继续兼容。
  // - 仅完成 token / recipient 白名单还不够；如果 daily cap 未配置，allocate 仍必须被阻断。
  // - burnApprovedToken 会消耗 approved spender 剩余额度，并占用同一套 dailySpendCap 记账。
  // - executeRevokeSpender 会立即清空剩余额度，防止 spender 继续提走残留资产。
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

  it("should keep operator changes behind multisig scheduling and timelock readiness", async function () {
    const operationId = await treasury.read.hashSetOperator([recipientClient.account.address]);

    // 这里锁住治理改动的最小安全面：operator 变更只能由 multisig schedule，且 timelock 未到期前绝不能提前执行。
    await expectRevert(
      treasury.write.scheduleOperation([operationId, timelockDelay], {
        account: guardianClient.account.address,
      }),
      "FluxSwapTreasury: FORBIDDEN"
    );

    await treasury.write.scheduleOperation([operationId, timelockDelay], {
      account: multisigClient.account.address,
    });

    await expectRevert(
      treasury.write.executeSetOperator([recipientClient.account.address, operationId]),
      "FluxSwapTreasury: OPERATION_NOT_READY"
    );

    await networkHelpers.time.increase(Number(timelockDelay));
    await treasury.write.executeSetOperator([recipientClient.account.address, operationId]);

    strictEqual((await treasury.read.operator()).toLowerCase(), recipientClient.account.address.toLowerCase());
  });
  it("should keep treasury-approved pulls working for tokens whose approve function returns no bool", async function () {
    const noReturnToken = await viem.deployContract("MockNoReturnERC20", ["No Return Token", "NRT", 18]);
    const approvedAmount = 250n * 10n ** 18n;
    const pullAmount = 125n * 10n ** 18n;

    await noReturnToken.write.mint([treasury.address, 1_000n * 10n ** 18n]);

    const approveOp = await treasury.read.hashApproveSpender([
      noReturnToken.address,
      spenderClient.account.address,
      approvedAmount,
    ]);
    await scheduleAndExecute(approveOp, () =>
      treasury.write.executeApproveSpender([noReturnToken.address, spenderClient.account.address, approvedAmount, approveOp])
    );

    // 这里锁住非标准 ERC20 兼容性：即便 approve 不返回 bool，treasury 的内部额度拉取路径也必须继续可用。
    await treasury.write.pullApprovedToken([noReturnToken.address, pullAmount], {
      account: spenderClient.account.address,
    });

    strictEqual(await noReturnToken.read.allowance([treasury.address, spenderClient.account.address]), 0n);
    strictEqual(await noReturnToken.read.balanceOf([spenderClient.account.address]), pullAmount);
    strictEqual(
      await treasury.read.approvedSpendRemaining([noReturnToken.address, spenderClient.account.address]),
      approvedAmount - pullAmount
    );
  });

  it("should keep token allocations blocked until a daily spend cap is explicitly configured", async function () {
    const allowTokenOp = await treasury.read.hashSetAllowedToken([token.address, true]);
    await scheduleAndExecute(allowTokenOp, () =>
      treasury.write.executeSetAllowedToken([token.address, true, allowTokenOp])
    );

    const allowRecipientOp = await treasury.read.hashSetAllowedRecipient([recipientClient.account.address, true]);
    await scheduleAndExecute(allowRecipientOp, () =>
      treasury.write.executeSetAllowedRecipient([recipientClient.account.address, true, allowRecipientOp])
    );

    // 这里锁住“白名单不等于可支出”：如果 daily cap 没配，operator 仍然绝不能把资产从 treasury 放出去。
    await expectRevert(
      treasury.write.allocate([token.address, recipientClient.account.address, 10n * 10n ** 18n], {
        account: operatorClient.account.address,
      }),
      "FluxSwapTreasury: SPEND_CAP_NOT_SET"
    );
  });

  // 模块三：原生 ETH 与 ERC20 双额度隔离
  // 对应 README 已覆盖点：
  // - 原生 ETH 使用 address(0) 的单独 spend cap 记账。
  // - 原生 ETH 的 spend cap 不会污染 ERC20 的 spentToday 统计。
  // - token 与 native 双 spend cap 在同一天同时消费时仍保持独立。
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

  // 模块四：emergency withdraw 与普通支出隔离
  // 对应 README 已覆盖点：
  // - executeEmergencyWithdraw / executeEmergencyWithdrawETH 与普通 allocate 路径隔离，即使 treasury 已暂停也能在 timelock 到期后执行。
  // - emergency withdraw 的 operationId 与参数强绑定，且执行后不能被直接重放。
  // - emergency withdraw 被 cancel 后，必须重新 schedule 才能再次执行。
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
