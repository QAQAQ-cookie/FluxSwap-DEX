'use client';

import { LoaderCircle, RefreshCw } from 'lucide-react';

import { PageErrorBanner, PageHeader } from '@/components/AdminPrimitives';

type TokensPageHeaderProps = {
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
};

export function TokensPageHeader({ loading, error, onRefresh }: TokensPageHeaderProps) {
  return (
    <>
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <PageHeader
          eyebrow="代币"
          title="代币管理"
          description="查看配置代币的链上信息、协议用途和金库白名单状态。"
        />
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400"
        >
          {loading ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          刷新
        </button>
      </div>

      {error ? <PageErrorBanner message={error} /> : null}
    </>
  );
}
