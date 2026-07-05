import { Gift, Vault, X } from 'lucide-react';
import { formatUnits } from 'viem';

import { formatBigIntAmountDown } from '@/lib/amounts';

import {
  EarnFarmActionButton,
  EarnFarmAmountCard,
  EarnFarmDetailRow,
  EarnFarmMetricCard,
} from './EarnFarmModalParts';
import type { EarnExecutableFarmAction, EarnFarmModalViewModel } from './EarnTypes';
import { formatWeight, shortAddress } from './EarnUtils';

type EarnFarmModalProps = {
  isZh: boolean;
  viewModel: EarnFarmModalViewModel;
  setStakeAmount: (value: string) => void;
  setWithdrawAmount: (value: string) => void;
  closeFarmModal: () => void;
  onAction: (action: EarnExecutableFarmAction) => void;
};

export function EarnFarmModal({
  isZh,
  viewModel,
  setStakeAmount,
  setWithdrawAmount,
  closeFarmModal,
  onAction,
}: EarnFarmModalProps) {
  const {
    selectedFarm,
    activeAction,
    stakeAmount,
    withdrawAmount,
    stakeNeedsApproval,
    stakeButtonLabel,
    stakeButtonDisabled,
    withdrawButtonDisabled,
    insufficientWithdrawBalance,
    canClaim,
    canExit,
  } = viewModel;

  if (!selectedFarm) {
    return null;
  }

  const modalBusy = Boolean(activeAction);

  const withdrawButtonLabel =
    activeAction === 'withdraw'
      ? isZh
        ? '解除质押中...'
        : 'Unstaking...'
      : insufficientWithdrawBalance
        ? isZh
          ? '已质押余额不足'
          : 'Insufficient staked balance'
        : isZh
          ? '解除质押'
          : 'Unstake';

  const claimButtonLabel =
    activeAction === 'claim'
      ? isZh
        ? '领取中...'
        : 'Claiming...'
      : isZh
        ? '领取奖励'
        : 'Claim Rewards';

  const exitButtonLabel =
    activeAction === 'exit'
      ? isZh
        ? '退出中...'
        : 'Exiting...'
      : isZh
        ? '全部退出'
        : 'Exit Farm';

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm"
      onClick={closeFarmModal}
    >
      <div
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-[760px] flex-col rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-gray-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-black tracking-tight text-gray-950 dark:text-white">{selectedFarm.label}</div>
            <div className="mt-1 text-sm font-semibold text-gray-500 dark:text-gray-400">
              {(selectedFarm.isLp ? (isZh ? 'LP 农场' : 'LP Farm') : selectedFarm.tokenName) + ' · ' + shortAddress(selectedFarm.poolAddress)}
            </div>
          </div>
          <button
            type="button"
            onClick={closeFarmModal}
            disabled={modalBusy}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.10]"
            aria-label={isZh ? '关闭' : 'Close'}
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <EarnFarmMetricCard
            label={isZh ? '钱包余额' : 'Wallet Balance'}
            value={formatBigIntAmountDown(selectedFarm.walletBalance, selectedFarm.tokenDecimals, 4)}
          />
          <EarnFarmMetricCard
            label={isZh ? '已质押' : 'Staked'}
            value={formatBigIntAmountDown(selectedFarm.stakedBalance, selectedFarm.tokenDecimals, 4)}
          />
          <EarnFarmMetricCard
            label={isZh ? '待领取' : 'Claimable'}
            value={`${formatBigIntAmountDown(selectedFarm.earnedRewards, 18, 4)} FLUX`}
          />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <EarnFarmAmountCard
            title={isZh ? '质押' : 'Stake'}
            symbol={selectedFarm.tokenSymbol}
            amount={stakeAmount}
            inputDisabled={modalBusy}
            onAmountChange={setStakeAmount}
            onMax={() => setStakeAmount(formatUnits(selectedFarm.walletBalance, selectedFarm.tokenDecimals))}
            buttonLabel={stakeButtonLabel}
            buttonDisabled={stakeButtonDisabled}
            buttonLoading={activeAction === 'approve' || activeAction === 'stake'}
            buttonVariant={stakeNeedsApproval ? 'accent' : 'primary'}
            onSubmit={() => {
              void onAction(stakeNeedsApproval ? 'approve' : 'stake');
            }}
          />

          <EarnFarmAmountCard
            title={isZh ? '解除质押' : 'Unstake'}
            symbol={selectedFarm.tokenSymbol}
            amount={withdrawAmount}
            inputDisabled={modalBusy}
            onAmountChange={setWithdrawAmount}
            onMax={() => setWithdrawAmount(formatUnits(selectedFarm.stakedBalance, selectedFarm.tokenDecimals))}
            buttonLabel={withdrawButtonLabel}
            buttonDisabled={withdrawButtonDisabled}
            buttonLoading={activeAction === 'withdraw'}
            onSubmit={() => {
              void onAction('withdraw');
            }}
          />
        </div>

        <div className="mt-4 grid gap-3 rounded-[1.25rem] bg-gray-50 p-4 text-sm dark:bg-white/[0.04] sm:grid-cols-2">
          <EarnFarmDetailRow
            label={isZh ? '总质押' : 'Total Staked'}
            value={formatBigIntAmountDown(selectedFarm.totalStaked, selectedFarm.tokenDecimals, 4)}
          />
          <EarnFarmDetailRow
            label={isZh ? '农场权重' : 'Farm Weight'}
            value={formatWeight(selectedFarm.allocPoint, selectedFarm.totalAllocPoint)}
          />
          <EarnFarmDetailRow
            label={isZh ? '奖励池余额' : 'Reward Pool'}
            value={`${formatBigIntAmountDown(selectedFarm.rewardReserve, 18, 4)} FLUX`}
          />
          <EarnFarmDetailRow
            label={isZh ? '待分发奖励' : 'Rewards to Distribute'}
            value={`${formatBigIntAmountDown(selectedFarm.managerPendingRewards + selectedFarm.queuedRewards, 18, 4)} FLUX`}
          />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <EarnFarmActionButton
            label={claimButtonLabel}
            disabled={modalBusy || !canClaim}
            loading={activeAction === 'claim'}
            icon={<Gift size={17} />}
            onClick={() => {
              void onAction('claim');
            }}
          />
          <EarnFarmActionButton
            label={exitButtonLabel}
            disabled={modalBusy || !canExit}
            loading={activeAction === 'exit'}
            icon={<Vault size={17} />}
            variant="danger"
            onClick={() => {
              void onAction('exit');
            }}
          />
        </div>
      </div>
    </div>
  );
}
