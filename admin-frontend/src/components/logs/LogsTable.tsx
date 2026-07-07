'use client';

import { LoaderCircle, ScrollText } from 'lucide-react';

import {
  AdminTable,
  AdminTableBody,
  AdminTableCell,
  AdminTableHead,
  AdminTableHeaderCell,
  Card,
  PanelToolbar,
  shortAddress,
  StatusPill,
  TablePlaceholderRow,
} from '@/components/AdminPrimitives';
import type { LogRow } from '@/components/logs/LogsTypes';

type LogsTableProps = {
  loading: boolean;
  logs: LogRow[];
};

export function LogsTable({ loading, logs }: LogsTableProps) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-200 p-5">
        <PanelToolbar
          icon={<ScrollText size={20} />}
          title="最近操作"
          description="默认读取最近 20,000 个区块内最多 80 条农场与金库管理事件。"
        />
      </div>

      <AdminTable minWidth="980px">
        <AdminTableHead>
          <tr>
            <AdminTableHeaderCell>模块</AdminTableHeaderCell>
            <AdminTableHeaderCell>动作</AdminTableHeaderCell>
            <AdminTableHeaderCell>内容</AdminTableHeaderCell>
            <AdminTableHeaderCell>区块</AdminTableHeaderCell>
            <AdminTableHeaderCell>交易</AdminTableHeaderCell>
          </tr>
        </AdminTableHead>
        <AdminTableBody>
            {loading && logs.length === 0 ? (
              <TablePlaceholderRow
                colSpan={5}
                icon={<LoaderCircle size={20} className="animate-spin" />}
                title="正在加载操作记录"
                description="正在读取农场和金库最近的管理事件。"
              />
            ) : logs.length === 0 ? (
              <TablePlaceholderRow
                colSpan={5}
                icon={<ScrollText size={20} />}
                title="最近没有管理事件"
                description="如果刚切换网络或重启本地链，稍后刷新再看。"
              />
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="align-middle transition-colors hover:bg-slate-50/70">
                  <AdminTableCell>
                    <StatusPill tone={log.scope === 'farm' ? 'success' : 'warning'}>
                      {log.scope === 'farm' ? '农场' : '金库'}
                    </StatusPill>
                  </AdminTableCell>
                  <AdminTableCell className="text-sm font-semibold leading-6 text-slate-900">{log.action}</AdminTableCell>
                  <AdminTableCell className="text-sm leading-6 text-slate-700">
                    <div className="max-w-[420px]">{log.summary}</div>
                  </AdminTableCell>
                  <AdminTableCell className="font-mono text-sm leading-6 text-slate-600">{log.blockNumber.toString()}</AdminTableCell>
                  <AdminTableCell className="font-mono text-sm leading-6 text-slate-600">{shortAddress(log.transactionHash)}</AdminTableCell>
                </tr>
              ))
            )}
        </AdminTableBody>
      </AdminTable>
    </Card>
  );
}
