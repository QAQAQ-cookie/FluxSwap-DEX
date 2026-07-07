'use client';

import { useCallback, useState } from 'react';
import type { Hex } from 'viem';
import type { UsePublicClientReturnType } from 'wagmi';

import { shortAddress } from '@/components/AdminPrimitives';
import type { ResultModalState } from '@/components/treasury/TreasuryModals';
import type { ActiveTreasuryAction } from '@/components/treasury/TreasuryTypes';
import { formatErrorMessage } from '@/lib/errors';

type TreasuryPublicClient = NonNullable<UsePublicClientReturnType>;

type UseTreasuryTransactionRunnerParams = {
  publicClient?: TreasuryPublicClient;
  loadTreasuryData: () => Promise<void>;
  onResult: (state: ResultModalState) => void;
};

export function useTreasuryTransactionRunner({
  publicClient,
  loadTreasuryData,
  onResult,
}: UseTreasuryTransactionRunnerParams) {
  const [activeAction, setActiveAction] = useState<ActiveTreasuryAction>(null);

  const runTransaction = useCallback(
    async (
      action: ActiveTreasuryAction,
      title: string,
      tx: () => Promise<Hex>,
      onConfirmed?: (hash: Hex) => void | Promise<void>,
    ) => {
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
        try {
          await onConfirmed?.(hash);
        } catch (syncError) {
          console.warn('sync confirmed treasury transaction failed', syncError);
        }
        onResult({
          kind: 'success',
          title,
          message: `交易已确认：${shortAddress(hash)}`,
        });
        await loadTreasuryData();
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
    [loadTreasuryData, onResult, publicClient],
  );

  return {
    activeAction,
    runTransaction,
  };
}
