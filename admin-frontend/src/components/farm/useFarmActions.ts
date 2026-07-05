'use client';

import type { Address } from 'viem';

import type { RunFarmTransaction, SetFarmResultModal, WriteContractAsync } from '@/components/farm/FarmActionTypes';
import type { FarmPoolEdits, LpPairOption, SingleTokenOption, TokenMeta } from '@/components/farm/FarmTypes';
import { useFarmCreatePoolActions } from '@/components/farm/useFarmCreatePoolActions';
import { useFarmRewardActions } from '@/components/farm/useFarmRewardActions';
import { useFarmUpdatePoolActions } from '@/components/farm/useFarmUpdatePoolActions';

type UseFarmActionsParams = {
  factoryAddress?: Address;
  managerAddress?: Address;
  localGasOverride: { gas?: bigint };
  lpTokenAddress: string;
  lpAllocPoint: string;
  lpActive: boolean;
  lpPairOptions: LpPairOption[];
  singleTokenAddress: string;
  singleAllocPoint: string;
  singleActive: boolean;
  singleTokenOptions: SingleTokenOption[];
  rewardToken?: TokenMeta;
  distributionBlockReason: string | null;
  parsedRewardAmount?: bigint;
  poolEdits: FarmPoolEdits;
  writeContractAsync: WriteContractAsync;
  setResultModal: SetFarmResultModal;
  runTransaction: RunFarmTransaction;
};

export function useFarmActions({
  factoryAddress,
  managerAddress,
  localGasOverride,
  lpTokenAddress,
  lpAllocPoint,
  lpActive,
  lpPairOptions,
  singleTokenAddress,
  singleAllocPoint,
  singleActive,
  singleTokenOptions,
  rewardToken,
  distributionBlockReason,
  parsedRewardAmount,
  poolEdits,
  writeContractAsync,
  setResultModal,
  runTransaction,
}: UseFarmActionsParams) {
  const createPoolActions = useFarmCreatePoolActions({
    factoryAddress,
    localGasOverride,
    lpTokenAddress,
    lpAllocPoint,
    lpActive,
    lpPairOptions,
    singleTokenAddress,
    singleAllocPoint,
    singleActive,
    singleTokenOptions,
    writeContractAsync,
    setResultModal,
    runTransaction,
  });
  const rewardActions = useFarmRewardActions({
    managerAddress,
    localGasOverride,
    rewardToken,
    distributionBlockReason,
    parsedRewardAmount,
    writeContractAsync,
    setResultModal,
    runTransaction,
  });
  const updatePoolActions = useFarmUpdatePoolActions({
    managerAddress,
    localGasOverride,
    poolEdits,
    writeContractAsync,
    setResultModal,
    runTransaction,
  });

  return {
    ...createPoolActions,
    ...rewardActions,
    ...updatePoolActions,
  };
}
