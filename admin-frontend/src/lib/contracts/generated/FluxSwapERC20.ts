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
// FluxSwapERC20
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const fluxSwapErc20Abi = [
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
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', internalType: 'uint8', type: 'uint8' }],
    stateMutability: 'view',
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
    name: 'symbol',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
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
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__
 */
export const readFluxSwapErc20 = /*#__PURE__*/ createReadContract({
  abi: fluxSwapErc20Abi,
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `functionName` set to `"DOMAIN_SEPARATOR"`
 */
export const readFluxSwapErc20DomainSeparator =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapErc20Abi,
    functionName: 'DOMAIN_SEPARATOR',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `functionName` set to `"PERMIT_TYPEHASH"`
 */
export const readFluxSwapErc20PermitTypehash = /*#__PURE__*/ createReadContract(
  { abi: fluxSwapErc20Abi, functionName: 'PERMIT_TYPEHASH' },
)

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `functionName` set to `"allowance"`
 */
export const readFluxSwapErc20Allowance = /*#__PURE__*/ createReadContract({
  abi: fluxSwapErc20Abi,
  functionName: 'allowance',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `functionName` set to `"balanceOf"`
 */
export const readFluxSwapErc20BalanceOf = /*#__PURE__*/ createReadContract({
  abi: fluxSwapErc20Abi,
  functionName: 'balanceOf',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `functionName` set to `"decimals"`
 */
export const readFluxSwapErc20Decimals = /*#__PURE__*/ createReadContract({
  abi: fluxSwapErc20Abi,
  functionName: 'decimals',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `functionName` set to `"name"`
 */
export const readFluxSwapErc20Name = /*#__PURE__*/ createReadContract({
  abi: fluxSwapErc20Abi,
  functionName: 'name',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `functionName` set to `"nonces"`
 */
export const readFluxSwapErc20Nonces = /*#__PURE__*/ createReadContract({
  abi: fluxSwapErc20Abi,
  functionName: 'nonces',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `functionName` set to `"symbol"`
 */
export const readFluxSwapErc20Symbol = /*#__PURE__*/ createReadContract({
  abi: fluxSwapErc20Abi,
  functionName: 'symbol',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `functionName` set to `"totalSupply"`
 */
export const readFluxSwapErc20TotalSupply = /*#__PURE__*/ createReadContract({
  abi: fluxSwapErc20Abi,
  functionName: 'totalSupply',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__
 */
export const writeFluxSwapErc20 = /*#__PURE__*/ createWriteContract({
  abi: fluxSwapErc20Abi,
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `functionName` set to `"approve"`
 */
export const writeFluxSwapErc20Approve = /*#__PURE__*/ createWriteContract({
  abi: fluxSwapErc20Abi,
  functionName: 'approve',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `functionName` set to `"permit"`
 */
export const writeFluxSwapErc20Permit = /*#__PURE__*/ createWriteContract({
  abi: fluxSwapErc20Abi,
  functionName: 'permit',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `functionName` set to `"transfer"`
 */
export const writeFluxSwapErc20Transfer = /*#__PURE__*/ createWriteContract({
  abi: fluxSwapErc20Abi,
  functionName: 'transfer',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `functionName` set to `"transferFrom"`
 */
export const writeFluxSwapErc20TransferFrom = /*#__PURE__*/ createWriteContract(
  { abi: fluxSwapErc20Abi, functionName: 'transferFrom' },
)

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__
 */
export const simulateFluxSwapErc20 = /*#__PURE__*/ createSimulateContract({
  abi: fluxSwapErc20Abi,
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `functionName` set to `"approve"`
 */
export const simulateFluxSwapErc20Approve =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapErc20Abi,
    functionName: 'approve',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `functionName` set to `"permit"`
 */
export const simulateFluxSwapErc20Permit = /*#__PURE__*/ createSimulateContract(
  { abi: fluxSwapErc20Abi, functionName: 'permit' },
)

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `functionName` set to `"transfer"`
 */
export const simulateFluxSwapErc20Transfer =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapErc20Abi,
    functionName: 'transfer',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `functionName` set to `"transferFrom"`
 */
export const simulateFluxSwapErc20TransferFrom =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapErc20Abi,
    functionName: 'transferFrom',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapErc20Abi}__
 */
export const watchFluxSwapErc20Event = /*#__PURE__*/ createWatchContractEvent({
  abi: fluxSwapErc20Abi,
})

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `eventName` set to `"Approval"`
 */
export const watchFluxSwapErc20ApprovalEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapErc20Abi,
    eventName: 'Approval',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `eventName` set to `"Transfer"`
 */
export const watchFluxSwapErc20TransferEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapErc20Abi,
    eventName: 'Transfer',
  })

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// React
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__
 */
export const useReadFluxSwapErc20 = /*#__PURE__*/ createUseReadContract({
  abi: fluxSwapErc20Abi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `functionName` set to `"DOMAIN_SEPARATOR"`
 */
export const useReadFluxSwapErc20DomainSeparator =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapErc20Abi,
    functionName: 'DOMAIN_SEPARATOR',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `functionName` set to `"PERMIT_TYPEHASH"`
 */
export const useReadFluxSwapErc20PermitTypehash =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapErc20Abi,
    functionName: 'PERMIT_TYPEHASH',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `functionName` set to `"allowance"`
 */
export const useReadFluxSwapErc20Allowance =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapErc20Abi,
    functionName: 'allowance',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `functionName` set to `"balanceOf"`
 */
export const useReadFluxSwapErc20BalanceOf =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapErc20Abi,
    functionName: 'balanceOf',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `functionName` set to `"decimals"`
 */
export const useReadFluxSwapErc20Decimals = /*#__PURE__*/ createUseReadContract(
  { abi: fluxSwapErc20Abi, functionName: 'decimals' },
)

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `functionName` set to `"name"`
 */
export const useReadFluxSwapErc20Name = /*#__PURE__*/ createUseReadContract({
  abi: fluxSwapErc20Abi,
  functionName: 'name',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `functionName` set to `"nonces"`
 */
export const useReadFluxSwapErc20Nonces = /*#__PURE__*/ createUseReadContract({
  abi: fluxSwapErc20Abi,
  functionName: 'nonces',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `functionName` set to `"symbol"`
 */
export const useReadFluxSwapErc20Symbol = /*#__PURE__*/ createUseReadContract({
  abi: fluxSwapErc20Abi,
  functionName: 'symbol',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `functionName` set to `"totalSupply"`
 */
export const useReadFluxSwapErc20TotalSupply =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapErc20Abi,
    functionName: 'totalSupply',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__
 */
export const useWriteFluxSwapErc20 = /*#__PURE__*/ createUseWriteContract({
  abi: fluxSwapErc20Abi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `functionName` set to `"approve"`
 */
export const useWriteFluxSwapErc20Approve =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapErc20Abi,
    functionName: 'approve',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `functionName` set to `"permit"`
 */
export const useWriteFluxSwapErc20Permit = /*#__PURE__*/ createUseWriteContract(
  { abi: fluxSwapErc20Abi, functionName: 'permit' },
)

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `functionName` set to `"transfer"`
 */
export const useWriteFluxSwapErc20Transfer =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapErc20Abi,
    functionName: 'transfer',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `functionName` set to `"transferFrom"`
 */
export const useWriteFluxSwapErc20TransferFrom =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapErc20Abi,
    functionName: 'transferFrom',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__
 */
export const useSimulateFluxSwapErc20 = /*#__PURE__*/ createUseSimulateContract(
  { abi: fluxSwapErc20Abi },
)

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `functionName` set to `"approve"`
 */
export const useSimulateFluxSwapErc20Approve =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapErc20Abi,
    functionName: 'approve',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `functionName` set to `"permit"`
 */
export const useSimulateFluxSwapErc20Permit =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapErc20Abi,
    functionName: 'permit',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `functionName` set to `"transfer"`
 */
export const useSimulateFluxSwapErc20Transfer =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapErc20Abi,
    functionName: 'transfer',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `functionName` set to `"transferFrom"`
 */
export const useSimulateFluxSwapErc20TransferFrom =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapErc20Abi,
    functionName: 'transferFrom',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapErc20Abi}__
 */
export const useWatchFluxSwapErc20Event =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: fluxSwapErc20Abi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `eventName` set to `"Approval"`
 */
export const useWatchFluxSwapErc20ApprovalEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapErc20Abi,
    eventName: 'Approval',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapErc20Abi}__ and `eventName` set to `"Transfer"`
 */
export const useWatchFluxSwapErc20TransferEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapErc20Abi,
    eventName: 'Transfer',
  })
