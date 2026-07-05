'use client';

import { Plus, Sprout } from 'lucide-react';

import { FarmCreatePoolCard } from '@/components/farm/FarmCreatePoolCard';
import type { LpPairOption, SingleTokenOption } from '@/components/farm/FarmTypes';

type FarmCreatePoolCardsProps = {
  canCreatePool: boolean;
  lpManualMode: boolean;
  lpTokenAddress: string;
  lpAllocPoint: string;
  lpActive: boolean;
  lpPairOptions: LpPairOption[];
  lpBusy: boolean;
  singleManualMode: boolean;
  singleTokenAddress: string;
  singleAllocPoint: string;
  singleActive: boolean;
  singleTokenOptions: SingleTokenOption[];
  singleBusy: boolean;
  onLpManualModeChange: (updater: (current: boolean) => boolean) => void;
  onLpTokenAddressChange: (value: string) => void;
  onLpAllocPointChange: (value: string) => void;
  onLpActiveChange: (value: boolean) => void;
  onCreateLpPool: () => void;
  onSingleManualModeChange: (updater: (current: boolean) => boolean) => void;
  onSingleTokenAddressChange: (value: string) => void;
  onSingleAllocPointChange: (value: string) => void;
  onSingleActiveChange: (value: boolean) => void;
  onCreateSinglePool: () => void;
};

export function FarmCreatePoolCards({
  canCreatePool,
  lpManualMode,
  lpTokenAddress,
  lpAllocPoint,
  lpActive,
  lpPairOptions,
  lpBusy,
  singleManualMode,
  singleTokenAddress,
  singleAllocPoint,
  singleActive,
  singleTokenOptions,
  singleBusy,
  onLpManualModeChange,
  onLpTokenAddressChange,
  onLpAllocPointChange,
  onLpActiveChange,
  onCreateLpPool,
  onSingleManualModeChange,
  onSingleTokenAddressChange,
  onSingleAllocPointChange,
  onSingleActiveChange,
  onCreateSinglePool,
}: FarmCreatePoolCardsProps) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <FarmCreatePoolCard
        title="创建 LP 质押池"
        description="从交易对创建 LP 质押池"
        icon={Plus}
        iconClassName="bg-sky-50 text-sky-600"
        manualMode={lpManualMode}
        address={lpTokenAddress}
        allocPoint={lpAllocPoint}
        active={lpActive}
        options={lpPairOptions}
        busy={lpBusy}
        canCreatePool={canCreatePool}
        manualLabel="LP 代币地址"
        selectLabel="选择交易对"
        emptyOptionText="暂无可选交易对"
        buttonLabel="创建 LP 池"
        onManualModeChange={onLpManualModeChange}
        onAddressChange={onLpTokenAddressChange}
        onAllocPointChange={onLpAllocPointChange}
        onActiveChange={onLpActiveChange}
        onCreatePool={onCreateLpPool}
      />

      <FarmCreatePoolCard
        title="创建单币质押池"
        description="从代币创建单币质押池"
        icon={Sprout}
        iconClassName="bg-emerald-50 text-emerald-600"
        manualMode={singleManualMode}
        address={singleTokenAddress}
        allocPoint={singleAllocPoint}
        active={singleActive}
        options={singleTokenOptions.map((option) => ({
          address: option.address,
          label: option.symbol,
          alreadyFarmed: option.alreadyFarmed,
        }))}
        busy={singleBusy}
        canCreatePool={canCreatePool}
        manualLabel="代币地址"
        selectLabel="选择代币"
        emptyOptionText="暂无可选代币"
        buttonLabel="创建单币池"
        onManualModeChange={onSingleManualModeChange}
        onAddressChange={onSingleTokenAddressChange}
        onAllocPointChange={onSingleAllocPointChange}
        onActiveChange={onSingleActiveChange}
        onCreatePool={onCreateSinglePool}
      />
    </div>
  );
}
