'use client';

import { CircleDollarSign } from 'lucide-react';

import { MetricCard, SectionHeader } from '@/components/AdminPrimitives';
import { Card, FieldLabel, PrimaryButton, TextInput } from '@/components/farm/FarmPrimitives';
import type { AdminInfo } from '@/components/farm/FarmTypes';
import { formatOptionalTokenAmount, shortAddress } from '@/components/farm/FarmUtils';
import { formatBigIntAmountDown } from '@/lib/amounts';

type FarmRewardDistributionCardProps = {
  adminInfo?: AdminInfo | null;
  rewardAmount: string;
  canDistribute: boolean;
  canSubmitDistribution: boolean;
  distributionBlockReason: string | null;
  dailySpendRemaining?: bigint;
  emptyWeightedFarmCount: number;
  distributeBusy: boolean;
  onRewardAmountChange: (value: string) => void;
  onDistributeRewards: () => void;
};

export function FarmRewardDistributionCard({
  adminInfo,
  rewardAmount,
  canDistribute,
  canSubmitDistribution,
  distributionBlockReason,
  dailySpendRemaining,
  emptyWeightedFarmCount,
  distributeBusy,
  onRewardAmountChange,
  onDistributeRewards,
}: FarmRewardDistributionCardProps) {
  const rewardDecimals = adminInfo?.rewardToken?.decimals ?? 18;

  const metrics = [
    {
      label: '奖励代币',
      value: adminInfo?.rewardToken?.symbol ?? 'FLUX',
    },
    {
      label: '待分发',
      value: formatBigIntAmountDown(adminInfo?.totalPendingRewards, rewardDecimals, 4),
    },
    {
      label: '启用农场',
      value: `${adminInfo?.activePoolCount ?? 0} / ${adminInfo?.poolLength ?? 0}`,
    },
    {
      label: '金库余额',
      value: formatOptionalTokenAmount(adminInfo?.treasuryStatus?.rewardBalance, adminInfo?.rewardToken),
    },
    {
      label: '已授权额度',
      value: formatOptionalTokenAmount(adminInfo?.treasuryStatus?.approvedSpendRemaining, adminInfo?.rewardToken),
    },
    {
      label: '今日剩余额度',
      value:
        dailySpendRemaining === undefined
          ? '未设置上限'
          : formatOptionalTokenAmount(dailySpendRemaining, adminInfo?.rewardToken),
    },
    {
      label: '金库状态',
      value: adminInfo?.treasuryStatus ? (adminInfo.treasuryStatus.paused ? '已暂停' : '正常') : '--',
      valueClassName: adminInfo?.treasuryStatus?.paused ? 'text-rose-600' : 'text-emerald-600',
    },
    {
      label: '金库操作员',
      value: shortAddress(adminInfo?.treasuryStatus?.operator),
      valueClassName: 'font-mono',
    },
  ];

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-5">
        <SectionHeader
          icon={<CircleDollarSign size={20} />}
          title="分发奖励"
          description="按权重向各农场分发奖励。"
          badge={
            <span
              className={`inline-flex min-h-8 w-fit max-w-full items-center rounded-full px-3 py-1 text-xs font-semibold leading-5 ${
                distributionBlockReason ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
              }`}
            >
              {distributionBlockReason ? `暂不可分发：${distributionBlockReason}` : '可以分发'}
            </span>
          }
        />

        {emptyWeightedFarmCount > 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
            有 {emptyWeightedFarmCount} 个启用农场当前无人质押但仍有奖励权重。为避免奖励进入空池，请先在农场列表中停用这些农场，或将权重调整为 0。
          </div>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.72fr)_1.28fr]">
          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <FieldLabel>奖励数量</FieldLabel>
                <TextInput value={rewardAmount} onChange={onRewardAmountChange} placeholder="0.0" disabled={!canDistribute} />
              </div>
              <PrimaryButton
                onClick={onDistributeRewards}
                disabled={!canSubmitDistribution}
                loading={distributeBusy}
                className="w-full"
              >
                分发奖励
              </PrimaryButton>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <MetricCard
                key={metric.label}
                label={metric.label}
                value={metric.value}
                valueClassName={metric.valueClassName ? `text-slate-900 ${metric.valueClassName}` : 'text-slate-900'}
              />
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
