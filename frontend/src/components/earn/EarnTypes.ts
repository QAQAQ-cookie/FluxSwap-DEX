import type { Address } from 'viem';

export type FarmRow = {
  pid: number;
  poolAddress: Address;
  stakingToken: Address;
  rewardsToken: Address;
  label: string;
  tokenSymbol: string;
  tokenName: string;
  tokenDecimals: number;
  isLp: boolean;
  active: boolean;
  allocPoint: bigint;
  totalAllocPoint: bigint;
  managerPendingRewards: bigint;
  totalStaked: bigint;
  rewardReserve: bigint;
  queuedRewards: bigint;
  pendingUserRewards: bigint;
  walletBalance: bigint;
  stakedBalance: bigint;
  earnedRewards: bigint;
  allowance: bigint;
};

export type FarmAction = 'approve' | 'stake' | 'withdraw' | 'claim' | 'exit' | null;
export type EarnExecutableFarmAction = Exclude<FarmAction, null>;

export type EarnResultModalState =
  | {
      kind: 'success' | 'error';
      title: string;
      message: string;
    }
  | null;

export type EarnHeroViewModel = {
  isConnected: boolean;
  address?: Address;
  onConnectWallet: () => void;
  activeFarmCount: number;
  stakedFarmCount: number;
  totalEarnedRewards: bigint;
  totalManagerPendingRewards: bigint;
};

export type EarnFarmModalViewModel = {
  selectedFarm: FarmRow | null;
  activeAction: FarmAction;
  stakeAmount: string;
  withdrawAmount: string;
  stakeNeedsApproval: boolean;
  stakeButtonLabel: string;
  stakeButtonDisabled: boolean;
  withdrawButtonDisabled: boolean;
  insufficientWithdrawBalance: boolean;
  canClaim: boolean;
  canExit: boolean;
};

export type EarnFarmListViewModel = {
  supportedChain: boolean;
  managerAddress?: Address;
  farmLoading: boolean;
  farmError: string | null;
  filteredFarms: FarmRow[];
  searchQuery: string;
  stakedOnly: boolean;
};

export type EarnFarmListSectionProps = {
  viewModel: EarnFarmListViewModel;
  setSearchQuery: (value: string) => void;
  setStakedOnly: (updater: (current: boolean) => boolean) => void;
  onSelectFarm: (poolAddress: Address) => void;
};

export type EarnFarmModalSectionProps = {
  viewModel: EarnFarmModalViewModel;
  setStakeAmount: (value: string) => void;
  setWithdrawAmount: (value: string) => void;
  closeFarmModal: () => void;
  onAction: (action: EarnExecutableFarmAction) => void;
};

export type EarnResultModalViewModel = {
  state: EarnResultModalState;
  onClose: () => void;
};
