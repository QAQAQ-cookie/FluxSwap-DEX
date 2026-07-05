'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';

import { SecondaryButton } from '@/components/farm/FarmPrimitives';
import { formatDateTime } from '@/components/farm/FarmUtils';

type FarmPageHeaderProps = {
  error?: string | null;
  loading: boolean;
  lastUpdatedAt: Date | null;
  showConnectButton: boolean;
  connectButton: React.ReactNode;
  onRefresh: () => void;
};

export function FarmPageHeader({
  error,
  loading,
  lastUpdatedAt,
  showConnectButton,
  connectButton,
  onRefresh,
}: FarmPageHeaderProps) {
  return (
    <>
      <section className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">农场</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">农场与奖励管理</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            创建质押池、调整权重、启停农场，并向管理合约分发奖励。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {lastUpdatedAt ? (
            <span className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
              最近刷新：{formatDateTime(lastUpdatedAt)}
            </span>
          ) : null}
          <SecondaryButton onClick={onRefresh} loading={loading}>
            <RefreshCw size={15} />
            刷新
          </SecondaryButton>
          {showConnectButton ? connectButton : null}
        </div>
      </section>

      {error ? (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle size={18} />
          {error}
        </div>
      ) : null}
    </>
  );
}
