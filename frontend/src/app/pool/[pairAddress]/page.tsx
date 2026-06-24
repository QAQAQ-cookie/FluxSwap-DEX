'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import {
  ArrowDownUp,
  BarChart3,
  ChevronRight,
  Clock3,
  Droplets,
  Maximize,
  Repeat2,
  TrendingDown,
  TrendingUp,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatUnits, type Address, isAddress, zeroAddress } from 'viem';
import { useChainId } from 'wagmi';

import { getContractAddress, isFluxSupportedChain } from '@/config/contracts';
import { formatBigIntAmount, formatBigIntAmountDown, formatPairLpAmountDown } from '@/lib/amounts';
import { useReadFluxSwapFactoryTreasury } from '@/lib/contracts';
import { calculatePoolApr, formatPoolApr, getPoolLpFeeRate } from '@/lib/poolMetrics';
import {
  getPoolDetail,
  type PoolActivityViewModel,
  type PoolDetailViewModel,
} from '@/lib/subgraph/pools';
import { formatTimestamp, truncateAddress } from '@/lib/wallet';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

type AnalyticsTab = 'price' | 'volume' | 'liquidity' | 'depth';
type AnalyticsRange = '1h' | '1d' | '1w' | '1m' | '1y' | 'all';

type PoolActivityRow = {
  id: string;
  tone: Exclude<PoolActivityViewModel['type'], 'sync'>;
  title: string;
  detailLabel: string;
  walletLabel: string;
  timeLabel: string;
  txHash: string;
  txHref?: string;
};

type ReserveSnapshot = {
  timestamp: number;
  blockNumber: bigint;
  logIndex: bigint;
  reserve0: bigint;
  reserve1: bigint;
};

type AnalyticsPoint = {
  label: string;
  timestamp: number;
  price: number | null;
  volume: number;
  liquidity: number | null;
};

type DepthPoint = {
  price: number;
  depth: number;
  quoteDepth: number;
  priceImpact: number;
};

type DepthSeries = {
  currentPrice: number | null;
  bids: DepthPoint[];
  asks: DepthPoint[];
};

type AnalyticsSummary = {
  headline: string;
  secondary?: string;
  changePct?: number;
  footnote?: string;
};

type ChartTooltipParam = {
  axisValueLabel?: string;
  dataIndex?: number;
};

const ANALYTICS_RANGE_CONFIG: Record<
  Exclude<AnalyticsRange, 'all'>,
  {
    label: string;
    bucketSeconds: number;
    windowSeconds: number;
  }
> = {
  '1h': {
    label: '1小时',
    bucketSeconds: 5 * 60,
    windowSeconds: 60 * 60,
  },
  '1d': {
    label: '1天',
    bucketSeconds: 60 * 60,
    windowSeconds: 24 * 60 * 60,
  },
  '1w': {
    label: '1周',
    bucketSeconds: 24 * 60 * 60,
    windowSeconds: 7 * 24 * 60 * 60,
  },
  '1m': {
    label: '1个月',
    bucketSeconds: 24 * 60 * 60,
    windowSeconds: 30 * 24 * 60 * 60,
  },
  '1y': {
    label: '1年',
    bucketSeconds: 7 * 24 * 60 * 60,
    windowSeconds: 365 * 24 * 60 * 60,
  },
};

const MAX_POOL_ANALYTICS_EVENTS = 500;

function normalizeTokenSymbol(symbol: string, tokenAddress: string, wrappedNativeAddress?: string) {
  if (wrappedNativeAddress && tokenAddress.toLowerCase() === wrappedNativeAddress.toLowerCase()) {
    return 'ETH';
  }

  return symbol.toUpperCase();
}

function getTransactionHref(chainId: number | undefined, txHash: string): string | undefined {
  if (!txHash) {
    return undefined;
  }

  if (chainId === 11155111) {
    return `https://sepolia.etherscan.io/tx/${txHash}`;
  }

  return undefined;
}

function getActivityToneClass(tone: PoolActivityRow['tone']) {
  if (tone === 'swap') {
    return 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300';
  }

  if (tone === 'add') {
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300';
  }

  return 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300';
}

function TokenPairBadge({
  token0Symbol,
  token1Symbol,
}: {
  token0Symbol: string;
  token1Symbol: string;
}) {
  return (
    <div className="flex items-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-400 text-sm font-black text-white shadow-lg shadow-sky-500/20">
        {token0Symbol.slice(0, 3)}
      </div>
      <div className="-ml-3 flex h-12 w-12 items-center justify-center rounded-2xl border-4 border-white bg-gradient-to-br from-emerald-500 to-lime-400 text-sm font-black text-white shadow-lg shadow-emerald-500/20 dark:border-[#09101c]">
        {token1Symbol.slice(0, 3)}
      </div>
    </div>
  );
}

