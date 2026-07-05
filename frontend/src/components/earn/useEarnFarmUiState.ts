import type { FarmAction, FarmRow } from './EarnTypes';
import { ZERO_BIGINT } from './EarnUtils';

type UseEarnFarmUiStateParams = {
  isZh: boolean;
  isConnected: boolean;
  selectedFarm: FarmRow | null;
  activeAction: FarmAction;
  parsedStakeAmount?: bigint;
  parsedWithdrawAmount?: bigint;
  stakeNeedsApproval: boolean;
  insufficientStakeBalance: boolean;
  insufficientWithdrawBalance: boolean;
};

export function useEarnFarmUiState({
  isZh,
  isConnected,
  selectedFarm,
  activeAction,
  parsedStakeAmount,
  parsedWithdrawAmount,
  stakeNeedsApproval,
  insufficientStakeBalance,
  insufficientWithdrawBalance,
}: UseEarnFarmUiStateParams) {
  const stakeButtonLabel = !isConnected
    ? isZh
      ? '连接钱包'
      : 'Connect Wallet'
      : activeAction === 'approve'
        ? isZh
          ? '授权中...'
          : 'Approving...'
      : activeAction === 'stake'
        ? isZh
          ? '质押中...'
          : 'Staking...'
        : !parsedStakeAmount || parsedStakeAmount <= ZERO_BIGINT
          ? isZh
            ? '请输入质押数量'
            : 'Enter stake amount'
          : insufficientStakeBalance
            ? isZh
              ? '钱包 LP 余额不足'
              : 'Insufficient LP balance'
            : stakeNeedsApproval
              ? isZh
                ? '授权 LP'
                : 'Approve LP'
              : isZh
                ? '质押'
                : 'Stake';

  const stakeButtonDisabled =
    Boolean(activeAction) ||
    Boolean(
      isConnected &&
        (!selectedFarm ||
          !parsedStakeAmount ||
          parsedStakeAmount <= ZERO_BIGINT ||
          insufficientStakeBalance),
    );

  const withdrawButtonDisabled =
    Boolean(activeAction) ||
    Boolean(
      isConnected &&
        (!selectedFarm ||
          !parsedWithdrawAmount ||
          parsedWithdrawAmount <= ZERO_BIGINT ||
          insufficientWithdrawBalance),
    );

  return {
    stakeButtonLabel,
    stakeButtonDisabled,
    withdrawButtonDisabled,
  };
}
