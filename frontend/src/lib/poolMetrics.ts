import { formatUnits, type Address, zeroAddress } from 'viem';

import type { PoolViewModel } from '@/lib/subgraph/pools';

export const LP_SWAP_FEE_RATE_WITH_PROTOCOL = 0.0025;
export const LP_SWAP_FEE_RATE_WITHOUT_PROTOCOL = 0.003;

const DAY_SECONDS = 24 * 60 * 60;

export type PoolAprSwap = {
  amount0In: bigint;
  amount1In: bigint;
  amount0Out: bigint;
  amount1Out: bigint;
  timestamp: number;
};

export function getPoolLpFeeRate(treasuryAddress?: Address | null) {
  return treasuryAddress && treasuryAddress !== zeroAddress
    ? LP_SWAP_FEE_RATE_WITH_PROTOCOL
    : LP_SWAP_FEE_RATE_WITHOUT_PROTOCOL;
}

export function formatPoolApr(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return '--';
  }

  if (value < 0.01) {
    return '<0.01%';
  }

  return `${new Intl.NumberFormat('en-US', {
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value)}%`;
}

export function getPoolLiquidityValue(
  pool: Pick<PoolViewModel, 'reserve0' | 'reserve1' | 'token0' | 'token1'>,
  quoteTokenIndex: 0 | 1,
) {
  const reserve0 = Number(formatUnits(pool.reserve0, pool.token0.decimals));
  const reserve1 = Number(formatUnits(pool.reserve1, pool.token1.decimals));

  if (!Number.isFinite(reserve0) || !Number.isFinite(reserve1) || reserve0 <= 0 || reserve1 <= 0) {
    return null;
  }

  return quoteTokenIndex === 1 ? reserve1 * 2 : reserve0 * 2;
}

export function getPoolSwapInputVolumeValue(
  swap: PoolAprSwap,
  pool: Pick<PoolViewModel, 'reserve0' | 'reserve1' | 'token0' | 'token1'>,
  quoteTokenIndex: 0 | 1,
) {
  const reserve0 = Number(formatUnits(pool.reserve0, pool.token0.decimals));
  const reserve1 = Number(formatUnits(pool.reserve1, pool.token1.decimals));

  if (!Number.isFinite(reserve0) || !Number.isFinite(reserve1) || reserve0 <= 0 || reserve1 <= 0) {
    return 0;
  }

  const token0Input = Number(formatUnits(swap.amount0In, pool.token0.decimals));
  const token1Input = Number(formatUnits(swap.amount1In, pool.token1.decimals));

  if (!Number.isFinite(token0Input) || !Number.isFinite(token1Input)) {
    return 0;
  }

  if (quoteTokenIndex === 1) {
    return swap.amount0In > BigInt(0) ? token0Input * (reserve1 / reserve0) : token1Input;
  }

  return swap.amount1In > BigInt(0) ? token1Input * (reserve0 / reserve1) : token0Input;
}

export function calculatePoolApr({
  pool,
  swaps,
  quoteTokenIndex,
  lpFeeRate,
}: {
  pool: Pick<PoolViewModel, 'reserve0' | 'reserve1' | 'token0' | 'token1'>;
  swaps: readonly PoolAprSwap[];
  quoteTokenIndex: 0 | 1;
  lpFeeRate: number;
}) {
  const latestTimestamp = swaps[0]?.timestamp;
  if (latestTimestamp === undefined) {
    return null;
  }

  const liquidity = getPoolLiquidityValue(pool, quoteTokenIndex);
  if (liquidity === null || !Number.isFinite(liquidity) || liquidity <= 0) {
    return null;
  }

  const oneDayAgo = latestTimestamp - DAY_SECONDS;
  const volume24h = swaps.reduce((total, swap) => {
    if (swap.timestamp < oneDayAgo || swap.timestamp > latestTimestamp) {
      return total;
    }

    return total + getPoolSwapInputVolumeValue(swap, pool, quoteTokenIndex);
  }, 0);

  return (volume24h * lpFeeRate * 365 * 100) / liquidity;
}
