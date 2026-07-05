'use client';

import { useEffect } from 'react';
import { Wallet } from 'lucide-react';

import { PrimaryButton } from '@/components/farm/FarmPrimitives';
import { useFarmActions } from '@/components/farm/useFarmActions';
import { useFarmData } from '@/components/farm/useFarmData';
import { useFarmDerivedState } from '@/components/farm/useFarmDerivedState';
import { useFarmPageEnvironment } from '@/components/farm/useFarmPageEnvironment';
import { useFarmPageState } from '@/components/farm/useFarmPageState';
import { useFarmTransactionRunner } from '@/components/farm/useFarmTransactionRunner';
import { parseAmount } from '@/lib/amounts';

export function useFarmPageController() {
  const environment = useFarmPageEnvironment();
  const pageState = useFarmPageState();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      pageState.setMounted(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [pageState]);

  const {
    adminInfo,
    farms,
    lpPairOptions,
    singleTokenOptions,
    loading,
    error,
    lastUpdatedAt,
    loadAdminData,
  } = useFarmData({
    publicClient: environment.publicClient,
    supportedChain: environment.supportedChain,
    managerAddress: environment.managerAddress,
    factoryAddress: environment.factoryAddress,
    swapFactoryAddress: environment.swapFactoryAddress,
    wrappedNativeAddress: environment.wrappedNativeAddress,
    configuredSingleTokens: environment.configuredSingleTokens,
    lpManualMode: pageState.lpManualMode,
    singleManualMode: pageState.singleManualMode,
    setLpTokenAddress: pageState.setLpTokenAddress,
    setSingleTokenAddress: pageState.setSingleTokenAddress,
    setPoolEdits: pageState.setPoolEdits,
  });

  const parsedRewardAmount = adminInfo?.rewardToken
    ? parseAmount(pageState.rewardAmount, adminInfo.rewardToken.decimals)
    : undefined;

  const derivedState = useFarmDerivedState({
    address: environment.address,
    adminInfo,
    farms,
    mounted: pageState.mounted,
    isConnected: environment.isConnected,
    managerAddress: environment.managerAddress,
    factoryAddress: environment.factoryAddress,
    searchQuery: pageState.searchQuery,
    activeOnly: pageState.activeOnly,
    parsedRewardAmount,
  });

  const { activeAction, runTransaction } = useFarmTransactionRunner({
    publicClient: environment.publicClient,
    loadAdminData,
    onResult: pageState.setResultModal,
  });

  const actions = useFarmActions({
    factoryAddress: environment.factoryAddress,
    managerAddress: environment.managerAddress,
    localGasOverride: environment.localGasOverride,
    lpTokenAddress: pageState.lpTokenAddress,
    lpAllocPoint: pageState.lpAllocPoint,
    lpActive: pageState.lpActive,
    lpPairOptions,
    singleTokenAddress: pageState.singleTokenAddress,
    singleAllocPoint: pageState.singleAllocPoint,
    singleActive: pageState.singleActive,
    singleTokenOptions,
    rewardToken: adminInfo?.rewardToken,
    distributionBlockReason: derivedState.distributionBlockReason,
    parsedRewardAmount,
    poolEdits: pageState.poolEdits,
    writeContractAsync: environment.writeContractAsync,
    setResultModal: pageState.setResultModal,
    runTransaction: (action, title, tx) => void runTransaction(action, title, tx),
  });

  const connectButton = (
    <PrimaryButton
      onClick={environment.openConnectModal ?? undefined}
      disabled={!pageState.mounted || environment.isConnected}
    >
      <Wallet size={16} />
      连接钱包
    </PrimaryButton>
  );

  return {
    pageState,
    environment,
    adminInfo,
    farms,
    lpPairOptions,
    singleTokenOptions,
    loading,
    error,
    lastUpdatedAt,
    loadAdminData,
    activeAction,
    connectButton,
    ...derivedState,
    ...actions,
  };
}
