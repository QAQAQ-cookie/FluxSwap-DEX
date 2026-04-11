// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";

import {FluxMultiPoolManager} from "../../contracts/FluxMultiPoolManager.sol";
import {FluxPoolFactory} from "../../contracts/FluxPoolFactory.sol";
import {FluxSwapFactory} from "../../contracts/FluxSwapFactory.sol";
import {FluxSwapLPStakingPool} from "../../contracts/FluxSwapLPStakingPool.sol";
import {FluxSwapStakingRewards} from "../../contracts/FluxSwapStakingRewards.sol";
import {MockERC20} from "../../contracts/mocks/MockERC20.sol";

contract FluxManagedPoolTreasuryMock {
    bool public paused;

    function setPaused(bool paused_) external {
        paused = paused_;
    }

    function pullApprovedToken(address token, uint256 amount) external {
        MockERC20(token).transfer(msg.sender, amount);
    }

    function burnApprovedToken(address, uint256) external pure {}

    function isFluxSwapTreasury() external pure returns (bool) {
        return true;
    }
}

contract FluxManagedPoolLifecycleStatefulFuzzTest is Test {
    uint256 private constant MAX_REWARD = 1e24;

    MockERC20 private rewardToken;
    MockERC20 private stakingToken;
    MockERC20 private tokenA;
    MockERC20 private tokenB;

    FluxManagedPoolTreasuryMock private treasury;
    FluxMultiPoolManager private manager;
    FluxSwapFactory private dexFactory;
    FluxPoolFactory private poolFactory;

    address private recipient;
    address private newPoolOwner;
    address private altRewardSource;
    address private altRewardNotifier;

    function setUp() public {
        rewardToken = new MockERC20("Reward Token", "RWD", 18);
        stakingToken = new MockERC20("Stake Token", "STK", 18);
        tokenA = new MockERC20("Token A", "TKNA", 18);
        tokenB = new MockERC20("Token B", "TKNB", 18);

        treasury = new FluxManagedPoolTreasuryMock();
        manager = new FluxMultiPoolManager(address(this), address(treasury), address(this), address(rewardToken));
        dexFactory = new FluxSwapFactory(address(this));
        poolFactory = new FluxPoolFactory(address(this), address(manager), address(dexFactory), address(rewardToken));

        recipient = makeAddr("recipient");
        newPoolOwner = makeAddr("newPoolOwner");
        altRewardSource = makeAddr("altRewardSource");
        altRewardNotifier = makeAddr("altRewardNotifier");

        manager.setPoolFactory(address(poolFactory));
    }

    // 这一组 fuzz 把 managed pool 的真实生命周期串成一条状态机：
    // 1. create single / LP pool 后发奖并 sync，rewardReserve 与回收金额必须和 manager 分账结果一致。
    // 2. 改 reward configuration、移交 ownership 后，工厂映射必须清空，后续新奖励也不能再流入已移交池。
    // 3. recoverManagedPoolUnallocatedRewards 只能对仍受工厂管理的池生效，移交后必须拒绝。
    function testFuzz_managedPoolLifecycle_keepsMappingsAndRewardRecoveryConsistent(
        uint32 rawSingleAlloc,
        uint32 rawLpAlloc,
        uint96 rawRewardOne,
        uint96 rawRewardTwo
    ) public {
        uint256 singleAlloc = bound(uint256(rawSingleAlloc), 1, 1_000_000);
        uint256 lpAlloc = bound(uint256(rawLpAlloc), 1, 1_000_000);
        uint256 rewardOne = bound(uint256(rawRewardOne), 1, MAX_REWARD);
        uint256 rewardTwo = bound(uint256(rawRewardTwo), 1, MAX_REWARD);

        address singlePoolAddress = poolFactory.createSingleTokenPool(address(stakingToken), singleAlloc, true);
        address lpPoolAddress = poolFactory.createLPPool(_createPair(), lpAlloc, true);

        FluxSwapStakingRewards singlePool = FluxSwapStakingRewards(singlePoolAddress);
        FluxSwapLPStakingPool lpPool = FluxSwapLPStakingPool(lpPoolAddress);

        _injectAndDistribute(rewardOne);

        uint256 expectedSingleRoundOne = manager.pendingPoolRewards(singlePoolAddress);
        uint256 expectedLpRoundOne = manager.pendingPoolRewards(lpPoolAddress);

        singlePool.syncRewards();
        lpPool.syncRewards();

        uint256 managerDustAfterRoundOne = rewardToken.balanceOf(address(manager));

        assertEq(singlePool.rewardReserve(), expectedSingleRoundOne);
        assertEq(lpPool.rewardReserve(), expectedLpRoundOne);
        assertEq(rewardOne, expectedSingleRoundOne + expectedLpRoundOne + managerDustAfterRoundOne);

        uint256 recoveredSingleRoundOne;
        if (expectedSingleRoundOne == 0) {
            vm.expectRevert(bytes("FluxSwapStakingRewards: NO_UNALLOCATED_REWARDS"));
            poolFactory.recoverManagedPoolUnallocatedRewards(singlePoolAddress, recipient);
        } else {
            recoveredSingleRoundOne = poolFactory.recoverManagedPoolUnallocatedRewards(singlePoolAddress, recipient);
            assertEq(recoveredSingleRoundOne, expectedSingleRoundOne);
            assertEq(rewardToken.balanceOf(recipient), recoveredSingleRoundOne);
        }

        poolFactory.setManagedPoolRewardConfiguration(lpPoolAddress, altRewardSource, altRewardNotifier);
        assertEq(lpPool.rewardSource(), altRewardSource);
        assertEq(lpPool.rewardNotifier(), altRewardNotifier);

        poolFactory.transferManagedPoolOwnership(lpPoolAddress, newPoolOwner);

        assertEq(lpPool.owner(), newPoolOwner);
        assertFalse(poolFactory.managedPools(lpPoolAddress));
        assertEq(poolFactory.lpTokenPools(lpPool.lpToken()), address(0));
        assertEq(poolFactory.managedPoolStakingAsset(lpPoolAddress), address(0));
        assertFalse(poolFactory.managedPoolIsLP(lpPoolAddress));
        assertEq(manager.totalAllocPoint(), singleAlloc);

        vm.expectRevert(bytes("FluxPoolFactory: POOL_NOT_MANAGED"));
        poolFactory.setManagedPoolRewardSource(lpPoolAddress, altRewardSource);

        vm.expectRevert(bytes("FluxPoolFactory: POOL_NOT_MANAGED"));
        poolFactory.recoverManagedPoolUnallocatedRewards(lpPoolAddress, recipient);

        uint256 transferredPoolPendingBeforeRoundTwo = manager.pendingPoolRewards(lpPoolAddress);

        _injectAndDistribute(rewardTwo);

        assertEq(manager.pendingPoolRewards(lpPoolAddress), transferredPoolPendingBeforeRoundTwo);

        uint256 expectedSingleRoundTwo = manager.pendingPoolRewards(singlePoolAddress);
        singlePool.syncRewards();

        uint256 actualSingleRoundTwo = singlePool.rewardReserve();

        // manager 的 view 口径不会按当前余额再做一次 clamp，
        // 所以这里允许视图值比真实可领取值最多高出 1 wei。
        assertLe(actualSingleRoundTwo, expectedSingleRoundTwo);
        assertLe(expectedSingleRoundTwo - actualSingleRoundTwo, 1);

        uint256 recoveredSingleRoundTwo;
        if (actualSingleRoundTwo == 0) {
            vm.expectRevert(bytes("FluxSwapStakingRewards: NO_UNALLOCATED_REWARDS"));
            poolFactory.recoverManagedPoolUnallocatedRewards(singlePoolAddress, recipient);
        } else {
            recoveredSingleRoundTwo = poolFactory.recoverManagedPoolUnallocatedRewards(singlePoolAddress, recipient);
            assertEq(recoveredSingleRoundTwo, actualSingleRoundTwo);
        }
        uint256 managerDustAfterRoundTwo = rewardToken.balanceOf(address(manager));

        assertEq(rewardToken.balanceOf(recipient), recoveredSingleRoundOne + recoveredSingleRoundTwo);
        assertEq(
            managerDustAfterRoundOne + rewardTwo,
            recoveredSingleRoundTwo + managerDustAfterRoundTwo
        );
    }

    // 这一组 fuzz 验证 managed pool 场景下 treasury pause 的传播：
    // 1. treasury paused 时，manager.distributeRewards 必须整体拒绝，不能留下半状态。
    // 2. unpause 之后恢复分发，single / LP pool 仍要能正常 sync 并对齐总账。
    function testFuzz_treasuryPauseThenResume_preservesManagedPoolAccounting(
        uint32 rawSingleAlloc,
        uint32 rawLpAlloc,
        uint96 rawRewardAmount
    ) public {
        uint256 singleAlloc = bound(uint256(rawSingleAlloc), 1, 1_000_000);
        uint256 lpAlloc = bound(uint256(rawLpAlloc), 1, 1_000_000);
        uint256 rewardAmount = bound(uint256(rawRewardAmount), 1, MAX_REWARD);

        address singlePoolAddress = poolFactory.createSingleTokenPool(address(stakingToken), singleAlloc, true);
        address lpPoolAddress = poolFactory.createLPPool(_createPair(), lpAlloc, true);

        FluxSwapStakingRewards singlePool = FluxSwapStakingRewards(singlePoolAddress);
        FluxSwapLPStakingPool lpPool = FluxSwapLPStakingPool(lpPoolAddress);

        rewardToken.mint(address(treasury), rewardAmount);
        treasury.setPaused(true);

        vm.expectRevert(bytes("FluxMultiPoolManager: TREASURY_PAUSED"));
        manager.distributeRewards(rewardAmount);

        assertEq(rewardToken.balanceOf(address(manager)), 0);
        assertEq(manager.totalPendingRewards(), 0);
        assertEq(manager.undistributedRewards(), 0);

        treasury.setPaused(false);
        manager.distributeRewards(rewardAmount);

        uint256 expectedSingle = manager.pendingPoolRewards(singlePoolAddress);
        uint256 expectedLp = manager.pendingPoolRewards(lpPoolAddress);

        singlePool.syncRewards();
        lpPool.syncRewards();

        uint256 managerDust = rewardToken.balanceOf(address(manager));

        assertEq(singlePool.rewardReserve(), expectedSingle);
        assertEq(lpPool.rewardReserve(), expectedLp);
        assertEq(rewardAmount, expectedSingle + expectedLp + managerDust);
    }

    function _createPair() private returns (address pairAddress) {
        pairAddress = dexFactory.createPair(address(tokenA), address(tokenB));
    }

    function _injectAndDistribute(uint256 rewardAmount) private {
        rewardToken.mint(address(treasury), rewardAmount);
        manager.distributeRewards(rewardAmount);
    }
}
