'use client';

import { useMemo } from 'react';

import type {
  TokenFilterMode,
  TokenRow,
  TokenSortDirection,
  TokenSortField,
} from '@/components/tokens/TokensTypes';

type UseTokensPageDerivedStateParams = {
  tokenRows: TokenRow[];
  query: string;
  filterMode: TokenFilterMode;
  sortField: TokenSortField;
  sortDirection: TokenSortDirection;
};

function toComparableUnits(value: bigint, decimals: number) {
  if (decimals === 18) {
    return value;
  }

  if (decimals < 18) {
    return value * (BigInt(10) ** BigInt(18 - decimals));
  }

  return value / (BigInt(10) ** BigInt(decimals - 18));
}

export function useTokensPageDerivedState({
  tokenRows,
  query,
  filterMode,
  sortField,
  sortDirection,
}: UseTokensPageDerivedStateParams) {
  const normalizedQuery = query.trim().toLowerCase();

  const filteredRows = useMemo(() => {
    return tokenRows
      .filter((token) => {
        if (filterMode === 'mismatch' && !token.readFailed && !Object.values(token.mismatch).some(Boolean)) {
          return false;
        }

        if (filterMode === 'in-market' && !token.usage.hasSwapPair) {
          return false;
        }

        if (filterMode === 'single-pool' && !token.usage.inFarmSinglePoolConfig) {
          return false;
        }

        if (filterMode === 'reward-token' && !token.usage.isRewardToken) {
          return false;
        }

        if (
          filterMode === 'action-required' &&
          !(token.readFailed || token.mismatch.symbol || token.mismatch.name || token.mismatch.decimals || token.treasuryAllowed === false)
        ) {
          return false;
        }

        if (filterMode === 'treasury-allowed' && token.treasuryAllowed !== true) {
          return false;
        }

        if (filterMode === 'treasury-blocked' && token.treasuryAllowed !== false) {
          return false;
        }

        if (!normalizedQuery) {
          return true;
        }

        return (
          token.configuredSymbol.toLowerCase().includes(normalizedQuery) ||
          token.chainSymbol.toLowerCase().includes(normalizedQuery) ||
          token.configuredName.toLowerCase().includes(normalizedQuery) ||
          token.chainName.toLowerCase().includes(normalizedQuery) ||
          token.address.toLowerCase().includes(normalizedQuery)
        );
      })
      .sort((left, right) => {
        let result = 0;

        if (sortField === 'symbol') {
          result = left.configuredSymbol.localeCompare(right.configuredSymbol);
        } else if (sortField === 'supply') {
          const leftValue = toComparableUnits(left.totalSupply, left.chainDecimals);
          const rightValue = toComparableUnits(right.totalSupply, right.chainDecimals);
          result = leftValue === rightValue ? 0 : leftValue > rightValue ? 1 : -1;
        } else {
          const leftValue = toComparableUnits(left.treasuryBalance ?? BigInt(0), left.chainDecimals);
          const rightValue = toComparableUnits(right.treasuryBalance ?? BigInt(0), right.chainDecimals);
          result = leftValue === rightValue ? 0 : leftValue > rightValue ? 1 : -1;
        }

        return sortDirection === 'asc' ? result : -result;
      });
  }, [filterMode, normalizedQuery, sortDirection, sortField, tokenRows]);

  const mismatchTokenCount = useMemo(() => {
    return tokenRows.filter((token) => token.readFailed || Object.values(token.mismatch).some(Boolean)).length;
  }, [tokenRows]);

  const activeUsageTokenCount = useMemo(() => {
    return tokenRows.filter(
      (token) => token.usage.hasSwapPair || token.usage.inFarmSinglePoolConfig || token.usage.isRewardToken,
    ).length;
  }, [tokenRows]);

  return {
    filteredRows,
    mismatchTokenCount,
    activeUsageTokenCount,
  };
}
