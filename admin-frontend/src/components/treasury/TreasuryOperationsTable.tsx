'use client';

import { Fragment } from 'react';
import { ChevronDown, ChevronRight, LoaderCircle, Play, Settings2, X } from 'lucide-react';
import type { Address, Hex } from 'viem';

import { Card, shortAddress, StatusPill } from '@/components/AdminPrimitives';

type TreasuryOperationMetadata = {
  version: 1;
  chainId: number;
  treasuryAddress: Address;
  operationId: Hex;
  kind:
    | 'setAllowedToken'
    | 'setAllowedRecipient'
    | 'setDailySpendCap'
    | 'approveSpender'
    | 'revokeSpender'
    | 'setGuardian'
    | 'setOperator'
    | 'setMinDelay'
    | 'emergencyWithdraw'
    | 'emergencyWithdrawETH';
  label: string;
  summary: string;
  params: {
    token?: Address;
    tokenSymbol?: string;
    allowed?: boolean;
    recipient?: Address;
    spender?: Address;
    amountUnits?: string;
    amountDisplay?: string;
    newGuardian?: Address;
    newOperator?: Address;
    newMinDelay?: string;
    withdrawToken?: Address;
    withdrawTokenSymbol?: string;
    withdrawRecipient?: Address;
    withdrawAmountUnits?: string;
    withdrawAmountDisplay?: string;
  };
  createdAt: number;
};

export type TreasuryOperationTableRow = {
  operationId: Hex;
  executeAfter: bigint;
  scheduler?: Address;
  status: 'pending' | 'ready';
  blockNumber: bigint;
  metadata?: TreasuryOperationMetadata;
};

type TreasuryOperationsTableProps = {
  loading: boolean;
  operations: TreasuryOperationTableRow[];
  readyOperationCount: number;
  expandedOperationId: Hex | null;
  activeAction: string | null;
  isMultisig: boolean;
  onToggleExpand: (operationId: Hex) => void;
  onExecute: (operation: TreasuryOperationTableRow) => void;
  onCancel: (operation: TreasuryOperationTableRow) => void;
  formatUnixTime: (seconds: bigint) => string;
};

function formatMetadataValue(value?: string | boolean) {
  if (value === undefined) {
    return '--';
  }

  if (typeof value === 'boolean') {
    return value ? '允许' : '移除';
  }

  return value;
}

function getOperationStatusLabel(status: TreasuryOperationTableRow['status']) {
  return status === 'ready' ? '可执行' : '等待中';
}

function getOperationStatusTone(status: TreasuryOperationTableRow['status']) {
  return status === 'ready' ? 'warning' : 'neutral';
}

function buildOperationDetailItems(operation: TreasuryOperationTableRow, formatUnixTime: (seconds: bigint) => string) {
  const metadata = operation.metadata;

  if (!metadata) {
    return [
      { label: '操作 ID', value: operation.operationId },
      { label: '元数据状态', value: '缺少本地参数元数据' },
      { label: '可执行时间', value: formatUnixTime(operation.executeAfter) },
      { label: '发起人', value: operation.scheduler ?? '--' },
    ];
  }

  const items: Array<{ label: string; value: string }> = [
    { label: '操作 ID', value: metadata.operationId },
    { label: '元数据状态', value: '已记录' },
    { label: '本地创建时间', value: new Date(metadata.createdAt).toLocaleString('zh-CN', { hour12: false }) },
    { label: '可执行时间', value: formatUnixTime(operation.executeAfter) },
    { label: '发起人', value: operation.scheduler ?? '--' },
  ];

  if (metadata.params.token) {
    items.push({ label: '资产地址', value: metadata.params.token });
  }
  if (metadata.params.tokenSymbol) {
    items.push({ label: '资产符号', value: metadata.params.tokenSymbol });
  }
  if (metadata.params.recipient) {
    items.push({ label: '接收地址', value: metadata.params.recipient });
  }
  if (metadata.params.spender) {
    items.push({ label: '花费者地址', value: metadata.params.spender });
  }
  if (metadata.params.newGuardian) {
    items.push({ label: '新 Guardian', value: metadata.params.newGuardian });
  }
  if (metadata.params.newOperator) {
    items.push({ label: '新 Operator', value: metadata.params.newOperator });
  }
  if (metadata.params.allowed !== undefined) {
    items.push({ label: '白名单状态', value: formatMetadataValue(metadata.params.allowed) });
  }
  if (metadata.params.amountDisplay) {
    items.push({ label: '数量', value: metadata.params.amountDisplay });
  }
  if (metadata.params.amountUnits) {
    items.push({ label: '链上数量', value: metadata.params.amountUnits });
  }
  if (metadata.params.newMinDelay) {
    items.push({ label: '新治理延迟（秒）', value: metadata.params.newMinDelay });
  }
  if (metadata.params.withdrawToken) {
    items.push({ label: '提取资产地址', value: metadata.params.withdrawToken });
  }
  if (metadata.params.withdrawTokenSymbol) {
    items.push({ label: '提取资产', value: metadata.params.withdrawTokenSymbol });
  }
  if (metadata.params.withdrawRecipient) {
    items.push({ label: '提取接收地址', value: metadata.params.withdrawRecipient });
  }
  if (metadata.params.withdrawAmountDisplay) {
    items.push({ label: '提取数量', value: metadata.params.withdrawAmountDisplay });
  }
  if (metadata.params.withdrawAmountUnits) {
    items.push({ label: '链上提取数量', value: metadata.params.withdrawAmountUnits });
  }

  return items;
}

