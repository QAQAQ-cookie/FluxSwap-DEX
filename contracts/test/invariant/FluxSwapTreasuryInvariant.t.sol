// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "forge-std/StdInvariant.sol";

import "../../contracts/FluxSwapTreasury.sol";
import "../../contracts/mocks/MockERC20.sol";

contract FluxTreasuryInvariantBurnableMockERC20 is MockERC20 {
    constructor(string memory name_, string memory symbol_, uint8 decimals_) MockERC20(name_, symbol_, decimals_) {}

    function burn(uint256 amount) external {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;
        emit Transfer(msg.sender, address(0), amount);
    }
}

contract FluxSwapTreasuryInvariantHandler is Test {
    uint256 private constant MAX_AMOUNT = 1e24;

    FluxSwapTreasury public immutable treasury;
    MockERC20 public immutable spendToken;
    FluxTreasuryInvariantBurnableMockERC20 public immutable burnToken;

    address public immutable multisig;
    address public immutable guardian;
    address public immutable operator;
    address public immutable spender;
    address public immutable recipient;
    uint256 public immutable minDelay;

    uint256 public totalMintedSpendToken;
    uint256 public totalMintedBurnToken;
    uint256 public totalBurnedBurnToken;

    mapping(address => uint256) public modeledApprovedRemaining;
    mapping(address => uint256) public modeledSpentToday;
    mapping(address => uint256) public modeledLastSpendDay;

    constructor(
        FluxSwapTreasury treasury_,
        MockERC20 spendToken_,
        FluxTreasuryInvariantBurnableMockERC20 burnToken_,
        address multisig_,
        address guardian_,
        address operator_,
        address spender_,
        address recipient_,
        uint256 minDelay_
    ) {
        treasury = treasury_;
        spendToken = spendToken_;
        burnToken = burnToken_;
        multisig = multisig_;
        guardian = guardian_;
        operator = operator_;
        spender = spender_;
        recipient = recipient_;
        minDelay = minDelay_;
    }

    function topUpSpendToken(uint256 rawAmount) external {
        uint256 amount = bound(rawAmount, 1, MAX_AMOUNT);
        spendToken.mint(address(treasury), amount);
        totalMintedSpendToken += amount;
    }

    function topUpBurnToken(uint256 rawAmount) external {
        uint256 amount = bound(rawAmount, 1, MAX_AMOUNT);
        burnToken.mint(address(treasury), amount);
        totalMintedBurnToken += amount;
    }

    function configureAllowedToken(uint8 tokenSeed, bool allowed) external {
        address token = _tokenFromSeed(tokenSeed);
        bytes32 operationId = treasury.hashSetAllowedToken(token, allowed);

        vm.prank(multisig);
        treasury.scheduleOperation(operationId, minDelay);

        vm.warp(block.timestamp + minDelay);
        treasury.executeSetAllowedToken(token, allowed, operationId);
    }

    function configureAllowedRecipient(bool allowed) external {
        bytes32 operationId = treasury.hashSetAllowedRecipient(recipient, allowed);

        vm.prank(multisig);
        treasury.scheduleOperation(operationId, minDelay);

        vm.warp(block.timestamp + minDelay);
        treasury.executeSetAllowedRecipient(recipient, allowed, operationId);
    }

    function configureDailySpendCap(uint8 tokenSeed, uint256 rawCap) external {
        address token = _tokenFromSeed(tokenSeed);
        uint256 cap = bound(rawCap, 0, MAX_AMOUNT);
        bytes32 operationId = treasury.hashSetDailySpendCap(token, cap);

        vm.prank(multisig);
        treasury.scheduleOperation(operationId, minDelay);

        vm.warp(block.timestamp + minDelay);
        treasury.executeSetDailySpendCap(token, cap, operationId);
    }

    function approveSpender(uint8 tokenSeed, uint256 rawAmount) external {
        address token = _tokenFromSeed(tokenSeed);
        uint256 amount = bound(rawAmount, 1, MAX_AMOUNT);
        bytes32 operationId = treasury.hashApproveSpender(token, spender, amount);

        vm.prank(multisig);
        treasury.scheduleOperation(operationId, minDelay);

        vm.warp(block.timestamp + minDelay);
        treasury.executeApproveSpender(token, spender, amount, operationId);

        modeledApprovedRemaining[token] = amount;
    }

    function revokeSpender(uint8 tokenSeed) external {
        address token = _tokenFromSeed(tokenSeed);
        bytes32 operationId = treasury.hashRevokeSpender(token, spender);

        vm.prank(multisig);
        treasury.scheduleOperation(operationId, minDelay);

        vm.warp(block.timestamp + minDelay);
        treasury.executeRevokeSpender(token, spender, operationId);

        modeledApprovedRemaining[token] = 0;
    }

    function allocate(uint8 tokenSeed, uint256 rawAmount) external {
        if (treasury.paused()) {
            return;
        }

        address token = _tokenFromSeed(tokenSeed);
        if (!treasury.allowedTokens(token) || !treasury.allowedRecipients(recipient)) {
            return;
        }

        uint256 cap = treasury.dailySpendCap(token);
        if (cap == 0) {
            return;
        }

        uint256 balance = MockERC20(token).balanceOf(address(treasury));
        uint256 remainingCap = _remainingDailyCap(token, cap);
        uint256 maxSpendable = balance < remainingCap ? balance : remainingCap;
        if (maxSpendable == 0) {
            return;
        }

        uint256 amount = bound(rawAmount, 1, maxSpendable);

        vm.prank(operator);
        treasury.allocate(token, recipient, amount);

        _modelConsumeCap(token, amount);
    }

    function pullApprovedSpendToken(uint256 rawAmount) external {
        if (treasury.paused()) {
            return;
        }

        uint256 allowance = treasury.approvedSpendRemaining(address(spendToken), spender);
        uint256 balance = spendToken.balanceOf(address(treasury));
        uint256 maxSpendable = allowance < balance ? allowance : balance;

        uint256 cap = treasury.dailySpendCap(address(spendToken));
        if (cap > 0) {
            uint256 remainingCap = _remainingDailyCap(address(spendToken), cap);
            maxSpendable = maxSpendable < remainingCap ? maxSpendable : remainingCap;
        }

        if (maxSpendable == 0) {
            return;
        }

        uint256 amount = bound(rawAmount, 1, maxSpendable);

        vm.prank(spender);
        treasury.pullApprovedToken(address(spendToken), amount);

        modeledApprovedRemaining[address(spendToken)] -= amount;
        _modelConsumeCapIfConfigured(address(spendToken), amount);
    }

    function burnApprovedBurnToken(uint256 rawAmount) external {
        if (treasury.paused()) {
            return;
        }

        uint256 allowance = treasury.approvedSpendRemaining(address(burnToken), spender);
        uint256 balance = burnToken.balanceOf(address(treasury));
        uint256 maxSpendable = allowance < balance ? allowance : balance;

        uint256 cap = treasury.dailySpendCap(address(burnToken));
        if (cap > 0) {
            uint256 remainingCap = _remainingDailyCap(address(burnToken), cap);
            maxSpendable = maxSpendable < remainingCap ? maxSpendable : remainingCap;
        }

        if (maxSpendable == 0) {
            return;
        }

        uint256 amount = bound(rawAmount, 1, maxSpendable);

        vm.prank(spender);
        treasury.burnApprovedToken(address(burnToken), amount);

        modeledApprovedRemaining[address(burnToken)] -= amount;
        totalBurnedBurnToken += amount;
        _modelConsumeCapIfConfigured(address(burnToken), amount);
    }

    function consumeApprovedCap(uint8 tokenSeed, uint256 rawAmount) external {
        if (treasury.paused()) {
            return;
        }

        address token = _tokenFromSeed(tokenSeed);
        uint256 allowance = treasury.approvedSpendRemaining(token, spender);
        if (allowance == 0) {
            return;
        }

        uint256 maxSpendable = allowance;
        uint256 cap = treasury.dailySpendCap(token);
        if (cap > 0) {
            uint256 remainingCap = _remainingDailyCap(token, cap);
            maxSpendable = maxSpendable < remainingCap ? maxSpendable : remainingCap;
        }

        if (maxSpendable == 0) {
            return;
        }

        uint256 amount = bound(rawAmount, 1, maxSpendable);

        vm.prank(spender);
        treasury.consumeApprovedSpenderCap(token, amount);

        modeledApprovedRemaining[token] -= amount;
        _modelConsumeCapIfConfigured(token, amount);
    }

    function pauseTreasury() external {
        if (!treasury.paused()) {
            vm.prank(guardian);
            treasury.pause();
        }
    }

    function unpauseTreasury() external {
        if (treasury.paused()) {
            vm.prank(multisig);
            treasury.unpause();
        }
    }

    function advanceTime(uint32 rawSeconds) external {
        uint256 secondsToSkip = bound(uint256(rawSeconds), 1, 3 days);
        vm.warp(block.timestamp + secondsToSkip);
    }

    function _tokenFromSeed(uint8 tokenSeed) private view returns (address) {
        return tokenSeed % 2 == 0 ? address(spendToken) : address(burnToken);
    }

    function _remainingDailyCap(address token, uint256 cap) private view returns (uint256) {
        uint256 currentDay = block.timestamp / 1 days;
        if (treasury.lastSpendDay(token) != currentDay) {
            return cap;
        }

        uint256 spent = treasury.spentToday(token);
        return spent >= cap ? 0 : cap - spent;
    }

    function _modelConsumeCapIfConfigured(address token, uint256 amount) private {
        if (treasury.dailySpendCap(token) == 0) {
            return;
        }

        _modelConsumeCap(token, amount);
    }

    function _modelConsumeCap(address token, uint256 amount) private {
        uint256 currentDay = block.timestamp / 1 days;
        if (modeledLastSpendDay[token] != currentDay) {
            modeledLastSpendDay[token] = currentDay;
            modeledSpentToday[token] = 0;
        }

        modeledSpentToday[token] += amount;
    }
}

