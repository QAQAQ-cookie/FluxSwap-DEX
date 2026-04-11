// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "forge-std/StdInvariant.sol";

import "../../contracts/FluxMultiPoolManager.sol";
import "../../contracts/mocks/MockERC20.sol";

contract FluxInvariantTreasuryMock {
    bool public paused;

    function pullApprovedToken(address token, uint256 amount) external {
        MockERC20(token).transfer(msg.sender, amount);
    }

    function setPaused(bool paused_) external {
        paused = paused_;
    }
}

contract FluxInvariantManagedPoolMock {
    FluxMultiPoolManager public immutable manager;
    MockERC20 public immutable rewardToken;

    uint256 public totalClaimed;

    constructor(FluxMultiPoolManager manager_, MockERC20 rewardToken_) {
        manager = manager_;
        rewardToken = rewardToken_;
    }

    function syncFromManager() external returns (uint256 reward) {
        reward = manager.claimPoolRewards(address(this));
        totalClaimed += reward;
    }

    function rewardBalance() external view returns (uint256) {
        return rewardToken.balanceOf(address(this));
    }
}

contract FluxMultiPoolManagerInvariantHandler is Test {
    uint256 private constant MAX_REWARD = 1e24;
    uint256 private constant MAX_ALLOC = 1_000_000;

    FluxMultiPoolManager public immutable manager;
    MockERC20 public immutable rewardToken;
    FluxInvariantTreasuryMock public immutable treasury;

    FluxInvariantManagedPoolMock[] private trackedPools;

    address public immutable owner;
    address public immutable operator;

    uint256 public totalInjectedRewards;

    constructor(
        FluxMultiPoolManager manager_,
        MockERC20 rewardToken_,
        FluxInvariantTreasuryMock treasury_,
        FluxInvariantManagedPoolMock[] memory pools_,
        address owner_,
        address operator_
    ) {
        manager = manager_;
        rewardToken = rewardToken_;
        treasury = treasury_;
        owner = owner_;
        operator = operator_;

        for (uint256 i = 0; i < pools_.length; i++) {
            trackedPools.push(pools_[i]);
        }
    }

    function distributeRewards(uint256 rawAmount) external {
        if (manager.paused() || manager.totalAllocPoint() == 0) {
            return;
        }

        uint256 amount = bound(rawAmount, 1, MAX_REWARD);
        rewardToken.mint(address(treasury), amount);

        vm.prank(operator);
        manager.distributeRewards(amount);
        totalInjectedRewards += amount;
    }

    function claimPoolRewards(uint8 poolSeed) external {
        FluxInvariantManagedPoolMock pool = trackedPools[poolSeed % trackedPools.length];
        pool.syncFromManager();
    }

    function setPool(uint8 pidSeed, uint256 rawAllocPoint, bool active) external {
        uint256 poolLength = manager.poolLength();
        if (poolLength == 0) {
            return;
        }

        uint256 pid = uint256(pidSeed) % poolLength;
        uint256 allocPoint = bound(rawAllocPoint, 0, MAX_ALLOC);

        vm.prank(owner);
        manager.setPool(pid, allocPoint, active);
    }

    function deactivatePool(uint8 poolSeed) external {
        FluxInvariantManagedPoolMock pool = trackedPools[poolSeed % trackedPools.length];
        vm.prank(owner);
        manager.deactivatePool(address(pool));
    }

    function pauseManager() external {
        if (!manager.paused()) {
            vm.prank(owner);
            manager.pause();
        }
    }

    function unpauseManager() external {
        if (manager.paused()) {
            vm.prank(owner);
            manager.unpause();
        }
    }

    function trackedPoolCount() external view returns (uint256) {
        return trackedPools.length;
    }

    function trackedPoolAt(uint256 index) external view returns (FluxInvariantManagedPoolMock) {
        return trackedPools[index];
    }

    function totalClaimedByPools() external view returns (uint256 claimed) {
        for (uint256 i = 0; i < trackedPools.length; i++) {
            claimed += trackedPools[i].totalClaimed();
        }
    }
}

contract FluxMultiPoolManagerInvariantTest is StdInvariant, Test {
    FluxMultiPoolManager private manager;
    MockERC20 private rewardToken;
    FluxInvariantTreasuryMock private treasury;
    FluxInvariantManagedPoolMock[] private pools;
    FluxMultiPoolManagerInvariantHandler private handler;

    address private owner;
    address private operator;

    function setUp() public {
        owner = makeAddr("owner");
        operator = makeAddr("operator");

        rewardToken = new MockERC20("Reward Token", "RWD", 18);
        treasury = new FluxInvariantTreasuryMock();
        manager = new FluxMultiPoolManager(owner, address(treasury), operator, address(rewardToken));

        for (uint256 i = 0; i < 3; i++) {
            FluxInvariantManagedPoolMock pool = new FluxInvariantManagedPoolMock(manager, rewardToken);
            pools.push(pool);

            vm.prank(owner);
            manager.addPool(address(pool), (i + 1) * 100, true);
        }

        handler = new FluxMultiPoolManagerInvariantHandler(
            manager,
            rewardToken,
            treasury,
            pools,
            owner,
            operator
        );

        targetContract(address(handler));
    }

    // 不变量 1：manager 必须至少覆盖“totalPendingRewards + undistributedRewards”。
    // 活跃池的隐式待分配部分由总守恒不变量继续兜底。
    function invariant_managerBalanceCoversStoredPendingAndUndistributed() public view {
        uint256 reservedBalance = manager.undistributedRewards() + manager.totalPendingRewards();

        assertGe(rewardToken.balanceOf(address(manager)), reservedBalance);
    }

    // 不变量 2：totalAllocPoint 必须始终等于全部 active pool 的 allocPoint 之和。
    function invariant_totalAllocPointMatchesActivePools() public view {
        uint256 expectedTotalAllocPoint;
        uint256 poolLength = manager.poolLength();

        for (uint256 i = 0; i < poolLength; i++) {
            (, uint256 allocPoint, bool active,,) = manager.pools(i);
            if (active) {
                expectedTotalAllocPoint += allocPoint;
            }
        }

        assertEq(manager.totalAllocPoint(), expectedTotalAllocPoint);
    }

    // 不变量 3：inactive pool 的 rewardDebt 必须归零，避免停用后继续按 allocPoint 累计。
    function invariant_inactivePoolsDoNotKeepRewardDebt() public view {
        uint256 poolLength = manager.poolLength();

        for (uint256 i = 0; i < poolLength; i++) {
            (, , bool active, uint256 rewardDebt,) = manager.pools(i);
            if (!active) {
                assertEq(rewardDebt, 0);
            }
        }
    }

    // 不变量 4：已注入奖励必须始终由“manager 剩余余额 + 池子已领走奖励”完整解释。
    function invariant_injectedRewardsAreConserved() public view {
        uint256 managerBalance = rewardToken.balanceOf(address(manager));
        uint256 claimedByPools = handler.totalClaimedByPools();

        assertEq(handler.totalInjectedRewards(), managerBalance + claimedByPools);
    }
}
