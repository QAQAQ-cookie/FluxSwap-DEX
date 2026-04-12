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
// FluxToken
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const fluxTokenAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: '_name', internalType: 'string', type: 'string' },
      { name: '_symbol', internalType: 'string', type: 'string' },
      { name: '_owner', internalType: 'address', type: 'address' },
      { name: '_initialRecipient', internalType: 'address', type: 'address' },
      { name: '_initialSupply', internalType: 'uint256', type: 'uint256' },
      { name: '_cap', internalType: 'uint256', type: 'uint256' },
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
    inputs: [
      { name: 'increasedSupply', internalType: 'uint256', type: 'uint256' },
      { name: 'cap', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'ERC20ExceededCap',
  },
  {
    type: 'error',
    inputs: [
      { name: 'spender', internalType: 'address', type: 'address' },
      { name: 'allowance', internalType: 'uint256', type: 'uint256' },
      { name: 'needed', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'ERC20InsufficientAllowance',
  },
  {
    type: 'error',
    inputs: [
      { name: 'sender', internalType: 'address', type: 'address' },
      { name: 'balance', internalType: 'uint256', type: 'uint256' },
      { name: 'needed', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'ERC20InsufficientBalance',
  },
  {
    type: 'error',
    inputs: [{ name: 'approver', internalType: 'address', type: 'address' }],
    name: 'ERC20InvalidApprover',
  },
  {
    type: 'error',
    inputs: [{ name: 'cap', internalType: 'uint256', type: 'uint256' }],
    name: 'ERC20InvalidCap',
  },
  {
    type: 'error',
    inputs: [{ name: 'receiver', internalType: 'address', type: 'address' }],
    name: 'ERC20InvalidReceiver',
  },
  {
    type: 'error',
    inputs: [{ name: 'sender', internalType: 'address', type: 'address' }],
    name: 'ERC20InvalidSender',
  },
  {
    type: 'error',
    inputs: [{ name: 'spender', internalType: 'address', type: 'address' }],
    name: 'ERC20InvalidSpender',
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
        name: 'minter',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      { name: 'allowed', internalType: 'bool', type: 'bool', indexed: false },
    ],
    name: 'MinterUpdated',
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
    name: 'DEFAULT_ADMIN_ROLE',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'MINTER_ROLE',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'owner', internalType: 'address', type: 'address' },
      { name: 'spender', internalType: 'address', type: 'address' },
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
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'value', internalType: 'uint256', type: 'uint256' }],
    name: 'burn',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'account', internalType: 'address', type: 'address' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'burnFrom',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'cap',
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
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'isMinter',
    outputs: [{ name: 'allowed', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'mint',
    outputs: [{ name: 'success', internalType: 'bool', type: 'bool' }],
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
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
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
    inputs: [
      { name: 'minter', internalType: 'address', type: 'address' },
      { name: 'allowed', internalType: 'bool', type: 'bool' },
    ],
    name: 'setMinter',
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
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
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
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
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
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxTokenAbi}__
 */
export const readFluxToken = /*#__PURE__*/ createReadContract({
  abi: fluxTokenAbi,
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"DEFAULT_ADMIN_ROLE"`
 */
export const readFluxTokenDefaultAdminRole = /*#__PURE__*/ createReadContract({
  abi: fluxTokenAbi,
  functionName: 'DEFAULT_ADMIN_ROLE',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"MINTER_ROLE"`
 */
export const readFluxTokenMinterRole = /*#__PURE__*/ createReadContract({
  abi: fluxTokenAbi,
  functionName: 'MINTER_ROLE',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"allowance"`
 */
export const readFluxTokenAllowance = /*#__PURE__*/ createReadContract({
  abi: fluxTokenAbi,
  functionName: 'allowance',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"balanceOf"`
 */
export const readFluxTokenBalanceOf = /*#__PURE__*/ createReadContract({
  abi: fluxTokenAbi,
  functionName: 'balanceOf',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"cap"`
 */
export const readFluxTokenCap = /*#__PURE__*/ createReadContract({
  abi: fluxTokenAbi,
  functionName: 'cap',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"decimals"`
 */
export const readFluxTokenDecimals = /*#__PURE__*/ createReadContract({
  abi: fluxTokenAbi,
  functionName: 'decimals',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"getRoleAdmin"`
 */
export const readFluxTokenGetRoleAdmin = /*#__PURE__*/ createReadContract({
  abi: fluxTokenAbi,
  functionName: 'getRoleAdmin',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"hasRole"`
 */
export const readFluxTokenHasRole = /*#__PURE__*/ createReadContract({
  abi: fluxTokenAbi,
  functionName: 'hasRole',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"isMinter"`
 */
export const readFluxTokenIsMinter = /*#__PURE__*/ createReadContract({
  abi: fluxTokenAbi,
  functionName: 'isMinter',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"name"`
 */
export const readFluxTokenName = /*#__PURE__*/ createReadContract({
  abi: fluxTokenAbi,
  functionName: 'name',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"owner"`
 */
export const readFluxTokenOwner = /*#__PURE__*/ createReadContract({
  abi: fluxTokenAbi,
  functionName: 'owner',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"supportsInterface"`
 */
export const readFluxTokenSupportsInterface = /*#__PURE__*/ createReadContract({
  abi: fluxTokenAbi,
  functionName: 'supportsInterface',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"symbol"`
 */
export const readFluxTokenSymbol = /*#__PURE__*/ createReadContract({
  abi: fluxTokenAbi,
  functionName: 'symbol',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"totalSupply"`
 */
export const readFluxTokenTotalSupply = /*#__PURE__*/ createReadContract({
  abi: fluxTokenAbi,
  functionName: 'totalSupply',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxTokenAbi}__
 */
export const writeFluxToken = /*#__PURE__*/ createWriteContract({
  abi: fluxTokenAbi,
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"approve"`
 */
export const writeFluxTokenApprove = /*#__PURE__*/ createWriteContract({
  abi: fluxTokenAbi,
  functionName: 'approve',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"burn"`
 */
export const writeFluxTokenBurn = /*#__PURE__*/ createWriteContract({
  abi: fluxTokenAbi,
  functionName: 'burn',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"burnFrom"`
 */
export const writeFluxTokenBurnFrom = /*#__PURE__*/ createWriteContract({
  abi: fluxTokenAbi,
  functionName: 'burnFrom',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"grantRole"`
 */
export const writeFluxTokenGrantRole = /*#__PURE__*/ createWriteContract({
  abi: fluxTokenAbi,
  functionName: 'grantRole',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"mint"`
 */
export const writeFluxTokenMint = /*#__PURE__*/ createWriteContract({
  abi: fluxTokenAbi,
  functionName: 'mint',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const writeFluxTokenRenounceOwnership =
  /*#__PURE__*/ createWriteContract({
    abi: fluxTokenAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"renounceRole"`
 */
export const writeFluxTokenRenounceRole = /*#__PURE__*/ createWriteContract({
  abi: fluxTokenAbi,
  functionName: 'renounceRole',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"revokeRole"`
 */
export const writeFluxTokenRevokeRole = /*#__PURE__*/ createWriteContract({
  abi: fluxTokenAbi,
  functionName: 'revokeRole',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"setMinter"`
 */
export const writeFluxTokenSetMinter = /*#__PURE__*/ createWriteContract({
  abi: fluxTokenAbi,
  functionName: 'setMinter',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"transfer"`
 */
export const writeFluxTokenTransfer = /*#__PURE__*/ createWriteContract({
  abi: fluxTokenAbi,
  functionName: 'transfer',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"transferFrom"`
 */
export const writeFluxTokenTransferFrom = /*#__PURE__*/ createWriteContract({
  abi: fluxTokenAbi,
  functionName: 'transferFrom',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const writeFluxTokenTransferOwnership =
  /*#__PURE__*/ createWriteContract({
    abi: fluxTokenAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxTokenAbi}__
 */
export const simulateFluxToken = /*#__PURE__*/ createSimulateContract({
  abi: fluxTokenAbi,
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"approve"`
 */
export const simulateFluxTokenApprove = /*#__PURE__*/ createSimulateContract({
  abi: fluxTokenAbi,
  functionName: 'approve',
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"burn"`
 */
export const simulateFluxTokenBurn = /*#__PURE__*/ createSimulateContract({
  abi: fluxTokenAbi,
  functionName: 'burn',
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"burnFrom"`
 */
export const simulateFluxTokenBurnFrom = /*#__PURE__*/ createSimulateContract({
  abi: fluxTokenAbi,
  functionName: 'burnFrom',
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"grantRole"`
 */
export const simulateFluxTokenGrantRole = /*#__PURE__*/ createSimulateContract({
  abi: fluxTokenAbi,
  functionName: 'grantRole',
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"mint"`
 */
export const simulateFluxTokenMint = /*#__PURE__*/ createSimulateContract({
  abi: fluxTokenAbi,
  functionName: 'mint',
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const simulateFluxTokenRenounceOwnership =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxTokenAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"renounceRole"`
 */
export const simulateFluxTokenRenounceRole =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxTokenAbi,
    functionName: 'renounceRole',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"revokeRole"`
 */
export const simulateFluxTokenRevokeRole = /*#__PURE__*/ createSimulateContract(
  { abi: fluxTokenAbi, functionName: 'revokeRole' },
)

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"setMinter"`
 */
export const simulateFluxTokenSetMinter = /*#__PURE__*/ createSimulateContract({
  abi: fluxTokenAbi,
  functionName: 'setMinter',
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"transfer"`
 */
export const simulateFluxTokenTransfer = /*#__PURE__*/ createSimulateContract({
  abi: fluxTokenAbi,
  functionName: 'transfer',
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"transferFrom"`
 */
export const simulateFluxTokenTransferFrom =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxTokenAbi,
    functionName: 'transferFrom',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const simulateFluxTokenTransferOwnership =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxTokenAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxTokenAbi}__
 */
export const watchFluxTokenEvent = /*#__PURE__*/ createWatchContractEvent({
  abi: fluxTokenAbi,
})

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxTokenAbi}__ and `eventName` set to `"Approval"`
 */
export const watchFluxTokenApprovalEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxTokenAbi,
    eventName: 'Approval',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxTokenAbi}__ and `eventName` set to `"MinterUpdated"`
 */
export const watchFluxTokenMinterUpdatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxTokenAbi,
    eventName: 'MinterUpdated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxTokenAbi}__ and `eventName` set to `"OwnershipTransferred"`
 */
export const watchFluxTokenOwnershipTransferredEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxTokenAbi,
    eventName: 'OwnershipTransferred',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxTokenAbi}__ and `eventName` set to `"RoleAdminChanged"`
 */
export const watchFluxTokenRoleAdminChangedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxTokenAbi,
    eventName: 'RoleAdminChanged',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxTokenAbi}__ and `eventName` set to `"RoleGranted"`
 */
export const watchFluxTokenRoleGrantedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxTokenAbi,
    eventName: 'RoleGranted',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxTokenAbi}__ and `eventName` set to `"RoleRevoked"`
 */
export const watchFluxTokenRoleRevokedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxTokenAbi,
    eventName: 'RoleRevoked',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxTokenAbi}__ and `eventName` set to `"Transfer"`
 */
export const watchFluxTokenTransferEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxTokenAbi,
    eventName: 'Transfer',
  })

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// React
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxTokenAbi}__
 */
export const useReadFluxToken = /*#__PURE__*/ createUseReadContract({
  abi: fluxTokenAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"DEFAULT_ADMIN_ROLE"`
 */
export const useReadFluxTokenDefaultAdminRole =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxTokenAbi,
    functionName: 'DEFAULT_ADMIN_ROLE',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"MINTER_ROLE"`
 */
export const useReadFluxTokenMinterRole = /*#__PURE__*/ createUseReadContract({
  abi: fluxTokenAbi,
  functionName: 'MINTER_ROLE',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"allowance"`
 */
export const useReadFluxTokenAllowance = /*#__PURE__*/ createUseReadContract({
  abi: fluxTokenAbi,
  functionName: 'allowance',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"balanceOf"`
 */
export const useReadFluxTokenBalanceOf = /*#__PURE__*/ createUseReadContract({
  abi: fluxTokenAbi,
  functionName: 'balanceOf',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"cap"`
 */
export const useReadFluxTokenCap = /*#__PURE__*/ createUseReadContract({
  abi: fluxTokenAbi,
  functionName: 'cap',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"decimals"`
 */
export const useReadFluxTokenDecimals = /*#__PURE__*/ createUseReadContract({
  abi: fluxTokenAbi,
  functionName: 'decimals',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"getRoleAdmin"`
 */
export const useReadFluxTokenGetRoleAdmin = /*#__PURE__*/ createUseReadContract(
  { abi: fluxTokenAbi, functionName: 'getRoleAdmin' },
)

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"hasRole"`
 */
export const useReadFluxTokenHasRole = /*#__PURE__*/ createUseReadContract({
  abi: fluxTokenAbi,
  functionName: 'hasRole',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"isMinter"`
 */
export const useReadFluxTokenIsMinter = /*#__PURE__*/ createUseReadContract({
  abi: fluxTokenAbi,
  functionName: 'isMinter',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"name"`
 */
export const useReadFluxTokenName = /*#__PURE__*/ createUseReadContract({
  abi: fluxTokenAbi,
  functionName: 'name',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"owner"`
 */
export const useReadFluxTokenOwner = /*#__PURE__*/ createUseReadContract({
  abi: fluxTokenAbi,
  functionName: 'owner',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"supportsInterface"`
 */
export const useReadFluxTokenSupportsInterface =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxTokenAbi,
    functionName: 'supportsInterface',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"symbol"`
 */
export const useReadFluxTokenSymbol = /*#__PURE__*/ createUseReadContract({
  abi: fluxTokenAbi,
  functionName: 'symbol',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"totalSupply"`
 */
export const useReadFluxTokenTotalSupply = /*#__PURE__*/ createUseReadContract({
  abi: fluxTokenAbi,
  functionName: 'totalSupply',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxTokenAbi}__
 */
export const useWriteFluxToken = /*#__PURE__*/ createUseWriteContract({
  abi: fluxTokenAbi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"approve"`
 */
export const useWriteFluxTokenApprove = /*#__PURE__*/ createUseWriteContract({
  abi: fluxTokenAbi,
  functionName: 'approve',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"burn"`
 */
export const useWriteFluxTokenBurn = /*#__PURE__*/ createUseWriteContract({
  abi: fluxTokenAbi,
  functionName: 'burn',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"burnFrom"`
 */
export const useWriteFluxTokenBurnFrom = /*#__PURE__*/ createUseWriteContract({
  abi: fluxTokenAbi,
  functionName: 'burnFrom',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"grantRole"`
 */
export const useWriteFluxTokenGrantRole = /*#__PURE__*/ createUseWriteContract({
  abi: fluxTokenAbi,
  functionName: 'grantRole',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"mint"`
 */
export const useWriteFluxTokenMint = /*#__PURE__*/ createUseWriteContract({
  abi: fluxTokenAbi,
  functionName: 'mint',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const useWriteFluxTokenRenounceOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxTokenAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"renounceRole"`
 */
export const useWriteFluxTokenRenounceRole =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxTokenAbi,
    functionName: 'renounceRole',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"revokeRole"`
 */
export const useWriteFluxTokenRevokeRole = /*#__PURE__*/ createUseWriteContract(
  { abi: fluxTokenAbi, functionName: 'revokeRole' },
)

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"setMinter"`
 */
export const useWriteFluxTokenSetMinter = /*#__PURE__*/ createUseWriteContract({
  abi: fluxTokenAbi,
  functionName: 'setMinter',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"transfer"`
 */
export const useWriteFluxTokenTransfer = /*#__PURE__*/ createUseWriteContract({
  abi: fluxTokenAbi,
  functionName: 'transfer',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"transferFrom"`
 */
export const useWriteFluxTokenTransferFrom =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxTokenAbi,
    functionName: 'transferFrom',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useWriteFluxTokenTransferOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxTokenAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxTokenAbi}__
 */
export const useSimulateFluxToken = /*#__PURE__*/ createUseSimulateContract({
  abi: fluxTokenAbi,
})

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"approve"`
 */
export const useSimulateFluxTokenApprove =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxTokenAbi,
    functionName: 'approve',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"burn"`
 */
export const useSimulateFluxTokenBurn = /*#__PURE__*/ createUseSimulateContract(
  { abi: fluxTokenAbi, functionName: 'burn' },
)

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"burnFrom"`
 */
export const useSimulateFluxTokenBurnFrom =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxTokenAbi,
    functionName: 'burnFrom',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"grantRole"`
 */
export const useSimulateFluxTokenGrantRole =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxTokenAbi,
    functionName: 'grantRole',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"mint"`
 */
export const useSimulateFluxTokenMint = /*#__PURE__*/ createUseSimulateContract(
  { abi: fluxTokenAbi, functionName: 'mint' },
)

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const useSimulateFluxTokenRenounceOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxTokenAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"renounceRole"`
 */
export const useSimulateFluxTokenRenounceRole =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxTokenAbi,
    functionName: 'renounceRole',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"revokeRole"`
 */
export const useSimulateFluxTokenRevokeRole =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxTokenAbi,
    functionName: 'revokeRole',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"setMinter"`
 */
export const useSimulateFluxTokenSetMinter =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxTokenAbi,
    functionName: 'setMinter',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"transfer"`
 */
export const useSimulateFluxTokenTransfer =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxTokenAbi,
    functionName: 'transfer',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"transferFrom"`
 */
export const useSimulateFluxTokenTransferFrom =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxTokenAbi,
    functionName: 'transferFrom',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxTokenAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useSimulateFluxTokenTransferOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxTokenAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxTokenAbi}__
 */
export const useWatchFluxTokenEvent = /*#__PURE__*/ createUseWatchContractEvent(
  { abi: fluxTokenAbi },
)

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxTokenAbi}__ and `eventName` set to `"Approval"`
 */
export const useWatchFluxTokenApprovalEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxTokenAbi,
    eventName: 'Approval',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxTokenAbi}__ and `eventName` set to `"MinterUpdated"`
 */
export const useWatchFluxTokenMinterUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxTokenAbi,
    eventName: 'MinterUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxTokenAbi}__ and `eventName` set to `"OwnershipTransferred"`
 */
export const useWatchFluxTokenOwnershipTransferredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxTokenAbi,
    eventName: 'OwnershipTransferred',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxTokenAbi}__ and `eventName` set to `"RoleAdminChanged"`
 */
export const useWatchFluxTokenRoleAdminChangedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxTokenAbi,
    eventName: 'RoleAdminChanged',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxTokenAbi}__ and `eventName` set to `"RoleGranted"`
 */
export const useWatchFluxTokenRoleGrantedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxTokenAbi,
    eventName: 'RoleGranted',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxTokenAbi}__ and `eventName` set to `"RoleRevoked"`
 */
export const useWatchFluxTokenRoleRevokedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxTokenAbi,
    eventName: 'RoleRevoked',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxTokenAbi}__ and `eventName` set to `"Transfer"`
 */
export const useWatchFluxTokenTransferEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxTokenAbi,
    eventName: 'Transfer',
  })
