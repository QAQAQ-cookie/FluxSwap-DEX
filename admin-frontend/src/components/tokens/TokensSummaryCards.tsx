'use client';

import { Card } from '@/components/AdminPrimitives';

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
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <Card className="p-5">
        <p className="text-sm text-slate-500">已配置代币</p>
        <p className="mt-3 text-2xl font-semibold text-slate-950">{configuredTokenCount}</p>
      </Card>
      <Card className="p-5">
        <p className="text-sm text-slate-500">链上信息匹配</p>
        <p className="mt-3 text-2xl font-semibold text-slate-950">
          {matchedTokenCount} / {totalTokenCount}
        </p>
      </Card>
      <Card className="p-5">
        <p className="text-sm text-slate-500">金库白名单</p>
        <p className="mt-3 text-2xl font-semibold text-slate-950">
          {allowedTokenCount} / {totalTokenCount}
        </p>
      </Card>
      <Card className="p-5">
        <p className="text-sm text-slate-500">待检查</p>
        <p className="mt-3 text-2xl font-semibold text-slate-950">{mismatchTokenCount}</p>
      </Card>
      <Card className="p-5">
        <p className="text-sm text-slate-500">协议使用中</p>
        <p className="mt-3 text-2xl font-semibold text-slate-950">{activeUsageTokenCount}</p>
      </Card>
    </div>
  );
}
