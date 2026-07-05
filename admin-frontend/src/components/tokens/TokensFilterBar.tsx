'use client';

import { ArrowDownAZ, ArrowUpAZ, Search } from 'lucide-react';

import { Card } from '@/components/AdminPrimitives';
import type { TokenFilterMode, TokenSortDirection, TokenSortField } from '@/components/tokens/TokensTypes';

type TokensFilterBarProps = {
  query: string;
  filterMode: TokenFilterMode;
  sortField: TokenSortField;
  sortDirection: TokenSortDirection;
  onQueryChange: (value: string) => void;
  onFilterModeChange: (value: TokenFilterMode) => void;
  onSortFieldChange: (value: TokenSortField) => void;
  onSortDirectionToggle: () => void;
};

export function TokensFilterBar({
  query,
  filterMode,
  sortField,
  sortDirection,
  onQueryChange,
  onFilterModeChange,
  onSortFieldChange,
  onSortDirectionToggle,
}: TokensFilterBarProps) {
  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">代币列表</h2>
          <p className="mt-1 text-sm text-slate-500">聚焦配置差异、协议用途和金库放行状态。</p>
        </div>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative w-full xl:w-72">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="搜索代币名、符号或地址"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-slate-500"
            />
          </div>

          <select
            value={filterMode}
            onChange={(event) => onFilterModeChange(event.target.value as TokenFilterMode)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-500"
          >
            <option value="all">全部代币</option>
            <option value="mismatch">只看待检查</option>
            <option value="action-required">只看需处理</option>
            <option value="in-market">只看交易代币</option>
            <option value="single-pool">只看单币池代币</option>
            <option value="reward-token">只看奖励代币</option>
            <option value="treasury-allowed">只看已进金库白名单</option>
            <option value="treasury-blocked">只看未进金库白名单</option>
          </select>

          <select
            value={sortField}
            onChange={(event) => onSortFieldChange(event.target.value as TokenSortField)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-500"
          >
            <option value="symbol">按代币排序</option>
            <option value="supply">按总供应排序</option>
            <option value="treasuryBalance">按金库余额排序</option>
          </select>

          <button
            type="button"
            onClick={onSortDirectionToggle}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            {sortDirection === 'asc' ? <ArrowUpAZ size={16} /> : <ArrowDownAZ size={16} />}
            {sortDirection === 'asc' ? '升序' : '降序'}
          </button>
        </div>
      </div>
    </Card>
  );
}
