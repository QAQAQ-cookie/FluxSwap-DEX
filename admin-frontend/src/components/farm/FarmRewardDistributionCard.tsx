'use client';

import { CircleDollarSign } from 'lucide-react';

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
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <CircleDollarSign size={19} />
            </span>
            <div>
              <h2 className="font-semibold text-slate-950">分发奖励</h2>
              <p className="text-sm text-slate-500">按权重向各农场分发奖励</p>
            </div>
          </div>

          <span
            className={`inline-flex min-h-8 w-fit max-w-full items-center rounded-full px-3 py-1 text-xs font-semibold leading-5 ${
              distributionBlockReason ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
            }`}
          >
            {distributionBlockReason ? `暂不可分发：${distributionBlockReason}` : '可以分发'}
          </span>
        </div>

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
              <div key={metric.label} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">{metric.label}</p>
                <p className={`mt-1 truncate text-sm font-semibold text-slate-900 ${metric.valueClassName ?? ''}`}>
                  {metric.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
