// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";

import "../../contracts/FluxSwapStakingRewards.sol";
import "../../contracts/mocks/MockERC20.sol";

contract FluxSwapStakingRewardsFuzzTest is Test {
    uint256 private constant PRECISION = 1e18;
    uint256 private constant MIN_STAKE = 2;
    uint256 private constant MAX_STAKE = 1e24;
    uint256 private constant MIN_REWARD = 1;
    uint256 private constant MAX_REWARD = 1e24;

    struct RewardState {
        uint256 rewardPerTokenStored;
        uint256 queuedRewards;
    }

    struct UserState {
        uint256 balance;
        uint256 userRewardPerTokenPaid;
        uint256 storedRewards;
    }

    MockERC20 private stakeToken;
    MockERC20 private rewardToken;
    FluxSwapStakingRewards private stakingRewards;

    address private owner;
    address private rewardSource;
    address private notifier;
    address private userA;
    address private userB;

    function setUp() public {
        owner = makeAddr("owner");
        rewardSource = makeAddr("rewardSource");
        notifier = makeAddr("notifier");
        userA = makeAddr("userA");
        userB = makeAddr("userB");

        stakeToken = new MockERC20("Stake Token", "STK", 18);
        rewardToken = new MockERC20("Reward Token", "RWD", 18);

        stakingRewards =
            new FluxSwapStakingRewards(owner, address(stakeToken), address(rewardToken), rewardSource, notifier);
    }

    // 这一组 fuzz 关注奖励会计是否稳定：
    // 1. 单用户多批次发奖后，claim 金额应与模型推导一致。
    // 2. 无人质押时进入队列的奖励，在首个用户入场后应按模型释放。
    // 3. 双用户先后入场时，历史奖励与新增奖励的归属不应串账。
    // 4. 部分 withdraw 之后再次发奖，剩余仓位的奖励累计应保持连续。
    function testFuzz_singleStaker_twoRewardBatches_matchModel(
        uint96 rawStakeAmount,
        uint96 rawRewardOne,
        uint96 rawRewardTwo
    ) public {
        uint256 stakeAmount = bound(uint256(rawStakeAmount), MIN_STAKE, MAX_STAKE);
        uint256 rewardOne = bound(uint256(rawRewardOne), MIN_REWARD, MAX_REWARD);
        uint256 rewardTwo = bound(uint256(rawRewardTwo), MIN_REWARD, MAX_REWARD);

        _mintAndApproveStake(userA, stakeAmount);
        _mintAndApproveRewards(rewardOne + rewardTwo);

        RewardState memory rewardState;
        UserState memory alice;
        uint256 totalStaked;

        (rewardState, alice, totalStaked) = _simulateStake(rewardState, alice, totalStaked, stakeAmount);

        vm.prank(userA);
        stakingRewards.stake(stakeAmount);

        rewardState = _simulateNotify(rewardState, totalStaked, rewardOne);
        _notifyReward(rewardOne);

        rewardState = _simulateNotify(rewardState, totalStaked, rewardTwo);
        _notifyReward(rewardTwo);

        uint256 expectedEarned = _claimableReward(rewardState, alice);
        uint256 expectedReserveAfterClaim = (rewardOne + rewardTwo) - expectedEarned;

        assertEq(stakingRewards.earned(userA), expectedEarned);
        assertEq(stakingRewards.rewardReserve(), rewardOne + rewardTwo);

        vm.prank(userA);
        stakingRewards.getReward();

        assertEq(rewardToken.balanceOf(userA), expectedEarned);
        assertEq(stakingRewards.rewardReserve(), expectedReserveAfterClaim);
        assertEq(rewardToken.balanceOf(address(stakingRewards)), expectedReserveAfterClaim);
        assertLe(stakingRewards.queuedRewards(), expectedReserveAfterClaim);
        assertEq(stakingRewards.pendingUserRewards(), 0);
    }

    function testFuzz_firstStaker_flushesQueuedRewards_fromEmptyPool(
        uint96 rawStakeAmount,
        uint96 rawRewardOne,
        uint96 rawRewardTwo
    ) public {
        uint256 stakeAmount = bound(uint256(rawStakeAmount), MIN_STAKE, MAX_STAKE);
        uint256 rewardOne = bound(uint256(rawRewardOne), MIN_REWARD, MAX_REWARD);
        uint256 rewardTwo = bound(uint256(rawRewardTwo), MIN_REWARD, MAX_REWARD);

        _mintAndApproveStake(userA, stakeAmount);
        _mintAndApproveRewards(rewardOne + rewardTwo);

        RewardState memory rewardState;
        UserState memory alice;
        uint256 totalStaked;

        rewardState = _simulateNotify(rewardState, totalStaked, rewardOne);
        _notifyReward(rewardOne);

        rewardState = _simulateNotify(rewardState, totalStaked, rewardTwo);
        _notifyReward(rewardTwo);

        assertEq(stakingRewards.earned(userA), 0);
        assertEq(stakingRewards.queuedRewards(), rewardOne + rewardTwo);

        (rewardState, alice, totalStaked) = _simulateStake(rewardState, alice, totalStaked, stakeAmount);

        vm.prank(userA);
        stakingRewards.stake(stakeAmount);

        uint256 expectedEarned = _claimableReward(rewardState, alice);
        uint256 expectedReserveAfterClaim = (rewardOne + rewardTwo) - expectedEarned;

        assertEq(stakingRewards.earned(userA), expectedEarned);
        assertEq(stakingRewards.rewardReserve(), rewardOne + rewardTwo);
        assertEq(stakingRewards.queuedRewards(), rewardState.queuedRewards);
        assertEq(stakingRewards.pendingUserRewards(), 0);

        vm.prank(userA);
        stakingRewards.getReward();

        assertEq(rewardToken.balanceOf(userA), expectedEarned);
        assertEq(stakingRewards.rewardReserve(), expectedReserveAfterClaim);
        assertEq(rewardToken.balanceOf(address(stakingRewards)), expectedReserveAfterClaim);
        assertLe(stakingRewards.queuedRewards(), expectedReserveAfterClaim);
        assertEq(stakingRewards.pendingUserRewards(), 0);
    }

    function testFuzz_twoStakers_sequentialEntry_keepsHistoricalRewardsIsolated(
        uint96 rawStakeA,
        uint96 rawStakeB,
        uint96 rawRewardOne,
        uint96 rawRewardTwo
    ) public {
        uint256 stakeAAmount = bound(uint256(rawStakeA), MIN_STAKE, MAX_STAKE);
        uint256 stakeBAmount = bound(uint256(rawStakeB), MIN_STAKE, MAX_STAKE);
        uint256 rewardOne = bound(uint256(rawRewardOne), MIN_REWARD, MAX_REWARD);
        uint256 rewardTwo = bound(uint256(rawRewardTwo), MIN_REWARD, MAX_REWARD);

        _mintAndApproveStake(userA, stakeAAmount);
        _mintAndApproveStake(userB, stakeBAmount);
        _mintAndApproveRewards(rewardOne + rewardTwo);

        RewardState memory rewardState;
        UserState memory alice;
        UserState memory bob;
        uint256 totalStaked;

        (rewardState, alice, totalStaked) = _simulateStake(rewardState, alice, totalStaked, stakeAAmount);

        vm.prank(userA);
        stakingRewards.stake(stakeAAmount);

        rewardState = _simulateNotify(rewardState, totalStaked, rewardOne);
        _notifyReward(rewardOne);

        (rewardState, bob, totalStaked) = _simulateStake(rewardState, bob, totalStaked, stakeBAmount);

        vm.prank(userB);
        stakingRewards.stake(stakeBAmount);

        rewardState = _simulateNotify(rewardState, totalStaked, rewardTwo);
        _notifyReward(rewardTwo);

        uint256 expectedAliceReward = _claimableReward(rewardState, alice);
        uint256 expectedBobReward = _claimableReward(rewardState, bob);

        assertEq(stakingRewards.earned(userA), expectedAliceReward);
        assertEq(stakingRewards.earned(userB), expectedBobReward);

        uint256 expectedReserveAfterClaim = (rewardOne + rewardTwo) - expectedAliceReward - expectedBobReward;

        vm.prank(userA);
        stakingRewards.getReward();
        vm.prank(userB);
        stakingRewards.getReward();

        assertEq(rewardToken.balanceOf(userA), expectedAliceReward);
        assertEq(rewardToken.balanceOf(userB), expectedBobReward);
        assertEq(stakingRewards.rewardReserve(), expectedReserveAfterClaim);
        assertEq(rewardToken.balanceOf(address(stakingRewards)), expectedReserveAfterClaim);
        assertLe(stakingRewards.queuedRewards(), expectedReserveAfterClaim);
        assertEq(stakingRewards.pendingUserRewards(), 0);
    }

    function testFuzz_partialWithdraw_thenNextReward_keepsAccountingContinuous(
        uint96 rawStakeAmount,
        uint96 rawWithdrawAmount,
        uint96 rawRewardOne,
        uint96 rawRewardTwo
    ) public {
        uint256 stakeAmount = bound(uint256(rawStakeAmount), MIN_STAKE, MAX_STAKE);
        uint256 withdrawAmount = bound(uint256(rawWithdrawAmount), 1, stakeAmount - 1);
        uint256 rewardOne = bound(uint256(rawRewardOne), MIN_REWARD, MAX_REWARD);
        uint256 rewardTwo = bound(uint256(rawRewardTwo), MIN_REWARD, MAX_REWARD);

        _mintAndApproveStake(userA, stakeAmount);
        _mintAndApproveRewards(rewardOne + rewardTwo);

        RewardState memory rewardState;
        UserState memory alice;
        uint256 totalStaked;

        (rewardState, alice, totalStaked) = _simulateStake(rewardState, alice, totalStaked, stakeAmount);

        vm.prank(userA);
        stakingRewards.stake(stakeAmount);

        rewardState = _simulateNotify(rewardState, totalStaked, rewardOne);
        _notifyReward(rewardOne);

        (rewardState, alice, totalStaked) = _simulateWithdraw(rewardState, alice, totalStaked, withdrawAmount);

        vm.prank(userA);
        stakingRewards.withdraw(withdrawAmount);

        rewardState = _simulateNotify(rewardState, totalStaked, rewardTwo);
        _notifyReward(rewardTwo);

        uint256 expectedEarned = _claimableReward(rewardState, alice);
        uint256 expectedReserveAfterClaim = (rewardOne + rewardTwo) - expectedEarned;

        assertEq(stakingRewards.earned(userA), expectedEarned);
        assertEq(stakingRewards.balanceOf(userA), stakeAmount - withdrawAmount);

        vm.prank(userA);
        stakingRewards.getReward();

        assertEq(stakeToken.balanceOf(userA), withdrawAmount);
        assertEq(rewardToken.balanceOf(userA), expectedEarned);
        assertEq(stakingRewards.rewardReserve(), expectedReserveAfterClaim);
        assertEq(rewardToken.balanceOf(address(stakingRewards)), expectedReserveAfterClaim);
        assertLe(stakingRewards.queuedRewards(), expectedReserveAfterClaim);
        assertEq(stakingRewards.pendingUserRewards(), 0);
    }

    function _mintAndApproveStake(address user, uint256 amount) private {
        stakeToken.mint(user, amount);
        vm.prank(user);
        stakeToken.approve(address(stakingRewards), type(uint256).max);
    }

    function _mintAndApproveRewards(uint256 amount) private {
        rewardToken.mint(rewardSource, amount);
        vm.prank(rewardSource);
        rewardToken.approve(address(stakingRewards), type(uint256).max);
    }

    function _notifyReward(uint256 reward) private {
        vm.prank(notifier);
        stakingRewards.notifyRewardAmount(reward);
    }

    function _simulateStake(RewardState memory rewardState, UserState memory user, uint256 totalStaked, uint256 amount)
        private
        pure
        returns (RewardState memory nextRewardState, UserState memory nextUser, uint256 nextTotalStaked)
    {
        nextRewardState = rewardState;
        nextUser = user;
        uint256 previousTotalStaked = totalStaked;

        if (nextRewardState.queuedRewards > 0 && totalStaked > 0) {
            nextRewardState = _simulateNotify(nextRewardState, totalStaked, 0);
        }

        nextUser = _updateUser(nextRewardState, nextUser);
        nextTotalStaked = totalStaked + amount;
        nextUser.balance += amount;

        if (previousTotalStaked == 0 && nextRewardState.queuedRewards > 0) {
            nextRewardState = _simulateNotify(nextRewardState, nextTotalStaked, 0);
        }
    }

    function _simulateWithdraw(
        RewardState memory rewardState,
        UserState memory user,
        uint256 totalStaked,
        uint256 amount
    ) private pure returns (RewardState memory nextRewardState, UserState memory nextUser, uint256 nextTotalStaked) {
        nextRewardState = rewardState;
        nextUser = user;

        if (nextRewardState.queuedRewards > 0 && totalStaked > 0) {
            nextRewardState = _simulateNotify(nextRewardState, totalStaked, 0);
        }

        nextUser = _updateUser(nextRewardState, nextUser);
        nextUser.balance -= amount;
        nextTotalStaked = totalStaked - amount;
    }

    function _simulateNotify(RewardState memory rewardState, uint256 totalStaked, uint256 reward)
        private
        pure
        returns (RewardState memory nextRewardState)
    {
        uint256 distributable = reward + rewardState.queuedRewards;
        nextRewardState = rewardState;

        if (distributable == 0 || totalStaked == 0) {
            nextRewardState.queuedRewards = distributable;
            return nextRewardState;
        }

        uint256 increment = (distributable * PRECISION) / totalStaked;
        if (increment == 0) {
            nextRewardState.queuedRewards = distributable;
            return nextRewardState;
        }

        uint256 previousRewardPerTokenStored = nextRewardState.rewardPerTokenStored;
        uint256 updatedRewardPerTokenStored = previousRewardPerTokenStored + increment;
        nextRewardState.rewardPerTokenStored = updatedRewardPerTokenStored;

        uint256 accountedReward =
            ((updatedRewardPerTokenStored * totalStaked) / PRECISION) -
            ((previousRewardPerTokenStored * totalStaked) / PRECISION);

        nextRewardState.queuedRewards = distributable - accountedReward;
    }

    function _updateUser(RewardState memory rewardState, UserState memory user)
        private
        pure
        returns (UserState memory nextUser)
    {
        nextUser = user;
        uint256 accruedReward =
            (nextUser.balance * (rewardState.rewardPerTokenStored - nextUser.userRewardPerTokenPaid)) / PRECISION;
        if (accruedReward > 0) {
            nextUser.storedRewards += accruedReward;
        }
        nextUser.userRewardPerTokenPaid = rewardState.rewardPerTokenStored;
    }

    function _claimableReward(RewardState memory rewardState, UserState memory user) private pure returns (uint256) {
        return
            ((user.balance * (rewardState.rewardPerTokenStored - user.userRewardPerTokenPaid)) / PRECISION) +
            user.storedRewards;
    }
}