'use client';

import { LoaderCircle, Play, Settings2 } from 'lucide-react';
import type { Address } from 'viem';

import { Card, shortAddress } from '@/components/AdminPrimitives';
import { FieldLabel, SelectInput, TextInput } from '@/components/treasury/TreasuryFormControls';
import type { TreasuryOperationKind } from '@/components/treasury/TreasuryTypes';

type TreasuryGovernanceToken = {
  address: Address;
  symbol: string;
  decimals: number;
};

type TreasuryGovernanceFormProps = {
  operationKind: TreasuryOperationKind;
  selectedTokenAddress: string;
  selectedToken?: TreasuryGovernanceToken;
  tokens: TreasuryGovernanceToken[];
  booleanValue: string;
  targetAddress: string;
  spenderAddress: string;
  amountValue: string;
  delaySeconds: string;
  minDelayPlaceholder: string;
  managerAddress?: Address;
  newMinDelayValue: string;
  withdrawAmountValue: string;
  withdrawRecipientAddress: string;
  active: boolean;
  mounted: boolean;
  walletConnected: boolean;
  isMultisig: boolean;
  onOperationKindChange: (value: TreasuryOperationKind) => void;
  onSelectedTokenChange: (value: string) => void;
  onBooleanValueChange: (value: string) => void;
  onTargetAddressChange: (value: string) => void;
  onSpenderAddressChange: (value: string) => void;
  onAmountValueChange: (value: string) => void;
  onDelaySecondsChange: (value: string) => void;
  onNewMinDelayValueChange: (value: string) => void;
  onWithdrawAmountValueChange: (value: string) => void;
  onWithdrawRecipientAddressChange: (value: string) => void;
  onSubmit: () => void;
};

export function TreasuryGovernanceForm({
  operationKind,
  selectedTokenAddress,
  selectedToken,
  tokens,
  booleanValue,
  targetAddress,
  spenderAddress,
  amountValue,
  delaySeconds,
  minDelayPlaceholder,
  managerAddress,
  newMinDelayValue,
  withdrawAmountValue,
  withdrawRecipientAddress,
  active,
  mounted,
  walletConnected,
  isMultisig,
  onOperationKindChange,
  onSelectedTokenChange,
  onBooleanValueChange,
  onTargetAddressChange,
  onSpenderAddressChange,
  onAmountValueChange,
  onDelaySecondsChange,
  onNewMinDelayValueChange,
  onWithdrawAmountValueChange,
  onWithdrawRecipientAddressChange,
  onSubmit,
}: TreasuryGovernanceFormProps) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-200 p-5">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Settings2 size={19} />
          </span>
          <div>
            <h2 className="font-semibold text-slate-950">创建治理操作</h2>
            <p className="text-sm text-slate-500">由多签排队，达到治理延迟后执行，并保留本地参数记录。</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-2">
        <div className="space-y-2">
          <FieldLabel>操作类型</FieldLabel>
          <SelectInput
            value={operationKind}
            onChange={(value) => onOperationKindChange(value as TreasuryOperationKind)}
          >
            <option value="setAllowedToken">资产白名单</option>
            <option value="setAllowedRecipient">接收方白名单</option>
            <option value="setDailySpendCap">每日支出额度</option>
            <option value="approveSpender">授权花费者额度</option>
            <option value="revokeSpender">撤销花费者额度</option>
            <option value="setGuardian">更新守护者</option>
            <option value="setOperator">更新操作员</option>
            <option value="setMinDelay">更新治理延迟</option>
            <option value="emergencyWithdraw">紧急提取代币</option>
            <option value="emergencyWithdrawETH">紧急提取 ETH</option>
          </SelectInput>
        </div>

        <div className="space-y-2">
          <FieldLabel>排队延迟（秒）</FieldLabel>
          <TextInput value={delaySeconds} onChange={onDelaySecondsChange} placeholder={minDelayPlaceholder} />
        </div>

        {['setAllowedToken', 'setDailySpendCap', 'approveSpender', 'revokeSpender', 'emergencyWithdraw'].includes(
          operationKind,
        ) ? (
          <div className="space-y-2">
            <FieldLabel>资产</FieldLabel>
            <SelectInput value={selectedTokenAddress} onChange={onSelectedTokenChange}>
              {tokens.map((token) => (
                <option key={token.address} value={token.address}>
                  {token.symbol} - {shortAddress(token.address)}
                </option>
              ))}
            </SelectInput>
          </div>
        ) : null}

        {['setAllowedToken', 'setAllowedRecipient'].includes(operationKind) ? (
          <div className="space-y-2">
            <FieldLabel>白名单状态</FieldLabel>
            <SelectInput value={booleanValue} onChange={onBooleanValueChange}>
              <option value="true">允许</option>
              <option value="false">移除</option>
            </SelectInput>
          </div>
        ) : null}

        {['setAllowedRecipient', 'setGuardian', 'setOperator'].includes(operationKind) ? (
          <div className="space-y-2 lg:col-span-2">
            <FieldLabel>
              {operationKind === 'setAllowedRecipient'
                ? '接收地址'
                : operationKind === 'setGuardian'
                  ? '新守护者地址'
                  : '新操作员地址'}
            </FieldLabel>
            <TextInput value={targetAddress} onChange={onTargetAddressChange} placeholder="0x..." />
          </div>
        ) : null}

        {['approveSpender', 'revokeSpender'].includes(operationKind) ? (
          <div className="space-y-2 lg:col-span-2">
            <FieldLabel>花费者地址</FieldLabel>
            <TextInput value={spenderAddress} onChange={onSpenderAddressChange} placeholder={managerAddress ?? '0x...'} />
          </div>
        ) : null}

        {['setDailySpendCap', 'approveSpender'].includes(operationKind) ? (
          <div className="space-y-2">
            <FieldLabel>{operationKind === 'setDailySpendCap' ? '每日额度' : '授权额度'}</FieldLabel>
            <TextInput
              value={amountValue}
              onChange={onAmountValueChange}
              placeholder={selectedToken ? `输入 ${selectedToken.symbol} 数量` : '输入数量'}
            />
          </div>
        ) : null}

        {operationKind === 'setMinDelay' ? (
          <div className="space-y-2">
            <FieldLabel>新的治理延迟（秒）</FieldLabel>
            <TextInput value={newMinDelayValue} onChange={onNewMinDelayValueChange} placeholder="例如 86400" />
          </div>
        ) : null}

        {['emergencyWithdraw', 'emergencyWithdrawETH'].includes(operationKind) ? (
          <>
            <div className="space-y-2">
              <FieldLabel>提取数量</FieldLabel>
              <TextInput
                value={withdrawAmountValue}
                onChange={onWithdrawAmountValueChange}
                placeholder={
                  operationKind === 'emergencyWithdraw' && selectedToken
                    ? `输入 ${selectedToken.symbol} 数量`
                    : '输入 ETH 数量'
                }
              />
            </div>

            <div className="space-y-2">
              <FieldLabel>接收地址</FieldLabel>
              <TextInput value={withdrawRecipientAddress} onChange={onWithdrawRecipientAddressChange} placeholder="0x..." />
            </div>
          </>
        ) : null}

        <div className="flex items-end justify-end lg:col-span-2">
          <button
            type="button"
            onClick={onSubmit}
            disabled={active || !mounted || (walletConnected && !isMultisig)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-500"
          >
            {active ? <LoaderCircle size={16} className="animate-spin" /> : <Play size={16} />}
            {walletConnected ? '生成并排队' : '连接钱包'}
          </button>
        </div>
      </div>
    </Card>
  );
}
