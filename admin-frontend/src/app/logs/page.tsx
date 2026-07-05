'use client';

import { LogsPageHeader } from '@/components/logs/LogsPageHeader';
import { LogsTable } from '@/components/logs/LogsTable';
import { useLogsPageController } from '@/components/logs/useLogsPageController';

export default function LogsPage() {
  const { pageState, loadLogs } = useLogsPageController();

  return (
    <div className="space-y-8">
      <LogsPageHeader
        loading={pageState.loading}
        error={pageState.error}
        onRefresh={() => void loadLogs()}
      />
      <LogsTable loading={pageState.loading} logs={pageState.logs} />
    </div>
  );
}
