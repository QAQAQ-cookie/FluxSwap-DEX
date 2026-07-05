'use client';

import { useCallback, useState } from 'react';
import type { Address, Hex } from 'viem';
import type { UsePublicClientReturnType } from 'wagmi';

import type { ActiveAction, ResultModalState } from '@/components/farm/FarmTypes';
import { shortAddress } from '@/components/farm/FarmUtils';
import { formatErrorMessage } from '@/lib/errors';

type FarmPublicClient = NonNullable<UsePublicClientReturnType>;

type UseFarmTransactionRunnerParams = {
  publicClient?: FarmPublicClient;
  loadAdminData: (options?: { background?: boolean }) => Promise<void>;
  onResult: (state: ResultModalState) => void;
};

export function useFarmTransactionRunner({
  publicClient,
  loadAdminData,
  onResult,
}: UseFarmTransactionRunnerParams) {
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);

  const runTransaction = useCallback(
    async (action: ActiveAction, title: string, tx: () => Promise<Address | Hex>) => {
      if (!publicClient) {
        onResult({
          kind: 'error',
          title: '无法提交交易',
          message: '当前 RPC 客户端尚未准备好，请稍后再试。',
        });
        return;
      }

      setActiveAction(action);

      try {
        const hash = await tx();
        await publicClient.waitForTransactionReceipt({ hash });
        onResult({
          kind: 'success',
          title,
          message: `交易已确认：${shortAddress(hash)}`,
        });
        await loadAdminData({ background: true });
      } catch (txError) {
        onResult({
          kind: 'error',
          title: '交易失败',
          message: formatErrorMessage(txError),
        });
      } finally {
        setActiveAction(null);
      }
    },
    [loadAdminData, onResult, publicClient],
  );

  return {
    activeAction,
    runTransaction,
  };
}
