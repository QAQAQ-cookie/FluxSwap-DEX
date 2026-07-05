'use client';

import { useMemo } from 'react';
import type { Address } from 'viem';

import type { AdminInfo, FarmRow } from '@/components/farm/FarmTypes';
import { REWARD_PRECISION, ZERO_BIGINT, sameAddress } from '@/components/farm/FarmUtils';

type UseFarmDerivedStateParams = {
  address?: Address;
  adminInfo?: AdminInfo | null;
  farms: FarmRow[];
  mounted: boolean;
  isConnected: boolean;
  managerAddress?: Address;
  factoryAddress?: Address;
  searchQuery: string;
  activeOnly: boolean;
  parsedRewardAmount?: bigint;
};

export function useFarmDerivedState({
  address,
  adminInfo,
  farms,
  mounted,
  isConnected,
  managerAddress,
  factoryAddress,
  searchQuery,
  activeOnly,
  parsedRewardAmount,
}: UseFarmDerivedStateParams) {
  const isFactoryOwner = sameAddress(address, adminInfo?.factoryOwner);
  const isManagerOwner = sameAddress(address, adminInfo?.managerOwner);
  const isManagerOperator = sameAddress(address, adminInfo?.managerOperator);
  const canCreatePool = mounted && isConnected && isFactoryOwner && Boolean(factoryAddress);
  const canUpdatePool = mounted && isConnected && isManagerOwner && Boolean(managerAddress);
  const canDistribute = mounted && isConnected && (isManagerOwner || isManagerOperator) && Boolean(managerAddress);

  const activeFarmCount = useMemo(() => farms.filter((farm) => farm.active).length, [farms]);

  const dailySpendRemaining = useMemo(() => {
    const treasuryStatus = adminInfo?.treasuryStatus;
    if (!treasuryStatus || treasuryStatus.dailySpendCap <= ZERO_BIGINT) {
      return undefined;
    }

    return treasuryStatus.dailySpendCap > treasuryStatus.spentToday
      ? treasuryStatus.dailySpendCap - treasuryStatus.spentToday
      : ZERO_BIGINT;
  }, [adminInfo?.treasuryStatus]);

  const distributionBlockReason = useMemo(() => {
    if (!mounted) {
      return '页面正在初始化。';
    }
    if (!isConnected) {
      return '请先连接钱包。';
    }
    if (!isManagerOwner && !isManagerOperator) {
      return '当前钱包不是管理合约的所有者或操作员，不能分发奖励。';
    }
    if (!managerAddress || !adminInfo?.rewardToken) {
      return '奖励合约信息尚未加载完成。';
    }
    if (adminInfo.totalAllocPoint <= ZERO_BIGINT || adminInfo.activePoolCount <= 0) {
      return '暂无可分发农场，请先创建并启用质押池。';
    }
    if (adminInfo.treasuryStatusError || !adminInfo.treasuryStatus) {
      return adminInfo.treasuryStatusError ?? '金库状态尚未加载完成。';
    }
    if (adminInfo.treasuryStatus.paused) {
      return '金库当前处于暂停状态，暂时不能拉取奖励。';
    }
    if (!parsedRewardAmount || parsedRewardAmount <= ZERO_BIGINT) {
      return '请输入大于 0 的奖励数量。';
    }
    if (parsedRewardAmount > adminInfo.treasuryStatus.rewardBalance) {
      return '金库奖励代币余额不足。';
    }
    if (parsedRewardAmount > adminInfo.treasuryStatus.approvedSpendRemaining) {
      return '金库授权给管理合约的可拉取额度不足。';
    }
    if (dailySpendRemaining !== undefined && parsedRewardAmount > dailySpendRemaining) {
      return '本日金库支出剩余额度不足。';
    }
    if (((parsedRewardAmount + adminInfo.undistributedRewards) * REWARD_PRECISION) / adminInfo.totalAllocPoint <= ZERO_BIGINT) {
      return '本次奖励数量太小，按当前总权重分配后会被链上拒绝。';
    }

    return null;
  }, [
    adminInfo,
    dailySpendRemaining,
    isConnected,
    isManagerOperator,
    isManagerOwner,
    managerAddress,
    mounted,
    parsedRewardAmount,
  ]);

  const filteredFarms = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return farms.filter((farm) => {
      if (activeOnly && !farm.active) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return (
        farm.stakingToken.label.toLowerCase().includes(normalizedQuery) ||
        farm.poolAddress.toLowerCase().includes(normalizedQuery) ||
        farm.stakingToken.address.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [activeOnly, farms, searchQuery]);

  return {
    isFactoryOwner,
    isManagerOwner,
    isManagerOperator,
    canCreatePool,
    canUpdatePool,
    canDistribute,
    activeFarmCount,
    dailySpendRemaining,
    distributionBlockReason,
    canSubmitDistribution: canDistribute && distributionBlockReason === null,
    filteredFarms,
  };
}
