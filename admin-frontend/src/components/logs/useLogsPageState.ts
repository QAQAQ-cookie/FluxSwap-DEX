'use client';

import { useState } from 'react';

import type { LogRow } from '@/components/logs/LogsTypes';

export function useLogsPageState() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return {
    logs,
    setLogs,
    loading,
    setLoading,
    error,
    setError,
  };
}
