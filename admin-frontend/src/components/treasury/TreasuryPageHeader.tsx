'use client';

import { AlertCircle, LoaderCircle, RefreshCw } from 'lucide-react';

import { PageHeader } from '@/components/AdminPrimitives';

type TreasuryPageHeaderProps = {
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
};

export function TreasuryPageHeader({ loading, error, onRefresh }: TreasuryPageHeaderProps) {
  return (
    <>
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <PageHeader
          eyebrow="金库"
          title="金库管理"
          description="查看金库权限、资产余额、授权额度和待处理治理操作。"
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

      {error ? (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle size={18} />
          {error}
        </div>
      ) : null}
    </>
  );
}
