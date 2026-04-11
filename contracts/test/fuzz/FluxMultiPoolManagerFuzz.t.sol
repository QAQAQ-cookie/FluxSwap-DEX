// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";

import "../../contracts/FluxMultiPoolManager.sol";
import "../../contracts/mocks/MockERC20.sol";

contract FluxFuzzTreasuryMock {
    function pullApprovedToken(address token, uint256 amount) external {
        MockERC20(token).transfer(msg.sender, amount);
    }
}

contract FluxFuzzManagedPoolMock {
    FluxMultiPoolManager public immutable manager;

    uint256 public totalClaimed;

    constructor(FluxMultiPoolManager manager_) {
        manager = manager_;
    }

    function syncFromManager() external returns (uint256 reward) {
        reward = manager.claimPoolRewards(address(this));
        totalClaimed += reward;
    }
}

contract FluxMultiPoolManagerFuzzTest is Test {
    uint256 private constant MAX_ALLOC = 1_000_000;
    uint256 private constant MAX_REWARD = 1e24;

    MockERC20 private rewardToken;
    FluxFuzzTreasuryMock private treasury;
    FluxMultiPoolManager private manager;
    FluxFuzzManagedPoolMock[] private pools;

    address private owner;
    address private operator;

    function setUp() public {
        owner = makeAddr("owner");
        operator = makeAddr("operator");

        rewardToken = new MockERC20("Reward Token", "RWD", 18);
        treasury = new FluxFuzzTreasuryMock();
        manager = new FluxMultiPoolManager(owner, address(treasury), operator, address(rewardToken));

        for (uint256 i = 0; i < 3; i++) {
            FluxFuzzManagedPoolMock pool = new FluxFuzzManagedPoolMock(manager);
            pools.push(pool);

            vm.prank(owner);
            manager.addPool(address(pool), (i + 1) * 100, true);
        }
    }

    // 这一组 fuzz 重点锁 MultiPoolManager 最容易出错的奖励会计边界：
    // 1. setPool 重配 allocPoint 后，多轮 distribute + claim 不得挪用 undistributedRewards。
    // 2. 池子停用后，后续新增奖励不得继续流入已停用池。
    // 3. 小额奖励反复进入时，carry-forward dust 必须始终处于可解释、可守恒状态。
    function testFuzz_reconfiguringPoolsAndClaiming_keepsReservedBalanceCovered(
        uint32 rawUpdatedAlloc,
        uint96 rawRewardOne,
        uint96 rawRewardTwo,
        uint8 firstClaimSeed,
        uint8 secondClaimSeed
    ) public {
        uint256 updatedAlloc = bound(uint256(rawUpdatedAlloc), 1, MAX_ALLOC);
        uint256 rewardOne = bound(uint256(rawRewardOne), 1, MAX_REWARD);
        uint256 rewardTwo = bound(uint256(rawRewardTwo), 1, MAX_REWARD);

        _setPool(2, updatedAlloc, true);

        _distribute(rewardOne);
        _assertReservedCoverage();

        _distribute(rewardTwo);
        _assertReservedCoverage();

        _syncPool(firstClaimSeed % uint8(pools.length));
        _assertReservedCoverage();

        _syncPool(secondClaimSeed % uint8(pools.length));
        _assertReservedCoverage();

        _syncAllPools();
        _assertPostSyncAccounting(rewardOne + rewardTwo);
    }

    function testFuzz_deactivatedPoolStopsAccruingNewRewards(
        uint32 rawAllocA,
        uint32 rawAllocB,
        uint96 rawRewardOne,
        uint96 rawRewardTwo
    ) public {
        uint256 allocA = bound(uint256(rawAllocA), 1, MAX_ALLOC);
        uint256 allocB = bound(uint256(rawAllocB), 1, MAX_ALLOC);
        uint256 rewardOne = bound(uint256(rawRewardOne), 1, MAX_REWARD);
        uint256 rewardTwo = bound(uint256(rawRewardTwo), 1, MAX_REWARD);

        _setPool(0, allocA, true);
        _setPool(1, allocB, true);
        _setPool(2, 0, false);

        _distribute(rewardOne);
        uint256 pendingBeforeDeactivation = manager.pendingPoolRewards(address(pools[0]));

        vm.prank(owner);
        manager.deactivatePool(address(pools[0]));

        uint256 pendingAfterDeactivation = manager.pendingPoolRewards(address(pools[0]));
        assertEq(pendingAfterDeactivation, pendingBeforeDeactivation);

        _distribute(rewardTwo);
        _assertReservedCoverage();

        assertEq(manager.pendingPoolRewards(address(pools[0])), pendingAfterDeactivation);

        _syncAllPools();
        _assertPostSyncAccounting(rewardOne + rewardTwo);
    }

    function testFuzz_tinyRewardBatchesKeepCarryForwardReserved(
        uint32 rawLargeAlloc,
        uint8 rawRewardOne,
        uint8 rawRewardTwo,
        uint8 rawRewardThree,
        uint8 rawRewardFour
    ) public {
        uint256 largeAlloc = bound(uint256(rawLargeAlloc), 2, MAX_ALLOC);
        uint256 rewardOne = bound(uint256(rawRewardOne), 1, 5);
        uint256 rewardTwo = bound(uint256(rawRewardTwo), 1, 5);
        uint256 rewardThree = bound(uint256(rawRewardThree), 1, 5);
        uint256 rewardFour = bound(uint256(rawRewardFour), 1, 5);

        _setPool(0, 1, true);
        _setPool(1, largeAlloc, true);
        _setPool(2, 0, false);

        _distribute(rewardOne);
        _assertReservedCoverage();

        _distribute(rewardTwo);
        _assertReservedCoverage();

        _distribute(rewardThree);
        _assertReservedCoverage();

        _distribute(rewardFour);
        _assertReservedCoverage();

        _syncAllPools();
        _assertPostSyncAccounting(rewardOne + rewardTwo + rewardThree + rewardFour);
    }

    function _setPool(uint256 pid, uint256 allocPoint, bool active) private {
        vm.prank(owner);
        manager.setPool(pid, allocPoint, active);
    }

    function _distribute(uint256 reward) private {
        rewardToken.mint(address(treasury), reward);

        vm.prank(operator);
        manager.distributeRewards(reward);
    }

    function _syncPool(uint256 pid) private {
        pools[pid].syncFromManager();
    }

    function _syncAllPools() private {
        for (uint256 i = 0; i < pools.length; i++) {
            pools[i].syncFromManager();
        }
    }

    function _assertReservedCoverage() private view {
        uint256 reservedBalance = manager.totalPendingRewards() + manager.undistributedRewards();
        assertGe(rewardToken.balanceOf(address(manager)), reservedBalance);
    }

    function _assertPostSyncAccounting(uint256 totalInjectedRewards) private view {
        uint256 managerBalance = rewardToken.balanceOf(address(manager));
        uint256 totalClaimed;

        for (uint256 i = 0; i < pools.length; i++) {
            totalClaimed += pools[i].totalClaimed();
        }

        assertEq(totalInjectedRewards, managerBalance + totalClaimed);
        assertEq(manager.totalPendingRewards(), 0);
        assertGe(managerBalance, manager.undistributedRewards());
        assertLt(managerBalance - manager.undistributedRewards(), pools.length);
    }
}
