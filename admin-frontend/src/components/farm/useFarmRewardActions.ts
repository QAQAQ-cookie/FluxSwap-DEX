'use client';

import { useCallback } from 'react';
import type { Address } from 'viem';

import type { RunFarmTransaction, SetFarmResultModal, WriteContractAsync } from '@/components/farm/FarmActionTypes';
import type { TokenMeta } from '@/components/farm/FarmTypes';
import { fluxMultiPoolManagerAbi } from '@/lib/contracts';

type UseFarmRewardActionsParams = {
  managerAddress?: Address;
  localGasOverride: { gas?: bigint };
  rewardToken?: TokenMeta;
  distributionBlockReason: string | null;
  parsedRewardAmount?: bigint;
  writeContractAsync: WriteContractAsync;
  setResultModal: SetFarmResultModal;
  runTransaction: RunFarmTransaction;
};

export function useFarmRewardActions({
  managerAddress,
  localGasOverride,
  rewardToken,
  distributionBlockReason,
  parsedRewardAmount,
  writeContractAsync,
  setResultModal,
  runTransaction,
}: UseFarmRewardActionsParams) {
  const handleDistributeRewards = useCallback(() => {
    if (!managerAddress || !rewardToken) {
      setResultModal({ kind: 'error', title: '暂不可分发', message: '奖励信息尚未加载完成。' });
      return;
    }

    if (distributionBlockReason || !parsedRewardAmount) {
      setResultModal({
        kind: 'error',
        title: '暂不可分发',
        message: distributionBlockReason ?? '请输入有效的奖励数量。',
      });
      return;
    }

    runTransaction('distribute', '已分发奖励', () =>
      writeContractAsync({
        address: managerAddress,
        abi: fluxMultiPoolManagerAbi,
        functionName: 'distributeRewards',
        args: [parsedRewardAmount],
        ...localGasOverride,
      }),
    );
  }, [
    distributionBlockReason,
    localGasOverride,
    managerAddress,
    parsedRewardAmount,
    rewardToken,
    runTransaction,
    setResultModal,
    writeContractAsync,
  ]);

  return {
    handleDistributeRewards,
  };
}
