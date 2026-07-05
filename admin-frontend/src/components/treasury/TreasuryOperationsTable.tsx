'use client';

import { Fragment } from 'react';
import { ChevronDown, ChevronRight, LoaderCircle, Play, Settings2, X } from 'lucide-react';
import type { Hex } from 'viem';

import {
  AdminTable,
  AdminTableBody,
  AdminTableCell,
  AdminTableHead,
  AdminTableHeaderCell,
  Card,
  PanelToolbar,
  SectionPlaceholder,
  shortAddress,
  StatChip,
  StatusPill,
} from '@/components/AdminPrimitives';
import type { TreasuryOperationRow } from '@/components/treasury/TreasuryTypes';

type TreasuryOperationsTableProps = {
  loading: boolean;
  operations: TreasuryOperationRow[];
  readyOperationCount: number;
  expandedOperationId: Hex | null;
  activeAction: string | null;
  isMultisig: boolean;
  onToggleExpand: (operationId: Hex) => void;
  onExecute: (operation: TreasuryOperationRow) => void;
  onCancel: (operation: TreasuryOperationRow) => void;
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

function getOperationStatusLabel(status: TreasuryOperationRow['status']) {
  return status === 'ready' ? '可执行' : '等待中';
}

function getOperationStatusTone(status: TreasuryOperationRow['status']) {
  return status === 'ready' ? 'warning' : 'neutral';
}

function buildOperationDetailItems(operation: TreasuryOperationRow, formatUnixTime: (seconds: bigint) => string) {
  const metadata = operation.metadata;

  if (!metadata) {
    return [
      { label: '操作 ID', value: operation.operationId },
      { label: '参数记录', value: '缺少本地参数记录' },
      { label: '可执行时间', value: formatUnixTime(operation.executeAfter) },
      { label: '发起人', value: operation.scheduler ?? '--' },
    ];
  }

  const items: Array<{ label: string; value: string }> = [
    { label: '操作 ID', value: metadata.operationId },
    { label: '参数记录', value: '已记录' },
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
    items.push({ label: '新守护者', value: metadata.params.newGuardian });
  }
  if (metadata.params.newOperator) {
    items.push({ label: '新操作员', value: metadata.params.newOperator });
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
        <PanelToolbar
          icon={<Settings2 size={20} />}
          title="待处理治理操作"
          description="最近 20,000 个区块内已排队、未执行的金库操作。"
          actions={
            <>
              <StatChip label="总数" value={operations.length} />
              <StatChip label="可执行" value={readyOperationCount} />
            </>
          }
        />
      </div>

      {loading && operations.length === 0 ? (
        <SectionPlaceholder
          icon={<LoaderCircle size={20} className="animate-spin" />}
          title="正在加载治理操作"
          description="正在读取最近排队、尚未完成的金库治理动作。"
          className="min-h-[200px]"
        />
      ) : operations.length === 0 ? (
        <SectionPlaceholder
          icon={<Settings2 size={20} />}
          title="当前没有待处理治理操作"
          description="多签排队后，这里会显示类型、执行时间和操作入口。"
          className="min-h-[200px]"
        />
      ) : (
        <AdminTable minWidth="980px">
          <AdminTableHead>
            <tr>
              <AdminTableHeaderCell className="w-10 px-4" aria-label="展开详情" />
              <AdminTableHeaderCell className="px-4">类型</AdminTableHeaderCell>
              <AdminTableHeaderCell>内容</AdminTableHeaderCell>
              <AdminTableHeaderCell>状态</AdminTableHeaderCell>
              <AdminTableHeaderCell>可执行时间</AdminTableHeaderCell>
              <AdminTableHeaderCell>发起人</AdminTableHeaderCell>
              <AdminTableHeaderCell align="right">操作</AdminTableHeaderCell>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
              {operations.map((operation) => {
                const expanded = expandedOperationId === operation.operationId;
                const detailItems = buildOperationDetailItems(operation, formatUnixTime);

                return (
                  <Fragment key={operation.operationId}>
                    <tr
                      className="group cursor-pointer align-middle transition-colors hover:bg-slate-50/80"
                      onClick={() => onToggleExpand(operation.operationId)}
                    >
                      <AdminTableCell className="px-4">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition group-hover:border-slate-300">
                          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        </span>
                      </AdminTableCell>
                      <AdminTableCell className="px-4">
                        <p className="text-sm font-semibold text-slate-950">{operation.metadata?.label ?? '未知操作'}</p>
                        <p className="mt-1 font-mono text-xs text-slate-500">{shortAddress(operation.operationId)}</p>
                      </AdminTableCell>
                      <AdminTableCell className="text-sm leading-6 text-slate-700">
                        <div className="max-w-[320px]">
                          {operation.metadata?.summary ?? '缺少本地参数记录，只能取消，不能直接执行'}
                        </div>
                      </AdminTableCell>
                      <AdminTableCell>
                        <StatusPill tone={getOperationStatusTone(operation.status)}>
                          {getOperationStatusLabel(operation.status)}
                        </StatusPill>
                      </AdminTableCell>
                      <AdminTableCell className="text-sm leading-6 text-slate-700">{formatUnixTime(operation.executeAfter)}</AdminTableCell>
                      <AdminTableCell className="font-mono text-sm leading-6 text-slate-700">{shortAddress(operation.scheduler)}</AdminTableCell>
                      <AdminTableCell>
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
                      </AdminTableCell>
                    </tr>
                    {expanded ? (
                      <tr key={`${operation.operationId}-detail`} className="bg-slate-50/70">
                        <AdminTableCell colSpan={7} className="bg-slate-50/70">
                          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-950">
                                  {operation.metadata?.label ?? '未知操作'}
                                </p>
                                <p className="mt-1 text-sm text-slate-500">
                                  {operation.metadata?.summary ?? '该操作缺少本地参数记录，因此只能查看基础链上信息。'}
                                </p>
                              </div>
                              <StatusPill tone={operation.metadata ? 'success' : 'warning'}>
                                {operation.metadata ? '参数完整' : '缺少参数'}
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
                        </AdminTableCell>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
          </AdminTableBody>
        </AdminTable>
      )}
    </Card>
  );
}
