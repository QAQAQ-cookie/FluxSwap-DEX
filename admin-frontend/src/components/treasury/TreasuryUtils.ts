import type { Address, Hex } from 'viem';

import { formatBigIntAmountDown } from '@/lib/amounts';
import type { AdminTreasuryOperation } from '@/lib/admin-api';

import type { TreasuryOperationMetadata, TreasuryOperationRow, TreasuryTokenRow } from './TreasuryTypes';

export const ZERO_BIGINT = BigInt(0);
export const EVENT_LOOKBACK_BLOCKS = BigInt(20_000);

const TREASURY_OPERATION_STORAGE_PREFIX = 'fluxswap-admin:treasury-operations';

export function sameAddress(left?: string, right?: string) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

export function formatDuration(seconds: bigint) {
  if (seconds <= ZERO_BIGINT) {
    return '无延迟';
  }

  const minutes = Number(seconds / BigInt(60));
  const hours = Number(seconds / BigInt(3600));

  if (hours >= 24) {
    return `${Math.round(hours / 24)} 天`;
  }

  if (hours >= 1) {
    return `${hours} 小时`;
  }

  return `${minutes || 1} 分钟`;
}

export function formatUnixTime(seconds: bigint) {
  if (seconds <= ZERO_BIGINT) {
    return '--';
  }

  return new Date(Number(seconds) * 1000).toLocaleString('zh-CN', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatTokenAmount(value: bigint, token: TreasuryTokenRow, fractionDigits = 4) {
  return `${formatBigIntAmountDown(value, token.decimals, fractionDigits)} ${token.symbol}`;
}

export function getDailySpendRatio(token: TreasuryTokenRow) {
  if (token.dailySpendCap <= ZERO_BIGINT) {
    return undefined;
  }

  const ratio = Number((token.spentToday * BigInt(10_000)) / token.dailySpendCap) / 100;
  return Math.min(100, Math.max(0, ratio));
}

export function formatRatio(ratio?: number) {
  if (ratio === undefined) {
    return '--';
  }

  return `${ratio.toLocaleString('zh-CN', {
    minimumFractionDigits: ratio >= 10 ? 1 : 2,
    maximumFractionDigits: 2,
  })}%`;
}

function getSpendTone(ratio?: number): 'success' | 'warning' | 'danger' | 'neutral' {
  if (ratio === undefined) {
    return 'neutral';
  }

  if (ratio >= 90) {
    return 'danger';
  }

  if (ratio >= 75) {
    return 'warning';
  }

  return 'success';
}

export function getSpendBarClass(ratio?: number) {
  const tone = getSpendTone(ratio);

  if (tone === 'danger') {
    return 'bg-rose-500';
  }

  if (tone === 'warning') {
    return 'bg-amber-500';
  }

  if (tone === 'success') {
    return 'bg-emerald-500';
  }

  return 'bg-slate-300';
}

export function subtractFloor(value: bigint, used: bigint) {
  return value > used ? value - used : ZERO_BIGINT;
}

export function sortOperations(left: TreasuryOperationRow, right: TreasuryOperationRow) {
  if (left.status !== right.status) {
    return left.status === 'ready' ? -1 : 1;
  }

  if (left.executeAfter === right.executeAfter) {
    return left.blockNumber > right.blockNumber ? -1 : 1;
  }

  return left.executeAfter < right.executeAfter ? -1 : 1;
}

function getTreasuryOperationStorageKey(chainId: number, treasuryAddress: Address) {
  return `${TREASURY_OPERATION_STORAGE_PREFIX}:${chainId}:${treasuryAddress.toLowerCase()}`;
}

export function loadTreasuryOperationMetadata(chainId: number, treasuryAddress: Address) {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const rawValue = window.localStorage.getItem(getTreasuryOperationStorageKey(chainId, treasuryAddress));
    if (!rawValue) {
      return {};
    }

    const parsed = JSON.parse(rawValue) as Record<Hex, TreasuryOperationMetadata>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveTreasuryOperationMetadata(
  chainId: number,
  treasuryAddress: Address,
  metadataById: Record<Hex, TreasuryOperationMetadata>,
) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(getTreasuryOperationStorageKey(chainId, treasuryAddress), JSON.stringify(metadataById));
}

export function treasuryMetadataFromAdminOperation(operation: AdminTreasuryOperation): TreasuryOperationMetadata {
  return {
    version: 1,
    chainId: operation.chainId,
    treasuryAddress: operation.treasuryAddress,
    operationId: operation.operationId,
    kind: operation.operationTypeCode as TreasuryOperationMetadata['kind'],
    label: operation.operationTypeLabel,
    summary: operation.summary || operation.operationTypeLabel,
    params: operation.params as TreasuryOperationMetadata['params'],
    createdAt: new Date(operation.createdAt).getTime(),
  };
}

export function treasuryMetadataToAdminParams(metadata: TreasuryOperationMetadata): Record<string, unknown> {
  return { ...metadata.params };
}
