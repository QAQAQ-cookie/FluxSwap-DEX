'use client';

import type { Log } from 'viem';

import type { LogRow } from '@/components/logs/LogsTypes';

export function compareLogsByBlockDesc(left: LogRow, right: LogRow) {
  if (left.blockNumber === BigInt(0) && right.blockNumber === BigInt(0)) {
    return Date.parse(right.createdAt ?? '') - Date.parse(left.createdAt ?? '');
  }

  if (left.blockNumber === right.blockNumber) {
    return right.transactionHash.localeCompare(left.transactionHash);
  }

  return left.blockNumber > right.blockNumber ? -1 : 1;
}

export function getLogId(log: Log) {
  return `${log.transactionHash ?? 'unknown'}-${log.logIndex ?? 0}`;
}
