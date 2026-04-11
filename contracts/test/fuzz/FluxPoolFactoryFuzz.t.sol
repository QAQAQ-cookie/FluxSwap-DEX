// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";

import "../../contracts/FluxPoolFactory.sol";
import "../../contracts/FluxSwapFactory.sol";
import "../../contracts/FluxSwapLPStakingPool.sol";
import "../../contracts/FluxSwapStakingRewards.sol";
import "../../contracts/mocks/MockERC20.sol";

contract FluxPoolFactoryManagerMock {
    address public lastAddedPool;
    uint256 public lastAllocPoint;
    bool public lastActive;
    address public lastDeactivatedPool;

    function addPool(address pool, uint256 allocPoint, bool active) external {
        lastAddedPool = pool;
        lastAllocPoint = allocPoint;
        lastActive = active;
    }

    function deactivatePool(address pool) external {
        lastDeactivatedPool = pool;
    }
}

contract FluxPoolFactoryFuzzTest is Test {
    uint256 private constant MAX_ALLOC_POINT = 1_000_000;

    FluxPoolFactory private poolFactory;
    FluxPoolFactoryManagerMock private manager;
    FluxSwapFactory private dexFactory;
    MockERC20 private rewardToken;

    address private newPoolOwner;

    function setUp() public {
        manager = new FluxPoolFactoryManagerMock();
        dexFactory = new FluxSwapFactory(address(this));
        rewardToken = new MockERC20("Reward Token", "RWD", 18);
        newPoolOwner = makeAddr("newPoolOwner");

        poolFactory = new FluxPoolFactory(address(this), address(manager), address(dexFactory), address(rewardToken));
    }

    // 这一组 fuzz 关注 PoolFactory 创建和移交时的联动一致性：
    // 1. createSingleTokenPool / createLPPool 后，映射、managed 标记、manager 注册必须同步完成。
    // 2. managed pool 的 rewardSource / rewardNotifier 配置必须落到 manager / pool 自身。
    // 3. transferManagedPoolOwnership 后，工厂侧的 managed 注册必须被彻底清掉。
    function testFuzz_createSingleTokenPool_registersManagedPoolState(uint32 rawAllocPoint, bool active) public {
        uint256 allocPoint = bound(uint256(rawAllocPoint), 0, MAX_ALLOC_POINT);
        MockERC20 stakingToken = new MockERC20("Stake Token", "STK", 18);

        address pool = poolFactory.createSingleTokenPool(address(stakingToken), allocPoint, active);
        FluxSwapStakingRewards stakingPool = FluxSwapStakingRewards(pool);

        assertEq(poolFactory.singleTokenPools(address(stakingToken)), pool);
        assertTrue(poolFactory.managedPools(pool));
        assertEq(poolFactory.managedPoolStakingAsset(pool), address(stakingToken));
        assertFalse(poolFactory.managedPoolIsLP(pool));
        assertEq(manager.lastAddedPool(), pool);
        assertEq(manager.lastAllocPoint(), allocPoint);
        assertEq(manager.lastActive(), active);
        assertEq(stakingPool.rewardSource(), address(manager));
        assertEq(stakingPool.rewardNotifier(), pool);
    }

    function testFuzz_createLPPool_registersPairMetadata(uint32 rawAllocPoint, bool active) public {
        uint256 allocPoint = bound(uint256(rawAllocPoint), 0, MAX_ALLOC_POINT);
        MockERC20 tokenA = new MockERC20("Token A", "TKNA", 18);
        MockERC20 tokenB = new MockERC20("Token B", "TKNB", 18);

        dexFactory.createPair(address(tokenA), address(tokenB));
        address lpToken = dexFactory.getPair(address(tokenA), address(tokenB));

        address pool = poolFactory.createLPPool(lpToken, allocPoint, active);
        FluxSwapLPStakingPool lpPool = FluxSwapLPStakingPool(pool);

        assertEq(poolFactory.lpTokenPools(lpToken), pool);
        assertTrue(poolFactory.managedPools(pool));
        assertEq(poolFactory.managedPoolStakingAsset(pool), lpToken);
        assertTrue(poolFactory.managedPoolIsLP(pool));
        assertEq(manager.lastAddedPool(), pool);
        assertEq(manager.lastAllocPoint(), allocPoint);
        assertEq(manager.lastActive(), active);
        assertEq(lpPool.factory(), address(dexFactory));
        assertEq(lpPool.lpToken(), lpToken);
        assertEq(lpPool.rewardSource(), address(manager));
        assertEq(lpPool.rewardNotifier(), pool);
    }

    function testFuzz_transferManagedPoolOwnership_clearsFactoryRegistration(uint32 rawAllocPoint, bool active) public {
        uint256 allocPoint = bound(uint256(rawAllocPoint), 0, MAX_ALLOC_POINT);
        MockERC20 stakingToken = new MockERC20("Stake Token", "STK", 18);

        address pool = poolFactory.createSingleTokenPool(address(stakingToken), allocPoint, active);

        poolFactory.transferManagedPoolOwnership(pool, newPoolOwner);

        assertFalse(poolFactory.managedPools(pool));
        assertEq(poolFactory.singleTokenPools(address(stakingToken)), address(0));
        assertEq(poolFactory.managedPoolStakingAsset(pool), address(0));
        assertFalse(poolFactory.managedPoolIsLP(pool));
        assertEq(manager.lastDeactivatedPool(), pool);
        assertEq(FluxSwapStakingRewards(pool).owner(), newPoolOwner);
    }
}
