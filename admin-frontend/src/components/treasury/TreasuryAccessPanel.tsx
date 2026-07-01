'use client';

import { ShieldCheck, Wallet } from 'lucide-react';

import { Card, shortAddress, StatusPill } from '@/components/AdminPrimitives';

type TreasuryAccessPanelProps = {
  treasuryAddress?: string;
  multisig?: string;
  guardian?: string;
  operator?: string;
  walletConnected: boolean;
  walletAddress?: string;
  mounted: boolean;
  isMultisig: boolean;
  isGuardian: boolean;
  isOperator: boolean;
  onConnect?: () => void;
};

export function TreasuryAccessPanel({
  treasuryAddress,
  multisig,
  guardian,
  operator,
  walletConnected,
  walletAddress,
  mounted,
  isMultisig,
  isGuardian,
  isOperator,
  onConnect,
}: TreasuryAccessPanelProps) {
  return (
    <>
      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 p-5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <ShieldCheck size={19} />
            </span>
            <div>
              <h2 className="font-semibold text-slate-950">权限与治理地址</h2>
              <p className="text-sm text-slate-500">治理、多签、紧急控制和执行账户的当前配置。</p>
            </div>
          </div>
        </div>
        <div className="grid gap-0 divide-y divide-slate-200 md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-4">
          <div className="p-5">
            <p className="text-xs text-slate-500">Treasury</p>
            <p className="mt-2 font-mono text-sm font-semibold text-slate-900">{shortAddress(treasuryAddress)}</p>
          </div>
          <div className="p-5">
            <p className="text-xs text-slate-500">Multisig</p>
            <p className="mt-2 font-mono text-sm font-semibold text-slate-900">{shortAddress(multisig)}</p>
          </div>
          <div className="p-5">
            <p className="text-xs text-slate-500">Guardian</p>
            <p className="mt-2 font-mono text-sm font-semibold text-slate-900">{shortAddress(guardian)}</p>
          </div>
          <div className="p-5">
            <p className="text-xs text-slate-500">Operator</p>
            <p className="mt-2 font-mono text-sm font-semibold text-slate-900">{shortAddress(operator)}</p>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Wallet size={19} />
              </span>
              <div>
                <h2 className="font-semibold text-slate-950">治理操作入口</h2>
                <p className="text-sm text-slate-500">先识别当前钱包角色，后续排队、执行和取消操作都会基于这里的权限状态。</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500">当前钱包</p>
              <p className="mt-1 font-mono text-sm font-semibold text-slate-900">
                {walletConnected ? shortAddress(walletAddress) : '未连接'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusPill tone={isMultisig ? 'success' : 'neutral'}>Multisig</StatusPill>
              <StatusPill tone={isGuardian ? 'success' : 'neutral'}>Guardian</StatusPill>
              <StatusPill tone={isOperator ? 'success' : 'neutral'}>Operator</StatusPill>
            </div>
            {!walletConnected ? (
              <button
                type="button"
                onClick={onConnect}
                disabled={!mounted}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-500"
              >
                <Wallet size={15} />
                连接钱包
              </button>
            ) : null}
          </div>
        </div>
      </Card>
    </>
  );
}
