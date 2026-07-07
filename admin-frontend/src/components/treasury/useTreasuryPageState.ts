'use client';

import { useState } from 'react';

import type { ConfirmModalState, ResultModalState } from '@/components/treasury/TreasuryModals';
import type { TreasuryOperationKind, TreasuryOperationMetadata } from '@/components/treasury/TreasuryTypes';

export function useTreasuryPageState() {
  const [mounted, setMounted] = useState(false);
  const [resultModal, setResultModal] = useState<ResultModalState>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>(null);
  const [expandedOperationId, setExpandedOperationId] = useState<TreasuryOperationMetadata['operationId'] | null>(null);

  const [operationKind, setOperationKind] = useState<TreasuryOperationKind>('setAllowedToken');
  const [selectedTokenAddress, setSelectedTokenAddress] = useState('');
  const [booleanValue, setBooleanValue] = useState('true');
  const [targetAddress, setTargetAddress] = useState('');
  const [spenderAddress, setSpenderAddress] = useState('');
  const [amountValue, setAmountValue] = useState('');
  const [delaySeconds, setDelaySeconds] = useState('10');
  const [newMinDelayValue, setNewMinDelayValue] = useState('');
  const [withdrawRecipientAddress, setWithdrawRecipientAddress] = useState('');
  const [withdrawAmountValue, setWithdrawAmountValue] = useState('');
  const [allocationTokenAddress, setAllocationTokenAddress] = useState('');
  const [allocationRecipientAddress, setAllocationRecipientAddress] = useState('');
  const [allocationAmountValue, setAllocationAmountValue] = useState('');

  return {
    mounted,
    setMounted,
    resultModal,
    setResultModal,
    confirmModal,
    setConfirmModal,
    expandedOperationId,
    setExpandedOperationId,
    operationKind,
    setOperationKind,
    selectedTokenAddress,
    setSelectedTokenAddress,
    booleanValue,
    setBooleanValue,
    targetAddress,
    setTargetAddress,
    spenderAddress,
    setSpenderAddress,
    amountValue,
    setAmountValue,
    delaySeconds,
    setDelaySeconds,
    newMinDelayValue,
    setNewMinDelayValue,
    withdrawRecipientAddress,
    setWithdrawRecipientAddress,
    withdrawAmountValue,
    setWithdrawAmountValue,
    allocationTokenAddress,
    setAllocationTokenAddress,
    allocationRecipientAddress,
    setAllocationRecipientAddress,
    allocationAmountValue,
    setAllocationAmountValue,
  };
}
