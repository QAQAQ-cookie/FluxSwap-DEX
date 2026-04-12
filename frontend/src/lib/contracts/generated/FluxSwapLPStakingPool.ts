import {
  createReadContract,
  createWriteContract,
  createSimulateContract,
  createWatchContractEvent,
} from 'wagmi/codegen'

import {
  createUseReadContract,
  createUseWriteContract,
  createUseSimulateContract,
  createUseWatchContractEvent,
} from 'wagmi/codegen'

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// FluxSwapLPStakingPool
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const fluxSwapLpStakingPoolAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: '_owner', internalType: 'address', type: 'address' },
      { name: '_factory', internalType: 'address', type: 'address' },
      { name: '_lpToken', internalType: 'address', type: 'address' },
      { name: '_rewardsToken', internalType: 'address', type: 'address' },
      { name: '_rewardSource', internalType: 'address', type: 'address' },
      { name: '_rewardNotifier', internalType: 'address', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OwnershipTransferred',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'reward',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'accountedReward',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'queuedRewards',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'RewardAdded',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousRewardSource',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newRewardSource',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newRewardNotifier',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'RewardConfigurationUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousRewardNotifier',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newRewardNotifier',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'RewardNotifierUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'user', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'reward',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'RewardPaid',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousRewardSource',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newRewardSource',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'RewardSourceUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'user', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Staked',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'to', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'UnallocatedRewardsRecovered',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'user', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Withdrawn',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'address', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'earned',
    outputs: [{ name: 'value', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'exit',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'factory',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'getReward',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'lpToken',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'reward', internalType: 'uint256', type: 'uint256' }],
    name: 'notifyRewardAmount',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'pendingUserRewards',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'queuedRewards',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'to', internalType: 'address', type: 'address' }],
    name: 'recoverUnallocatedRewards',
    outputs: [{ name: 'amount', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'rewardNotifier',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'rewardPerToken',
    outputs: [{ name: 'value', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'rewardPerTokenStored',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'rewardReserve',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'rewardSource',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'address', type: 'address' }],
    name: 'rewards',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'rewardsToken',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'newRewardSource', internalType: 'address', type: 'address' },
      { name: 'newRewardNotifier', internalType: 'address', type: 'address' },
    ],
    name: 'setRewardConfiguration',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'newRewardNotifier', internalType: 'address', type: 'address' },
    ],
    name: 'setRewardNotifier',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'newRewardSource', internalType: 'address', type: 'address' },
    ],
    name: 'setRewardSource',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'amount', internalType: 'uint256', type: 'uint256' }],
    name: 'stake',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'stakingToken',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'syncRewards',
    outputs: [{ name: 'reward', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'token0',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'token1',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'totalStaked',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'newOwner', internalType: 'address', type: 'address' }],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'address', type: 'address' }],
    name: 'userRewardPerTokenPaid',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'amount', internalType: 'uint256', type: 'uint256' }],
    name: 'withdraw',
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Action
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__
 */
