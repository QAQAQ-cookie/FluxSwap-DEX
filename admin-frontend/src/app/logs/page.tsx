'use client';

import { ScrollText } from 'lucide-react';

import { Card, SectionPlaceholder } from '@/components/AdminPrimitives';
import { LogsPageHeader } from '@/components/logs/LogsPageHeader';
import { LogsTable } from '@/components/logs/LogsTable';
import { useLogsPageController } from '@/components/logs/useLogsPageController';

export default function LogsPage() {
  const { pageState, loadLogs, environment } = useLogsPageController();

  return (
    <div className="space-y-8">
      <LogsPageHeader
        loading={pageState.loading}
        error={pageState.error}
        onRefresh={() => void loadLogs()}
      />
      {!environment.supportedChain ? (
        <Card className="overflow-hidden">
          <SectionPlaceholder
            icon={<ScrollText size={20} />}
            title="当前网络不支持操作记录"
            description="切换到已部署 FluxSwap 管理合约的网络后，再读取农场和金库的管理事件。"
            className="min-h-[320px]"
          />
        </Card>
      ) : (
        <LogsTable loading={pageState.loading} logs={pageState.logs} />
      )}
    </div>
  );
}
