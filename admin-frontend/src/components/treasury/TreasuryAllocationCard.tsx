'use client';

import { LoaderCircle, Play, Vault } from 'lucide-react';
import type { Address } from 'viem';

import { Card, shortAddress } from '@/components/AdminPrimitives';
import { FieldLabel, SelectInput, TextInput } from '@/components/treasury/TreasuryFormControls';

const ZERO_BIGINT = BigInt(0);

type TreasuryAllocationToken = {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  balance: bigint;
  approvedSpendRemaining: bigint;
  dailySpendCap: bigint;
  spentToday: bigint;
  allowed: boolean;
  isNative?: boolean;
};

type TreasuryAllocationCardProps = {
  tokenRows: TreasuryAllocationToken[];
  selectedToken?: TreasuryAllocationToken;
  selectedTokenAddress: string;
  recipientAddress: string;
  amountValue: string;
  active: boolean;
  mounted: boolean;
  walletConnected: boolean;
  canAllocate: boolean;
  onTokenChange: (address: string) => void;
  onRecipientChange: (address: string) => void;
  onAmountChange: (value: string) => void;
  onSubmit: () => void;
  formatTokenAmount: (value: bigint, token: TreasuryAllocationToken) => string;
  subtractFloor: (value: bigint, used: bigint) => bigint;
};

export function TreasuryAllocationCard({
  tokenRows,
  selectedToken,
  selectedTokenAddress,
  recipientAddress,
  amountValue,
  active,
  mounted,
  walletConnected,
  canAllocate,
  onTokenChange,
  onRecipientChange,
  onAmountChange,
  onSubmit,
  formatTokenAmount,
  subtractFloor,
}: TreasuryAllocationCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
          <Vault size={19} />
        </span>
        <div>
          <h2 className="font-semibold text-slate-950">金库划拨</h2>
          <p className="text-sm text-slate-500">Operator 或 Multisig 可向白名单接收方划拨资产。</p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <div className="space-y-2">
          <FieldLabel>资产</FieldLabel>
          <SelectInput value={selectedTokenAddress} onChange={onTokenChange}>
            {tokenRows.map((token) => (
              <option key={token.address} value={token.address}>
                {token.symbol} - {token.isNative ? '原生资产' : shortAddress(token.address)}
              </option>
            ))}
          </SelectInput>
        </div>

        <div className="space-y-2">
          <FieldLabel>接收地址</FieldLabel>
          <TextInput value={recipientAddress} onChange={onRecipientChange} placeholder="0x..." />
        </div>

        <div className="space-y-2">
          <FieldLabel>划拨数量</FieldLabel>
          <TextInput
            value={amountValue}
            onChange={onAmountChange}
            placeholder={selectedToken ? `输入 ${selectedToken.symbol} 数量` : '输入数量'}
          />
        </div>

        {selectedToken ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            <div className="flex items-center justify-between gap-3">
              <span>金库余额</span>
              <span className="font-semibold text-slate-900">{formatTokenAmount(selectedToken.balance, selectedToken)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span>今日额度</span>
              <span className="font-semibold text-slate-900">
                {selectedToken.dailySpendCap > ZERO_BIGINT
                  ? formatTokenAmount(subtractFloor(selectedToken.dailySpendCap, selectedToken.spentToday), selectedToken)
                  : '未设置'}
              </span>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={onSubmit}
          disabled={active || !mounted || (walletConnected && !canAllocate)}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-500"
        >
          {active ? <LoaderCircle size={16} className="animate-spin" /> : <Play size={16} />}
          {walletConnected ? '确认划拨' : '连接钱包'}
        </button>
      </div>
    </Card>
  );
}
