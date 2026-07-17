'use client';

import { CircleDollarSign, Scale, Sprout } from 'lucide-react';

import { SummaryStatCard } from '@/components/AdminPrimitives';
import type { AdminInfo } from '@/components/farm/FarmTypes';
import { formatBigIntAmountDown } from '@/lib/amounts';

type FarmStatusCardsProps = {
  adminInfo?: AdminInfo | null;
  activeFarmCount: number;
  emptyWeightedFarmCount: number;
};

export function FarmStatusCards({ adminInfo, activeFarmCount, emptyWeightedFarmCount }: FarmStatusCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <SummaryStatCard
        label="总农场数"
        value={adminInfo?.poolLength ?? 0}
        helper="当前已创建的全部质押池数量"
        icon={<Sprout size={19} />}
        tone="neutral"
      />
      <SummaryStatCard
        label="启用中"
        value={activeFarmCount}
        helper={adminInfo ? `${adminInfo.poolLength - activeFarmCount} 个未启用` : '等待链上数据'}
        icon={<Sprout size={19} />}
        tone={activeFarmCount > 0 ? 'success' : 'warning'}
      />
      <SummaryStatCard
        label="总权重"
        value={adminInfo?.totalAllocPoint.toString() ?? '0'}
        helper={emptyWeightedFarmCount > 0 ? `${emptyWeightedFarmCount} 个空质押池仍有权重` : '用于决定奖励分发比例'}
        icon={<Scale size={19} />}
        tone={emptyWeightedFarmCount > 0 ? 'warning' : 'neutral'}
      />
      <SummaryStatCard
        label="待分发奖励"
        value={formatBigIntAmountDown(adminInfo?.totalPendingRewards, adminInfo?.rewardToken?.decimals ?? 18, 4)}
        helper={adminInfo?.rewardToken?.symbol ?? 'FLUX'}
        icon={<CircleDollarSign size={19} />}
        tone={adminInfo?.totalPendingRewards ? 'success' : 'neutral'}
      />
    </div>
  );
}