contract FluxSwapTreasuryInvariantTest is StdInvariant, Test {
    uint256 private constant MIN_DELAY = 1 days;

    FluxSwapTreasury private treasury;
    MockERC20 private spendToken;
    FluxTreasuryInvariantBurnableMockERC20 private burnToken;
    FluxSwapTreasuryInvariantHandler private handler;

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
        burnToken = new FluxTreasuryInvariantBurnableMockERC20("Burn Token", "BURN", 18);

        handler = new FluxSwapTreasuryInvariantHandler(
            treasury,
            spendToken,
            burnToken,
            multisig,
            guardian,
            operator,
            spender,
            recipient,
            MIN_DELAY
        );

        targetContract(address(handler));
    }

    // 不变量 1：spendToken 总账必须始终守恒，只能在 treasury、recipient、spender 三处流转。
    function invariant_spendTokenConservation() public view {
        assertEq(
            handler.totalMintedSpendToken(),
            spendToken.balanceOf(address(treasury)) + spendToken.balanceOf(recipient) + spendToken.balanceOf(spender)
        );
    }

    // 不变量 2：burnToken 总账必须始终闭合，烧毁量只能来自 treasury 的授权 burn 路径。
    function invariant_burnTokenConservation() public view {
        assertEq(
            handler.totalMintedBurnToken(),
            burnToken.balanceOf(address(treasury)) + burnToken.balanceOf(recipient) + handler.totalBurnedBurnToken()
        );
    }

    // 不变量 3：授权额度模型必须与 treasury 内部账本完全一致，避免 allowance 记账漂移。
    function invariant_approvedSpenderAllowanceMatchesModel() public view {
        assertEq(
            treasury.approvedSpendRemaining(address(spendToken), spender),
            handler.modeledApprovedRemaining(address(spendToken))
        );
        assertEq(
            treasury.approvedSpendRemaining(address(burnToken), spender),
            handler.modeledApprovedRemaining(address(burnToken))
        );
    }

    // 不变量 4：daily cap 相关的 spentToday / lastSpendDay 必须与参考模型一致。
    function invariant_dailyCapAccountingMatchesModel() public view {
        assertEq(treasury.spentToday(address(spendToken)), handler.modeledSpentToday(address(spendToken)));
        assertEq(treasury.spentToday(address(burnToken)), handler.modeledSpentToday(address(burnToken)));
        assertEq(treasury.lastSpendDay(address(spendToken)), handler.modeledLastSpendDay(address(spendToken)));
        assertEq(treasury.lastSpendDay(address(burnToken)), handler.modeledLastSpendDay(address(burnToken)));
    }
}
