'use client';

export type LogScope = 'farm' | 'treasury';

export type LogRow = {
  id: string;
  scope: LogScope;
  action: string;
  summary: string;
  blockNumber: bigint;
  transactionHash: string;
};
