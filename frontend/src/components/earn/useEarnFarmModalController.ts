import { useEarnFarmActions } from './useEarnFarmActions';
import { useEarnFarmUiState } from './useEarnFarmUiState';
import type { EarnPageEnvironment } from './useEarnPageEnvironment';
import type { EarnFarmState } from './useEarnFarmState';
import type { EarnPageState } from './useEarnPageState';

type UseEarnFarmModalControllerParams = {
  environment: Pick<
    EarnPageEnvironment,
    'isZh' | 'chainId' | 'publicClient' | 'address' | 'isConnected' | 'openConnectModal' | 'localGasOverride'
  >;
  farmState: EarnFarmState;
  pageState: EarnPageState;
  loadFarms: (options?: { background?: boolean }) => Promise<void>;
};

export function useEarnFarmModalController({
  environment,
  farmState,
  pageState,
  loadFarms,
}: UseEarnFarmModalControllerParams) {
  const { activeAction, runFarmAction } = useEarnFarmActions({
    isConnected: environment.isConnected,
    address: environment.address,
    openConnectModal: environment.openConnectModal,
    selectedFarm: farmState.selectedFarm,
    publicClient: environment.publicClient,
    parsedStakeAmount: farmState.parsedStakeAmount,
    parsedWithdrawAmount: farmState.parsedWithdrawAmount,
    chainId: environment.chainId,
    localGasOverride: environment.localGasOverride,
    isZh: environment.isZh,
    loadFarms,
    setStakeAmount: pageState.setStakeAmount,
    setWithdrawAmount: pageState.setWithdrawAmount,
    setResultModal: pageState.setResultModal,
  });

  const closeFarmModal = () => {
    if (activeAction) {
      return;
    }

    pageState.resetFarmPanel();
  };

  const { stakeButtonLabel, stakeButtonDisabled, withdrawButtonDisabled } = useEarnFarmUiState({
    isZh: environment.isZh,
    isConnected: environment.isConnected,
    selectedFarm: farmState.selectedFarm,
    activeAction,
    parsedStakeAmount: farmState.parsedStakeAmount,
    parsedWithdrawAmount: farmState.parsedWithdrawAmount,
    stakeNeedsApproval: farmState.stakeNeedsApproval,
    insufficientStakeBalance: farmState.insufficientStakeBalance,
    insufficientWithdrawBalance: farmState.insufficientWithdrawBalance,
  });

  return {
    activeAction,
    runFarmAction,
    closeFarmModal,
    stakeButtonLabel,
    stakeButtonDisabled,
    withdrawButtonDisabled,
  };
}
