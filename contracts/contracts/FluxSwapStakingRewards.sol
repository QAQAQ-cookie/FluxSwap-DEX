// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/IERC20.sol";
import "../interfaces/IFluxMultiPoolManager.sol";
import "../libraries/TransferHelper.sol";

contract FluxSwapStakingRewards {
    uint256 private constant PRECISION = 1e18;

    address public owner;
    address public rewardSource;
    address public rewardNotifier;
    address public immutable stakingToken;
    address public immutable rewardsToken;

    uint256 public rewardsDuration;
    uint256 public periodFinish;
    uint256 public rewardRate;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;
    uint256 public totalStaked;
    uint256 public rewardReserve;
    uint256 public queuedRewards;
    uint256 public pendingUserRewards;

    uint256 private unlocked = 1;

    mapping(address => uint256) public balanceOf;
    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event RewardSourceUpdated(address indexed previousRewardSource, address indexed newRewardSource);
    event RewardNotifierUpdated(address indexed previousRewardNotifier, address indexed newRewardNotifier);
    event RewardConfigurationUpdated(
        address indexed previousRewardSource,
        address indexed newRewardSource,
        address indexed newRewardNotifier
    );
    event RewardsDurationUpdated(uint256 previousDuration, uint256 newDuration);
    event RewardAdded(uint256 reward, uint256 rewardRate, uint256 periodFinish);
    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 reward);
    event UnallocatedRewardsRecovered(address indexed to, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "FluxSwapStakingRewards: FORBIDDEN");
        _;
    }

    modifier onlyRewardNotifier() {
        require(msg.sender == rewardNotifier, "FluxSwapStakingRewards: FORBIDDEN");
        _;
    }

    modifier lock() {
        require(unlocked == 1, "FluxSwapStakingRewards: LOCKED");
        unlocked = 0;
        _;
        unlocked = 1;
    }

    modifier updateReward(address account) {
        _updateReward(account);
        _;
    }

    constructor(
        address _owner,
        address _stakingToken,
        address _rewardsToken,
        address _rewardSource,
        address _rewardNotifier,
        uint256 _rewardsDuration
    ) {
        require(_owner != address(0), "FluxSwapStakingRewards: ZERO_ADDRESS");
        require(_stakingToken != address(0), "FluxSwapStakingRewards: ZERO_ADDRESS");
        require(_rewardsToken != address(0), "FluxSwapStakingRewards: ZERO_ADDRESS");
        require(_rewardSource != address(0), "FluxSwapStakingRewards: ZERO_ADDRESS");
        require(_rewardNotifier != address(0), "FluxSwapStakingRewards: ZERO_ADDRESS");
        require(_rewardsDuration > 0, "FluxSwapStakingRewards: INVALID_DURATION");

        owner = _owner;
        stakingToken = _stakingToken;
        rewardsToken = _rewardsToken;
        rewardSource = _rewardSource;
        rewardNotifier = _rewardNotifier;
        rewardsDuration = _rewardsDuration;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "FluxSwapStakingRewards: ZERO_ADDRESS");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setRewardSource(address newRewardSource) external onlyOwner {
        require(newRewardSource != address(0), "FluxSwapStakingRewards: ZERO_ADDRESS");
        require(rewardNotifier != address(this), "FluxSwapStakingRewards: USE_REWARD_CONFIGURATION");
        emit RewardSourceUpdated(rewardSource, newRewardSource);
        rewardSource = newRewardSource;
    }

    function setRewardNotifier(address newRewardNotifier) external onlyOwner {
        require(newRewardNotifier != address(0), "FluxSwapStakingRewards: ZERO_ADDRESS");
        require(rewardNotifier != address(this), "FluxSwapStakingRewards: USE_REWARD_CONFIGURATION");
        require(newRewardNotifier != address(this), "FluxSwapStakingRewards: USE_REWARD_CONFIGURATION");
        emit RewardNotifierUpdated(rewardNotifier, newRewardNotifier);
        rewardNotifier = newRewardNotifier;
    }

    function setRewardConfiguration(address newRewardSource, address newRewardNotifier) external onlyOwner {
        require(newRewardSource != address(0), "FluxSwapStakingRewards: ZERO_ADDRESS");
        require(newRewardNotifier != address(0), "FluxSwapStakingRewards: ZERO_ADDRESS");

        address previousRewardSource = rewardSource;
        address previousRewardNotifier = rewardNotifier;

        rewardSource = newRewardSource;
        rewardNotifier = newRewardNotifier;

        emit RewardSourceUpdated(previousRewardSource, newRewardSource);
        emit RewardNotifierUpdated(previousRewardNotifier, newRewardNotifier);
        emit RewardConfigurationUpdated(previousRewardSource, newRewardSource, newRewardNotifier);
    }

    function setRewardsDuration(uint256 newRewardsDuration) external onlyOwner {
        require(newRewardsDuration > 0, "FluxSwapStakingRewards: INVALID_DURATION");
        require(block.timestamp > periodFinish, "FluxSwapStakingRewards: ACTIVE_PERIOD");
        emit RewardsDurationUpdated(rewardsDuration, newRewardsDuration);
        rewardsDuration = newRewardsDuration;
    }

    function lastTimeRewardApplicable() public view returns (uint256) {
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
    }

    function rewardPerToken() public view returns (uint256) {
        if (totalStaked == 0) {
            return rewardPerTokenStored;
        }

        return rewardPerTokenStored + (((lastTimeRewardApplicable() - lastUpdateTime) * rewardRate * PRECISION) / totalStaked);
    }

    function earned(address account) public view returns (uint256) {
        return ((balanceOf[account] * (rewardPerToken() - userRewardPerTokenPaid[account])) / PRECISION) + rewards[account];
    }

    function stake(uint256 amount) external lock {
        _syncRewards();
        _updateReward(msg.sender);
        require(amount > 0, "FluxSwapStakingRewards: ZERO_AMOUNT");
        totalStaked += amount;
        balanceOf[msg.sender] += amount;
        TransferHelper.safeTransferFrom(stakingToken, msg.sender, address(this), amount);
        emit Staked(msg.sender, amount);
    }

    function withdraw(uint256 amount) external lock {
        _syncRewards();
        _updateReward(msg.sender);
        require(amount > 0, "FluxSwapStakingRewards: ZERO_AMOUNT");
        require(balanceOf[msg.sender] >= amount, "FluxSwapStakingRewards: INSUFFICIENT_BALANCE");
        totalStaked -= amount;
        balanceOf[msg.sender] -= amount;
        TransferHelper.safeTransfer(stakingToken, msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function getReward() external lock {
        _syncRewards();
        _updateReward(msg.sender);
        _payReward(msg.sender);
    }

    function exit() external lock {
        _syncRewards();
        _updateReward(msg.sender);
        uint256 stakeAmount = balanceOf[msg.sender];
        if (stakeAmount > 0) {
            totalStaked -= stakeAmount;
            balanceOf[msg.sender] = 0;
            TransferHelper.safeTransfer(stakingToken, msg.sender, stakeAmount);
            emit Withdrawn(msg.sender, stakeAmount);
        }

        _payReward(msg.sender);
    }

    function notifyRewardAmount(uint256 reward) external lock onlyRewardNotifier {
        require(reward > 0, "FluxSwapStakingRewards: ZERO_AMOUNT");

        _requireSourceNotPaused(rewardSource, "FluxSwapStakingRewards: REWARD_SOURCE_PAUSED");
        _updateReward(address(0));
        TransferHelper.safeTransferFrom(rewardsToken, rewardSource, address(this), reward);
        rewardReserve += reward;

        _applyRewardAmount(reward);
        emit RewardAdded(reward, rewardRate, periodFinish);
    }

    function syncRewards() external lock returns (uint256 reward) {
        reward = _syncRewards();
    }

    function recoverUnallocatedRewards(address to) external lock onlyOwner returns (uint256 amount) {
        require(to != address(0), "FluxSwapStakingRewards: ZERO_ADDRESS");
        _syncRewards();
        _updateReward(address(0));
        require(totalStaked == 0, "FluxSwapStakingRewards: ACTIVE_STAKERS");

        amount = rewardReserve - pendingUserRewards;
        require(amount > 0, "FluxSwapStakingRewards: NO_UNALLOCATED_REWARDS");

        rewardRate = 0;
        periodFinish = block.timestamp;
        lastUpdateTime = block.timestamp;
        queuedRewards = 0;
        rewardReserve -= amount;

        TransferHelper.safeTransfer(rewardsToken, to, amount);
        emit UnallocatedRewardsRecovered(to, amount);
    }

    function _payReward(address account) private {
        uint256 reward = rewards[account];
        if (reward > 0) {
            rewards[account] = 0;
            rewardReserve -= reward;
            pendingUserRewards -= reward;
            TransferHelper.safeTransfer(rewardsToken, account, reward);
            emit RewardPaid(account, reward);
        }
    }

    function _syncRewards() private returns (uint256 reward) {
        if (rewardNotifier != address(this)) {
            return 0;
        }

        reward = IFluxMultiPoolManager(rewardSource).claimPoolRewards(address(this));

        if (reward == 0) {
            return 0;
        }

        _updateReward(address(0));
        rewardReserve += reward;
        _applyRewardAmount(reward);

        emit RewardAdded(reward, rewardRate, periodFinish);
    }

    function _applyRewardAmount(uint256 reward) private {
        uint256 distributable = reward + queuedRewards;

        if (block.timestamp >= periodFinish) {
            rewardRate = distributable / rewardsDuration;
        } else {
            uint256 remaining = periodFinish - block.timestamp;
            uint256 leftover = remaining * rewardRate;
            distributable += leftover;
            rewardRate = distributable / rewardsDuration;
        }

        lastUpdateTime = block.timestamp;
        queuedRewards = distributable % rewardsDuration;

        if (rewardRate == 0) {
            queuedRewards = distributable;
            periodFinish = block.timestamp;
        } else {
            periodFinish = block.timestamp + rewardsDuration;
        }
    }

    function _updateReward(address account) private {
        uint256 applicableTime = lastTimeRewardApplicable();
        if (applicableTime > lastUpdateTime) {
            uint256 releasedReward = (applicableTime - lastUpdateTime) * rewardRate;
            if (releasedReward > 0) {
                if (totalStaked == 0) {
                    queuedRewards += releasedReward;
                } else {
                    rewardPerTokenStored += (releasedReward * PRECISION) / totalStaked;
                }
            }
            lastUpdateTime = applicableTime;
        }

        if (account != address(0)) {
            uint256 accruedReward =
                (balanceOf[account] * (rewardPerTokenStored - userRewardPerTokenPaid[account])) /
                PRECISION;
            if (accruedReward > 0) {
                rewards[account] += accruedReward;
                pendingUserRewards += accruedReward;
            }
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
    }

    function _requireSourceNotPaused(address source, string memory errorMessage) private view {
        (bool success, bytes memory data) = source.staticcall(abi.encodeWithSignature("paused()"));
        if (success && data.length >= 32) {
            require(!abi.decode(data, (bool)), errorMessage);
        }
    }
}
