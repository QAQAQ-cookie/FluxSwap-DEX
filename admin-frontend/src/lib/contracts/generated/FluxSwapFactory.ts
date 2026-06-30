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
// FluxSwapFactory
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const fluxSwapFactoryAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: '_treasurySetter', internalType: 'address', type: 'address' },
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
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'token0',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'token1',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'pair',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
      { name: '', internalType: 'uint256', type: 'uint256', indexed: false },
    ],
    name: 'PairCreated',
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
        name: 'treasurySetter',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'TreasurySetterUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'treasury',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'TreasuryUpdated',
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
    name: 'TREASURY_SETTER_ROLE',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    name: 'allPairs',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'allPairsLength',
    outputs: [{ name: 'length', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'tokenA', internalType: 'address', type: 'address' },
      { name: 'tokenB', internalType: 'address', type: 'address' },
    ],
    name: 'createPair',
    outputs: [{ name: 'pair', internalType: 'address', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: '', internalType: 'address', type: 'address' },
      { name: '', internalType: 'address', type: 'address' },
    ],
    name: 'getPair',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
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
    inputs: [{ name: '_treasury', internalType: 'address', type: 'address' }],
    name: 'setTreasury',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: '_treasurySetter', internalType: 'address', type: 'address' },
    ],
    name: 'setTreasurySetter',
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
    name: 'treasury',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'treasurySetter',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Action
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__
 */
