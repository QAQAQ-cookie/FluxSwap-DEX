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
// FluxSwapPair
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const fluxSwapPairAbi = [
  { type: 'constructor', inputs: [], stateMutability: 'nonpayable' },
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
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'owner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'spender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'value',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Approval',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'sender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amount0',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'amount1',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      { name: 'to', internalType: 'address', type: 'address', indexed: true },
    ],
    name: 'Burn',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'sender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amount0',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'amount1',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Mint',
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
      {
        name: 'amount0',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'amount1',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'ProtocolFeePaid',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'sender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amount0In',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'amount1In',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'amount0Out',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'amount1Out',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      { name: 'to', internalType: 'address', type: 'address', indexed: true },
    ],
    name: 'Swap',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'reserve0',
        internalType: 'uint112',
        type: 'uint112',
        indexed: false,
      },
      {
        name: 'reserve1',
        internalType: 'uint112',
        type: 'uint112',
        indexed: false,
      },
    ],
    name: 'Sync',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'from', internalType: 'address', type: 'address', indexed: true },
      { name: 'to', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'value',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Transfer',
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
    name: 'MINIMUM_LIQUIDITY',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'PERMIT_TYPEHASH',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: '', internalType: 'address', type: 'address' },
      { name: '', internalType: 'address', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'spender', internalType: 'address', type: 'address' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: 'success', internalType: 'bool', type: 'bool' }],
    stateMutability: 'nonpayable',
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
    inputs: [{ name: 'to', internalType: 'address', type: 'address' }],
    name: 'burn',
    outputs: [
      { name: 'amount0', internalType: 'uint256', type: 'uint256' },
      { name: 'amount1', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', internalType: 'uint8', type: 'uint8' }],
    stateMutability: 'view',
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
    name: 'getReserves',
    outputs: [
      { name: '_reserve0', internalType: 'uint112', type: 'uint112' },
      { name: '_reserve1', internalType: 'uint112', type: 'uint112' },
      { name: '_blockTimestampLast', internalType: 'uint32', type: 'uint32' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: '_token0', internalType: 'address', type: 'address' },
      { name: '_token1', internalType: 'address', type: 'address' },
    ],
    name: 'initialize',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'to', internalType: 'address', type: 'address' }],
    name: 'mint',
    outputs: [{ name: 'liquidity', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'name',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'address', type: 'address' }],
    name: 'nonces',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'owner', internalType: 'address', type: 'address' },
      { name: 'spender', internalType: 'address', type: 'address' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
      { name: 'deadline', internalType: 'uint256', type: 'uint256' },
      { name: 'v', internalType: 'uint8', type: 'uint8' },
      { name: 'r', internalType: 'bytes32', type: 'bytes32' },
      { name: 's', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'permit',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'price0CumulativeLast',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'price1CumulativeLast',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'to', internalType: 'address', type: 'address' }],
    name: 'skim',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'amount0Out', internalType: 'uint256', type: 'uint256' },
      { name: 'amount1Out', internalType: 'uint256', type: 'uint256' },
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'data', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'swap',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'sync',
    outputs: [],
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
    name: 'totalSupply',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: 'success', internalType: 'bool', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'from', internalType: 'address', type: 'address' },
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'transferFrom',
    outputs: [{ name: 'success', internalType: 'bool', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Action
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapPairAbi}__
 */
export const readFluxSwapPair = /*#__PURE__*/ createReadContract({
  abi: fluxSwapPairAbi,
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"DOMAIN_SEPARATOR"`
 */
export const readFluxSwapPairDomainSeparator = /*#__PURE__*/ createReadContract(
  { abi: fluxSwapPairAbi, functionName: 'DOMAIN_SEPARATOR' },
)

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"MINIMUM_LIQUIDITY"`
 */
export const readFluxSwapPairMinimumLiquidity =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapPairAbi,
    functionName: 'MINIMUM_LIQUIDITY',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"PERMIT_TYPEHASH"`
 */
export const readFluxSwapPairPermitTypehash = /*#__PURE__*/ createReadContract({
  abi: fluxSwapPairAbi,
  functionName: 'PERMIT_TYPEHASH',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"allowance"`
 */
export const readFluxSwapPairAllowance = /*#__PURE__*/ createReadContract({
  abi: fluxSwapPairAbi,
  functionName: 'allowance',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"balanceOf"`
 */
export const readFluxSwapPairBalanceOf = /*#__PURE__*/ createReadContract({
  abi: fluxSwapPairAbi,
  functionName: 'balanceOf',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"decimals"`
 */
export const readFluxSwapPairDecimals = /*#__PURE__*/ createReadContract({
  abi: fluxSwapPairAbi,
  functionName: 'decimals',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"factory"`
 */
export const readFluxSwapPairFactory = /*#__PURE__*/ createReadContract({
  abi: fluxSwapPairAbi,
  functionName: 'factory',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"getReserves"`
 */
export const readFluxSwapPairGetReserves = /*#__PURE__*/ createReadContract({
  abi: fluxSwapPairAbi,
  functionName: 'getReserves',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"name"`
 */
export const readFluxSwapPairName = /*#__PURE__*/ createReadContract({
  abi: fluxSwapPairAbi,
  functionName: 'name',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"nonces"`
 */
export const readFluxSwapPairNonces = /*#__PURE__*/ createReadContract({
  abi: fluxSwapPairAbi,
  functionName: 'nonces',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"price0CumulativeLast"`
 */
export const readFluxSwapPairPrice0CumulativeLast =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapPairAbi,
    functionName: 'price0CumulativeLast',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"price1CumulativeLast"`
 */
export const readFluxSwapPairPrice1CumulativeLast =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapPairAbi,
    functionName: 'price1CumulativeLast',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"symbol"`
 */
export const readFluxSwapPairSymbol = /*#__PURE__*/ createReadContract({
  abi: fluxSwapPairAbi,
  functionName: 'symbol',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"token0"`
 */
export const readFluxSwapPairToken0 = /*#__PURE__*/ createReadContract({
  abi: fluxSwapPairAbi,
  functionName: 'token0',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"token1"`
 */
export const readFluxSwapPairToken1 = /*#__PURE__*/ createReadContract({
  abi: fluxSwapPairAbi,
  functionName: 'token1',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"totalSupply"`
 */
export const readFluxSwapPairTotalSupply = /*#__PURE__*/ createReadContract({
  abi: fluxSwapPairAbi,
  functionName: 'totalSupply',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapPairAbi}__
 */
export const writeFluxSwapPair = /*#__PURE__*/ createWriteContract({
  abi: fluxSwapPairAbi,
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"approve"`
 */
export const writeFluxSwapPairApprove = /*#__PURE__*/ createWriteContract({
  abi: fluxSwapPairAbi,
  functionName: 'approve',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"burn"`
 */
export const writeFluxSwapPairBurn = /*#__PURE__*/ createWriteContract({
  abi: fluxSwapPairAbi,
  functionName: 'burn',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"initialize"`
 */
export const writeFluxSwapPairInitialize = /*#__PURE__*/ createWriteContract({
  abi: fluxSwapPairAbi,
  functionName: 'initialize',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"mint"`
 */
export const writeFluxSwapPairMint = /*#__PURE__*/ createWriteContract({
  abi: fluxSwapPairAbi,
  functionName: 'mint',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"permit"`
 */
export const writeFluxSwapPairPermit = /*#__PURE__*/ createWriteContract({
  abi: fluxSwapPairAbi,
  functionName: 'permit',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"skim"`
 */
export const writeFluxSwapPairSkim = /*#__PURE__*/ createWriteContract({
  abi: fluxSwapPairAbi,
  functionName: 'skim',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"swap"`
 */
export const writeFluxSwapPairSwap = /*#__PURE__*/ createWriteContract({
  abi: fluxSwapPairAbi,
  functionName: 'swap',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"sync"`
 */
export const writeFluxSwapPairSync = /*#__PURE__*/ createWriteContract({
  abi: fluxSwapPairAbi,
  functionName: 'sync',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"transfer"`
 */
export const writeFluxSwapPairTransfer = /*#__PURE__*/ createWriteContract({
  abi: fluxSwapPairAbi,
  functionName: 'transfer',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"transferFrom"`
 */
export const writeFluxSwapPairTransferFrom = /*#__PURE__*/ createWriteContract({
  abi: fluxSwapPairAbi,
  functionName: 'transferFrom',
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapPairAbi}__
 */
export const simulateFluxSwapPair = /*#__PURE__*/ createSimulateContract({
  abi: fluxSwapPairAbi,
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"approve"`
 */
export const simulateFluxSwapPairApprove = /*#__PURE__*/ createSimulateContract(
  { abi: fluxSwapPairAbi, functionName: 'approve' },
)

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"burn"`
 */
export const simulateFluxSwapPairBurn = /*#__PURE__*/ createSimulateContract({
  abi: fluxSwapPairAbi,
  functionName: 'burn',
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"initialize"`
 */
export const simulateFluxSwapPairInitialize =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapPairAbi,
    functionName: 'initialize',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"mint"`
 */
export const simulateFluxSwapPairMint = /*#__PURE__*/ createSimulateContract({
  abi: fluxSwapPairAbi,
  functionName: 'mint',
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"permit"`
 */
export const simulateFluxSwapPairPermit = /*#__PURE__*/ createSimulateContract({
  abi: fluxSwapPairAbi,
  functionName: 'permit',
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"skim"`
 */
export const simulateFluxSwapPairSkim = /*#__PURE__*/ createSimulateContract({
  abi: fluxSwapPairAbi,
  functionName: 'skim',
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"swap"`
 */
export const simulateFluxSwapPairSwap = /*#__PURE__*/ createSimulateContract({
  abi: fluxSwapPairAbi,
  functionName: 'swap',
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"sync"`
 */
export const simulateFluxSwapPairSync = /*#__PURE__*/ createSimulateContract({
  abi: fluxSwapPairAbi,
  functionName: 'sync',
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"transfer"`
 */
export const simulateFluxSwapPairTransfer =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapPairAbi,
    functionName: 'transfer',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"transferFrom"`
 */
export const simulateFluxSwapPairTransferFrom =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapPairAbi,
    functionName: 'transferFrom',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapPairAbi}__
 */
export const watchFluxSwapPairEvent = /*#__PURE__*/ createWatchContractEvent({
  abi: fluxSwapPairAbi,
})

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `eventName` set to `"Approval"`
 */
export const watchFluxSwapPairApprovalEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapPairAbi,
    eventName: 'Approval',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `eventName` set to `"Burn"`
 */
export const watchFluxSwapPairBurnEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapPairAbi,
    eventName: 'Burn',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `eventName` set to `"Mint"`
 */
export const watchFluxSwapPairMintEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapPairAbi,
    eventName: 'Mint',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `eventName` set to `"ProtocolFeePaid"`
 */
export const watchFluxSwapPairProtocolFeePaidEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapPairAbi,
    eventName: 'ProtocolFeePaid',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `eventName` set to `"Swap"`
 */
export const watchFluxSwapPairSwapEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapPairAbi,
    eventName: 'Swap',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `eventName` set to `"Sync"`
 */
export const watchFluxSwapPairSyncEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapPairAbi,
    eventName: 'Sync',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `eventName` set to `"Transfer"`
 */
export const watchFluxSwapPairTransferEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapPairAbi,
    eventName: 'Transfer',
  })

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// React
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapPairAbi}__
 */
export const useReadFluxSwapPair = /*#__PURE__*/ createUseReadContract({
  abi: fluxSwapPairAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"DOMAIN_SEPARATOR"`
 */
export const useReadFluxSwapPairDomainSeparator =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapPairAbi,
    functionName: 'DOMAIN_SEPARATOR',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"MINIMUM_LIQUIDITY"`
 */
export const useReadFluxSwapPairMinimumLiquidity =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapPairAbi,
    functionName: 'MINIMUM_LIQUIDITY',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"PERMIT_TYPEHASH"`
 */
export const useReadFluxSwapPairPermitTypehash =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapPairAbi,
    functionName: 'PERMIT_TYPEHASH',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"allowance"`
 */
export const useReadFluxSwapPairAllowance = /*#__PURE__*/ createUseReadContract(
  { abi: fluxSwapPairAbi, functionName: 'allowance' },
)

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"balanceOf"`
 */
export const useReadFluxSwapPairBalanceOf = /*#__PURE__*/ createUseReadContract(
  { abi: fluxSwapPairAbi, functionName: 'balanceOf' },
)

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"decimals"`
 */
export const useReadFluxSwapPairDecimals = /*#__PURE__*/ createUseReadContract({
  abi: fluxSwapPairAbi,
  functionName: 'decimals',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"factory"`
 */
export const useReadFluxSwapPairFactory = /*#__PURE__*/ createUseReadContract({
  abi: fluxSwapPairAbi,
  functionName: 'factory',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"getReserves"`
 */
export const useReadFluxSwapPairGetReserves =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapPairAbi,
    functionName: 'getReserves',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"name"`
 */
export const useReadFluxSwapPairName = /*#__PURE__*/ createUseReadContract({
  abi: fluxSwapPairAbi,
  functionName: 'name',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"nonces"`
 */
export const useReadFluxSwapPairNonces = /*#__PURE__*/ createUseReadContract({
  abi: fluxSwapPairAbi,
  functionName: 'nonces',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"price0CumulativeLast"`
 */
export const useReadFluxSwapPairPrice0CumulativeLast =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapPairAbi,
    functionName: 'price0CumulativeLast',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"price1CumulativeLast"`
 */
export const useReadFluxSwapPairPrice1CumulativeLast =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapPairAbi,
    functionName: 'price1CumulativeLast',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"symbol"`
 */
export const useReadFluxSwapPairSymbol = /*#__PURE__*/ createUseReadContract({
  abi: fluxSwapPairAbi,
  functionName: 'symbol',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"token0"`
 */
export const useReadFluxSwapPairToken0 = /*#__PURE__*/ createUseReadContract({
  abi: fluxSwapPairAbi,
  functionName: 'token0',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"token1"`
 */
export const useReadFluxSwapPairToken1 = /*#__PURE__*/ createUseReadContract({
  abi: fluxSwapPairAbi,
  functionName: 'token1',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"totalSupply"`
 */
export const useReadFluxSwapPairTotalSupply =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapPairAbi,
    functionName: 'totalSupply',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapPairAbi}__
 */
export const useWriteFluxSwapPair = /*#__PURE__*/ createUseWriteContract({
  abi: fluxSwapPairAbi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"approve"`
 */
export const useWriteFluxSwapPairApprove = /*#__PURE__*/ createUseWriteContract(
  { abi: fluxSwapPairAbi, functionName: 'approve' },
)

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"burn"`
 */
export const useWriteFluxSwapPairBurn = /*#__PURE__*/ createUseWriteContract({
  abi: fluxSwapPairAbi,
  functionName: 'burn',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"initialize"`
 */
export const useWriteFluxSwapPairInitialize =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapPairAbi,
    functionName: 'initialize',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"mint"`
 */
export const useWriteFluxSwapPairMint = /*#__PURE__*/ createUseWriteContract({
  abi: fluxSwapPairAbi,
  functionName: 'mint',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"permit"`
 */
export const useWriteFluxSwapPairPermit = /*#__PURE__*/ createUseWriteContract({
  abi: fluxSwapPairAbi,
  functionName: 'permit',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"skim"`
 */
export const useWriteFluxSwapPairSkim = /*#__PURE__*/ createUseWriteContract({
  abi: fluxSwapPairAbi,
  functionName: 'skim',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"swap"`
 */
export const useWriteFluxSwapPairSwap = /*#__PURE__*/ createUseWriteContract({
  abi: fluxSwapPairAbi,
  functionName: 'swap',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"sync"`
 */
export const useWriteFluxSwapPairSync = /*#__PURE__*/ createUseWriteContract({
  abi: fluxSwapPairAbi,
  functionName: 'sync',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"transfer"`
 */
export const useWriteFluxSwapPairTransfer =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapPairAbi,
    functionName: 'transfer',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"transferFrom"`
 */
export const useWriteFluxSwapPairTransferFrom =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapPairAbi,
    functionName: 'transferFrom',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapPairAbi}__
 */
export const useSimulateFluxSwapPair = /*#__PURE__*/ createUseSimulateContract({
  abi: fluxSwapPairAbi,
})

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"approve"`
 */
export const useSimulateFluxSwapPairApprove =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapPairAbi,
    functionName: 'approve',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"burn"`
 */
export const useSimulateFluxSwapPairBurn =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapPairAbi,
    functionName: 'burn',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"initialize"`
 */
export const useSimulateFluxSwapPairInitialize =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapPairAbi,
    functionName: 'initialize',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"mint"`
 */
export const useSimulateFluxSwapPairMint =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapPairAbi,
    functionName: 'mint',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"permit"`
 */
export const useSimulateFluxSwapPairPermit =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapPairAbi,
    functionName: 'permit',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"skim"`
 */
export const useSimulateFluxSwapPairSkim =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapPairAbi,
    functionName: 'skim',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"swap"`
 */
export const useSimulateFluxSwapPairSwap =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapPairAbi,
    functionName: 'swap',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"sync"`
 */
export const useSimulateFluxSwapPairSync =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapPairAbi,
    functionName: 'sync',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"transfer"`
 */
export const useSimulateFluxSwapPairTransfer =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapPairAbi,
    functionName: 'transfer',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `functionName` set to `"transferFrom"`
 */
export const useSimulateFluxSwapPairTransferFrom =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapPairAbi,
    functionName: 'transferFrom',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapPairAbi}__
 */
export const useWatchFluxSwapPairEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: fluxSwapPairAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `eventName` set to `"Approval"`
 */
export const useWatchFluxSwapPairApprovalEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapPairAbi,
    eventName: 'Approval',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `eventName` set to `"Burn"`
 */
export const useWatchFluxSwapPairBurnEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapPairAbi,
    eventName: 'Burn',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `eventName` set to `"Mint"`
 */
export const useWatchFluxSwapPairMintEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapPairAbi,
    eventName: 'Mint',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `eventName` set to `"ProtocolFeePaid"`
 */
export const useWatchFluxSwapPairProtocolFeePaidEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapPairAbi,
    eventName: 'ProtocolFeePaid',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `eventName` set to `"Swap"`
 */
export const useWatchFluxSwapPairSwapEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapPairAbi,
    eventName: 'Swap',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `eventName` set to `"Sync"`
 */
export const useWatchFluxSwapPairSyncEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapPairAbi,
    eventName: 'Sync',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapPairAbi}__ and `eventName` set to `"Transfer"`
 */
export const useWatchFluxSwapPairTransferEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapPairAbi,
    eventName: 'Transfer',
  })
