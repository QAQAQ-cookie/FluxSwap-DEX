'use client';

import { StatusPill } from '@/components/AdminPrimitives';
import type { TokenUsage } from '@/components/tokens/TokensTypes';

export function TokensUsageBadges({ usage }: { usage: TokenUsage }) {
  const items = [
    usage.hasSwapPair ? { label: '交易', tone: 'success' as const } : null,
    usage.inFarmSinglePoolConfig ? { label: '单币池', tone: 'success' as const } : null,
    usage.isRewardToken ? { label: '奖励币', tone: 'warning' as const } : null,
    usage.inWalletConfig ? { label: '资产展示', tone: 'neutral' as const } : null,
  ].filter(Boolean) as Array<{ label: string; tone: 'success' | 'warning' | 'neutral' }>;

  if (items.length === 0) {
    return <StatusPill tone="neutral">未使用</StatusPill>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <StatusPill key={item.label} tone={item.tone}>
          {item.label}
        </StatusPill>
      ))}
    </div>
  );
}
