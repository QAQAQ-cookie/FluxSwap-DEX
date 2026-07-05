import type { Address } from 'viem';

import type { TokenMeta } from '@/components/farm/FarmTypes';
import { formatBigIntAmountDown } from '@/lib/amounts';

export const REFRESH_INTERVAL_MS = 8000;
export const ZERO_BIGINT = BigInt(0);
export const REWARD_PRECISION = BigInt(10) ** BigInt(18);
export const MIN_ALLOC_POINT = BigInt(1);
export const MAX_ALLOC_POINT = BigInt(1_000_000);
export const ALLOC_POINT_HINT = '建议 1 - 1,000,000；系统按所有启用池权重的相对比例分配奖励。';

export function shortAddress(address?: string) {
  if (!address) {
    return '--';
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function sameAddress(left?: string, right?: string) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

export function normalizeSymbol(symbol: string, tokenAddress: Address, wrappedNativeAddress?: Address) {
  if (wrappedNativeAddress && sameAddress(tokenAddress, wrappedNativeAddress)) {
    return 'ETH';
  }

  return symbol || 'TOKEN';
}

export function formatDateTime(value = new Date()) {
  return value.toLocaleString('zh-CN', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function parseAllocPoint(value: string): bigint | null {
  const normalized = value.trim().replace(/,/g, '');

  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const allocPoint = BigInt(normalized);

  if (allocPoint < MIN_ALLOC_POINT || allocPoint > MAX_ALLOC_POINT) {
    return null;
  }

  return allocPoint;
}

export function formatOptionalTokenAmount(value: bigint | undefined, token?: TokenMeta, fractionDigits = 4): string {
  if (value === undefined) {
    return '--';
  }

  return `${formatBigIntAmountDown(value, token?.decimals ?? 18, fractionDigits)} ${token?.symbol ?? ''}`.trim();
}
