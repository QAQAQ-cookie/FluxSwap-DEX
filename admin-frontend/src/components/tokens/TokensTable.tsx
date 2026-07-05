'use client';

import { Coins, LoaderCircle } from 'lucide-react';
import Link from 'next/link';

import {
  AdminTable,
  AdminTableBody,
  AdminTableCell,
  AdminTableHead,
  AdminTableHeaderCell,
  Card,
  shortAddress,
  StatusPill,
  TablePlaceholderRow,
} from '@/components/AdminPrimitives';
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
      <AdminTable minWidth="1380px">
        <AdminTableHead>
          <tr>
            <AdminTableHeaderCell>代币</AdminTableHeaderCell>
            <AdminTableHeaderCell>链上信息</AdminTableHeaderCell>
            <AdminTableHeaderCell>配置差异</AdminTableHeaderCell>
            <AdminTableHeaderCell>用途</AdminTableHeaderCell>
            <AdminTableHeaderCell>总供应</AdminTableHeaderCell>
            <AdminTableHeaderCell>金库白名单</AdminTableHeaderCell>
            <AdminTableHeaderCell>金库余额</AdminTableHeaderCell>
            <AdminTableHeaderCell align="right">操作</AdminTableHeaderCell>
          </tr>
        </AdminTableHead>
        <AdminTableBody>
            {loading && tokenRows.length === 0 ? (
              <TablePlaceholderRow
                colSpan={8}
                icon={<LoaderCircle size={20} className="animate-spin" />}
                title="正在加载代币数据"
                description="正在读取链上元数据、用途关系和金库状态。"
              />
            ) : tokenRows.length === 0 ? (
              <TablePlaceholderRow
                colSpan={8}
                icon={<Coins size={20} />}
                title="没有符合条件的代币"
                description="试试调整筛选条件，或者清空当前搜索词。"
              />
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
                  <tr key={token.address} className="align-middle transition-colors hover:bg-slate-50/70">
                    <AdminTableCell>
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                          <Coins size={18} />
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-950">{token.configuredSymbol}</p>
                          <p className="mt-1 font-mono text-xs text-slate-500">{shortAddress(token.address)}</p>
                        </div>
                      </div>
                    </AdminTableCell>
                    <AdminTableCell>
                      <div className="max-w-[210px] space-y-1.5 text-sm leading-5 text-slate-700">
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
                    </AdminTableCell>
                    <AdminTableCell>
                      <div className="max-w-[220px] space-y-2">
                        {token.readFailed ? (
                          <StatusPill tone="danger">读取失败</StatusPill>
                        ) : (
                          <TokensMismatchBadges mismatch={token.mismatch} />
                        )}
                        <p className="text-xs text-slate-500">
                          配置 {token.configuredSymbol} / {token.configuredName} / {token.configuredDecimals}
                        </p>
                      </div>
                    </AdminTableCell>
                    <AdminTableCell>
                      <TokensUsageBadges usage={token.usage} />
                    </AdminTableCell>
                    <AdminTableCell className="text-sm leading-6 text-slate-700">
                      {formatBigIntAmountDown(token.totalSupply, token.chainDecimals, 2)}
                    </AdminTableCell>
                    <AdminTableCell>
                      <StatusPill tone={token.treasuryAllowed ? 'success' : 'neutral'}>
                        {token.treasuryAllowed ? '已允许' : '未允许'}
                      </StatusPill>
                    </AdminTableCell>
                    <AdminTableCell className="text-sm leading-6 text-slate-700">
                      {token.treasuryBalance === undefined
                        ? '--'
                        : `${formatBigIntAmountDown(token.treasuryBalance, token.chainDecimals, 4)} ${token.readFailed ? token.configuredSymbol : token.chainSymbol}`}
                    </AdminTableCell>
                    <AdminTableCell align="right">
                      <div className="flex flex-col items-end gap-1.5">
                        <Link
                          href={`/treasury?${treasuryQuery}`}
                          className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          {actionLabel}
                        </Link>
                        <span className="max-w-[112px] text-right text-[11px] leading-5 text-slate-400">{actionHint}</span>
                      </div>
                    </AdminTableCell>
                  </tr>
                );
              })
            )}
        </AdminTableBody>
      </AdminTable>
    </Card>
  );
}