function EmptyNotice({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Droplets;
  title: string;
  description?: string;
}) {
  return (
    <div className="rounded-[1.8rem] border border-dashed border-black/10 bg-white/45 px-6 py-12 text-center backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.03]">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300">
        <Icon size={24} />
      </div>
      <div className="mt-4 text-lg font-black tracking-tight text-gray-900 dark:text-white">
        {title}
      </div>
      {description ? <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">{description}</div> : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Droplets;
}) {
  return (
    <div className="rounded-[1.35rem] border border-black/5 bg-gray-50/80 p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
        <Icon size={14} />
        <span>{label}</span>
      </div>
      <div className="mt-3 text-lg font-black tracking-tight text-gray-900 dark:text-white">
        {value}
      </div>
      {hint ? <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">{hint}</div> : null}
    </div>
  );
}

function buildActivityRow(
  activity: Exclude<PoolActivityViewModel, { type: 'sync' }>,
  pair: PoolDetailViewModel,
  chainId: number | undefined,
  wrappedNativeAddress?: string,
  isZh?: boolean,
): PoolActivityRow {
  const token0Symbol = normalizeTokenSymbol(
    pair.token0.symbol,
    pair.token0.id,
    wrappedNativeAddress,
  );
  const token1Symbol = normalizeTokenSymbol(
    pair.token1.symbol,
    pair.token1.id,
    wrappedNativeAddress,
  );
  const timeLabel = formatTimestamp(activity.timestamp, isZh ? 'zh-CN' : 'en-US');
  const txHash = activity.txHash;
  const txHref = getTransactionHref(chainId, txHash);
  const walletLabel = truncateAddress(activity.sender);

  if (activity.type === 'swap') {
    const zero = BigInt(0);
    const soldToken =
      activity.amount0In > zero
        ? {
            symbol: token0Symbol,
            amount: activity.amount0In,
            decimals: pair.token0.decimals,
          }
        : {
            symbol: token1Symbol,
            amount: activity.amount1In,
            decimals: pair.token1.decimals,
          };

    const boughtToken =
      activity.amount0Out > zero
        ? {
            symbol: token0Symbol,
            amount: activity.amount0Out,
            decimals: pair.token0.decimals,
          }
        : {
            symbol: token1Symbol,
            amount: activity.amount1Out,
            decimals: pair.token1.decimals,
          };

    return {
      id: activity.id,
      tone: activity.type,
      title: isZh ? '交易' : 'Swap',
      detailLabel: `${formatBigIntAmountDown(soldToken.amount, soldToken.decimals, 6)} ${soldToken.symbol} -> ${formatBigIntAmountDown(boughtToken.amount, boughtToken.decimals, 6)} ${boughtToken.symbol}`,
      walletLabel,
      timeLabel,
      txHash,
      txHref,
    };
  }

  if (activity.type === 'add') {
    return {
      id: activity.id,
      tone: activity.type,
      title: isZh ? '添加流动性' : 'Add liquidity',
      detailLabel: `${formatBigIntAmountDown(activity.amount0, pair.token0.decimals, 6)} ${token0Symbol} + ${formatBigIntAmountDown(activity.amount1, pair.token1.decimals, 6)} ${token1Symbol}`,
      walletLabel,
      timeLabel,
      txHash,
      txHref,
    };
  }

  return {
    id: activity.id,
    tone: activity.type,
    title: isZh ? '移除流动性' : 'Remove liquidity',
    detailLabel: `${formatBigIntAmountDown(activity.amount0, pair.token0.decimals, 6)} ${token0Symbol} + ${formatBigIntAmountDown(activity.amount1, pair.token1.decimals, 6)} ${token1Symbol}`,
    walletLabel,
    timeLabel,
    txHash,
    txHref,
  };
}

function formatPoolPrice(
  baseReserve: bigint,
  baseDecimals: number,
  quoteReserve: bigint,
  quoteDecimals: number,
  fractionDigits = 6,
): string {
  if (baseReserve === BigInt(0) || quoteReserve === BigInt(0)) {
    return '--';
  }

  const numerator = quoteReserve * BigInt(10) ** BigInt(baseDecimals) * BigInt(10) ** BigInt(18);
  const denominator = baseReserve * BigInt(10) ** BigInt(quoteDecimals);
  if (denominator === BigInt(0)) {
    return '--';
  }

  return formatBigIntAmountDown(numerator / denominator, 18, fractionDigits);
}

function formatChartLabel(timestamp: number, range: AnalyticsRange, locale: string) {
  const date = new Date(timestamp * 1000);

  if (range === '1h') {
    return new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  if (range === '1d') {
    return new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  if (range === '1y') {
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      year: '2-digit',
    }).format(date);
  }

  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function formatVolumeHoverTime(timestamp: number, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp * 1000));
}

function getVolumeRangeLabel(range: AnalyticsRange, isZh: boolean) {
  if (range === '1h') {
    return isZh ? '过去一小时总成交量' : 'Total volume over the past hour';
  }

  if (range === '1d') {
    return isZh ? '过去一天总成交量' : 'Total volume over the past day';
  }

  if (range === '1w') {
    return isZh ? '过去一周总成交量' : 'Total volume over the past week';
  }

  if (range === '1m') {
    return isZh ? '过去一个月总成交量' : 'Total volume over the past month';
  }

  if (range === '1y') {
    return isZh ? '过去一年总成交量' : 'Total volume over the past year';
  }

  return isZh ? '全部时间总成交量' : 'Total volume over all time';
}

function buildReserveSnapshots(
  poolDetail: PoolDetailViewModel,
  activities: PoolActivityViewModel[],
): ReserveSnapshot[] {
  const syncSnapshots = activities
    .filter((activity) => activity.type === 'sync')
    .map((activity) => ({
      timestamp: activity.timestamp,
      blockNumber: activity.blockNumber,
      logIndex: activity.logIndex,
      reserve0: activity.reserve0,
      reserve1: activity.reserve1,
    }));

  if (syncSnapshots.length > 0) {
    return syncSnapshots.sort(sortReserveSnapshots);
  }

  const eventActivities = activities.filter((activity) => activity.type !== 'sync');
  const sorted = [...eventActivities].sort((left, right) => {
    if (left.timestamp !== right.timestamp) {
      return left.timestamp - right.timestamp;
    }

    if (left.blockNumber !== right.blockNumber) {
      return left.blockNumber < right.blockNumber ? -1 : 1;
    }

    if (left.logIndex !== right.logIndex) {
      return left.logIndex < right.logIndex ? -1 : 1;
    }

    return left.id.localeCompare(right.id);
  });

  let reserve0 = poolDetail.reserve0;
  let reserve1 = poolDetail.reserve1;
  const snapshots: ReserveSnapshot[] = [];

  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const activity = sorted[index];
    snapshots.push({
      timestamp: activity.timestamp,
      blockNumber: activity.blockNumber,
      logIndex: activity.logIndex,
      reserve0,
      reserve1,
    });

    if (activity.type === 'add') {
      reserve0 -= activity.amount0;
      reserve1 -= activity.amount1;
      continue;
    }

    if (activity.type === 'remove') {
      reserve0 += activity.amount0;
      reserve1 += activity.amount1;
      continue;
    }

    reserve0 = reserve0 - activity.amount0In + activity.amount0Out;
    reserve1 = reserve1 - activity.amount1In + activity.amount1Out;
  }

  snapshots.push({
    timestamp: poolDetail.createdAtTimestamp,
    blockNumber: BigInt(0),
    logIndex: BigInt(0),
    reserve0,
    reserve1,
  });

  return snapshots.sort(sortReserveSnapshots);
}

function sortReserveSnapshots(left: ReserveSnapshot, right: ReserveSnapshot) {
  if (left.timestamp !== right.timestamp) {
    return left.timestamp - right.timestamp;
  }

  if (left.blockNumber !== right.blockNumber) {
    return left.blockNumber < right.blockNumber ? -1 : 1;
  }

  if (left.logIndex !== right.logIndex) {
    return left.logIndex < right.logIndex ? -1 : 1;
  }

  return 0;
}

function getRangeWindow(
  range: AnalyticsRange,
  anchorTimestamp: number,
  poolCreatedAt: number,
) {
  if (range === 'all') {
    return {
      start: poolCreatedAt,
      end: anchorTimestamp,
      bucketSeconds: Math.max(24 * 60 * 60, Math.floor((anchorTimestamp - poolCreatedAt) / 12) || 24 * 60 * 60),
    };
  }

  const config = ANALYTICS_RANGE_CONFIG[range];
  return {
    start: Math.max(poolCreatedAt, anchorTimestamp - config.windowSeconds),
    end: anchorTimestamp,
    bucketSeconds: config.bucketSeconds,
  };
}

function bucketTimestamp(timestamp: number, bucketSeconds: number) {
  return Math.floor(timestamp / bucketSeconds) * bucketSeconds;
}

function calculatePriceValue(
  reserve0: bigint,
  reserve1: bigint,
  token0Decimals: number,
  token1Decimals: number,
  quoteTokenIndex: 0 | 1,
) {
  const price =
    quoteTokenIndex === 1
      ? formatPoolPrice(reserve0, token0Decimals, reserve1, token1Decimals, 8)
      : formatPoolPrice(reserve1, token1Decimals, reserve0, token0Decimals, 8);

  if (price === '--') {
    return null;
  }

  const numeric = Number(price);
  return Number.isFinite(numeric) ? numeric : null;
}

function getSwapVolumeValue(
  activity: PoolActivityViewModel,
  token0Decimals: number,
  token1Decimals: number,
  quoteTokenIndex: 0 | 1,
) {
  if (activity.type !== 'swap') {
    return 0;
  }

  const amount =
    quoteTokenIndex === 1
      ? activity.amount1In > BigInt(0)
        ? activity.amount1In
        : activity.amount1Out
      : activity.amount0In > BigInt(0)
        ? activity.amount0In
        : activity.amount0Out;

  const decimals = quoteTokenIndex === 1 ? token1Decimals : token0Decimals;
  const numeric = Number(formatUnits(amount, decimals));
  return Number.isFinite(numeric) ? numeric : 0;
}

function getLiquidityValue(
  reserve0: bigint,
  reserve1: bigint,
  token0Decimals: number,
  token1Decimals: number,
  quoteTokenIndex: 0 | 1,
) {
  const price = calculatePriceValue(reserve0, reserve1, token0Decimals, token1Decimals, quoteTokenIndex);
  const baseReserve = quoteTokenIndex === 1 ? reserve0 : reserve1;
  const baseDecimals = quoteTokenIndex === 1 ? token0Decimals : token1Decimals;
  const baseValue = Number(formatUnits(baseReserve, baseDecimals));

  if (!Number.isFinite(baseValue)) {
    return null;
  }

  if (price === null) {
    return baseValue;
  }

  return baseValue * price * 2;
}

