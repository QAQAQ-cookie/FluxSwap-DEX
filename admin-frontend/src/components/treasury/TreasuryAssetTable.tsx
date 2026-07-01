'use client';

import { LoaderCircle, Vault } from 'lucide-react';
import type { Address } from 'viem';

import { Card, shortAddress, StatusPill } from '@/components/AdminPrimitives';

const ZERO_BIGINT = BigInt(0);

type TreasuryAssetRow = {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  balance: bigint;
  approvedSpendRemaining: bigint;
  dailySpendCap: bigint;
  spentToday: bigint;
  allowed: boolean;
  isNative?: boolean;
};

type TreasuryAssetTableProps = {
  loading: boolean;
  tokenRows: TreasuryAssetRow[];
  formatTokenAmount: (value: bigint, token: TreasuryAssetRow) => string;
  formatRatio: (ratio?: number) => string;
  getDailySpendRatio: (token: TreasuryAssetRow) => number | undefined;
  getSpendBarClass: (ratio?: number) => string;
};

export function TreasuryAssetTable({
  loading,
  tokenRows,
  formatTokenAmount,
  formatRatio,
  getDailySpendRatio,
  getSpendBarClass,
}: TreasuryAssetTableProps) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-200 p-5">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
            <Vault size={19} />
          </span>
          <div>
            <h2 className="font-semibold text-slate-950">金库资产</h2>
            <p className="text-sm text-slate-500">
              展示配置代币在 Treasury 内的余额、给 MultiPoolManager 的可拉取额度，以及每日额度使用进度。
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] border-collapse text-left">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="px-5 py-3">资产</th>
              <th className="px-5 py-3">白名单</th>
              <th className="px-5 py-3">金库余额</th>
              <th className="px-5 py-3">Manager 授权</th>
              <th className="px-5 py-3">每日额度</th>
              <th className="px-5 py-3">今日使用</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {loading && tokenRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-500">
                  <LoaderCircle size={18} className="mx-auto mb-2 animate-spin" />
                  正在加载金库数据
                </td>
              </tr>
            ) : tokenRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-500">
                  暂无配置代币
                </td>
              </tr>
            ) : (
              tokenRows.map((token) => {
                const spendRatio = getDailySpendRatio(token);

                return (
                  <tr key={token.address} className="align-middle">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-950">{token.symbol}</p>
                      <p className="mt-1 font-mono text-xs text-slate-500">{shortAddress(token.address)}</p>
                    </td>
                    <td className="px-5 py-4">
                      <StatusPill tone={token.allowed || token.isNative ? 'success' : 'neutral'}>
                        {token.isNative ? '原生资产' : token.allowed ? '允许' : '未允许'}
                      </StatusPill>
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-slate-900">
                      {formatTokenAmount(token.balance, token)}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-700">
                      {token.isNative ? '不适用' : formatTokenAmount(token.approvedSpendRemaining, token)}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-700">
                      {token.dailySpendCap > ZERO_BIGINT ? formatTokenAmount(token.dailySpendCap, token) : '未设置'}
                    </td>
                    <td className="px-5 py-4">
                      <div className="min-w-[190px]">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-medium text-slate-800">{formatTokenAmount(token.spentToday, token)}</span>
                          <span className="text-xs font-semibold text-slate-500">{formatRatio(spendRatio)}</span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full transition-all ${getSpendBarClass(spendRatio)}`}
                            style={{ width: `${spendRatio ?? 0}%` }}
                          />
                        </div>
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
