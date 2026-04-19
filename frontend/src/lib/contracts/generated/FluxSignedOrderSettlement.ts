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
// FluxSignedOrderSettlement
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const fluxSignedOrderSettlementAbi = [
  {
    type: 'constructor',
    inputs: [{ name: 'router_', internalType: 'address', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  { type: 'error', inputs: [], name: 'ECDSAInvalidSignature' },
  {
    type: 'error',
    inputs: [{ name: 'length', internalType: 'uint256', type: 'uint256' }],
    name: 'ECDSAInvalidSignatureLength',
  },
  {
    type: 'error',
    inputs: [{ name: 's', internalType: 'bytes32', type: 'bytes32' }],
    name: 'ECDSAInvalidSignatureS',
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
  { type: 'error', inputs: [], name: 'ReentrancyGuardReentrantCall' },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'restricted',
        internalType: 'bool',
        type: 'bool',
        indexed: false,
      },
      {
        name: 'executor',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'ExecutorPolicyUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'maker',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'nonce',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'NonceInvalidated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'orderHash',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'maker',
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
      {
        name: 'inputToken',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
      {
        name: 'outputToken',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
      {
        name: 'amountIn',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'grossAmountOut',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'recipientAmountOut',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'executorFeeAmount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'recipient',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
    ],
    name: 'OrderExecuted',
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
    name: 'DOMAIN_SEPARATOR',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'WETH',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'order',
        internalType: 'struct IFluxSignedOrderSettlement.SignedOrder',
        type: 'tuple',
        components: [
          { name: 'maker', internalType: 'address', type: 'address' },
          { name: 'inputToken', internalType: 'address', type: 'address' },
          { name: 'outputToken', internalType: 'address', type: 'address' },
          { name: 'amountIn', internalType: 'uint256', type: 'uint256' },
          { name: 'minAmountOut', internalType: 'uint256', type: 'uint256' },
          {
            name: 'maxExecutorRewardBps',
            internalType: 'uint256',
            type: 'uint256',
          },
          { name: 'triggerPriceX18', internalType: 'uint256', type: 'uint256' },
          { name: 'expiry', internalType: 'uint256', type: 'uint256' },
          { name: 'nonce', internalType: 'uint256', type: 'uint256' },
          { name: 'recipient', internalType: 'address', type: 'address' },
        ],
      },
    ],
    name: 'canExecuteOrder',
    outputs: [
      { name: 'executable', internalType: 'bool', type: 'bool' },
      { name: 'reason', internalType: 'string', type: 'string' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'order',
        internalType: 'struct IFluxSignedOrderSettlement.SignedOrder',
        type: 'tuple',
        components: [
          { name: 'maker', internalType: 'address', type: 'address' },
          { name: 'inputToken', internalType: 'address', type: 'address' },
          { name: 'outputToken', internalType: 'address', type: 'address' },
          { name: 'amountIn', internalType: 'uint256', type: 'uint256' },
          { name: 'minAmountOut', internalType: 'uint256', type: 'uint256' },
          {
            name: 'maxExecutorRewardBps',
            internalType: 'uint256',
            type: 'uint256',
          },
          { name: 'triggerPriceX18', internalType: 'uint256', type: 'uint256' },
          { name: 'expiry', internalType: 'uint256', type: 'uint256' },
          { name: 'nonce', internalType: 'uint256', type: 'uint256' },
          { name: 'recipient', internalType: 'address', type: 'address' },
        ],
      },
      { name: 'signature', internalType: 'bytes', type: 'bytes' },
      { name: 'deadline', internalType: 'uint256', type: 'uint256' },
      { name: 'executorReward', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'executeOrder',
    outputs: [{ name: 'amountOut', internalType: 'uint256', type: 'uint256' }],
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
    inputs: [
      {
        name: 'order',
        internalType: 'struct IFluxSignedOrderSettlement.SignedOrder',
        type: 'tuple',
        components: [
          { name: 'maker', internalType: 'address', type: 'address' },
          { name: 'inputToken', internalType: 'address', type: 'address' },
          { name: 'outputToken', internalType: 'address', type: 'address' },
          { name: 'amountIn', internalType: 'uint256', type: 'uint256' },
          { name: 'minAmountOut', internalType: 'uint256', type: 'uint256' },
          {
            name: 'maxExecutorRewardBps',
            internalType: 'uint256',
            type: 'uint256',
          },
          { name: 'triggerPriceX18', internalType: 'uint256', type: 'uint256' },
          { name: 'expiry', internalType: 'uint256', type: 'uint256' },
          { name: 'nonce', internalType: 'uint256', type: 'uint256' },
          { name: 'recipient', internalType: 'address', type: 'address' },
        ],
      },
    ],
    name: 'getOrderQuote',
    outputs: [{ name: 'amountOut', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'order',
        internalType: 'struct IFluxSignedOrderSettlement.SignedOrder',
        type: 'tuple',
        components: [
          { name: 'maker', internalType: 'address', type: 'address' },
          { name: 'inputToken', internalType: 'address', type: 'address' },
          { name: 'outputToken', internalType: 'address', type: 'address' },
          { name: 'amountIn', internalType: 'uint256', type: 'uint256' },
          { name: 'minAmountOut', internalType: 'uint256', type: 'uint256' },
          {
            name: 'maxExecutorRewardBps',
            internalType: 'uint256',
            type: 'uint256',
          },
          { name: 'triggerPriceX18', internalType: 'uint256', type: 'uint256' },
          { name: 'expiry', internalType: 'uint256', type: 'uint256' },
          { name: 'nonce', internalType: 'uint256', type: 'uint256' },
          { name: 'recipient', internalType: 'address', type: 'address' },
        ],
      },
    ],
    name: 'hashOrder',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [
      { name: 'maker', internalType: 'address', type: 'address' },
      { name: 'nonces', internalType: 'uint256[]', type: 'uint256[]' },
      { name: 'deadline', internalType: 'uint256', type: 'uint256' },
      { name: 'signature', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'invalidateNoncesBySig',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: '', internalType: 'address', type: 'address' },
      { name: '', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'invalidatedNonce',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'onlyRestrictedExecutor',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    name: 'orderExecuted',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
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
    inputs: [],
    name: 'renounceOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'restrictedExecutor',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
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
    inputs: [{ name: 'restricted', internalType: 'bool', type: 'bool' }],
    name: 'setExecutorRestriction',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'executor', internalType: 'address', type: 'address' }],
    name: 'setRestrictedExecutor',
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
  {
    type: 'function',
    inputs: [],
    name: 'unpause',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  { type: 'receive', stateMutability: 'payable' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Action
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__
 */
export const readFluxSignedOrderSettlement = /*#__PURE__*/ createReadContract({
  abi: fluxSignedOrderSettlementAbi,
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"DOMAIN_SEPARATOR"`
 */
export const readFluxSignedOrderSettlementDomainSeparator =
  /*#__PURE__*/ createReadContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'DOMAIN_SEPARATOR',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"WETH"`
 */
export const readFluxSignedOrderSettlementWeth =
  /*#__PURE__*/ createReadContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'WETH',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"canExecuteOrder"`
 */
export const readFluxSignedOrderSettlementCanExecuteOrder =
  /*#__PURE__*/ createReadContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'canExecuteOrder',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"factory"`
 */
export const readFluxSignedOrderSettlementFactory =
  /*#__PURE__*/ createReadContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'factory',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"getOrderQuote"`
 */
export const readFluxSignedOrderSettlementGetOrderQuote =
  /*#__PURE__*/ createReadContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'getOrderQuote',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"hashOrder"`
 */
export const readFluxSignedOrderSettlementHashOrder =
  /*#__PURE__*/ createReadContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'hashOrder',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"invalidatedNonce"`
 */
export const readFluxSignedOrderSettlementInvalidatedNonce =
  /*#__PURE__*/ createReadContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'invalidatedNonce',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"onlyRestrictedExecutor"`
 */
export const readFluxSignedOrderSettlementOnlyRestrictedExecutor =
  /*#__PURE__*/ createReadContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'onlyRestrictedExecutor',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"orderExecuted"`
 */
export const readFluxSignedOrderSettlementOrderExecuted =
  /*#__PURE__*/ createReadContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'orderExecuted',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"owner"`
 */
export const readFluxSignedOrderSettlementOwner =
  /*#__PURE__*/ createReadContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'owner',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"paused"`
 */
export const readFluxSignedOrderSettlementPaused =
  /*#__PURE__*/ createReadContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'paused',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"restrictedExecutor"`
 */
export const readFluxSignedOrderSettlementRestrictedExecutor =
  /*#__PURE__*/ createReadContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'restrictedExecutor',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"router"`
 */
export const readFluxSignedOrderSettlementRouter =
  /*#__PURE__*/ createReadContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'router',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__
 */
export const writeFluxSignedOrderSettlement = /*#__PURE__*/ createWriteContract(
  { abi: fluxSignedOrderSettlementAbi },
)

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"executeOrder"`
 */
export const writeFluxSignedOrderSettlementExecuteOrder =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'executeOrder',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"invalidateNoncesBySig"`
 */
export const writeFluxSignedOrderSettlementInvalidateNoncesBySig =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'invalidateNoncesBySig',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"pause"`
 */
export const writeFluxSignedOrderSettlementPause =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'pause',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const writeFluxSignedOrderSettlementRenounceOwnership =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"setExecutorRestriction"`
 */
export const writeFluxSignedOrderSettlementSetExecutorRestriction =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'setExecutorRestriction',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"setRestrictedExecutor"`
 */
export const writeFluxSignedOrderSettlementSetRestrictedExecutor =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'setRestrictedExecutor',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const writeFluxSignedOrderSettlementTransferOwnership =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"unpause"`
 */
export const writeFluxSignedOrderSettlementUnpause =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'unpause',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__
 */
export const simulateFluxSignedOrderSettlement =
  /*#__PURE__*/ createSimulateContract({ abi: fluxSignedOrderSettlementAbi })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"executeOrder"`
 */
export const simulateFluxSignedOrderSettlementExecuteOrder =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'executeOrder',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"invalidateNoncesBySig"`
 */
export const simulateFluxSignedOrderSettlementInvalidateNoncesBySig =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'invalidateNoncesBySig',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"pause"`
 */
export const simulateFluxSignedOrderSettlementPause =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'pause',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const simulateFluxSignedOrderSettlementRenounceOwnership =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"setExecutorRestriction"`
 */
export const simulateFluxSignedOrderSettlementSetExecutorRestriction =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'setExecutorRestriction',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"setRestrictedExecutor"`
 */
export const simulateFluxSignedOrderSettlementSetRestrictedExecutor =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'setRestrictedExecutor',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const simulateFluxSignedOrderSettlementTransferOwnership =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"unpause"`
 */
export const simulateFluxSignedOrderSettlementUnpause =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'unpause',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__
 */
export const watchFluxSignedOrderSettlementEvent =
  /*#__PURE__*/ createWatchContractEvent({ abi: fluxSignedOrderSettlementAbi })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `eventName` set to `"ExecutorPolicyUpdated"`
 */
export const watchFluxSignedOrderSettlementExecutorPolicyUpdatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSignedOrderSettlementAbi,
    eventName: 'ExecutorPolicyUpdated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `eventName` set to `"NonceInvalidated"`
 */
export const watchFluxSignedOrderSettlementNonceInvalidatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSignedOrderSettlementAbi,
    eventName: 'NonceInvalidated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `eventName` set to `"OrderExecuted"`
 */
export const watchFluxSignedOrderSettlementOrderExecutedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSignedOrderSettlementAbi,
    eventName: 'OrderExecuted',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `eventName` set to `"OwnershipTransferred"`
 */
export const watchFluxSignedOrderSettlementOwnershipTransferredEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSignedOrderSettlementAbi,
    eventName: 'OwnershipTransferred',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `eventName` set to `"Paused"`
 */
export const watchFluxSignedOrderSettlementPausedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSignedOrderSettlementAbi,
    eventName: 'Paused',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `eventName` set to `"Unpaused"`
 */
export const watchFluxSignedOrderSettlementUnpausedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSignedOrderSettlementAbi,
    eventName: 'Unpaused',
  })

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// React
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__
 */
export const useReadFluxSignedOrderSettlement =
  /*#__PURE__*/ createUseReadContract({ abi: fluxSignedOrderSettlementAbi })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"DOMAIN_SEPARATOR"`
 */
export const useReadFluxSignedOrderSettlementDomainSeparator =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'DOMAIN_SEPARATOR',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"WETH"`
 */
export const useReadFluxSignedOrderSettlementWeth =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'WETH',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"canExecuteOrder"`
 */
export const useReadFluxSignedOrderSettlementCanExecuteOrder =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'canExecuteOrder',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"factory"`
 */
export const useReadFluxSignedOrderSettlementFactory =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'factory',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"getOrderQuote"`
 */
export const useReadFluxSignedOrderSettlementGetOrderQuote =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'getOrderQuote',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"hashOrder"`
 */
export const useReadFluxSignedOrderSettlementHashOrder =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'hashOrder',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"invalidatedNonce"`
 */
export const useReadFluxSignedOrderSettlementInvalidatedNonce =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'invalidatedNonce',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"onlyRestrictedExecutor"`
 */
export const useReadFluxSignedOrderSettlementOnlyRestrictedExecutor =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'onlyRestrictedExecutor',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"orderExecuted"`
 */
export const useReadFluxSignedOrderSettlementOrderExecuted =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'orderExecuted',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"owner"`
 */
export const useReadFluxSignedOrderSettlementOwner =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'owner',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"paused"`
 */
export const useReadFluxSignedOrderSettlementPaused =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'paused',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"restrictedExecutor"`
 */
export const useReadFluxSignedOrderSettlementRestrictedExecutor =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'restrictedExecutor',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"router"`
 */
export const useReadFluxSignedOrderSettlementRouter =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'router',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__
 */
export const useWriteFluxSignedOrderSettlement =
  /*#__PURE__*/ createUseWriteContract({ abi: fluxSignedOrderSettlementAbi })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"executeOrder"`
 */
export const useWriteFluxSignedOrderSettlementExecuteOrder =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'executeOrder',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"invalidateNoncesBySig"`
 */
export const useWriteFluxSignedOrderSettlementInvalidateNoncesBySig =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'invalidateNoncesBySig',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"pause"`
 */
export const useWriteFluxSignedOrderSettlementPause =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'pause',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const useWriteFluxSignedOrderSettlementRenounceOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"setExecutorRestriction"`
 */
export const useWriteFluxSignedOrderSettlementSetExecutorRestriction =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'setExecutorRestriction',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"setRestrictedExecutor"`
 */
export const useWriteFluxSignedOrderSettlementSetRestrictedExecutor =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'setRestrictedExecutor',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useWriteFluxSignedOrderSettlementTransferOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"unpause"`
 */
export const useWriteFluxSignedOrderSettlementUnpause =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'unpause',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__
 */
export const useSimulateFluxSignedOrderSettlement =
  /*#__PURE__*/ createUseSimulateContract({ abi: fluxSignedOrderSettlementAbi })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"executeOrder"`
 */
export const useSimulateFluxSignedOrderSettlementExecuteOrder =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'executeOrder',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"invalidateNoncesBySig"`
 */
export const useSimulateFluxSignedOrderSettlementInvalidateNoncesBySig =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'invalidateNoncesBySig',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"pause"`
 */
export const useSimulateFluxSignedOrderSettlementPause =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'pause',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const useSimulateFluxSignedOrderSettlementRenounceOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"setExecutorRestriction"`
 */
export const useSimulateFluxSignedOrderSettlementSetExecutorRestriction =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'setExecutorRestriction',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"setRestrictedExecutor"`
 */
export const useSimulateFluxSignedOrderSettlementSetRestrictedExecutor =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'setRestrictedExecutor',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useSimulateFluxSignedOrderSettlementTransferOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `functionName` set to `"unpause"`
 */
export const useSimulateFluxSignedOrderSettlementUnpause =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSignedOrderSettlementAbi,
    functionName: 'unpause',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__
 */
export const useWatchFluxSignedOrderSettlementEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSignedOrderSettlementAbi,
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `eventName` set to `"ExecutorPolicyUpdated"`
 */
export const useWatchFluxSignedOrderSettlementExecutorPolicyUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSignedOrderSettlementAbi,
    eventName: 'ExecutorPolicyUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `eventName` set to `"NonceInvalidated"`
 */
export const useWatchFluxSignedOrderSettlementNonceInvalidatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSignedOrderSettlementAbi,
    eventName: 'NonceInvalidated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `eventName` set to `"OrderExecuted"`
 */
export const useWatchFluxSignedOrderSettlementOrderExecutedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSignedOrderSettlementAbi,
    eventName: 'OrderExecuted',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `eventName` set to `"OwnershipTransferred"`
 */
export const useWatchFluxSignedOrderSettlementOwnershipTransferredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSignedOrderSettlementAbi,
    eventName: 'OwnershipTransferred',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `eventName` set to `"Paused"`
 */
export const useWatchFluxSignedOrderSettlementPausedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSignedOrderSettlementAbi,
    eventName: 'Paused',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSignedOrderSettlementAbi}__ and `eventName` set to `"Unpaused"`
 */
export const useWatchFluxSignedOrderSettlementUnpausedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSignedOrderSettlementAbi,
    eventName: 'Unpaused',
  })
