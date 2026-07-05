'use client';

import { Coins, ShieldAlert, Sparkles } from 'lucide-react';
import Link from 'next/link';

import { Card, shortAddress, StatusPill } from '@/components/AdminPrimitives';
import { TokensActionSuggestions } from '@/components/tokens/TokensActionSuggestions';
import { TokensOverviewMetrics } from '@/components/tokens/TokensOverviewMetrics';
import type { TokenRow } from '@/components/tokens/TokensTypes';

type TokensOverviewPanelsProps = {
  swapPairCount: number;
  singlePoolCount: number;
  rewardTokenCount: number;
  pendingTreasuryCount: number;
  mismatchRows: TokenRow[];
  pendingTreasuryRows: TokenRow[];
};

function getUsageSummary(token: TokenRow) {
  const parts = [
    token.usage.hasSwapPair ? '交易' : null,
    token.usage.inFarmSinglePoolConfig ? '单币池' : null,
    token.usage.isRewardToken ? '奖励币' : null,
  ].filter(Boolean) as string[];

  return parts.length > 0 ? parts.join(' / ') : '仅资产展示';
}

function getMismatchSummary(token: TokenRow) {
  if (token.readFailed) {
    return '链上信息读取失败，请检查 RPC、合约部署或代币地址。';
  }

  const parts = [
    token.mismatch.symbol ? '符号' : null,
    token.mismatch.name ? '名称' : null,
    token.mismatch.decimals ? '精度' : null,
  ].filter(Boolean) as string[];

  return parts.length > 0 ? `当前配置与链上 ${parts.join(' / ')} 不一致。` : '当前没有配置差异。';
}

export function TokensOverviewPanels({
  swapPairCount,
  singlePoolCount,
  rewardTokenCount,
  pendingTreasuryCount,
  mismatchRows,
  pendingTreasuryRows,
}: TokensOverviewPanelsProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <Sparkles size={18} />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-slate-950">协议使用概览</h2>
            <p className="mt-1 text-sm text-slate-500">
              把代币在交易、农场、奖励分发和金库治理里的位置放在一起看。
            </p>
          </div>
        </div>

        <TokensOverviewMetrics
          swapPairCount={swapPairCount}
          singlePoolCount={singlePoolCount}
          rewardTokenCount={rewardTokenCount}
          pendingTreasuryCount={pendingTreasuryCount}
        />
      </Card>

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <ShieldAlert size={18} />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-slate-950">行动建议</h2>
            <p className="mt-1 text-sm text-slate-500">把最值得你现在处理的事情放到最前面。</p>
          </div>
        </div>

        <TokensActionSuggestions
          mismatchRows={mismatchRows}
          pendingTreasuryRows={pendingTreasuryRows}
          getMismatchSummary={getMismatchSummary}
        />

        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Coins size={14} />
            代币页负责配置正确性与协议可见性，金库权限仍由金库管理页统一处理。
          </div>
        </div>
      </Card>

      <Card className="p-5 xl:col-span-2">
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-900">配置风险</h3>
              <StatusPill tone={mismatchRows.length > 0 ? 'warning' : 'success'}>
                {mismatchRows.length > 0 ? '需处理' : '正常'}
              </StatusPill>
            </div>

            <div className="mt-3 space-y-3">
              {mismatchRows.length === 0 ? (
                <p className="text-sm leading-6 text-slate-500">当前没有需要修正的代币配置。</p>
              ) : (
                mismatchRows.slice(0, 4).map((token) => (
                  <div key={token.address} className="border-b border-slate-100 pb-3 last:border-b-0">
                    <p className="text-sm font-semibold text-slate-950">{token.configuredSymbol}</p>
                    <p className="mt-1 font-mono text-xs text-slate-500">{shortAddress(token.address)}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{getMismatchSummary(token)}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-5 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-900">金库放行待办</h3>
              <StatusPill tone={pendingTreasuryRows.length > 0 ? 'warning' : 'success'}>
                {pendingTreasuryRows.length > 0 ? '待推进' : '已处理'}
              </StatusPill>
            </div>

            <div className="mt-3 space-y-3">
              {pendingTreasuryRows.length === 0 ? (
                <p className="text-sm leading-6 text-slate-500">当前没有协议已使用但尚未放行到金库的代币。</p>
              ) : (
                pendingTreasuryRows.slice(0, 4).map((token) => {
                  const treasuryQuery = new URLSearchParams({
                    token: token.address,
                    action: 'setAllowedToken',
                    allowed: 'true',
                  }).toString();

                  return (
                    <div key={token.address} className="border-b border-slate-100 pb-3 last:border-b-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-950">{token.configuredSymbol}</p>
                          <p className="mt-1 font-mono text-xs text-slate-500">{shortAddress(token.address)}</p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">{getUsageSummary(token)}</p>
                        </div>
                        <Link
                          href={`/treasury?${treasuryQuery}`}
                          className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          去金库
                        </Link>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
