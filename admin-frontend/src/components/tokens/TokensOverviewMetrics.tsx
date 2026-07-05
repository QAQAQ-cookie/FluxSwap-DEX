'use client';

type TokensOverviewMetricsProps = {
  swapPairCount: number;
  singlePoolCount: number;
  rewardTokenCount: number;
  pendingTreasuryCount: number;
};

export function TokensOverviewMetrics({
  swapPairCount,
  singlePoolCount,
  rewardTokenCount,
  pendingTreasuryCount,
}: TokensOverviewMetricsProps) {
  const usageMetrics = [
    { label: '有交易对', value: swapPairCount, helper: '已接入市场交易' },
    { label: '单币池代币', value: singlePoolCount, helper: '可用于农场单币池' },
    { label: '奖励代币', value: rewardTokenCount, helper: '用于奖励分发' },
    { label: '待金库治理', value: pendingTreasuryCount, helper: '已被协议使用但未放行到金库' },
  ];

  return (
    <div className="mt-6 grid gap-5 md:grid-cols-2">
      {usageMetrics.map((item) => (
        <div key={item.label} className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-4">
          <p className="text-sm text-slate-500">{item.label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{item.value}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{item.helper}</p>
        </div>
      ))}
    </div>
  );
}
