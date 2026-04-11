// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";

import {FluxMultiPoolManager} from "../../contracts/FluxMultiPoolManager.sol";
import {FluxPoolFactory} from "../../contracts/FluxPoolFactory.sol";
import {FluxSwapFactory} from "../../contracts/FluxSwapFactory.sol";
import {FluxSwapLPStakingPool} from "../../contracts/FluxSwapLPStakingPool.sol";
import {FluxSwapStakingRewards} from "../../contracts/FluxSwapStakingRewards.sol";
import {MockERC20} from "../../contracts/mocks/MockERC20.sol";

contract FluxFactoryPoolManagerTreasuryMock {
    function pullApprovedToken(address token, uint256 amount) external {
        MockERC20(token).transfer(msg.sender, amount);
    }

    function burnApprovedToken(address, uint256) external pure {}

    function isFluxSwapTreasury() external pure returns (bool) {
        return true;
    }
}

contract FluxFactoryPoolManagerStatefulFuzzTest is Test {
    uint256 private constant MAX_REWARD = 1e24;

    MockERC20 private rewardToken;
    MockERC20 private singleTokenA;
    MockERC20 private singleTokenB;
    MockERC20 private pairOneTokenA;
    MockERC20 private pairOneTokenB;
    MockERC20 private pairTwoTokenA;
    MockERC20 private pairTwoTokenB;

    FluxFactoryPoolManagerTreasuryMock private treasury;
    FluxMultiPoolManager private manager;
    FluxSwapFactory private dexFactory;
    FluxPoolFactory private poolFactory;

    address private recipient;
    address private newOwner;

    struct FactoryScenario {
        uint256 oldSingleAlloc;
        uint256 oldLpAlloc;
        uint256 dormantSingleAlloc;
        uint256 survivorLpAlloc;
        uint256 newSingleAlloc;
        uint256 newLpAlloc;
        uint256 rewardOne;
        uint256 rewardTwo;
    }

    struct PoolAddresses {
        address pairOne;
        address pairTwo;
        address oldSinglePool;
        address oldLpPool;
        address dormantSinglePool;
        address survivorLpPool;
        address newSinglePool;
        address newLpPool;
    }

    function setUp() public {
        rewardToken = new MockERC20("Reward Token", "RWD", 18);
        singleTokenA = new MockERC20("Single Token A", "STA", 18);
        singleTokenB = new MockERC20("Single Token B", "STB", 18);
        pairOneTokenA = new MockERC20("Pair One Token A", "P1A", 18);
        pairOneTokenB = new MockERC20("Pair One Token B", "P1B", 18);
        pairTwoTokenA = new MockERC20("Pair Two Token A", "P2A", 18);
        pairTwoTokenB = new MockERC20("Pair Two Token B", "P2B", 18);

        treasury = new FluxFactoryPoolManagerTreasuryMock();
        manager = new FluxMultiPoolManager(address(this), address(treasury), address(this), address(rewardToken));
        dexFactory = new FluxSwapFactory(address(this));
        poolFactory = new FluxPoolFactory(address(this), address(manager), address(dexFactory), address(rewardToken));

        recipient = makeAddr("recipient");
        newOwner = makeAddr("newOwner");

        manager.setPoolFactory(address(poolFactory));
    }

    // 这一组 stateful fuzz 把 factory / poolFactory / manager 串到同一条创建-移交-重建状态机里：
    // 1. 先创建 active / inactive 混合的 single 与 LP pools，再插入移交 ownership、同资产重建、owner 侧激活/停用。
    // 2. 旧池移交后映射必须被清空，新池创建后必须立刻重新注册到同一 staking asset / LP token。
    // 3. 第二轮奖励只能继续流向仍处于 active 且 managed 的池，旧池和被停用池的 pending 不得再增长。
    function testFuzz_recreationActivationAndDeactivationSequence_preservesMappingsAndAllocAccounting(
        uint32 rawOldSingleAlloc,
        uint32 rawOldLpAlloc,
        uint32 rawDormantSingleAlloc,
        uint32 rawSurvivorLpAlloc,
        uint32 rawNewSingleAlloc,
        uint32 rawNewLpAlloc,
        uint96 rawRewardOne,
        uint96 rawRewardTwo
    ) public {
        FactoryScenario memory scenario = _boundScenario(
            rawOldSingleAlloc,
            rawOldLpAlloc,
            rawDormantSingleAlloc,
            rawSurvivorLpAlloc,
            rawNewSingleAlloc,
            rawNewLpAlloc,
            rawRewardOne,
            rawRewardTwo
        );
        PoolAddresses memory pools_ = _createInitialPools(scenario);

        _injectAndDistribute(scenario.rewardOne);

        uint256 oldSinglePendingBeforeTransfer = manager.pendingPoolRewards(pools_.oldSinglePool);
        uint256 oldLpPendingBeforeTransfer = manager.pendingPoolRewards(pools_.oldLpPool);
        uint256 survivorLpPendingBeforeDeactivate = manager.pendingPoolRewards(pools_.survivorLpPool);

        poolFactory.transferManagedPoolOwnership(pools_.oldSinglePool, newOwner);
        poolFactory.transferManagedPoolOwnership(pools_.oldLpPool, newOwner);

        assertFalse(poolFactory.managedPools(pools_.oldSinglePool));
        assertFalse(poolFactory.managedPools(pools_.oldLpPool));
        assertEq(poolFactory.singleTokenPools(address(singleTokenA)), address(0));
        assertEq(poolFactory.lpTokenPools(pools_.pairOne), address(0));

        pools_.newSinglePool = poolFactory.createSingleTokenPool(address(singleTokenA), scenario.newSingleAlloc, false);
        pools_.newLpPool = poolFactory.createLPPool(pools_.pairOne, scenario.newLpAlloc, true);

        assertEq(poolFactory.singleTokenPools(address(singleTokenA)), pools_.newSinglePool);
        assertEq(poolFactory.lpTokenPools(pools_.pairOne), pools_.newLpPool);
        assertTrue(poolFactory.managedPools(pools_.newSinglePool));
        assertTrue(poolFactory.managedPools(pools_.newLpPool));

        manager.setPool(2, scenario.dormantSingleAlloc, true);
        manager.setPool(3, scenario.survivorLpAlloc, false);
        manager.setPool(4, scenario.newSingleAlloc, true);

        assertEq(manager.totalAllocPoint(), scenario.dormantSingleAlloc + scenario.newSingleAlloc + scenario.newLpAlloc);
        assertEq(manager.poolLength(), 6);

        _injectAndDistribute(scenario.rewardTwo);

        assertEq(manager.pendingPoolRewards(pools_.oldSinglePool), oldSinglePendingBeforeTransfer);
        assertEq(manager.pendingPoolRewards(pools_.oldLpPool), oldLpPendingBeforeTransfer);
        assertEq(manager.pendingPoolRewards(pools_.survivorLpPool), survivorLpPendingBeforeDeactivate);

        uint256 dormantSingleExpected = manager.pendingPoolRewards(pools_.dormantSinglePool);
        uint256 newSingleExpected = manager.pendingPoolRewards(pools_.newSinglePool);
        uint256 newLpExpected = manager.pendingPoolRewards(pools_.newLpPool);

        uint256 dormantSingleRecovered = _syncAndRecoverManagedPool(pools_.dormantSinglePool);
        uint256 newSingleRecovered = _syncAndRecoverManagedPool(pools_.newSinglePool);
        uint256 newLpRecovered = _syncAndRecoverManagedPool(pools_.newLpPool);

        _assertExpectedVsRecovered(dormantSingleExpected, dormantSingleRecovered);
        _assertExpectedVsRecovered(newSingleExpected, newSingleRecovered);
        _assertExpectedVsRecovered(newLpExpected, newLpRecovered);
        assertGt(dormantSingleRecovered + newSingleRecovered + newLpRecovered, 0);

        assertEq(FluxSwapStakingRewards(pools_.oldSinglePool).owner(), newOwner);
        assertEq(FluxSwapStakingRewards(pools_.oldLpPool).owner(), newOwner);
        assertEq(FluxSwapLPStakingPool(pools_.newLpPool).lpToken(), pools_.pairOne);

        uint256 managerBalance = rewardToken.balanceOf(address(manager));
        uint256 recipientBalance = rewardToken.balanceOf(recipient);

        assertEq(scenario.rewardOne + scenario.rewardTwo, managerBalance + recipientBalance);
        assertGe(managerBalance, manager.totalPendingRewards() + manager.undistributedRewards());
        assertLe(managerBalance - (manager.totalPendingRewards() + manager.undistributedRewards()), 3);
    }

    function _boundScenario(
        uint32 rawOldSingleAlloc,
        uint32 rawOldLpAlloc,
        uint32 rawDormantSingleAlloc,
        uint32 rawSurvivorLpAlloc,
        uint32 rawNewSingleAlloc,
        uint32 rawNewLpAlloc,
        uint96 rawRewardOne,
        uint96 rawRewardTwo
    ) private pure returns (FactoryScenario memory scenario) {
        scenario.oldSingleAlloc = bound(uint256(rawOldSingleAlloc), 1, 1_000_000);
        scenario.oldLpAlloc = bound(uint256(rawOldLpAlloc), 1, 1_000_000);
        scenario.dormantSingleAlloc = bound(uint256(rawDormantSingleAlloc), 1, 1_000_000);
        scenario.survivorLpAlloc = bound(uint256(rawSurvivorLpAlloc), 1, 1_000_000);
        scenario.newSingleAlloc = bound(uint256(rawNewSingleAlloc), 1, 1_000_000);
        scenario.newLpAlloc = bound(uint256(rawNewLpAlloc), 1, 1_000_000);
        scenario.rewardOne = bound(uint256(rawRewardOne), 1, MAX_REWARD);
        scenario.rewardTwo = bound(uint256(rawRewardTwo), 1, MAX_REWARD);
    }

    function _createInitialPools(FactoryScenario memory scenario) private returns (PoolAddresses memory pools_) {
        pools_.pairOne = dexFactory.createPair(address(pairOneTokenA), address(pairOneTokenB));
        pools_.pairTwo = dexFactory.createPair(address(pairTwoTokenA), address(pairTwoTokenB));
        pools_.oldSinglePool =
            poolFactory.createSingleTokenPool(address(singleTokenA), scenario.oldSingleAlloc, true);
        pools_.oldLpPool = poolFactory.createLPPool(pools_.pairOne, scenario.oldLpAlloc, true);
        pools_.dormantSinglePool =
            poolFactory.createSingleTokenPool(address(singleTokenB), scenario.dormantSingleAlloc, false);
        pools_.survivorLpPool = poolFactory.createLPPool(pools_.pairTwo, scenario.survivorLpAlloc, true);
    }

    function _syncAndRecoverManagedPool(address poolAddress) private returns (uint256 recovered) {
        FluxSwapStakingRewards pool = FluxSwapStakingRewards(poolAddress);
        uint256 reserveBefore = pool.rewardReserve();
        pool.syncRewards();

        uint256 claimed = pool.rewardReserve() - reserveBefore;
        if (claimed == 0) {
            return 0;
        }

        recovered = poolFactory.recoverManagedPoolUnallocatedRewards(poolAddress, recipient);
        assertEq(recovered, claimed);
        assertEq(pool.rewardReserve(), reserveBefore);
    }

    function _assertExpectedVsRecovered(uint256 expected, uint256 recovered) private pure {
        assertGe(expected, recovered);
    }

    function _injectAndDistribute(uint256 rewardAmount) private {
        rewardToken.mint(address(treasury), rewardAmount);
        manager.distributeRewards(rewardAmount);
    }
}
