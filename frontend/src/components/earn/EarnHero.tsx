import { Coins, Gift, ShieldCheck, Sparkles, Vault, Wallet } from 'lucide-react';

import { formatBigIntAmountDown } from '@/lib/amounts';

import type { EarnHeroViewModel } from './EarnTypes';
import { shortAddress } from './EarnUtils';

type EarnHeroProps = {
  isZh: boolean;
  viewModel: EarnHeroViewModel;
};

export function EarnHero({ isZh, viewModel }: EarnHeroProps) {
  const {
    isConnected,
    address,
    onConnectWallet,
    activeFarmCount,
    stakedFarmCount,
    totalEarnedRewards,
    totalManagerPendingRewards,
  } = viewModel;

  return (
    <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-gray-900 lg:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
            <Sparkles size={15} />
            <span>{isZh ? '收益农场' : 'Yield Farms'}</span>
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-gray-950 dark:text-white lg:text-4xl">
            {isZh ? '质押 LP，赚取 FLUX' : 'Stake LP, earn FLUX'}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-500 dark:text-gray-400">
            {isZh
              ? '获得 LP 后，可将其质押到农场中赚取额外的 FLUX 奖励。交易手续费收益仍保留在你的 LP 份额中。'
              : 'After adding liquidity, stake your LP to earn extra FLUX rewards. Trading fees remain in your LP position.'}
          </p>
        </div>

        {!isConnected ? (
          <button
            type="button"
            onClick={onConnectWallet}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-gray-900 px-5 text-sm font-bold text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
          >
            <Wallet size={17} />
            <span>{isZh ? '连接钱包' : 'Connect Wallet'}</span>
          </button>
        ) : (
          <div className="rounded-full bg-gray-100 px-4 py-2 font-mono text-sm font-semibold text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
            {shortAddress(address)}
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[1.25rem] bg-gray-50 p-4 dark:bg-white/[0.04]">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
            <Vault size={15} />
            <span>{isZh ? '可用农场' : 'Available Farms'}</span>
          </div>
          <div className="mt-2 text-2xl font-black text-gray-950 dark:text-white">{activeFarmCount}</div>
        </div>
        <div className="rounded-[1.25rem] bg-gray-50 p-4 dark:bg-white/[0.04]">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
            <ShieldCheck size={15} />
            <span>{isZh ? '已参与农场' : 'Participating Farms'}</span>
          </div>
          <div className="mt-2 text-2xl font-black text-gray-950 dark:text-white">{stakedFarmCount}</div>
        </div>
        <div className="rounded-[1.25rem] bg-gray-50 p-4 dark:bg-white/[0.04]">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
            <Gift size={15} />
            <span>{isZh ? '待领取奖励' : 'Claimable Rewards'}</span>
          </div>
          <div className="mt-2 text-2xl font-black text-gray-950 dark:text-white">
            {formatBigIntAmountDown(totalEarnedRewards, 18, 4)}
          </div>
        </div>
        <div className="rounded-[1.25rem] bg-gray-50 p-4 dark:bg-white/[0.04]">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
            <Coins size={15} />
            <span>{isZh ? '待分发奖励' : 'Rewards to Distribute'}</span>
          </div>
          <div className="mt-2 text-2xl font-black text-gray-950 dark:text-white">
            {formatBigIntAmountDown(totalManagerPendingRewards, 18, 4)}
          </div>
        </div>
      </div>
    </section>
  );
}
