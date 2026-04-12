// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import "../interfaces/IFluxMultiPoolManager.sol";
import "./FluxSwapLPStakingPool.sol";
import "./FluxSwapStakingRewards.sol";

/**
 * @title Flux 池工厂
 * @notice 统一创建单币质押池和 LP 质押池，并把新池注册到多池奖励管理器。
 * @dev 工厂会维护“受管池”登记信息，便于后续统一管理奖励来源和所有权移交。
 */
contract FluxPoolFactory is Ownable {
    // 负责奖励分发登记的多池管理器地址。
    address public immutable manager;
    // DEX Pair 工厂地址。
    address public immutable dexFactory;
    // 所有新建池默认使用的奖励代币。
    address public immutable rewardToken;

    // 单币质押资产到受管池地址的映射。
    mapping(address => address) public singleTokenPools;
    // LP 资产到受管池地址的映射。
    mapping(address => address) public lpTokenPools;
    // 标记某个池是否仍由工厂托管。
    mapping(address => bool) public managedPools;
    // 受管池对应的质押资产地址。
    mapping(address => address) public managedPoolStakingAsset;
    // 受管池是否为 LP 池的标记。
    mapping(address => bool) public managedPoolIsLP;

    // 创建单币质押池时触发。
    event SingleTokenPoolCreated(address indexed stakingToken, address indexed pool, uint256 allocPoint, bool active);
    // 创建 LP 质押池时触发。
    event LPPoolCreated(address indexed lpToken, address indexed pool, uint256 allocPoint, bool active);
    // 单独更新受管池奖励来源时触发。
    event ManagedPoolRewardSourceUpdated(address indexed pool, address indexed rewardSource);
    // 单独更新受管池奖励通知者时触发。
    event ManagedPoolRewardNotifierUpdated(address indexed pool, address indexed rewardNotifier);
    // 同时更新受管池奖励配置时触发。
    event ManagedPoolRewardConfigurationUpdated(
        address indexed pool,
        address indexed rewardSource,
        address indexed rewardNotifier
    );
    // 受管池所有权移交时触发。
    event ManagedPoolOwnershipTransferred(address indexed pool, address indexed newOwner);
    // 回收受管池未分配奖励时触发。
    event ManagedPoolUnallocatedRewardsRecovered(address indexed pool, address indexed to, uint256 amount);

    /**
     * @notice 初始化池工厂。
     * @param _owner 工厂所有者地址。
     * @param _manager 多池奖励管理器地址。
     * @param _dexFactory DEX Pair 工厂地址。
     * @param _rewardToken 所有池默认使用的奖励代币地址。
     */
    constructor(address _owner, address _manager, address _dexFactory, address _rewardToken) Ownable(_owner) {
        require(_manager != address(0), "FluxPoolFactory: ZERO_ADDRESS");
        require(_dexFactory != address(0), "FluxPoolFactory: ZERO_ADDRESS");
        require(_rewardToken != address(0), "FluxPoolFactory: ZERO_ADDRESS");

        manager = _manager;
        dexFactory = _dexFactory;
        rewardToken = _rewardToken;
    }

    /**
     * @notice 创建单币质押池并登记为受管池。
     * @param stakingToken 被质押的单币资产地址。
     * @param allocPoint 分配给该池的权重。
     * @param active 创建后是否立即启用。
     * @return pool 新建池合约地址。
     */
    function createSingleTokenPool(address stakingToken, uint256 allocPoint, bool active) external onlyOwner returns (address pool) {
        require(stakingToken != address(0), "FluxPoolFactory: ZERO_ADDRESS");
        require(singleTokenPools[stakingToken] == address(0), "FluxPoolFactory: POOL_EXISTS");

        pool = address(new FluxSwapStakingRewards(address(this), stakingToken, rewardToken, manager, address(this)));

        FluxSwapStakingRewards(pool).setRewardConfiguration(manager, pool);

        singleTokenPools[stakingToken] = pool;
        managedPools[pool] = true;
        managedPoolStakingAsset[pool] = stakingToken;
        managedPoolIsLP[pool] = false;
        IFluxMultiPoolManager(manager).addPool(pool, allocPoint, active);

        emit SingleTokenPoolCreated(stakingToken, pool, allocPoint, active);
    }

    /**
     * @notice 创建 LP 质押池并登记为受管池。
     * @param lpToken Pair LP Token 地址。
     * @param allocPoint 分配给该池的权重。
     * @param active 创建后是否立即启用。
     * @return pool 新建池合约地址。
     */
    function createLPPool(address lpToken, uint256 allocPoint, bool active) external onlyOwner returns (address pool) {
        require(lpToken != address(0), "FluxPoolFactory: ZERO_ADDRESS");
        require(lpTokenPools[lpToken] == address(0), "FluxPoolFactory: POOL_EXISTS");

        pool = address(
            new FluxSwapLPStakingPool(
                address(this),
                dexFactory,
                lpToken,
                rewardToken,
                manager,
                address(this)
            )
        );

        FluxSwapStakingRewards(pool).setRewardConfiguration(manager, pool);

        lpTokenPools[lpToken] = pool;
        managedPools[pool] = true;
        managedPoolStakingAsset[pool] = lpToken;
        managedPoolIsLP[pool] = true;
        IFluxMultiPoolManager(manager).addPool(pool, allocPoint, active);

        emit LPPoolCreated(lpToken, pool, allocPoint, active);
    }

    /**
     * @notice 为受管池单独设置奖励来源。
     * @param pool 目标受管池地址。
     * @param rewardSource 新的奖励来源地址。
     */
    function setManagedPoolRewardSource(address pool, address rewardSource) external onlyOwner {
        _requireManagedPool(pool);
        FluxSwapStakingRewards(pool).setRewardSource(rewardSource);
        emit ManagedPoolRewardSourceUpdated(pool, rewardSource);
    }

    /**
     * @notice 为受管池单独设置奖励通知者。
     * @param pool 目标受管池地址。
     * @param rewardNotifier 新的奖励通知者地址。
     */
    function setManagedPoolRewardNotifier(address pool, address rewardNotifier) external onlyOwner {
        _requireManagedPool(pool);
        FluxSwapStakingRewards(pool).setRewardNotifier(rewardNotifier);
        emit ManagedPoolRewardNotifierUpdated(pool, rewardNotifier);
    }

    /**
     * @notice 为受管池一次性设置奖励来源和通知者。
     * @param pool 目标受管池地址。
     * @param rewardSource 新的奖励来源地址。
     * @param rewardNotifier 新的奖励通知者地址。
     */
    function setManagedPoolRewardConfiguration(
        address pool,
        address rewardSource,
        address rewardNotifier
    ) external onlyOwner {
        _requireManagedPool(pool);
        FluxSwapStakingRewards(pool).setRewardConfiguration(rewardSource, rewardNotifier);
        emit ManagedPoolRewardConfigurationUpdated(pool, rewardSource, rewardNotifier);
    }

    /**
     * @notice 把受管池移交给新的所有者。
     * @dev 移交前会先在管理器中停用池，并清理工厂内部的受管登记。
     * @param pool 待移交的受管池地址。
     * @param newOwner 新的池所有者地址。
     */
    function transferManagedPoolOwnership(address pool, address newOwner) external onlyOwner {
        _requireManagedPool(pool);
        require(newOwner != FluxSwapStakingRewards(pool).owner(), "FluxPoolFactory: SAME_OWNER");
        IFluxMultiPoolManager(manager).deactivatePool(pool);
        FluxSwapStakingRewards(pool).transferOwnership(newOwner);
        _clearManagedPoolAssetRegistration(pool);
        managedPools[pool] = false;
        emit ManagedPoolOwnershipTransferred(pool, newOwner);
    }

    /**
     * @notice 回收受管池中当前仍未分配给用户的奖励。
     * @param pool 目标受管池地址。
     * @param to 接收回收奖励的地址。
     * @return amount 实际回收的奖励数量。
     */
    function recoverManagedPoolUnallocatedRewards(address pool, address to) external onlyOwner returns (uint256 amount) {
        _requireManagedPool(pool);
        amount = FluxSwapStakingRewards(pool).recoverUnallocatedRewards(to);
        emit ManagedPoolUnallocatedRewardsRecovered(pool, to, amount);
    }

    /**
     * @notice 清理受管池与其质押资产的登记关系。
     * @param pool 目标受管池地址。
     */
    function _clearManagedPoolAssetRegistration(address pool) private {
        address stakingAsset = managedPoolStakingAsset[pool];
        if (stakingAsset == address(0)) {
            return;
        }

        if (managedPoolIsLP[pool]) {
            delete lpTokenPools[stakingAsset];
        } else {
            delete singleTokenPools[stakingAsset];
        }

        delete managedPoolStakingAsset[pool];
        delete managedPoolIsLP[pool];
    }

    /**
     * @notice 校验目标池仍由工厂管理。
     * @param pool 待校验的池地址。
     */
    function _requireManagedPool(address pool) private view {
        require(managedPools[pool], "FluxPoolFactory: POOL_NOT_MANAGED");
    }
}
