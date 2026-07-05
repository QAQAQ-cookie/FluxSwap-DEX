import type {
  EarnExecutableFarmAction,
  EarnFarmListSectionProps,
  EarnFarmListViewModel,
  EarnFarmModalSectionProps,
  EarnFarmModalViewModel,
  EarnHeroViewModel,
  EarnResultModalViewModel,
} from './EarnTypes';
import type { EarnPageEnvironment } from './useEarnPageEnvironment';
import type { EarnFarmState } from './useEarnFarmState';
import type { EarnPageState } from './useEarnPageState';

type BuildEarnPageViewModelsParams = {
  environment: Pick<
    EarnPageEnvironment,
    'isConnected' | 'address' | 'openConnectModal' | 'supportedChain' | 'managerAddress'
  >;
  farmLoading: boolean;
  farmError: string | null;
  pageState: EarnPageState;
  farmState: EarnFarmState;
  activeAction: EarnExecutableFarmAction | null;
  closeFarmModal: () => void;
  runFarmAction: (action: EarnExecutableFarmAction) => Promise<void>;
  stakeButtonLabel: string;
  stakeButtonDisabled: boolean;
  withdrawButtonDisabled: boolean;
};

export function buildEarnPageViewModels({
  environment,
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
}: BuildEarnPageViewModelsParams) {
  const heroViewModel: EarnHeroViewModel = {
    isConnected: environment.isConnected,
    address: environment.address,
    onConnectWallet: () => environment.openConnectModal?.(),
    activeFarmCount: farmState.activeFarmCount,
    stakedFarmCount: farmState.stakedFarmCount,
    totalEarnedRewards: farmState.totalEarnedRewards,
    totalManagerPendingRewards: farmState.totalManagerPendingRewards,
  };

  const farmListViewModel: EarnFarmListViewModel = {
    supportedChain: environment.supportedChain,
    managerAddress: environment.managerAddress,
    farmLoading,
    farmError,
    filteredFarms: farmState.filteredFarms,
    searchQuery: pageState.searchQuery,
    stakedOnly: pageState.stakedOnly,
  };

  const farmModalViewModel: EarnFarmModalViewModel = {
    selectedFarm: farmState.selectedFarm,
    activeAction,
    stakeAmount: pageState.stakeAmount,
    withdrawAmount: pageState.withdrawAmount,
    stakeNeedsApproval: farmState.stakeNeedsApproval,
    stakeButtonLabel,
    stakeButtonDisabled,
    withdrawButtonDisabled,
    insufficientWithdrawBalance: farmState.insufficientWithdrawBalance,
    canClaim: farmState.canClaim,
    canExit: farmState.canExit,
  };

  const farmListSectionProps: EarnFarmListSectionProps = {
    viewModel: farmListViewModel,
    setSearchQuery: pageState.setSearchQuery,
    setStakedOnly: pageState.setStakedOnly,
    onSelectFarm: pageState.selectFarm,
  };

  const farmModalSectionProps: EarnFarmModalSectionProps = {
    viewModel: farmModalViewModel,
    setStakeAmount: pageState.setStakeAmount,
    setWithdrawAmount: pageState.setWithdrawAmount,
    closeFarmModal,
    onAction: (action) => void runFarmAction(action),
  };

  const resultModalViewModel: EarnResultModalViewModel = {
    state: pageState.resultModal,
    onClose: () => pageState.setResultModal(null),
  };

  return {
    heroViewModel,
    farmListSectionProps,
    farmModalSectionProps,
    resultModalViewModel,
  };
}
