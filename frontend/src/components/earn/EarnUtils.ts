import type { Address } from 'viem';

import { getSwapTokenOptions } from '@/config/tokens';

export const ZERO_BIGINT = BigInt(0);
export const FARM_REFRESH_INTERVAL_MS = 8000;

export function shortAddress(address?: string) {
  if (!address) {
    return '--';
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function normalizeTokenSymbol(symbol: string, tokenAddress: string, wrappedNativeAddress?: string) {
  if (wrappedNativeAddress && tokenAddress.toLowerCase() === wrappedNativeAddress.toLowerCase()) {
    return 'ETH';
  }

  return symbol;
}

export function formatWeight(allocPoint: bigint, totalAllocPoint: bigint) {
  if (allocPoint <= ZERO_BIGINT || totalAllocPoint <= ZERO_BIGINT) {
    return '0%';
  }

  const basisPoints = Number((allocPoint * BigInt(1_000_000)) / totalAllocPoint) / 100;
  return `${basisPoints.toLocaleString('en-US', {
    minimumFractionDigits: basisPoints >= 100 ? 0 : 2,
    maximumFractionDigits: 2,
  })}%`;
}

export function getTokenFallback(address: Address, knownTokens: ReturnType<typeof getSwapTokenOptions>) {
  return knownTokens.find((token) => {
    const normalizedAddress = address.toLowerCase();
    return token.address?.toLowerCase() === normalizedAddress || token.routeAddress.toLowerCase() === normalizedAddress;
  });
}
