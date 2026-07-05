import type { ReactNode } from 'react';

import { Coins, LoaderCircle, Search } from 'lucide-react';
import type { Address } from 'viem';

import { formatBigIntAmountDown } from '@/lib/amounts';

import type { FarmRow } from './EarnTypes';
import { formatWeight, shortAddress } from './EarnUtils';

type EarnFarmListToolbarProps = {
  isZh: boolean;
  searchQuery: string;
  stakedOnly: boolean;
  setSearchQuery: (value: string) => void;
  setStakedOnly: (updater: (current: boolean) => boolean) => void;
};

export function EarnFarmListToolbar({
  isZh,
  searchQuery,
  stakedOnly,
  setSearchQuery,
  setStakedOnly,
}: EarnFarmListToolbarProps) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h2 className="text-xl font-black tracking-tight text-gray-950 dark:text-white">
          {isZh ? '农场列表' : 'Farms'}
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {isZh
            ? '选择农场后可进行质押、解除质押和领取奖励。'
            : 'Choose a farm to stake, unstake, or claim rewards.'}
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="flex h-10 items-center gap-2 rounded-full bg-gray-100 px-3 text-sm text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
          <Search size={16} />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={isZh ? '搜索农场或交易对' : 'Search farms or pairs'}
            className="w-44 bg-transparent outline-none placeholder:text-gray-400"
          />
        </label>
        <button
          type="button"
          onClick={() => setStakedOnly((current) => !current)}
          className={`h-10 rounded-full px-4 text-sm font-bold transition-colors ${
            stakedOnly
              ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.10]'
          }`}
        >
          {isZh ? '仅看已质押' : 'Staked only'}
        </button>
      </div>
    </div>
  );
}

type EarnFarmListNoticeProps = {
  variant?: 'empty' | 'loading' | 'error';
  children: ReactNode;
  isLoading?: boolean;
};

export function EarnFarmListNotice({
  variant = 'empty',
  children,
  isLoading = false,
}: EarnFarmListNoticeProps) {
  if (variant === 'error') {
    return (
      <div className="mt-5 rounded-[1.25rem] bg-rose-50 px-5 py-5 text-sm text-rose-700 dark:bg-rose-400/10 dark:text-rose-300">
        {children}
      </div>
    );
  }

  return (
    <div
      className={`mt-5 rounded-[1.25rem] px-5 py-12 text-center ${
        isLoading
          ? 'flex items-center justify-center gap-2 bg-gray-50 text-gray-500 dark:bg-white/[0.03] dark:text-gray-400'
          : 'border border-dashed border-black/10 bg-gray-50 dark:border-white/10 dark:bg-white/[0.03]'
      }`}
    >
      {isLoading ? <LoaderCircle size={18} className="animate-spin" /> : null}
      <div className={isLoading ? '' : 'text-lg font-black text-gray-950 dark:text-white'}>{children}</div>
    </div>
  );
}

export function EarnFarmListHeaderRow({ isZh }: { isZh: boolean }) {
  return (
    <div className="hidden grid-cols-[1.25fr_0.7fr_0.85fr_0.85fr_0.85fr_0.75fr_0.7fr] items-center gap-3 border-b border-black/5 bg-gray-50 px-5 py-3 text-xs font-bold tracking-[0.08em] text-gray-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-400 xl:grid">
      <div>{isZh ? '农场' : 'Farm'}</div>
      <div>{isZh ? 'APR' : 'APR'}</div>
      <div className="text-right">{isZh ? '总质押' : 'Total Staked'}</div>
      <div className="text-right">{isZh ? '我的质押' : 'My Stake'}</div>
      <div className="text-right">{isZh ? '待领取' : 'Claimable'}</div>
      <div className="text-right">{isZh ? '权重' : 'Weight'}</div>
      <div className="text-right">{isZh ? '操作' : 'Action'}</div>
    </div>
  );
}

type EarnFarmListRowProps = {
  isZh: boolean;
  farm: FarmRow;
  onSelectFarm: (poolAddress: Address) => void;
};

export function EarnFarmListRow({ isZh, farm, onSelectFarm }: EarnFarmListRowProps) {
  return (
    <button
      type="button"
      onClick={() => onSelectFarm(farm.poolAddress)}
      className="grid w-full gap-3 px-5 py-4 text-left transition-colors hover:bg-emerald-50/50 dark:hover:bg-white/[0.04] xl:grid-cols-[1.25fr_0.7fr_0.85fr_0.85fr_0.85fr_0.75fr_0.7fr] xl:items-center"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex h-9 w-9 items-center justify-center rounded-full ${
              farm.active
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300'
                : 'bg-gray-100 text-gray-400 dark:bg-white/[0.06] dark:text-gray-500'
            }`}
          >
            <Coins size={17} />
          </span>
          <div className="min-w-0">
            <div className="truncate text-base font-black text-gray-950 dark:text-white">{farm.label}</div>
            <div className="mt-0.5 text-xs font-semibold text-gray-500 dark:text-gray-400">
              {farm.isLp ? (isZh ? 'LP 农场' : 'LP Farm') : isZh ? '单币池' : 'Single Token'} · {shortAddress(farm.poolAddress)}
            </div>
          </div>
        </div>
      </div>
      <div className="text-sm font-black text-gray-950 dark:text-white">--</div>
      <div className="text-sm font-semibold tabular-nums text-gray-700 dark:text-gray-300 xl:text-right">
        {formatBigIntAmountDown(farm.totalStaked, farm.tokenDecimals, 4)}
      </div>
      <div className="text-sm font-semibold tabular-nums text-gray-700 dark:text-gray-300 xl:text-right">
        {formatBigIntAmountDown(farm.stakedBalance, farm.tokenDecimals, 4)}
      </div>
      <div className="text-sm font-semibold tabular-nums text-gray-700 dark:text-gray-300 xl:text-right">
        {formatBigIntAmountDown(farm.earnedRewards, 18, 4)} FLUX
      </div>
      <div className="text-sm font-semibold tabular-nums text-gray-700 dark:text-gray-300 xl:text-right">
        {formatWeight(farm.allocPoint, farm.totalAllocPoint)}
      </div>
      <div className="xl:text-right">
        <span className="inline-flex h-9 items-center justify-center rounded-full bg-gray-900 px-4 text-sm font-bold text-white dark:bg-white dark:text-gray-900">
          {isZh ? '查看' : 'Open'}
        </span>
      </div>
    </button>
  );
}
