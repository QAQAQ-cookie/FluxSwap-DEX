// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "forge-std/StdInvariant.sol";

import "../../contracts/FluxSwapStakingRewards.sol";
import "../../contracts/mocks/MockERC20.sol";

contract FluxSwapStakingRewardsInvariantHandler is Test {
    uint256 private constant MAX_STAKE = 1e24;
    uint256 private constant MAX_REWARD = 1e24;

    FluxSwapStakingRewards public immutable stakingRewards;
    MockERC20 public immutable stakeToken;
    MockERC20 public immutable rewardToken;

    address public immutable userA;
    address public immutable userB;
    address public immutable rewardSource;
    address public immutable notifier;

    uint256 public totalInjectedRewards;

    constructor(
        FluxSwapStakingRewards _stakingRewards,
        MockERC20 _stakeToken,
        MockERC20 _rewardToken,
        address _userA,
        address _userB,
        address _rewardSource,
        address _notifier
    ) {
        stakingRewards = _stakingRewards;
        stakeToken = _stakeToken;
        rewardToken = _rewardToken;
        userA = _userA;
        userB = _userB;
        rewardSource = _rewardSource;
        notifier = _notifier;
    }

    function stake(uint8 actorSeed, uint256 rawAmount) external {
        address actor = _actor(actorSeed);
        uint256 amount = bound(rawAmount, 1, MAX_STAKE);

        stakeToken.mint(actor, amount);
        vm.startPrank(actor);
        stakeToken.approve(address(stakingRewards), type(uint256).max);
        stakingRewards.stake(amount);
        vm.stopPrank();
    }

    function withdraw(uint8 actorSeed, uint256 rawAmount) external {
        address actor = _actor(actorSeed);
        uint256 stakedBalance = stakingRewards.balanceOf(actor);
        if (stakedBalance == 0) {
            return;
        }

        uint256 amount = bound(rawAmount, 1, stakedBalance);
        vm.prank(actor);
        stakingRewards.withdraw(amount);
    }

    function getReward(uint8 actorSeed) external {
        vm.prank(_actor(actorSeed));
        stakingRewards.getReward();
    }

    function exit(uint8 actorSeed) external {
        vm.prank(_actor(actorSeed));
        stakingRewards.exit();
    }

    function notifyReward(uint256 rawAmount) external {
        uint256 amount = bound(rawAmount, 1, MAX_REWARD);

        rewardToken.mint(rewardSource, amount);
        vm.prank(rewardSource);
        rewardToken.approve(address(stakingRewards), type(uint256).max);

        vm.prank(notifier);
        stakingRewards.notifyRewardAmount(amount);
        totalInjectedRewards += amount;
    }

    function trackedRewardBalances() external view returns (uint256) {
        return rewardToken.balanceOf(userA) + rewardToken.balanceOf(userB);
    }

    function trackedStakeBalances() external view returns (uint256) {
        return stakingRewards.balanceOf(userA) + stakingRewards.balanceOf(userB);
    }

    function _actor(uint8 actorSeed) private view returns (address) {
        return actorSeed % 2 == 0 ? userA : userB;
    }
}

contract FluxSwapStakingRewardsInvariantTest is StdInvariant, Test {
    FluxSwapStakingRewards private stakingRewards;
    MockERC20 private stakeToken;
    MockERC20 private rewardToken;
    FluxSwapStakingRewardsInvariantHandler private handler;

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

        handler = new FluxSwapStakingRewardsInvariantHandler(
            stakingRewards,
            stakeToken,
            rewardToken,
            userA,
            userB,
            rewardSource,
            notifier
        );

        targetContract(address(handler));
    }

    // 不变量 1：奖励储备必须始终与合约内奖励代币余额一致。
    function invariant_rewardReserveMatchesRewardTokenBalance() public view {
        assertEq(stakingRewards.rewardReserve(), rewardToken.balanceOf(address(stakingRewards)));
    }

    // 不变量 2：未支付奖励与未分配奖励都不能超过总储备。
    function invariant_pendingAndQueuedRewardsRemainBounded() public view {
        uint256 rewardReserve = stakingRewards.rewardReserve();
        uint256 pendingUserRewards = stakingRewards.pendingUserRewards();
        uint256 queuedRewards = stakingRewards.queuedRewards();

        assertLe(pendingUserRewards, rewardReserve);
        assertLe(queuedRewards, rewardReserve - pendingUserRewards);
    }

    // 不变量 3：池内质押代币余额必须等于 totalStaked，且与已跟踪用户份额相符。
    function invariant_totalStakedMatchesTrackedBalances() public view {
        uint256 totalStaked = stakingRewards.totalStaked();
        assertEq(stakeToken.balanceOf(address(stakingRewards)), totalStaked);
        assertEq(handler.trackedStakeBalances(), totalStaked);
    }

    // 不变量 4：已注入的奖励总量必须由“池内剩余奖励 + 已支付给用户的奖励”完整解释。
    function invariant_injectedRewardsAreConserved() public view {
        uint256 paidToTrackedUsers = handler.trackedRewardBalances();
        uint256 reserve = stakingRewards.rewardReserve();

        assertEq(handler.totalInjectedRewards(), paidToTrackedUsers + reserve);
    }
}
