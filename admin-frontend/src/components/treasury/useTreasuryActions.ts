'use client';

import { useCallback } from 'react';
import type { Address, Hex } from 'viem';
import type { UsePublicClientReturnType, UseWriteContractReturnType } from 'wagmi';

import { shortAddress } from '@/components/AdminPrimitives';
import { submitTreasuryAllocation } from '@/components/treasury/TreasuryAllocationSubmit';
import type { ConfirmModalState, ResultModalState } from '@/components/treasury/TreasuryModals';
import { buildTreasuryOperationDraft } from '@/components/treasury/TreasuryOperationDraft';
import { buildTreasuryExecutionRequest } from '@/components/treasury/TreasuryOperationExecution';
import type {
  ActiveTreasuryAction,
  TreasuryInfo,
  TreasuryOperationKind,
  TreasuryOperationMetadata,
  TreasuryOperationRow,
  TreasuryTokenRow,
} from '@/components/treasury/TreasuryTypes';
import { ZERO_BIGINT } from '@/components/treasury/TreasuryUtils';
import type { AdminTokenOption } from '@/config/tokens';
import { fluxSwapTreasuryAbi } from '@/lib/contracts';

type TreasuryPublicClient = NonNullable<UsePublicClientReturnType>;
type WriteContractAsync = UseWriteContractReturnType['writeContractAsync'];

type RunTreasuryTransaction = (
  action: ActiveTreasuryAction,
  title: string,
  tx: () => Promise<Hex>,
  onConfirmed?: () => void,
) => void;

type UseTreasuryActionsParams = {
  publicClient?: TreasuryPublicClient;
  chainId: number;
  treasuryAddress?: Address;
  treasuryInfo?: TreasuryInfo;
  localGasOverride: { gas?: bigint };
  mounted: boolean;
  isConnected: boolean;
  isMultisig: boolean;
  canPause: boolean;
  canUnpause: boolean;
  canAllocate: boolean;
  operationKind: TreasuryOperationKind;
  selectedToken?: AdminTokenOption;
  booleanValue: string;
  targetAddress: string;
  spenderAddress: string;
  amountValue: string;
  effectiveDelaySeconds: string;
  newMinDelayValue: string;
  withdrawRecipientAddress: string;
  withdrawAmountValue: string;
  selectedAllocationToken?: TreasuryTokenRow;
  allocationRecipientAddress: string;
  allocationAmountValue: string;
  writeContractAsync: WriteContractAsync;
  openConnectModal?: () => void;
  setResultModal: (state: ResultModalState) => void;
  setConfirmModal: (state: ConfirmModalState) => void;
  runTransaction: RunTreasuryTransaction;
  persistMetadata: (metadata: TreasuryOperationMetadata) => void;
  removeMetadata: (operationId: Hex) => void;
};

