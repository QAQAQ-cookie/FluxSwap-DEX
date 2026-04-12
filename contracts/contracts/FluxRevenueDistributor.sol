// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import "../interfaces/IFluxBuybackExecutor.sol";
import "../interfaces/IFluxMultiPoolManager.sol";
import "../interfaces/IFluxSwapTreasury.sol";
import "../libraries/TransferHelper.sol";

/**
 * @title Flux 收入分配器
 * @notice 负责把协议收入拆分成回购、销毁和奖励分发三部分。
 * @dev 分配器依赖回购执行器与多池管理器共享同一金库和同一奖励代币配置。
 */
contract FluxRevenueDistributor is Ownable, AccessControl {
    // 基点制分母，10000 表示 100%。
    uint256 private constant BPS_BASE = 10000;

    // 允许执行收入分发的操作员角色标识。
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    // 允许暂停或恢复分发入口的角色标识。
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // 当前分发链路绑定的奖励代币地址。
    address public immutable rewardToken;
    // 当前操作员地址。
    address public operator;
    // 当前回购执行器地址。
    address public buybackExecutor;
    // 当前多池管理器地址。
    address public manager;
    // 收入中用于回购的比例，单位为基点。
    uint256 public buybackBps;
    // 回购结果中用于销毁的比例，单位为基点。
    uint256 public burnBps;
    // 当前是否已暂停收入处理入口。
    bool public paused;

    // 操作员地址变更时触发。
    event OperatorUpdated(address indexed previousOperator, address indexed newOperator);
    // 回购执行器变更时触发。
    event BuybackExecutorUpdated(address indexed previousExecutor, address indexed newExecutor);
    // 多池管理器变更时触发。
    event ManagerUpdated(address indexed previousManager, address indexed newManager);
    // 收入分配比例变更时触发。
    event RevenueConfigurationUpdated(uint256 previousBuybackBps, uint256 newBuybackBps, uint256 previousBurnBps, uint256 newBurnBps);
    // 合约被暂停时触发。
    event Paused(address indexed account);
    // 合约恢复时触发。
    event Unpaused(address indexed account);
    // 一次完整的回购并分发流水线执行后触发。
    event RevenueBuybackAndDistributionExecuted(
        address indexed spendToken,
        uint256 revenueAmount,
        uint256 buybackAmountIn,
        uint256 buybackAmountOut,
        uint256 burnedAmount,
        uint256 distributedAmount,
        address indexed executor
    );
    // 直接从金库分发奖励时触发。
    event TreasuryRewardsDistributed(uint256 amount, address indexed executor);
    // 回收误转资产时触发。
    event TokenRecovered(address indexed token, address indexed to, uint256 amount);

    // 限制仅操作员或所有者可调用。
    modifier onlyOperatorOrOwner() {
        require(hasRole(OPERATOR_ROLE, msg.sender) || msg.sender == owner(), "FluxRevenueDistributor: FORBIDDEN");
        _;
    }

    // 限制仅在未暂停时可调用。
    modifier whenNotPaused() {
        require(!paused, "FluxRevenueDistributor: PAUSED");
        _;
    }

    /**
     * @notice 部署收入分配器并完成依赖校验。
     * @dev 会读取管理器里的奖励代币，并校验回购执行器目标代币与金库配置一致。
     * @param _owner 初始所有者地址。
     * @param _operator 初始操作员地址。
     * @param _buybackExecutor 回购执行器地址。
     * @param _manager 多池奖励管理器地址。
     * @param _buybackBps 每次收入中用于回购的基点比例。
     * @param _burnBps 回购得到的奖励代币中用于销毁的基点比例。
     */
    constructor(
        address _owner,
        address _operator,
        address _buybackExecutor,
        address _manager,
        uint256 _buybackBps,
        uint256 _burnBps
    ) Ownable(_owner) {
        require(_operator != address(0), "FluxRevenueDistributor: ZERO_ADDRESS");
        require(_buybackExecutor != address(0), "FluxRevenueDistributor: ZERO_ADDRESS");
        require(_manager != address(0), "FluxRevenueDistributor: ZERO_ADDRESS");
        require(_buybackBps > 0 && _buybackBps <= BPS_BASE, "FluxRevenueDistributor: INVALID_BPS");
        require(_burnBps <= BPS_BASE, "FluxRevenueDistributor: INVALID_BPS");

        address _rewardToken = IFluxMultiPoolManager(_manager).rewardToken();
        require(_rewardToken != address(0), "FluxRevenueDistributor: ZERO_ADDRESS");
        require(IFluxBuybackExecutor(_buybackExecutor).buyToken() == _rewardToken, "FluxRevenueDistributor: INVALID_REWARD_TOKEN");
        require(
            IFluxBuybackExecutor(_buybackExecutor).treasury() == IFluxMultiPoolManager(_manager).treasury(),
            "FluxRevenueDistributor: TREASURY_MISMATCH"
        );

        _grantRole(DEFAULT_ADMIN_ROLE, _owner);
        _grantRole(PAUSER_ROLE, _owner);
        _grantRole(OPERATOR_ROLE, _operator);

        operator = _operator;
        buybackExecutor = _buybackExecutor;
        manager = _manager;
        rewardToken = _rewardToken;
        buybackBps = _buybackBps;
        burnBps = _burnBps;
    }

    /**
     * @notice 更换收入分配操作员。
     * @param newOperator 新的操作员地址。
     */
    function setOperator(address newOperator) external onlyOwner {
        require(newOperator != address(0), "FluxRevenueDistributor: ZERO_ADDRESS");
        require(newOperator != operator, "FluxRevenueDistributor: SAME_OPERATOR");
        _grantRole(OPERATOR_ROLE, newOperator);
        _revokeRole(OPERATOR_ROLE, operator);
        emit OperatorUpdated(operator, newOperator);
        operator = newOperator;
    }

    /**
     * @notice 更新回购执行器地址。
     * @dev 新执行器必须继续使用相同奖励代币，且指向与当前管理器一致的金库。
     * @param newBuybackExecutor 新的回购执行器地址。
     */
    function setBuybackExecutor(address newBuybackExecutor) external onlyOwner {
        require(newBuybackExecutor != address(0), "FluxRevenueDistributor: ZERO_ADDRESS");
        require(newBuybackExecutor != buybackExecutor, "FluxRevenueDistributor: SAME_EXECUTOR");
        require(
            IFluxBuybackExecutor(newBuybackExecutor).buyToken() == rewardToken,
            "FluxRevenueDistributor: INVALID_REWARD_TOKEN"
        );
        require(
            IFluxBuybackExecutor(newBuybackExecutor).treasury() == IFluxMultiPoolManager(manager).treasury(),
            "FluxRevenueDistributor: TREASURY_MISMATCH"
        );
        emit BuybackExecutorUpdated(buybackExecutor, newBuybackExecutor);
        buybackExecutor = newBuybackExecutor;
    }

    /**
     * @notice 更新多池奖励管理器地址。
     * @dev 新管理器必须继续使用相同奖励代币，且金库配置与当前回购执行器保持一致。
     * @param newManager 新的管理器地址。
     */
    function setManager(address newManager) external onlyOwner {
        require(newManager != address(0), "FluxRevenueDistributor: ZERO_ADDRESS");
        require(newManager != manager, "FluxRevenueDistributor: SAME_MANAGER");
        require(IFluxMultiPoolManager(newManager).rewardToken() == rewardToken, "FluxRevenueDistributor: INVALID_REWARD_TOKEN");
        require(
            IFluxMultiPoolManager(newManager).treasury() == IFluxBuybackExecutor(buybackExecutor).treasury(),
            "FluxRevenueDistributor: TREASURY_MISMATCH"
        );
        emit ManagerUpdated(manager, newManager);
        manager = newManager;
    }

    /**
     * @notice 更新收入拆分配置。
     * @param newBuybackBps 新的回购比例，单位为基点。
     * @param newBurnBps 新的销毁比例，单位为基点。
     */
    function setRevenueConfiguration(uint256 newBuybackBps, uint256 newBurnBps) external onlyOwner {
        require(newBuybackBps > 0 && newBuybackBps <= BPS_BASE, "FluxRevenueDistributor: INVALID_BPS");
        require(newBurnBps <= BPS_BASE, "FluxRevenueDistributor: INVALID_BPS");

        emit RevenueConfigurationUpdated(buybackBps, newBuybackBps, burnBps, newBurnBps);
        buybackBps = newBuybackBps;
        burnBps = newBurnBps;
    }

    /**
     * @notice 暂停收入处理入口。
     */
    function pause() external {
        require(hasRole(PAUSER_ROLE, msg.sender), "FluxRevenueDistributor: FORBIDDEN");
        require(!paused, "FluxRevenueDistributor: PAUSED");
        paused = true;
        emit Paused(msg.sender);
    }

    /**
     * @notice 恢复收入处理入口。
     */
    function unpause() external {
        require(hasRole(PAUSER_ROLE, msg.sender), "FluxRevenueDistributor: FORBIDDEN");
        require(paused, "FluxRevenueDistributor: NOT_PAUSED");
        paused = false;
        emit Unpaused(msg.sender);
    }

    /**
     * @notice 执行一次“收入回购 + 销毁 + 分发”的完整流水线。
     * @param spendToken 本轮收入所使用的输入资产。
     * @param revenueAmount 本轮被视为协议收入的总数量。
     * @param amountOutMin 对回购结果设置的最小可接受输出。
     * @param path 回购路径，首项必须等于 `spendToken`，末项必须等于 `rewardToken`。
     * @param deadline Router 交易截止时间。
     * @return amountOut 回购后实际拿到的奖励代币总量。
     */
    function executeBuybackAndDistribute(
        address spendToken,
        uint256 revenueAmount,
        uint256 amountOutMin,
        address[] calldata path,
        uint256 deadline
    ) external onlyOperatorOrOwner whenNotPaused returns (uint256 amountOut) {
        require(spendToken != address(0), "FluxRevenueDistributor: ZERO_ADDRESS");
        require(revenueAmount > 0, "FluxRevenueDistributor: ZERO_AMOUNT");
        require(path.length >= 2, "FluxRevenueDistributor: INVALID_PATH");
        require(path[0] == spendToken, "FluxRevenueDistributor: INVALID_PATH");
        require(path[path.length - 1] == rewardToken, "FluxRevenueDistributor: INVALID_PATH");

        address treasury = _requireTreasuryMatch();

        uint256 buybackAmountIn = (revenueAmount * buybackBps) / BPS_BASE;
        require(buybackAmountIn > 0, "FluxRevenueDistributor: BUYBACK_TOO_SMALL");

        amountOut = IFluxBuybackExecutor(buybackExecutor).executeBuyback(
            spendToken,
            buybackAmountIn,
            amountOutMin,
            path,
            address(0),
            deadline
        );

        uint256 burnedAmount = (amountOut * burnBps) / BPS_BASE;
        if (burnedAmount > 0) {
            IFluxSwapTreasury(treasury).burnApprovedToken(rewardToken, burnedAmount);
        }

        uint256 distributedAmount = amountOut - burnedAmount;
        if (distributedAmount > 0) {
            IFluxMultiPoolManager(manager).distributeRewards(distributedAmount);
        }

        emit RevenueBuybackAndDistributionExecuted(
            spendToken,
            revenueAmount,
            buybackAmountIn,
            amountOut,
            burnedAmount,
            distributedAmount,
            msg.sender
        );
    }

    /**
     * @notice 直接把金库里已有的奖励资产分发给多池管理器。
     * @param amount 需要分发的奖励数量。
     */
    function distributeTreasuryRewards(uint256 amount) external onlyOperatorOrOwner whenNotPaused {
        require(amount > 0, "FluxRevenueDistributor: ZERO_AMOUNT");
        _requireTreasuryMatch();
        IFluxMultiPoolManager(manager).distributeRewards(amount);
        emit TreasuryRewardsDistributed(amount, msg.sender);
    }

    /**
     * @notice 回收误转入分配器的资产。
     * @param token 需要回收的代币地址。
     * @param to 接收地址。
     * @param amount 回收数量。
     */
    function recoverToken(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(0), "FluxRevenueDistributor: ZERO_ADDRESS");
        require(to != address(0), "FluxRevenueDistributor: ZERO_ADDRESS");
        TransferHelper.safeTransfer(token, to, amount);
        emit TokenRecovered(token, to, amount);
    }

    /**
     * @notice 转移所有权并同步迁移访问控制角色。
     * @param newOwner 新的所有者地址。
     */
    function transferOwnership(address newOwner) public override onlyOwner {
        require(newOwner != address(0), "FluxRevenueDistributor: ZERO_ADDRESS");

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
     * @dev `OPERATOR_ROLE` 必须经由 `setOperator` 管理。
     * @param role 待授予角色。
     * @param account 待授予账户。
     */
    function grantRole(bytes32 role, address account) public override onlyRole(getRoleAdmin(role)) {
        require(role != OPERATOR_ROLE, "FluxRevenueDistributor: ROLE_MANAGED_BY_SET_OPERATOR");
        super.grantRole(role, account);
    }

    /**
     * @notice 撤销访问控制角色。
     * @dev `OPERATOR_ROLE` 必须经由 `setOperator` 管理。
     * @param role 待撤销角色。
     * @param account 待撤销账户。
     */
    function revokeRole(bytes32 role, address account) public override onlyRole(getRoleAdmin(role)) {
        require(role != OPERATOR_ROLE, "FluxRevenueDistributor: ROLE_MANAGED_BY_SET_OPERATOR");
        super.revokeRole(role, account);
    }

    /**
     * @notice 放弃访问控制角色。
     * @dev `OPERATOR_ROLE` 不允许直接放弃。
     * @param role 待放弃角色。
     * @param callerConfirmation 放弃角色的确认地址。
     */
    function renounceRole(bytes32 role, address callerConfirmation) public override {
        require(role != OPERATOR_ROLE, "FluxRevenueDistributor: ROLE_MANAGED_BY_SET_OPERATOR");
        super.renounceRole(role, callerConfirmation);
    }

    /**
     * @notice 查询接口支持情况。
     * @param interfaceId 待查询接口标识。
     * @return supported 若支持则返回 `true`。
     */
    function supportsInterface(bytes4 interfaceId) public view override(AccessControl) returns (bool supported) {
        supported = super.supportsInterface(interfaceId);
    }

    /**
     * @notice 校验管理器与回购执行器引用的是同一个金库。
     * @return treasury 当前两边共同指向的金库地址。
     */
    function _requireTreasuryMatch() private view returns (address treasury) {
        treasury = IFluxMultiPoolManager(manager).treasury();
        require(IFluxBuybackExecutor(buybackExecutor).treasury() == treasury, "FluxRevenueDistributor: TREASURY_MISMATCH");
    }
}
