// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/IBurnableERC20.sol";
import "../interfaces/IERC20.sol";
import "../libraries/TransferHelper.sol";

contract FluxSwapTreasury {
    address public immutable multisig;
    address public operator;
    address public guardian;
    uint256 public minDelay;
    bool public paused;

    mapping(address => bool) public allowedTokens;
    mapping(address => bool) public allowedRecipients;
    mapping(address => uint256) public dailySpendCap;
    mapping(address => uint256) public spentToday;
    mapping(address => uint256) public lastSpendDay;
    mapping(address => mapping(address => uint256)) public approvedSpendRemaining;
    mapping(bytes32 => uint256) public operationReadyAt;

    event OperationScheduled(bytes32 indexed operationId, uint256 executeAfter, address indexed scheduler);
    event OperationCancelled(bytes32 indexed operationId, address indexed canceller);
    event OperationExecuted(bytes32 indexed operationId, address indexed executor);

    event OperatorUpdated(address indexed oldOperator, address indexed newOperator);
    event GuardianUpdated(address indexed oldGuardian, address indexed newGuardian);
    event MinDelayUpdated(uint256 oldMinDelay, uint256 newMinDelay);
    event AllowedTokenUpdated(address indexed token, bool allowed);
    event AllowedRecipientUpdated(address indexed recipient, bool allowed);
    event DailySpendCapUpdated(address indexed token, uint256 oldCap, uint256 newCap);
    event AllocationExecuted(address indexed token, address indexed to, uint256 amount, address indexed executor);
    event NativeAllocationExecuted(address indexed to, uint256 amount, address indexed executor);
    event SpenderApproved(address indexed token, address indexed spender, uint256 amount);
    event SpenderRevoked(address indexed token, address indexed spender);
    event ApprovedSpenderCapConsumed(address indexed token, address indexed spender, uint256 amount, uint256 remaining);
    event ApprovedSpenderTokenPulled(
        address indexed token,
        address indexed spender,
        uint256 amount,
        uint256 remaining
    );
    event ApprovedSpenderTokenBurned(address indexed token, address indexed spender, uint256 amount, uint256 remaining);
    event EmergencyWithdraw(address indexed token, address indexed to, uint256 amount);
    event NativeEmergencyWithdraw(address indexed to, uint256 amount);
    event NativeReceived(address indexed from, uint256 amount);
    event Paused(address indexed account);
    event Unpaused(address indexed account);

    modifier onlyMultisig() {
        require(msg.sender == multisig, "FluxSwapTreasury: FORBIDDEN");
        _;
    }

    modifier onlyOperatorOrMultisig() {
        require(msg.sender == operator || msg.sender == multisig, "FluxSwapTreasury: FORBIDDEN");
        _;
    }

    modifier onlyGuardianOrMultisig() {
        require(msg.sender == guardian || msg.sender == multisig, "FluxSwapTreasury: FORBIDDEN");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "FluxSwapTreasury: PAUSED");
        _;
    }

    constructor(address _multisig, address _guardian, address _operator, uint256 _minDelay) {
        require(_multisig != address(0), "FluxSwapTreasury: ZERO_ADDRESS");
        require(_guardian != address(0), "FluxSwapTreasury: ZERO_ADDRESS");
        require(_operator != address(0), "FluxSwapTreasury: ZERO_ADDRESS");
        require(_minDelay > 0, "FluxSwapTreasury: INVALID_DELAY");

        multisig = _multisig;
        guardian = _guardian;
        operator = _operator;
        minDelay = _minDelay;
    }

    receive() external payable {
        emit NativeReceived(msg.sender, msg.value);
    }

    function pause() external onlyGuardianOrMultisig {
        require(!paused, "FluxSwapTreasury: PAUSED");
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyMultisig {
        require(paused, "FluxSwapTreasury: NOT_PAUSED");
        paused = false;
        emit Unpaused(msg.sender);
    }

    function scheduleOperation(bytes32 operationId, uint256 delay) external onlyMultisig {
        require(operationId != bytes32(0), "FluxSwapTreasury: INVALID_OPERATION");
        require(delay >= minDelay, "FluxSwapTreasury: DELAY_TOO_SHORT");
        require(operationReadyAt[operationId] == 0, "FluxSwapTreasury: OPERATION_EXISTS");

        uint256 executeAfter = block.timestamp + delay;
        operationReadyAt[operationId] = executeAfter;

        emit OperationScheduled(operationId, executeAfter, msg.sender);
    }

    function cancelOperation(bytes32 operationId) external onlyMultisig {
        require(operationReadyAt[operationId] != 0, "FluxSwapTreasury: UNKNOWN_OPERATION");
        delete operationReadyAt[operationId];
        emit OperationCancelled(operationId, msg.sender);
    }

    function allocate(address token, address to, uint256 amount) external onlyOperatorOrMultisig whenNotPaused {
        require(allowedTokens[token], "FluxSwapTreasury: TOKEN_NOT_ALLOWED");
        require(allowedRecipients[to], "FluxSwapTreasury: RECIPIENT_NOT_ALLOWED");
        _consumeCap(token, amount);
        TransferHelper.safeTransfer(token, to, amount);
        emit AllocationExecuted(token, to, amount, msg.sender);
    }

    function allocateETH(address to, uint256 amount) external onlyOperatorOrMultisig whenNotPaused {
        require(allowedRecipients[to], "FluxSwapTreasury: RECIPIENT_NOT_ALLOWED");
        _consumeCap(address(0), amount);
        TransferHelper.safeTransferETH(to, amount);
        emit NativeAllocationExecuted(to, amount, msg.sender);
    }

    function executeSetOperator(address newOperator, bytes32 operationId) external {
        require(newOperator != address(0), "FluxSwapTreasury: ZERO_ADDRESS");
        _consumeOperation(operationId, hashSetOperator(newOperator));
        address oldOperator = operator;
        operator = newOperator;
        emit OperatorUpdated(oldOperator, newOperator);
    }

    function executeSetGuardian(address newGuardian, bytes32 operationId) external {
        require(newGuardian != address(0), "FluxSwapTreasury: ZERO_ADDRESS");
        _consumeOperation(operationId, hashSetGuardian(newGuardian));
        address oldGuardian = guardian;
        guardian = newGuardian;
        emit GuardianUpdated(oldGuardian, newGuardian);
    }

    function executeSetMinDelay(uint256 newMinDelay, bytes32 operationId) external {
        require(newMinDelay > 0, "FluxSwapTreasury: INVALID_DELAY");
        _consumeOperation(operationId, hashSetMinDelay(newMinDelay));
        uint256 oldMinDelay = minDelay;
        minDelay = newMinDelay;
        emit MinDelayUpdated(oldMinDelay, newMinDelay);
    }

    function executeSetAllowedToken(address token, bool allowed, bytes32 operationId) external {
        require(token != address(0), "FluxSwapTreasury: ZERO_ADDRESS");
        _consumeOperation(operationId, hashSetAllowedToken(token, allowed));
        allowedTokens[token] = allowed;
        emit AllowedTokenUpdated(token, allowed);
    }

    function executeSetAllowedRecipient(address recipient, bool allowed, bytes32 operationId) external {
        require(recipient != address(0), "FluxSwapTreasury: ZERO_ADDRESS");
        _consumeOperation(operationId, hashSetAllowedRecipient(recipient, allowed));
        allowedRecipients[recipient] = allowed;
        emit AllowedRecipientUpdated(recipient, allowed);
    }

    function executeSetDailySpendCap(address token, uint256 newCap, bytes32 operationId) external {
        _consumeOperation(operationId, hashSetDailySpendCap(token, newCap));
        uint256 oldCap = dailySpendCap[token];
        dailySpendCap[token] = newCap;
        emit DailySpendCapUpdated(token, oldCap, newCap);
    }

    function executeApproveSpender(address token, address spender, uint256 amount, bytes32 operationId) external {
        require(token != address(0), "FluxSwapTreasury: ZERO_ADDRESS");
        require(spender != address(0), "FluxSwapTreasury: ZERO_ADDRESS");
        _consumeOperation(operationId, hashApproveSpender(token, spender, amount));
        approvedSpendRemaining[token][spender] = amount;
        emit SpenderApproved(token, spender, amount);
    }

    function executeRevokeSpender(address token, address spender, bytes32 operationId) external {
        require(token != address(0), "FluxSwapTreasury: ZERO_ADDRESS");
        require(spender != address(0), "FluxSwapTreasury: ZERO_ADDRESS");
        _consumeOperation(operationId, hashRevokeSpender(token, spender));
        delete approvedSpendRemaining[token][spender];
        emit SpenderRevoked(token, spender);
    }

    function consumeApprovedSpenderCap(address token, uint256 amount) external whenNotPaused {
        uint256 remaining = _consumeApprovedSpender(token, amount);
        emit ApprovedSpenderCapConsumed(token, msg.sender, amount, remaining);
    }

    function pullApprovedToken(address token, uint256 amount) external whenNotPaused {
        uint256 remaining = _consumeApprovedSpender(token, amount);
        TransferHelper.safeTransfer(token, msg.sender, amount);

        emit ApprovedSpenderTokenPulled(token, msg.sender, amount, remaining);
    }

    function burnApprovedToken(address token, uint256 amount) external whenNotPaused {
        uint256 remaining = _consumeApprovedSpender(token, amount);
        IBurnableERC20(token).burn(amount);
        emit ApprovedSpenderTokenBurned(token, msg.sender, amount, remaining);
    }

    function executeEmergencyWithdraw(address token, address to, uint256 amount, bytes32 operationId) external {
        require(token != address(0), "FluxSwapTreasury: ZERO_ADDRESS");
        require(to != address(0), "FluxSwapTreasury: ZERO_ADDRESS");
        _consumeOperation(operationId, hashEmergencyWithdraw(token, to, amount));
        TransferHelper.safeTransfer(token, to, amount);
        emit EmergencyWithdraw(token, to, amount);
    }

    function executeEmergencyWithdrawETH(address to, uint256 amount, bytes32 operationId) external {
        require(to != address(0), "FluxSwapTreasury: ZERO_ADDRESS");
        _consumeOperation(operationId, hashEmergencyWithdrawETH(to, amount));
        TransferHelper.safeTransferETH(to, amount);
        emit NativeEmergencyWithdraw(to, amount);
    }

    function isFluxSwapTreasury() external pure returns (bool) {
        return true;
    }

    function hashSetOperator(address newOperator) public pure returns (bytes32) {
        return keccak256(abi.encode("SET_OPERATOR", newOperator));
    }

    function hashSetGuardian(address newGuardian) public pure returns (bytes32) {
        return keccak256(abi.encode("SET_GUARDIAN", newGuardian));
    }

    function hashSetMinDelay(uint256 newMinDelay) public pure returns (bytes32) {
        return keccak256(abi.encode("SET_MIN_DELAY", newMinDelay));
    }

    function hashSetAllowedToken(address token, bool allowed) public pure returns (bytes32) {
        return keccak256(abi.encode("SET_ALLOWED_TOKEN", token, allowed));
    }

    function hashSetAllowedRecipient(address recipient, bool allowed) public pure returns (bytes32) {
        return keccak256(abi.encode("SET_ALLOWED_RECIPIENT", recipient, allowed));
    }

    function hashSetDailySpendCap(address token, uint256 newCap) public pure returns (bytes32) {
        return keccak256(abi.encode("SET_DAILY_SPEND_CAP", token, newCap));
    }

    function hashApproveSpender(address token, address spender, uint256 amount) public pure returns (bytes32) {
        return keccak256(abi.encode("APPROVE_SPENDER", token, spender, amount));
    }

    function hashRevokeSpender(address token, address spender) public pure returns (bytes32) {
        return keccak256(abi.encode("REVOKE_SPENDER", token, spender));
    }

    function hashEmergencyWithdraw(address token, address to, uint256 amount) public pure returns (bytes32) {
        return keccak256(abi.encode("EMERGENCY_WITHDRAW", token, to, amount));
    }

    function hashEmergencyWithdrawETH(address to, uint256 amount) public pure returns (bytes32) {
        return keccak256(abi.encode("EMERGENCY_WITHDRAW_ETH", to, amount));
    }

    function _consumeOperation(bytes32 operationId, bytes32 expectedId) internal {
        require(operationId == expectedId, "FluxSwapTreasury: INVALID_OPERATION");

        uint256 readyAt = operationReadyAt[operationId];
        require(readyAt != 0, "FluxSwapTreasury: UNKNOWN_OPERATION");
        require(block.timestamp >= readyAt, "FluxSwapTreasury: OPERATION_NOT_READY");

        delete operationReadyAt[operationId];
        emit OperationExecuted(operationId, msg.sender);
    }

    function _consumeCap(address token, uint256 amount) internal {
        uint256 currentDay = block.timestamp / 1 days;
        if (lastSpendDay[token] != currentDay) {
            lastSpendDay[token] = currentDay;
            spentToday[token] = 0;
        }

        uint256 cap = dailySpendCap[token];
        require(cap > 0, "FluxSwapTreasury: SPEND_CAP_NOT_SET");
        require(spentToday[token] + amount <= cap, "FluxSwapTreasury: DAILY_CAP_EXCEEDED");

        spentToday[token] += amount;
    }

    function _consumeCapIfConfigured(address token, uint256 amount) internal {
        if (dailySpendCap[token] == 0) {
            return;
        }

        _consumeCap(token, amount);
    }

    function _consumeApprovedSpender(address token, uint256 amount) private returns (uint256 remainingAfter) {
        require(token != address(0), "FluxSwapTreasury: ZERO_ADDRESS");
        require(amount > 0, "FluxSwapTreasury: ZERO_AMOUNT");

        uint256 remaining = approvedSpendRemaining[token][msg.sender];
        require(remaining >= amount, "FluxSwapTreasury: SPENDER_ALLOWANCE_EXCEEDED");

        remainingAfter = remaining - amount;
        approvedSpendRemaining[token][msg.sender] = remainingAfter;
        _consumeCapIfConfigured(token, amount);
    }
}
