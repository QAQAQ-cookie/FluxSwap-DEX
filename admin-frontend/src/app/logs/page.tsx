'use client';

import { AlertCircle, LoaderCircle, RefreshCw, ScrollText } from 'lucide-react';

import { Card, PageHeader, shortAddress, StatusPill } from '@/components/AdminPrimitives';
import { useLogsPageController } from '@/components/logs/useLogsPageController';

export default function LogsPage() {
  const { pageState, loadLogs } = useLogsPageController();

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <PageHeader
          eyebrow="日志"
          title="操作记录"
          description="读取最近的农场和金库管理事件，便于回溯配置变更。"
        />
        <button
          type="button"
          onClick={() => void loadLogs()}
          disabled={pageState.loading}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400"
        >
          {pageState.loading ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          刷新
        </button>
      </div>

      {pageState.error ? (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle size={18} />
          {pageState.error}
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 p-5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <ScrollText size={19} />
            </span>
            <div>
              <h2 className="font-semibold text-slate-950">最近操作</h2>
              <p className="text-sm text-slate-500">默认读取最近 20,000 个区块内最多 80 条事件。</p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-collapse text-left">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-5 py-3">模块</th>
                <th className="px-5 py-3">动作</th>
                <th className="px-5 py-3">内容</th>
                <th className="px-5 py-3">区块</th>
                <th className="px-5 py-3">交易</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {pageState.loading && pageState.logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-500">
                    <LoaderCircle size={18} className="mx-auto mb-2 animate-spin" />
                    正在加载操作记录
                  </td>
                </tr>
              ) : pageState.logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-500">
                    暂无操作记录
                  </td>
                </tr>
              ) : (
                pageState.logs.map((log) => (
                  <tr key={log.id} className="align-middle">
                    <td className="px-5 py-4">
                      <StatusPill tone={log.scope === 'farm' ? 'success' : 'warning'}>
                        {log.scope === 'farm' ? '农场' : '金库'}
                      </StatusPill>
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-slate-900">{log.action}</td>
                    <td className="px-5 py-4 text-sm text-slate-700">{log.summary}</td>
                    <td className="px-5 py-4 font-mono text-sm text-slate-600">{log.blockNumber.toString()}</td>
                    <td className="px-5 py-4 font-mono text-sm text-slate-600">{shortAddress(log.transactionHash)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