function isChainValue(value: string) {
  return /^0x[0-9a-fA-F]{20,}$/.test(value);
}

function OperationDetailValue({ value }: { value: string }) {
  if (isChainValue(value)) {
    return (
      <div className="mt-1 min-w-0">
        <p className="font-mono text-sm leading-6 text-slate-900">{shortAddress(value)}</p>
        <p className="mt-0.5 break-all font-mono text-xs leading-5 text-slate-500">{value}</p>
      </div>
    );
  }

  return <p className="mt-1 break-words text-sm leading-6 text-slate-800">{value}</p>;
}

export function TreasuryOperationsTable({
  loading,
  operations,
  readyOperationCount,
  expandedOperationId,
  activeAction,
  isMultisig,
  onToggleExpand,
  onExecute,
  onCancel,
  formatUnixTime,
}: TreasuryOperationsTableProps) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-200 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Settings2 size={19} />
            </span>
            <div>
              <h2 className="font-semibold text-slate-950">待处理治理操作</h2>
              <p className="text-sm text-slate-500">最近 20,000 区块内排队、尚未执行的金库操作。</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:w-[260px]">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">总数</p>
              <p className="mt-1 text-sm font-semibold text-slate-950">{operations.length}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">可执行</p>
              <p className="mt-1 text-sm font-semibold text-slate-950">{readyOperationCount}</p>
            </div>
          </div>
        </div>
      </div>

      {loading && operations.length === 0 ? (
        <div className="flex h-[200px] flex-col items-center justify-center gap-3 px-6 text-center text-sm text-slate-500">
          <LoaderCircle size={22} className="animate-spin text-slate-400" />
          <p>正在加载治理操作</p>
        </div>
      ) : operations.length === 0 ? (
        <div className="flex h-[200px] flex-col items-center justify-center gap-4 px-8 text-center">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
            <Settings2 size={20} />
          </span>
          <div className="max-w-md space-y-1">
            <p className="text-base font-semibold text-slate-900">暂无待处理治理操作</p>
            <p className="text-sm leading-6 text-slate-500">
              等 Multisig 排队治理动作后，这里会显示操作类型、可执行时间和执行入口。
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="w-10 px-4 py-3" aria-label="展开详情" />
                <th className="px-4 py-3">类型</th>
                <th className="px-5 py-3">内容</th>
                <th className="px-5 py-3">状态</th>
                <th className="px-5 py-3">可执行时间</th>
                <th className="px-5 py-3">发起人</th>
                <th className="px-5 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {operations.map((operation) => {
                const expanded = expandedOperationId === operation.operationId;
                const detailItems = buildOperationDetailItems(operation, formatUnixTime);

                return (
                  <Fragment key={operation.operationId}>
                    <tr
                      className="cursor-pointer align-middle transition hover:bg-slate-50/80"
                      onClick={() => onToggleExpand(operation.operationId)}
                    >
                      <td className="px-4 py-4">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition group-hover:border-slate-300">
                          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm font-semibold text-slate-950">{operation.metadata?.label ?? '未知操作'}</p>
                        <p className="mt-1 font-mono text-xs text-slate-500">{shortAddress(operation.operationId)}</p>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-700">
                        {operation.metadata?.summary ?? '缺少本地参数元数据，只能取消，不能直接执行'}
                      </td>
                      <td className="px-5 py-4">
                        <StatusPill tone={getOperationStatusTone(operation.status)}>
                          {getOperationStatusLabel(operation.status)}
                        </StatusPill>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-700">{formatUnixTime(operation.executeAfter)}</td>
                      <td className="px-5 py-4 font-mono text-sm text-slate-700">{shortAddress(operation.scheduler)}</td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => onExecute(operation)}
                            disabled={
                              activeAction === `execute:${operation.operationId}` ||
                              operation.status !== 'ready' ||
                              !operation.metadata
                            }
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400"
                          >
                            {activeAction === `execute:${operation.operationId}` ? (
                              <LoaderCircle size={14} className="animate-spin" />
                            ) : (
                              <Play size={14} />
                            )}
                            执行
                          </button>
                          <button
                            type="button"
                            onClick={() => onCancel(operation)}
                            disabled={activeAction === `cancel:${operation.operationId}` || !isMultisig}
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400"
                          >
                            {activeAction === `cancel:${operation.operationId}` ? (
                              <LoaderCircle size={14} className="animate-spin" />
                            ) : (
                              <X size={14} />
                            )}
                            取消
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expanded ? (
                      <tr key={`${operation.operationId}-detail`} className="bg-slate-50/70">
                        <td colSpan={7} className="px-5 py-4">
                          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-950">
                                  {operation.metadata?.label ?? '未知操作'}
                                </p>
                                <p className="mt-1 text-sm text-slate-500">
                                  {operation.metadata?.summary ?? '这个操作缺少本地参数元数据，因此只能查看基础链上信息。'}
                                </p>
                              </div>
                              <StatusPill tone={operation.metadata ? 'success' : 'warning'}>
                                {operation.metadata ? '元数据完整' : '缺少元数据'}
                              </StatusPill>
                            </div>

                            <div className="mt-4 grid gap-x-8 gap-y-4 md:grid-cols-2">
                              {detailItems.map((item) => (
                                <div
                                  key={`${operation.operationId}-${item.label}`}
                                  className="min-w-0 border-b border-dashed border-slate-100 pb-3 last:border-b-0"
                                >
                                  <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
                                  <OperationDetailValue value={item.value} />
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
