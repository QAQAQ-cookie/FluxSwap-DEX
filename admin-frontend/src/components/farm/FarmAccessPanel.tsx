'use client';

import { ShieldCheck } from 'lucide-react';

import { SectionHeader, StatusPill } from '@/components/AdminPrimitives';
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
        <SectionHeader
          icon={<ShieldCheck size={20} />}
          title="权限与合约状态"
          description="当前钱包需具备对应权限后才能执行管理操作。"
          badge={<StatusPill tone={hasPermission ? 'success' : 'warning'}>{hasPermission ? '当前钱包有管理权限' : '当前钱包暂无管理权限'}</StatusPill>}
        />
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
