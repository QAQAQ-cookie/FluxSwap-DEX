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
// FluxBuybackExecutor
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const fluxBuybackExecutorAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: '_owner', internalType: 'address', type: 'address' },
      { name: '_treasury', internalType: 'address', type: 'address' },
      { name: '_operator', internalType: 'address', type: 'address' },
      { name: '_router', internalType: 'address', type: 'address' },
      { name: '_buyToken', internalType: 'address', type: 'address' },
      { name: '_defaultRecipient', internalType: 'address', type: 'address' },
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
    inputs: [{ name: 'recipient', internalType: 'address', type: 'address' }],
    name: 'InvalidRecipient',
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
        name: 'spendToken',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amountIn',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'amountOut',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'recipient',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'executor',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'BuybackExecuted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousRecipient',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newRecipient',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'DefaultRecipientUpdated',
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
    name: 'buyToken',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'defaultRecipient',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'spendToken', internalType: 'address', type: 'address' },
      { name: 'amountIn', internalType: 'uint256', type: 'uint256' },
      { name: 'amountOutMin', internalType: 'uint256', type: 'uint256' },
      { name: 'path', internalType: 'address[]', type: 'address[]' },
      { name: 'recipient', internalType: 'address', type: 'address' },
      { name: 'deadline', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'executeBuyback',
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
    name: 'router',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'newDefaultRecipient', internalType: 'address', type: 'address' },
    ],
    name: 'setDefaultRecipient',
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
    name: 'unpause',
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Action
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__
 */
