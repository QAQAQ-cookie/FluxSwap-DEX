import { useEarnFarms } from './useEarnFarms';
import { useEarnFarmState } from './useEarnFarmState';
import type { EarnPageEnvironment } from './useEarnPageEnvironment';
import type { EarnPageState } from './useEarnPageState';

type UseEarnFarmDataParams = {
  environment: Pick<
    EarnPageEnvironment,
    | 'publicClient'
    | 'supportedChain'
    | 'managerAddress'
    | 'wrappedNativeAddress'
    | 'knownTokens'
    | 'address'
    | 'isConnected'
  >;
  pageState: Pick<
    EarnPageState,
    'selectedFarmAddress' | 'searchQuery' | 'stakedOnly' | 'stakeAmount' | 'withdrawAmount'
  >;
};

export function useEarnFarmData({ environment, pageState }: UseEarnFarmDataParams) {
  const { farms, farmLoading, farmError, loadFarms } = useEarnFarms({
    publicClient: environment.publicClient,
    supportedChain: environment.supportedChain,
    managerAddress: environment.managerAddress,
    wrappedNativeAddress: environment.wrappedNativeAddress,
    knownTokens: environment.knownTokens,
    address: environment.address,
    isConnected: environment.isConnected,
  });

  const farmState = useEarnFarmState({
    farms,
    selectedFarmAddress: pageState.selectedFarmAddress,
    searchQuery: pageState.searchQuery,
    stakedOnly: pageState.stakedOnly,
    stakeAmount: pageState.stakeAmount,
    withdrawAmount: pageState.withdrawAmount,
  });

  return {
    farms,
    farmLoading,
    farmError,
    loadFarms,
    farmState,
  };
}
