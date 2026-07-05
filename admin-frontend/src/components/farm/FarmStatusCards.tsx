'use client';

import { Card } from '@/components/farm/FarmPrimitives';
import type { AdminInfo } from '@/components/farm/FarmTypes';
import { formatBigIntAmountDown } from '@/lib/amounts';

type FarmStatusCardsProps = {
  adminInfo?: AdminInfo | null;
  activeFarmCount: number;
};

export function FarmStatusCards({ adminInfo, activeFarmCount }: FarmStatusCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card className="p-5">
        <p className="text-sm text-slate-500">总农场数</p>
        <p className="mt-3 text-2xl font-semibold text-slate-950">{adminInfo?.poolLength ?? 0}</p>
      </Card>
      <Card className="p-5">
        <p className="text-sm text-slate-500">启用中</p>
        <p className="mt-3 text-2xl font-semibold text-slate-950">{activeFarmCount}</p>
      </Card>
      <Card className="p-5">
        <p className="text-sm text-slate-500">总权重</p>
        <p className="mt-3 text-2xl font-semibold text-slate-950">{adminInfo?.totalAllocPoint.toString() ?? '0'}</p>
      </Card>
      <Card className="p-5">
        <p className="text-sm text-slate-500">待分发奖励</p>
        <p className="mt-3 text-2xl font-semibold text-slate-950">
          {formatBigIntAmountDown(adminInfo?.totalPendingRewards, adminInfo?.rewardToken?.decimals ?? 18, 4)}
        </p>
      </Card>
    </div>
  );
}