export const readFluxBuybackExecutor = /*#__PURE__*/ createReadContract({
  abi: fluxBuybackExecutorAbi,
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"DEFAULT_ADMIN_ROLE"`
 */
export const readFluxBuybackExecutorDefaultAdminRole =
  /*#__PURE__*/ createReadContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'DEFAULT_ADMIN_ROLE',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"OPERATOR_ROLE"`
 */
export const readFluxBuybackExecutorOperatorRole =
  /*#__PURE__*/ createReadContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'OPERATOR_ROLE',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"PAUSER_ROLE"`
 */
export const readFluxBuybackExecutorPauserRole =
  /*#__PURE__*/ createReadContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'PAUSER_ROLE',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"buyToken"`
 */
export const readFluxBuybackExecutorBuyToken = /*#__PURE__*/ createReadContract(
  { abi: fluxBuybackExecutorAbi, functionName: 'buyToken' },
)

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"defaultRecipient"`
 */
export const readFluxBuybackExecutorDefaultRecipient =
  /*#__PURE__*/ createReadContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'defaultRecipient',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"getRoleAdmin"`
 */
export const readFluxBuybackExecutorGetRoleAdmin =
  /*#__PURE__*/ createReadContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'getRoleAdmin',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"hasRole"`
 */
export const readFluxBuybackExecutorHasRole = /*#__PURE__*/ createReadContract({
  abi: fluxBuybackExecutorAbi,
  functionName: 'hasRole',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"operator"`
 */
export const readFluxBuybackExecutorOperator = /*#__PURE__*/ createReadContract(
  { abi: fluxBuybackExecutorAbi, functionName: 'operator' },
)

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"owner"`
 */
export const readFluxBuybackExecutorOwner = /*#__PURE__*/ createReadContract({
  abi: fluxBuybackExecutorAbi,
  functionName: 'owner',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"paused"`
 */
export const readFluxBuybackExecutorPaused = /*#__PURE__*/ createReadContract({
  abi: fluxBuybackExecutorAbi,
  functionName: 'paused',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"router"`
 */
export const readFluxBuybackExecutorRouter = /*#__PURE__*/ createReadContract({
  abi: fluxBuybackExecutorAbi,
  functionName: 'router',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"supportsInterface"`
 */
export const readFluxBuybackExecutorSupportsInterface =
  /*#__PURE__*/ createReadContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'supportsInterface',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"treasury"`
 */
export const readFluxBuybackExecutorTreasury = /*#__PURE__*/ createReadContract(
  { abi: fluxBuybackExecutorAbi, functionName: 'treasury' },
)

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__
 */
export const writeFluxBuybackExecutor = /*#__PURE__*/ createWriteContract({
  abi: fluxBuybackExecutorAbi,
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"executeBuyback"`
 */
export const writeFluxBuybackExecutorExecuteBuyback =
  /*#__PURE__*/ createWriteContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'executeBuyback',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"grantRole"`
 */
export const writeFluxBuybackExecutorGrantRole =
  /*#__PURE__*/ createWriteContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'grantRole',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"pause"`
 */
export const writeFluxBuybackExecutorPause = /*#__PURE__*/ createWriteContract({
  abi: fluxBuybackExecutorAbi,
  functionName: 'pause',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"recoverToken"`
 */
export const writeFluxBuybackExecutorRecoverToken =
  /*#__PURE__*/ createWriteContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'recoverToken',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const writeFluxBuybackExecutorRenounceOwnership =
  /*#__PURE__*/ createWriteContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"renounceRole"`
 */
export const writeFluxBuybackExecutorRenounceRole =
  /*#__PURE__*/ createWriteContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'renounceRole',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"revokeRole"`
 */
export const writeFluxBuybackExecutorRevokeRole =
  /*#__PURE__*/ createWriteContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'revokeRole',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"setDefaultRecipient"`
 */
export const writeFluxBuybackExecutorSetDefaultRecipient =
  /*#__PURE__*/ createWriteContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'setDefaultRecipient',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"setOperator"`
 */
export const writeFluxBuybackExecutorSetOperator =
  /*#__PURE__*/ createWriteContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'setOperator',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"setTreasury"`
 */
export const writeFluxBuybackExecutorSetTreasury =
  /*#__PURE__*/ createWriteContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'setTreasury',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const writeFluxBuybackExecutorTransferOwnership =
  /*#__PURE__*/ createWriteContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"unpause"`
 */
export const writeFluxBuybackExecutorUnpause =
  /*#__PURE__*/ createWriteContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'unpause',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__
 */
export const simulateFluxBuybackExecutor = /*#__PURE__*/ createSimulateContract(
  { abi: fluxBuybackExecutorAbi },
)

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"executeBuyback"`
 */
export const simulateFluxBuybackExecutorExecuteBuyback =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'executeBuyback',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"grantRole"`
 */
export const simulateFluxBuybackExecutorGrantRole =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'grantRole',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"pause"`
 */
export const simulateFluxBuybackExecutorPause =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'pause',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"recoverToken"`
 */
export const simulateFluxBuybackExecutorRecoverToken =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'recoverToken',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const simulateFluxBuybackExecutorRenounceOwnership =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"renounceRole"`
 */
export const simulateFluxBuybackExecutorRenounceRole =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'renounceRole',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"revokeRole"`
 */
export const simulateFluxBuybackExecutorRevokeRole =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'revokeRole',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"setDefaultRecipient"`
 */
export const simulateFluxBuybackExecutorSetDefaultRecipient =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'setDefaultRecipient',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"setOperator"`
 */
export const simulateFluxBuybackExecutorSetOperator =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'setOperator',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"setTreasury"`
 */
export const simulateFluxBuybackExecutorSetTreasury =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'setTreasury',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const simulateFluxBuybackExecutorTransferOwnership =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"unpause"`
 */
export const simulateFluxBuybackExecutorUnpause =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'unpause',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__
 */
export const watchFluxBuybackExecutorEvent =
  /*#__PURE__*/ createWatchContractEvent({ abi: fluxBuybackExecutorAbi })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `eventName` set to `"BuybackExecuted"`
 */
export const watchFluxBuybackExecutorBuybackExecutedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxBuybackExecutorAbi,
    eventName: 'BuybackExecuted',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `eventName` set to `"DefaultRecipientUpdated"`
 */
export const watchFluxBuybackExecutorDefaultRecipientUpdatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxBuybackExecutorAbi,
    eventName: 'DefaultRecipientUpdated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `eventName` set to `"OperatorUpdated"`
 */
export const watchFluxBuybackExecutorOperatorUpdatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxBuybackExecutorAbi,
    eventName: 'OperatorUpdated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `eventName` set to `"OwnershipTransferred"`
 */
export const watchFluxBuybackExecutorOwnershipTransferredEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxBuybackExecutorAbi,
    eventName: 'OwnershipTransferred',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `eventName` set to `"Paused"`
 */
export const watchFluxBuybackExecutorPausedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxBuybackExecutorAbi,
    eventName: 'Paused',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `eventName` set to `"RoleAdminChanged"`
 */
export const watchFluxBuybackExecutorRoleAdminChangedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxBuybackExecutorAbi,
    eventName: 'RoleAdminChanged',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `eventName` set to `"RoleGranted"`
 */
export const watchFluxBuybackExecutorRoleGrantedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxBuybackExecutorAbi,
    eventName: 'RoleGranted',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `eventName` set to `"RoleRevoked"`
 */
export const watchFluxBuybackExecutorRoleRevokedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxBuybackExecutorAbi,
    eventName: 'RoleRevoked',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `eventName` set to `"TokenRecovered"`
 */
export const watchFluxBuybackExecutorTokenRecoveredEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxBuybackExecutorAbi,
    eventName: 'TokenRecovered',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `eventName` set to `"TreasuryUpdated"`
 */
export const watchFluxBuybackExecutorTreasuryUpdatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxBuybackExecutorAbi,
    eventName: 'TreasuryUpdated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `eventName` set to `"Unpaused"`
 */
export const watchFluxBuybackExecutorUnpausedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxBuybackExecutorAbi,
    eventName: 'Unpaused',
  })

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// React
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__
 */
export const useReadFluxBuybackExecutor = /*#__PURE__*/ createUseReadContract({
  abi: fluxBuybackExecutorAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"DEFAULT_ADMIN_ROLE"`
 */
export const useReadFluxBuybackExecutorDefaultAdminRole =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'DEFAULT_ADMIN_ROLE',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"OPERATOR_ROLE"`
 */
export const useReadFluxBuybackExecutorOperatorRole =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'OPERATOR_ROLE',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"PAUSER_ROLE"`
 */
export const useReadFluxBuybackExecutorPauserRole =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'PAUSER_ROLE',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"buyToken"`
 */
export const useReadFluxBuybackExecutorBuyToken =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'buyToken',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"defaultRecipient"`
 */
export const useReadFluxBuybackExecutorDefaultRecipient =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'defaultRecipient',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"getRoleAdmin"`
 */
export const useReadFluxBuybackExecutorGetRoleAdmin =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'getRoleAdmin',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"hasRole"`
 */
export const useReadFluxBuybackExecutorHasRole =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'hasRole',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"operator"`
 */
export const useReadFluxBuybackExecutorOperator =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'operator',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"owner"`
 */
export const useReadFluxBuybackExecutorOwner =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'owner',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"paused"`
 */
export const useReadFluxBuybackExecutorPaused =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'paused',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"router"`
 */
export const useReadFluxBuybackExecutorRouter =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'router',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"supportsInterface"`
 */
export const useReadFluxBuybackExecutorSupportsInterface =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'supportsInterface',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"treasury"`
 */
export const useReadFluxBuybackExecutorTreasury =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'treasury',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__
 */
export const useWriteFluxBuybackExecutor = /*#__PURE__*/ createUseWriteContract(
  { abi: fluxBuybackExecutorAbi },
)

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"executeBuyback"`
 */
export const useWriteFluxBuybackExecutorExecuteBuyback =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'executeBuyback',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"grantRole"`
 */
export const useWriteFluxBuybackExecutorGrantRole =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'grantRole',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"pause"`
 */
export const useWriteFluxBuybackExecutorPause =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'pause',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"recoverToken"`
 */
export const useWriteFluxBuybackExecutorRecoverToken =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'recoverToken',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const useWriteFluxBuybackExecutorRenounceOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"renounceRole"`
 */
export const useWriteFluxBuybackExecutorRenounceRole =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'renounceRole',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"revokeRole"`
 */
export const useWriteFluxBuybackExecutorRevokeRole =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'revokeRole',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"setDefaultRecipient"`
 */
export const useWriteFluxBuybackExecutorSetDefaultRecipient =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'setDefaultRecipient',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"setOperator"`
 */
export const useWriteFluxBuybackExecutorSetOperator =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'setOperator',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"setTreasury"`
 */
export const useWriteFluxBuybackExecutorSetTreasury =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'setTreasury',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useWriteFluxBuybackExecutorTransferOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"unpause"`
 */
export const useWriteFluxBuybackExecutorUnpause =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'unpause',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__
 */
export const useSimulateFluxBuybackExecutor =
  /*#__PURE__*/ createUseSimulateContract({ abi: fluxBuybackExecutorAbi })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"executeBuyback"`
 */
export const useSimulateFluxBuybackExecutorExecuteBuyback =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'executeBuyback',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"grantRole"`
 */
export const useSimulateFluxBuybackExecutorGrantRole =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'grantRole',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"pause"`
 */
export const useSimulateFluxBuybackExecutorPause =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'pause',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"recoverToken"`
 */
export const useSimulateFluxBuybackExecutorRecoverToken =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'recoverToken',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const useSimulateFluxBuybackExecutorRenounceOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"renounceRole"`
 */
export const useSimulateFluxBuybackExecutorRenounceRole =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'renounceRole',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"revokeRole"`
 */
export const useSimulateFluxBuybackExecutorRevokeRole =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'revokeRole',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"setDefaultRecipient"`
 */
export const useSimulateFluxBuybackExecutorSetDefaultRecipient =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'setDefaultRecipient',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"setOperator"`
 */
export const useSimulateFluxBuybackExecutorSetOperator =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'setOperator',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"setTreasury"`
 */
export const useSimulateFluxBuybackExecutorSetTreasury =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'setTreasury',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useSimulateFluxBuybackExecutorTransferOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `functionName` set to `"unpause"`
 */
export const useSimulateFluxBuybackExecutorUnpause =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxBuybackExecutorAbi,
    functionName: 'unpause',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__
 */
export const useWatchFluxBuybackExecutorEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: fluxBuybackExecutorAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `eventName` set to `"BuybackExecuted"`
 */
export const useWatchFluxBuybackExecutorBuybackExecutedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxBuybackExecutorAbi,
    eventName: 'BuybackExecuted',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `eventName` set to `"DefaultRecipientUpdated"`
 */
export const useWatchFluxBuybackExecutorDefaultRecipientUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxBuybackExecutorAbi,
    eventName: 'DefaultRecipientUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `eventName` set to `"OperatorUpdated"`
 */
export const useWatchFluxBuybackExecutorOperatorUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxBuybackExecutorAbi,
    eventName: 'OperatorUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `eventName` set to `"OwnershipTransferred"`
 */
export const useWatchFluxBuybackExecutorOwnershipTransferredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxBuybackExecutorAbi,
    eventName: 'OwnershipTransferred',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `eventName` set to `"Paused"`
 */
export const useWatchFluxBuybackExecutorPausedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxBuybackExecutorAbi,
    eventName: 'Paused',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `eventName` set to `"RoleAdminChanged"`
 */
export const useWatchFluxBuybackExecutorRoleAdminChangedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxBuybackExecutorAbi,
    eventName: 'RoleAdminChanged',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `eventName` set to `"RoleGranted"`
 */
export const useWatchFluxBuybackExecutorRoleGrantedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxBuybackExecutorAbi,
    eventName: 'RoleGranted',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `eventName` set to `"RoleRevoked"`
 */
export const useWatchFluxBuybackExecutorRoleRevokedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxBuybackExecutorAbi,
    eventName: 'RoleRevoked',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `eventName` set to `"TokenRecovered"`
 */
export const useWatchFluxBuybackExecutorTokenRecoveredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxBuybackExecutorAbi,
    eventName: 'TokenRecovered',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `eventName` set to `"TreasuryUpdated"`
 */
export const useWatchFluxBuybackExecutorTreasuryUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxBuybackExecutorAbi,
    eventName: 'TreasuryUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxBuybackExecutorAbi}__ and `eventName` set to `"Unpaused"`
 */
export const useWatchFluxBuybackExecutorUnpausedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxBuybackExecutorAbi,
    eventName: 'Unpaused',
  })
