'use client';

import { useState } from 'react';

import type {
  TokenFilterMode,
  TokenRow,
  TokenSortDirection,
  TokenSortField,
} from '@/components/tokens/TokensTypes';

export function useTokensPageState() {
  const [tokenRows, setTokenRows] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filterMode, setFilterMode] = useState<TokenFilterMode>('all');
  const [sortField, setSortField] = useState<TokenSortField>('symbol');
  const [sortDirection, setSortDirection] = useState<TokenSortDirection>('asc');

  return {
    tokenRows,
    setTokenRows,
    loading,
    setLoading,
    error,
    setError,
    query,
    setQuery,
    filterMode,
    setFilterMode,
    sortField,
    setSortField,
    sortDirection,
    setSortDirection,
  };
}
