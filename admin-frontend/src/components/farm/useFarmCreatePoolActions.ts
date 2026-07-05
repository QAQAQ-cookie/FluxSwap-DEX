'use client';

import { useCallback } from 'react';
import { isAddress, type Address } from 'viem';

import type { RunFarmTransaction, SetFarmResultModal, WriteContractAsync } from '@/components/farm/FarmActionTypes';
import type { LpPairOption, SingleTokenOption } from '@/components/farm/FarmTypes';
import { parseAllocPoint, sameAddress } from '@/components/farm/FarmUtils';
import { fluxPoolFactoryAbi } from '@/lib/contracts';

type UseFarmCreatePoolActionsParams = {
  factoryAddress?: Address;
  localGasOverride: { gas?: bigint };
  lpTokenAddress: string;
  lpAllocPoint: string;
  lpActive: boolean;
  lpPairOptions: LpPairOption[];
  singleTokenAddress: string;
  singleAllocPoint: string;
  singleActive: boolean;
  singleTokenOptions: SingleTokenOption[];
  writeContractAsync: WriteContractAsync;
  setResultModal: SetFarmResultModal;
  runTransaction: RunFarmTransaction;
};

export function useFarmCreatePoolActions({
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
}: UseFarmCreatePoolActionsParams) {
  const handleCreateLpPool = useCallback(() => {
    if (!factoryAddress || !isAddress(lpTokenAddress)) {
      setResultModal({ kind: 'error', title: '参数无效', message: '请输入有效的 LP 代币地址。' });
      return;
    }

    const selectedPair = lpPairOptions.find((option) => sameAddress(option.address, lpTokenAddress));
    if (selectedPair?.alreadyFarmed) {
      setResultModal({ kind: 'error', title: '创建失败', message: `${selectedPair.label} 已经创建过质押池。` });
      return;
    }

    const allocPoint = parseAllocPoint(lpAllocPoint);
    if (allocPoint === null) {
      setResultModal({ kind: 'error', title: '参数无效', message: '奖励权重请输入 1 到 1,000,000 之间的整数。' });
      return;
    }

    runTransaction('create-lp', '已创建 LP 质押池', () =>
      writeContractAsync({
        address: factoryAddress,
        abi: fluxPoolFactoryAbi,
        functionName: 'createLPPool',
        args: [lpTokenAddress as Address, allocPoint, lpActive],
        ...localGasOverride,
      }),
    );
  }, [
    factoryAddress,
    localGasOverride,
    lpActive,
    lpAllocPoint,
    lpPairOptions,
    lpTokenAddress,
    runTransaction,
    setResultModal,
    writeContractAsync,
  ]);

  const handleCreateSinglePool = useCallback(() => {
    if (!factoryAddress || !isAddress(singleTokenAddress)) {
      setResultModal({ kind: 'error', title: '参数无效', message: '请输入有效的单币代币地址。' });
      return;
    }

    const selectedToken = singleTokenOptions.find((option) => sameAddress(option.address, singleTokenAddress));
    if (selectedToken?.alreadyFarmed) {
      setResultModal({ kind: 'error', title: '创建失败', message: `${selectedToken.symbol} 已经创建过质押池。` });
      return;
    }

    const allocPoint = parseAllocPoint(singleAllocPoint);
    if (allocPoint === null) {
      setResultModal({ kind: 'error', title: '参数无效', message: '奖励权重请输入 1 到 1,000,000 之间的整数。' });
      return;
    }

    runTransaction('create-single', '已创建单币质押池', () =>
      writeContractAsync({
        address: factoryAddress,
        abi: fluxPoolFactoryAbi,
        functionName: 'createSingleTokenPool',
        args: [singleTokenAddress as Address, allocPoint, singleActive],
        ...localGasOverride,
      }),
    );
  }, [
    factoryAddress,
    localGasOverride,
    runTransaction,
    setResultModal,
    singleActive,
    singleAllocPoint,
    singleTokenOptions,
    singleTokenAddress,
    writeContractAsync,
  ]);

  return {
    handleCreateLpPool,
    handleCreateSinglePool,
  };
}
