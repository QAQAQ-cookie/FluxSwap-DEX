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
// FluxMultiPoolManager
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const fluxMultiPoolManagerAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: '_owner', internalType: 'address', type: 'address' },
      { name: '_treasury', internalType: 'address', type: 'address' },
      { name: '_operator', internalType: 'address', type: 'address' },
      { name: '_rewardToken', internalType: 'address', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  { type: 'error', inputs: [], name: 'AccessControlBadConfirmation' },
  {
    type: 'error',
    inputs: [
      { name: 'account', internalType: 'address', type: 'address' },
      { name: 'neededRole', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'AccessControlUnauthorizedAccount',
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
        name: 'previousOperator',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newOperator',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OperatorUpdated',
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
        name: 'account',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'Paused',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'pid', internalType: 'uint256', type: 'uint256', indexed: true },
      { name: 'pool', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'allocPoint',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      { name: 'active', internalType: 'bool', type: 'bool', indexed: false },
    ],
    name: 'PoolAdded',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousPoolFactory',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newPoolFactory',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'PoolFactoryUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'pid', internalType: 'uint256', type: 'uint256', indexed: true },
      { name: 'pool', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'reward',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'caller',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'PoolRewardClaimed',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'pid', internalType: 'uint256', type: 'uint256', indexed: true },
      {
        name: 'allocPoint',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      { name: 'active', internalType: 'bool', type: 'bool', indexed: false },
    ],
    name: 'PoolUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'totalReward',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'rewardDelta',
        internalType: 'uint256',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'executor',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'RewardsDistributed',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32', indexed: true },
      {
        name: 'previousAdminRole',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'newAdminRole',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
    ],
    name: 'RoleAdminChanged',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32', indexed: true },
      {
        name: 'account',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'sender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'RoleGranted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32', indexed: true },
      {
        name: 'account',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'sender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'RoleRevoked',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'token',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      { name: 'to', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'TokenRecovered',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousTreasury',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newTreasury',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'TreasuryUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'account',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'Unpaused',
  },
  {
    type: 'function',
    inputs: [],
    name: 'DEFAULT_ADMIN_ROLE',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'OPERATOR_ROLE',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'PAUSER_ROLE',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'accRewardPerAllocStored',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'pool', internalType: 'address', type: 'address' },
      { name: 'allocPoint', internalType: 'uint256', type: 'uint256' },
      { name: 'active', internalType: 'bool', type: 'bool' },
    ],
    name: 'addPool',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'pool', internalType: 'address', type: 'address' }],
    name: 'claimPoolRewards',
    outputs: [{ name: 'reward', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'pool', internalType: 'address', type: 'address' }],
    name: 'deactivatePool',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'totalReward', internalType: 'uint256', type: 'uint256' }],
    name: 'distributeRewards',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'role', internalType: 'bytes32', type: 'bytes32' }],
    name: 'getRoleAdmin',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32' },
      { name: 'account', internalType: 'address', type: 'address' },
    ],
    name: 'grantRole',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32' },
      { name: 'account', internalType: 'address', type: 'address' },
    ],
    name: 'hasRole',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'operator',
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
    inputs: [],
    name: 'pause',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'paused',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'pool', internalType: 'address', type: 'address' }],
    name: 'pendingPoolRewards',
    outputs: [{ name: 'reward', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'address', type: 'address' }],
    name: 'poolExists',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'poolFactory',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'poolLength',
    outputs: [{ name: 'length', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    name: 'pools',
    outputs: [
      { name: 'pool', internalType: 'address', type: 'address' },
      { name: 'allocPoint', internalType: 'uint256', type: 'uint256' },
      { name: 'active', internalType: 'bool', type: 'bool' },
      { name: 'rewardDebt', internalType: 'uint256', type: 'uint256' },
      { name: 'pendingRewards', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'recoverToken',
    outputs: [],
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
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32' },
      { name: 'callerConfirmation', internalType: 'address', type: 'address' },
    ],
    name: 'renounceRole',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'role', internalType: 'bytes32', type: 'bytes32' },
      { name: 'account', internalType: 'address', type: 'address' },
    ],
    name: 'revokeRole',
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
    inputs: [{ name: 'newOperator', internalType: 'address', type: 'address' }],
    name: 'setOperator',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'pid', internalType: 'uint256', type: 'uint256' },
      { name: 'allocPoint', internalType: 'uint256', type: 'uint256' },
      { name: 'active', internalType: 'bool', type: 'bool' },
    ],
    name: 'setPool',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'newPoolFactory', internalType: 'address', type: 'address' },
    ],
    name: 'setPoolFactory',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'newTreasury', internalType: 'address', type: 'address' }],
    name: 'setTreasury',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'interfaceId', internalType: 'bytes4', type: 'bytes4' }],
    name: 'supportsInterface',
    outputs: [{ name: 'supported', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'totalAllocPoint',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'totalPendingRewards',
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
    inputs: [],
    name: 'treasury',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'undistributedRewards',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'unpause',
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Action
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__
 */
export const readFluxMultiPoolManager = /*#__PURE__*/ createReadContract({
  abi: fluxMultiPoolManagerAbi,
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"DEFAULT_ADMIN_ROLE"`
 */
export const readFluxMultiPoolManagerDefaultAdminRole =
  /*#__PURE__*/ createReadContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'DEFAULT_ADMIN_ROLE',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"OPERATOR_ROLE"`
 */
export const readFluxMultiPoolManagerOperatorRole =
  /*#__PURE__*/ createReadContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'OPERATOR_ROLE',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"PAUSER_ROLE"`
 */
export const readFluxMultiPoolManagerPauserRole =
  /*#__PURE__*/ createReadContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'PAUSER_ROLE',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"accRewardPerAllocStored"`
 */
export const readFluxMultiPoolManagerAccRewardPerAllocStored =
  /*#__PURE__*/ createReadContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'accRewardPerAllocStored',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"getRoleAdmin"`
 */
export const readFluxMultiPoolManagerGetRoleAdmin =
  /*#__PURE__*/ createReadContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'getRoleAdmin',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"hasRole"`
 */
export const readFluxMultiPoolManagerHasRole = /*#__PURE__*/ createReadContract(
  { abi: fluxMultiPoolManagerAbi, functionName: 'hasRole' },
)

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"operator"`
 */
export const readFluxMultiPoolManagerOperator =
  /*#__PURE__*/ createReadContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'operator',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"owner"`
 */
export const readFluxMultiPoolManagerOwner = /*#__PURE__*/ createReadContract({
  abi: fluxMultiPoolManagerAbi,
  functionName: 'owner',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"paused"`
 */
export const readFluxMultiPoolManagerPaused = /*#__PURE__*/ createReadContract({
  abi: fluxMultiPoolManagerAbi,
  functionName: 'paused',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"pendingPoolRewards"`
 */
export const readFluxMultiPoolManagerPendingPoolRewards =
  /*#__PURE__*/ createReadContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'pendingPoolRewards',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"poolExists"`
 */
export const readFluxMultiPoolManagerPoolExists =
  /*#__PURE__*/ createReadContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'poolExists',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"poolFactory"`
 */
export const readFluxMultiPoolManagerPoolFactory =
  /*#__PURE__*/ createReadContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'poolFactory',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"poolLength"`
 */
export const readFluxMultiPoolManagerPoolLength =
  /*#__PURE__*/ createReadContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'poolLength',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"pools"`
 */
export const readFluxMultiPoolManagerPools = /*#__PURE__*/ createReadContract({
  abi: fluxMultiPoolManagerAbi,
  functionName: 'pools',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"rewardToken"`
 */
export const readFluxMultiPoolManagerRewardToken =
  /*#__PURE__*/ createReadContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'rewardToken',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"supportsInterface"`
 */
export const readFluxMultiPoolManagerSupportsInterface =
  /*#__PURE__*/ createReadContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'supportsInterface',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"totalAllocPoint"`
 */
export const readFluxMultiPoolManagerTotalAllocPoint =
  /*#__PURE__*/ createReadContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'totalAllocPoint',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"totalPendingRewards"`
 */
export const readFluxMultiPoolManagerTotalPendingRewards =
  /*#__PURE__*/ createReadContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'totalPendingRewards',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"treasury"`
 */
export const readFluxMultiPoolManagerTreasury =
  /*#__PURE__*/ createReadContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'treasury',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"undistributedRewards"`
 */
export const readFluxMultiPoolManagerUndistributedRewards =
  /*#__PURE__*/ createReadContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'undistributedRewards',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__
 */
export const writeFluxMultiPoolManager = /*#__PURE__*/ createWriteContract({
  abi: fluxMultiPoolManagerAbi,
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"addPool"`
 */
export const writeFluxMultiPoolManagerAddPool =
  /*#__PURE__*/ createWriteContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'addPool',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"claimPoolRewards"`
 */
export const writeFluxMultiPoolManagerClaimPoolRewards =
  /*#__PURE__*/ createWriteContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'claimPoolRewards',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"deactivatePool"`
 */
export const writeFluxMultiPoolManagerDeactivatePool =
  /*#__PURE__*/ createWriteContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'deactivatePool',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"distributeRewards"`
 */
export const writeFluxMultiPoolManagerDistributeRewards =
  /*#__PURE__*/ createWriteContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'distributeRewards',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"grantRole"`
 */
export const writeFluxMultiPoolManagerGrantRole =
  /*#__PURE__*/ createWriteContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'grantRole',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"pause"`
 */
export const writeFluxMultiPoolManagerPause = /*#__PURE__*/ createWriteContract(
  { abi: fluxMultiPoolManagerAbi, functionName: 'pause' },
)

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"recoverToken"`
 */
export const writeFluxMultiPoolManagerRecoverToken =
  /*#__PURE__*/ createWriteContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'recoverToken',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const writeFluxMultiPoolManagerRenounceOwnership =
  /*#__PURE__*/ createWriteContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"renounceRole"`
 */
export const writeFluxMultiPoolManagerRenounceRole =
  /*#__PURE__*/ createWriteContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'renounceRole',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"revokeRole"`
 */
export const writeFluxMultiPoolManagerRevokeRole =
  /*#__PURE__*/ createWriteContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'revokeRole',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"setOperator"`
 */
export const writeFluxMultiPoolManagerSetOperator =
  /*#__PURE__*/ createWriteContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'setOperator',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"setPool"`
 */
export const writeFluxMultiPoolManagerSetPool =
  /*#__PURE__*/ createWriteContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'setPool',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"setPoolFactory"`
 */
export const writeFluxMultiPoolManagerSetPoolFactory =
  /*#__PURE__*/ createWriteContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'setPoolFactory',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"setTreasury"`
 */
export const writeFluxMultiPoolManagerSetTreasury =
  /*#__PURE__*/ createWriteContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'setTreasury',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const writeFluxMultiPoolManagerTransferOwnership =
  /*#__PURE__*/ createWriteContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"unpause"`
 */
export const writeFluxMultiPoolManagerUnpause =
  /*#__PURE__*/ createWriteContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'unpause',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__
 */
export const simulateFluxMultiPoolManager =
  /*#__PURE__*/ createSimulateContract({ abi: fluxMultiPoolManagerAbi })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"addPool"`
 */
export const simulateFluxMultiPoolManagerAddPool =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'addPool',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"claimPoolRewards"`
 */
export const simulateFluxMultiPoolManagerClaimPoolRewards =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'claimPoolRewards',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"deactivatePool"`
 */
export const simulateFluxMultiPoolManagerDeactivatePool =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'deactivatePool',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"distributeRewards"`
 */
export const simulateFluxMultiPoolManagerDistributeRewards =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'distributeRewards',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"grantRole"`
 */
export const simulateFluxMultiPoolManagerGrantRole =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'grantRole',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"pause"`
 */
export const simulateFluxMultiPoolManagerPause =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'pause',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"recoverToken"`
 */
export const simulateFluxMultiPoolManagerRecoverToken =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'recoverToken',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const simulateFluxMultiPoolManagerRenounceOwnership =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"renounceRole"`
 */
export const simulateFluxMultiPoolManagerRenounceRole =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'renounceRole',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"revokeRole"`
 */
export const simulateFluxMultiPoolManagerRevokeRole =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'revokeRole',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"setOperator"`
 */
export const simulateFluxMultiPoolManagerSetOperator =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'setOperator',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"setPool"`
 */
export const simulateFluxMultiPoolManagerSetPool =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'setPool',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"setPoolFactory"`
 */
export const simulateFluxMultiPoolManagerSetPoolFactory =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'setPoolFactory',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"setTreasury"`
 */
export const simulateFluxMultiPoolManagerSetTreasury =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'setTreasury',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const simulateFluxMultiPoolManagerTransferOwnership =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"unpause"`
 */
export const simulateFluxMultiPoolManagerUnpause =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'unpause',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__
 */
export const watchFluxMultiPoolManagerEvent =
  /*#__PURE__*/ createWatchContractEvent({ abi: fluxMultiPoolManagerAbi })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `eventName` set to `"OperatorUpdated"`
 */
export const watchFluxMultiPoolManagerOperatorUpdatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxMultiPoolManagerAbi,
    eventName: 'OperatorUpdated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `eventName` set to `"OwnershipTransferred"`
 */
export const watchFluxMultiPoolManagerOwnershipTransferredEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxMultiPoolManagerAbi,
    eventName: 'OwnershipTransferred',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `eventName` set to `"Paused"`
 */
export const watchFluxMultiPoolManagerPausedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxMultiPoolManagerAbi,
    eventName: 'Paused',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `eventName` set to `"PoolAdded"`
 */
export const watchFluxMultiPoolManagerPoolAddedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxMultiPoolManagerAbi,
    eventName: 'PoolAdded',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `eventName` set to `"PoolFactoryUpdated"`
 */
export const watchFluxMultiPoolManagerPoolFactoryUpdatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxMultiPoolManagerAbi,
    eventName: 'PoolFactoryUpdated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `eventName` set to `"PoolRewardClaimed"`
 */
export const watchFluxMultiPoolManagerPoolRewardClaimedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxMultiPoolManagerAbi,
    eventName: 'PoolRewardClaimed',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `eventName` set to `"PoolUpdated"`
 */
export const watchFluxMultiPoolManagerPoolUpdatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxMultiPoolManagerAbi,
    eventName: 'PoolUpdated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `eventName` set to `"RewardsDistributed"`
 */
export const watchFluxMultiPoolManagerRewardsDistributedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxMultiPoolManagerAbi,
    eventName: 'RewardsDistributed',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `eventName` set to `"RoleAdminChanged"`
 */
export const watchFluxMultiPoolManagerRoleAdminChangedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxMultiPoolManagerAbi,
    eventName: 'RoleAdminChanged',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `eventName` set to `"RoleGranted"`
 */
export const watchFluxMultiPoolManagerRoleGrantedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxMultiPoolManagerAbi,
    eventName: 'RoleGranted',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `eventName` set to `"RoleRevoked"`
 */
export const watchFluxMultiPoolManagerRoleRevokedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxMultiPoolManagerAbi,
    eventName: 'RoleRevoked',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `eventName` set to `"TokenRecovered"`
 */
export const watchFluxMultiPoolManagerTokenRecoveredEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxMultiPoolManagerAbi,
    eventName: 'TokenRecovered',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `eventName` set to `"TreasuryUpdated"`
 */
export const watchFluxMultiPoolManagerTreasuryUpdatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxMultiPoolManagerAbi,
    eventName: 'TreasuryUpdated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `eventName` set to `"Unpaused"`
 */
export const watchFluxMultiPoolManagerUnpausedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxMultiPoolManagerAbi,
    eventName: 'Unpaused',
  })

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// React
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__
 */
export const useReadFluxMultiPoolManager = /*#__PURE__*/ createUseReadContract({
  abi: fluxMultiPoolManagerAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"DEFAULT_ADMIN_ROLE"`
 */
export const useReadFluxMultiPoolManagerDefaultAdminRole =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'DEFAULT_ADMIN_ROLE',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"OPERATOR_ROLE"`
 */
export const useReadFluxMultiPoolManagerOperatorRole =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'OPERATOR_ROLE',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"PAUSER_ROLE"`
 */
export const useReadFluxMultiPoolManagerPauserRole =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'PAUSER_ROLE',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"accRewardPerAllocStored"`
 */
export const useReadFluxMultiPoolManagerAccRewardPerAllocStored =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'accRewardPerAllocStored',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"getRoleAdmin"`
 */
export const useReadFluxMultiPoolManagerGetRoleAdmin =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'getRoleAdmin',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"hasRole"`
 */
export const useReadFluxMultiPoolManagerHasRole =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'hasRole',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"operator"`
 */
export const useReadFluxMultiPoolManagerOperator =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'operator',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"owner"`
 */
export const useReadFluxMultiPoolManagerOwner =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'owner',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"paused"`
 */
export const useReadFluxMultiPoolManagerPaused =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'paused',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"pendingPoolRewards"`
 */
export const useReadFluxMultiPoolManagerPendingPoolRewards =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'pendingPoolRewards',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"poolExists"`
 */
export const useReadFluxMultiPoolManagerPoolExists =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'poolExists',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"poolFactory"`
 */
export const useReadFluxMultiPoolManagerPoolFactory =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'poolFactory',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"poolLength"`
 */
export const useReadFluxMultiPoolManagerPoolLength =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'poolLength',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"pools"`
 */
export const useReadFluxMultiPoolManagerPools =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'pools',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"rewardToken"`
 */
export const useReadFluxMultiPoolManagerRewardToken =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'rewardToken',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"supportsInterface"`
 */
export const useReadFluxMultiPoolManagerSupportsInterface =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'supportsInterface',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"totalAllocPoint"`
 */
export const useReadFluxMultiPoolManagerTotalAllocPoint =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'totalAllocPoint',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"totalPendingRewards"`
 */
export const useReadFluxMultiPoolManagerTotalPendingRewards =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'totalPendingRewards',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"treasury"`
 */
export const useReadFluxMultiPoolManagerTreasury =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'treasury',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"undistributedRewards"`
 */
export const useReadFluxMultiPoolManagerUndistributedRewards =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'undistributedRewards',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__
 */
export const useWriteFluxMultiPoolManager =
  /*#__PURE__*/ createUseWriteContract({ abi: fluxMultiPoolManagerAbi })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"addPool"`
 */
export const useWriteFluxMultiPoolManagerAddPool =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'addPool',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"claimPoolRewards"`
 */
export const useWriteFluxMultiPoolManagerClaimPoolRewards =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'claimPoolRewards',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"deactivatePool"`
 */
export const useWriteFluxMultiPoolManagerDeactivatePool =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'deactivatePool',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"distributeRewards"`
 */
export const useWriteFluxMultiPoolManagerDistributeRewards =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'distributeRewards',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"grantRole"`
 */
export const useWriteFluxMultiPoolManagerGrantRole =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'grantRole',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"pause"`
 */
export const useWriteFluxMultiPoolManagerPause =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'pause',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"recoverToken"`
 */
export const useWriteFluxMultiPoolManagerRecoverToken =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'recoverToken',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const useWriteFluxMultiPoolManagerRenounceOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"renounceRole"`
 */
export const useWriteFluxMultiPoolManagerRenounceRole =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'renounceRole',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"revokeRole"`
 */
export const useWriteFluxMultiPoolManagerRevokeRole =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'revokeRole',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"setOperator"`
 */
export const useWriteFluxMultiPoolManagerSetOperator =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'setOperator',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"setPool"`
 */
export const useWriteFluxMultiPoolManagerSetPool =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'setPool',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"setPoolFactory"`
 */
export const useWriteFluxMultiPoolManagerSetPoolFactory =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'setPoolFactory',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"setTreasury"`
 */
export const useWriteFluxMultiPoolManagerSetTreasury =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'setTreasury',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useWriteFluxMultiPoolManagerTransferOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"unpause"`
 */
export const useWriteFluxMultiPoolManagerUnpause =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'unpause',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__
 */
export const useSimulateFluxMultiPoolManager =
  /*#__PURE__*/ createUseSimulateContract({ abi: fluxMultiPoolManagerAbi })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"addPool"`
 */
export const useSimulateFluxMultiPoolManagerAddPool =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'addPool',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"claimPoolRewards"`
 */
export const useSimulateFluxMultiPoolManagerClaimPoolRewards =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'claimPoolRewards',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"deactivatePool"`
 */
export const useSimulateFluxMultiPoolManagerDeactivatePool =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'deactivatePool',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"distributeRewards"`
 */
export const useSimulateFluxMultiPoolManagerDistributeRewards =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'distributeRewards',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"grantRole"`
 */
export const useSimulateFluxMultiPoolManagerGrantRole =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'grantRole',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"pause"`
 */
export const useSimulateFluxMultiPoolManagerPause =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'pause',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"recoverToken"`
 */
export const useSimulateFluxMultiPoolManagerRecoverToken =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'recoverToken',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const useSimulateFluxMultiPoolManagerRenounceOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"renounceRole"`
 */
export const useSimulateFluxMultiPoolManagerRenounceRole =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'renounceRole',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"revokeRole"`
 */
export const useSimulateFluxMultiPoolManagerRevokeRole =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'revokeRole',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"setOperator"`
 */
export const useSimulateFluxMultiPoolManagerSetOperator =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'setOperator',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"setPool"`
 */
export const useSimulateFluxMultiPoolManagerSetPool =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'setPool',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"setPoolFactory"`
 */
export const useSimulateFluxMultiPoolManagerSetPoolFactory =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'setPoolFactory',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"setTreasury"`
 */
export const useSimulateFluxMultiPoolManagerSetTreasury =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'setTreasury',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useSimulateFluxMultiPoolManagerTransferOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `functionName` set to `"unpause"`
 */
export const useSimulateFluxMultiPoolManagerUnpause =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxMultiPoolManagerAbi,
    functionName: 'unpause',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__
 */
export const useWatchFluxMultiPoolManagerEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: fluxMultiPoolManagerAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `eventName` set to `"OperatorUpdated"`
 */
export const useWatchFluxMultiPoolManagerOperatorUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxMultiPoolManagerAbi,
    eventName: 'OperatorUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `eventName` set to `"OwnershipTransferred"`
 */
export const useWatchFluxMultiPoolManagerOwnershipTransferredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxMultiPoolManagerAbi,
    eventName: 'OwnershipTransferred',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `eventName` set to `"Paused"`
 */
export const useWatchFluxMultiPoolManagerPausedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxMultiPoolManagerAbi,
    eventName: 'Paused',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `eventName` set to `"PoolAdded"`
 */
export const useWatchFluxMultiPoolManagerPoolAddedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxMultiPoolManagerAbi,
    eventName: 'PoolAdded',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `eventName` set to `"PoolFactoryUpdated"`
 */
export const useWatchFluxMultiPoolManagerPoolFactoryUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxMultiPoolManagerAbi,
    eventName: 'PoolFactoryUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `eventName` set to `"PoolRewardClaimed"`
 */
export const useWatchFluxMultiPoolManagerPoolRewardClaimedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxMultiPoolManagerAbi,
    eventName: 'PoolRewardClaimed',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `eventName` set to `"PoolUpdated"`
 */
export const useWatchFluxMultiPoolManagerPoolUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxMultiPoolManagerAbi,
    eventName: 'PoolUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `eventName` set to `"RewardsDistributed"`
 */
export const useWatchFluxMultiPoolManagerRewardsDistributedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxMultiPoolManagerAbi,
    eventName: 'RewardsDistributed',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `eventName` set to `"RoleAdminChanged"`
 */
export const useWatchFluxMultiPoolManagerRoleAdminChangedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxMultiPoolManagerAbi,
    eventName: 'RoleAdminChanged',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `eventName` set to `"RoleGranted"`
 */
export const useWatchFluxMultiPoolManagerRoleGrantedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxMultiPoolManagerAbi,
    eventName: 'RoleGranted',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `eventName` set to `"RoleRevoked"`
 */
export const useWatchFluxMultiPoolManagerRoleRevokedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxMultiPoolManagerAbi,
    eventName: 'RoleRevoked',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `eventName` set to `"TokenRecovered"`
 */
export const useWatchFluxMultiPoolManagerTokenRecoveredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxMultiPoolManagerAbi,
    eventName: 'TokenRecovered',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `eventName` set to `"TreasuryUpdated"`
 */
export const useWatchFluxMultiPoolManagerTreasuryUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxMultiPoolManagerAbi,
    eventName: 'TreasuryUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxMultiPoolManagerAbi}__ and `eventName` set to `"Unpaused"`
 */
export const useWatchFluxMultiPoolManagerUnpausedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxMultiPoolManagerAbi,
    eventName: 'Unpaused',
  })