export const readFluxSwapLpStakingPool = /*#__PURE__*/ createReadContract({
  abi: fluxSwapLpStakingPoolAbi,
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"balanceOf"`
 */
export const readFluxSwapLpStakingPoolBalanceOf =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'balanceOf',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"earned"`
 */
export const readFluxSwapLpStakingPoolEarned = /*#__PURE__*/ createReadContract(
  { abi: fluxSwapLpStakingPoolAbi, functionName: 'earned' },
)

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"factory"`
 */
export const readFluxSwapLpStakingPoolFactory =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'factory',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"lpToken"`
 */
export const readFluxSwapLpStakingPoolLpToken =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'lpToken',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"owner"`
 */
export const readFluxSwapLpStakingPoolOwner = /*#__PURE__*/ createReadContract({
  abi: fluxSwapLpStakingPoolAbi,
  functionName: 'owner',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"pendingUserRewards"`
 */
export const readFluxSwapLpStakingPoolPendingUserRewards =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'pendingUserRewards',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"queuedRewards"`
 */
export const readFluxSwapLpStakingPoolQueuedRewards =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'queuedRewards',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"rewardNotifier"`
 */
export const readFluxSwapLpStakingPoolRewardNotifier =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'rewardNotifier',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"rewardPerToken"`
 */
export const readFluxSwapLpStakingPoolRewardPerToken =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'rewardPerToken',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"rewardPerTokenStored"`
 */
export const readFluxSwapLpStakingPoolRewardPerTokenStored =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'rewardPerTokenStored',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"rewardReserve"`
 */
export const readFluxSwapLpStakingPoolRewardReserve =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'rewardReserve',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"rewardSource"`
 */
export const readFluxSwapLpStakingPoolRewardSource =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'rewardSource',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"rewards"`
 */
export const readFluxSwapLpStakingPoolRewards =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'rewards',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"rewardsToken"`
 */
export const readFluxSwapLpStakingPoolRewardsToken =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'rewardsToken',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"stakingToken"`
 */
export const readFluxSwapLpStakingPoolStakingToken =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'stakingToken',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"token0"`
 */
export const readFluxSwapLpStakingPoolToken0 = /*#__PURE__*/ createReadContract(
  { abi: fluxSwapLpStakingPoolAbi, functionName: 'token0' },
)

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"token1"`
 */
export const readFluxSwapLpStakingPoolToken1 = /*#__PURE__*/ createReadContract(
  { abi: fluxSwapLpStakingPoolAbi, functionName: 'token1' },
)

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"totalStaked"`
 */
export const readFluxSwapLpStakingPoolTotalStaked =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'totalStaked',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"userRewardPerTokenPaid"`
 */
export const readFluxSwapLpStakingPoolUserRewardPerTokenPaid =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'userRewardPerTokenPaid',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__
 */
export const writeFluxSwapLpStakingPool = /*#__PURE__*/ createWriteContract({
  abi: fluxSwapLpStakingPoolAbi,
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"exit"`
 */
export const writeFluxSwapLpStakingPoolExit = /*#__PURE__*/ createWriteContract(
  { abi: fluxSwapLpStakingPoolAbi, functionName: 'exit' },
)

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"getReward"`
 */
export const writeFluxSwapLpStakingPoolGetReward =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'getReward',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"notifyRewardAmount"`
 */
export const writeFluxSwapLpStakingPoolNotifyRewardAmount =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'notifyRewardAmount',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"recoverUnallocatedRewards"`
 */
export const writeFluxSwapLpStakingPoolRecoverUnallocatedRewards =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'recoverUnallocatedRewards',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"setRewardConfiguration"`
 */
export const writeFluxSwapLpStakingPoolSetRewardConfiguration =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'setRewardConfiguration',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"setRewardNotifier"`
 */
export const writeFluxSwapLpStakingPoolSetRewardNotifier =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'setRewardNotifier',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"setRewardSource"`
 */
export const writeFluxSwapLpStakingPoolSetRewardSource =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'setRewardSource',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"stake"`
 */
export const writeFluxSwapLpStakingPoolStake =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'stake',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"syncRewards"`
 */
export const writeFluxSwapLpStakingPoolSyncRewards =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'syncRewards',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const writeFluxSwapLpStakingPoolTransferOwnership =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"withdraw"`
 */
export const writeFluxSwapLpStakingPoolWithdraw =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'withdraw',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__
 */
export const simulateFluxSwapLpStakingPool =
  /*#__PURE__*/ createSimulateContract({ abi: fluxSwapLpStakingPoolAbi })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"exit"`
 */
export const simulateFluxSwapLpStakingPoolExit =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'exit',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"getReward"`
 */
export const simulateFluxSwapLpStakingPoolGetReward =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'getReward',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"notifyRewardAmount"`
 */
export const simulateFluxSwapLpStakingPoolNotifyRewardAmount =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'notifyRewardAmount',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"recoverUnallocatedRewards"`
 */
export const simulateFluxSwapLpStakingPoolRecoverUnallocatedRewards =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'recoverUnallocatedRewards',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"setRewardConfiguration"`
 */
export const simulateFluxSwapLpStakingPoolSetRewardConfiguration =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'setRewardConfiguration',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"setRewardNotifier"`
 */
export const simulateFluxSwapLpStakingPoolSetRewardNotifier =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'setRewardNotifier',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"setRewardSource"`
 */
export const simulateFluxSwapLpStakingPoolSetRewardSource =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'setRewardSource',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"stake"`
 */
export const simulateFluxSwapLpStakingPoolStake =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'stake',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"syncRewards"`
 */
export const simulateFluxSwapLpStakingPoolSyncRewards =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'syncRewards',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const simulateFluxSwapLpStakingPoolTransferOwnership =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"withdraw"`
 */
export const simulateFluxSwapLpStakingPoolWithdraw =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'withdraw',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__
 */
export const watchFluxSwapLpStakingPoolEvent =
  /*#__PURE__*/ createWatchContractEvent({ abi: fluxSwapLpStakingPoolAbi })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `eventName` set to `"OwnershipTransferred"`
 */
export const watchFluxSwapLpStakingPoolOwnershipTransferredEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapLpStakingPoolAbi,
    eventName: 'OwnershipTransferred',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `eventName` set to `"RewardAdded"`
 */
export const watchFluxSwapLpStakingPoolRewardAddedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapLpStakingPoolAbi,
    eventName: 'RewardAdded',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `eventName` set to `"RewardConfigurationUpdated"`
 */
export const watchFluxSwapLpStakingPoolRewardConfigurationUpdatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapLpStakingPoolAbi,
    eventName: 'RewardConfigurationUpdated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `eventName` set to `"RewardNotifierUpdated"`
 */
export const watchFluxSwapLpStakingPoolRewardNotifierUpdatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapLpStakingPoolAbi,
    eventName: 'RewardNotifierUpdated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `eventName` set to `"RewardPaid"`
 */
export const watchFluxSwapLpStakingPoolRewardPaidEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapLpStakingPoolAbi,
    eventName: 'RewardPaid',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `eventName` set to `"RewardSourceUpdated"`
 */
export const watchFluxSwapLpStakingPoolRewardSourceUpdatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapLpStakingPoolAbi,
    eventName: 'RewardSourceUpdated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `eventName` set to `"Staked"`
 */
export const watchFluxSwapLpStakingPoolStakedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapLpStakingPoolAbi,
    eventName: 'Staked',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `eventName` set to `"UnallocatedRewardsRecovered"`
 */
export const watchFluxSwapLpStakingPoolUnallocatedRewardsRecoveredEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapLpStakingPoolAbi,
    eventName: 'UnallocatedRewardsRecovered',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `eventName` set to `"Withdrawn"`
 */
export const watchFluxSwapLpStakingPoolWithdrawnEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapLpStakingPoolAbi,
    eventName: 'Withdrawn',
  })

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// React
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__
 */
export const useReadFluxSwapLpStakingPool = /*#__PURE__*/ createUseReadContract(
  { abi: fluxSwapLpStakingPoolAbi },
)

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"balanceOf"`
 */
export const useReadFluxSwapLpStakingPoolBalanceOf =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'balanceOf',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"earned"`
 */
export const useReadFluxSwapLpStakingPoolEarned =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'earned',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"factory"`
 */
export const useReadFluxSwapLpStakingPoolFactory =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'factory',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"lpToken"`
 */
export const useReadFluxSwapLpStakingPoolLpToken =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'lpToken',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"owner"`
 */
export const useReadFluxSwapLpStakingPoolOwner =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'owner',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"pendingUserRewards"`
 */
export const useReadFluxSwapLpStakingPoolPendingUserRewards =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'pendingUserRewards',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"queuedRewards"`
 */
export const useReadFluxSwapLpStakingPoolQueuedRewards =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'queuedRewards',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"rewardNotifier"`
 */
export const useReadFluxSwapLpStakingPoolRewardNotifier =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'rewardNotifier',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"rewardPerToken"`
 */
export const useReadFluxSwapLpStakingPoolRewardPerToken =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'rewardPerToken',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"rewardPerTokenStored"`
 */
export const useReadFluxSwapLpStakingPoolRewardPerTokenStored =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'rewardPerTokenStored',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"rewardReserve"`
 */
export const useReadFluxSwapLpStakingPoolRewardReserve =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'rewardReserve',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"rewardSource"`
 */
export const useReadFluxSwapLpStakingPoolRewardSource =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'rewardSource',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"rewards"`
 */
export const useReadFluxSwapLpStakingPoolRewards =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'rewards',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"rewardsToken"`
 */
export const useReadFluxSwapLpStakingPoolRewardsToken =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'rewardsToken',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"stakingToken"`
 */
export const useReadFluxSwapLpStakingPoolStakingToken =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'stakingToken',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"token0"`
 */
export const useReadFluxSwapLpStakingPoolToken0 =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'token0',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"token1"`
 */
export const useReadFluxSwapLpStakingPoolToken1 =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'token1',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"totalStaked"`
 */
export const useReadFluxSwapLpStakingPoolTotalStaked =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'totalStaked',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"userRewardPerTokenPaid"`
 */
export const useReadFluxSwapLpStakingPoolUserRewardPerTokenPaid =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'userRewardPerTokenPaid',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__
 */
export const useWriteFluxSwapLpStakingPool =
  /*#__PURE__*/ createUseWriteContract({ abi: fluxSwapLpStakingPoolAbi })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"exit"`
 */
export const useWriteFluxSwapLpStakingPoolExit =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'exit',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"getReward"`
 */
export const useWriteFluxSwapLpStakingPoolGetReward =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'getReward',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"notifyRewardAmount"`
 */
export const useWriteFluxSwapLpStakingPoolNotifyRewardAmount =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'notifyRewardAmount',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"recoverUnallocatedRewards"`
 */
export const useWriteFluxSwapLpStakingPoolRecoverUnallocatedRewards =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'recoverUnallocatedRewards',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"setRewardConfiguration"`
 */
export const useWriteFluxSwapLpStakingPoolSetRewardConfiguration =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'setRewardConfiguration',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"setRewardNotifier"`
 */
export const useWriteFluxSwapLpStakingPoolSetRewardNotifier =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'setRewardNotifier',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"setRewardSource"`
 */
export const useWriteFluxSwapLpStakingPoolSetRewardSource =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'setRewardSource',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"stake"`
 */
export const useWriteFluxSwapLpStakingPoolStake =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'stake',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"syncRewards"`
 */
export const useWriteFluxSwapLpStakingPoolSyncRewards =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'syncRewards',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useWriteFluxSwapLpStakingPoolTransferOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"withdraw"`
 */
export const useWriteFluxSwapLpStakingPoolWithdraw =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'withdraw',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__
 */
export const useSimulateFluxSwapLpStakingPool =
  /*#__PURE__*/ createUseSimulateContract({ abi: fluxSwapLpStakingPoolAbi })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"exit"`
 */
export const useSimulateFluxSwapLpStakingPoolExit =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'exit',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"getReward"`
 */
export const useSimulateFluxSwapLpStakingPoolGetReward =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'getReward',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"notifyRewardAmount"`
 */
export const useSimulateFluxSwapLpStakingPoolNotifyRewardAmount =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'notifyRewardAmount',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"recoverUnallocatedRewards"`
 */
export const useSimulateFluxSwapLpStakingPoolRecoverUnallocatedRewards =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'recoverUnallocatedRewards',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"setRewardConfiguration"`
 */
export const useSimulateFluxSwapLpStakingPoolSetRewardConfiguration =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'setRewardConfiguration',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"setRewardNotifier"`
 */
export const useSimulateFluxSwapLpStakingPoolSetRewardNotifier =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'setRewardNotifier',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"setRewardSource"`
 */
export const useSimulateFluxSwapLpStakingPoolSetRewardSource =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'setRewardSource',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"stake"`
 */
export const useSimulateFluxSwapLpStakingPoolStake =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'stake',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"syncRewards"`
 */
export const useSimulateFluxSwapLpStakingPoolSyncRewards =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'syncRewards',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useSimulateFluxSwapLpStakingPoolTransferOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `functionName` set to `"withdraw"`
 */
export const useSimulateFluxSwapLpStakingPoolWithdraw =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapLpStakingPoolAbi,
    functionName: 'withdraw',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__
 */
export const useWatchFluxSwapLpStakingPoolEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: fluxSwapLpStakingPoolAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `eventName` set to `"OwnershipTransferred"`
 */
export const useWatchFluxSwapLpStakingPoolOwnershipTransferredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapLpStakingPoolAbi,
    eventName: 'OwnershipTransferred',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `eventName` set to `"RewardAdded"`
 */
export const useWatchFluxSwapLpStakingPoolRewardAddedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapLpStakingPoolAbi,
    eventName: 'RewardAdded',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `eventName` set to `"RewardConfigurationUpdated"`
 */
export const useWatchFluxSwapLpStakingPoolRewardConfigurationUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapLpStakingPoolAbi,
    eventName: 'RewardConfigurationUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `eventName` set to `"RewardNotifierUpdated"`
 */
export const useWatchFluxSwapLpStakingPoolRewardNotifierUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapLpStakingPoolAbi,
    eventName: 'RewardNotifierUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `eventName` set to `"RewardPaid"`
 */
export const useWatchFluxSwapLpStakingPoolRewardPaidEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapLpStakingPoolAbi,
    eventName: 'RewardPaid',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `eventName` set to `"RewardSourceUpdated"`
 */
export const useWatchFluxSwapLpStakingPoolRewardSourceUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapLpStakingPoolAbi,
    eventName: 'RewardSourceUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `eventName` set to `"Staked"`
 */
export const useWatchFluxSwapLpStakingPoolStakedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapLpStakingPoolAbi,
    eventName: 'Staked',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `eventName` set to `"UnallocatedRewardsRecovered"`
 */
export const useWatchFluxSwapLpStakingPoolUnallocatedRewardsRecoveredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapLpStakingPoolAbi,
    eventName: 'UnallocatedRewardsRecovered',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapLpStakingPoolAbi}__ and `eventName` set to `"Withdrawn"`
 */
export const useWatchFluxSwapLpStakingPoolWithdrawnEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapLpStakingPoolAbi,
    eventName: 'Withdrawn',
  })
