'use client';

import { LoaderCircle, RefreshCw } from 'lucide-react';

import { PageErrorBanner, PageHeader } from '@/components/AdminPrimitives';

type LogsPageHeaderProps = {
  loading: boolean;
  error?: string | null;
  onRefresh: () => void;
};

export function LogsPageHeader({ loading, error, onRefresh }: LogsPageHeaderProps) {
  return (
    <>
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <PageHeader
          eyebrow="日志"
          title="操作记录"
          description="读取最近的农场和金库管理事件，便于回溯配置变更。"
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