function buildAnalyticsSeries(
  poolDetail: PoolDetailViewModel,
  activities: PoolActivityViewModel[],
  range: AnalyticsRange,
  locale: string,
  quoteTokenIndex: 0 | 1,
) {
  const snapshots = buildReserveSnapshots(poolDetail, activities);
  const latestTimestamp = activities[0]?.timestamp ?? poolDetail.createdAtTimestamp;
  const { start, end, bucketSeconds } = getRangeWindow(range, latestTimestamp, poolDetail.createdAtTimestamp);
  const bucketMap = new Map<number, AnalyticsPoint>();

  const startBucket = bucketTimestamp(start, bucketSeconds);
  const endBucket = bucketTimestamp(end, bucketSeconds);

  for (let timestamp = startBucket; timestamp <= endBucket; timestamp += bucketSeconds) {
    bucketMap.set(timestamp, {
      timestamp,
      label: formatChartLabel(timestamp, range, locale),
      price: null,
      volume: 0,
      liquidity: null,
    });
  }

  for (const snapshot of snapshots) {
    if (snapshot.timestamp < start) {
      continue;
    }

    const point = bucketMap.get(bucketTimestamp(snapshot.timestamp, bucketSeconds));
    if (!point) {
      continue;
    }

    point.price = calculatePriceValue(
      snapshot.reserve0,
      snapshot.reserve1,
      poolDetail.token0.decimals,
      poolDetail.token1.decimals,
      quoteTokenIndex,
    );
    point.liquidity = getLiquidityValue(
      snapshot.reserve0,
      snapshot.reserve1,
      poolDetail.token0.decimals,
      poolDetail.token1.decimals,
      quoteTokenIndex,
    );
  }

  for (const activity of activities) {
    if (activity.timestamp < start || activity.timestamp > end) {
      continue;
    }

    const point = bucketMap.get(bucketTimestamp(activity.timestamp, bucketSeconds));
    if (!point) {
      continue;
    }

    point.volume += getSwapVolumeValue(
      activity,
      poolDetail.token0.decimals,
      poolDetail.token1.decimals,
      quoteTokenIndex,
    );
  }

  const points = Array.from(bucketMap.values()).sort((left, right) => left.timestamp - right.timestamp);
  let lastPrice: number | null = null;
  let lastLiquidity: number | null = null;

  for (const point of points) {
    if (point.price === null) {
      point.price = lastPrice;
    } else {
      lastPrice = point.price;
    }

    if (point.liquidity === null) {
      point.liquidity = lastLiquidity;
    } else {
      lastLiquidity = point.liquidity;
    }
  }

  return points;
}

function formatMetricValue(value: number | null, digits = 2) {
  if (value === null || !Number.isFinite(value)) {
    return '--';
  }

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatDepthTokenAmount(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return '--';
  }

  const absValue = Math.abs(value);
  const maximumFractionDigits = absValue >= 1 ? 2 : 6;

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits,
  }).format(value);
}

function findDepthPointByImpact(points: DepthPoint[], absoluteImpact: number) {
  return points.reduce<DepthPoint | null>((closest, point) => {
    if (!closest) {
      return point;
    }

    return Math.abs(Math.abs(point.priceImpact) - absoluteImpact) <
      Math.abs(Math.abs(closest.priceImpact) - absoluteImpact)
      ? point
      : closest;
  }, null);
}

function getPriceFractionDigits(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return 2;
  }

  const absValue = Math.abs(value);
  if (absValue >= 1) {
    return 2;
  }

  if (absValue >= 0.01) {
    return 4;
  }

  if (absValue >= 0.0001) {
    return 6;
  }

  return 8;
}

function formatPriceMetric(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return '--';
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: getPriceFractionDigits(value),
  }).format(value);
}

function formatCompactMetric(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return '--';
  }

  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatChangePercent(changePct: number | null) {
  if (changePct === null || !Number.isFinite(changePct)) {
    return undefined;
  }

  return changePct;
}

function getChangePct(current: number | null, previous: number | null) {
  if (
    current === null ||
    previous === null ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous) ||
    previous === 0
  ) {
    return null;
  }

  return ((current - previous) / previous) * 100;
}

function buildDepthSeries(
  poolDetail: PoolDetailViewModel,
  quoteTokenIndex: 0 | 1,
): DepthSeries {
  const baseReserve = quoteTokenIndex === 1 ? poolDetail.reserve0 : poolDetail.reserve1;
  const baseDecimals = quoteTokenIndex === 1 ? poolDetail.token0.decimals : poolDetail.token1.decimals;
  const quoteReserve = quoteTokenIndex === 1 ? poolDetail.reserve1 : poolDetail.reserve0;
  const quoteDecimals = quoteTokenIndex === 1 ? poolDetail.token1.decimals : poolDetail.token0.decimals;
  const baseSize = Number(formatUnits(baseReserve, baseDecimals));
  const quoteSize = Number(formatUnits(quoteReserve, quoteDecimals));

  if (
    !Number.isFinite(baseSize) ||
    !Number.isFinite(quoteSize) ||
    baseSize <= 0 ||
    quoteSize <= 0
  ) {
    return { currentPrice: null, bids: [], asks: [] };
  }

  const currentPrice = quoteSize / baseSize;
  const invariant = baseSize * quoteSize;
  const impactSteps = [
    0.4,
    0.34,
    0.28,
    0.23,
    0.18,
    0.14,
    0.1,
    0.07,
    0.045,
    0.025,
    0.0125,
    0,
  ];

  const bids = impactSteps.map((impact) => {
    const price = currentPrice * (1 - impact);
    const nextBaseReserve = Math.sqrt(invariant / price);
    const nextQuoteReserve = Math.sqrt(invariant * price);

    return {
      price,
      depth: Math.max(nextBaseReserve - baseSize, 0),
      quoteDepth: Math.max(quoteSize - nextQuoteReserve, 0),
      priceImpact: -impact * 100,
    };
  });
  const asks = [...impactSteps].reverse().map((impact) => {
    const price = currentPrice * (1 + impact);
    const nextBaseReserve = Math.sqrt(invariant / price);
    const nextQuoteReserve = Math.sqrt(invariant * price);

    return {
      price,
      depth: Math.max(baseSize - nextBaseReserve, 0),
      quoteDepth: Math.max(nextQuoteReserve - quoteSize, 0),
      priceImpact: impact * 100,
    };
  });

  return {
    currentPrice,
    bids,
    asks,
  };
}

