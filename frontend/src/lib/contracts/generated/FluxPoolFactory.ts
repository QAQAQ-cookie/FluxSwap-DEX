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
// FluxPoolFactory
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const fluxPoolFactoryAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: '_owner', internalType: 'address', type: 'address' },
      { name: '_manager', internalType: 'address', type: 'address' },
      { name: '_dexFactory', internalType: 'address', type: 'address' },
      { name: '_rewardToken', internalType: 'address', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'error',
    inputs: [{ name: 'owner', internalType: 'address', type: 'address' }],
    name: 'OwnableInvalidOwner',
  },
  {
    type: 'error',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'OwnableUnauthorizedAccount',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'lpToken',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      { name: 'pool', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'allocPoint',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      { name: 'active', internalType: 'bool', type: 'bool', indexed: false },
    ],
    name: 'LPPoolCreated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'pool', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'newOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'ManagedPoolOwnershipTransferred',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'pool', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'rewardSource',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'rewardNotifier',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'ManagedPoolRewardConfigurationUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'pool', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'rewardNotifier',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'ManagedPoolRewardNotifierUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'pool', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'rewardSource',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'ManagedPoolRewardSourceUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'pool', internalType: 'address', type: 'address', indexed: true },
      { name: 'to', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'ManagedPoolUnallocatedRewardsRecovered',
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
        name: 'stakingToken',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      { name: 'pool', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'allocPoint',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      { name: 'active', internalType: 'bool', type: 'bool', indexed: false },
    ],
    name: 'SingleTokenPoolCreated',
  },
  {
    type: 'function',
    inputs: [
      { name: 'lpToken', internalType: 'address', type: 'address' },
      { name: 'allocPoint', internalType: 'uint256', type: 'uint256' },
      { name: 'active', internalType: 'bool', type: 'bool' },
    ],
    name: 'createLPPool',
    outputs: [{ name: 'pool', internalType: 'address', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'stakingToken', internalType: 'address', type: 'address' },
      { name: 'allocPoint', internalType: 'uint256', type: 'uint256' },
      { name: 'active', internalType: 'bool', type: 'bool' },
    ],
    name: 'createSingleTokenPool',
    outputs: [{ name: 'pool', internalType: 'address', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'dexFactory',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'address', type: 'address' }],
    name: 'lpTokenPools',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'address', type: 'address' }],
    name: 'managedPoolIsLP',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'address', type: 'address' }],
    name: 'managedPoolStakingAsset',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'address', type: 'address' }],
    name: 'managedPools',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'manager',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
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
    inputs: [
      { name: 'pool', internalType: 'address', type: 'address' },
      { name: 'to', internalType: 'address', type: 'address' },
    ],
    name: 'recoverManagedPoolUnallocatedRewards',
    outputs: [{ name: 'amount', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'renounceOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'rewardToken',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'pool', internalType: 'address', type: 'address' },
      { name: 'rewardSource', internalType: 'address', type: 'address' },
      { name: 'rewardNotifier', internalType: 'address', type: 'address' },
    ],
    name: 'setManagedPoolRewardConfiguration',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'pool', internalType: 'address', type: 'address' },
      { name: 'rewardNotifier', internalType: 'address', type: 'address' },
    ],
    name: 'setManagedPoolRewardNotifier',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'pool', internalType: 'address', type: 'address' },
      { name: 'rewardSource', internalType: 'address', type: 'address' },
    ],
    name: 'setManagedPoolRewardSource',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'address', type: 'address' }],
    name: 'singleTokenPools',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'pool', internalType: 'address', type: 'address' },
      { name: 'newOwner', internalType: 'address', type: 'address' },
    ],
    name: 'transferManagedPoolOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'newOwner', internalType: 'address', type: 'address' }],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Action
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__
 */
