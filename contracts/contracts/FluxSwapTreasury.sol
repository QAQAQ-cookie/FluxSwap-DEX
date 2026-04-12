// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/IBurnableERC20.sol";
import "../interfaces/IERC20.sol";
import "../libraries/TransferHelper.sol";

/**
 * @title Flux 金库
 * @notice 承载协议核心资金管理、时间锁治理、白名单划拨与受控花费额度逻辑。
 * @dev 关键参数变更与紧急提取均通过操作哈希 + 延迟执行的时间锁模型完成。
 */
contract FluxSwapTreasury {
    // 负责治理决策与时间锁排期的多签地址。
    address public immutable multisig;
    // 负责执行日常划拨的操作员地址。
    address public operator;
    // 负责紧急暂停的守护者地址。
    address public guardian;
    // 允许执行治理操作的最小延迟秒数。
    uint256 public minDelay;
    // 当前是否处于暂停状态。
    bool public paused;

    // 被允许由金库日常划拨的代币白名单。
    mapping(address => bool) public allowedTokens;
    // 被允许接收金库日常划拨的地址白名单。
    mapping(address => bool) public allowedRecipients;
    // 各资产的每日支出上限。
    mapping(address => uint256) public dailySpendCap;
    // 各资产当天已花费数量。
    mapping(address => uint256) public spentToday;
    // 各资产上次记账所属的自然日编号。
    mapping(address => uint256) public lastSpendDay;
    // 各资产给外部花费者授权的剩余额度。
    mapping(address => mapping(address => uint256)) public approvedSpendRemaining;
    // 时间锁操作哈希到可执行时间戳的映射。
    mapping(bytes32 => uint256) public operationReadyAt;

    // 新时间锁操作排期时触发。
    event OperationScheduled(bytes32 indexed operationId, uint256 executeAfter, address indexed scheduler);
    // 时间锁操作被取消时触发。
    event OperationCancelled(bytes32 indexed operationId, address indexed canceller);
    // 时间锁操作执行完成时触发。
    event OperationExecuted(bytes32 indexed operationId, address indexed executor);

    // 操作员地址变更时触发。
    event OperatorUpdated(address indexed oldOperator, address indexed newOperator);
    // 守护者地址变更时触发。
    event GuardianUpdated(address indexed oldGuardian, address indexed newGuardian);
    // 最小延迟参数更新时触发。
    event MinDelayUpdated(uint256 oldMinDelay, uint256 newMinDelay);
    // 代币白名单状态变更时触发。
    event AllowedTokenUpdated(address indexed token, bool allowed);
    // 接收地址白名单状态变更时触发。
    event AllowedRecipientUpdated(address indexed recipient, bool allowed);
    // 每日支出上限更新时触发。
    event DailySpendCapUpdated(address indexed token, uint256 oldCap, uint256 newCap);
    // 日常 ERC20 划拨成功时触发。
    event AllocationExecuted(address indexed token, address indexed to, uint256 amount, address indexed executor);
    // 日常 ETH 划拨成功时触发。
    event NativeAllocationExecuted(address indexed to, uint256 amount, address indexed executor);
    // 外部花费者额度被批准时触发。
    event SpenderApproved(address indexed token, address indexed spender, uint256 amount);
    // 外部花费者额度被撤销时触发。
    event SpenderRevoked(address indexed token, address indexed spender);
    // 外部花费者仅消耗额度、不转出资产时触发。
    event ApprovedSpenderCapConsumed(address indexed token, address indexed spender, uint256 amount, uint256 remaining);
    // 外部花费者拉走资产时触发。
    event ApprovedSpenderTokenPulled(
        address indexed token,
        address indexed spender,
        uint256 amount,
        uint256 remaining
    );
    // 外部花费者销毁资产时触发。
    event ApprovedSpenderTokenBurned(address indexed token, address indexed spender, uint256 amount, uint256 remaining);
    // 执行 ERC20 紧急提取时触发。
    event EmergencyWithdraw(address indexed token, address indexed to, uint256 amount);
    // 执行 ETH 紧急提取时触发。
    event NativeEmergencyWithdraw(address indexed to, uint256 amount);
    // 金库接收到原生 ETH 时触发。
    event NativeReceived(address indexed from, uint256 amount);
    // 合约被暂停时触发。
    event Paused(address indexed account);
    // 合约恢复时触发。
    event Unpaused(address indexed account);

    // 限制仅多签可调用。
    modifier onlyMultisig() {
        require(msg.sender == multisig, "FluxSwapTreasury: FORBIDDEN");
        _;
    }

    // 限制仅操作员或多签可调用。
    modifier onlyOperatorOrMultisig() {
        require(msg.sender == operator || msg.sender == multisig, "FluxSwapTreasury: FORBIDDEN");
        _;
    }

    // 限制仅守护者或多签可调用。
    modifier onlyGuardianOrMultisig() {
        require(msg.sender == guardian || msg.sender == multisig, "FluxSwapTreasury: FORBIDDEN");
        _;
    }

    // 限制仅在未暂停时可调用。
    modifier whenNotPaused() {
        require(!paused, "FluxSwapTreasury: PAUSED");
        _;
    }

    /**
     * @notice 部署金库并初始化角色和时间锁参数。
     * @param _multisig 负责治理操作的多签地址。
     * @param _guardian 具备紧急暂停能力的守护者地址。
     * @param _operator 可执行日常资金划拨的操作员地址。
     * @param _minDelay 时间锁最小延迟秒数。
     */
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

    /**
     * @notice 接收原生 ETH 并记录到账事件。
     */
    receive() external payable {
        emit NativeReceived(msg.sender, msg.value);
    }

    /**
     * @notice 由守护者或多签暂停金库敏感操作。
     */
    function pause() external onlyGuardianOrMultisig {
        require(!paused, "FluxSwapTreasury: PAUSED");
        paused = true;
        emit Paused(msg.sender);
    }

    /**
     * @notice 由多签恢复金库敏感操作。
     */
    function unpause() external onlyMultisig {
        require(paused, "FluxSwapTreasury: NOT_PAUSED");
        paused = false;
        emit Unpaused(msg.sender);
    }

    /**
     * @notice 为一个时间锁操作排期。
     * @param operationId 操作哈希。
     * @param delay 实际选择的延迟秒数，必须不小于 `minDelay`。
     */
    function scheduleOperation(bytes32 operationId, uint256 delay) external onlyMultisig {
        require(operationId != bytes32(0), "FluxSwapTreasury: INVALID_OPERATION");
        require(delay >= minDelay, "FluxSwapTreasury: DELAY_TOO_SHORT");
        require(operationReadyAt[operationId] == 0, "FluxSwapTreasury: OPERATION_EXISTS");

        uint256 executeAfter = block.timestamp + delay;
        operationReadyAt[operationId] = executeAfter;

        emit OperationScheduled(operationId, executeAfter, msg.sender);
    }

    /**
     * @notice 取消尚未执行的时间锁操作。
     * @param operationId 待取消的操作哈希。
     */
    function cancelOperation(bytes32 operationId) external onlyMultisig {
        require(operationReadyAt[operationId] != 0, "FluxSwapTreasury: UNKNOWN_OPERATION");
        delete operationReadyAt[operationId];
        emit OperationCancelled(operationId, msg.sender);
    }

    /**
     * @notice 向白名单接收方划拨 ERC20 资产。
     * @param token 待划拨资产地址。
     * @param to 接收地址，必须在白名单中。
     * @param amount 划拨数量。
     */
    function allocate(address token, address to, uint256 amount) external onlyOperatorOrMultisig whenNotPaused {
        require(allowedTokens[token], "FluxSwapTreasury: TOKEN_NOT_ALLOWED");
        require(allowedRecipients[to], "FluxSwapTreasury: RECIPIENT_NOT_ALLOWED");
        _consumeCap(token, amount);
        TransferHelper.safeTransfer(token, to, amount);
        emit AllocationExecuted(token, to, amount, msg.sender);
    }

    /**
     * @notice 向白名单接收方划拨原生 ETH。
     * @param to 接收地址，必须在白名单中。
     * @param amount 划拨数量。
     */
    function allocateETH(address to, uint256 amount) external onlyOperatorOrMultisig whenNotPaused {
        require(allowedRecipients[to], "FluxSwapTreasury: RECIPIENT_NOT_ALLOWED");
        _consumeCap(address(0), amount);
        TransferHelper.safeTransferETH(to, amount);
        emit NativeAllocationExecuted(to, amount, msg.sender);
    }

    /**
     * @notice 执行“设置操作员”的时间锁操作。
     * @param newOperator 新的操作员地址。
     * @param operationId 已经排期完成的操作哈希。
     */
    function executeSetOperator(address newOperator, bytes32 operationId) external {
        require(newOperator != address(0), "FluxSwapTreasury: ZERO_ADDRESS");
        _consumeOperation(operationId, hashSetOperator(newOperator));
        address oldOperator = operator;
        operator = newOperator;
        emit OperatorUpdated(oldOperator, newOperator);
    }

    /**
     * @notice 执行“设置守护者”的时间锁操作。
     * @param newGuardian 新的守护者地址。
     * @param operationId 已经排期完成的操作哈希。
     */
    function executeSetGuardian(address newGuardian, bytes32 operationId) external {
        require(newGuardian != address(0), "FluxSwapTreasury: ZERO_ADDRESS");
        _consumeOperation(operationId, hashSetGuardian(newGuardian));
        address oldGuardian = guardian;
        guardian = newGuardian;
        emit GuardianUpdated(oldGuardian, newGuardian);
    }

    /**
     * @notice 执行“设置最小延迟”的时间锁操作。
     * @param newMinDelay 新的最小延迟秒数。
     * @param operationId 已经排期完成的操作哈希。
     */
    function executeSetMinDelay(uint256 newMinDelay, bytes32 operationId) external {
        require(newMinDelay > 0, "FluxSwapTreasury: INVALID_DELAY");
        _consumeOperation(operationId, hashSetMinDelay(newMinDelay));
        uint256 oldMinDelay = minDelay;
        minDelay = newMinDelay;
        emit MinDelayUpdated(oldMinDelay, newMinDelay);
    }

    /**
     * @notice 执行“更新代币白名单”的时间锁操作。
     * @param token 目标代币地址。
     * @param allowed 新的白名单状态。
     * @param operationId 已经排期完成的操作哈希。
     */
    function executeSetAllowedToken(address token, bool allowed, bytes32 operationId) external {
        require(token != address(0), "FluxSwapTreasury: ZERO_ADDRESS");
        _consumeOperation(operationId, hashSetAllowedToken(token, allowed));
        allowedTokens[token] = allowed;
        emit AllowedTokenUpdated(token, allowed);
    }

    /**
     * @notice 执行“更新接收地址白名单”的时间锁操作。
     * @param recipient 目标接收地址。
     * @param allowed 新的白名单状态。
     * @param operationId 已经排期完成的操作哈希。
     */
    function executeSetAllowedRecipient(address recipient, bool allowed, bytes32 operationId) external {
        require(recipient != address(0), "FluxSwapTreasury: ZERO_ADDRESS");
        _consumeOperation(operationId, hashSetAllowedRecipient(recipient, allowed));
        allowedRecipients[recipient] = allowed;
        emit AllowedRecipientUpdated(recipient, allowed);
    }

    /**
     * @notice 执行“更新每日支出上限”的时间锁操作。
     * @param token 目标资产地址，原生 ETH 使用零地址。
     * @param newCap 新的每日上限。
     * @param operationId 已经排期完成的操作哈希。
     */
    function executeSetDailySpendCap(address token, uint256 newCap, bytes32 operationId) external {
        _consumeOperation(operationId, hashSetDailySpendCap(token, newCap));
        uint256 oldCap = dailySpendCap[token];
        dailySpendCap[token] = newCap;
        emit DailySpendCapUpdated(token, oldCap, newCap);
    }

    /**
     * @notice 执行“批准受控花费者”的时间锁操作。
     * @param token 被批准可花费的资产地址。
     * @param spender 被批准的外部花费者地址。
     * @param amount 批准额度。
     * @param operationId 已经排期完成的操作哈希。
     */
    function executeApproveSpender(address token, address spender, uint256 amount, bytes32 operationId) external {
        require(token != address(0), "FluxSwapTreasury: ZERO_ADDRESS");
        require(spender != address(0), "FluxSwapTreasury: ZERO_ADDRESS");
        _consumeOperation(operationId, hashApproveSpender(token, spender, amount));
        approvedSpendRemaining[token][spender] = amount;
        emit SpenderApproved(token, spender, amount);
    }

    /**
     * @notice 执行“撤销受控花费者”的时间锁操作。
     * @param token 被撤销的资产地址。
     * @param spender 被撤销的花费者地址。
     * @param operationId 已经排期完成的操作哈希。
     */
    function executeRevokeSpender(address token, address spender, bytes32 operationId) external {
        require(token != address(0), "FluxSwapTreasury: ZERO_ADDRESS");
        require(spender != address(0), "FluxSwapTreasury: ZERO_ADDRESS");
        _consumeOperation(operationId, hashRevokeSpender(token, spender));
        delete approvedSpendRemaining[token][spender];
        emit SpenderRevoked(token, spender);
    }

    /**
     * @notice 仅消耗调用者的受控额度，不直接转账。
     * @param token 被消耗额度的资产地址。
     * @param amount 消耗数量。
     */
    function consumeApprovedSpenderCap(address token, uint256 amount) external whenNotPaused {
        uint256 remaining = _consumeApprovedSpender(token, amount);
        emit ApprovedSpenderCapConsumed(token, msg.sender, amount, remaining);
    }

    /**
     * @notice 按受控额度把指定代币拉给调用者。
     * @param token 需要拉取的代币地址。
     * @param amount 需要拉取的数量。
     */
    function pullApprovedToken(address token, uint256 amount) external whenNotPaused {
        uint256 remaining = _consumeApprovedSpender(token, amount);
        TransferHelper.safeTransfer(token, msg.sender, amount);

        emit ApprovedSpenderTokenPulled(token, msg.sender, amount, remaining);
    }

    /**
     * @notice 按受控额度销毁指定代币。
     * @param token 需要销毁的代币地址。
     * @param amount 需要销毁的数量。
     */
    function burnApprovedToken(address token, uint256 amount) external whenNotPaused {
        uint256 remaining = _consumeApprovedSpender(token, amount);
        IBurnableERC20(token).burn(amount);
        emit ApprovedSpenderTokenBurned(token, msg.sender, amount, remaining);
    }

    /**
     * @notice 执行 ERC20 紧急提取操作。
     * @param token 需要提取的代币地址。
     * @param to 接收地址。
     * @param amount 提取数量。
     * @param operationId 已经排期完成的操作哈希。
     */
    function executeEmergencyWithdraw(address token, address to, uint256 amount, bytes32 operationId) external {
        require(token != address(0), "FluxSwapTreasury: ZERO_ADDRESS");
        require(to != address(0), "FluxSwapTreasury: ZERO_ADDRESS");
        _consumeOperation(operationId, hashEmergencyWithdraw(token, to, amount));
        TransferHelper.safeTransfer(token, to, amount);
        emit EmergencyWithdraw(token, to, amount);
    }

    /**
     * @notice 执行 ETH 紧急提取操作。
     * @param to 接收地址。
     * @param amount 提取数量。
     * @param operationId 已经排期完成的操作哈希。
     */
    function executeEmergencyWithdrawETH(address to, uint256 amount, bytes32 operationId) external {
        require(to != address(0), "FluxSwapTreasury: ZERO_ADDRESS");
        _consumeOperation(operationId, hashEmergencyWithdrawETH(to, amount));
        TransferHelper.safeTransferETH(to, amount);
        emit NativeEmergencyWithdraw(to, amount);
    }

    /**
     * @notice 标识当前合约实现了 Flux Treasury 语义。
     * @return isTreasury 固定返回 `true`。
     */
    function isFluxSwapTreasury() external pure returns (bool isTreasury) {
        isTreasury = true;
    }

    /**
     * @notice 计算“设置操作员”操作的哈希。
     * @param newOperator 新操作员地址。
     * @return operationId 对应时间锁操作哈希。
     */
    function hashSetOperator(address newOperator) public pure returns (bytes32 operationId) {
        operationId = keccak256(abi.encode("SET_OPERATOR", newOperator));
    }

    /**
     * @notice 计算“设置守护者”操作的哈希。
     * @param newGuardian 新守护者地址。
     * @return operationId 对应时间锁操作哈希。
     */
    function hashSetGuardian(address newGuardian) public pure returns (bytes32 operationId) {
        operationId = keccak256(abi.encode("SET_GUARDIAN", newGuardian));
    }

    /**
     * @notice 计算“设置最小延迟”操作的哈希。
     * @param newMinDelay 新最小延迟。
     * @return operationId 对应时间锁操作哈希。
     */
    function hashSetMinDelay(uint256 newMinDelay) public pure returns (bytes32 operationId) {
        operationId = keccak256(abi.encode("SET_MIN_DELAY", newMinDelay));
    }

    /**
     * @notice 计算“设置允许代币”操作的哈希。
     * @param token 目标代币地址。
     * @param allowed 新白名单状态。
     * @return operationId 对应时间锁操作哈希。
     */
    function hashSetAllowedToken(address token, bool allowed) public pure returns (bytes32 operationId) {
        operationId = keccak256(abi.encode("SET_ALLOWED_TOKEN", token, allowed));
    }

    /**
     * @notice 计算“设置允许接收方”操作的哈希。
     * @param recipient 目标接收地址。
     * @param allowed 新白名单状态。
     * @return operationId 对应时间锁操作哈希。
     */
    function hashSetAllowedRecipient(address recipient, bool allowed) public pure returns (bytes32 operationId) {
        operationId = keccak256(abi.encode("SET_ALLOWED_RECIPIENT", recipient, allowed));
    }

    /**
     * @notice 计算“设置每日支出上限”操作的哈希。
     * @param token 目标资产地址。
     * @param newCap 新每日上限。
     * @return operationId 对应时间锁操作哈希。
     */
    function hashSetDailySpendCap(address token, uint256 newCap) public pure returns (bytes32 operationId) {
        operationId = keccak256(abi.encode("SET_DAILY_SPEND_CAP", token, newCap));
    }

    /**
     * @notice 计算“批准花费者额度”操作的哈希。
     * @param token 目标资产地址。
     * @param spender 花费者地址。
     * @param amount 批准额度。
     * @return operationId 对应时间锁操作哈希。
     */
    function hashApproveSpender(address token, address spender, uint256 amount) public pure returns (bytes32 operationId) {
        operationId = keccak256(abi.encode("APPROVE_SPENDER", token, spender, amount));
    }

    /**
     * @notice 计算“撤销花费者额度”操作的哈希。
     * @param token 目标资产地址。
     * @param spender 花费者地址。
     * @return operationId 对应时间锁操作哈希。
     */
    function hashRevokeSpender(address token, address spender) public pure returns (bytes32 operationId) {
        operationId = keccak256(abi.encode("REVOKE_SPENDER", token, spender));
    }

    /**
     * @notice 计算 ERC20 紧急提取操作的哈希。
     * @param token 提取资产地址。
     * @param to 接收地址。
     * @param amount 提取数量。
     * @return operationId 对应时间锁操作哈希。
     */
    function hashEmergencyWithdraw(address token, address to, uint256 amount) public pure returns (bytes32 operationId) {
        operationId = keccak256(abi.encode("EMERGENCY_WITHDRAW", token, to, amount));
    }

    /**
     * @notice 计算 ETH 紧急提取操作的哈希。
     * @param to 接收地址。
     * @param amount 提取数量。
     * @return operationId 对应时间锁操作哈希。
     */
    function hashEmergencyWithdrawETH(address to, uint256 amount) public pure returns (bytes32 operationId) {
        operationId = keccak256(abi.encode("EMERGENCY_WITHDRAW_ETH", to, amount));
    }

    /**
     * @notice 校验并消费一个时间锁操作。
     * @param operationId 实际提交的操作哈希。
     * @param expectedId 根据参数重新计算出的期望操作哈希。
     */
    function _consumeOperation(bytes32 operationId, bytes32 expectedId) internal {
        require(operationId == expectedId, "FluxSwapTreasury: INVALID_OPERATION");

        uint256 readyAt = operationReadyAt[operationId];
        require(readyAt != 0, "FluxSwapTreasury: UNKNOWN_OPERATION");
        require(block.timestamp >= readyAt, "FluxSwapTreasury: OPERATION_NOT_READY");

        delete operationReadyAt[operationId];
        emit OperationExecuted(operationId, msg.sender);
    }

    /**
     * @notice 消耗某种资产当天的支出额度。
     * @param token 目标资产地址，原生 ETH 使用零地址。
     * @param amount 本次需要消耗的数量。
     */
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

    /**
     * @notice 若某资产配置了支出上限，则同步消耗对应额度。
     * @param token 目标资产地址。
     * @param amount 本次需要消耗的数量。
     */
    function _consumeCapIfConfigured(address token, uint256 amount) internal {
        if (dailySpendCap[token] == 0) {
            return;
        }

        _consumeCap(token, amount);
    }

    /**
     * @notice 校验并扣减外部花费者剩余额度。
     * @param token 目标资产地址。
     * @param amount 本次需要消耗的数量。
     * @return remainingAfter 扣减后的剩余额度。
     */
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
