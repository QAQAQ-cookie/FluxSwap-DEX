'use client';

import { RefreshCw } from 'lucide-react';

import { PageErrorBanner, PageHeader } from '@/components/AdminPrimitives';
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
        <PageHeader
          eyebrow="农场"
          title="农场与奖励管理"
          description="创建质押池、调整权重、启停农场，并向管理合约分发奖励。"
        />

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

      {error ? <PageErrorBanner message={error} /> : null}
    </>
  );
}