export const readFluxSwapFactory = /*#__PURE__*/ createReadContract({
  abi: fluxSwapFactoryAbi,
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"DEFAULT_ADMIN_ROLE"`
 */
export const readFluxSwapFactoryDefaultAdminRole =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapFactoryAbi,
    functionName: 'DEFAULT_ADMIN_ROLE',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"TREASURY_SETTER_ROLE"`
 */
export const readFluxSwapFactoryTreasurySetterRole =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapFactoryAbi,
    functionName: 'TREASURY_SETTER_ROLE',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"allPairs"`
 */
export const readFluxSwapFactoryAllPairs = /*#__PURE__*/ createReadContract({
  abi: fluxSwapFactoryAbi,
  functionName: 'allPairs',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"allPairsLength"`
 */
export const readFluxSwapFactoryAllPairsLength =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapFactoryAbi,
    functionName: 'allPairsLength',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"getPair"`
 */
export const readFluxSwapFactoryGetPair = /*#__PURE__*/ createReadContract({
  abi: fluxSwapFactoryAbi,
  functionName: 'getPair',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"getRoleAdmin"`
 */
export const readFluxSwapFactoryGetRoleAdmin = /*#__PURE__*/ createReadContract(
  { abi: fluxSwapFactoryAbi, functionName: 'getRoleAdmin' },
)

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"hasRole"`
 */
export const readFluxSwapFactoryHasRole = /*#__PURE__*/ createReadContract({
  abi: fluxSwapFactoryAbi,
  functionName: 'hasRole',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"supportsInterface"`
 */
export const readFluxSwapFactorySupportsInterface =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapFactoryAbi,
    functionName: 'supportsInterface',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"treasury"`
 */
export const readFluxSwapFactoryTreasury = /*#__PURE__*/ createReadContract({
  abi: fluxSwapFactoryAbi,
  functionName: 'treasury',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"treasurySetter"`
 */
export const readFluxSwapFactoryTreasurySetter =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapFactoryAbi,
    functionName: 'treasurySetter',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__
 */
export const writeFluxSwapFactory = /*#__PURE__*/ createWriteContract({
  abi: fluxSwapFactoryAbi,
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"createPair"`
 */
export const writeFluxSwapFactoryCreatePair = /*#__PURE__*/ createWriteContract(
  { abi: fluxSwapFactoryAbi, functionName: 'createPair' },
)

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"grantRole"`
 */
export const writeFluxSwapFactoryGrantRole = /*#__PURE__*/ createWriteContract({
  abi: fluxSwapFactoryAbi,
  functionName: 'grantRole',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"renounceRole"`
 */
export const writeFluxSwapFactoryRenounceRole =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapFactoryAbi,
    functionName: 'renounceRole',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"revokeRole"`
 */
export const writeFluxSwapFactoryRevokeRole = /*#__PURE__*/ createWriteContract(
  { abi: fluxSwapFactoryAbi, functionName: 'revokeRole' },
)

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"setTreasury"`
 */
export const writeFluxSwapFactorySetTreasury =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapFactoryAbi,
    functionName: 'setTreasury',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"setTreasurySetter"`
 */
export const writeFluxSwapFactorySetTreasurySetter =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapFactoryAbi,
    functionName: 'setTreasurySetter',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__
 */
export const simulateFluxSwapFactory = /*#__PURE__*/ createSimulateContract({
  abi: fluxSwapFactoryAbi,
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"createPair"`
 */
export const simulateFluxSwapFactoryCreatePair =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapFactoryAbi,
    functionName: 'createPair',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"grantRole"`
 */
export const simulateFluxSwapFactoryGrantRole =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapFactoryAbi,
    functionName: 'grantRole',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"renounceRole"`
 */
export const simulateFluxSwapFactoryRenounceRole =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapFactoryAbi,
    functionName: 'renounceRole',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"revokeRole"`
 */
export const simulateFluxSwapFactoryRevokeRole =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapFactoryAbi,
    functionName: 'revokeRole',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"setTreasury"`
 */
export const simulateFluxSwapFactorySetTreasury =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapFactoryAbi,
    functionName: 'setTreasury',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"setTreasurySetter"`
 */
export const simulateFluxSwapFactorySetTreasurySetter =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapFactoryAbi,
    functionName: 'setTreasurySetter',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapFactoryAbi}__
 */
export const watchFluxSwapFactoryEvent = /*#__PURE__*/ createWatchContractEvent(
  { abi: fluxSwapFactoryAbi },
)

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `eventName` set to `"PairCreated"`
 */
export const watchFluxSwapFactoryPairCreatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapFactoryAbi,
    eventName: 'PairCreated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `eventName` set to `"RoleAdminChanged"`
 */
export const watchFluxSwapFactoryRoleAdminChangedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapFactoryAbi,
    eventName: 'RoleAdminChanged',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `eventName` set to `"RoleGranted"`
 */
export const watchFluxSwapFactoryRoleGrantedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapFactoryAbi,
    eventName: 'RoleGranted',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `eventName` set to `"RoleRevoked"`
 */
export const watchFluxSwapFactoryRoleRevokedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapFactoryAbi,
    eventName: 'RoleRevoked',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `eventName` set to `"TreasurySetterUpdated"`
 */
export const watchFluxSwapFactoryTreasurySetterUpdatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapFactoryAbi,
    eventName: 'TreasurySetterUpdated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `eventName` set to `"TreasuryUpdated"`
 */
export const watchFluxSwapFactoryTreasuryUpdatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapFactoryAbi,
    eventName: 'TreasuryUpdated',
  })

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// React
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__
 */
export const useReadFluxSwapFactory = /*#__PURE__*/ createUseReadContract({
  abi: fluxSwapFactoryAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"DEFAULT_ADMIN_ROLE"`
 */
export const useReadFluxSwapFactoryDefaultAdminRole =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapFactoryAbi,
    functionName: 'DEFAULT_ADMIN_ROLE',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"TREASURY_SETTER_ROLE"`
 */
export const useReadFluxSwapFactoryTreasurySetterRole =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapFactoryAbi,
    functionName: 'TREASURY_SETTER_ROLE',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"allPairs"`
 */
export const useReadFluxSwapFactoryAllPairs =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapFactoryAbi,
    functionName: 'allPairs',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"allPairsLength"`
 */
export const useReadFluxSwapFactoryAllPairsLength =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapFactoryAbi,
    functionName: 'allPairsLength',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"getPair"`
 */
export const useReadFluxSwapFactoryGetPair =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapFactoryAbi,
    functionName: 'getPair',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"getRoleAdmin"`
 */
export const useReadFluxSwapFactoryGetRoleAdmin =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapFactoryAbi,
    functionName: 'getRoleAdmin',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"hasRole"`
 */
export const useReadFluxSwapFactoryHasRole =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapFactoryAbi,
    functionName: 'hasRole',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"supportsInterface"`
 */
export const useReadFluxSwapFactorySupportsInterface =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapFactoryAbi,
    functionName: 'supportsInterface',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"treasury"`
 */
export const useReadFluxSwapFactoryTreasury =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapFactoryAbi,
    functionName: 'treasury',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"treasurySetter"`
 */
export const useReadFluxSwapFactoryTreasurySetter =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapFactoryAbi,
    functionName: 'treasurySetter',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__
 */
export const useWriteFluxSwapFactory = /*#__PURE__*/ createUseWriteContract({
  abi: fluxSwapFactoryAbi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"createPair"`
 */
export const useWriteFluxSwapFactoryCreatePair =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapFactoryAbi,
    functionName: 'createPair',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"grantRole"`
 */
export const useWriteFluxSwapFactoryGrantRole =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapFactoryAbi,
    functionName: 'grantRole',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"renounceRole"`
 */
export const useWriteFluxSwapFactoryRenounceRole =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapFactoryAbi,
    functionName: 'renounceRole',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"revokeRole"`
 */
export const useWriteFluxSwapFactoryRevokeRole =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapFactoryAbi,
    functionName: 'revokeRole',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"setTreasury"`
 */
export const useWriteFluxSwapFactorySetTreasury =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapFactoryAbi,
    functionName: 'setTreasury',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"setTreasurySetter"`
 */
export const useWriteFluxSwapFactorySetTreasurySetter =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapFactoryAbi,
    functionName: 'setTreasurySetter',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__
 */
export const useSimulateFluxSwapFactory =
  /*#__PURE__*/ createUseSimulateContract({ abi: fluxSwapFactoryAbi })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"createPair"`
 */
export const useSimulateFluxSwapFactoryCreatePair =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapFactoryAbi,
    functionName: 'createPair',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"grantRole"`
 */
export const useSimulateFluxSwapFactoryGrantRole =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapFactoryAbi,
    functionName: 'grantRole',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"renounceRole"`
 */
export const useSimulateFluxSwapFactoryRenounceRole =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapFactoryAbi,
    functionName: 'renounceRole',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"revokeRole"`
 */
export const useSimulateFluxSwapFactoryRevokeRole =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapFactoryAbi,
    functionName: 'revokeRole',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"setTreasury"`
 */
export const useSimulateFluxSwapFactorySetTreasury =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapFactoryAbi,
    functionName: 'setTreasury',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `functionName` set to `"setTreasurySetter"`
 */
export const useSimulateFluxSwapFactorySetTreasurySetter =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapFactoryAbi,
    functionName: 'setTreasurySetter',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapFactoryAbi}__
 */
export const useWatchFluxSwapFactoryEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: fluxSwapFactoryAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `eventName` set to `"PairCreated"`
 */
export const useWatchFluxSwapFactoryPairCreatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapFactoryAbi,
    eventName: 'PairCreated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `eventName` set to `"RoleAdminChanged"`
 */
export const useWatchFluxSwapFactoryRoleAdminChangedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapFactoryAbi,
    eventName: 'RoleAdminChanged',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `eventName` set to `"RoleGranted"`
 */
export const useWatchFluxSwapFactoryRoleGrantedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapFactoryAbi,
    eventName: 'RoleGranted',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `eventName` set to `"RoleRevoked"`
 */
export const useWatchFluxSwapFactoryRoleRevokedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapFactoryAbi,
    eventName: 'RoleRevoked',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `eventName` set to `"TreasurySetterUpdated"`
 */
export const useWatchFluxSwapFactoryTreasurySetterUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapFactoryAbi,
    eventName: 'TreasurySetterUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapFactoryAbi}__ and `eventName` set to `"TreasuryUpdated"`
 */
export const useWatchFluxSwapFactoryTreasuryUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapFactoryAbi,
    eventName: 'TreasuryUpdated',
  })
