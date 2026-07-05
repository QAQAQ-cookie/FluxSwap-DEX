'use client';

import type { Address } from 'viem';

export type TokenUsage = {
  inWalletConfig: boolean;
  inFarmSinglePoolConfig: boolean;
  isRewardToken: boolean;
  hasSwapPair: boolean;
};

export type TokenMismatch = {
  symbol: boolean;
  name: boolean;
  decimals: boolean;
};

export type TokenRow = {
  address: Address;
  configuredSymbol: string;
  configuredName: string;
  configuredDecimals: number;
  chainSymbol: string;
  chainName: string;
  chainDecimals: number;
  totalSupply: bigint;
  treasuryAllowed?: boolean;
  treasuryBalance?: bigint;
  usage: TokenUsage;
  mismatch: TokenMismatch;
  readFailed: boolean;
};

export type TokenFilterMode =
  | 'all'
  | 'mismatch'
  | 'treasury-allowed'
  | 'treasury-blocked'
  | 'in-market'
  | 'single-pool'
  | 'reward-token'
  | 'action-required';
export type TokenSortField = 'symbol' | 'supply' | 'treasuryBalance';
export type TokenSortDirection = 'asc' | 'desc';
