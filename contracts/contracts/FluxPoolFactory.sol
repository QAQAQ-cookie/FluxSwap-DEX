// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import "../interfaces/IFluxMultiPoolManager.sol";
import "./FluxSwapLPStakingPool.sol";
import "./FluxSwapStakingRewards.sol";

contract FluxPoolFactory is Ownable {
    address public immutable manager;
    address public immutable dexFactory;
    address public immutable rewardToken;

    mapping(address => address) public singleTokenPools;
    mapping(address => address) public lpTokenPools;
    mapping(address => bool) public managedPools;

    event SingleTokenPoolCreated(address indexed stakingToken, address indexed pool, uint256 allocPoint, bool active);
    event LPPoolCreated(address indexed lpToken, address indexed pool, uint256 allocPoint, bool active);
    event ManagedPoolRewardSourceUpdated(address indexed pool, address indexed rewardSource);
    event ManagedPoolRewardNotifierUpdated(address indexed pool, address indexed rewardNotifier);
    event ManagedPoolRewardConfigurationUpdated(
        address indexed pool,
        address indexed rewardSource,
        address indexed rewardNotifier
    );
    event ManagedPoolRewardsDurationUpdated(address indexed pool, uint256 rewardsDuration);
    event ManagedPoolOwnershipTransferred(address indexed pool, address indexed newOwner);
    event ManagedPoolUnallocatedRewardsRecovered(address indexed pool, address indexed to, uint256 amount);

    constructor(address _owner, address _manager, address _dexFactory, address _rewardToken) Ownable(_owner) {
        require(_manager != address(0), "FluxPoolFactory: ZERO_ADDRESS");
        require(_dexFactory != address(0), "FluxPoolFactory: ZERO_ADDRESS");
        require(_rewardToken != address(0), "FluxPoolFactory: ZERO_ADDRESS");

        manager = _manager;
        dexFactory = _dexFactory;
        rewardToken = _rewardToken;
    }

    function createSingleTokenPool(
        address stakingToken,
        uint256 allocPoint,
        bool active,
        uint256 rewardsDuration
    ) external onlyOwner returns (address pool) {
        require(stakingToken != address(0), "FluxPoolFactory: ZERO_ADDRESS");
        require(singleTokenPools[stakingToken] == address(0), "FluxPoolFactory: POOL_EXISTS");

        pool = address(
            new FluxSwapStakingRewards(
                address(this),
                stakingToken,
                rewardToken,
                manager,
                address(this),
                rewardsDuration
            )
        );

        FluxSwapStakingRewards(pool).setRewardConfiguration(manager, pool);

        singleTokenPools[stakingToken] = pool;
        managedPools[pool] = true;
        IFluxMultiPoolManager(manager).addPool(pool, allocPoint, active);

        emit SingleTokenPoolCreated(stakingToken, pool, allocPoint, active);
    }

    function createLPPool(
        address lpToken,
        uint256 allocPoint,
        bool active,
        uint256 rewardsDuration
    ) external onlyOwner returns (address pool) {
        require(lpToken != address(0), "FluxPoolFactory: ZERO_ADDRESS");
        require(lpTokenPools[lpToken] == address(0), "FluxPoolFactory: POOL_EXISTS");

        pool = address(
            new FluxSwapLPStakingPool(
                address(this),
                dexFactory,
                lpToken,
                rewardToken,
                manager,
                address(this),
                rewardsDuration
            )
        );

        FluxSwapStakingRewards(pool).setRewardConfiguration(manager, pool);

        lpTokenPools[lpToken] = pool;
        managedPools[pool] = true;
        IFluxMultiPoolManager(manager).addPool(pool, allocPoint, active);

        emit LPPoolCreated(lpToken, pool, allocPoint, active);
    }

    function setManagedPoolRewardSource(address pool, address rewardSource) external onlyOwner {
        _requireManagedPool(pool);
        FluxSwapStakingRewards(pool).setRewardSource(rewardSource);
        emit ManagedPoolRewardSourceUpdated(pool, rewardSource);
    }

    function setManagedPoolRewardNotifier(address pool, address rewardNotifier) external onlyOwner {
        _requireManagedPool(pool);
        FluxSwapStakingRewards(pool).setRewardNotifier(rewardNotifier);
        emit ManagedPoolRewardNotifierUpdated(pool, rewardNotifier);
    }

    function setManagedPoolRewardConfiguration(
        address pool,
        address rewardSource,
        address rewardNotifier
    ) external onlyOwner {
        _requireManagedPool(pool);
        FluxSwapStakingRewards(pool).setRewardConfiguration(rewardSource, rewardNotifier);
        emit ManagedPoolRewardConfigurationUpdated(pool, rewardSource, rewardNotifier);
    }

    function setManagedPoolRewardsDuration(address pool, uint256 rewardsDuration) external onlyOwner {
        _requireManagedPool(pool);
        FluxSwapStakingRewards(pool).setRewardsDuration(rewardsDuration);
        emit ManagedPoolRewardsDurationUpdated(pool, rewardsDuration);
    }

    function transferManagedPoolOwnership(address pool, address newOwner) external onlyOwner {
        _requireManagedPool(pool);
        require(newOwner != FluxSwapStakingRewards(pool).owner(), "FluxPoolFactory: SAME_OWNER");
        FluxSwapStakingRewards(pool).transferOwnership(newOwner);
        managedPools[pool] = false;
        emit ManagedPoolOwnershipTransferred(pool, newOwner);
    }

    function recoverManagedPoolUnallocatedRewards(address pool, address to) external onlyOwner returns (uint256 amount) {
        _requireManagedPool(pool);
        amount = FluxSwapStakingRewards(pool).recoverUnallocatedRewards(to);
        emit ManagedPoolUnallocatedRewardsRecovered(pool, to, amount);
    }

    function _requireManagedPool(address pool) private view {
        require(managedPools[pool], "FluxPoolFactory: POOL_NOT_MANAGED");
    }
}
