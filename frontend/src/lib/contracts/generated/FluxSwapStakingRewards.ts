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
// FluxSwapStakingRewards
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const fluxSwapStakingRewardsAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: '_owner', internalType: 'address', type: 'address' },
      { name: '_stakingToken', internalType: 'address', type: 'address' },
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
    name: 'getReward',
    outputs: [],
    stateMutability: 'nonpayable',
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
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__
 */
export const readFluxSwapStakingRewards = /*#__PURE__*/ createReadContract({
  abi: fluxSwapStakingRewardsAbi,
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"balanceOf"`
 */
export const readFluxSwapStakingRewardsBalanceOf =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'balanceOf',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"earned"`
 */
export const readFluxSwapStakingRewardsEarned =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'earned',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"owner"`
 */
export const readFluxSwapStakingRewardsOwner = /*#__PURE__*/ createReadContract(
  { abi: fluxSwapStakingRewardsAbi, functionName: 'owner' },
)

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"pendingUserRewards"`
 */
export const readFluxSwapStakingRewardsPendingUserRewards =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'pendingUserRewards',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"queuedRewards"`
 */
export const readFluxSwapStakingRewardsQueuedRewards =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'queuedRewards',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"rewardNotifier"`
 */
export const readFluxSwapStakingRewardsRewardNotifier =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'rewardNotifier',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"rewardPerToken"`
 */
export const readFluxSwapStakingRewardsRewardPerToken =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'rewardPerToken',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"rewardPerTokenStored"`
 */
export const readFluxSwapStakingRewardsRewardPerTokenStored =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'rewardPerTokenStored',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"rewardReserve"`
 */
export const readFluxSwapStakingRewardsRewardReserve =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'rewardReserve',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"rewardSource"`
 */
export const readFluxSwapStakingRewardsRewardSource =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'rewardSource',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"rewards"`
 */
export const readFluxSwapStakingRewardsRewards =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'rewards',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"rewardsToken"`
 */
export const readFluxSwapStakingRewardsRewardsToken =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'rewardsToken',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"stakingToken"`
 */
export const readFluxSwapStakingRewardsStakingToken =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'stakingToken',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"totalStaked"`
 */
export const readFluxSwapStakingRewardsTotalStaked =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'totalStaked',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"userRewardPerTokenPaid"`
 */
export const readFluxSwapStakingRewardsUserRewardPerTokenPaid =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'userRewardPerTokenPaid',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__
 */
export const writeFluxSwapStakingRewards = /*#__PURE__*/ createWriteContract({
  abi: fluxSwapStakingRewardsAbi,
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"exit"`
 */
export const writeFluxSwapStakingRewardsExit =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'exit',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"getReward"`
 */
export const writeFluxSwapStakingRewardsGetReward =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'getReward',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"notifyRewardAmount"`
 */
export const writeFluxSwapStakingRewardsNotifyRewardAmount =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'notifyRewardAmount',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"recoverUnallocatedRewards"`
 */
export const writeFluxSwapStakingRewardsRecoverUnallocatedRewards =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'recoverUnallocatedRewards',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"setRewardConfiguration"`
 */
export const writeFluxSwapStakingRewardsSetRewardConfiguration =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'setRewardConfiguration',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"setRewardNotifier"`
 */
export const writeFluxSwapStakingRewardsSetRewardNotifier =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'setRewardNotifier',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"setRewardSource"`
 */
export const writeFluxSwapStakingRewardsSetRewardSource =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'setRewardSource',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"stake"`
 */
export const writeFluxSwapStakingRewardsStake =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'stake',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"syncRewards"`
 */
export const writeFluxSwapStakingRewardsSyncRewards =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'syncRewards',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const writeFluxSwapStakingRewardsTransferOwnership =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"withdraw"`
 */
export const writeFluxSwapStakingRewardsWithdraw =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'withdraw',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__
 */
export const simulateFluxSwapStakingRewards =
  /*#__PURE__*/ createSimulateContract({ abi: fluxSwapStakingRewardsAbi })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"exit"`
 */
export const simulateFluxSwapStakingRewardsExit =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'exit',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"getReward"`
 */
export const simulateFluxSwapStakingRewardsGetReward =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'getReward',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"notifyRewardAmount"`
 */
export const simulateFluxSwapStakingRewardsNotifyRewardAmount =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'notifyRewardAmount',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"recoverUnallocatedRewards"`
 */
export const simulateFluxSwapStakingRewardsRecoverUnallocatedRewards =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'recoverUnallocatedRewards',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"setRewardConfiguration"`
 */
export const simulateFluxSwapStakingRewardsSetRewardConfiguration =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'setRewardConfiguration',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"setRewardNotifier"`
 */
export const simulateFluxSwapStakingRewardsSetRewardNotifier =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'setRewardNotifier',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"setRewardSource"`
 */
export const simulateFluxSwapStakingRewardsSetRewardSource =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'setRewardSource',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"stake"`
 */
export const simulateFluxSwapStakingRewardsStake =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'stake',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"syncRewards"`
 */
export const simulateFluxSwapStakingRewardsSyncRewards =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'syncRewards',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const simulateFluxSwapStakingRewardsTransferOwnership =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"withdraw"`
 */
export const simulateFluxSwapStakingRewardsWithdraw =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'withdraw',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__
 */
export const watchFluxSwapStakingRewardsEvent =
  /*#__PURE__*/ createWatchContractEvent({ abi: fluxSwapStakingRewardsAbi })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `eventName` set to `"OwnershipTransferred"`
 */
export const watchFluxSwapStakingRewardsOwnershipTransferredEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapStakingRewardsAbi,
    eventName: 'OwnershipTransferred',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `eventName` set to `"RewardAdded"`
 */
export const watchFluxSwapStakingRewardsRewardAddedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapStakingRewardsAbi,
    eventName: 'RewardAdded',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `eventName` set to `"RewardConfigurationUpdated"`
 */
export const watchFluxSwapStakingRewardsRewardConfigurationUpdatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapStakingRewardsAbi,
    eventName: 'RewardConfigurationUpdated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `eventName` set to `"RewardNotifierUpdated"`
 */
export const watchFluxSwapStakingRewardsRewardNotifierUpdatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapStakingRewardsAbi,
    eventName: 'RewardNotifierUpdated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `eventName` set to `"RewardPaid"`
 */
export const watchFluxSwapStakingRewardsRewardPaidEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapStakingRewardsAbi,
    eventName: 'RewardPaid',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `eventName` set to `"RewardSourceUpdated"`
 */
export const watchFluxSwapStakingRewardsRewardSourceUpdatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapStakingRewardsAbi,
    eventName: 'RewardSourceUpdated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `eventName` set to `"Staked"`
 */
export const watchFluxSwapStakingRewardsStakedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapStakingRewardsAbi,
    eventName: 'Staked',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `eventName` set to `"UnallocatedRewardsRecovered"`
 */
export const watchFluxSwapStakingRewardsUnallocatedRewardsRecoveredEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapStakingRewardsAbi,
    eventName: 'UnallocatedRewardsRecovered',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `eventName` set to `"Withdrawn"`
 */
export const watchFluxSwapStakingRewardsWithdrawnEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapStakingRewardsAbi,
    eventName: 'Withdrawn',
  })

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// React
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__
 */
export const useReadFluxSwapStakingRewards =
  /*#__PURE__*/ createUseReadContract({ abi: fluxSwapStakingRewardsAbi })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"balanceOf"`
 */
export const useReadFluxSwapStakingRewardsBalanceOf =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'balanceOf',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"earned"`
 */
export const useReadFluxSwapStakingRewardsEarned =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'earned',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"owner"`
 */
export const useReadFluxSwapStakingRewardsOwner =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'owner',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"pendingUserRewards"`
 */
export const useReadFluxSwapStakingRewardsPendingUserRewards =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'pendingUserRewards',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"queuedRewards"`
 */
export const useReadFluxSwapStakingRewardsQueuedRewards =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'queuedRewards',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"rewardNotifier"`
 */
export const useReadFluxSwapStakingRewardsRewardNotifier =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'rewardNotifier',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"rewardPerToken"`
 */
export const useReadFluxSwapStakingRewardsRewardPerToken =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'rewardPerToken',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"rewardPerTokenStored"`
 */
export const useReadFluxSwapStakingRewardsRewardPerTokenStored =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'rewardPerTokenStored',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"rewardReserve"`
 */
export const useReadFluxSwapStakingRewardsRewardReserve =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'rewardReserve',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"rewardSource"`
 */
export const useReadFluxSwapStakingRewardsRewardSource =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'rewardSource',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"rewards"`
 */
export const useReadFluxSwapStakingRewardsRewards =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'rewards',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"rewardsToken"`
 */
export const useReadFluxSwapStakingRewardsRewardsToken =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'rewardsToken',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"stakingToken"`
 */
export const useReadFluxSwapStakingRewardsStakingToken =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'stakingToken',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"totalStaked"`
 */
export const useReadFluxSwapStakingRewardsTotalStaked =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'totalStaked',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"userRewardPerTokenPaid"`
 */
export const useReadFluxSwapStakingRewardsUserRewardPerTokenPaid =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'userRewardPerTokenPaid',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__
 */
export const useWriteFluxSwapStakingRewards =
  /*#__PURE__*/ createUseWriteContract({ abi: fluxSwapStakingRewardsAbi })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"exit"`
 */
export const useWriteFluxSwapStakingRewardsExit =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'exit',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"getReward"`
 */
export const useWriteFluxSwapStakingRewardsGetReward =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'getReward',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"notifyRewardAmount"`
 */
export const useWriteFluxSwapStakingRewardsNotifyRewardAmount =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'notifyRewardAmount',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"recoverUnallocatedRewards"`
 */
export const useWriteFluxSwapStakingRewardsRecoverUnallocatedRewards =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'recoverUnallocatedRewards',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"setRewardConfiguration"`
 */
export const useWriteFluxSwapStakingRewardsSetRewardConfiguration =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'setRewardConfiguration',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"setRewardNotifier"`
 */
export const useWriteFluxSwapStakingRewardsSetRewardNotifier =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'setRewardNotifier',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"setRewardSource"`
 */
export const useWriteFluxSwapStakingRewardsSetRewardSource =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'setRewardSource',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"stake"`
 */
export const useWriteFluxSwapStakingRewardsStake =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'stake',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"syncRewards"`
 */
export const useWriteFluxSwapStakingRewardsSyncRewards =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'syncRewards',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useWriteFluxSwapStakingRewardsTransferOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"withdraw"`
 */
export const useWriteFluxSwapStakingRewardsWithdraw =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'withdraw',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__
 */
export const useSimulateFluxSwapStakingRewards =
  /*#__PURE__*/ createUseSimulateContract({ abi: fluxSwapStakingRewardsAbi })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"exit"`
 */
export const useSimulateFluxSwapStakingRewardsExit =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'exit',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"getReward"`
 */
export const useSimulateFluxSwapStakingRewardsGetReward =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'getReward',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"notifyRewardAmount"`
 */
export const useSimulateFluxSwapStakingRewardsNotifyRewardAmount =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'notifyRewardAmount',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"recoverUnallocatedRewards"`
 */
export const useSimulateFluxSwapStakingRewardsRecoverUnallocatedRewards =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'recoverUnallocatedRewards',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"setRewardConfiguration"`
 */
export const useSimulateFluxSwapStakingRewardsSetRewardConfiguration =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'setRewardConfiguration',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"setRewardNotifier"`
 */
export const useSimulateFluxSwapStakingRewardsSetRewardNotifier =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'setRewardNotifier',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"setRewardSource"`
 */
export const useSimulateFluxSwapStakingRewardsSetRewardSource =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'setRewardSource',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"stake"`
 */
export const useSimulateFluxSwapStakingRewardsStake =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'stake',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"syncRewards"`
 */
export const useSimulateFluxSwapStakingRewardsSyncRewards =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'syncRewards',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useSimulateFluxSwapStakingRewardsTransferOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `functionName` set to `"withdraw"`
 */
export const useSimulateFluxSwapStakingRewardsWithdraw =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'withdraw',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__
 */
export const useWatchFluxSwapStakingRewardsEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: fluxSwapStakingRewardsAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `eventName` set to `"OwnershipTransferred"`
 */
export const useWatchFluxSwapStakingRewardsOwnershipTransferredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapStakingRewardsAbi,
    eventName: 'OwnershipTransferred',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `eventName` set to `"RewardAdded"`
 */
export const useWatchFluxSwapStakingRewardsRewardAddedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapStakingRewardsAbi,
    eventName: 'RewardAdded',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `eventName` set to `"RewardConfigurationUpdated"`
 */
export const useWatchFluxSwapStakingRewardsRewardConfigurationUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapStakingRewardsAbi,
    eventName: 'RewardConfigurationUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `eventName` set to `"RewardNotifierUpdated"`
 */
export const useWatchFluxSwapStakingRewardsRewardNotifierUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapStakingRewardsAbi,
    eventName: 'RewardNotifierUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `eventName` set to `"RewardPaid"`
 */
export const useWatchFluxSwapStakingRewardsRewardPaidEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapStakingRewardsAbi,
    eventName: 'RewardPaid',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `eventName` set to `"RewardSourceUpdated"`
 */
export const useWatchFluxSwapStakingRewardsRewardSourceUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapStakingRewardsAbi,
    eventName: 'RewardSourceUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `eventName` set to `"Staked"`
 */
export const useWatchFluxSwapStakingRewardsStakedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapStakingRewardsAbi,
    eventName: 'Staked',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `eventName` set to `"UnallocatedRewardsRecovered"`
 */
export const useWatchFluxSwapStakingRewardsUnallocatedRewardsRecoveredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapStakingRewardsAbi,
    eventName: 'UnallocatedRewardsRecovered',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapStakingRewardsAbi}__ and `eventName` set to `"Withdrawn"`
 */
export const useWatchFluxSwapStakingRewardsWithdrawnEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapStakingRewardsAbi,
    eventName: 'Withdrawn',
  })
