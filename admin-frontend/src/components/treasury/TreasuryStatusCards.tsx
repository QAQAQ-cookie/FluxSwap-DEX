'use client';

import { Ban, LoaderCircle, PauseCircle, Play, ShieldCheck } from 'lucide-react';

import { Card, StatusPill } from '@/components/AdminPrimitives';

type TreasuryStatusCardsProps = {
  paused?: boolean;
  minDelayLabel: string;
  totalConfiguredAssets: number;
  allowedTokenCount: number;
  operationCount: number;
  readyOperationCount: number;
  pauseBusy: boolean;
  mounted: boolean;
  onPauseToggle: () => void;
};

export function TreasuryStatusCards({
  paused,
  minDelayLabel,
  totalConfiguredAssets,
  allowedTokenCount,
  operationCount,
  readyOperationCount,
  pauseBusy,
  mounted,
  onPauseToggle,
}: TreasuryStatusCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card className="p-5">
        <div className="flex h-full flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">金库状态</p>
              <div className="mt-3">
                <StatusPill tone={paused ? 'danger' : 'success'}>{paused ? '已暂停' : '正常'}</StatusPill>
              </div>
            </div>
            <span
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                paused ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
              }`}
            >
              {paused ? <PauseCircle size={19} /> : <ShieldCheck size={19} />}
            </span>
          </div>

          <button
            type="button"
            onClick={onPauseToggle}
            disabled={pauseBusy || !mounted}
            className={`inline-flex h-9 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold transition disabled:bg-slate-300 disabled:text-slate-500 ${
              paused ? 'bg-slate-950 text-white hover:bg-slate-800' : 'bg-rose-600 text-white hover:bg-rose-500'
            }`}
          >
            {pauseBusy ? (
              <LoaderCircle size={14} className="animate-spin" />
            ) : paused ? (
              <Play size={14} />
            ) : (
              <Ban size={14} />
            )}
            {paused ? '恢复金库' : '暂停金库'}
          </button>
        </div>
      </Card>

      <Card className="p-5">
        <p className="text-sm text-slate-500">配置资产</p>
        <p className="mt-3 text-2xl font-semibold text-slate-950">{totalConfiguredAssets}</p>
        <p className="mt-1 text-xs text-slate-500">{allowedTokenCount} 个已加入白名单</p>
      </Card>

      <Card className="p-5">
        <p className="text-sm text-slate-500">待执行治理</p>
        <p className="mt-3 text-2xl font-semibold text-slate-950">{operationCount}</p>
        <p className="mt-1 text-xs text-slate-500">{readyOperationCount} 个已到可执行时间</p>
      </Card>

      <Card className="p-5">
        <p className="text-sm text-slate-500">治理延迟</p>
        <p className="mt-3 text-2xl font-semibold text-slate-950">{minDelayLabel}</p>
      </Card>
    </div>
  );
}
