'use client';

import { Coins, LoaderCircle } from 'lucide-react';
import Link from 'next/link';

import { Card, shortAddress, StatusPill } from '@/components/AdminPrimitives';
import { TokensMismatchBadges } from '@/components/tokens/TokensMismatchBadges';
import type { TokenRow } from '@/components/tokens/TokensTypes';
import { TokensUsageBadges } from '@/components/tokens/TokensUsageBadges';
import { formatBigIntAmountDown } from '@/lib/amounts';

type TokensTableProps = {
  loading: boolean;
  tokenRows: TokenRow[];
};

export function TokensTable({ loading, tokenRows }: TokensTableProps) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-[1380px] w-full border-collapse text-left">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="px-5 py-3">代币</th>
              <th className="px-5 py-3">链上信息</th>
              <th className="px-5 py-3">配置差异</th>
              <th className="px-5 py-3">用途</th>
              <th className="px-5 py-3">总供应</th>
              <th className="px-5 py-3">金库白名单</th>
              <th className="px-5 py-3">金库余额</th>
              <th className="px-5 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {loading && tokenRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-sm text-slate-500">
                  <LoaderCircle size={18} className="mx-auto mb-2 animate-spin" />
                  正在加载代币数据
                </td>
              </tr>
            ) : tokenRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-sm text-slate-500">
                  暂无符合条件的代币
                </td>
              </tr>
            ) : (
              tokenRows.map((token) => {
                const treasuryQuery = new URLSearchParams({
                  token: token.address,
                  action: 'setAllowedToken',
                  allowed: token.treasuryAllowed ? 'false' : 'true',
                }).toString();
                const actionLabel = token.treasuryAllowed
                  ? '移出白名单'
                  : token.usage.hasSwapPair || token.usage.inFarmSinglePoolConfig || token.usage.isRewardToken
                    ? '放行到金库'
                    : '加入白名单';
                const actionHint = token.readFailed
                  ? '先确认链上读数'
                  : token.treasuryAllowed === false &&
                      (token.usage.hasSwapPair || token.usage.inFarmSinglePoolConfig || token.usage.isRewardToken)
                    ? '协议已使用'
                    : token.mismatch.symbol || token.mismatch.name || token.mismatch.decimals
                      ? '配置待核对'
                      : '可前往治理';

                return (
                  <tr key={token.address} className="align-middle">
                    <td className="px-5 py-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                          <Coins size={18} />
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-950">{token.configuredSymbol}</p>
                          <p className="mt-1 font-mono text-xs text-slate-500">{shortAddress(token.address)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="space-y-1 text-sm text-slate-700">
                        <p>
                          名称：<span className="font-medium text-slate-900">{token.readFailed ? '--' : token.chainName}</span>
                        </p>
                        <p>
                          符号：<span className="font-medium text-slate-900">{token.readFailed ? '--' : token.chainSymbol}</span>
                        </p>
                        <p>
                          精度：<span className="font-medium text-slate-900">{token.readFailed ? '--' : token.chainDecimals}</span>
                        </p>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="space-y-2">
                        {token.readFailed ? (
                          <StatusPill tone="danger">读取失败</StatusPill>
                        ) : (
                          <TokensMismatchBadges mismatch={token.mismatch} />
                        )}
                        <p className="text-xs text-slate-500">
                          配置 {token.configuredSymbol} / {token.configuredName} / {token.configuredDecimals}
                        </p>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <TokensUsageBadges usage={token.usage} />
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-700">
                      {formatBigIntAmountDown(token.totalSupply, token.chainDecimals, 2)}
                    </td>
                    <td className="px-5 py-4">
                      <StatusPill tone={token.treasuryAllowed ? 'success' : 'neutral'}>
                        {token.treasuryAllowed ? '已允许' : '未允许'}
                      </StatusPill>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-700">
                      {token.treasuryBalance === undefined
                        ? '--'
                        : `${formatBigIntAmountDown(token.treasuryBalance, token.chainDecimals, 4)} ${token.readFailed ? token.configuredSymbol : token.chainSymbol}`}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <Link
                          href={`/treasury?${treasuryQuery}`}
                          className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          {actionLabel}
                        </Link>
                        <span className="text-[11px] text-slate-400">{actionHint}</span>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
