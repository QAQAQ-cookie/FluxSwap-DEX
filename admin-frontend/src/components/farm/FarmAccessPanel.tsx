'use client';

import { Card } from '@/components/farm/FarmPrimitives';
import type { AdminInfo } from '@/components/farm/FarmTypes';
import { shortAddress } from '@/components/farm/FarmUtils';

type FarmAccessPanelProps = {
  adminInfo?: AdminInfo | null;
  isFactoryOwner: boolean;
  isManagerOwner: boolean;
  isManagerOperator: boolean;
};

export function FarmAccessPanel({
  adminInfo,
  isFactoryOwner,
  isManagerOwner,
  isManagerOperator,
}: FarmAccessPanelProps) {
  const hasPermission = isFactoryOwner || isManagerOwner || isManagerOperator;

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-200 p-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">权限与合约状态</h2>
            <p className="mt-1 text-sm text-slate-500">当前钱包需具备对应权限后才能执行管理操作。</p>
          </div>
          <span
            className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold ${
              hasPermission ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
            }`}
          >
            {hasPermission ? '当前钱包有管理权限' : '当前钱包暂无管理权限'}
          </span>
        </div>
      </div>
      <div className="grid gap-0 divide-y divide-slate-200 md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-4">
        <div className="p-5">
          <p className="text-xs text-slate-500">工厂所有者</p>
          <p className="mt-2 font-mono text-sm text-slate-900">{shortAddress(adminInfo?.factoryOwner)}</p>
          <p className="mt-2 text-xs text-slate-500">{isFactoryOwner ? '可创建质押池' : '创建池需要此权限'}</p>
        </div>
        <div className="p-5">
          <p className="text-xs text-slate-500">管理合约所有者</p>
          <p className="mt-2 font-mono text-sm text-slate-900">{shortAddress(adminInfo?.managerOwner)}</p>
          <p className="mt-2 text-xs text-slate-500">{isManagerOwner ? '可调整池权重/启停' : '调整池需要此权限'}</p>
        </div>
        <div className="p-5">
          <p className="text-xs text-slate-500">管理合约操作员</p>
          <p className="mt-2 font-mono text-sm text-slate-900">{shortAddress(adminInfo?.managerOperator)}</p>
          <p className="mt-2 text-xs text-slate-500">{isManagerOperator ? '可分发奖励' : '分发奖励需要对应权限'}</p>
        </div>
        <div className="p-5">
          <p className="text-xs text-slate-500">金库</p>
          <p className="mt-2 font-mono text-sm text-slate-900">{shortAddress(adminInfo?.treasury)}</p>
          <p className="mt-2 text-xs text-slate-500">操作员：{shortAddress(adminInfo?.treasuryStatus?.operator)}</p>
        </div>
      </div>
    </Card>
  );
}