export const readFluxPoolFactory = /*#__PURE__*/ createReadContract({
  abi: fluxPoolFactoryAbi,
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"dexFactory"`
 */
export const readFluxPoolFactoryDexFactory = /*#__PURE__*/ createReadContract({
  abi: fluxPoolFactoryAbi,
  functionName: 'dexFactory',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"lpTokenPools"`
 */
export const readFluxPoolFactoryLpTokenPools = /*#__PURE__*/ createReadContract(
  { abi: fluxPoolFactoryAbi, functionName: 'lpTokenPools' },
)

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"managedPoolIsLP"`
 */
export const readFluxPoolFactoryManagedPoolIsLp =
  /*#__PURE__*/ createReadContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'managedPoolIsLP',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"managedPoolStakingAsset"`
 */
export const readFluxPoolFactoryManagedPoolStakingAsset =
  /*#__PURE__*/ createReadContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'managedPoolStakingAsset',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"managedPools"`
 */
export const readFluxPoolFactoryManagedPools = /*#__PURE__*/ createReadContract(
  { abi: fluxPoolFactoryAbi, functionName: 'managedPools' },
)

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"manager"`
 */
export const readFluxPoolFactoryManager = /*#__PURE__*/ createReadContract({
  abi: fluxPoolFactoryAbi,
  functionName: 'manager',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"owner"`
 */
export const readFluxPoolFactoryOwner = /*#__PURE__*/ createReadContract({
  abi: fluxPoolFactoryAbi,
  functionName: 'owner',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"rewardToken"`
 */
export const readFluxPoolFactoryRewardToken = /*#__PURE__*/ createReadContract({
  abi: fluxPoolFactoryAbi,
  functionName: 'rewardToken',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"singleTokenPools"`
 */
export const readFluxPoolFactorySingleTokenPools =
  /*#__PURE__*/ createReadContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'singleTokenPools',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__
 */
export const writeFluxPoolFactory = /*#__PURE__*/ createWriteContract({
  abi: fluxPoolFactoryAbi,
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"createLPPool"`
 */
export const writeFluxPoolFactoryCreateLpPool =
  /*#__PURE__*/ createWriteContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'createLPPool',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"createSingleTokenPool"`
 */
export const writeFluxPoolFactoryCreateSingleTokenPool =
  /*#__PURE__*/ createWriteContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'createSingleTokenPool',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"recoverManagedPoolUnallocatedRewards"`
 */
export const writeFluxPoolFactoryRecoverManagedPoolUnallocatedRewards =
  /*#__PURE__*/ createWriteContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'recoverManagedPoolUnallocatedRewards',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const writeFluxPoolFactoryRenounceOwnership =
  /*#__PURE__*/ createWriteContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"setManagedPoolRewardConfiguration"`
 */
export const writeFluxPoolFactorySetManagedPoolRewardConfiguration =
  /*#__PURE__*/ createWriteContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'setManagedPoolRewardConfiguration',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"setManagedPoolRewardNotifier"`
 */
export const writeFluxPoolFactorySetManagedPoolRewardNotifier =
  /*#__PURE__*/ createWriteContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'setManagedPoolRewardNotifier',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"setManagedPoolRewardSource"`
 */
export const writeFluxPoolFactorySetManagedPoolRewardSource =
  /*#__PURE__*/ createWriteContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'setManagedPoolRewardSource',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"transferManagedPoolOwnership"`
 */
export const writeFluxPoolFactoryTransferManagedPoolOwnership =
  /*#__PURE__*/ createWriteContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'transferManagedPoolOwnership',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const writeFluxPoolFactoryTransferOwnership =
  /*#__PURE__*/ createWriteContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__
 */
export const simulateFluxPoolFactory = /*#__PURE__*/ createSimulateContract({
  abi: fluxPoolFactoryAbi,
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"createLPPool"`
 */
export const simulateFluxPoolFactoryCreateLpPool =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'createLPPool',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"createSingleTokenPool"`
 */
export const simulateFluxPoolFactoryCreateSingleTokenPool =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'createSingleTokenPool',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"recoverManagedPoolUnallocatedRewards"`
 */
export const simulateFluxPoolFactoryRecoverManagedPoolUnallocatedRewards =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'recoverManagedPoolUnallocatedRewards',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const simulateFluxPoolFactoryRenounceOwnership =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"setManagedPoolRewardConfiguration"`
 */
export const simulateFluxPoolFactorySetManagedPoolRewardConfiguration =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'setManagedPoolRewardConfiguration',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"setManagedPoolRewardNotifier"`
 */
export const simulateFluxPoolFactorySetManagedPoolRewardNotifier =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'setManagedPoolRewardNotifier',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"setManagedPoolRewardSource"`
 */
export const simulateFluxPoolFactorySetManagedPoolRewardSource =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'setManagedPoolRewardSource',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"transferManagedPoolOwnership"`
 */
export const simulateFluxPoolFactoryTransferManagedPoolOwnership =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'transferManagedPoolOwnership',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const simulateFluxPoolFactoryTransferOwnership =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxPoolFactoryAbi}__
 */
export const watchFluxPoolFactoryEvent = /*#__PURE__*/ createWatchContractEvent(
  { abi: fluxPoolFactoryAbi },
)

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `eventName` set to `"LPPoolCreated"`
 */
export const watchFluxPoolFactoryLpPoolCreatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxPoolFactoryAbi,
    eventName: 'LPPoolCreated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `eventName` set to `"ManagedPoolOwnershipTransferred"`
 */
export const watchFluxPoolFactoryManagedPoolOwnershipTransferredEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxPoolFactoryAbi,
    eventName: 'ManagedPoolOwnershipTransferred',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `eventName` set to `"ManagedPoolRewardConfigurationUpdated"`
 */
export const watchFluxPoolFactoryManagedPoolRewardConfigurationUpdatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxPoolFactoryAbi,
    eventName: 'ManagedPoolRewardConfigurationUpdated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `eventName` set to `"ManagedPoolRewardNotifierUpdated"`
 */
export const watchFluxPoolFactoryManagedPoolRewardNotifierUpdatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxPoolFactoryAbi,
    eventName: 'ManagedPoolRewardNotifierUpdated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `eventName` set to `"ManagedPoolRewardSourceUpdated"`
 */
export const watchFluxPoolFactoryManagedPoolRewardSourceUpdatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxPoolFactoryAbi,
    eventName: 'ManagedPoolRewardSourceUpdated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `eventName` set to `"ManagedPoolUnallocatedRewardsRecovered"`
 */
export const watchFluxPoolFactoryManagedPoolUnallocatedRewardsRecoveredEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxPoolFactoryAbi,
    eventName: 'ManagedPoolUnallocatedRewardsRecovered',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `eventName` set to `"OwnershipTransferred"`
 */
export const watchFluxPoolFactoryOwnershipTransferredEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxPoolFactoryAbi,
    eventName: 'OwnershipTransferred',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `eventName` set to `"SingleTokenPoolCreated"`
 */
export const watchFluxPoolFactorySingleTokenPoolCreatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxPoolFactoryAbi,
    eventName: 'SingleTokenPoolCreated',
  })

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// React
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__
 */
export const useReadFluxPoolFactory = /*#__PURE__*/ createUseReadContract({
  abi: fluxPoolFactoryAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"dexFactory"`
 */
export const useReadFluxPoolFactoryDexFactory =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'dexFactory',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"lpTokenPools"`
 */
export const useReadFluxPoolFactoryLpTokenPools =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'lpTokenPools',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"managedPoolIsLP"`
 */
export const useReadFluxPoolFactoryManagedPoolIsLp =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'managedPoolIsLP',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"managedPoolStakingAsset"`
 */
export const useReadFluxPoolFactoryManagedPoolStakingAsset =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'managedPoolStakingAsset',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"managedPools"`
 */
export const useReadFluxPoolFactoryManagedPools =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'managedPools',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"manager"`
 */
export const useReadFluxPoolFactoryManager =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'manager',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"owner"`
 */
export const useReadFluxPoolFactoryOwner = /*#__PURE__*/ createUseReadContract({
  abi: fluxPoolFactoryAbi,
  functionName: 'owner',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"rewardToken"`
 */
export const useReadFluxPoolFactoryRewardToken =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'rewardToken',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"singleTokenPools"`
 */
export const useReadFluxPoolFactorySingleTokenPools =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'singleTokenPools',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__
 */
export const useWriteFluxPoolFactory = /*#__PURE__*/ createUseWriteContract({
  abi: fluxPoolFactoryAbi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"createLPPool"`
 */
export const useWriteFluxPoolFactoryCreateLpPool =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'createLPPool',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"createSingleTokenPool"`
 */
export const useWriteFluxPoolFactoryCreateSingleTokenPool =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'createSingleTokenPool',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"recoverManagedPoolUnallocatedRewards"`
 */
export const useWriteFluxPoolFactoryRecoverManagedPoolUnallocatedRewards =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'recoverManagedPoolUnallocatedRewards',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const useWriteFluxPoolFactoryRenounceOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"setManagedPoolRewardConfiguration"`
 */
export const useWriteFluxPoolFactorySetManagedPoolRewardConfiguration =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'setManagedPoolRewardConfiguration',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"setManagedPoolRewardNotifier"`
 */
export const useWriteFluxPoolFactorySetManagedPoolRewardNotifier =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'setManagedPoolRewardNotifier',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"setManagedPoolRewardSource"`
 */
export const useWriteFluxPoolFactorySetManagedPoolRewardSource =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'setManagedPoolRewardSource',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"transferManagedPoolOwnership"`
 */
export const useWriteFluxPoolFactoryTransferManagedPoolOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'transferManagedPoolOwnership',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useWriteFluxPoolFactoryTransferOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__
 */
export const useSimulateFluxPoolFactory =
  /*#__PURE__*/ createUseSimulateContract({ abi: fluxPoolFactoryAbi })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"createLPPool"`
 */
export const useSimulateFluxPoolFactoryCreateLpPool =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'createLPPool',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"createSingleTokenPool"`
 */
export const useSimulateFluxPoolFactoryCreateSingleTokenPool =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'createSingleTokenPool',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"recoverManagedPoolUnallocatedRewards"`
 */
export const useSimulateFluxPoolFactoryRecoverManagedPoolUnallocatedRewards =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'recoverManagedPoolUnallocatedRewards',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const useSimulateFluxPoolFactoryRenounceOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"setManagedPoolRewardConfiguration"`
 */
export const useSimulateFluxPoolFactorySetManagedPoolRewardConfiguration =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'setManagedPoolRewardConfiguration',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"setManagedPoolRewardNotifier"`
 */
export const useSimulateFluxPoolFactorySetManagedPoolRewardNotifier =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'setManagedPoolRewardNotifier',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"setManagedPoolRewardSource"`
 */
export const useSimulateFluxPoolFactorySetManagedPoolRewardSource =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'setManagedPoolRewardSource',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"transferManagedPoolOwnership"`
 */
export const useSimulateFluxPoolFactoryTransferManagedPoolOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'transferManagedPoolOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useSimulateFluxPoolFactoryTransferOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxPoolFactoryAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxPoolFactoryAbi}__
 */
export const useWatchFluxPoolFactoryEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: fluxPoolFactoryAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `eventName` set to `"LPPoolCreated"`
 */
export const useWatchFluxPoolFactoryLpPoolCreatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxPoolFactoryAbi,
    eventName: 'LPPoolCreated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `eventName` set to `"ManagedPoolOwnershipTransferred"`
 */
export const useWatchFluxPoolFactoryManagedPoolOwnershipTransferredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxPoolFactoryAbi,
    eventName: 'ManagedPoolOwnershipTransferred',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `eventName` set to `"ManagedPoolRewardConfigurationUpdated"`
 */
export const useWatchFluxPoolFactoryManagedPoolRewardConfigurationUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxPoolFactoryAbi,
    eventName: 'ManagedPoolRewardConfigurationUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `eventName` set to `"ManagedPoolRewardNotifierUpdated"`
 */
export const useWatchFluxPoolFactoryManagedPoolRewardNotifierUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxPoolFactoryAbi,
    eventName: 'ManagedPoolRewardNotifierUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `eventName` set to `"ManagedPoolRewardSourceUpdated"`
 */
export const useWatchFluxPoolFactoryManagedPoolRewardSourceUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxPoolFactoryAbi,
    eventName: 'ManagedPoolRewardSourceUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `eventName` set to `"ManagedPoolUnallocatedRewardsRecovered"`
 */
export const useWatchFluxPoolFactoryManagedPoolUnallocatedRewardsRecoveredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxPoolFactoryAbi,
    eventName: 'ManagedPoolUnallocatedRewardsRecovered',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `eventName` set to `"OwnershipTransferred"`
 */
export const useWatchFluxPoolFactoryOwnershipTransferredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxPoolFactoryAbi,
    eventName: 'OwnershipTransferred',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxPoolFactoryAbi}__ and `eventName` set to `"SingleTokenPoolCreated"`
 */
export const useWatchFluxPoolFactorySingleTokenPoolCreatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxPoolFactoryAbi,
    eventName: 'SingleTokenPoolCreated',
  })
