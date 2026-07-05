import type { Address } from 'viem';

export type PoolTuple = readonly [Address, bigint, boolean, bigint, bigint];

export type TokenMeta = {
  address: Address;
  label: string;
  symbol: string;
  decimals: number;
  isLp: boolean;
};

export type LpPairOption = {
  address: Address;
  label: string;
  token0Symbol: string;
  token1Symbol: string;
  alreadyFarmed: boolean;
};

export type SingleTokenOption = TokenMeta & {
  alreadyFarmed: boolean;
};

export type FarmRow = {
  pid: number;
  poolAddress: Address;
  stakingToken: TokenMeta;
  rewardToken: TokenMeta;
  active: boolean;
  allocPoint: bigint;
  rewardDebt: bigint;
  pendingRewards: bigint;
  managerPendingRewards: bigint;
  totalStaked: bigint;
  rewardReserve: bigint;
  queuedRewards: bigint;
};

export type FarmPoolEdits = Record<number, { allocPoint: string; active: boolean }>;

export type TreasuryStatus = {
  paused: boolean;
  rewardBalance: bigint;
  approvedSpendRemaining: bigint;
  dailySpendCap: bigint;
  spentToday: bigint;
  multisig?: Address;
  operator?: Address;
};

export type AdminInfo = {
  factoryOwner?: Address;
  managerOwner?: Address;
  managerOperator?: Address;
  treasury?: Address;
  rewardToken?: TokenMeta;
  totalAllocPoint: bigint;
  totalPendingRewards: bigint;
  undistributedRewards: bigint;
  poolLength: number;
  activePoolCount: number;
  treasuryStatus?: TreasuryStatus;
  treasuryStatusError?: string;
};

export type ResultModalState =
  | {
      kind: 'success' | 'error';
      title: string;
      message: string;
    }
  | null;

export type ActiveAction =
  | 'create-lp'
  | 'create-single'
  | 'distribute'
  | `update-${number}`
  | null;