export default function PoolDetailPage() {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const chainId = useChainId();
  const params = useParams<{ pairAddress?: string | string[] }>();
  const supportedChain = isFluxSupportedChain(chainId);
  const factoryAddress = getContractAddress('FluxSwapFactory', chainId);
  const wrappedNativeAddress = getContractAddress('MockWETH', chainId);

  const rawPairAddress = params?.pairAddress;
  const pairAddress = Array.isArray(rawPairAddress) ? rawPairAddress[0] : rawPairAddress;

  const [poolDetail, setPoolDetail] = useState<PoolDetailViewModel | null>(null);
  const [activities, setActivities] = useState<PoolActivityViewModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTab>('price');
  const [analyticsRange, setAnalyticsRange] = useState<AnalyticsRange>('1d');
  const [hoveredVolumePoint, setHoveredVolumePoint] = useState<AnalyticsPoint | null>(null);
  const [hoveredDepthImpact, setHoveredDepthImpact] = useState<number | null>(null);
  const [depthZoom, setDepthZoom] = useState(1);
  const [isPairReversed, setIsPairReversed] = useState(false);

  const { data: treasuryAddress } = useReadFluxSwapFactoryTreasury({
    address: factoryAddress ?? zeroAddress,
    query: {
      enabled: supportedChain && !!factoryAddress,
    },
  });

  useEffect(() => {
    if (!supportedChain) {
      setPoolDetail(null);
      setActivities([]);
      setLoading(false);
      setFetchError(null);
      return;
    }

    if (!pairAddress || !isAddress(pairAddress)) {
      setPoolDetail(null);
      setActivities([]);
      setLoading(false);
      setFetchError(isZh ? '资金池地址无效' : 'Invalid pool address');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setFetchError(null);

    (async () => {
      try {
        const detail = await getPoolDetail(pairAddress as Address, MAX_POOL_ANALYTICS_EVENTS);
        if (!cancelled) {
          setPoolDetail(detail.pool ?? null);
          setActivities(detail.activities);
        }
      } catch (error) {
        if (!cancelled) {
          setPoolDetail(null);
          setActivities([]);
          setFetchError(error instanceof Error ? error.message : 'Failed to load pool detail');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isZh, pairAddress, supportedChain]);

  const locale = isZh ? 'zh-CN' : 'en-US';

  const token0Symbol = poolDetail
    ? normalizeTokenSymbol(poolDetail.token0.symbol, poolDetail.token0.id, wrappedNativeAddress)
    : '--';
  const token1Symbol = poolDetail
    ? normalizeTokenSymbol(poolDetail.token1.symbol, poolDetail.token1.id, wrappedNativeAddress)
    : '--';
  const displayTokenASymbol = isPairReversed ? token1Symbol : token0Symbol;
  const displayTokenBSymbol = isPairReversed ? token0Symbol : token1Symbol;
  const poolLabel = `${displayTokenASymbol} / ${displayTokenBSymbol}`;
  const quoteTokenIndex: 0 | 1 = isPairReversed ? 0 : 1;
  const baseTokenSymbol = quoteTokenIndex === 1 ? token0Symbol : token1Symbol;
  const quoteTokenSymbol = quoteTokenIndex === 1 ? token1Symbol : token0Symbol;
  const analyticsPoints = useMemo(() => {
    if (!poolDetail) {
      return [];
    }

    return buildAnalyticsSeries(poolDetail, activities, analyticsRange, locale, quoteTokenIndex);
  }, [activities, analyticsRange, locale, poolDetail, quoteTokenIndex]);
  const latestAnalyticsPoint = analyticsPoints[analyticsPoints.length - 1];
  const previousAnalyticsPoint = analyticsPoints.length > 1 ? analyticsPoints[analyticsPoints.length - 2] : undefined;
  const totalVolumeInRange = useMemo(
    () => analyticsPoints.reduce((total, point) => total + point.volume, 0),
    [analyticsPoints],
  );
  const displayedVolumePoint = analyticsTab === 'volume' ? hoveredVolumePoint : null;
  const depthSeries = useMemo<DepthSeries>(
    () =>
      poolDetail
        ? buildDepthSeries(poolDetail, quoteTokenIndex)
        : { currentPrice: null, bids: [], asks: [] },
    [poolDetail, quoteTokenIndex],
  );
  const hoveredDepthPoints = useMemo(() => {
    if (hoveredDepthImpact === null) {
      return {
        bid: null,
        ask: null,
      };
    }

    return {
      bid: findDepthPointByImpact(depthSeries.bids, hoveredDepthImpact),
      ask: findDepthPointByImpact(depthSeries.asks, hoveredDepthImpact),
    };
  }, [depthSeries.asks, depthSeries.bids, hoveredDepthImpact]);
  useEffect(() => {
    setHoveredVolumePoint(null);
    setHoveredDepthImpact(null);
  }, [analyticsRange, analyticsTab, quoteTokenIndex]);
  useEffect(() => {
    setDepthZoom(1);
  }, [pairAddress, quoteTokenIndex]);
  useEffect(() => {
    if (analyticsTab !== 'volume' && analyticsRange === '1h') {
      setAnalyticsRange('1d');
    }
  }, [analyticsRange, analyticsTab]);
  const analyticsSummary = useMemo<AnalyticsSummary>(() => {
    if (!poolDetail || !latestAnalyticsPoint) {
      return {
        headline: '--',
      };
    }

    if (analyticsTab === 'price') {
      const price = latestAnalyticsPoint.price;
      return {
        headline:
          price === null
            ? '--'
            : `1 ${baseTokenSymbol} = ${formatPriceMetric(price)} ${quoteTokenSymbol}`,
        changePct: formatChangePercent(getChangePct(price, previousAnalyticsPoint?.price ?? null)),
      };
    }

    if (analyticsTab === 'volume') {
      const volumeValue = displayedVolumePoint ? displayedVolumePoint.volume : totalVolumeInRange;

      return {
        headline: `${quoteTokenSymbol} ${formatCompactMetric(volumeValue)}`,
        footnote: displayedVolumePoint
          ? formatVolumeHoverTime(displayedVolumePoint.timestamp, locale)
          : getVolumeRangeLabel(analyticsRange, isZh),
      };
    }

    if (analyticsTab === 'liquidity') {
      return {
        headline: `${quoteTokenSymbol} ${formatCompactMetric(latestAnalyticsPoint.liquidity)}`,
        footnote: isZh ? '按当前储备推算的双边流动性规模' : 'Estimated two-sided liquidity from current reserves',
        changePct: formatChangePercent(getChangePct(latestAnalyticsPoint.liquidity, previousAnalyticsPoint?.liquidity ?? null)),
      };
    }

    return {
      headline:
        depthSeries.currentPrice === null
          ? '--'
          : `1 ${baseTokenSymbol} = ${formatPriceMetric(depthSeries.currentPrice)} ${quoteTokenSymbol}`,
      footnote: isZh ? '基于当前池子储备模拟的 AMM 可成交深度' : 'AMM depth simulated from current pool reserves',
    };
  }, [
    analyticsTab,
    analyticsRange,
    baseTokenSymbol,
    depthSeries.currentPrice,
    displayedVolumePoint,
    isZh,
    latestAnalyticsPoint,
    locale,
    poolDetail,
    previousAnalyticsPoint,
    quoteTokenSymbol,
    totalVolumeInRange,
  ]);
  const lpFeeRate = getPoolLpFeeRate(treasuryAddress);
  const poolAprLabel = useMemo(() => {
    if (!poolDetail) {
      return '--';
    }

    return formatPoolApr(calculatePoolApr({
      pool: poolDetail,
      swaps: activities.filter((activity) => activity.type === 'swap'),
      quoteTokenIndex,
      lpFeeRate,
    }));
  }, [activities, lpFeeRate, poolDetail, quoteTokenIndex]);
  const chartEvents = useMemo(
    () => {
      const updateHoveredDepth = (hoveredPrice: number | undefined) => {
        if (
          analyticsTab !== 'depth' ||
          depthSeries.currentPrice === null ||
          !hoveredPrice ||
          !Number.isFinite(hoveredPrice)
        ) {
          return;
        }

        setHoveredDepthImpact(Math.abs((hoveredPrice - depthSeries.currentPrice) / depthSeries.currentPrice) * 100);
      };

      return {
      mouseover: (event: { dataIndex?: number; value?: unknown }) => {
        if (analyticsTab === 'volume' && typeof event.dataIndex === 'number') {
          setHoveredVolumePoint(analyticsPoints[event.dataIndex] ?? null);
          return;
        }

        const value = event.value;
        const hoveredPrice =
          Array.isArray(value) && typeof value[0] === 'number'
            ? value[0]
            : undefined;
        updateHoveredDepth(hoveredPrice);
      },
      updateAxisPointer: (event: { axesInfo?: Array<{ value?: number | string }> }) => {
        const axisValue = event.axesInfo?.[0]?.value;
        const hoveredPrice =
          typeof axisValue === 'number'
            ? axisValue
            : typeof axisValue === 'string'
              ? Number(axisValue)
              : undefined;
        updateHoveredDepth(hoveredPrice);
      },
      globalout: () => {
        setHoveredVolumePoint(null);
        setHoveredDepthImpact(null);
      },
    };
    },
    [analyticsPoints, analyticsTab, depthSeries.currentPrice],
  );
  const zoomOutDepth = () => {
    setDepthZoom((current) => Math.max(0.5, current / 1.25));
  };
  const resetDepthZoom = () => {
    setDepthZoom(1);
  };
  const zoomInDepth = () => {
    setDepthZoom((current) => Math.min(4, current * 1.25));
  };

  const summaryCards = useMemo(() => {
    if (!poolDetail) {
      return [];
    }

    return [
      {
        label: isZh ? '协议' : 'Protocol',
        value: 'V2',
        icon: Droplets,
      },
      {
        label: isZh ? '资金池年利率' : 'Pool APR',
        value: poolAprLabel,
        icon: TrendingUp,
      },
      {
        label: isZh ? '总 LP' : 'Total LP',
        value: formatPairLpAmountDown(
          poolDetail.totalSupply,
          poolDetail.token0.decimals,
          poolDetail.token1.decimals,
          6,
        ),
        icon: ArrowDownUp,
      },
      {
        label: isZh ? '交易次数' : 'Tx count',
        value: formatBigIntAmount(poolDetail.txCount, 0, 0),
        icon: BarChart3,
      },
      {
        label: isZh ? '添加 / 移除' : 'Mint / Burn',
        value: `${formatBigIntAmount(poolDetail.mintCount, 0, 0)} / ${formatBigIntAmount(
          poolDetail.burnCount,
          0,
          0,
        )}`,
        icon: TrendingDown,
      },
      {
        label: isZh ? '创建时间' : 'Created',
        value: formatTimestamp(poolDetail.createdAtTimestamp, locale),
        icon: Clock3,
      },
    ];
  }, [isZh, locale, poolAprLabel, poolDetail]);

  const activityRows = useMemo(() => {
    if (!poolDetail) {
      return [];
    }

    return activities.filter((activity) => activity.type !== 'sync').slice(0, 30).map((activity) =>
      buildActivityRow(activity, poolDetail, chainId, wrappedNativeAddress, isZh),
    );
  }, [activities, chainId, isZh, poolDetail, wrappedNativeAddress]);

  const currentPrice0To1 = poolDetail
    ? formatPoolPrice(
        poolDetail.reserve0,
        poolDetail.token0.decimals,
        poolDetail.reserve1,
        poolDetail.token1.decimals,
        6,
      )
    : '--';
  const currentPrice1To0 = poolDetail
    ? formatPoolPrice(
        poolDetail.reserve1,
        poolDetail.token1.decimals,
        poolDetail.reserve0,
        poolDetail.token0.decimals,
        6,
      )
    : '--';
  const displayPrimaryPrice = isPairReversed ? currentPrice1To0 : currentPrice0To1;
  const displaySecondaryPrice = isPairReversed ? currentPrice0To1 : currentPrice1To0;
  const addLiquidityHref = poolDetail
    ? `/portfolio/liquidity?tokenA=${poolDetail.token0.id}&tokenB=${poolDetail.token1.id}`
    : '/portfolio/liquidity';
  const breadcrumbLabel = poolDetail
    ? poolLabel
    : isZh
      ? '资金池详情'
      : 'Pool Detail';
  const analyticsTabs = useMemo(
    () => [
      { key: 'price' as const, label: isZh ? '价格' : 'Price' },
      { key: 'volume' as const, label: isZh ? '交易量' : 'Volume' },
      { key: 'liquidity' as const, label: isZh ? '流动性' : 'Liquidity' },
      { key: 'depth' as const, label: isZh ? '深度' : 'Depth' },
    ],
    [isZh],
  );
  const analyticsRangeOptions = useMemo(
    () => [
      ...(analyticsTab === 'volume'
        ? [{ key: '1h' as const, label: isZh ? '1小时' : '1H' }]
        : []),
      { key: '1d' as const, label: isZh ? '1天' : '1D' },
      { key: '1w' as const, label: isZh ? '1周' : '1W' },
      { key: '1m' as const, label: isZh ? '1个月' : '1M' },
      { key: '1y' as const, label: isZh ? '1年' : '1Y' },
      { key: 'all' as const, label: isZh ? '全部' : 'All' },
    ],
    [analyticsTab, isZh],
  );
  const analyticsChartEmpty =
    analyticsTab === 'depth' ? depthSeries.bids.length === 0 && depthSeries.asks.length === 0 : analyticsPoints.every((point) => {
      if (analyticsTab === 'price') {
        return point.price === null;
      }

      if (analyticsTab === 'volume') {
        return point.volume <= 0;
      }

      return point.liquidity === null;
    });
  const analyticsChartOption = useMemo<EChartsOption>(() => {
    const baseGrid = {
      left: 18,
      right: 78,
      top: analyticsTab === 'price' ? 18 : 24,
      bottom: 28,
      containLabel: true,
    } as const;

    if (analyticsTab === 'depth') {
      const currentDepthPrice = depthSeries.currentPrice;
      const depthRangeRatio = 0.4 / depthZoom;
      const formatDepthLabel = (point: DepthPoint, title: string) => [
        `{title|${title}} {impact|${point.priceImpact > 0 ? '+' : ''}${point.priceImpact.toFixed(1)}%}`,
        `{label|${isZh ? '价格' : 'Price'}} {value|${formatPriceMetric(point.price)} ${quoteTokenSymbol}}`,
        `{label|${isZh ? '数量' : 'Amount'}} {value|${formatDepthTokenAmount(point.depth)} ${baseTokenSymbol}}`,
        `{label|${isZh ? '金额' : 'Value'}} {value|${formatDepthTokenAmount(point.quoteDepth)} ${quoteTokenSymbol}}`,
      ].join('\n');
      const depthLabelRich = {
        title: {
          color: '#64748b',
          fontSize: 13,
          fontWeight: 700,
          width: 72,
          lineHeight: 24,
        },
        impact: {
          color: '#0f172a',
          fontSize: 13,
          fontWeight: 800,
          align: 'right' as const,
          width: 68,
          lineHeight: 24,
        },
        label: {
          color: '#64748b',
          fontSize: 12,
          width: 42,
          lineHeight: 24,
        },
        value: {
          color: '#0f172a',
          fontSize: 12,
          fontWeight: 800,
          align: 'right' as const,
          width: 102,
          lineHeight: 24,
        },
      };

      return {
        animation: false,
        grid: {
          ...baseGrid,
          left: 24,
          right: 86,
          top: 28,
        },
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'axis',
          showContent: false,
          axisPointer: {
            type: 'line',
            lineStyle: {
              color: 'rgba(100,116,139,0.45)',
              width: 1,
              type: 'dashed',
            },
          },
        },
        xAxis: {
          type: 'value',
          min: currentDepthPrice === null ? undefined : currentDepthPrice * (1 - depthRangeRatio),
          max: currentDepthPrice === null ? undefined : currentDepthPrice * (1 + depthRangeRatio),
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: {
            lineStyle: {
              color: 'rgba(148,163,184,0.14)',
              type: 'dotted',
            },
          },
          axisLabel: {
            color: '#6b7280',
            formatter: (value: number) => formatPriceMetric(value),
          },
        },
        yAxis: {
          type: 'value',
          position: 'right',
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: {
            lineStyle: {
              color: 'rgba(148,163,184,0.16)',
              type: 'dashed',
            },
          },
          axisLabel: {
            color: '#6b7280',
            formatter: (value: number) => formatCompactMetric(value),
          },
        },
        series: [
          {
            name: isZh ? '卖出深度' : 'Sell depth',
            type: 'line',
            step: 'end',
            showSymbol: false,
            connectNulls: false,
            lineStyle: {
              width: 2.5,
              color: '#2f8f2f',
            },
            areaStyle: {
              color: 'rgba(47, 143, 47, 0.16)',
            },
            emphasis: {
              disabled: true,
            },
            data: depthSeries.bids.map((point) => [point.price, point.depth]),
            markPoint:
              hoveredDepthPoints.bid === null
                ? undefined
                : {
                    symbol: 'circle',
                    symbolSize: 8,
                    itemStyle: {
                      color: '#ffffff',
                      borderColor: '#2f8f2f',
                      borderWidth: 2,
                    },
                    label: {
                      show: true,
                      formatter: formatDepthLabel(
                        hoveredDepthPoints.bid,
                        isZh ? '卖出区间' : 'Sell range',
                      ),
                      position: 'insideTopLeft',
                      distance: 14,
                      align: 'left',
                      backgroundColor: 'rgba(255,255,255,0.96)',
                      borderColor: 'rgba(15,23,42,0.08)',
                      borderWidth: 1,
                      borderRadius: 16,
                      padding: [12, 13],
                      shadowColor: 'rgba(15,23,42,0.12)',
                      shadowBlur: 24,
                      shadowOffsetY: 10,
                      rich: {
                        ...depthLabelRich,
                        impact: {
                          ...depthLabelRich.impact,
                          color: '#2f8f2f',
                        },
                      },
                    },
                    data: [
                      {
                        name: 'bid-depth-hover',
                        coord: [hoveredDepthPoints.bid.price, hoveredDepthPoints.bid.depth],
                      },
                    ],
                  },
          },
          {
            name: isZh ? '买入深度' : 'Buy depth',
            type: 'line',
            step: 'start',
            showSymbol: false,
            connectNulls: false,
            lineStyle: {
              width: 2.5,
              color: '#dc2626',
            },
            areaStyle: {
              color: 'rgba(220, 38, 38, 0.16)',
            },
            emphasis: {
              disabled: true,
            },
            data: depthSeries.asks.map((point) => [point.price, point.depth]),
            markPoint:
              hoveredDepthPoints.ask === null
                ? undefined
                : {
                    symbol: 'circle',
                    symbolSize: 8,
                    itemStyle: {
                      color: '#ffffff',
                      borderColor: '#dc2626',
                      borderWidth: 2,
                    },
                    label: {
                      show: true,
                      formatter: formatDepthLabel(
                        hoveredDepthPoints.ask,
                        isZh ? '买入区间' : 'Buy range',
                      ),
                      position: 'insideTopRight',
                      distance: 14,
                      align: 'left',
                      backgroundColor: 'rgba(255,255,255,0.96)',
                      borderColor: 'rgba(15,23,42,0.08)',
                      borderWidth: 1,
                      borderRadius: 16,
                      padding: [12, 13],
                      shadowColor: 'rgba(15,23,42,0.12)',
                      shadowBlur: 24,
                      shadowOffsetY: 10,
                      rich: {
                        ...depthLabelRich,
                        impact: {
                          ...depthLabelRich.impact,
                          color: '#dc2626',
                        },
                      },
                    },
                    data: [
                      {
                        name: 'ask-depth-hover',
                        coord: [hoveredDepthPoints.ask.price, hoveredDepthPoints.ask.depth],
                      },
                    ],
                  },
            markLine:
              currentDepthPrice === null
                ? undefined
                : {
                    symbol: 'none',
                    silent: true,
                    lineStyle: {
                      color: 'rgba(100,116,139,0.55)',
                      width: 1,
                    },
                    label: {
                      show: false,
                    },
                    data: [{ xAxis: currentDepthPrice }],
                  },
          },
        ],
      } as EChartsOption;
    }

    const seriesColor = analyticsTab === 'price' ? '#4f6ddc' : analyticsTab === 'volume' ? '#0ea5e9' : '#10b981';
    const areaColor = analyticsTab === 'price' ? 'rgba(79, 109, 220, 0.12)' : analyticsTab === 'volume' ? 'rgba(14, 165, 233, 0.12)' : 'rgba(16, 185, 129, 0.12)';
    const valueKey = analyticsTab === 'price' ? 'price' : analyticsTab === 'volume' ? 'volume' : 'liquidity';
    const isVolumeChart = analyticsTab === 'volume';
    const lastPointIndex = [...analyticsPoints].reverse().findIndex((point) => point[valueKey] !== null && point[valueKey] !== undefined);
    const resolvedLastPoint =
      lastPointIndex === -1
        ? null
        : analyticsPoints[analyticsPoints.length - 1 - lastPointIndex];

    return {
      animation: false,
      grid: baseGrid,
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#ffffff',
        borderColor: 'rgba(15, 23, 42, 0.06)',
        borderWidth: 1,
        padding: [10, 12],
        textStyle: { color: '#0f172a' },
        formatter: (params: unknown) => {
          const pointParam = Array.isArray(params) ? params[0] as ChartTooltipParam : null;
          if (!pointParam || typeof pointParam.dataIndex !== 'number') {
            return '';
          }

          const point = analyticsPoints[pointParam.dataIndex];
          if (!point) {
            return '';
          }

          const value =
            valueKey === 'price'
              ? point.price
              : valueKey === 'volume'
                ? point.volume
                : point.liquidity;

          const suffix = analyticsTab === 'price' ? quoteTokenSymbol : analyticsTab === 'volume' ? quoteTokenSymbol : quoteTokenSymbol;

          return `${pointParam.axisValueLabel ?? point.label}<br/>${analyticsTab === 'price' ? formatPriceMetric(value) : formatMetricValue(value, 2)} ${suffix}`;
        },
      },
      xAxis: {
        type: 'category',
        boundaryGap: isVolumeChart,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisPointer: {
          show: false,
        },
        axisLabel: {
          color: '#6b7280',
          margin: 14,
          fontWeight: analyticsTab === 'price' ? 500 : 400,
        },
        data: analyticsPoints.map((point) => point.label),
      },
      yAxis: {
        type: 'value',
        position: 'right',
        axisLine: { show: false },
        axisTick: { show: false },
        splitNumber: 5,
        splitLine: {
          lineStyle: {
            color: analyticsTab === 'price' ? 'rgba(148,163,184,0.14)' : 'rgba(148,163,184,0.16)',
            type: 'dashed',
          },
        },
        axisLabel: {
          color: '#6b7280',
          formatter: (value: number) => analyticsTab === 'price' ? formatPriceMetric(value) : formatCompactMetric(value),
        },
        scale: analyticsTab === 'price',
      },
      series: [
        isVolumeChart
          ? {
              type: 'bar',
              barMaxWidth: 34,
              barMinWidth: 6,
              itemStyle: {
                color: seriesColor,
                borderRadius: [6, 6, 0, 0],
              },
              emphasis: {
                focus: 'series',
                itemStyle: {
                  color: '#0284c7',
                },
              },
              data: analyticsPoints.map((point) => point.volume),
            }
          : {
              type: 'line',
              smooth: true,
              symbol: 'circle',
              symbolSize: 7,
              showSymbol: false,
              emphasis: {
                focus: 'series',
                scale: true,
              },
              lineStyle: {
                width: analyticsTab === 'price' ? 3.2 : 3,
                color: seriesColor,
              },
              itemStyle: {
                color: '#ffffff',
                borderColor: seriesColor,
                borderWidth: 3,
              },
              areaStyle: {
                color: areaColor,
              },
              data: analyticsPoints.map((point) => point[valueKey]),
            },
        ...(analyticsTab === 'price' && resolvedLastPoint
          ? [
              {
                type: 'scatter',
                symbolSize: 12,
                itemStyle: {
                  color: '#ffffff',
                  borderColor: seriesColor,
                  borderWidth: 3,
                },
                emphasis: {
                  scale: false,
                },
                data: [[resolvedLastPoint.label, resolvedLastPoint.price]],
                z: 5,
              },
              {
                type: 'scatter',
                symbolSize: 24,
                silent: true,
                itemStyle: {
                  color: 'rgba(79, 109, 220, 0.18)',
                },
                data: [[resolvedLastPoint.label, resolvedLastPoint.price]],
                z: 4,
              },
            ]
          : []),
      ],
    } as EChartsOption;
  }, [
    analyticsPoints,
    analyticsTab,
    baseTokenSymbol,
    depthZoom,
    depthSeries,
    hoveredDepthPoints.ask,
    hoveredDepthPoints.bid,
    isZh,
    quoteTokenSymbol,
  ]);

  return (
    <div className="px-4 py-8 lg:px-6 lg:py-10">
      <section className="lg:px-1">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-[#a96b2c]">
          <Link href="/pool" className="transition-colors hover:text-[#8b5623]">
            {isZh ? '资金池' : 'Pools'}
          </Link>
          <ChevronRight size={14} className="text-gray-400" />
          <span className="text-gray-900 dark:text-white">{breadcrumbLabel}</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {supportedChain ? (
              <Link
                href={addLiquidityHref}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-gray-900 px-5 text-sm font-bold text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
              >
                <span>{isZh ? '添加流动性' : 'Add liquidity'}</span>
                <ChevronRight size={16} />
              </Link>
            ) : null}
            <Link
              href="/pool"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-black/5 bg-white px-5 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-100 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-100 dark:hover:bg-white/[0.1]"
            >
              <span>{isZh ? '返回列表' : 'Back to pools'}</span>
            </Link>
          </div>
        </div>

        {!supportedChain ? (
          <div className="mt-6">
            <EmptyNotice
              icon={Droplets}
              title={isZh ? '当前网络暂不支持' : 'Unsupported network'}
            />
          </div>
        ) : loading ? (
          <div className="mt-6">
            <EmptyNotice
              icon={Droplets}
              title={isZh ? '正在加载池子详情' : 'Loading pool detail'}
            />
          </div>
        ) : fetchError ? (
          <div className="mt-6">
            <EmptyNotice
              icon={Droplets}
              title={isZh ? '池子详情加载失败' : 'Failed to load pool detail'}
              description={fetchError}
            />
          </div>
        ) : poolDetail ? (
          <div className="mt-6 space-y-6">
            <section className="rounded-[2rem] border border-black/5 bg-white/78 shadow-xl shadow-sky-500/5 backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.04]">
              <div className="grid gap-0 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]">
                <div className="border-b border-black/5 p-6 dark:border-white/10 xl:border-b-0 xl:border-r">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-4">
                        <TokenPairBadge token0Symbol={displayTokenASymbol} token1Symbol={displayTokenBSymbol} />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                            {isZh ? '资金池详情' : 'Pool detail'}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-3">
                            <h1 className="truncate text-3xl font-black tracking-tight text-gray-900 dark:text-white">
                              {poolLabel}
                            </h1>
                            <button
                              type="button"
                              onClick={() => setIsPairReversed((current) => !current)}
                              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-black/5 bg-white text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1] dark:hover:text-white"
                              aria-label={isZh ? '切换代币顺序' : 'Reverse token order'}
                              title={isZh ? '切换代币顺序' : 'Reverse token order'}
                            >
                              <Repeat2 size={18} />
                            </button>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                            <span>{truncateAddress(poolDetail.id)}</span>
                            <span>·</span>
                            <span>V2</span>
                            <span>·</span>
                            <span>0.3%</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="hidden flex-wrap items-center gap-3">
                      <Link
                        href={addLiquidityHref}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-gray-900 px-5 text-sm font-bold text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
                      >
                        <span>{isZh ? '添加流动性' : 'Add liquidity'}</span>
                        <ChevronRight size={16} />
                      </Link>
                      <Link
                        href="/pool"
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-black/5 bg-white px-5 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-100 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-100 dark:hover:bg-white/[0.1]"
                      >
                        <span>{isZh ? '返回列表' : 'Back to pools'}</span>
                      </Link>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[1.5rem] border border-black/5 bg-gray-50/80 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                        {isZh ? '当前价格' : 'Current price'}
                      </div>
                      <div className="mt-3 text-xl font-black tracking-tight text-gray-900 dark:text-white">
                        1 {displayTokenASymbol} = {displayPrimaryPrice} {displayTokenBSymbol}
                      </div>
                      <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        1 {displayTokenBSymbol} = {displaySecondaryPrice} {displayTokenASymbol}
                      </div>
                    </div>

                    <div className="rounded-[1.5rem] border border-black/5 bg-gray-50/80 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                        {isZh ? '当前储备' : 'Current reserves'}
                      </div>
                      <div className="mt-3 space-y-2 text-sm font-semibold text-gray-900 dark:text-white">
                        <div className="flex items-center justify-between gap-4">
                          <span>{displayTokenASymbol}</span>
                          <span>
                            {isPairReversed
                              ? formatBigIntAmountDown(poolDetail.reserve1, poolDetail.token1.decimals, 6)
                              : formatBigIntAmountDown(poolDetail.reserve0, poolDetail.token0.decimals, 6)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span>{displayTokenBSymbol}</span>
                          <span>
                            {isPairReversed
                              ? formatBigIntAmountDown(poolDetail.reserve0, poolDetail.token0.decimals, 6)
                              : formatBigIntAmountDown(poolDetail.reserve1, poolDetail.token1.decimals, 6)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 rounded-[1.5rem] border border-black/5 bg-white/80 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                    <div className="flex flex-wrap items-center gap-6 border-b border-black/5 pb-3 dark:border-white/10">
                      {analyticsTabs.map((tab) => {
                        const selected = analyticsTab === tab.key;

                        return (
                          <button
                            key={tab.key}
                            type="button"
                            onClick={() => {
                              setAnalyticsTab(tab.key);
                              if (tab.key === 'volume') {
                                setAnalyticsRange('1h');
                              }
                            }}
                            className={`pb-2 text-[1.05rem] font-semibold transition-colors ${
                              selected
                                ? 'border-b-2 border-gray-900 text-gray-900 dark:border-white dark:text-white'
                                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                            }`}
                          >
                            {tab.label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-5 flex flex-col gap-5">
                      <div className="flex flex-col gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-end gap-x-3 gap-y-2 text-gray-900 dark:text-white">
                            <span className="min-w-0 truncate text-[2rem] font-black tracking-tight">
                              {analyticsSummary.headline}
                            </span>
                            {analyticsSummary.secondary ? (
                              <span className="text-[1rem] font-semibold text-gray-500 dark:text-gray-400">
                                ({analyticsSummary.secondary})
                              </span>
                            ) : null}
                            {analyticsSummary.changePct !== undefined ? (
                              <span
                                className={`inline-flex items-center gap-1 pb-1 text-base font-semibold ${
                                  analyticsSummary.changePct > 0
                                    ? 'text-emerald-600 dark:text-emerald-300'
                                    : analyticsSummary.changePct < 0
                                      ? 'text-rose-500 dark:text-rose-300'
                                      : 'text-gray-500 dark:text-gray-400'
                                }`}
                              >
                                {analyticsSummary.changePct !== 0 ? (
                                  <span className="text-[0.78rem]">
                                    {analyticsSummary.changePct > 0 ? '^' : 'v'}
                                  </span>
                                ) : null}
                                {analyticsSummary.changePct > 0 ? '+' : ''}
                                {analyticsSummary.changePct.toFixed(2)}%
                              </span>
                            ) : null}
                          </div>
                          {analyticsSummary.footnote ? (
                            <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                              {analyticsSummary.footnote}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="h-[420px] rounded-[1.5rem] border border-black/5 bg-white/70 px-2 py-4 dark:border-white/10 dark:bg-[#0b1220]">
                        {analyticsChartEmpty ? (
                          <div className="flex h-full items-center justify-center rounded-[1.2rem] border border-dashed border-black/10 text-sm text-gray-500 dark:border-white/10 dark:text-gray-400">
                            {isZh ? '当前范围内暂无可展示数据' : 'No chart data in this range yet'}
                          </div>
                        ) : (
                          <ReactECharts
                            option={analyticsChartOption}
                            onEvents={chartEvents}
                            notMerge
                            lazyUpdate
                            style={{ height: '100%', width: '100%' }}
                          />
                        )}
                      </div>
                      {analyticsTab === 'depth' && !analyticsChartEmpty ? (
                        <div className="-mt-2 flex justify-end pr-2">
                          <div className="inline-flex items-center rounded-full border border-gray-200/80 bg-white/90 p-0.5 shadow-[0_8px_24px_rgba(15,23,42,0.08)] backdrop-blur-md dark:border-white/10 dark:bg-gray-950/80">
                            <button
                              type="button"
                              onClick={zoomOutDepth}
                              className="flex h-[34px] w-9 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-950 dark:text-gray-300 dark:hover:bg-white/10"
                              aria-label={isZh ? '缩小深度图' : 'Zoom out depth chart'}
                              title={isZh ? '缩小' : 'Zoom out'}
                            >
                              <ZoomOut size={16} strokeWidth={2.1} />
                            </button>
                            <button
                              type="button"
                              onClick={resetDepthZoom}
                              className="mx-0.5 flex h-[34px] w-9 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-950 dark:text-gray-300 dark:hover:bg-white/10"
                              aria-label={isZh ? '重置深度图' : 'Reset depth chart'}
                              title={isZh ? '重置' : 'Reset'}
                            >
                              <Maximize size={15} strokeWidth={2.1} />
                            </button>
                            <button
                              type="button"
                              onClick={zoomInDepth}
                              className="flex h-[34px] w-9 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-950 dark:text-gray-300 dark:hover:bg-white/10"
                              aria-label={isZh ? '放大深度图' : 'Zoom in depth chart'}
                              title={isZh ? '放大' : 'Zoom in'}
                            >
                              <ZoomIn size={16} strokeWidth={2.1} />
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {analyticsTab === 'price' || analyticsTab === 'volume' ? (
                        <div className="flex justify-end">
                          <div className="inline-flex rounded-full border border-black/5 bg-white/90 p-1 shadow-sm dark:border-white/10 dark:bg-white/[0.06]">
                            {analyticsRangeOptions.map((option) => {
                              const selected = analyticsRange === option.key;

                              return (
                                <button
                                  key={option.key}
                                  type="button"
                                  onClick={() => setAnalyticsRange(option.key)}
                                  className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                                    selected
                                      ? 'bg-white text-gray-900 shadow-sm dark:bg-white dark:text-gray-900'
                                      : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                                  }`}
                                >
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <aside className="p-6">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                    {isZh ? '池子概览' : 'Pool overview'}
                  </div>
                  <div className="mt-2 text-2xl font-black tracking-tight text-gray-900 dark:text-white">
                    {poolLabel}
                  </div>
                  <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {isZh ? '关键数据和来源信息' : 'Key facts and source data'}
                  </div>

                  <div className="mt-5 grid gap-3">
                    {summaryCards.map((card) => (
                      <StatCard key={card.label} label={card.label} value={card.value} icon={card.icon} />
                    ))}
                  </div>

                  <div className="mt-5 rounded-[1.5rem] border border-black/5 bg-gray-50/80 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                      {isZh ? '合约信息' : 'Contract info'}
                    </div>
                    <div className="mt-3 space-y-3 text-sm">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-gray-500 dark:text-gray-400">{isZh ? '池子地址' : 'Pool address'}</span>
                        <span className="font-mono font-semibold text-gray-900 dark:text-white">
                          {truncateAddress(poolDetail.id)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-gray-500 dark:text-gray-400">{isZh ? '创建交易' : 'Created tx'}</span>
                        <span className="font-mono font-semibold text-gray-900 dark:text-white">
                          {poolDetail.createdAtTxHash ? truncateAddress(poolDetail.createdAtTxHash) : '--'}
                        </span>
                      </div>
                    </div>
                  </div>
                </aside>
              </div>
            </section>

            <section className="rounded-[2rem] border border-black/5 bg-white/78 p-6 shadow-xl shadow-sky-500/5 backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.04]">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 text-gray-700 dark:bg-white/[0.05] dark:text-gray-200">
                  <ArrowDownUp size={18} />
                </div>
                <div>
                  <div className="text-lg font-black tracking-tight text-gray-900 dark:text-white">
                    {isZh ? '最近活动' : 'Recent activity'}
                  </div>
                  <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {isZh ? '按时间倒序展示最近的交易、添加和移除流动性事件' : 'Latest swap, add, and remove events in reverse chronological order'}
                  </div>
                </div>
              </div>

              <div className="mt-6 hidden overflow-hidden rounded-[1.5rem] border border-black/5 lg:block dark:border-white/10">
                <div className="grid grid-cols-[128px_110px_minmax(0,1.45fr)_120px] gap-4 border-b border-black/5 bg-gray-50/90 px-5 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-gray-400">
                  <div>{isZh ? '时间' : 'Time'}</div>
                  <div>{isZh ? '类型' : 'Type'}</div>
                  <div>{isZh ? '详情' : 'Detail'}</div>
                  <div className="text-right">{isZh ? '钱包' : 'Wallet'}</div>
                </div>

                <div className="divide-y divide-black/5 dark:divide-white/10">
                  {activityRows.length > 0 ? (
                    activityRows.map((row) => (
                      <div
                        key={row.id}
                        className="grid grid-cols-[128px_110px_minmax(0,1.45fr)_120px] gap-4 px-5 py-4 text-sm"
                      >
                        <div className="font-medium text-gray-700 dark:text-gray-300">{row.timeLabel}</div>
                        <div>
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getActivityToneClass(
                              row.tone,
                            )}`}
                          >
                            {row.title}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-gray-900 dark:text-white">
                            {row.detailLabel}
                          </div>
                          {row.txHref ? (
                            <Link
                              href={row.txHref}
                              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                            >
                              <span>{truncateAddress(row.txHash)}</span>
                              <ChevronRight size={12} />
                            </Link>
                          ) : (
                            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              {truncateAddress(row.txHash)}
                            </div>
                          )}
                        </div>
                        <div className="text-right font-medium text-gray-700 dark:text-gray-300">
                          {row.walletLabel}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="px-5 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                      {isZh ? '当前池子还没有活动记录' : 'No activity recorded for this pool yet'}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 space-y-3 lg:hidden">
                {activityRows.length > 0 ? (
                  activityRows.map((row) => (
                    <div
                      key={row.id}
                      className="rounded-[1.35rem] border border-black/5 bg-gray-50/80 p-4 dark:border-white/10 dark:bg-white/[0.03]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {row.timeLabel}
                        </div>
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getActivityToneClass(
                            row.tone,
                          )}`}
                        >
                          {row.title}
                        </span>
                      </div>
                      <div className="mt-3 text-sm font-semibold text-gray-900 dark:text-white">
                        {row.detailLabel}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                        <span>{row.walletLabel}</span>
                        {row.txHref ? (
                          <Link href={row.txHref} className="inline-flex items-center gap-1 font-medium">
                            <span>{truncateAddress(row.txHash)}</span>
                            <ChevronRight size={12} />
                          </Link>
                        ) : (
                          <span>{truncateAddress(row.txHash)}</span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[1.35rem] border border-dashed border-black/10 bg-gray-50/80 px-5 py-10 text-center text-sm text-gray-500 dark:border-white/10 dark:bg-white/[0.03]">
                    {isZh ? '当前池子还没有活动记录' : 'No activity recorded for this pool yet'}
                  </div>
                )}
              </div>
            </section>
          </div>
        ) : (
          <div className="mt-6 rounded-[1.8rem] border border-dashed border-black/10 bg-white/45 px-6 py-12 text-center backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.03]">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300">
              <Droplets size={24} />
            </div>
            <div className="mt-4 text-lg font-black tracking-tight text-gray-900 dark:text-white">
              {isZh ? '未找到资金池' : 'Pool not found'}
            </div>
            <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {pairAddress ? truncateAddress(pairAddress) : '--'}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
