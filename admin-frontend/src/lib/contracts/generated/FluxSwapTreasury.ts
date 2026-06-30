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
// FluxSwapTreasury
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const fluxSwapTreasuryAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: '_multisig', internalType: 'address', type: 'address' },
      { name: '_guardian', internalType: 'address', type: 'address' },
      { name: '_operator', internalType: 'address', type: 'address' },
      { name: '_minDelay', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
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
      {
        name: 'executor',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'AllocationExecuted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'recipient',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      { name: 'allowed', internalType: 'bool', type: 'bool', indexed: false },
    ],
    name: 'AllowedRecipientUpdated',
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
      { name: 'allowed', internalType: 'bool', type: 'bool', indexed: false },
    ],
    name: 'AllowedTokenUpdated',
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
      {
        name: 'spender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'remaining',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'ApprovedSpenderCapConsumed',
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
      {
        name: 'spender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'remaining',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'ApprovedSpenderTokenBurned',
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
      {
        name: 'spender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'remaining',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'ApprovedSpenderTokenPulled',
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
      {
        name: 'oldCap',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'newCap',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'DailySpendCapUpdated',
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
    name: 'EmergencyWithdraw',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'oldGuardian',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newGuardian',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'GuardianUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'oldMinDelay',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'newMinDelay',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'MinDelayUpdated',
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
      {
        name: 'executor',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'NativeAllocationExecuted',
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
    name: 'NativeEmergencyWithdraw',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'from', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'NativeReceived',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'operationId',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'canceller',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OperationCancelled',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'operationId',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'executor',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OperationExecuted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'operationId',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'executeAfter',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'scheduler',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OperationScheduled',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'oldOperator',
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
        name: 'token',
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
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'SpenderApproved',
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
      {
        name: 'spender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'SpenderRevoked',
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
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'allocate',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'allocateETH',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'address', type: 'address' }],
    name: 'allowedRecipients',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'address', type: 'address' }],
    name: 'allowedTokens',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: '', internalType: 'address', type: 'address' },
      { name: '', internalType: 'address', type: 'address' },
    ],
    name: 'approvedSpendRemaining',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'burnApprovedToken',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'operationId', internalType: 'bytes32', type: 'bytes32' }],
    name: 'cancelOperation',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'consumeApprovedSpenderCap',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'address', type: 'address' }],
    name: 'dailySpendCap',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'spender', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
      { name: 'operationId', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'executeApproveSpender',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
      { name: 'operationId', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'executeEmergencyWithdraw',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
      { name: 'operationId', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'executeEmergencyWithdrawETH',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'spender', internalType: 'address', type: 'address' },
      { name: 'operationId', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'executeRevokeSpender',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'recipient', internalType: 'address', type: 'address' },
      { name: 'allowed', internalType: 'bool', type: 'bool' },
      { name: 'operationId', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'executeSetAllowedRecipient',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'allowed', internalType: 'bool', type: 'bool' },
      { name: 'operationId', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'executeSetAllowedToken',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'newCap', internalType: 'uint256', type: 'uint256' },
      { name: 'operationId', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'executeSetDailySpendCap',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'newGuardian', internalType: 'address', type: 'address' },
      { name: 'operationId', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'executeSetGuardian',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'newMinDelay', internalType: 'uint256', type: 'uint256' },
      { name: 'operationId', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'executeSetMinDelay',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'newOperator', internalType: 'address', type: 'address' },
      { name: 'operationId', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'executeSetOperator',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'guardian',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'spender', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'hashApproveSpender',
    outputs: [
      { name: 'operationId', internalType: 'bytes32', type: 'bytes32' },
    ],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'hashEmergencyWithdraw',
    outputs: [
      { name: 'operationId', internalType: 'bytes32', type: 'bytes32' },
    ],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'hashEmergencyWithdrawETH',
    outputs: [
      { name: 'operationId', internalType: 'bytes32', type: 'bytes32' },
    ],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'spender', internalType: 'address', type: 'address' },
    ],
    name: 'hashRevokeSpender',
    outputs: [
      { name: 'operationId', internalType: 'bytes32', type: 'bytes32' },
    ],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [
      { name: 'recipient', internalType: 'address', type: 'address' },
      { name: 'allowed', internalType: 'bool', type: 'bool' },
    ],
    name: 'hashSetAllowedRecipient',
    outputs: [
      { name: 'operationId', internalType: 'bytes32', type: 'bytes32' },
    ],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'allowed', internalType: 'bool', type: 'bool' },
    ],
    name: 'hashSetAllowedToken',
    outputs: [
      { name: 'operationId', internalType: 'bytes32', type: 'bytes32' },
    ],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'newCap', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'hashSetDailySpendCap',
    outputs: [
      { name: 'operationId', internalType: 'bytes32', type: 'bytes32' },
    ],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [{ name: 'newGuardian', internalType: 'address', type: 'address' }],
    name: 'hashSetGuardian',
    outputs: [
      { name: 'operationId', internalType: 'bytes32', type: 'bytes32' },
    ],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [{ name: 'newMinDelay', internalType: 'uint256', type: 'uint256' }],
    name: 'hashSetMinDelay',
    outputs: [
      { name: 'operationId', internalType: 'bytes32', type: 'bytes32' },
    ],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [{ name: 'newOperator', internalType: 'address', type: 'address' }],
    name: 'hashSetOperator',
    outputs: [
      { name: 'operationId', internalType: 'bytes32', type: 'bytes32' },
    ],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [],
    name: 'isFluxSwapTreasury',
    outputs: [{ name: 'isTreasury', internalType: 'bool', type: 'bool' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'address', type: 'address' }],
    name: 'lastSpendDay',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'minDelay',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'multisig',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    name: 'operationReadyAt',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
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
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'pullApprovedToken',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'operationId', internalType: 'bytes32', type: 'bytes32' },
      { name: 'delay', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'scheduleOperation',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'address', type: 'address' }],
    name: 'spentToday',
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
  { type: 'receive', stateMutability: 'payable' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Action
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__
 */
export const readFluxSwapTreasury = /*#__PURE__*/ createReadContract({
  abi: fluxSwapTreasuryAbi,
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"allowedRecipients"`
 */
export const readFluxSwapTreasuryAllowedRecipients =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'allowedRecipients',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"allowedTokens"`
 */
export const readFluxSwapTreasuryAllowedTokens =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'allowedTokens',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"approvedSpendRemaining"`
 */
export const readFluxSwapTreasuryApprovedSpendRemaining =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'approvedSpendRemaining',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"dailySpendCap"`
 */
export const readFluxSwapTreasuryDailySpendCap =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'dailySpendCap',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"guardian"`
 */
export const readFluxSwapTreasuryGuardian = /*#__PURE__*/ createReadContract({
  abi: fluxSwapTreasuryAbi,
  functionName: 'guardian',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"hashApproveSpender"`
 */
export const readFluxSwapTreasuryHashApproveSpender =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'hashApproveSpender',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"hashEmergencyWithdraw"`
 */
export const readFluxSwapTreasuryHashEmergencyWithdraw =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'hashEmergencyWithdraw',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"hashEmergencyWithdrawETH"`
 */
export const readFluxSwapTreasuryHashEmergencyWithdrawEth =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'hashEmergencyWithdrawETH',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"hashRevokeSpender"`
 */
export const readFluxSwapTreasuryHashRevokeSpender =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'hashRevokeSpender',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"hashSetAllowedRecipient"`
 */
export const readFluxSwapTreasuryHashSetAllowedRecipient =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'hashSetAllowedRecipient',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"hashSetAllowedToken"`
 */
export const readFluxSwapTreasuryHashSetAllowedToken =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'hashSetAllowedToken',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"hashSetDailySpendCap"`
 */
export const readFluxSwapTreasuryHashSetDailySpendCap =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'hashSetDailySpendCap',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"hashSetGuardian"`
 */
export const readFluxSwapTreasuryHashSetGuardian =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'hashSetGuardian',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"hashSetMinDelay"`
 */
export const readFluxSwapTreasuryHashSetMinDelay =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'hashSetMinDelay',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"hashSetOperator"`
 */
export const readFluxSwapTreasuryHashSetOperator =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'hashSetOperator',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"isFluxSwapTreasury"`
 */
export const readFluxSwapTreasuryIsFluxSwapTreasury =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'isFluxSwapTreasury',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"lastSpendDay"`
 */
export const readFluxSwapTreasuryLastSpendDay =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'lastSpendDay',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"minDelay"`
 */
export const readFluxSwapTreasuryMinDelay = /*#__PURE__*/ createReadContract({
  abi: fluxSwapTreasuryAbi,
  functionName: 'minDelay',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"multisig"`
 */
export const readFluxSwapTreasuryMultisig = /*#__PURE__*/ createReadContract({
  abi: fluxSwapTreasuryAbi,
  functionName: 'multisig',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"operationReadyAt"`
 */
export const readFluxSwapTreasuryOperationReadyAt =
  /*#__PURE__*/ createReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'operationReadyAt',
  })

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"operator"`
 */
export const readFluxSwapTreasuryOperator = /*#__PURE__*/ createReadContract({
  abi: fluxSwapTreasuryAbi,
  functionName: 'operator',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"paused"`
 */
export const readFluxSwapTreasuryPaused = /*#__PURE__*/ createReadContract({
  abi: fluxSwapTreasuryAbi,
  functionName: 'paused',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"spentToday"`
 */
export const readFluxSwapTreasurySpentToday = /*#__PURE__*/ createReadContract({
  abi: fluxSwapTreasuryAbi,
  functionName: 'spentToday',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__
 */
export const writeFluxSwapTreasury = /*#__PURE__*/ createWriteContract({
  abi: fluxSwapTreasuryAbi,
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"allocate"`
 */
export const writeFluxSwapTreasuryAllocate = /*#__PURE__*/ createWriteContract({
  abi: fluxSwapTreasuryAbi,
  functionName: 'allocate',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"allocateETH"`
 */
export const writeFluxSwapTreasuryAllocateEth =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'allocateETH',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"burnApprovedToken"`
 */
export const writeFluxSwapTreasuryBurnApprovedToken =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'burnApprovedToken',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"cancelOperation"`
 */
export const writeFluxSwapTreasuryCancelOperation =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'cancelOperation',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"consumeApprovedSpenderCap"`
 */
export const writeFluxSwapTreasuryConsumeApprovedSpenderCap =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'consumeApprovedSpenderCap',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeApproveSpender"`
 */
export const writeFluxSwapTreasuryExecuteApproveSpender =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeApproveSpender',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeEmergencyWithdraw"`
 */
export const writeFluxSwapTreasuryExecuteEmergencyWithdraw =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeEmergencyWithdraw',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeEmergencyWithdrawETH"`
 */
export const writeFluxSwapTreasuryExecuteEmergencyWithdrawEth =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeEmergencyWithdrawETH',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeRevokeSpender"`
 */
export const writeFluxSwapTreasuryExecuteRevokeSpender =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeRevokeSpender',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeSetAllowedRecipient"`
 */
export const writeFluxSwapTreasuryExecuteSetAllowedRecipient =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeSetAllowedRecipient',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeSetAllowedToken"`
 */
export const writeFluxSwapTreasuryExecuteSetAllowedToken =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeSetAllowedToken',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeSetDailySpendCap"`
 */
export const writeFluxSwapTreasuryExecuteSetDailySpendCap =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeSetDailySpendCap',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeSetGuardian"`
 */
export const writeFluxSwapTreasuryExecuteSetGuardian =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeSetGuardian',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeSetMinDelay"`
 */
export const writeFluxSwapTreasuryExecuteSetMinDelay =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeSetMinDelay',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeSetOperator"`
 */
export const writeFluxSwapTreasuryExecuteSetOperator =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeSetOperator',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"pause"`
 */
export const writeFluxSwapTreasuryPause = /*#__PURE__*/ createWriteContract({
  abi: fluxSwapTreasuryAbi,
  functionName: 'pause',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"pullApprovedToken"`
 */
export const writeFluxSwapTreasuryPullApprovedToken =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'pullApprovedToken',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"scheduleOperation"`
 */
export const writeFluxSwapTreasuryScheduleOperation =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'scheduleOperation',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"unpause"`
 */
export const writeFluxSwapTreasuryUnpause = /*#__PURE__*/ createWriteContract({
  abi: fluxSwapTreasuryAbi,
  functionName: 'unpause',
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__
 */
export const simulateFluxSwapTreasury = /*#__PURE__*/ createSimulateContract({
  abi: fluxSwapTreasuryAbi,
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"allocate"`
 */
export const simulateFluxSwapTreasuryAllocate =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'allocate',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"allocateETH"`
 */
export const simulateFluxSwapTreasuryAllocateEth =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'allocateETH',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"burnApprovedToken"`
 */
export const simulateFluxSwapTreasuryBurnApprovedToken =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'burnApprovedToken',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"cancelOperation"`
 */
export const simulateFluxSwapTreasuryCancelOperation =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'cancelOperation',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"consumeApprovedSpenderCap"`
 */
export const simulateFluxSwapTreasuryConsumeApprovedSpenderCap =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'consumeApprovedSpenderCap',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeApproveSpender"`
 */
export const simulateFluxSwapTreasuryExecuteApproveSpender =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeApproveSpender',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeEmergencyWithdraw"`
 */
export const simulateFluxSwapTreasuryExecuteEmergencyWithdraw =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeEmergencyWithdraw',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeEmergencyWithdrawETH"`
 */
export const simulateFluxSwapTreasuryExecuteEmergencyWithdrawEth =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeEmergencyWithdrawETH',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeRevokeSpender"`
 */
export const simulateFluxSwapTreasuryExecuteRevokeSpender =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeRevokeSpender',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeSetAllowedRecipient"`
 */
export const simulateFluxSwapTreasuryExecuteSetAllowedRecipient =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeSetAllowedRecipient',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeSetAllowedToken"`
 */
export const simulateFluxSwapTreasuryExecuteSetAllowedToken =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeSetAllowedToken',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeSetDailySpendCap"`
 */
export const simulateFluxSwapTreasuryExecuteSetDailySpendCap =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeSetDailySpendCap',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeSetGuardian"`
 */
export const simulateFluxSwapTreasuryExecuteSetGuardian =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeSetGuardian',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeSetMinDelay"`
 */
export const simulateFluxSwapTreasuryExecuteSetMinDelay =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeSetMinDelay',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeSetOperator"`
 */
export const simulateFluxSwapTreasuryExecuteSetOperator =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeSetOperator',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"pause"`
 */
export const simulateFluxSwapTreasuryPause =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'pause',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"pullApprovedToken"`
 */
export const simulateFluxSwapTreasuryPullApprovedToken =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'pullApprovedToken',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"scheduleOperation"`
 */
export const simulateFluxSwapTreasuryScheduleOperation =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'scheduleOperation',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"unpause"`
 */
export const simulateFluxSwapTreasuryUnpause =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'unpause',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__
 */
export const watchFluxSwapTreasuryEvent =
  /*#__PURE__*/ createWatchContractEvent({ abi: fluxSwapTreasuryAbi })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"AllocationExecuted"`
 */
export const watchFluxSwapTreasuryAllocationExecutedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'AllocationExecuted',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"AllowedRecipientUpdated"`
 */
export const watchFluxSwapTreasuryAllowedRecipientUpdatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'AllowedRecipientUpdated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"AllowedTokenUpdated"`
 */
export const watchFluxSwapTreasuryAllowedTokenUpdatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'AllowedTokenUpdated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"ApprovedSpenderCapConsumed"`
 */
export const watchFluxSwapTreasuryApprovedSpenderCapConsumedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'ApprovedSpenderCapConsumed',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"ApprovedSpenderTokenBurned"`
 */
export const watchFluxSwapTreasuryApprovedSpenderTokenBurnedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'ApprovedSpenderTokenBurned',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"ApprovedSpenderTokenPulled"`
 */
export const watchFluxSwapTreasuryApprovedSpenderTokenPulledEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'ApprovedSpenderTokenPulled',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"DailySpendCapUpdated"`
 */
export const watchFluxSwapTreasuryDailySpendCapUpdatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'DailySpendCapUpdated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"EmergencyWithdraw"`
 */
export const watchFluxSwapTreasuryEmergencyWithdrawEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'EmergencyWithdraw',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"GuardianUpdated"`
 */
export const watchFluxSwapTreasuryGuardianUpdatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'GuardianUpdated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"MinDelayUpdated"`
 */
export const watchFluxSwapTreasuryMinDelayUpdatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'MinDelayUpdated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"NativeAllocationExecuted"`
 */
export const watchFluxSwapTreasuryNativeAllocationExecutedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'NativeAllocationExecuted',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"NativeEmergencyWithdraw"`
 */
export const watchFluxSwapTreasuryNativeEmergencyWithdrawEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'NativeEmergencyWithdraw',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"NativeReceived"`
 */
export const watchFluxSwapTreasuryNativeReceivedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'NativeReceived',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"OperationCancelled"`
 */
export const watchFluxSwapTreasuryOperationCancelledEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'OperationCancelled',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"OperationExecuted"`
 */
export const watchFluxSwapTreasuryOperationExecutedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'OperationExecuted',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"OperationScheduled"`
 */
export const watchFluxSwapTreasuryOperationScheduledEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'OperationScheduled',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"OperatorUpdated"`
 */
export const watchFluxSwapTreasuryOperatorUpdatedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'OperatorUpdated',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"Paused"`
 */
export const watchFluxSwapTreasuryPausedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'Paused',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"SpenderApproved"`
 */
export const watchFluxSwapTreasurySpenderApprovedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'SpenderApproved',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"SpenderRevoked"`
 */
export const watchFluxSwapTreasurySpenderRevokedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'SpenderRevoked',
  })

/**
 * Wraps __{@link watchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"Unpaused"`
 */
export const watchFluxSwapTreasuryUnpausedEvent =
  /*#__PURE__*/ createWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'Unpaused',
  })

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// React
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__
 */
export const useReadFluxSwapTreasury = /*#__PURE__*/ createUseReadContract({
  abi: fluxSwapTreasuryAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"allowedRecipients"`
 */
export const useReadFluxSwapTreasuryAllowedRecipients =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'allowedRecipients',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"allowedTokens"`
 */
export const useReadFluxSwapTreasuryAllowedTokens =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'allowedTokens',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"approvedSpendRemaining"`
 */
export const useReadFluxSwapTreasuryApprovedSpendRemaining =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'approvedSpendRemaining',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"dailySpendCap"`
 */
export const useReadFluxSwapTreasuryDailySpendCap =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'dailySpendCap',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"guardian"`
 */
export const useReadFluxSwapTreasuryGuardian =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'guardian',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"hashApproveSpender"`
 */
export const useReadFluxSwapTreasuryHashApproveSpender =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'hashApproveSpender',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"hashEmergencyWithdraw"`
 */
export const useReadFluxSwapTreasuryHashEmergencyWithdraw =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'hashEmergencyWithdraw',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"hashEmergencyWithdrawETH"`
 */
export const useReadFluxSwapTreasuryHashEmergencyWithdrawEth =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'hashEmergencyWithdrawETH',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"hashRevokeSpender"`
 */
export const useReadFluxSwapTreasuryHashRevokeSpender =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'hashRevokeSpender',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"hashSetAllowedRecipient"`
 */
export const useReadFluxSwapTreasuryHashSetAllowedRecipient =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'hashSetAllowedRecipient',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"hashSetAllowedToken"`
 */
export const useReadFluxSwapTreasuryHashSetAllowedToken =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'hashSetAllowedToken',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"hashSetDailySpendCap"`
 */
export const useReadFluxSwapTreasuryHashSetDailySpendCap =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'hashSetDailySpendCap',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"hashSetGuardian"`
 */
export const useReadFluxSwapTreasuryHashSetGuardian =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'hashSetGuardian',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"hashSetMinDelay"`
 */
export const useReadFluxSwapTreasuryHashSetMinDelay =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'hashSetMinDelay',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"hashSetOperator"`
 */
export const useReadFluxSwapTreasuryHashSetOperator =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'hashSetOperator',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"isFluxSwapTreasury"`
 */
export const useReadFluxSwapTreasuryIsFluxSwapTreasury =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'isFluxSwapTreasury',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"lastSpendDay"`
 */
export const useReadFluxSwapTreasuryLastSpendDay =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'lastSpendDay',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"minDelay"`
 */
export const useReadFluxSwapTreasuryMinDelay =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'minDelay',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"multisig"`
 */
export const useReadFluxSwapTreasuryMultisig =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'multisig',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"operationReadyAt"`
 */
export const useReadFluxSwapTreasuryOperationReadyAt =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'operationReadyAt',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"operator"`
 */
export const useReadFluxSwapTreasuryOperator =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'operator',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"paused"`
 */
export const useReadFluxSwapTreasuryPaused =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'paused',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"spentToday"`
 */
export const useReadFluxSwapTreasurySpentToday =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'spentToday',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__
 */
export const useWriteFluxSwapTreasury = /*#__PURE__*/ createUseWriteContract({
  abi: fluxSwapTreasuryAbi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"allocate"`
 */
export const useWriteFluxSwapTreasuryAllocate =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'allocate',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"allocateETH"`
 */
export const useWriteFluxSwapTreasuryAllocateEth =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'allocateETH',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"burnApprovedToken"`
 */
export const useWriteFluxSwapTreasuryBurnApprovedToken =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'burnApprovedToken',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"cancelOperation"`
 */
export const useWriteFluxSwapTreasuryCancelOperation =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'cancelOperation',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"consumeApprovedSpenderCap"`
 */
export const useWriteFluxSwapTreasuryConsumeApprovedSpenderCap =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'consumeApprovedSpenderCap',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeApproveSpender"`
 */
export const useWriteFluxSwapTreasuryExecuteApproveSpender =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeApproveSpender',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeEmergencyWithdraw"`
 */
export const useWriteFluxSwapTreasuryExecuteEmergencyWithdraw =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeEmergencyWithdraw',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeEmergencyWithdrawETH"`
 */
export const useWriteFluxSwapTreasuryExecuteEmergencyWithdrawEth =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeEmergencyWithdrawETH',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeRevokeSpender"`
 */
export const useWriteFluxSwapTreasuryExecuteRevokeSpender =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeRevokeSpender',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeSetAllowedRecipient"`
 */
export const useWriteFluxSwapTreasuryExecuteSetAllowedRecipient =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeSetAllowedRecipient',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeSetAllowedToken"`
 */
export const useWriteFluxSwapTreasuryExecuteSetAllowedToken =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeSetAllowedToken',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeSetDailySpendCap"`
 */
export const useWriteFluxSwapTreasuryExecuteSetDailySpendCap =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeSetDailySpendCap',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeSetGuardian"`
 */
export const useWriteFluxSwapTreasuryExecuteSetGuardian =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeSetGuardian',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeSetMinDelay"`
 */
export const useWriteFluxSwapTreasuryExecuteSetMinDelay =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeSetMinDelay',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeSetOperator"`
 */
export const useWriteFluxSwapTreasuryExecuteSetOperator =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeSetOperator',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"pause"`
 */
export const useWriteFluxSwapTreasuryPause =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'pause',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"pullApprovedToken"`
 */
export const useWriteFluxSwapTreasuryPullApprovedToken =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'pullApprovedToken',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"scheduleOperation"`
 */
export const useWriteFluxSwapTreasuryScheduleOperation =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'scheduleOperation',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"unpause"`
 */
export const useWriteFluxSwapTreasuryUnpause =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'unpause',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__
 */
export const useSimulateFluxSwapTreasury =
  /*#__PURE__*/ createUseSimulateContract({ abi: fluxSwapTreasuryAbi })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"allocate"`
 */
export const useSimulateFluxSwapTreasuryAllocate =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'allocate',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"allocateETH"`
 */
export const useSimulateFluxSwapTreasuryAllocateEth =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'allocateETH',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"burnApprovedToken"`
 */
export const useSimulateFluxSwapTreasuryBurnApprovedToken =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'burnApprovedToken',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"cancelOperation"`
 */
export const useSimulateFluxSwapTreasuryCancelOperation =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'cancelOperation',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"consumeApprovedSpenderCap"`
 */
export const useSimulateFluxSwapTreasuryConsumeApprovedSpenderCap =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'consumeApprovedSpenderCap',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeApproveSpender"`
 */
export const useSimulateFluxSwapTreasuryExecuteApproveSpender =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeApproveSpender',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeEmergencyWithdraw"`
 */
export const useSimulateFluxSwapTreasuryExecuteEmergencyWithdraw =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeEmergencyWithdraw',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeEmergencyWithdrawETH"`
 */
export const useSimulateFluxSwapTreasuryExecuteEmergencyWithdrawEth =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeEmergencyWithdrawETH',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeRevokeSpender"`
 */
export const useSimulateFluxSwapTreasuryExecuteRevokeSpender =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeRevokeSpender',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeSetAllowedRecipient"`
 */
export const useSimulateFluxSwapTreasuryExecuteSetAllowedRecipient =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeSetAllowedRecipient',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeSetAllowedToken"`
 */
export const useSimulateFluxSwapTreasuryExecuteSetAllowedToken =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeSetAllowedToken',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeSetDailySpendCap"`
 */
export const useSimulateFluxSwapTreasuryExecuteSetDailySpendCap =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeSetDailySpendCap',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeSetGuardian"`
 */
export const useSimulateFluxSwapTreasuryExecuteSetGuardian =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeSetGuardian',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeSetMinDelay"`
 */
export const useSimulateFluxSwapTreasuryExecuteSetMinDelay =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeSetMinDelay',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"executeSetOperator"`
 */
export const useSimulateFluxSwapTreasuryExecuteSetOperator =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'executeSetOperator',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"pause"`
 */
export const useSimulateFluxSwapTreasuryPause =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'pause',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"pullApprovedToken"`
 */
export const useSimulateFluxSwapTreasuryPullApprovedToken =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'pullApprovedToken',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"scheduleOperation"`
 */
export const useSimulateFluxSwapTreasuryScheduleOperation =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'scheduleOperation',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `functionName` set to `"unpause"`
 */
export const useSimulateFluxSwapTreasuryUnpause =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapTreasuryAbi,
    functionName: 'unpause',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__
 */
export const useWatchFluxSwapTreasuryEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: fluxSwapTreasuryAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"AllocationExecuted"`
 */
export const useWatchFluxSwapTreasuryAllocationExecutedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'AllocationExecuted',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"AllowedRecipientUpdated"`
 */
export const useWatchFluxSwapTreasuryAllowedRecipientUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'AllowedRecipientUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"AllowedTokenUpdated"`
 */
export const useWatchFluxSwapTreasuryAllowedTokenUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'AllowedTokenUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"ApprovedSpenderCapConsumed"`
 */
export const useWatchFluxSwapTreasuryApprovedSpenderCapConsumedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'ApprovedSpenderCapConsumed',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"ApprovedSpenderTokenBurned"`
 */
export const useWatchFluxSwapTreasuryApprovedSpenderTokenBurnedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'ApprovedSpenderTokenBurned',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"ApprovedSpenderTokenPulled"`
 */
export const useWatchFluxSwapTreasuryApprovedSpenderTokenPulledEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'ApprovedSpenderTokenPulled',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"DailySpendCapUpdated"`
 */
export const useWatchFluxSwapTreasuryDailySpendCapUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'DailySpendCapUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"EmergencyWithdraw"`
 */
export const useWatchFluxSwapTreasuryEmergencyWithdrawEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'EmergencyWithdraw',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"GuardianUpdated"`
 */
export const useWatchFluxSwapTreasuryGuardianUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'GuardianUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"MinDelayUpdated"`
 */
export const useWatchFluxSwapTreasuryMinDelayUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'MinDelayUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"NativeAllocationExecuted"`
 */
export const useWatchFluxSwapTreasuryNativeAllocationExecutedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'NativeAllocationExecuted',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"NativeEmergencyWithdraw"`
 */
export const useWatchFluxSwapTreasuryNativeEmergencyWithdrawEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'NativeEmergencyWithdraw',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"NativeReceived"`
 */
export const useWatchFluxSwapTreasuryNativeReceivedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'NativeReceived',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"OperationCancelled"`
 */
export const useWatchFluxSwapTreasuryOperationCancelledEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'OperationCancelled',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"OperationExecuted"`
 */
export const useWatchFluxSwapTreasuryOperationExecutedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'OperationExecuted',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"OperationScheduled"`
 */
export const useWatchFluxSwapTreasuryOperationScheduledEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'OperationScheduled',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"OperatorUpdated"`
 */
export const useWatchFluxSwapTreasuryOperatorUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'OperatorUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"Paused"`
 */
export const useWatchFluxSwapTreasuryPausedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'Paused',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"SpenderApproved"`
 */
export const useWatchFluxSwapTreasurySpenderApprovedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'SpenderApproved',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"SpenderRevoked"`
 */
export const useWatchFluxSwapTreasurySpenderRevokedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'SpenderRevoked',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link fluxSwapTreasuryAbi}__ and `eventName` set to `"Unpaused"`
 */
export const useWatchFluxSwapTreasuryUnpausedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: fluxSwapTreasuryAbi,
    eventName: 'Unpaused',
  })
