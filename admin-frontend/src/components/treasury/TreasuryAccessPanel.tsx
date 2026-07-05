'use client';

import { ShieldCheck, Wallet } from 'lucide-react';

import { Card, SectionHeader, shortAddress, StatusPill } from '@/components/AdminPrimitives';

type TreasuryAccessPanelProps = {
  treasuryAddress?: string;
  multisig?: string;
  guardian?: string;
  operator?: string;
  walletConnected: boolean;
  walletAddress?: string;
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
  isMultisig,
  isGuardian,
  isOperator,
  onConnect,
}: TreasuryAccessPanelProps) {
  return (
    <>
      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 p-5">
          <SectionHeader
            icon={<ShieldCheck size={20} />}
            title="权限与治理地址"
            description="查看治理角色和执行账户配置。"
          />
        </div>
        <div className="grid gap-0 divide-y divide-slate-200 md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-4">
          <div className="p-5">
            <p className="text-xs text-slate-500">金库</p>
            <p className="mt-2 font-mono text-sm font-semibold text-slate-900">{shortAddress(treasuryAddress)}</p>
          </div>
          <div className="p-5">
            <p className="text-xs text-slate-500">多签</p>
            <p className="mt-2 font-mono text-sm font-semibold text-slate-900">{shortAddress(multisig)}</p>
          </div>
          <div className="p-5">
            <p className="text-xs text-slate-500">守护者</p>
            <p className="mt-2 font-mono text-sm font-semibold text-slate-900">{shortAddress(guardian)}</p>
          </div>
          <div className="p-5">
            <p className="text-xs text-slate-500">操作员</p>
            <p className="mt-2 font-mono text-sm font-semibold text-slate-900">{shortAddress(operator)}</p>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <SectionHeader
            icon={<Wallet size={20} />}
            title="治理操作入口"
            description="当前钱包角色决定后续排队、执行和取消权限。"
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500">当前钱包</p>
              <p className="mt-1 font-mono text-sm font-semibold text-slate-900">
                {walletConnected ? shortAddress(walletAddress) : '未连接'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusPill tone={isMultisig ? 'success' : 'neutral'}>多签</StatusPill>
              <StatusPill tone={isGuardian ? 'success' : 'neutral'}>守护者</StatusPill>
              <StatusPill tone={isOperator ? 'success' : 'neutral'}>操作员</StatusPill>
            </div>
            {!walletConnected ? (
              <button
                type="button"
                onClick={onConnect}
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
