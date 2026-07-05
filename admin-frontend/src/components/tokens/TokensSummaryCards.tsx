'use client';

import { Coins, SearchCheck, ShieldCheck, Sparkles } from 'lucide-react';

import { Card, SectionHeader, SummaryStatCard } from '@/components/AdminPrimitives';

type TokensSummaryCardsProps = {
  configuredTokenCount: number;
  matchedTokenCount: number;
  totalTokenCount: number;
  allowedTokenCount: number;
  mismatchTokenCount: number;
  activeUsageTokenCount: number;
};

export function TokensSummaryCards({
  configuredTokenCount,
  matchedTokenCount,
  totalTokenCount,
  allowedTokenCount,
  mismatchTokenCount,
  activeUsageTokenCount,
}: TokensSummaryCardsProps) {
  return (
    <Card className="p-5">
      <SectionHeader
        icon={<Coins size={20} />}
        title="代币状态摘要"
        description="快速查看当前配置质量、白名单覆盖和协议使用情况。"
        badge={
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              <Sparkles size={13} />
              {matchedTokenCount} 项匹配
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              <ShieldCheck size={13} />
              {allowedTokenCount} 项已放行
            </span>
          </div>
        }
        className="mb-5"
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryStatCard
          label="已配置代币"
          value={configuredTokenCount}
          helper="当前管理端维护的代币数量"
          icon={<Coins size={19} />}
          tone="neutral"
        />
        <SummaryStatCard
          label="链上信息匹配"
          value={`${matchedTokenCount} / ${totalTokenCount}`}
          helper="配置名称、符号和精度与链上一致"
          icon={<SearchCheck size={19} />}
          tone={matchedTokenCount === totalTokenCount ? 'success' : 'warning'}
        />
        <SummaryStatCard
          label="金库白名单"
          value={`${allowedTokenCount} / ${totalTokenCount}`}
          helper="已放行到金库的代币数量"
          icon={<ShieldCheck size={19} />}
          tone={allowedTokenCount > 0 ? 'success' : 'neutral'}
        />
        <SummaryStatCard
          label="待检查"
          value={mismatchTokenCount}
          helper="配置差异或链上读取异常"
          icon={<Sparkles size={19} />}
          tone={mismatchTokenCount > 0 ? 'warning' : 'success'}
        />
        <SummaryStatCard
          label="协议使用中"
          value={activeUsageTokenCount}
          helper="已在交易、农场或奖励流程中使用"
          icon={<Coins size={19} />}
          tone={activeUsageTokenCount > 0 ? 'success' : 'neutral'}
        />
      </div>
    </Card>
  );
}
