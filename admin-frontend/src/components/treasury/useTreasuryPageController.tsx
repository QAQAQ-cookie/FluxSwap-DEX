'use client';

import { useEffect, useMemo, useRef } from 'react';
import { zeroAddress } from 'viem';

import { useTreasuryActions } from '@/components/treasury/useTreasuryActions';
import { useTreasuryData } from '@/components/treasury/useTreasuryData';
import { useTreasuryMetadataStore } from '@/components/treasury/useTreasuryMetadataStore';
import { useTreasuryPageEnvironment } from '@/components/treasury/useTreasuryPageEnvironment';
import { useTreasuryPageState } from '@/components/treasury/useTreasuryPageState';
import { useTreasuryTransactionRunner } from '@/components/treasury/useTreasuryTransactionRunner';
import { sameAddress } from '@/components/treasury/TreasuryUtils';

export function useTreasuryPageController() {
  const environment = useTreasuryPageEnvironment();
  const pageState = useTreasuryPageState();
  const appliedPrefillKeyRef = useRef('');
  const { mounted, setMounted, setOperationKind, setBooleanValue, setSelectedTokenAddress } = pageState;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMounted(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [setMounted]);

  const whitelistPrefill = useMemo(() => {
    if (!mounted || typeof window === 'undefined') {
      return null;
    }

    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    const token = params.get('token');

    if (action !== 'setAllowedToken' || !token) {
      return null;
    }

    return {
      key: params.toString(),
      token,
      allowed: params.get('allowed') === 'false' ? 'false' : 'true',
    };
  }, [mounted]);

  const { operationMetadataById, persistMetadata, removeMetadata } = useTreasuryMetadataStore({
    chainId: environment.chainId,
    mounted,
    treasuryAddress: environment.treasuryAddress,
  });

  const {
    publicClient,
    treasuryInfo,
    tokenRows,
    operationRows,
    loading,
    error,
    loadTreasuryData,
  } = useTreasuryData({
    chainId: environment.chainId,
    supportedChain: environment.supportedChain,
    treasuryAddress: environment.treasuryAddress,
    managerAddress: environment.managerAddress,
    tokens: environment.tokens,
    operationMetadataById,
  });

  useEffect(() => {
    if (!mounted || !whitelistPrefill || appliedPrefillKeyRef.current === whitelistPrefill.key) {
      return;
    }

    const matchedToken = environment.tokens.find((token) => sameAddress(token.address, whitelistPrefill.token));

    setOperationKind('setAllowedToken');
    setBooleanValue(whitelistPrefill.allowed);

    if (matchedToken) {
      setSelectedTokenAddress(matchedToken.address);
    }

    appliedPrefillKeyRef.current = whitelistPrefill.key;
  }, [
    environment.tokens,
    mounted,
    setBooleanValue,
    setOperationKind,
    setSelectedTokenAddress,
    whitelistPrefill,
  ]);

  const walletConnected = mounted && environment.isConnected;
  const totalConfiguredAssets = tokenRows.length;
  const allowedTokenCount = tokenRows.filter((token) => token.allowed).length;
  const readyOperationCount = operationRows.filter((operation) => operation.status === 'ready').length;
  const isMultisig = walletConnected && sameAddress(environment.address, treasuryInfo?.multisig);
  const isGuardian = walletConnected && sameAddress(environment.address, treasuryInfo?.guardian);
  const isOperator = walletConnected && sameAddress(environment.address, treasuryInfo?.operator);

  const effectiveSelectedTokenAddress = pageState.selectedTokenAddress || environment.tokens[0]?.address || '';
  const selectedToken =
    environment.tokens.find((token) => sameAddress(token.address, effectiveSelectedTokenAddress)) ??
    environment.tokens[0];

  const effectiveAllocationTokenAddress = pageState.allocationTokenAddress || tokenRows[0]?.address || zeroAddress;
  const selectedAllocationToken =
    tokenRows.find((token) => sameAddress(token.address, effectiveAllocationTokenAddress)) ?? tokenRows[0];

  const effectiveDelaySeconds = pageState.delaySeconds || treasuryInfo?.minDelay.toString() || '';
  const canPause = walletConnected && (isMultisig || isGuardian) && Boolean(environment.treasuryAddress);
  const canUnpause = walletConnected && isMultisig && Boolean(environment.treasuryAddress);
  const canAllocate =
    walletConnected &&
    (isMultisig || isOperator) &&
    Boolean(environment.treasuryAddress) &&
    !treasuryInfo?.paused;

  const { activeAction, runTransaction } = useTreasuryTransactionRunner({
    publicClient,
    loadTreasuryData,
    onResult: pageState.setResultModal,
  });

  const actions = useTreasuryActions({
    publicClient,
    chainId: environment.chainId,
    treasuryAddress: environment.treasuryAddress,
    treasuryInfo: treasuryInfo ?? undefined,
    localGasOverride: environment.localGasOverride,
    mounted: pageState.mounted,
    isConnected: environment.isConnected,
    isMultisig,
    canPause,
    canUnpause,
    canAllocate,
    operationKind: pageState.operationKind,
    selectedToken,
    booleanValue: pageState.booleanValue,
    targetAddress: pageState.targetAddress,
    spenderAddress: pageState.spenderAddress,
    amountValue: pageState.amountValue,
    effectiveDelaySeconds,
    newMinDelayValue: pageState.newMinDelayValue,
    withdrawRecipientAddress: pageState.withdrawRecipientAddress,
    withdrawAmountValue: pageState.withdrawAmountValue,
    selectedAllocationToken,
    allocationRecipientAddress: pageState.allocationRecipientAddress,
    allocationAmountValue: pageState.allocationAmountValue,
    writeContractAsync: environment.writeContractAsync,
    openConnectModal: environment.openConnectModal ?? undefined,
    setResultModal: pageState.setResultModal,
    setConfirmModal: pageState.setConfirmModal,
    runTransaction: (action, title, tx, onConfirmed) => void runTransaction(action, title, tx, onConfirmed),
    persistMetadata,
    removeMetadata,
  });

  return {
    pageState,
    environment,
    publicClient,
    treasuryInfo,
    tokenRows,
    operationRows,
    loading,
    error,
    loadTreasuryData,
    walletConnected,
    totalConfiguredAssets,
    allowedTokenCount,
    readyOperationCount,
    isMultisig,
    isGuardian,
    isOperator,
    effectiveSelectedTokenAddress,
    selectedToken,
    effectiveAllocationTokenAddress,
    selectedAllocationToken,
    effectiveDelaySeconds,
    canPause,
    canUnpause,
    canAllocate,
    activeAction,
    ...actions,
  };
}
