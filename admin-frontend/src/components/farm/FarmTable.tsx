'use client';

import { LoaderCircle, Search, Sprout } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';

import {
  AdminTable,
  AdminTableBody,
  AdminTableHead,
  AdminTableHeaderCell,
  PanelToolbar,
  TablePlaceholderRow,
} from '@/components/AdminPrimitives';
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
        <PanelToolbar
          icon={<Sprout size={20} />}
          title="农场列表"
          description="查看质押池并管理权重与启停状态。"
          actions={
            <>
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
            </>
          }
        />
      </div>

      <AdminTable minWidth="1120px">
        <AdminTableHead>
          <tr>
            <AdminTableHeaderCell>农场</AdminTableHeaderCell>
            <AdminTableHeaderCell>状态</AdminTableHeaderCell>
            <AdminTableHeaderCell>当前权重</AdminTableHeaderCell>
            <AdminTableHeaderCell>质押总量</AdminTableHeaderCell>
            <AdminTableHeaderCell>待领取奖励</AdminTableHeaderCell>
            <AdminTableHeaderCell>池内奖励</AdminTableHeaderCell>
            <AdminTableHeaderCell>编辑</AdminTableHeaderCell>
            <AdminTableHeaderCell align="right">操作</AdminTableHeaderCell>
          </tr>
        </AdminTableHead>
        <AdminTableBody>
            {loading && farms.length === 0 ? (
              <TablePlaceholderRow
                colSpan={8}
                icon={<LoaderCircle size={20} className="animate-spin" />}
                title="正在加载农场数据"
                description="正在读取质押池、权重、奖励和启停状态。"
              />
            ) : filteredFarms.length === 0 ? (
              <TablePlaceholderRow
                colSpan={8}
                icon={<Sprout size={20} />}
                title={farms.length === 0 ? '当前还没有农场' : '没有符合条件的农场'}
                description={
                  farms.length === 0
                    ? '先创建并启用质押池，这里才会开始展示农场数据。'
                    : '试试调整搜索词或筛选条件。'
                }
              />
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
        </AdminTableBody>
      </AdminTable>
    </Card>
  );
}
