'use client';

import { Ban, LoaderCircle, PauseCircle, Play, ShieldCheck } from 'lucide-react';

import { StatusPill, SummaryStatCard } from '@/components/AdminPrimitives';

type TreasuryStatusCardsProps = {
  paused?: boolean;
  minDelayLabel: string;
  totalConfiguredAssets: number;
  allowedTokenCount: number;
  operationCount: number;
  readyOperationCount: number;
  pauseBusy: boolean;
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
  onPauseToggle,
}: TreasuryStatusCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <SummaryStatCard
        label="金库状态"
        value={<StatusPill tone={paused ? 'danger' : 'success'}>{paused ? '已暂停' : '正常'}</StatusPill>}
        helper={paused ? '暂停会阻断依赖金库的业务动作' : '当前金库可正常支撑业务'}
        icon={paused ? <PauseCircle size={19} /> : <ShieldCheck size={19} />}
        tone={paused ? 'danger' : 'success'}
        action={
          <button
            type="button"
            onClick={onPauseToggle}
            disabled={pauseBusy}
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
        }
      />

      <SummaryStatCard
        label="配置资产"
        value={totalConfiguredAssets}
        helper={`其中 ${allowedTokenCount} 个已加入白名单`}
        icon={<ShieldCheck size={19} />}
        tone="neutral"
      />

      <SummaryStatCard
        label="排队中治理"
        value={operationCount}
        helper={`其中 ${readyOperationCount} 个已到执行窗口`}
        icon={<Ban size={19} />}
        tone={readyOperationCount > 0 ? 'warning' : 'neutral'}
      />

      <SummaryStatCard
        label="治理延迟"
        value={minDelayLabel}
        helper="多签排队后至少需要等待这么久"
        icon={<Play size={19} />}
        tone="neutral"
      />
    </div>
  );
}
