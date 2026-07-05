import type { Address, Hex } from 'viem';

export type ActiveTreasuryAction =
  | 'schedule'
  | 'allocate'
  | 'pause'
  | 'unpause'
  | `execute:${string}`
  | `cancel:${string}`
  | null;

export type TreasuryInfo = {
  address: Address;
  multisig: Address;
  guardian: Address;
  operator: Address;
  minDelay: bigint;
  paused: boolean;
};

export type TreasuryTokenRow = {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  balance: bigint;
  approvedSpendRemaining: bigint;
  dailySpendCap: bigint;
  spentToday: bigint;
  allowed: boolean;
  isNative?: boolean;
};

export type TreasuryOperationKind =
  | 'setAllowedToken'
  | 'setAllowedRecipient'
  | 'setDailySpendCap'
  | 'approveSpender'
  | 'revokeSpender'
  | 'setGuardian'
  | 'setOperator'
  | 'setMinDelay'
  | 'emergencyWithdraw'
  | 'emergencyWithdrawETH';

export type TreasuryOperationMetadata = {
  version: 1;
  chainId: number;
  treasuryAddress: Address;
  operationId: Hex;
  kind: TreasuryOperationKind;
  label: string;
  summary: string;
  params: {
    token?: Address;
    tokenSymbol?: string;
    allowed?: boolean;
    recipient?: Address;
    spender?: Address;
    amountUnits?: string;
    amountDisplay?: string;
    newGuardian?: Address;
    newOperator?: Address;
    newMinDelay?: string;
    withdrawToken?: Address;
    withdrawTokenSymbol?: string;
    withdrawTokenDecimals?: number;
    withdrawRecipient?: Address;
    withdrawAmountUnits?: string;
    withdrawAmountDisplay?: string;
  };
  createdAt: number;
};

export type TreasuryOperationRow = {
  operationId: Hex;
  executeAfter: bigint;
  scheduler?: Address;
  status: 'pending' | 'ready';
  blockNumber: bigint;
  metadata?: TreasuryOperationMetadata;
};