export function useTreasuryActions({
  publicClient,
  chainId,
  treasuryAddress,
  treasuryInfo,
  localGasOverride,
  mounted,
  isConnected,
  isMultisig,
  canPause,
  canUnpause,
  canAllocate,
  operationKind,
  selectedToken,
  booleanValue,
  targetAddress,
  spenderAddress,
  amountValue,
  effectiveDelaySeconds,
  newMinDelayValue,
  withdrawRecipientAddress,
  withdrawAmountValue,
  selectedAllocationToken,
  allocationRecipientAddress,
  allocationAmountValue,
  writeContractAsync,
  openConnectModal,
  setResultModal,
  setConfirmModal,
  runTransaction,
  persistMetadata,
  removeMetadata,
}: UseTreasuryActionsParams) {
  const buildOperationDraft = useCallback(async (): Promise<TreasuryOperationMetadata | null> => {
    return buildTreasuryOperationDraft({
      publicClient,
      chainId,
      treasuryAddress,
      treasuryMinDelay: treasuryInfo?.minDelay,
      operationKind,
      selectedToken,
      booleanValue,
      targetAddress,
      spenderAddress,
      amountValue,
      effectiveDelaySeconds,
      newMinDelayValue,
      withdrawRecipientAddress,
      withdrawAmountValue,
      onError: setResultModal,
    });
  }, [
    amountValue,
    booleanValue,
    chainId,
    effectiveDelaySeconds,
    newMinDelayValue,
    operationKind,
    publicClient,
    selectedToken,
    setResultModal,
    spenderAddress,
    targetAddress,
    treasuryAddress,
    treasuryInfo?.minDelay,
    withdrawAmountValue,
    withdrawRecipientAddress,
  ]);

  const handleScheduleOperation = useCallback(async () => {
    if (!treasuryAddress) {
      setResultModal({ kind: 'error', title: '暂无法创建操作', message: '金库合约地址尚未加载完成。' });
      return;
    }

    if (!mounted || !isConnected) {
      openConnectModal?.();
      return;
    }

    if (!isMultisig) {
      setResultModal({
        kind: 'error',
        title: '权限不足',
        message: '只有当前金库的多签钱包可以排队治理操作。',
      });
      return;
    }

    const draft = await buildOperationDraft();
    if (!draft) {
      return;
    }

    const delay = effectiveDelaySeconds.trim() ? BigInt(effectiveDelaySeconds.trim()) : (treasuryInfo?.minDelay ?? ZERO_BIGINT);

    runTransaction(
      'schedule',
      '已提交治理操作',
      () =>
        writeContractAsync({
          address: treasuryAddress,
          abi: fluxSwapTreasuryAbi,
          functionName: 'scheduleOperation',
          args: [draft.operationId, delay],
          ...localGasOverride,
        }),
      () => persistMetadata(draft),
    );
  }, [
    buildOperationDraft,
    effectiveDelaySeconds,
    isConnected,
    isMultisig,
    localGasOverride,
    mounted,
    openConnectModal,
    persistMetadata,
    runTransaction,
    setResultModal,
    treasuryAddress,
    treasuryInfo?.minDelay,
    writeContractAsync,
  ]);

  const submitPauseToggle = useCallback(() => {
    if (!treasuryAddress || !treasuryInfo) {
      return;
    }

    if (!mounted || !isConnected) {
      openConnectModal?.();
      return;
    }

    if (treasuryInfo.paused) {
      if (!canUnpause) {
        setResultModal({ kind: 'error', title: '权限不足', message: '只有多签钱包可以恢复金库。' });
        return;
      }

      runTransaction('unpause', '已恢复金库', () =>
        writeContractAsync({
          address: treasuryAddress,
          abi: fluxSwapTreasuryAbi,
          functionName: 'unpause',
          ...localGasOverride,
        }),
      );
      return;
    }

    if (!canPause) {
      setResultModal({ kind: 'error', title: '权限不足', message: '只有守护者或多签钱包可以暂停金库。' });
      return;
    }

    runTransaction('pause', '已暂停金库', () =>
      writeContractAsync({
        address: treasuryAddress,
        abi: fluxSwapTreasuryAbi,
        functionName: 'pause',
        ...localGasOverride,
      }),
    );
  }, [
    canPause,
    canUnpause,
    isConnected,
    localGasOverride,
    mounted,
    openConnectModal,
    runTransaction,
    setResultModal,
    treasuryAddress,
    treasuryInfo,
    writeContractAsync,
  ]);

  const submitAllocation = useCallback(() => {
    void submitTreasuryAllocation({
      treasuryAddress,
      selectedToken: selectedAllocationToken,
      publicClient,
      mounted,
      isConnected,
      canAllocate,
      paused: treasuryInfo?.paused,
      recipientAddress: allocationRecipientAddress,
      amountValue: allocationAmountValue,
      localGasOverride,
      writeContractAsync,
      openConnectModal,
      onError: setResultModal,
      runTransaction: (action, title, tx) => runTransaction(action, title, tx),
    });
  }, [
    allocationAmountValue,
    allocationRecipientAddress,
    canAllocate,
    isConnected,
    localGasOverride,
    mounted,
    openConnectModal,
    publicClient,
    runTransaction,
    selectedAllocationToken,
    setResultModal,
    treasuryAddress,
    treasuryInfo?.paused,
    writeContractAsync,
  ]);

  const handlePauseToggle = useCallback(() => {
    setConfirmModal({
      title: treasuryInfo?.paused ? '确认恢复金库' : '确认暂停金库',
      message: treasuryInfo?.paused
        ? '恢复后，金库会重新允许相关业务动作继续执行。'
        : '暂停后，依赖金库的拉取和业务执行会被阻断，请确认当前是紧急处理场景。',
      tone: treasuryInfo?.paused ? 'default' : 'danger',
      confirmLabel: treasuryInfo?.paused ? '确认恢复' : '确认暂停',
      action: () => {
        submitPauseToggle();
      },
    });
  }, [setConfirmModal, submitPauseToggle, treasuryInfo?.paused]);

  const handleAllocation = useCallback(() => {
    if (!mounted || !isConnected) {
      openConnectModal?.();
      return;
    }

    if (!selectedAllocationToken) {
      setResultModal({ kind: 'error', title: '暂无法划拨', message: '请选择需要划拨的金库资产。' });
      return;
    }

    setConfirmModal({
      title: '确认划拨金库资产',
      message: `将划拨 ${allocationAmountValue || '0'} ${selectedAllocationToken.symbol} 到 ${shortAddress(
        allocationRecipientAddress,
      )}。该动作会立即走链上交易，并消耗对应资产的每日额度。`,
      tone: 'danger',
      confirmLabel: '确认划拨',
      action: () => {
        submitAllocation();
      },
    });
  }, [
    allocationAmountValue,
    allocationRecipientAddress,
    isConnected,
    mounted,
    openConnectModal,
    selectedAllocationToken,
    setConfirmModal,
    setResultModal,
    submitAllocation,
  ]);

  const submitCancelOperation = useCallback(
    (operation: TreasuryOperationRow) => {
      if (!treasuryAddress) {
        return;
      }

      if (!mounted || !isConnected) {
        openConnectModal?.();
        return;
      }

      if (!isMultisig) {
        setResultModal({ kind: 'error', title: '权限不足', message: '只有多签钱包可以取消治理操作。' });
        return;
      }

      runTransaction(
        `cancel:${operation.operationId}`,
        '已取消治理操作',
        () =>
          writeContractAsync({
            address: treasuryAddress,
            abi: fluxSwapTreasuryAbi,
            functionName: 'cancelOperation',
            args: [operation.operationId],
            ...localGasOverride,
          }),
        () => removeMetadata(operation.operationId),
      );
    },
    [
      isConnected,
      isMultisig,
      localGasOverride,
      mounted,
      openConnectModal,
      removeMetadata,
      runTransaction,
      setResultModal,
      treasuryAddress,
      writeContractAsync,
    ],
  );

  const handleCancelOperation = useCallback(
    (operation: TreasuryOperationRow) => {
      setConfirmModal({
        title: '确认取消治理操作',
        message: `将取消操作 ${shortAddress(operation.operationId)}，取消后如果仍要执行，需要重新由多签排队。`,
        tone: 'danger',
        confirmLabel: '确认取消',
        action: () => {
          submitCancelOperation(operation);
        },
      });
    },
    [setConfirmModal, submitCancelOperation],
  );

  const submitExecuteOperation = useCallback(
    (operation: TreasuryOperationRow) => {
      if (!treasuryAddress) {
        return;
      }

      const metadata = operation.metadata;
      if (!metadata) {
        setResultModal({
          kind: 'error',
          title: '缺少操作参数',
          message: '链上事件只记录操作 ID 和时间，不包含具体参数。该操作不是从当前管理端创建的，暂不能直接执行。',
        });
        return;
      }

      if (operation.status !== 'ready') {
        setResultModal({ kind: 'error', title: '暂不可执行', message: '该操作还没有到治理延迟时间。' });
        return;
      }

      const action = `execute:${operation.operationId}` as const;
      const executionRequest = buildTreasuryExecutionRequest({
        metadata,
        operationId: operation.operationId,
        treasuryAddress,
        localGasOverride,
        writeContractAsync,
      });

      if (executionRequest) {
        runTransaction(action, executionRequest.title, executionRequest.tx, () => removeMetadata(operation.operationId));
        return;
      }

      setResultModal({ kind: 'error', title: '参数不完整', message: '该操作的本地参数记录不完整，不能安全执行。' });
    },
    [localGasOverride, removeMetadata, runTransaction, setResultModal, treasuryAddress, writeContractAsync],
  );

  const handleExecuteOperation = useCallback(
    (operation: TreasuryOperationRow) => {
      const summary = operation.metadata?.summary ?? '该操作缺少本地参数记录';

      setConfirmModal({
        title: '确认执行治理操作',
        message: `${summary}。执行后会立即消耗链上的 operationId，且本地参数记录也会一并清理。`,
        tone: 'danger',
        confirmLabel: '确认执行',
        action: () => {
          submitExecuteOperation(operation);
        },
      });
    },
    [setConfirmModal, submitExecuteOperation],
  );

  return {
    handleScheduleOperation,
    handlePauseToggle,
    handleAllocation,
    handleCancelOperation,
    handleExecuteOperation,
  };
}
