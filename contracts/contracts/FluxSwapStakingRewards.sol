// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/IFluxMultiPoolManager.sol";
import "../interfaces/IFluxSwapTreasury.sol";
import "../libraries/TransferHelper.sol";

/**
 * @title Flux 通用质押奖励池
 * @notice 支持任意质押资产的单池奖励分发、领取和退出流程。
 * @dev 奖励既可以由外部直接注入，也可以通过多池管理器按需同步拉取。
 */
contract FluxSwapStakingRewards {
    // 奖励累计使用的放大精度。
    uint256 private constant PRECISION = 1e18;

    // 质押资产地址。
    address public immutable stakingToken;
    // 奖励资产地址。
    address public immutable rewardsToken;
    // 当前池所有者地址。
    address public owner;
    // 奖励来源地址。
    address public rewardSource;
    // 奖励通知者地址。
    address public rewardNotifier;

    // 全局累计的每份质押奖励值。
    uint256 public rewardPerTokenStored;
    // 当前总质押量。
    uint256 public totalStaked;
    // 奖励池当前持有且预留用于用户奖励的总额。
    uint256 public rewardReserve;
    // 因无人质押或精度截断暂未并入的奖励。
    uint256 public queuedRewards;
    // 已经记到用户名下、但尚未支付的奖励总额。
    uint256 public pendingUserRewards;

    // 重入锁标记，`1` 表示未锁定。
    uint256 private unlocked = 1;

    // 各用户当前质押余额。
    mapping(address => uint256) public balanceOf;
    // 各用户上次结算时看到的 `rewardPerTokenStored`。
    mapping(address => uint256) public userRewardPerTokenPaid;
    // 各用户当前已累计、未领取的奖励。
    mapping(address => uint256) public rewards;

    // 所有权转移时触发。
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    // 奖励来源变更时触发。
    event RewardSourceUpdated(address indexed previousRewardSource, address indexed newRewardSource);
    // 奖励通知者变更时触发。
    event RewardNotifierUpdated(address indexed previousRewardNotifier, address indexed newRewardNotifier);
    // 奖励来源与通知者同时更新时触发。
    event RewardConfigurationUpdated(
        address indexed previousRewardSource,
        address indexed newRewardSource,
        address indexed newRewardNotifier
    );
    // 新奖励入账或同步后触发。
    event RewardAdded(uint256 reward, uint256 accountedReward, uint256 queuedRewards);
    // 用户完成质押时触发。
    event Staked(address indexed user, uint256 amount);
    // 用户完成提取时触发。
    event Withdrawn(address indexed user, uint256 amount);
    // 用户领取奖励时触发。
    event RewardPaid(address indexed user, uint256 reward);
    // 回收未分配奖励时触发。
    event UnallocatedRewardsRecovered(address indexed to, uint256 amount);

    // 限制仅池所有者可调用。
    modifier onlyOwner() {
        require(msg.sender == owner, "FluxSwapStakingRewards: FORBIDDEN");
        _;
    }

    // 限制仅奖励通知者可调用。
    modifier onlyRewardNotifier() {
        require(msg.sender == rewardNotifier, "FluxSwapStakingRewards: FORBIDDEN");
        _;
    }

    // 简单的重入保护修饰器。
    modifier lock() {
        require(unlocked == 1, "FluxSwapStakingRewards: LOCKED");
        unlocked = 0;
        _;
        unlocked = 1;
    }

    /**
     * @notice 部署质押奖励池并初始化奖励来源配置。
     * @param _owner 初始所有者地址。
     * @param _stakingToken 质押资产地址。
     * @param _rewardsToken 奖励资产地址。
     * @param _rewardSource 奖励来源地址。
     * @param _rewardNotifier 奖励通知者地址。
     */
    constructor(
        address _owner,
        address _stakingToken,
        address _rewardsToken,
        address _rewardSource,
        address _rewardNotifier
    ) {
        require(_owner != address(0), "FluxSwapStakingRewards: ZERO_ADDRESS");
        require(_stakingToken != address(0), "FluxSwapStakingRewards: ZERO_ADDRESS");
        require(_rewardsToken != address(0), "FluxSwapStakingRewards: ZERO_ADDRESS");
        require(_rewardSource != address(0), "FluxSwapStakingRewards: ZERO_ADDRESS");
        require(_rewardNotifier != address(0), "FluxSwapStakingRewards: ZERO_ADDRESS");

        owner = _owner;
        stakingToken = _stakingToken;
        rewardsToken = _rewardsToken;
        rewardSource = _rewardSource;
        rewardNotifier = _rewardNotifier;
    }

    /**
     * @notice 转移池所有权。
     * @param newOwner 新的所有者地址。
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "FluxSwapStakingRewards: ZERO_ADDRESS");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /**
     * @notice 更新奖励来源地址。
     * @dev 当奖励通知者已绑定为当前合约时，必须使用 `setRewardConfiguration` 一次性更新。
     * @param newRewardSource 新的奖励来源地址。
     */
    function setRewardSource(address newRewardSource) external onlyOwner {
        require(newRewardSource != address(0), "FluxSwapStakingRewards: ZERO_ADDRESS");
        require(rewardNotifier != address(this), "FluxSwapStakingRewards: USE_REWARD_CONFIGURATION");
        emit RewardSourceUpdated(rewardSource, newRewardSource);
        rewardSource = newRewardSource;
    }

    /**
     * @notice 更新奖励通知者地址。
     * @dev 当奖励通知者需切换为合约自身时，必须通过 `setRewardConfiguration` 一次性完成。
     * @param newRewardNotifier 新的奖励通知者地址。
     */
    function setRewardNotifier(address newRewardNotifier) external onlyOwner {
        require(newRewardNotifier != address(0), "FluxSwapStakingRewards: ZERO_ADDRESS");
        require(rewardNotifier != address(this), "FluxSwapStakingRewards: USE_REWARD_CONFIGURATION");
        require(newRewardNotifier != address(this), "FluxSwapStakingRewards: USE_REWARD_CONFIGURATION");
        emit RewardNotifierUpdated(rewardNotifier, newRewardNotifier);
        rewardNotifier = newRewardNotifier;
    }

    /**
     * @notice 一次性更新奖励来源和奖励通知者。
     * @param newRewardSource 新的奖励来源地址。
     * @param newRewardNotifier 新的奖励通知者地址。
     */
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

    /**
     * @notice 质押指定数量的底层资产。
     * @param amount 需要质押的数量。
     */
    function stake(uint256 amount) external lock {
        uint256 previousTotalStaked = totalStaked;
        _syncRewards();
        _flushQueuedRewards();
        _updateReward(msg.sender);
        require(amount > 0, "FluxSwapStakingRewards: ZERO_AMOUNT");
        totalStaked += amount;
        balanceOf[msg.sender] += amount;
        TransferHelper.safeTransferFrom(stakingToken, msg.sender, address(this), amount);
        if (previousTotalStaked == 0) {
            _flushQueuedRewards();
        }
        emit Staked(msg.sender, amount);
    }

    /**
     * @notice 赎回指定数量的已质押资产。
     * @param amount 需要赎回的质押数量。
     */
    function withdraw(uint256 amount) external lock {
        _syncRewards();
        _flushQueuedRewards();
        _updateReward(msg.sender);
        require(amount > 0, "FluxSwapStakingRewards: ZERO_AMOUNT");
        require(balanceOf[msg.sender] >= amount, "FluxSwapStakingRewards: INSUFFICIENT_BALANCE");
        totalStaked -= amount;
        balanceOf[msg.sender] -= amount;
        TransferHelper.safeTransfer(stakingToken, msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /**
     * @notice 领取当前账户已累计的奖励。
     */
    function getReward() external lock {
        _syncRewards();
        _updateReward(msg.sender);
        _payReward(msg.sender);
    }

    /**
     * @notice 一次性退出质押并领取全部奖励。
     */
    function exit() external lock {
        _syncRewards();
        _flushQueuedRewards();
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

    /**
     * @notice 由奖励通知者注入一笔新的奖励。
     * @param reward 本次注入的奖励数量。
     */
    function notifyRewardAmount(uint256 reward) external lock onlyRewardNotifier {
        require(reward > 0, "FluxSwapStakingRewards: ZERO_AMOUNT");

        _requireSourceNotPaused(rewardSource, "FluxSwapStakingRewards: REWARD_SOURCE_PAUSED");
        if (_isTreasurySource(rewardSource)) {
            IFluxSwapTreasury(rewardSource).pullApprovedToken(rewardsToken, reward);
        } else {
            TransferHelper.safeTransferFrom(rewardsToken, rewardSource, address(this), reward);
        }
        rewardReserve += reward;

        uint256 accountedReward = _applyRewardAmount(reward);
        emit RewardAdded(reward, accountedReward, queuedRewards);
    }

    /**
     * @notice 从外部奖励来源同步一次奖励。
     * @return reward 本次同步到的奖励数量。
     */
    function syncRewards() external lock returns (uint256 reward) {
        reward = _syncRewards();
    }

    /**
     * @notice 在无活跃质押者时回收未分配奖励。
     * @param to 接收回收奖励的地址。
     * @return amount 实际回收的奖励数量。
     */
    function recoverUnallocatedRewards(address to) external lock onlyOwner returns (uint256 amount) {
        require(to != address(0), "FluxSwapStakingRewards: ZERO_ADDRESS");
        _syncRewards();
        require(totalStaked == 0, "FluxSwapStakingRewards: ACTIVE_STAKERS");

        amount = rewardReserve - pendingUserRewards;
        require(amount > 0, "FluxSwapStakingRewards: NO_UNALLOCATED_REWARDS");

        queuedRewards = 0;
        rewardReserve -= amount;

        TransferHelper.safeTransfer(rewardsToken, to, amount);
        emit UnallocatedRewardsRecovered(to, amount);
    }

    /**
     * @notice 返回当前全局累计的每份质押奖励值。
     * @return value 当前 `rewardPerTokenStored` 值。
     */
    function rewardPerToken() public view returns (uint256 value) {
        value = rewardPerTokenStored;
    }

    /**
     * @notice 计算指定账户当前已赚取但未领取的奖励。
     * @param account 待查询账户。
     * @return value 当前累计应得奖励。
     */
    function earned(address account) public view returns (uint256 value) {
        value = ((balanceOf[account] * (rewardPerToken() - userRewardPerTokenPaid[account])) / PRECISION) + rewards[account];
    }

    /**
     * @notice 向指定账户支付已记账奖励。
     * @param account 需要支付奖励的账户。
     */
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

    /**
     * @notice 当通知者为合约自身时，从管理器同步奖励。
     * @return reward 本次同步到的奖励数量。
     */
    function _syncRewards() private returns (uint256 reward) {
        if (rewardNotifier != address(this)) {
            return 0;
        }

        reward = IFluxMultiPoolManager(rewardSource).claimPoolRewards(address(this));

        if (reward == 0) {
            return 0;
        }

        rewardReserve += reward;
        uint256 accountedReward = _applyRewardAmount(reward);

        emit RewardAdded(reward, accountedReward, queuedRewards);
    }

    /**
     * @notice 把新奖励折算到全局 `rewardPerToken`。
     * @param reward 本次新增奖励数量。
     * @return accountedReward 本次实际被计入可分配奖励的数量。
     */
    function _applyRewardAmount(uint256 reward) private returns (uint256 accountedReward) {
        uint256 distributable = reward + queuedRewards;

        if (distributable == 0 || totalStaked == 0) {
            queuedRewards = distributable;
            return 0;
        }

        uint256 rewardPerTokenIncrement = (distributable * PRECISION) / totalStaked;
        if (rewardPerTokenIncrement == 0) {
            queuedRewards = distributable;
            return 0;
        }

        uint256 previousRewardPerTokenStored = rewardPerTokenStored;
        uint256 updatedRewardPerTokenStored = previousRewardPerTokenStored + rewardPerTokenIncrement;
        rewardPerTokenStored = updatedRewardPerTokenStored;

        accountedReward =
            ((updatedRewardPerTokenStored * totalStaked) / PRECISION) -
            ((previousRewardPerTokenStored * totalStaked) / PRECISION);
        queuedRewards = distributable - accountedReward;
    }

    /**
     * @notice 在存在质押份额时，把排队中的奖励尽快并入全局奖励率。
     */
    function _flushQueuedRewards() private {
        if (queuedRewards > 0 && totalStaked > 0) {
            _applyRewardAmount(0);
        }
    }

    /**
     * @notice 刷新指定账户的奖励快照。
     * @param account 待更新奖励状态的账户。
     */
    function _updateReward(address account) private {
        if (account != address(0)) {
            uint256 accruedReward =
                (balanceOf[account] * (rewardPerTokenStored - userRewardPerTokenPaid[account])) /
                PRECISION;
            if (accruedReward > 0) {
                rewards[account] += accruedReward;
                pendingUserRewards += accruedReward;
            }
            userRewardPerTokenPaid[account] = rewardPerTokenStored;

            uint256 unallocatedRewards = rewardReserve - pendingUserRewards;
            if (queuedRewards > unallocatedRewards) {
                queuedRewards = unallocatedRewards;
            }
        }
    }

    /**
     * @notice 检查奖励来源是否处于暂停状态。
     * @dev 若来源未实现 `paused()`，则视为无需额外检查。
     * @param source 目标来源地址。
     * @param errorMessage 当检测到暂停时抛出的错误信息。
     */
    function _requireSourceNotPaused(address source, string memory errorMessage) private view {
        (bool success, bytes memory data) = source.staticcall(abi.encodeWithSignature("paused()"));
        if (success && data.length >= 32) {
            require(!abi.decode(data, (bool)), errorMessage);
        }
    }

    /**
     * @notice 判断奖励来源是否为受控 Treasury。
     * @param source 待检测来源地址。
     * @return isTreasury 若来源实现 `isFluxSwapTreasury()` 且返回真，则返回 `true`。
     */
    function _isTreasurySource(address source) private view returns (bool isTreasury) {
        (bool success, bytes memory data) = source.staticcall(abi.encodeWithSignature("isFluxSwapTreasury()"));
        isTreasury = success && data.length >= 32 && abi.decode(data, (bool));
    }
}
