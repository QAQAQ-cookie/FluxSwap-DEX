'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { StatusPill } from '@/components/AdminPrimitives';
import type { TokenRow } from '@/components/tokens/TokensTypes';

type TokensActionSuggestionsProps = {
  mismatchRows: TokenRow[];
  pendingTreasuryRows: TokenRow[];
  getMismatchSummary: (token: TokenRow) => string;
};

type ActionItem = {
  key: string;
  title: string;
  description: string;
  href?: string;
  cta?: string;
  tone: 'danger' | 'warning' | 'success';
};

function buildActionItems({
  mismatchRows,
  pendingTreasuryRows,
  getMismatchSummary,
}: {
  mismatchRows: TokenRow[];
  pendingTreasuryRows: TokenRow[];
  getMismatchSummary: (token: TokenRow) => string;
}): ActionItem[] {
  const items: ActionItem[] = [];

  if (mismatchRows.length > 0) {
    const firstToken = mismatchRows[0];
    items.push({
      key: 'mismatch',
      title: `修正 ${firstToken.configuredSymbol} 配置`,
      description: getMismatchSummary(firstToken),
      tone: firstToken.readFailed ? 'danger' : 'warning',
    });
  }

  if (pendingTreasuryRows.length > 0) {
    const firstToken = pendingTreasuryRows[0];
    const treasuryQuery = new URLSearchParams({
      token: firstToken.address,
      action: 'setAllowedToken',
      allowed: 'true',
    }).toString();

    items.push({
      key: 'treasury',
      title: `放行 ${firstToken.configuredSymbol} 进入金库`,
      description: `${firstToken.configuredSymbol} 已在协议中使用，建议补齐金库白名单。`,
      href: `/treasury?${treasuryQuery}`,
      cta: '去处理',
      tone: 'warning',
    });
  }

  if (items.length === 0) {
    items.push({
      key: 'healthy',
      title: '当前无需额外处理',
      description: '代币配置、协议使用和金库放行状态都比较整齐。',
      tone: 'success',
    });
  }

  return items;
}

export function TokensActionSuggestions({
  mismatchRows,
  pendingTreasuryRows,
  getMismatchSummary,
}: TokensActionSuggestionsProps) {
  const actionItems = buildActionItems({ mismatchRows, pendingTreasuryRows, getMismatchSummary });

  return (
    <div className="mt-6 space-y-3">
      {actionItems.map((item) => {
        const toneClass =
          item.tone === 'danger'
            ? 'border-rose-200 bg-rose-50/70'
            : item.tone === 'warning'
              ? 'border-amber-200 bg-amber-50/70'
              : 'border-emerald-200 bg-emerald-50/70';

        return (
          <div key={item.key} className={`rounded-xl border px-4 py-4 ${toneClass}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">{item.description}</p>
              </div>
              <StatusPill tone={item.tone}>{item.tone === 'success' ? '正常' : '建议处理'}</StatusPill>
            </div>

            {item.href && item.cta ? (
              <div className="mt-3">
                <Link
                  href={item.href}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  {item.cta}
                  <ArrowRight size={14} />
                </Link>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
