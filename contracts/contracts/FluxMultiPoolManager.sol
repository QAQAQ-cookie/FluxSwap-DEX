// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../interfaces/IFluxSwapTreasury.sol";
import "../libraries/TransferHelper.sol";

/**
 * @title Flux 多池奖励管理器
 * @notice 负责维护多个奖励池的权重、累计奖励和实际领取流程。
 * @dev 奖励采用全局累计值加池内债务的方式记账，并显式跟踪待分配与未分配余额。
 */
contract FluxMultiPoolManager is Ownable, AccessControl {
    // 单个池的奖励权重与待领奖励快照。
    struct PoolInfo {
        address pool;
        uint256 allocPoint;
        bool active;
        uint256 rewardDebt;
        uint256 pendingRewards;
    }

    // 精度放大系数，用于累计奖励计算。
    uint256 private constant PRECISION = 1e18;

    // 允许执行奖励分发的操作员角色标识。
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    // 允许暂停或恢复入口的角色标识。
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // 管理器统一分发的奖励代币地址。
    address public immutable rewardToken;
    // 当前奖励来源金库地址。
    address public treasury;
    // 当前操作员地址。
    address public operator;
    // 当前获准维护池列表的工厂地址。
    address public poolFactory;
    // 所有启用池的总权重。
    uint256 public totalAllocPoint;
    // 全局累计到每个权重点的奖励值。
    uint256 public accRewardPerAllocStored;
    // 已经结转到各池待领余额、尚未被池领取的奖励总量。
    uint256 public totalPendingRewards;
    // 因精度截断暂未分配出去的奖励尾差。
    uint256 public undistributedRewards;
    // 当前是否已暂停奖励注入入口。
    bool public paused;

    // 所有已注册池的顺序数组。
    PoolInfo[] public pools;
    // 标记某个地址是否已经注册为池。
    mapping(address => bool) public poolExists;
    // 池地址到池 ID + 1 的映射，用于零值表示不存在。
    mapping(address => uint256) private poolPidPlusOne;

    // 金库地址变更时触发。
    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);
    // 操作员地址变更时触发。
    event OperatorUpdated(address indexed previousOperator, address indexed newOperator);
    // 池工厂地址变更时触发。
    event PoolFactoryUpdated(address indexed previousPoolFactory, address indexed newPoolFactory);
    // 新增奖励池时触发。
    event PoolAdded(uint256 indexed pid, address indexed pool, uint256 allocPoint, bool active);
    // 池权重或启用状态更新时触发。
    event PoolUpdated(uint256 indexed pid, uint256 allocPoint, bool active);
    // 新的一批奖励注入全局累计值时触发。
    event RewardsDistributed(uint256 totalReward, uint256 indexed rewardDelta, address indexed executor);
    // 某个池领取奖励时触发。
    event PoolRewardClaimed(uint256 indexed pid, address indexed pool, uint256 reward, address indexed caller);
    // 合约被暂停时触发。
    event Paused(address indexed account);
    // 合约恢复时触发。
    event Unpaused(address indexed account);
    // 回收误转非奖励代币资产时触发。
    event TokenRecovered(address indexed token, address indexed to, uint256 amount);

    // 限制仅操作员或所有者可调用。
    modifier onlyOperatorOrOwner() {
        require(hasRole(OPERATOR_ROLE, msg.sender) || msg.sender == owner(), "FluxMultiPoolManager: FORBIDDEN");
        _;
    }

    // 限制仅所有者或池工厂可调用。
    modifier onlyOwnerOrPoolFactory() {
        require(msg.sender == owner() || msg.sender == poolFactory, "FluxMultiPoolManager: FORBIDDEN");
        _;
    }

    // 限制仅在未暂停时可调用。
    modifier whenNotPaused() {
        require(!paused, "FluxMultiPoolManager: PAUSED");
        _;
    }

    /**
     * @notice 部署多池奖励管理器。
     * @param _owner 初始所有者地址。
     * @param _treasury 提供奖励资金的金库地址。
     * @param _operator 初始奖励操作员地址。
     * @param _rewardToken 奖励代币地址。
     */
    constructor(address _owner, address _treasury, address _operator, address _rewardToken) Ownable(_owner) {
        require(_treasury != address(0), "FluxMultiPoolManager: ZERO_ADDRESS");
        require(_operator != address(0), "FluxMultiPoolManager: ZERO_ADDRESS");
        require(_rewardToken != address(0), "FluxMultiPoolManager: ZERO_ADDRESS");

        _grantRole(DEFAULT_ADMIN_ROLE, _owner);
        _grantRole(PAUSER_ROLE, _owner);
        _grantRole(OPERATOR_ROLE, _operator);

        treasury = _treasury;
        operator = _operator;
        rewardToken = _rewardToken;
    }

    /**
     * @notice 更新奖励金库地址。
     * @param newTreasury 新的金库地址。
     */
    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "FluxMultiPoolManager: ZERO_ADDRESS");
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }

    /**
     * @notice 更换奖励操作员。
     * @param newOperator 新的操作员地址。
     */
    function setOperator(address newOperator) external onlyOwner {
        require(newOperator != address(0), "FluxMultiPoolManager: ZERO_ADDRESS");
        require(newOperator != operator, "FluxMultiPoolManager: SAME_OPERATOR");
        _grantRole(OPERATOR_ROLE, newOperator);
        _revokeRole(OPERATOR_ROLE, operator);
        emit OperatorUpdated(operator, newOperator);
        operator = newOperator;
    }

    /**
     * @notice 设置池工厂地址。
     * @dev 池工厂可代表所有者添加和停用池，但不能直接修改任意池参数。
     * @param newPoolFactory 新的池工厂地址。
     */
    function setPoolFactory(address newPoolFactory) external onlyOwner {
        require(newPoolFactory != address(0), "FluxMultiPoolManager: ZERO_ADDRESS");
        emit PoolFactoryUpdated(poolFactory, newPoolFactory);
        poolFactory = newPoolFactory;
    }

    /**
     * @notice 暂停奖励分发入口。
     */
    function pause() external {
        require(hasRole(PAUSER_ROLE, msg.sender), "FluxMultiPoolManager: FORBIDDEN");
        require(!paused, "FluxMultiPoolManager: PAUSED");
        paused = true;
        emit Paused(msg.sender);
    }

    /**
     * @notice 恢复奖励分发入口。
     */
    function unpause() external {
        require(hasRole(PAUSER_ROLE, msg.sender), "FluxMultiPoolManager: FORBIDDEN");
        require(paused, "FluxMultiPoolManager: NOT_PAUSED");
        paused = false;
        emit Unpaused(msg.sender);
    }

    /**
     * @notice 新增奖励池。
     * @param pool 池合约地址。
     * @param allocPoint 分配权重。
     * @param active 是否在创建后立即启用。
     */
    function addPool(address pool, uint256 allocPoint, bool active) external onlyOwnerOrPoolFactory {
        require(pool != address(0), "FluxMultiPoolManager: ZERO_ADDRESS");
        require(!poolExists[pool], "FluxMultiPoolManager: POOL_EXISTS");

        uint256 pid = pools.length;
        pools.push(
            PoolInfo({
                pool: pool,
                allocPoint: allocPoint,
                active: active,
                rewardDebt: active ? (allocPoint * accRewardPerAllocStored) / PRECISION : 0,
                pendingRewards: 0
            })
        );
        poolExists[pool] = true;
        poolPidPlusOne[pool] = pid + 1;

        if (active) {
            totalAllocPoint += allocPoint;
        }

        emit PoolAdded(pid, pool, allocPoint, active);
    }

    /**
     * @notice 停用指定奖励池。
     * @dev 停用前会先结算该池已累计的待领取奖励。
     * @param pool 待停用池地址。
     */
    function deactivatePool(address pool) external onlyOwnerOrPoolFactory {
        uint256 pidPlusOne = poolPidPlusOne[pool];
        require(pidPlusOne != 0, "FluxMultiPoolManager: INVALID_POOL");

        uint256 pid = pidPlusOne - 1;
        PoolInfo storage poolInfo = pools[pid];
        _accruePool(poolInfo);

        if (poolInfo.active) {
            totalAllocPoint -= poolInfo.allocPoint;
            poolInfo.active = false;
            poolInfo.rewardDebt = 0;
            emit PoolUpdated(pid, poolInfo.allocPoint, false);
        }
    }

    /**
     * @notice 修改指定池的权重和启用状态。
     * @param pid 池 ID。
     * @param allocPoint 新的分配权重。
     * @param active 新的启用状态。
     */
    function setPool(uint256 pid, uint256 allocPoint, bool active) external onlyOwner {
        require(pid < pools.length, "FluxMultiPoolManager: INVALID_POOL");

        PoolInfo storage poolInfo = pools[pid];
        _accruePool(poolInfo);

        if (poolInfo.active) {
            totalAllocPoint -= poolInfo.allocPoint;
        }
        if (active) {
            totalAllocPoint += allocPoint;
        }

        poolInfo.allocPoint = allocPoint;
        poolInfo.active = active;
        poolInfo.rewardDebt = active ? (allocPoint * accRewardPerAllocStored) / PRECISION : 0;

        emit PoolUpdated(pid, allocPoint, active);
    }

    /**
     * @notice 从金库注入一批奖励并更新全局累计值。
     * @param totalReward 本次准备分发的奖励总量。
     */
    function distributeRewards(uint256 totalReward) external onlyOperatorOrOwner whenNotPaused {
        require(totalReward > 0, "FluxMultiPoolManager: ZERO_AMOUNT");
        require(totalAllocPoint > 0, "FluxMultiPoolManager: NO_ACTIVE_POOLS");

        _requireSourceNotPaused(treasury, "FluxMultiPoolManager: TREASURY_PAUSED");
        IFluxSwapTreasury(treasury).pullApprovedToken(rewardToken, totalReward);

        uint256 distributable = totalReward + undistributedRewards;
        uint256 rewardDelta = (distributable * PRECISION) / totalAllocPoint;
        require(rewardDelta > 0, "FluxMultiPoolManager: REWARD_TOO_SMALL");

        accRewardPerAllocStored += rewardDelta;

        uint256 accounted = (rewardDelta * totalAllocPoint) / PRECISION;
        undistributedRewards = distributable - accounted;

        emit RewardsDistributed(totalReward, rewardDelta, msg.sender);
    }

    /**
     * @notice 允许池合约领取自己当前可得的奖励。
     * @param pool 领取奖励的池地址，且必须等于 `msg.sender`。
     * @return reward 本次实际转出的奖励数量。
     */
    function claimPoolRewards(address pool) external returns (uint256 reward) {
        uint256 pidPlusOne = poolPidPlusOne[pool];
        require(pidPlusOne != 0, "FluxMultiPoolManager: INVALID_POOL");
        require(msg.sender == pool, "FluxMultiPoolManager: FORBIDDEN");

        uint256 pid = pidPlusOne - 1;
        PoolInfo storage poolInfo = pools[pid];
        reward = _accruePool(poolInfo);

        if (reward == 0) {
            return 0;
        }

        poolInfo.pendingRewards = 0;
        totalPendingRewards -= reward;
        TransferHelper.safeTransfer(rewardToken, pool, reward);

        emit PoolRewardClaimed(pid, pool, reward, msg.sender);
    }

    /**
     * @notice 回收误转入管理器的非奖励代币资产。
     * @param token 需要回收的代币地址。
     * @param to 接收地址。
     * @param amount 回收数量。
     */
    function recoverToken(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(0), "FluxMultiPoolManager: ZERO_ADDRESS");
        require(to != address(0), "FluxMultiPoolManager: ZERO_ADDRESS");
        require(token != rewardToken, "FluxMultiPoolManager: REWARD_TOKEN_LOCKED");
        TransferHelper.safeTransfer(token, to, amount);
        emit TokenRecovered(token, to, amount);
    }

    /**
     * @notice 查询指定池当前可领取的奖励。
     * @param pool 目标池地址。
     * @return reward 当前待领取奖励数量。
     */
    function pendingPoolRewards(address pool) external view returns (uint256 reward) {
        uint256 pidPlusOne = poolPidPlusOne[pool];
        require(pidPlusOne != 0, "FluxMultiPoolManager: INVALID_POOL");

        PoolInfo storage poolInfo = pools[pidPlusOne - 1];
        reward = poolInfo.pendingRewards;

        if (poolInfo.active && poolInfo.allocPoint > 0) {
            reward += ((poolInfo.allocPoint * accRewardPerAllocStored) / PRECISION) - poolInfo.rewardDebt;
        }
    }

    /**
     * @notice 返回当前已注册池数量。
     * @return length 池数量。
     */
    function poolLength() external view returns (uint256 length) {
        length = pools.length;
    }

    /**
     * @notice 转移所有权并同步迁移管理角色。
     * @param newOwner 新的所有者地址。
     */
    function transferOwnership(address newOwner) public override onlyOwner {
        require(newOwner != address(0), "FluxMultiPoolManager: ZERO_ADDRESS");

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
        require(role != OPERATOR_ROLE, "FluxMultiPoolManager: ROLE_MANAGED_BY_SET_OPERATOR");
        super.grantRole(role, account);
    }

    /**
     * @notice 撤销访问控制角色。
     * @dev `OPERATOR_ROLE` 必须经由 `setOperator` 管理。
     * @param role 待撤销角色。
     * @param account 待撤销账户。
     */
    function revokeRole(bytes32 role, address account) public override onlyRole(getRoleAdmin(role)) {
        require(role != OPERATOR_ROLE, "FluxMultiPoolManager: ROLE_MANAGED_BY_SET_OPERATOR");
        super.revokeRole(role, account);
    }

    /**
     * @notice 放弃访问控制角色。
     * @dev `OPERATOR_ROLE` 不允许直接放弃。
     * @param role 待放弃角色。
     * @param callerConfirmation 放弃确认地址。
     */
    function renounceRole(bytes32 role, address callerConfirmation) public override {
        require(role != OPERATOR_ROLE, "FluxMultiPoolManager: ROLE_MANAGED_BY_SET_OPERATOR");
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
     * @notice 把某个池当前应得的新奖励结转到池内待领余额。
     * @param poolInfo 目标池的存储引用。
     * @return reward 结转后该池总待领奖励数量。
     */
    function _accruePool(PoolInfo storage poolInfo) private returns (uint256 reward) {
        reward = poolInfo.pendingRewards;
        uint256 newlyAccrued;

        if (poolInfo.active && poolInfo.allocPoint > 0) {
            newlyAccrued = ((poolInfo.allocPoint * accRewardPerAllocStored) / PRECISION) - poolInfo.rewardDebt;
            poolInfo.rewardDebt = (poolInfo.allocPoint * accRewardPerAllocStored) / PRECISION;
        } else {
            poolInfo.rewardDebt = 0;
        }

        if (newlyAccrued > 0) {
            uint256 currentBalance = IERC20(rewardToken).balanceOf(address(this));
            uint256 reservedBalance = totalPendingRewards + undistributedRewards;
            uint256 availableUnreservedRewards = currentBalance > reservedBalance
                ? currentBalance - reservedBalance
                : 0;

            if (newlyAccrued > availableUnreservedRewards) {
                newlyAccrued = availableUnreservedRewards;
            }

            reward += newlyAccrued;
            totalPendingRewards += newlyAccrued;
        }

        poolInfo.pendingRewards = reward;
    }

    /**
     * @notice 检查外部来源是否已暂停。
     * @dev 若目标合约未实现 `paused()`，则视为无需额外检查。
     * @param source 目标外部合约地址。
     * @param errorMessage 暂停时抛出的错误信息。
     */
    function _requireSourceNotPaused(address source, string memory errorMessage) private view {
        (bool success, bytes memory data) = source.staticcall(abi.encodeWithSignature("paused()"));
        if (success && data.length >= 32) {
            require(!abi.decode(data, (bool)), errorMessage);
        }
    }
}
