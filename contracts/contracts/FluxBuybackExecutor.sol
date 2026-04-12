// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import "../interfaces/IFluxSwapTreasury.sol";
import "../interfaces/IFluxSwapRouter.sol";
import "../libraries/TransferHelper.sol";

/**
 * @title Flux 回购执行器
 * @notice 负责从金库拉取被授权的支出资产，并通过 Router 执行回购，把目标代币送回金库。
 * @dev 当前实现将回购接收地址严格限制为金库地址，避免把回购产物误发到外部账户。
 */
contract FluxBuybackExecutor is Ownable, AccessControl {
    // 允许发起回购的操作员角色标识。
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    // 允许暂停或恢复回购入口的角色标识。
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // 执行兑换所依赖的 Router 地址。
    address public immutable router;
    // 回购目标代币地址。
    address public immutable buyToken;
    // 当前资金来源金库地址。
    address public treasury;
    // 当前操作员地址。
    address public operator;
    // 默认回购结果接收地址。
    address public defaultRecipient;
    // 当前是否已暂停回购入口。
    bool public paused;

    // 金库地址变更时触发。
    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);
    // 操作员地址变更时触发。
    event OperatorUpdated(address indexed previousOperator, address indexed newOperator);
    // 默认接收地址变更时触发。
    event DefaultRecipientUpdated(address indexed previousRecipient, address indexed newRecipient);
    // 合约被暂停时触发。
    event Paused(address indexed account);
    // 合约恢复时触发。
    event Unpaused(address indexed account);
    // 一次回购执行完成时触发。
    event BuybackExecuted(
        address indexed spendToken,
        uint256 amountIn,
        uint256 amountOut,
        address indexed recipient,
        address indexed executor
    );
    // 回收误转资产时触发。
    event TokenRecovered(address indexed token, address indexed to, uint256 amount);

    // 当回购接收地址不是金库时抛出的自定义错误。
    error InvalidRecipient(address recipient);

    // 限制仅操作员或所有者可调用。
    modifier onlyOperatorOrOwner() {
        require(hasRole(OPERATOR_ROLE, msg.sender) || msg.sender == owner(), "FluxBuybackExecutor: FORBIDDEN");
        _;
    }

    // 限制仅在未暂停时可调用。
    modifier whenNotPaused() {
        require(!paused, "FluxBuybackExecutor: PAUSED");
        _;
    }

    /**
     * @notice 部署回购执行器并初始化核心依赖关系。
     * @dev 默认接收地址必须与金库一致，这样即使外部传零地址也会回流到金库。
     * @param _owner 初始所有者，同时会被授予默认管理员和暂停权限。
     * @param _treasury 提供回购资金的金库地址。
     * @param _operator 初始回购操作员地址。
     * @param _router 用于执行兑换的 Router 地址。
     * @param _buyToken 回购目标代币地址。
     * @param _defaultRecipient 默认接收回购结果的地址，必须等于金库。
     */
    constructor(
        address _owner,
        address _treasury,
        address _operator,
        address _router,
        address _buyToken,
        address _defaultRecipient
    ) Ownable(_owner) {
        require(_treasury != address(0), "FluxBuybackExecutor: ZERO_ADDRESS");
        require(_operator != address(0), "FluxBuybackExecutor: ZERO_ADDRESS");
        require(_router != address(0), "FluxBuybackExecutor: ZERO_ADDRESS");
        require(_buyToken != address(0), "FluxBuybackExecutor: ZERO_ADDRESS");
        require(_defaultRecipient != address(0), "FluxBuybackExecutor: ZERO_ADDRESS");
        require(_defaultRecipient == _treasury, "FluxBuybackExecutor: INVALID_RECIPIENT");

        _grantRole(DEFAULT_ADMIN_ROLE, _owner);
        _grantRole(PAUSER_ROLE, _owner);
        _grantRole(OPERATOR_ROLE, _operator);

        treasury = _treasury;
        operator = _operator;
        router = _router;
        buyToken = _buyToken;
        defaultRecipient = _defaultRecipient;
    }

    /**
     * @notice 更新回购使用的金库地址。
     * @dev 切换金库时会同步重置默认接收地址，保证回购结果仍然只能回到当前金库。
     * @param newTreasury 新的金库地址。
     */
    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "FluxBuybackExecutor: ZERO_ADDRESS");
        emit TreasuryUpdated(treasury, newTreasury);
        emit DefaultRecipientUpdated(defaultRecipient, newTreasury);
        treasury = newTreasury;
        defaultRecipient = newTreasury;
    }

    /**
     * @notice 更换回购操作员。
     * @dev 会同步更新 `OPERATOR_ROLE`，确保旧操作员权限被移除。
     * @param newOperator 新的操作员地址。
     */
    function setOperator(address newOperator) external onlyOwner {
        require(newOperator != address(0), "FluxBuybackExecutor: ZERO_ADDRESS");
        require(newOperator != operator, "FluxBuybackExecutor: SAME_OPERATOR");
        _grantRole(OPERATOR_ROLE, newOperator);
        _revokeRole(OPERATOR_ROLE, operator);
        emit OperatorUpdated(operator, newOperator);
        operator = newOperator;
    }

    /**
     * @notice 设置默认回购结果接收地址。
     * @dev 当前设计不允许自定义外部接收地址，因此这里只能把默认值设成金库。
     * @param newDefaultRecipient 新的默认接收地址，必须等于 `treasury`。
     */
    function setDefaultRecipient(address newDefaultRecipient) external onlyOwner {
        require(newDefaultRecipient != address(0), "FluxBuybackExecutor: ZERO_ADDRESS");
        require(newDefaultRecipient == treasury, "FluxBuybackExecutor: INVALID_RECIPIENT");
        emit DefaultRecipientUpdated(defaultRecipient, newDefaultRecipient);
        defaultRecipient = newDefaultRecipient;
    }

    /**
     * @notice 暂停回购执行入口。
     * @dev 只有拥有 `PAUSER_ROLE` 的地址才可暂停。
     */
    function pause() external {
        require(hasRole(PAUSER_ROLE, msg.sender), "FluxBuybackExecutor: FORBIDDEN");
        require(!paused, "FluxBuybackExecutor: PAUSED");
        paused = true;
        emit Paused(msg.sender);
    }

    /**
     * @notice 恢复回购执行入口。
     * @dev 只有拥有 `PAUSER_ROLE` 的地址才可恢复。
     */
    function unpause() external {
        require(hasRole(PAUSER_ROLE, msg.sender), "FluxBuybackExecutor: FORBIDDEN");
        require(paused, "FluxBuybackExecutor: NOT_PAUSED");
        paused = false;
        emit Unpaused(msg.sender);
    }

    /**
     * @notice 执行一次从支出资产到目标代币的回购。
     * @dev 回购资金先由金库通过受控额度拉给执行器，再由执行器授权 Router 完成兑换。
     * @param spendToken 本次支出的输入代币地址。
     * @param amountIn 本次计划支出的输入数量。
     * @param amountOutMin 允许接受的最小输出数量。
     * @param path Router 使用的兑换路径，首项必须等于 `spendToken`，末项必须等于 `buyToken`。
     * @param recipient 指定接收地址；传入零地址时使用 `defaultRecipient`。
     * @param deadline 交易截止时间戳。
     * @return amountOut 本次回购实际得到的目标代币数量。
     */
    function executeBuyback(
        address spendToken,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address recipient,
        uint256 deadline
    ) external onlyOperatorOrOwner whenNotPaused returns (uint256 amountOut) {
        require(spendToken != address(0), "FluxBuybackExecutor: ZERO_ADDRESS");
        require(amountIn > 0, "FluxBuybackExecutor: ZERO_AMOUNT");
        require(path.length >= 2, "FluxBuybackExecutor: INVALID_PATH");
        require(path[0] == spendToken, "FluxBuybackExecutor: INVALID_PATH");
        require(path[path.length - 1] == buyToken, "FluxBuybackExecutor: INVALID_PATH");

        address finalRecipient = recipient == address(0) ? defaultRecipient : recipient;
        if (finalRecipient != treasury) {
            revert InvalidRecipient(finalRecipient);
        }

        _requireSourceNotPaused(treasury, "FluxBuybackExecutor: TREASURY_PAUSED");
        IFluxSwapTreasury(treasury).pullApprovedToken(spendToken, amountIn);
        _safeApprove(spendToken, router, 0);
        _safeApprove(spendToken, router, amountIn);

        uint256[] memory amounts = IFluxSwapRouter(router).swapExactTokensForTokens(
            amountIn,
            amountOutMin,
            path,
            finalRecipient,
            deadline
        );

        _safeApprove(spendToken, router, 0);
        amountOut = amounts[amounts.length - 1];

        emit BuybackExecuted(spendToken, amountIn, amountOut, finalRecipient, msg.sender);
    }

    /**
     * @notice 取回误转入执行器的代币。
     * @dev 不区分资产类型，所有权人可在必要时做运维回收。
     * @param token 需要回收的代币地址。
     * @param to 接收回收资产的目标地址。
     * @param amount 需要回收的数量。
     */
    function recoverToken(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(0), "FluxBuybackExecutor: ZERO_ADDRESS");
        require(to != address(0), "FluxBuybackExecutor: ZERO_ADDRESS");
        TransferHelper.safeTransfer(token, to, amount);
        emit TokenRecovered(token, to, amount);
    }

    /**
     * @notice 转移合约所有权并同步迁移配套角色。
     * @dev 如果旧所有者同时是操作员，会把 `operator` 状态清空，避免残留角色语义。
     * @param newOwner 新的所有者地址。
     */
    function transferOwnership(address newOwner) public override onlyOwner {
        require(newOwner != address(0), "FluxBuybackExecutor: ZERO_ADDRESS");

        address previousOwner = owner();
        super.transferOwnership(newOwner);

        if (newOwner != previousOwner) {
            _grantRole(DEFAULT_ADMIN_ROLE, newOwner);
            _grantRole(PAUSER_ROLE, newOwner);
            _revokeRole(PAUSER_ROLE, previousOwner);
            _revokeRole(DEFAULT_ADMIN_ROLE, previousOwner);

            if (hasRole(OPERATOR_ROLE, previousOwner)) {
                _revokeRole(OPERATOR_ROLE, previousOwner);
            }
            if (operator == previousOwner) {
                emit OperatorUpdated(previousOwner, address(0));
                operator = address(0);
            }
        }
    }

    /**
     * @notice 授予访问控制角色。
     * @dev `OPERATOR_ROLE` 必须通过 `setOperator` 管理，避免角色状态与 `operator` 变量脱节。
     * @param role 需要授予的角色标识。
     * @param account 被授予角色的账户。
     */
    function grantRole(bytes32 role, address account) public override onlyRole(getRoleAdmin(role)) {
        require(role != OPERATOR_ROLE, "FluxBuybackExecutor: ROLE_MANAGED_BY_SET_OPERATOR");
        super.grantRole(role, account);
    }

    /**
     * @notice 撤销访问控制角色。
     * @dev `OPERATOR_ROLE` 必须通过 `setOperator` 管理，避免角色状态与 `operator` 变量脱节。
     * @param role 需要撤销的角色标识。
     * @param account 被撤销角色的账户。
     */
    function revokeRole(bytes32 role, address account) public override onlyRole(getRoleAdmin(role)) {
        require(role != OPERATOR_ROLE, "FluxBuybackExecutor: ROLE_MANAGED_BY_SET_OPERATOR");
        super.revokeRole(role, account);
    }

    /**
     * @notice 放弃访问控制角色。
     * @dev `OPERATOR_ROLE` 不允许直接放弃，必须由所有者显式切换操作员。
     * @param role 需要放弃的角色标识。
     * @param callerConfirmation 角色放弃确认地址。
     */
    function renounceRole(bytes32 role, address callerConfirmation) public override {
        require(role != OPERATOR_ROLE, "FluxBuybackExecutor: ROLE_MANAGED_BY_SET_OPERATOR");
        super.renounceRole(role, callerConfirmation);
    }

    /**
     * @notice 声明合约支持的接口集合。
     * @param interfaceId 待查询的接口标识。
     * @return supported 若支持该接口则返回 `true`。
     */
    function supportsInterface(bytes4 interfaceId) public view override(AccessControl) returns (bool supported) {
        supported = super.supportsInterface(interfaceId);
    }

    /**
     * @notice 为指定代币设置授权额度。
     * @dev 兼容部分不返回布尔值的 ERC20 实现。
     * @param token 需要授权的代币地址。
     * @param spender 被授权方地址。
     * @param amount 需要设置的授权额度。
     */
    function _safeApprove(address token, address spender, uint256 amount) private {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSignature("approve(address,uint256)", spender, amount)
        );
        require(
            success && (data.length == 0 || abi.decode(data, (bool))),
            "FluxBuybackExecutor: APPROVE_FAILED"
        );
    }

    /**
     * @notice 检查外部来源是否处于暂停状态。
     * @dev 若目标合约未实现 `paused()`，则视为无需额外检查。
     * @param source 需要检查的外部合约地址。
     * @param errorMessage 当检测到已暂停时使用的错误信息。
     */
    function _requireSourceNotPaused(address source, string memory errorMessage) private view {
        (bool success, bytes memory data) = source.staticcall(abi.encodeWithSignature("paused()"));
        if (success && data.length >= 32) {
            require(!abi.decode(data, (bool)), errorMessage);
        }
    }
}
