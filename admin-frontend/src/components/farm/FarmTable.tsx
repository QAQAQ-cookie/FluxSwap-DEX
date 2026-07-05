'use client';

import { LoaderCircle, Search } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';

import { Card } from '@/components/farm/FarmPrimitives';
import type { AdminInfo, FarmPoolEdits, FarmRow } from '@/components/farm/FarmTypes';
import { FarmTableRow } from '@/components/farm/FarmTableRow';

type FarmTableProps = {
  adminInfo?: AdminInfo | null;
  farms: FarmRow[];
  filteredFarms: FarmRow[];
  loading: boolean;
  searchQuery: string;
  activeOnly: boolean;
  poolEdits: FarmPoolEdits;
  canUpdatePool: boolean;
  activeAction: string | null;
  onSearchQueryChange: (value: string) => void;
  onActiveOnlyChange: (value: boolean) => void;
  onPoolEditsChange: Dispatch<SetStateAction<FarmPoolEdits>>;
  onUpdatePool: (farm: FarmRow) => void;
};

export function FarmTable({
  adminInfo,
  farms,
  filteredFarms,
  loading,
  searchQuery,
  activeOnly,
  poolEdits,
  canUpdatePool,
  activeAction,
  onSearchQueryChange,
  onActiveOnlyChange,
  onPoolEditsChange,
  onUpdatePool,
}: FarmTableProps) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-200 p-5">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">农场列表</h2>
            <p className="mt-1 text-sm text-slate-500">查看质押池并管理权重与启停状态。</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:w-72">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={searchQuery}
                onChange={(event) => onSearchQueryChange(event.target.value)}
                placeholder="搜索交易对、池地址或代币地址"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-slate-500"
              />
            </div>
            <label className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(event) => onActiveOnlyChange(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              只看启用
            </label>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1120px] w-full border-collapse text-left">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="px-5 py-3">农场</th>
              <th className="px-5 py-3">状态</th>
              <th className="px-5 py-3">当前权重</th>
              <th className="px-5 py-3">质押总量</th>
              <th className="px-5 py-3">待领取奖励</th>
              <th className="px-5 py-3">池内奖励</th>
              <th className="px-5 py-3">编辑</th>
              <th className="px-5 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {loading && farms.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-sm text-slate-500">
                  <LoaderCircle size={18} className="mx-auto mb-2 animate-spin" />
                  正在加载农场数据
                </td>
              </tr>
            ) : filteredFarms.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-sm text-slate-500">
                  暂无农场数据
                </td>
              </tr>
            ) : (
              filteredFarms.map((farm) => (
                <FarmTableRow
                  key={`${farm.pid}-${farm.poolAddress}`}
                  adminInfo={adminInfo}
                  farm={farm}
                  edit={
                    poolEdits[farm.pid] ?? {
                      allocPoint: farm.allocPoint.toString(),
                      active: farm.active,
                    }
                  }
                  canUpdatePool={canUpdatePool}
                  activeAction={activeAction}
                  onPoolEditsChange={onPoolEditsChange}
                  onUpdatePool={onUpdatePool}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
