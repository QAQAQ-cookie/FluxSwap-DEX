// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../interfaces/IFluxSwapTreasury.sol";
import "../libraries/TransferHelper.sol";

contract FluxMultiPoolManager is Ownable, AccessControl {
    struct PoolInfo {
        address pool;
        uint256 allocPoint;
        bool active;
        uint256 rewardDebt;
        uint256 pendingRewards;
    }

    uint256 private constant PRECISION = 1e18;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    address public immutable rewardToken;
    address public treasury;
    address public operator;
    address public poolFactory;
    uint256 public totalAllocPoint;
    uint256 public accRewardPerAllocStored;
    uint256 public totalPendingRewards;
    uint256 public undistributedRewards;
    bool public paused;

    PoolInfo[] public pools;
    mapping(address => bool) public poolExists;
    mapping(address => uint256) private poolPidPlusOne;

    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);
    event OperatorUpdated(address indexed previousOperator, address indexed newOperator);
    event PoolFactoryUpdated(address indexed previousPoolFactory, address indexed newPoolFactory);
    event PoolAdded(uint256 indexed pid, address indexed pool, uint256 allocPoint, bool active);
    event PoolUpdated(uint256 indexed pid, uint256 allocPoint, bool active);
    event RewardsDistributed(uint256 totalReward, uint256 indexed rewardDelta, address indexed executor);
    event PoolRewardClaimed(uint256 indexed pid, address indexed pool, uint256 reward, address indexed caller);
    event Paused(address indexed account);
    event Unpaused(address indexed account);
    event TokenRecovered(address indexed token, address indexed to, uint256 amount);

    modifier onlyOperatorOrOwner() {
        require(hasRole(OPERATOR_ROLE, msg.sender) || msg.sender == owner(), "FluxMultiPoolManager: FORBIDDEN");
        _;
    }

    modifier onlyOwnerOrPoolFactory() {
        require(msg.sender == owner() || msg.sender == poolFactory, "FluxMultiPoolManager: FORBIDDEN");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "FluxMultiPoolManager: PAUSED");
        _;
    }

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

    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "FluxMultiPoolManager: ZERO_ADDRESS");
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }

    function setOperator(address newOperator) external onlyOwner {
        require(newOperator != address(0), "FluxMultiPoolManager: ZERO_ADDRESS");
        require(newOperator != operator, "FluxMultiPoolManager: SAME_OPERATOR");
        _grantRole(OPERATOR_ROLE, newOperator);
        _revokeRole(OPERATOR_ROLE, operator);
        emit OperatorUpdated(operator, newOperator);
        operator = newOperator;
    }

    function setPoolFactory(address newPoolFactory) external onlyOwner {
        require(newPoolFactory != address(0), "FluxMultiPoolManager: ZERO_ADDRESS");
        emit PoolFactoryUpdated(poolFactory, newPoolFactory);
        poolFactory = newPoolFactory;
    }

    function pause() external {
        require(hasRole(PAUSER_ROLE, msg.sender), "FluxMultiPoolManager: FORBIDDEN");
        require(!paused, "FluxMultiPoolManager: PAUSED");
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external {
        require(hasRole(PAUSER_ROLE, msg.sender), "FluxMultiPoolManager: FORBIDDEN");
        require(paused, "FluxMultiPoolManager: NOT_PAUSED");
        paused = false;
        emit Unpaused(msg.sender);
    }


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

    function recoverToken(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(0), "FluxMultiPoolManager: ZERO_ADDRESS");
        require(to != address(0), "FluxMultiPoolManager: ZERO_ADDRESS");
        require(token != rewardToken, "FluxMultiPoolManager: REWARD_TOKEN_LOCKED");
        TransferHelper.safeTransfer(token, to, amount);
        emit TokenRecovered(token, to, amount);
    }
    function pendingPoolRewards(address pool) external view returns (uint256 reward) {
        uint256 pidPlusOne = poolPidPlusOne[pool];
        require(pidPlusOne != 0, "FluxMultiPoolManager: INVALID_POOL");

        PoolInfo storage poolInfo = pools[pidPlusOne - 1];
        reward = poolInfo.pendingRewards;

        if (poolInfo.active && poolInfo.allocPoint > 0) {
            reward += ((poolInfo.allocPoint * accRewardPerAllocStored) / PRECISION) - poolInfo.rewardDebt;
        }
    }

    function poolLength() external view returns (uint256) {
        return pools.length;
    }

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


    function grantRole(bytes32 role, address account) public override onlyRole(getRoleAdmin(role)) {
        require(role != OPERATOR_ROLE, "FluxMultiPoolManager: ROLE_MANAGED_BY_SET_OPERATOR");
        super.grantRole(role, account);
    }

    function revokeRole(bytes32 role, address account) public override onlyRole(getRoleAdmin(role)) {
        require(role != OPERATOR_ROLE, "FluxMultiPoolManager: ROLE_MANAGED_BY_SET_OPERATOR");
        super.revokeRole(role, account);
    }

    function renounceRole(bytes32 role, address callerConfirmation) public override {
        require(role != OPERATOR_ROLE, "FluxMultiPoolManager: ROLE_MANAGED_BY_SET_OPERATOR");
        super.renounceRole(role, callerConfirmation);
    }

    function supportsInterface(bytes4 interfaceId) public view override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

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

    function _requireSourceNotPaused(address source, string memory errorMessage) private view {
        (bool success, bytes memory data) = source.staticcall(abi.encodeWithSignature("paused()"));
        if (success && data.length >= 32) {
            require(!abi.decode(data, (bool)), errorMessage);
        }
    }


}
