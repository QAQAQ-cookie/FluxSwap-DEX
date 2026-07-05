'use client';

import { useCallback } from 'react';
import type { Address } from 'viem';

import type { RunFarmTransaction, SetFarmResultModal, WriteContractAsync } from '@/components/farm/FarmActionTypes';
import type { FarmPoolEdits, FarmRow } from '@/components/farm/FarmTypes';
import { parseAllocPoint } from '@/components/farm/FarmUtils';
import { fluxMultiPoolManagerAbi } from '@/lib/contracts';

type UseFarmUpdatePoolActionsParams = {
  managerAddress?: Address;
  localGasOverride: { gas?: bigint };
  poolEdits: FarmPoolEdits;
  writeContractAsync: WriteContractAsync;
  setResultModal: SetFarmResultModal;
  runTransaction: RunFarmTransaction;
};

export function useFarmUpdatePoolActions({
  managerAddress,
  localGasOverride,
  poolEdits,
  writeContractAsync,
  setResultModal,
  runTransaction,
}: UseFarmUpdatePoolActionsParams) {
  const handleUpdatePool = useCallback(
    (farm: FarmRow) => {
      if (!managerAddress) {
        return;
      }

      const edit = poolEdits[farm.pid];
      const allocPoint = parseAllocPoint(edit?.allocPoint ?? '');
      if (allocPoint === null) {
        setResultModal({ kind: 'error', title: '参数无效', message: '奖励权重请输入 1 到 1,000,000 之间的整数。' });
        return;
      }

      runTransaction(`update-${farm.pid}`, '已更新农场配置', () =>
        writeContractAsync({
          address: managerAddress,
          abi: fluxMultiPoolManagerAbi,
          functionName: 'setPool',
          args: [BigInt(farm.pid), allocPoint, edit?.active ?? farm.active],
          ...localGasOverride,
        }),
      );
    },
    [localGasOverride, managerAddress, poolEdits, runTransaction, setResultModal, writeContractAsync],
  );

  return {
    handleUpdatePool,
  };
}
