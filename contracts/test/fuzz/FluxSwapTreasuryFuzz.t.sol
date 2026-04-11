// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";

import "../../contracts/FluxSwapTreasury.sol";
import "../../contracts/mocks/MockERC20.sol";

contract FluxBurnableMockERC20 is MockERC20 {
    constructor(string memory name_, string memory symbol_, uint8 decimals_) MockERC20(name_, symbol_, decimals_) {}

    function burn(uint256 amount) external {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;
        emit Transfer(msg.sender, address(0), amount);
    }
}

contract FluxSwapTreasuryFuzzTest is Test {
    uint256 private constant MAX_AMOUNT = 1e24;
    uint256 private constant MIN_DELAY = 1 days;

    FluxSwapTreasury private treasury;
    MockERC20 private spendToken;
    FluxBurnableMockERC20 private burnToken;

    address private multisig;
    address private guardian;
    address private operator;
    address private spender;
    address private recipient;

    function setUp() public {
        multisig = makeAddr("multisig");
        guardian = makeAddr("guardian");
        operator = makeAddr("operator");
        spender = makeAddr("spender");
        recipient = makeAddr("recipient");

        treasury = new FluxSwapTreasury(multisig, guardian, operator, MIN_DELAY);
        spendToken = new MockERC20("Spend Token", "SPEND", 18);
        burnToken = new FluxBurnableMockERC20("Burn Token", "BURN", 18);
    }

    // 这一组 fuzz 重点验证金库里“授权额度 + 日限额 + 暂停态”三条线不会互相打穿：
    // 1. approved spender 拉走或燃烧资产后，remaining / spentToday / 余额必须一起精确变化。
    // 2. 跨天后 spentToday 必须只反映新一天的消耗，不能把前一天累计带过来。
    // 3. pause 之后，approved spender 的三条消费路径都必须被统一拦住。
    function testFuzz_pullApprovedToken_consumesAllowanceAndDailyCap(
        uint96 rawAllowance,
        uint96 rawCap,
        uint16 rawUseBps
    ) public {
        uint256 allowanceAmount = bound(uint256(rawAllowance), 1, MAX_AMOUNT);
        uint256 dailyCap = bound(uint256(rawCap), allowanceAmount, MAX_AMOUNT);
        uint256 amount = bound((allowanceAmount * uint256(rawUseBps)) / 10_000, 1, allowanceAmount);

        spendToken.mint(address(treasury), allowanceAmount);
        _approveSpender(address(spendToken), spender, allowanceAmount);
        _setDailySpendCap(address(spendToken), dailyCap);

        uint256 treasuryBalanceBefore = spendToken.balanceOf(address(treasury));
        uint256 spenderBalanceBefore = spendToken.balanceOf(spender);

        vm.prank(spender);
        treasury.pullApprovedToken(address(spendToken), amount);

        assertEq(treasury.approvedSpendRemaining(address(spendToken), spender), allowanceAmount - amount);
        assertEq(treasury.spentToday(address(spendToken)), amount);
        assertEq(spendToken.balanceOf(address(treasury)), treasuryBalanceBefore - amount);
        assertEq(spendToken.balanceOf(spender), spenderBalanceBefore + amount);
    }

    function testFuzz_burnApprovedToken_consumesAllowanceAndReducesSupply(
        uint96 rawAllowance,
        uint96 rawCap,
        uint16 rawUseBps
    ) public {
        uint256 allowanceAmount = bound(uint256(rawAllowance), 1, MAX_AMOUNT);
        uint256 dailyCap = bound(uint256(rawCap), allowanceAmount, MAX_AMOUNT);
        uint256 amount = bound((allowanceAmount * uint256(rawUseBps)) / 10_000, 1, allowanceAmount);

        burnToken.mint(address(treasury), allowanceAmount);
        _approveSpender(address(burnToken), spender, allowanceAmount);
        _setDailySpendCap(address(burnToken), dailyCap);

        uint256 treasuryBalanceBefore = burnToken.balanceOf(address(treasury));
        uint256 supplyBefore = burnToken.totalSupply();

        vm.prank(spender);
        treasury.burnApprovedToken(address(burnToken), amount);

        assertEq(treasury.approvedSpendRemaining(address(burnToken), spender), allowanceAmount - amount);
        assertEq(treasury.spentToday(address(burnToken)), amount);
        assertEq(burnToken.balanceOf(address(treasury)), treasuryBalanceBefore - amount);
        assertEq(burnToken.totalSupply(), supplyBefore - amount);
    }

    function testFuzz_consumeApprovedSpenderCap_resetsSpentTodayAfterDayRollover(
        uint96 rawCap,
        uint96 rawFirstAmount,
        uint96 rawSecondAmount
    ) public {
        uint256 dailyCap = bound(uint256(rawCap), 2, MAX_AMOUNT);
        uint256 firstAmount = bound(uint256(rawFirstAmount), 1, dailyCap);
        uint256 secondAmount = bound(uint256(rawSecondAmount), 1, dailyCap);
        uint256 totalAllowance = firstAmount + secondAmount;

        _approveSpender(address(spendToken), spender, totalAllowance);
        _setDailySpendCap(address(spendToken), dailyCap);

        vm.prank(spender);
        treasury.consumeApprovedSpenderCap(address(spendToken), firstAmount);

        uint256 initialDay = block.timestamp / 1 days;
        assertEq(treasury.spentToday(address(spendToken)), firstAmount);
        assertEq(treasury.lastSpendDay(address(spendToken)), initialDay);

        vm.warp(block.timestamp + 1 days);

        vm.prank(spender);
        treasury.consumeApprovedSpenderCap(address(spendToken), secondAmount);

        assertEq(treasury.spentToday(address(spendToken)), secondAmount);
        assertEq(treasury.lastSpendDay(address(spendToken)), block.timestamp / 1 days);
        assertEq(treasury.approvedSpendRemaining(address(spendToken), spender), 0);
    }

    function testFuzz_pause_blocksApprovedSpenderConsumption(uint96 rawAllowance, uint16 rawUseBps) public {
        uint256 allowanceAmount = bound(uint256(rawAllowance), 1, MAX_AMOUNT);
        uint256 amount = bound((allowanceAmount * uint256(rawUseBps)) / 10_000, 1, allowanceAmount);

        spendToken.mint(address(treasury), allowanceAmount);
        burnToken.mint(address(treasury), allowanceAmount);
        _approveSpender(address(spendToken), spender, allowanceAmount);
        _approveSpender(address(burnToken), spender, allowanceAmount);
        _setDailySpendCap(address(spendToken), allowanceAmount);
        _setDailySpendCap(address(burnToken), allowanceAmount);

        vm.prank(guardian);
        treasury.pause();

        vm.startPrank(spender);
        vm.expectRevert(bytes("FluxSwapTreasury: PAUSED"));
        treasury.consumeApprovedSpenderCap(address(spendToken), amount);

        vm.expectRevert(bytes("FluxSwapTreasury: PAUSED"));
        treasury.pullApprovedToken(address(spendToken), amount);

        vm.expectRevert(bytes("FluxSwapTreasury: PAUSED"));
        treasury.burnApprovedToken(address(burnToken), amount);
        vm.stopPrank();
    }

    function _approveSpender(address token, address approvedSpender, uint256 amount) private {
        bytes32 operationId = treasury.hashApproveSpender(token, approvedSpender, amount);

        vm.prank(multisig);
        treasury.scheduleOperation(operationId, MIN_DELAY);

        vm.warp(block.timestamp + MIN_DELAY);
        treasury.executeApproveSpender(token, approvedSpender, amount, operationId);
    }

    function _setDailySpendCap(address token, uint256 amount) private {
        bytes32 operationId = treasury.hashSetDailySpendCap(token, amount);

        vm.prank(multisig);
        treasury.scheduleOperation(operationId, MIN_DELAY);

        vm.warp(block.timestamp + MIN_DELAY);
        treasury.executeSetDailySpendCap(token, amount, operationId);
    }
}
