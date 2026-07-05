'use client';

import type { LucideIcon } from 'lucide-react';

import { Card, FieldLabel, PrimaryButton, SelectInput, TextInput } from '@/components/farm/FarmPrimitives';
import { ALLOC_POINT_HINT } from '@/components/farm/FarmUtils';

type FarmCreatePoolOption = {
  address: string;
  label: string;
  alreadyFarmed: boolean;
};

type FarmCreatePoolCardProps = {
  title: string;
  description: string;
  icon: LucideIcon;
  iconClassName: string;
  manualMode: boolean;
  address: string;
  allocPoint: string;
  active: boolean;
  options: FarmCreatePoolOption[];
  busy: boolean;
  canCreatePool: boolean;
  manualLabel: string;
  selectLabel: string;
  emptyOptionText: string;
  buttonLabel: string;
  onManualModeChange: (updater: (current: boolean) => boolean) => void;
  onAddressChange: (value: string) => void;
  onAllocPointChange: (value: string) => void;
  onActiveChange: (value: boolean) => void;
  onCreatePool: () => void;
};

export function FarmCreatePoolCard({
  title,
  description,
  icon: Icon,
  iconClassName,
  manualMode,
  address,
  allocPoint,
  active,
  options,
  busy,
  canCreatePool,
  manualLabel,
  selectLabel,
  emptyOptionText,
  buttonLabel,
  onManualModeChange,
  onAddressChange,
  onAllocPointChange,
  onActiveChange,
  onCreatePool,
}: FarmCreatePoolCardProps) {
  return (
    <Card className="flex h-full flex-col p-5">
      <div className="mb-5 flex items-center gap-3">
        <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${iconClassName}`}>
          <Icon size={19} />
        </span>
        <div>
          <h2 className="font-semibold text-slate-950">{title}</h2>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <FieldLabel>{manualMode ? manualLabel : selectLabel}</FieldLabel>
            <button
              type="button"
              onClick={() => onManualModeChange((current) => !current)}
              className="text-xs font-semibold text-slate-500 hover:text-slate-900"
            >
              {manualMode ? '使用列表选择' : '手动输入'}
            </button>
          </div>
          {manualMode ? (
            <TextInput value={address} onChange={onAddressChange} placeholder="0x..." disabled={!canCreatePool} />
          ) : (
            <SelectInput value={address} onChange={onAddressChange} disabled={!canCreatePool}>
              {options.length === 0 ? <option value="">{emptyOptionText}</option> : null}
              {options.map((option) => (
                <option key={option.address} value={option.address}>
                  {option.label}
                  {option.alreadyFarmed ? '（已创建）' : ''}
                </option>
              ))}
            </SelectInput>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <FieldLabel>奖励权重</FieldLabel>
            <label className="inline-flex shrink-0 items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={active}
                disabled={!canCreatePool}
                onChange={(event) => onActiveChange(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              创建后启用
            </label>
          </div>
          <TextInput value={allocPoint} onChange={onAllocPointChange} placeholder="100" disabled={!canCreatePool} />
          <p className="text-xs leading-5 text-slate-500">{ALLOC_POINT_HINT}</p>
        </div>

        <PrimaryButton onClick={onCreatePool} disabled={!canCreatePool} loading={busy} className="mt-auto w-full">
          {buttonLabel}
        </PrimaryButton>
      </div>
    </Card>
  );
}
