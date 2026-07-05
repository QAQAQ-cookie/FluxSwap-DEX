import { useEarnFarmData } from './useEarnFarmData';
import { useEarnFarmModalController } from './useEarnFarmModalController';
import { buildEarnPageViewModels } from './buildEarnPageViewModels';
import { useEarnPageEnvironment } from './useEarnPageEnvironment';
import { useEarnPageState } from './useEarnPageState';

export function useEarnPageController() {
  const {
    isZh,
    chainId,
    publicClient,
    address,
    isConnected,
    openConnectModal,
    supportedChain,
    managerAddress,
    wrappedNativeAddress,
    knownTokens,
    localGasOverride,
  } = useEarnPageEnvironment();

  const pageState = useEarnPageState();
  const { farmLoading, farmError, loadFarms, farmState } = useEarnFarmData({
    environment: {
      publicClient,
      supportedChain,
      managerAddress,
      wrappedNativeAddress,
      knownTokens,
      address,
      isConnected,
    },
    pageState: {
      selectedFarmAddress: pageState.selectedFarmAddress,
      searchQuery: pageState.searchQuery,
      stakedOnly: pageState.stakedOnly,
      stakeAmount: pageState.stakeAmount,
      withdrawAmount: pageState.withdrawAmount,
    },
  });

  const {
    activeAction,
    runFarmAction,
    closeFarmModal,
    stakeButtonLabel,
    stakeButtonDisabled,
    withdrawButtonDisabled,
  } = useEarnFarmModalController({
    environment: {
      isZh,
      chainId,
      publicClient,
      address,
      isConnected,
      openConnectModal,
      localGasOverride,
    },
    farmState,
    pageState,
    loadFarms,
  });

  const {
    heroViewModel,
    farmListSectionProps,
    farmModalSectionProps,
    resultModalViewModel,
  } = buildEarnPageViewModels({
    environment: {
      isConnected,
      address,
      openConnectModal,
      supportedChain,
      managerAddress,
    },
    farmLoading,
    farmError,
    pageState,
    farmState,
    activeAction,
    closeFarmModal,
    runFarmAction,
    stakeButtonLabel,
    stakeButtonDisabled,
    withdrawButtonDisabled,
  });

  return {
    isZh,
    heroViewModel,
    farmListSectionProps,
    farmModalSectionProps,
    resultModalViewModel,
  };
}
