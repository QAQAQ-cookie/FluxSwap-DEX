'use client';

import { useState } from 'react';

import type { OverviewData } from '@/components/overview/OverviewTypes';

export function useOverviewPageState() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  return {
    overview,
    setOverview,
    loading,
    setLoading,
    error,
    setError,
    lastUpdatedAt,
    setLastUpdatedAt,
  };
}
