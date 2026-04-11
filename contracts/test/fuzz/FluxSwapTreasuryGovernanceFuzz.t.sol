// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";

import "../../contracts/FluxSwapTreasury.sol";
import "../../contracts/mocks/MockERC20.sol";

contract FluxSwapTreasuryGovernanceFuzzTest is Test {
    uint256 private constant MIN_DELAY = 1 days;
    uint256 private constant MAX_AMOUNT = 1e24;

    FluxSwapTreasury private treasury;
    MockERC20 private token;

    address private multisig;
    address private guardian;
    address private operator;
    address private newOperator;
    address private recipient;

    function setUp() public {
        multisig = makeAddr("multisig");
        guardian = makeAddr("guardian");
        operator = makeAddr("operator");
        newOperator = makeAddr("newOperator");
        recipient = makeAddr("recipient");

        treasury = new FluxSwapTreasury(multisig, guardian, operator, MIN_DELAY);
        token = new MockERC20("Treasury Token", "TT", 18);
    }

    // 这一组 fuzz 重点补 treasury 的治理闭环，不再只看 spender 消费，
    // 而是把 timelock 配置、token / ETH allocate、以及双 cap 记账串起来验证：
    // 1. 只有 timelock 生效后的 allowlist 与 cap 才能真正放行支出。
    // 2. token cap 与 native cap 必须各自独立累计，互不串账。
    // 3. operator 路径发起后，余额与 spentToday 必须同时按对应资产精确变化。
    function testFuzz_timelockedConfiguration_enablesTokenAndEthAllocation_withIndependentCaps(
        uint96 rawTokenCap,
        uint96 rawTokenSpend,
        uint96 rawNativeCap,
        uint96 rawNativeSpend
    ) public {
        uint256 tokenCap = bound(uint256(rawTokenCap), 1, MAX_AMOUNT);
        uint256 tokenSpend = bound(uint256(rawTokenSpend), 1, tokenCap);
        uint256 nativeCap = bound(uint256(rawNativeCap), 1, MAX_AMOUNT);
        uint256 nativeSpend = bound(uint256(rawNativeSpend), 1, nativeCap);

        token.mint(address(treasury), tokenCap);
        vm.deal(address(treasury), nativeCap);

        _executeSetAllowedToken(address(token), true);
        _executeSetAllowedRecipient(recipient, true);
        _executeSetDailySpendCap(address(token), tokenCap);
        _executeSetDailySpendCap(address(0), nativeCap);

        vm.startPrank(operator);
        treasury.allocate(address(token), recipient, tokenSpend);
        treasury.allocateETH(recipient, nativeSpend);
        vm.stopPrank();

        assertEq(token.balanceOf(recipient), tokenSpend);
        assertEq(token.balanceOf(address(treasury)), tokenCap - tokenSpend);
        assertEq(recipient.balance, nativeSpend);
        assertEq(address(treasury).balance, nativeCap - nativeSpend);

        assertEq(treasury.spentToday(address(token)), tokenSpend);
        assertEq(treasury.spentToday(address(0)), nativeSpend);
        assertEq(treasury.lastSpendDay(address(token)), block.timestamp / 1 days);
        assertEq(treasury.lastSpendDay(address(0)), block.timestamp / 1 days);
    }

    // 这一组 fuzz 验证 minDelay 更新之后会立即影响后续 schedule 规则，
    // 同时也验证 operator 轮换后权限会跟着切换，不会出现旧 operator 继续可用的松口子。
    function testFuzz_setMinDelayAndRotateOperator_updatesSchedulingAndExecutionAuthority(
        uint32 rawNewDelay,
        uint16 rawTokenCapBps,
        uint16 rawSpendBps
    ) public {
        uint256 newDelay = bound(uint256(rawNewDelay), 1, 30 days);
        uint256 tokenCap = bound((MAX_AMOUNT * uint256(rawTokenCapBps)) / 10_000, 1, MAX_AMOUNT);
        uint256 spendAmount = bound((tokenCap * uint256(rawSpendBps)) / 10_000, 1, tokenCap);

        bytes32 minDelayOp = treasury.hashSetMinDelay(newDelay);
        _schedule(minDelayOp, MIN_DELAY);
        vm.warp(block.timestamp + MIN_DELAY);
        treasury.executeSetMinDelay(newDelay, minDelayOp);

        bytes32 operatorOp = treasury.hashSetOperator(newOperator);

        if (newDelay > 1) {
            vm.prank(multisig);
            vm.expectRevert(bytes("FluxSwapTreasury: DELAY_TOO_SHORT"));
            treasury.scheduleOperation(operatorOp, newDelay - 1);
        }

        _schedule(operatorOp, newDelay);
        vm.warp(block.timestamp + newDelay);
        treasury.executeSetOperator(newOperator, operatorOp);

        token.mint(address(treasury), tokenCap);
        _executeSetAllowedToken(address(token), true);
        _executeSetAllowedRecipient(recipient, true);
        _executeSetDailySpendCap(address(token), tokenCap);

        vm.prank(operator);
        vm.expectRevert(bytes("FluxSwapTreasury: FORBIDDEN"));
        treasury.allocate(address(token), recipient, spendAmount);

        vm.prank(newOperator);
        treasury.allocate(address(token), recipient, spendAmount);

        assertEq(treasury.operator(), newOperator);
        assertEq(token.balanceOf(recipient), spendAmount);
        assertEq(treasury.spentToday(address(token)), spendAmount);
    }

    // 这一组 fuzz 锁定“暂停态 + emergency withdraw”边界：
    // 1. 普通 allocate 在 pause 后必须被拦住。
    // 2. emergency withdraw 不受 pause 与日限额影响，但必须严格等 timelock 到期。
    // 3. token 与 ETH 两条紧急提现路径都要把资产精确转到目标地址。
    function testFuzz_emergencyWithdraw_afterPauseStillRequiresReadyTimelock_andBypassesRegularCaps(
        uint96 rawTokenAmount,
        uint96 rawNativeAmount
    ) public {
        uint256 tokenAmount = bound(uint256(rawTokenAmount), 1, MAX_AMOUNT);
        uint256 nativeAmount = bound(uint256(rawNativeAmount), 1, MAX_AMOUNT);

        token.mint(address(treasury), tokenAmount);
        vm.deal(address(treasury), nativeAmount);

        _executeSetAllowedToken(address(token), true);
        _executeSetAllowedRecipient(recipient, true);
        _executeSetDailySpendCap(address(token), 1);
        _executeSetDailySpendCap(address(0), 1);

        vm.prank(guardian);
        treasury.pause();

        vm.prank(operator);
        vm.expectRevert(bytes("FluxSwapTreasury: PAUSED"));
        treasury.allocate(address(token), recipient, 1);

        vm.prank(operator);
        vm.expectRevert(bytes("FluxSwapTreasury: PAUSED"));
        treasury.allocateETH(recipient, 1);

        bytes32 tokenOp = treasury.hashEmergencyWithdraw(address(token), recipient, tokenAmount);
        bytes32 nativeOp = treasury.hashEmergencyWithdrawETH(recipient, nativeAmount);

        _schedule(tokenOp, MIN_DELAY);
        _schedule(nativeOp, MIN_DELAY);

        vm.expectRevert(bytes("FluxSwapTreasury: OPERATION_NOT_READY"));
        treasury.executeEmergencyWithdraw(address(token), recipient, tokenAmount, tokenOp);

        vm.expectRevert(bytes("FluxSwapTreasury: OPERATION_NOT_READY"));
        treasury.executeEmergencyWithdrawETH(recipient, nativeAmount, nativeOp);

        vm.warp(block.timestamp + MIN_DELAY);

        treasury.executeEmergencyWithdraw(address(token), recipient, tokenAmount, tokenOp);
        treasury.executeEmergencyWithdrawETH(recipient, nativeAmount, nativeOp);

        assertEq(token.balanceOf(recipient), tokenAmount);
        assertEq(token.balanceOf(address(treasury)), 0);
        assertEq(recipient.balance, nativeAmount);
        assertEq(address(treasury).balance, 0);
        assertEq(treasury.operationReadyAt(tokenOp), 0);
        assertEq(treasury.operationReadyAt(nativeOp), 0);
    }

    function _executeSetAllowedToken(address tokenAddress, bool allowed) private {
        bytes32 operationId = treasury.hashSetAllowedToken(tokenAddress, allowed);
        _schedule(operationId, treasury.minDelay());
        vm.warp(block.timestamp + treasury.minDelay());
        treasury.executeSetAllowedToken(tokenAddress, allowed, operationId);
    }

    function _executeSetAllowedRecipient(address recipientAddress, bool allowed) private {
        bytes32 operationId = treasury.hashSetAllowedRecipient(recipientAddress, allowed);
        _schedule(operationId, treasury.minDelay());
        vm.warp(block.timestamp + treasury.minDelay());
        treasury.executeSetAllowedRecipient(recipientAddress, allowed, operationId);
    }

    function _executeSetDailySpendCap(address asset, uint256 cap) private {
        bytes32 operationId = treasury.hashSetDailySpendCap(asset, cap);
        _schedule(operationId, treasury.minDelay());
        vm.warp(block.timestamp + treasury.minDelay());
        treasury.executeSetDailySpendCap(asset, cap, operationId);
    }

    function _schedule(bytes32 operationId, uint256 delay) private {
        vm.prank(multisig);
        treasury.scheduleOperation(operationId, delay);
    }
}
