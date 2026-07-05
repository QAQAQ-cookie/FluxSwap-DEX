'use client';

import { AlertCircle, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react';

import { Card, StatusPill } from '@/components/AdminPrimitives';
import {
  FarmWeightDonut,
  formatRefreshTime,
  getToneClasses,
  OperationHeatmap,
  ProtocolMap,
  RewardCapacityRings,
  ZERO_BIGINT,
} from '@/components/overview/OverviewUtils';
import { useOverviewPageController } from '@/components/overview/useOverviewPageController';

export default function OverviewPage() {
  const { pageState, loadOverview, healthScore, healthTone, nodes, actionItems } = useOverviewPageController();

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-slate-950 p-6 text-white shadow-sm md:p-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">概览</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">协议状态图谱</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              汇总农场、奖励、金库和白名单状态，先看整体，再进入具体页面处理。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
              <p className="text-xs text-slate-400">最近刷新</p>
              <p className="mt-1 font-mono text-sm text-white">{formatRefreshTime(pageState.lastUpdatedAt)}</p>
            </div>
            <button
              type="button"
              onClick={() => void loadOverview()}
              disabled={pageState.loading}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-100 disabled:bg-slate-700 disabled:text-slate-400"
            >
              {pageState.loading ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              刷新
            </button>
          </div>
        </div>
      </section>

      {pageState.error ? (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle size={18} />
          {pageState.error}
        </div>
      ) : null}

      <Card className="p-5">
        <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">整体状态图谱</h2>
            <p className="mt-1 text-sm text-slate-500">按奖励、授权和分发关系展示整体状态。</p>
          </div>
          <div
            className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 md:w-52 ${
              healthTone === 'danger'
                ? 'border-rose-200 bg-rose-50'
                : healthTone === 'warning'
                  ? 'border-amber-200 bg-amber-50'
                  : 'border-emerald-200 bg-emerald-50'
            }`}
          >
            <span className="text-sm font-semibold text-slate-600">健康度</span>
            <span
              className={`text-3xl font-semibold ${
                healthTone === 'danger'
                  ? 'text-rose-700'
                  : healthTone === 'warning'
                    ? 'text-amber-700'
                    : 'text-emerald-700'
              }`}
            >
              {healthScore}
            </span>
          </div>
        </div>
        {pageState.loading && !pageState.overview ? (
          <div className="flex min-h-[520px] items-center justify-center rounded-2xl bg-slate-50 text-sm text-slate-500">
            <LoaderCircle size={18} className="mr-2 animate-spin" />
            正在生成协议状态图谱
          </div>
        ) : (
          <ProtocolMap nodes={nodes} tone={healthTone} />
        )}
      </Card>

      <Card className="p-5">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl ${getToneClasses(healthTone).soft} ${getToneClasses(healthTone).text}`}
            >
              <ShieldCheck size={20} />
            </span>
            <div>
              <h2 className="font-semibold text-slate-950">待处理事项</h2>
              <p className="text-sm text-slate-500">按链上状态生成，优先提示异常和授权问题。</p>
            </div>
          </div>
          <StatusPill
            tone={
              actionItems.some((item) => item.tone === 'danger')
                ? 'danger'
                : actionItems.some((item) => item.tone === 'warning')
                  ? 'warning'
                  : 'success'
            }
          >
            {actionItems.length} 项
          </StatusPill>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {actionItems.map((item) => {
            const toneClasses = getToneClasses(item.tone);

            return (
              <div key={item.title} className={`rounded-2xl border ${toneClasses.border} ${toneClasses.bg} p-4`}>
                <div className="flex items-start gap-3">
                  <span
                    className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: toneClasses.stroke }}
                  />
                  <div>
                    <p className={`font-semibold ${toneClasses.text}`}>{item.title}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{item.detail}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">奖励容量</h2>
              <p className="mt-1 text-sm text-slate-500">用同心环对比金库余额、授权额度和待分发奖励。</p>
            </div>
            <StatusPill tone={pageState.overview && pageState.overview.treasuryApprovedSpendRemaining > ZERO_BIGINT ? 'success' : 'warning'}>
              {pageState.overview?.rewardTokenSymbol ?? 'FLUX'}
            </StatusPill>
          </div>
          <RewardCapacityRings overview={pageState.overview} />
        </Card>

        <Card className="p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">农场权重</h2>
              <p className="mt-1 text-sm text-slate-500">按奖励权重展示农场之间的分配比例。</p>
            </div>
            <StatusPill tone={pageState.overview && pageState.overview.activePoolCount > 0 ? 'success' : 'neutral'}>
              {pageState.overview?.activePoolCount ?? 0} 个启用
            </StatusPill>
          </div>
          <FarmWeightDonut overview={pageState.overview} />
        </Card>
      </div>

      <Card className="p-5">
        <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">管理事件频率</h2>
          </div>
          <StatusPill
            tone={
              (pageState.overview?.recentFarmEvents ?? 0) + (pageState.overview?.recentTreasuryEvents ?? 0) > 0
                ? 'success'
                : 'neutral'
            }
          >
            {(pageState.overview?.recentFarmEvents ?? 0) + (pageState.overview?.recentTreasuryEvents ?? 0)} 条事件
          </StatusPill>
        </div>
        <OperationHeatmap overview={pageState.overview} />
      </Card>
    </div>
  );
}
