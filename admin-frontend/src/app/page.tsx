'use client';

import type { ReactNode } from 'react';
import { Coins, LoaderCircle, RefreshCw, ScrollText, ShieldCheck, Sprout } from 'lucide-react';

import { Card, MetricCard, PageErrorBanner, SectionPlaceholder, StatusPill } from '@/components/AdminPrimitives';
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
import { formatBigIntAmountDown } from '@/lib/amounts';

function OverviewSectionHeader({
  icon,
  title,
  description,
  badge,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  badge?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-center">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
          {icon}
        </span>
        <div>
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
      </div>
      {badge ? <div className="shrink-0">{badge}</div> : null}
    </div>
  );
}

export default function OverviewPage() {
  const { pageState, loadOverview, healthScore, healthTone, nodes, actionItems } = useOverviewPageController();
  const overview = pageState.overview;
  const rewardTokenSymbol = overview?.rewardTokenSymbol ?? 'FLUX';
  const recentEventCount = (overview?.recentFarmEvents ?? 0) + (overview?.recentTreasuryEvents ?? 0);
  const healthClasses = getToneClasses(healthTone);

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

      {pageState.error ? <PageErrorBanner message={pageState.error} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="活跃农场"
          value={overview ? `${overview.activePoolCount} / ${overview.poolLength}` : '--'}
          helper={overview ? `总权重 ${overview.totalAllocPoint.toString()}` : '等待链上数据'}
        />
        <MetricCard
          label="待分发奖励"
          value={
            overview
              ? `${formatBigIntAmountDown(overview.totalPendingRewards, overview.rewardTokenDecimals, 4)} ${rewardTokenSymbol}`
              : '--'
          }
          helper={
            overview
              ? `未分配 ${formatBigIntAmountDown(overview.undistributedRewards, overview.rewardTokenDecimals, 4)} ${rewardTokenSymbol}`
              : '等待链上数据'
          }
        />
        <MetricCard
          label="可用授权"
          value={
            overview
              ? `${formatBigIntAmountDown(overview.treasuryApprovedSpendRemaining, overview.rewardTokenDecimals, 4)} ${rewardTokenSymbol}`
              : '--'
          }
          helper={overview ? (overview.treasuryPaused ? '当前金库已暂停' : '当前金库状态正常') : '等待链上数据'}
          valueClassName={
            overview
              ? overview.treasuryPaused || overview.treasuryApprovedSpendRemaining <= ZERO_BIGINT
                ? 'text-amber-700'
                : 'text-emerald-700'
              : 'text-slate-950'
          }
        />
        <MetricCard
          label="白名单覆盖"
          value={overview ? `${overview.allowedTokenCount} / ${overview.configuredTokenCount}` : '--'}
          helper={overview ? `最近窗口 ${recentEventCount} 条管理动作` : '等待链上数据'}
        />
      </div>

      <Card className="p-5">
        <OverviewSectionHeader
          icon={<ShieldCheck size={20} />}
          title="整体状态图谱"
          description="把白名单、金库、农场和奖励路径放在一张图里看。"
          badge={
            <div className={`flex min-w-[164px] items-center justify-between rounded-2xl border px-4 py-3 ${healthClasses.border} ${healthClasses.bg}`}>
              <span className="text-sm font-semibold text-slate-600">健康度</span>
              <span className={`text-3xl font-semibold ${healthClasses.text}`}>{healthScore}</span>
            </div>
          }
        />
        {pageState.loading && !pageState.overview ? (
          <SectionPlaceholder
            icon={<LoaderCircle size={20} className="animate-spin" />}
            title="正在整理协议状态"
            description="正在汇总白名单、金库、农场和奖励的链上数据。"
            className="min-h-[520px] rounded-2xl bg-slate-50"
          />
      ) : (
        <ProtocolMap nodes={nodes} tone={healthTone} />
      )}
      </Card>

      <Card className="p-5">
        <OverviewSectionHeader
          icon={
            <span className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl ${healthClasses.soft} ${healthClasses.text}`}>
              <ShieldCheck size={20} />
            </span>
          }
          title="待处理事项"
          description="优先提示会影响分发、授权和资产安全的问题。"
          badge={
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
          }
        />

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
          <OverviewSectionHeader
            icon={<Coins size={20} />}
            title="奖励容量"
            description="用同心环对比金库余额、可用授权和待分发奖励。"
            badge={
              <StatusPill tone={overview && overview.treasuryApprovedSpendRemaining > ZERO_BIGINT ? 'success' : 'warning'}>
                {rewardTokenSymbol}
              </StatusPill>
            }
          />
          <RewardCapacityRings overview={overview} />
        </Card>

        <Card className="p-5">
          <OverviewSectionHeader
            icon={<Sprout size={20} />}
            title="农场权重"
            description="按奖励权重展示各农场之间的分配比例。"
            badge={<StatusPill tone={overview && overview.activePoolCount > 0 ? 'success' : 'neutral'}>{overview?.activePoolCount ?? 0} 个启用</StatusPill>}
          />
          <FarmWeightDonut overview={overview} />
        </Card>
      </div>

      <Card className="p-5">
        <OverviewSectionHeader
          icon={<ScrollText size={20} />}
          title="管理事件频率"
          description="按最近 20,000 个区块的事件密度观察操作节奏。"
          badge={<StatusPill tone={recentEventCount > 0 ? 'success' : 'neutral'}>{recentEventCount} 条事件</StatusPill>}
        />
        <OperationHeatmap overview={overview} />
      </Card>
    </div>
  );
}
