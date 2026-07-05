'use client';

import { LoaderCircle, Vault } from 'lucide-react';
import type { Address } from 'viem';

import {
  AdminTable,
  AdminTableBody,
  AdminTableCell,
  AdminTableHead,
  AdminTableHeaderCell,
  Card,
  PanelToolbar,
  shortAddress,
  StatusPill,
  TablePlaceholderRow,
} from '@/components/AdminPrimitives';

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
        <PanelToolbar
          icon={<Vault size={20} />}
          title="金库资产"
          description="展示金库余额、授权额度和每日额度使用进度。"
        />
      </div>

      <AdminTable minWidth="1040px">
        <AdminTableHead>
          <tr>
            <AdminTableHeaderCell>资产</AdminTableHeaderCell>
            <AdminTableHeaderCell>白名单</AdminTableHeaderCell>
            <AdminTableHeaderCell>金库余额</AdminTableHeaderCell>
            <AdminTableHeaderCell>管理合约授权</AdminTableHeaderCell>
            <AdminTableHeaderCell>每日额度</AdminTableHeaderCell>
            <AdminTableHeaderCell>今日使用</AdminTableHeaderCell>
          </tr>
        </AdminTableHead>
        <AdminTableBody>
            {loading && tokenRows.length === 0 ? (
              <TablePlaceholderRow
                colSpan={6}
                icon={<LoaderCircle size={20} className="animate-spin" />}
                title="正在加载金库资产"
                description="正在读取余额、授权额度和每日额度使用情况。"
              />
            ) : tokenRows.length === 0 ? (
              <TablePlaceholderRow
                colSpan={6}
                icon={<Vault size={20} />}
                title="当前没有可展示的金库资产"
                description="先检查代币配置、金库地址和链上部署状态。"
              />
            ) : (
              tokenRows.map((token) => {
                const spendRatio = getDailySpendRatio(token);

                return (
                  <tr key={token.address} className="align-middle transition-colors hover:bg-slate-50/70">
                    <AdminTableCell>
                      <p className="font-semibold text-slate-950">{token.symbol}</p>
                      <p className="mt-1 font-mono text-xs text-slate-500">{shortAddress(token.address)}</p>
                    </AdminTableCell>
                    <AdminTableCell>
                      <StatusPill tone={token.allowed || token.isNative ? 'success' : 'neutral'}>
                        {token.isNative ? '原生资产' : token.allowed ? '允许' : '未允许'}
                      </StatusPill>
                    </AdminTableCell>
                    <AdminTableCell className="text-sm font-semibold leading-6 text-slate-900">
                      {formatTokenAmount(token.balance, token)}
                    </AdminTableCell>
                    <AdminTableCell className="text-sm leading-6 text-slate-700">
                      {token.isNative ? '不适用' : formatTokenAmount(token.approvedSpendRemaining, token)}
                    </AdminTableCell>
                    <AdminTableCell className="text-sm leading-6 text-slate-700">
                      {token.dailySpendCap > ZERO_BIGINT ? formatTokenAmount(token.dailySpendCap, token) : '未设置'}
                    </AdminTableCell>
                    <AdminTableCell>
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
