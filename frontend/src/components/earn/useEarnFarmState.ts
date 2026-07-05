import { useMemo } from 'react';
import type { Address } from 'viem';

import { parseAmount } from '@/lib/amounts';

import type { FarmRow } from './EarnTypes';
import { ZERO_BIGINT } from './EarnUtils';

type UseEarnFarmStateParams = {
  farms: FarmRow[];
  selectedFarmAddress: Address | null;
  searchQuery: string;
  stakedOnly: boolean;
  stakeAmount: string;
  withdrawAmount: string;
};

export function useEarnFarmState({
  farms,
  selectedFarmAddress,
  searchQuery,
  stakedOnly,
  stakeAmount,
  withdrawAmount,
}: UseEarnFarmStateParams) {
  const selectedFarm = useMemo(() => {
    if (!selectedFarmAddress) {
      return null;
    }

    return farms.find((farm) => farm.poolAddress.toLowerCase() === selectedFarmAddress.toLowerCase()) ?? null;
  }, [farms, selectedFarmAddress]);

  const filteredFarms = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return farms.filter((farm) => {
      if (stakedOnly && farm.stakedBalance <= ZERO_BIGINT) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return (
        farm.label.toLowerCase().includes(normalizedQuery) ||
        farm.tokenSymbol.toLowerCase().includes(normalizedQuery) ||
        farm.poolAddress.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [farms, searchQuery, stakedOnly]);

  const totalEarnedRewards = farms.reduce((sum, farm) => sum + farm.earnedRewards, ZERO_BIGINT);
  const totalManagerPendingRewards = farms.reduce((sum, farm) => sum + farm.managerPendingRewards, ZERO_BIGINT);
  const activeFarmCount = farms.filter((farm) => farm.active).length;
  const stakedFarmCount = farms.filter((farm) => farm.stakedBalance > ZERO_BIGINT).length;

  const parsedStakeAmount = selectedFarm ? parseAmount(stakeAmount, selectedFarm.tokenDecimals) : undefined;
  const parsedWithdrawAmount = selectedFarm ? parseAmount(withdrawAmount, selectedFarm.tokenDecimals) : undefined;
  const stakeNeedsApproval = Boolean(
    selectedFarm &&
      parsedStakeAmount &&
      parsedStakeAmount > ZERO_BIGINT &&
      selectedFarm.allowance < parsedStakeAmount,
  );
  const insufficientStakeBalance = Boolean(
    selectedFarm &&
      parsedStakeAmount &&
      parsedStakeAmount > ZERO_BIGINT &&
      selectedFarm.walletBalance < parsedStakeAmount,
  );
  const insufficientWithdrawBalance = Boolean(
    selectedFarm &&
      parsedWithdrawAmount &&
      parsedWithdrawAmount > ZERO_BIGINT &&
      selectedFarm.stakedBalance < parsedWithdrawAmount,
  );
  const canClaim = Boolean(
    selectedFarm &&
      (selectedFarm.earnedRewards > ZERO_BIGINT ||
        (selectedFarm.managerPendingRewards > ZERO_BIGINT && selectedFarm.stakedBalance > ZERO_BIGINT)),
  );
  const canExit = Boolean(selectedFarm && selectedFarm.stakedBalance > ZERO_BIGINT);

  return {
    selectedFarm,
    filteredFarms,
    totalEarnedRewards,
    totalManagerPendingRewards,
    activeFarmCount,
    stakedFarmCount,
    parsedStakeAmount,
    parsedWithdrawAmount,
    stakeNeedsApproval,
    insufficientStakeBalance,
    insufficientWithdrawBalance,
    canClaim,
    canExit,
  };
}

export type EarnFarmState = ReturnType<typeof useEarnFarmState>;
