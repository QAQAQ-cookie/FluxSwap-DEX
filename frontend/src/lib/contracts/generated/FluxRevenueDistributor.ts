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
// FluxRevenueDistributor
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const fluxRevenueDistributorAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: '_owner', internalType: 'address', type: 'address' },
      { name: '_operator', internalType: 'address', type: 'address' },
      { name: '_buybackExecutor', internalType: 'address', type: 'address' },
      { name: '_manager', internalType: 'address', type: 'address' },
      { name: '_buybackBps', internalType: 'uint256', type: 'uint256' },
      { name: '_burnBps', internalType: 'uint256', type: 'uint256' },
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
        name: 'previousExecutor',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newExecutor',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'BuybackExecutorUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousManager',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newManager',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'ManagerUpdated',
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
      {
        name: 'spendToken',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'revenueAmount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'buybackAmountIn',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'buybackAmountOut',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'burnedAmount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'distributedAmount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'executor',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'RevenueBuybackAndDistributionExecuted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousBuybackBps',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'newBuybackBps',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'previousBurnBps',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'newBurnBps',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'RevenueConfigurationUpdated',
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
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'executor',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'TreasuryRewardsDistributed',
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
    name: 'burnBps',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'buybackBps',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'buybackExecutor',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'amount', internalType: 'uint256', type: 'uint256' }],
    name: 'distributeTreasuryRewards',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'spendToken', internalType: 'address', type: 'address' },
      { name: 'revenueAmount', internalType: 'uint256', type: 'uint256' },
      { name: 'amountOutMin', internalType: 'uint256', type: 'uint256' },
      { name: 'path', internalType: 'address[]', type: 'address[]' },
      { name: 'deadline', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'executeBuybackAndDistribute',
    outputs: [{ name: 'amountOut', internalType: 'uint256', type: 'uint256' }],
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
    name: 'manager',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
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
    inputs: [
      { name: 'newBuybackExecutor', internalType: 'address', type: 'address' },
    ],
    name: 'setBuybackExecutor',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'newManager', internalType: 'address', type: 'address' }],
    name: 'setManager',
    outputs: [],
    stateMutability: 'nonpayable',
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
      { name: 'newBuybackBps', internalType: 'uint256', type: 'uint256' },
      { name: 'newBurnBps', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'setRevenueConfiguration',
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
    inputs: [{ name: 'newOwner', internalType: 'address', type: 'address' }],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
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
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__
 */
export const readFluxRevenueDistributor = /*#__PURE__*/ createReadContract({
  abi: fluxRevenueDistributorAbi,
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"DEFAULT_ADMIN_ROLE"`
 */
export const readFluxRevenueDistributorDefaultAdminRole =
  /*#__PURE__*/ createReadContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'DEFAULT_ADMIN_ROLE',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"OPERATOR_ROLE"`
 */
export const readFluxRevenueDistributorOperatorRole =
  /*#__PURE__*/ createReadContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'OPERATOR_ROLE',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"PAUSER_ROLE"`
 */
export const readFluxRevenueDistributorPauserRole =
  /*#__PURE__*/ createReadContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'PAUSER_ROLE',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"burnBps"`
 */
export const readFluxRevenueDistributorBurnBps =
  /*#__PURE__*/ createReadContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'burnBps',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"buybackBps"`
 */
export const readFluxRevenueDistributorBuybackBps =
  /*#__PURE__*/ createReadContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'buybackBps',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"buybackExecutor"`
 */
export const readFluxRevenueDistributorBuybackExecutor =
  /*#__PURE__*/ createReadContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'buybackExecutor',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"getRoleAdmin"`
 */
export const readFluxRevenueDistributorGetRoleAdmin =
  /*#__PURE__*/ createReadContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'getRoleAdmin',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"hasRole"`
 */
export const readFluxRevenueDistributorHasRole =
  /*#__PURE__*/ createReadContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'hasRole',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"manager"`
 */
export const readFluxRevenueDistributorManager =
  /*#__PURE__*/ createReadContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'manager',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"operator"`
 */
export const readFluxRevenueDistributorOperator =
  /*#__PURE__*/ createReadContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'operator',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"owner"`
 */
export const readFluxRevenueDistributorOwner = /*#__PURE__*/ createReadContract(
  { abi: fluxRevenueDistributorAbi, functionName: 'owner' },
)

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"paused"`
 */
export const readFluxRevenueDistributorPaused =
  /*#__PURE__*/ createReadContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'paused',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"rewardToken"`
 */
export const readFluxRevenueDistributorRewardToken =
  /*#__PURE__*/ createReadContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'rewardToken',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"supportsInterface"`
 */
export const readFluxRevenueDistributorSupportsInterface =
  /*#__PURE__*/ createReadContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'supportsInterface',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__
 */
export const writeFluxRevenueDistributor = /*#__PURE__*/ createWriteContract({
  abi: fluxRevenueDistributorAbi,
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"distributeTreasuryRewards"`
 */
export const writeFluxRevenueDistributorDistributeTreasuryRewards =
  /*#__PURE__*/ createWriteContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'distributeTreasuryRewards',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"executeBuybackAndDistribute"`
 */
export const writeFluxRevenueDistributorExecuteBuybackAndDistribute =
  /*#__PURE__*/ createWriteContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'executeBuybackAndDistribute',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"grantRole"`
 */
export const writeFluxRevenueDistributorGrantRole =
  /*#__PURE__*/ createWriteContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'grantRole',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"pause"`
 */
export const writeFluxRevenueDistributorPause =
  /*#__PURE__*/ createWriteContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'pause',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"recoverToken"`
 */
export const writeFluxRevenueDistributorRecoverToken =
  /*#__PURE__*/ createWriteContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'recoverToken',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const writeFluxRevenueDistributorRenounceOwnership =
  /*#__PURE__*/ createWriteContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"renounceRole"`
 */
export const writeFluxRevenueDistributorRenounceRole =
  /*#__PURE__*/ createWriteContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'renounceRole',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"revokeRole"`
 */
export const writeFluxRevenueDistributorRevokeRole =
  /*#__PURE__*/ createWriteContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'revokeRole',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"setBuybackExecutor"`
 */
export const writeFluxRevenueDistributorSetBuybackExecutor =
  /*#__PURE__*/ createWriteContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'setBuybackExecutor',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"setManager"`
 */
export const writeFluxRevenueDistributorSetManager =
  /*#__PURE__*/ createWriteContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'setManager',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"setOperator"`
 */
export const writeFluxRevenueDistributorSetOperator =
  /*#__PURE__*/ createWriteContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'setOperator',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"setRevenueConfiguration"`
 */
export const writeFluxRevenueDistributorSetRevenueConfiguration =
  /*#__PURE__*/ createWriteContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'setRevenueConfiguration',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const writeFluxRevenueDistributorTransferOwnership =
  /*#__PURE__*/ createWriteContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"unpause"`
 */
export const writeFluxRevenueDistributorUnpause =
  /*#__PURE__*/ createWriteContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'unpause',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__
 */
export const simulateFluxRevenueDistributor =
  /*#__PURE__*/ createSimulateContract({ abi: fluxRevenueDistributorAbi })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"distributeTreasuryRewards"`
 */
export const simulateFluxRevenueDistributorDistributeTreasuryRewards =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'distributeTreasuryRewards',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"executeBuybackAndDistribute"`
 */
export const simulateFluxRevenueDistributorExecuteBuybackAndDistribute =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'executeBuybackAndDistribute',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"grantRole"`
 */
export const simulateFluxRevenueDistributorGrantRole =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'grantRole',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"pause"`
 */
export const simulateFluxRevenueDistributorPause =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'pause',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"recoverToken"`
 */
export const simulateFluxRevenueDistributorRecoverToken =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'recoverToken',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const simulateFluxRevenueDistributorRenounceOwnership =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"renounceRole"`
 */
export const simulateFluxRevenueDistributorRenounceRole =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'renounceRole',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"revokeRole"`
 */
export const simulateFluxRevenueDistributorRevokeRole =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'revokeRole',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"setBuybackExecutor"`
 */
export const simulateFluxRevenueDistributorSetBuybackExecutor =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'setBuybackExecutor',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"setManager"`
 */
export const simulateFluxRevenueDistributorSetManager =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'setManager',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"setOperator"`
 */
export const simulateFluxRevenueDistributorSetOperator =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'setOperator',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"setRevenueConfiguration"`
 */
export const simulateFluxRevenueDistributorSetRevenueConfiguration =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'setRevenueConfiguration',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const simulateFluxRevenueDistributorTransferOwnership =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"unpause"`
 */
export const simulateFluxRevenueDistributorUnpause =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'unpause',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__
 */
export const watchFluxRevenueDistributorEvent =
  /*#__PURE__*/ createWatchContractEvent({ abi: fluxRevenueDistributorAbi })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `eventName` set to `"BuybackExecutorUpdated"`
 */
export const watchFluxRevenueDistributorBuybackExecutorUpdatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxRevenueDistributorAbi,
    eventName: 'BuybackExecutorUpdated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `eventName` set to `"ManagerUpdated"`
 */
export const watchFluxRevenueDistributorManagerUpdatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxRevenueDistributorAbi,
    eventName: 'ManagerUpdated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `eventName` set to `"OperatorUpdated"`
 */
export const watchFluxRevenueDistributorOperatorUpdatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxRevenueDistributorAbi,
    eventName: 'OperatorUpdated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `eventName` set to `"OwnershipTransferred"`
 */
export const watchFluxRevenueDistributorOwnershipTransferredEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxRevenueDistributorAbi,
    eventName: 'OwnershipTransferred',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `eventName` set to `"Paused"`
 */
export const watchFluxRevenueDistributorPausedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxRevenueDistributorAbi,
    eventName: 'Paused',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `eventName` set to `"RevenueBuybackAndDistributionExecuted"`
 */
export const watchFluxRevenueDistributorRevenueBuybackAndDistributionExecutedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxRevenueDistributorAbi,
    eventName: 'RevenueBuybackAndDistributionExecuted',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `eventName` set to `"RevenueConfigurationUpdated"`
 */
export const watchFluxRevenueDistributorRevenueConfigurationUpdatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxRevenueDistributorAbi,
    eventName: 'RevenueConfigurationUpdated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `eventName` set to `"RoleAdminChanged"`
 */
export const watchFluxRevenueDistributorRoleAdminChangedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxRevenueDistributorAbi,
    eventName: 'RoleAdminChanged',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `eventName` set to `"RoleGranted"`
 */
export const watchFluxRevenueDistributorRoleGrantedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxRevenueDistributorAbi,
    eventName: 'RoleGranted',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `eventName` set to `"RoleRevoked"`
 */
export const watchFluxRevenueDistributorRoleRevokedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxRevenueDistributorAbi,
    eventName: 'RoleRevoked',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `eventName` set to `"TokenRecovered"`
 */
export const watchFluxRevenueDistributorTokenRecoveredEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxRevenueDistributorAbi,
    eventName: 'TokenRecovered',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `eventName` set to `"TreasuryRewardsDistributed"`
 */
export const watchFluxRevenueDistributorTreasuryRewardsDistributedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxRevenueDistributorAbi,
    eventName: 'TreasuryRewardsDistributed',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `eventName` set to `"Unpaused"`
 */
export const watchFluxRevenueDistributorUnpausedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxRevenueDistributorAbi,
    eventName: 'Unpaused',
  })

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// React
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__
 */
export const useReadFluxRevenueDistributor =
  /*#__PURE__*/ createUseReadContract({ abi: fluxRevenueDistributorAbi })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"DEFAULT_ADMIN_ROLE"`
 */
export const useReadFluxRevenueDistributorDefaultAdminRole =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'DEFAULT_ADMIN_ROLE',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"OPERATOR_ROLE"`
 */
export const useReadFluxRevenueDistributorOperatorRole =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'OPERATOR_ROLE',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"PAUSER_ROLE"`
 */
export const useReadFluxRevenueDistributorPauserRole =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'PAUSER_ROLE',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"burnBps"`
 */
export const useReadFluxRevenueDistributorBurnBps =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'burnBps',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"buybackBps"`
 */
export const useReadFluxRevenueDistributorBuybackBps =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'buybackBps',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"buybackExecutor"`
 */
export const useReadFluxRevenueDistributorBuybackExecutor =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'buybackExecutor',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"getRoleAdmin"`
 */
export const useReadFluxRevenueDistributorGetRoleAdmin =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'getRoleAdmin',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"hasRole"`
 */
export const useReadFluxRevenueDistributorHasRole =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'hasRole',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"manager"`
 */
export const useReadFluxRevenueDistributorManager =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'manager',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"operator"`
 */
export const useReadFluxRevenueDistributorOperator =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'operator',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"owner"`
 */
export const useReadFluxRevenueDistributorOwner =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'owner',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"paused"`
 */
export const useReadFluxRevenueDistributorPaused =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'paused',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"rewardToken"`
 */
export const useReadFluxRevenueDistributorRewardToken =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'rewardToken',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"supportsInterface"`
 */
export const useReadFluxRevenueDistributorSupportsInterface =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'supportsInterface',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__
 */
export const useWriteFluxRevenueDistributor =
  /*#__PURE__*/ createUseWriteContract({ abi: fluxRevenueDistributorAbi })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"distributeTreasuryRewards"`
 */
export const useWriteFluxRevenueDistributorDistributeTreasuryRewards =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'distributeTreasuryRewards',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"executeBuybackAndDistribute"`
 */
export const useWriteFluxRevenueDistributorExecuteBuybackAndDistribute =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'executeBuybackAndDistribute',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"grantRole"`
 */
export const useWriteFluxRevenueDistributorGrantRole =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'grantRole',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"pause"`
 */
export const useWriteFluxRevenueDistributorPause =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'pause',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"recoverToken"`
 */
export const useWriteFluxRevenueDistributorRecoverToken =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'recoverToken',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const useWriteFluxRevenueDistributorRenounceOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"renounceRole"`
 */
export const useWriteFluxRevenueDistributorRenounceRole =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'renounceRole',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"revokeRole"`
 */
export const useWriteFluxRevenueDistributorRevokeRole =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'revokeRole',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"setBuybackExecutor"`
 */
export const useWriteFluxRevenueDistributorSetBuybackExecutor =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'setBuybackExecutor',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"setManager"`
 */
export const useWriteFluxRevenueDistributorSetManager =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'setManager',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"setOperator"`
 */
export const useWriteFluxRevenueDistributorSetOperator =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'setOperator',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"setRevenueConfiguration"`
 */
export const useWriteFluxRevenueDistributorSetRevenueConfiguration =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'setRevenueConfiguration',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useWriteFluxRevenueDistributorTransferOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"unpause"`
 */
export const useWriteFluxRevenueDistributorUnpause =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'unpause',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__
 */
export const useSimulateFluxRevenueDistributor =
  /*#__PURE__*/ createUseSimulateContract({ abi: fluxRevenueDistributorAbi })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"distributeTreasuryRewards"`
 */
export const useSimulateFluxRevenueDistributorDistributeTreasuryRewards =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'distributeTreasuryRewards',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"executeBuybackAndDistribute"`
 */
export const useSimulateFluxRevenueDistributorExecuteBuybackAndDistribute =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'executeBuybackAndDistribute',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"grantRole"`
 */
export const useSimulateFluxRevenueDistributorGrantRole =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'grantRole',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"pause"`
 */
export const useSimulateFluxRevenueDistributorPause =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'pause',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"recoverToken"`
 */
export const useSimulateFluxRevenueDistributorRecoverToken =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'recoverToken',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const useSimulateFluxRevenueDistributorRenounceOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"renounceRole"`
 */
export const useSimulateFluxRevenueDistributorRenounceRole =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'renounceRole',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"revokeRole"`
 */
export const useSimulateFluxRevenueDistributorRevokeRole =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'revokeRole',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"setBuybackExecutor"`
 */
export const useSimulateFluxRevenueDistributorSetBuybackExecutor =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'setBuybackExecutor',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"setManager"`
 */
export const useSimulateFluxRevenueDistributorSetManager =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'setManager',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"setOperator"`
 */
export const useSimulateFluxRevenueDistributorSetOperator =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'setOperator',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"setRevenueConfiguration"`
 */
export const useSimulateFluxRevenueDistributorSetRevenueConfiguration =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'setRevenueConfiguration',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useSimulateFluxRevenueDistributorTransferOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `functionName` set to `"unpause"`
 */
export const useSimulateFluxRevenueDistributorUnpause =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxRevenueDistributorAbi,
    functionName: 'unpause',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__
 */
export const useWatchFluxRevenueDistributorEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: fluxRevenueDistributorAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `eventName` set to `"BuybackExecutorUpdated"`
 */
export const useWatchFluxRevenueDistributorBuybackExecutorUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxRevenueDistributorAbi,
    eventName: 'BuybackExecutorUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `eventName` set to `"ManagerUpdated"`
 */
export const useWatchFluxRevenueDistributorManagerUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxRevenueDistributorAbi,
    eventName: 'ManagerUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `eventName` set to `"OperatorUpdated"`
 */
export const useWatchFluxRevenueDistributorOperatorUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxRevenueDistributorAbi,
    eventName: 'OperatorUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `eventName` set to `"OwnershipTransferred"`
 */
export const useWatchFluxRevenueDistributorOwnershipTransferredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxRevenueDistributorAbi,
    eventName: 'OwnershipTransferred',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `eventName` set to `"Paused"`
 */
export const useWatchFluxRevenueDistributorPausedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxRevenueDistributorAbi,
    eventName: 'Paused',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `eventName` set to `"RevenueBuybackAndDistributionExecuted"`
 */
export const useWatchFluxRevenueDistributorRevenueBuybackAndDistributionExecutedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxRevenueDistributorAbi,
    eventName: 'RevenueBuybackAndDistributionExecuted',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `eventName` set to `"RevenueConfigurationUpdated"`
 */
export const useWatchFluxRevenueDistributorRevenueConfigurationUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxRevenueDistributorAbi,
    eventName: 'RevenueConfigurationUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `eventName` set to `"RoleAdminChanged"`
 */
export const useWatchFluxRevenueDistributorRoleAdminChangedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxRevenueDistributorAbi,
    eventName: 'RoleAdminChanged',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `eventName` set to `"RoleGranted"`
 */
export const useWatchFluxRevenueDistributorRoleGrantedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxRevenueDistributorAbi,
    eventName: 'RoleGranted',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `eventName` set to `"RoleRevoked"`
 */
export const useWatchFluxRevenueDistributorRoleRevokedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxRevenueDistributorAbi,
    eventName: 'RoleRevoked',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `eventName` set to `"TokenRecovered"`
 */
export const useWatchFluxRevenueDistributorTokenRecoveredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxRevenueDistributorAbi,
    eventName: 'TokenRecovered',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `eventName` set to `"TreasuryRewardsDistributed"`
 */
export const useWatchFluxRevenueDistributorTreasuryRewardsDistributedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxRevenueDistributorAbi,
    eventName: 'TreasuryRewardsDistributed',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxRevenueDistributorAbi}__ and `eventName` set to `"Unpaused"`
 */
export const useWatchFluxRevenueDistributorUnpausedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxRevenueDistributorAbi,
    eventName: 'Unpaused',
  })
