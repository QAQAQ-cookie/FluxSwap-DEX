'use client';

import type { Address } from 'viem';

export type PoolTuple = readonly [Address, bigint, boolean, bigint, bigint];

export type TokenMeta = {
  label: string;
  symbol: string;
  decimals: number;
};

export type FarmWeightSlice = {
  label: string;
  poolAddress: Address;
  allocPoint: bigint;
  active: boolean;
  totalStaked: bigint;
  stakingDecimals: number;
  stakingSymbol: string;
};

export type OperationBucket = {
  label: string;
  startBlock: bigint;
  endBlock: bigint;
  startTimeMs: number;
  endTimeMs: number;
  farm: number;
  treasury: number;
};

export type OperationWindow = {
  fromBlock: bigint;
  toBlock: bigint;
  fromTimeMs: number;
  toTimeMs: number;
};

export type OverviewData = {
  poolLength: number;
  activePoolCount: number;
  totalAllocPoint: bigint;
  totalPendingRewards: bigint;
  undistributedRewards: bigint;
  rewardTokenSymbol: string;
  rewardTokenDecimals: number;
  rewardTokenAddress: Address;
  treasuryAddress: Address;
  treasuryPaused: boolean;
  treasuryRewardBalance: bigint;
  treasuryApprovedSpendRemaining: bigint;
  configuredTokenCount: number;
  allowedTokenCount: number;
  recentFarmEvents: number;
  recentTreasuryEvents: number;
  farmWeightSlices: FarmWeightSlice[];
  operationBuckets: OperationBucket[];
  operationWindow: OperationWindow;
};

export type Tone = 'success' | 'warning' | 'danger' | 'neutral';

export type ProtocolNode = {
  label: string;
  value: string;
  detail: string;
  tone: Tone;
  href: string;
  icon: React.ReactNode;
};

export type ActionItem = {
  title: string;
  detail: string;
  tone: Tone;
};
