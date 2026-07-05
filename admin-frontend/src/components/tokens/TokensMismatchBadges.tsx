'use client';

import { StatusPill } from '@/components/AdminPrimitives';
import type { TokenMismatch } from '@/components/tokens/TokensTypes';

export function TokensMismatchBadges({ mismatch }: { mismatch: TokenMismatch }) {
  const items = [
    mismatch.symbol ? '符号' : null,
    mismatch.name ? '名称' : null,
    mismatch.decimals ? '精度' : null,
  ].filter(Boolean) as string[];

  if (items.length === 0) {
    return <StatusPill tone="success">匹配</StatusPill>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <StatusPill key={item} tone="warning">
          {item}
        </StatusPill>
      ))}
    </div>
  );
}
