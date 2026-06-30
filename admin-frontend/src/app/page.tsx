'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Coins,
  LoaderCircle,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Sprout,
  Vault,
} from 'lucide-react';
import type { Address } from 'viem';
import { useChainId, usePublicClient } from 'wagmi';

import { Card, shortAddress, StatusPill } from '@/components/AdminPrimitives';
import { getContractAddress, isFluxSupportedChain } from '@/config/contracts';
import { getAdminTokenOptions } from '@/config/tokens';
import { formatBigIntAmountDown } from '@/lib/amounts';
import {
  fluxMultiPoolManagerAbi,
  fluxSwapErc20Abi,
  fluxSwapPairAbi,
  fluxSwapStakingRewardsAbi,
  fluxSwapTreasuryAbi,
} from '@/lib/contracts';
import { formatErrorMessage } from '@/lib/errors';

const ZERO_BIGINT = BigInt(0);
const RECENT_BLOCK_WINDOW = BigInt(20_000);
const OPERATION_BUCKET_COUNT = 280;
const CHART_COLORS = ['#4f46e5', '#059669', '#d97706', '#dc2626', '#0891b2', '#7c3aed', '#475569', '#be123c'];

type PoolTuple = readonly [Address, bigint, boolean, bigint, bigint];

type TokenMeta = {
  label: string;
  symbol: string;
  decimals: number;
};

type FarmWeightSlice = {
  label: string;
  poolAddress: Address;
  allocPoint: bigint;
  active: boolean;
  totalStaked: bigint;
  stakingDecimals: number;
  stakingSymbol: string;
};

type OperationBucket = {
  label: string;
  farm: number;
  treasury: number;
};

type OverviewData = {
  poolLength: number;
  activePoolCount: number;
  totalAllocPoint: bigint;
  totalPendingRewards: bigint;
  undistributedRewards: bigint;
  rewardTokenSymbol: string;
  rewardTokenDecimals: number;
  rewardTokenAddress: Address;
  treasuryAddress: Address;
  treasuryPaused: boolean;
  treasuryRewardBalance: bigint;
  treasuryApprovedSpendRemaining: bigint;
  configuredTokenCount: number;
  allowedTokenCount: number;
  recentFarmEvents: number;
  recentTreasuryEvents: number;
  farmWeightSlices: FarmWeightSlice[];
  operationBuckets: OperationBucket[];
};

type Tone = 'success' | 'warning' | 'danger' | 'neutral';

type ProtocolNode = {
  label: string;
  value: string;
  detail: string;
  tone: Tone;
  href: string;
  icon: React.ReactNode;
};

type ActionItem = {
  title: string;
  detail: string;
  tone: Tone;
};

function sameAddress(left?: string, right?: string) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function normalizeSymbol(symbol: string, tokenAddress: Address, wrappedNativeAddress?: Address) {
  if (wrappedNativeAddress && sameAddress(tokenAddress, wrappedNativeAddress)) {
    return 'ETH';
  }

  return symbol || 'TOKEN';
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatPercent(value: bigint, total: bigint) {
  if (value <= ZERO_BIGINT || total <= ZERO_BIGINT) {
    return '0%';
  }

  const percent = Number((value * BigInt(10_000)) / total) / 100;

  return `${percent.toLocaleString('zh-CN', {
    minimumFractionDigits: percent >= 10 ? 1 : 2,
    maximumFractionDigits: 2,
  })}%`;
}

function formatRefreshTime(value: Date | null) {
  if (!value) {
    return '尚未刷新';
  }

  return value.toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function buildOperationBuckets({
  latestBlock,
  fromBlock,
  farmEvents,
  treasuryEvents,
}: {
  latestBlock: bigint;
  fromBlock: bigint;
  farmEvents: { blockNumber?: bigint | null }[];
  treasuryEvents: { blockNumber?: bigint | null }[];
}): OperationBucket[] {
  const span = latestBlock >= fromBlock ? latestBlock - fromBlock + BigInt(1) : BigInt(1);
  const bucketSize = span / BigInt(OPERATION_BUCKET_COUNT) || BigInt(1);
  const buckets = Array.from({ length: OPERATION_BUCKET_COUNT }, (_, index) => {
    const distance = OPERATION_BUCKET_COUNT - index - 1;

    return {
      label: distance === 0 ? '最新' : `-${distance}`,
      farm: 0,
      treasury: 0,
    };
  });

  const applyEvent = (event: { blockNumber?: bigint | null }, scope: 'farm' | 'treasury') => {
    if (event.blockNumber === undefined || event.blockNumber === null || event.blockNumber < fromBlock) {
      return;
    }

    const rawIndex = Number((event.blockNumber - fromBlock) / bucketSize);
    const index = Math.max(0, Math.min(OPERATION_BUCKET_COUNT - 1, rawIndex));
    buckets[index][scope] += 1;
  };

  farmEvents.forEach((event) => applyEvent(event, 'farm'));
  treasuryEvents.forEach((event) => applyEvent(event, 'treasury'));

  return buckets;
}

function getHealthScore(overview: OverviewData | null) {
  if (!overview) {
    return 0;
  }

  let score = 100;

  if (overview.activePoolCount === 0) {
    score -= 30;
  }
  if (overview.totalAllocPoint <= ZERO_BIGINT) {
    score -= 20;
  }
  if (overview.treasuryPaused) {
    score -= 30;
  }
  if (overview.treasuryRewardBalance <= ZERO_BIGINT) {
    score -= 18;
  }
  if (overview.treasuryApprovedSpendRemaining <= ZERO_BIGINT) {
    score -= 18;
  }
  if (overview.allowedTokenCount < overview.configuredTokenCount) {
    score -= 10;
  }

  return clampScore(score);
}

function getToneByScore(score: number): Tone {
  if (score >= 80) {
    return 'success';
  }
  if (score >= 55) {
    return 'warning';
  }

  return 'danger';
}

function getToneClasses(tone: Tone) {
  const classes = {
    success: {
      text: 'text-emerald-700',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      stroke: '#10b981',
      soft: 'bg-emerald-500/10',
    },
    warning: {
      text: 'text-amber-700',
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      stroke: '#f59e0b',
      soft: 'bg-amber-500/10',
    },
    danger: {
      text: 'text-rose-700',
      bg: 'bg-rose-50',
      border: 'border-rose-200',
      stroke: '#ef4444',
      soft: 'bg-rose-500/10',
    },
    neutral: {
      text: 'text-slate-600',
      bg: 'bg-slate-100',
      border: 'border-slate-200',
      stroke: '#64748b',
      soft: 'bg-slate-500/10',
    },
  };

  return classes[tone];
}

function ProtocolMap({
  nodes,
  tone,
}: {
  nodes: ProtocolNode[];
  tone: Tone;
}) {
  const nodeByLabel = new Map(nodes.map((node) => [node.label, node]));
  const flowStages = [
    { label: '白名单资产', helper: '资产准入', node: nodeByLabel.get('代币'), href: '/tokens' },
    { label: 'Treasury', helper: '奖励授权', node: nodeByLabel.get('金库'), href: '/treasury' },
    {
      label: 'MultiPoolManager',
      helper: '核心分发',
      node: {
        label: '核心',
        value: tone === 'success' ? '正常' : tone === 'warning' ? '关注' : '处理',
        detail: tone === 'success' ? '核心正常' : tone === 'warning' ? '需要关注' : '需要处理',
        tone,
        href: '/farm',
        icon: null,
      } satisfies ProtocolNode,
      href: '/farm',
    },
    { label: '农场池', helper: '权重分发', node: nodeByLabel.get('农场'), href: '/farm' },
    { label: '奖励领取', helper: '收益累积', node: nodeByLabel.get('奖励'), href: '/farm' },
  ];
  const operationNode = nodeByLabel.get('操作');

  return (
    <div className="space-y-4">
      <div className="grid gap-3 xl:grid-cols-5">
        {flowStages.map((stage, index) => {
          const stageTone = getToneClasses(stage.node?.tone ?? 'neutral');
          const isCore = stage.label === 'MultiPoolManager';

          return (
            <a
              key={stage.label}
              href={stage.href}
              className={`relative rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-sm ${
                isCore ? 'border-slate-950 bg-slate-950 text-white' : `${stageTone.border} bg-white`
              }`}
            >
              {index < flowStages.length - 1 ? (
                <span className="absolute -right-3 top-1/2 z-10 hidden h-0.5 w-6 -translate-y-1/2 bg-slate-200 xl:block" />
              ) : null}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${isCore ? 'text-slate-400' : 'text-slate-400'}`}>
                    {stage.helper}
                  </p>
                  <h3 className={`mt-2 truncate text-base font-semibold ${isCore ? 'text-white' : 'text-slate-950'}`}>
                    {stage.label}
                  </h3>
                </div>
                <span
                  className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${isCore ? 'ring-4 ring-white/10' : ''}`}
                  style={{ backgroundColor: stageTone.stroke }}
                />
              </div>
              <p className={`mt-6 text-3xl font-semibold ${isCore ? 'text-white' : 'text-slate-950'}`}>
                {stage.node?.value ?? '--'}
              </p>
              <p className={`mt-2 truncate text-sm ${isCore ? 'text-slate-300' : 'text-slate-500'}`}>
                {stage.node?.detail ?? '--'}
              </p>
            </a>
          );
        })}
      </div>

      <div className="grid gap-3 border-t border-dashed border-slate-200 pt-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">管理动作</p>
              <p className="mt-1 truncate text-sm font-semibold text-slate-950">
                操作事件只记录管理行为，不改变资金主流向
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xl font-semibold text-slate-950">{operationNode?.value ?? '--'}</p>
              <p className="text-xs text-slate-500">{operationNode?.detail ?? '--'}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {(['success', 'warning', 'danger', 'neutral'] as Tone[]).map((legendTone) => {
            const legendClasses = getToneClasses(legendTone);

            return (
              <span key={legendTone} className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: legendClasses.stroke }} />
                {legendTone === 'success'
                  ? '正常'
                  : legendTone === 'warning'
                    ? '需关注'
                    : legendTone === 'danger'
                      ? '异常'
                      : '暂无数据'}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FarmWeightDonut({ overview }: { overview: OverviewData | null }) {
  const slices = overview?.farmWeightSlices.slice(0, 7) ?? [];
  const totalAllocPoint = overview?.totalAllocPoint ?? ZERO_BIGINT;
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const segmentLengths = slices.map((slice) =>
    totalAllocPoint > ZERO_BIGINT
      ? (Number((slice.allocPoint * BigInt(10_000)) / totalAllocPoint) / 10_000) * circumference
      : 0,
  );
  const segments = slices.map((slice, index) => {
    const length = segmentLengths[index] ?? 0;

    return {
      slice,
      index,
      length,
      offset: segmentLengths.slice(0, index).reduce((sum, segmentLength) => sum + segmentLength, 0),
    };
  });

  if (slices.length === 0 || totalAllocPoint <= ZERO_BIGINT) {
    return (
      <div className="flex min-h-72 items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">
        暂无可展示的权重分布
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[220px_1fr] lg:items-center">
      <div className="relative mx-auto h-56 w-56">
        <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90">
          <circle cx="90" cy="90" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="22" />
          {segments.map(({ slice, index, length, offset }) => (
            <circle
              key={`${slice.poolAddress}-${slice.label}`}
              cx="90"
              cy="90"
              r={radius}
              fill="none"
              stroke={CHART_COLORS[index % CHART_COLORS.length]}
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
              strokeWidth="22"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold text-slate-950">{overview?.totalAllocPoint.toString() ?? '0'}</span>
          <span className="text-xs text-slate-500">总权重</span>
        </div>
      </div>

      <div className="space-y-3">
        {slices.map((slice, index) => (
          <div key={`${slice.poolAddress}-${slice.label}-row`} className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
              />
              <span className="truncate text-sm font-medium text-slate-700">{slice.label}</span>
              {!slice.active ? <StatusPill tone="neutral">停用</StatusPill> : null}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold text-slate-950">{formatPercent(slice.allocPoint, totalAllocPoint)}</p>
              <p className="text-xs text-slate-400">
                {formatBigIntAmountDown(slice.totalStaked, slice.stakingDecimals, 2)} {slice.stakingSymbol}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RewardCapacityRings({ overview }: { overview: OverviewData | null }) {
  const items = [
    {
      label: '金库余额',
      value: overview?.treasuryRewardBalance ?? ZERO_BIGINT,
      color: '#4f46e5',
      radius: 68,
    },
    {
      label: '已授权额度',
      value: overview?.treasuryApprovedSpendRemaining ?? ZERO_BIGINT,
      color: '#059669',
      radius: 50,
    },
    {
      label: '待分发奖励',
      value: overview?.totalPendingRewards ?? ZERO_BIGINT,
      color: '#d97706',
      radius: 32,
    },
  ];
  const maxValue = items.reduce((max, item) => (item.value > max ? item.value : max), ZERO_BIGINT);

  return (
    <div className="grid gap-5 lg:grid-cols-[200px_1fr] lg:items-center">
      <div className="relative mx-auto h-52 w-52">
        <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90">
          {items.map((item) => {
            const circumference = 2 * Math.PI * item.radius;
            const value = maxValue > ZERO_BIGINT ? Number((item.value * BigInt(10_000)) / maxValue) / 10_000 : 0;

            return (
              <g key={item.label}>
                <circle cx="90" cy="90" r={item.radius} fill="none" stroke="#e2e8f0" strokeWidth="12" />
                <circle
                  cx="90"
                  cy="90"
                  r={item.radius}
                  fill="none"
                  stroke={item.color}
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference - value * circumference}
                  strokeLinecap="round"
                  strokeWidth="12"
                />
              </g>
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-semibold text-slate-950">{overview?.rewardTokenSymbol ?? 'FLUX'}</span>
          <span className="text-xs text-slate-500">奖励资产</span>
        </div>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-sm text-slate-500">{item.label}</span>
            </div>
            <span className="text-sm font-semibold text-slate-950">
              {formatBigIntAmountDown(item.value, overview?.rewardTokenDecimals ?? 18, 4)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OperationHeatmap({ overview }: { overview: OverviewData | null }) {
  const buckets = overview?.operationBuckets ?? [];
  const maxValue = Math.max(1, ...buckets.map((bucket) => bucket.farm + bucket.treasury));
  const totalEvents = (overview?.recentFarmEvents ?? 0) + (overview?.recentTreasuryEvents ?? 0);
  const columns = Math.ceil(buckets.length / 7);

  if (buckets.length === 0) {
    return (
      <div className="flex min-h-44 items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">
        暂无管理事件
      </div>
    );
  }

  const getCellClassName = (total: number) => {
    if (total <= 0) {
      return 'bg-slate-100';
    }
    if (total / maxValue >= 0.75) {
      return 'bg-emerald-600';
    }
    if (total / maxValue >= 0.45) {
      return 'bg-emerald-500';
    }
    if (total / maxValue >= 0.2) {
      return 'bg-emerald-300';
    }

    return 'bg-emerald-100';
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-4 text-sm text-slate-500">
        <span>
          农场 <strong className="font-semibold text-slate-950">{overview?.recentFarmEvents ?? 0}</strong>
        </span>
        <span>
          金库 <strong className="font-semibold text-slate-950">{overview?.recentTreasuryEvents ?? 0}</strong>
        </span>
        <span>
          总计 <strong className="font-semibold text-slate-950">{totalEvents}</strong>
        </span>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="min-w-[760px]">
          <div className="mb-2 grid grid-cols-5 text-xs text-slate-400">
            <span>最早</span>
            <span className="text-center">前段</span>
            <span className="text-center">中段</span>
            <span className="text-center">近段</span>
            <span className="text-right">最新</span>
          </div>

          <div
            className="grid grid-flow-col grid-rows-7 gap-1"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
          {buckets.map((bucket, index) => {
            const total = bucket.farm + bucket.treasury;

            return (
              <span
                key={`${bucket.label}-${index}`}
                className={`aspect-square rounded-[3px] transition hover:ring-2 hover:ring-slate-300 ${getCellClassName(total)}`}
                title={`${bucket.label}：共 ${total} 条，农场 ${bucket.farm} / 金库 ${bucket.treasury}`}
              />
            );
          })}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>更少</span>
          <span className="h-3.5 w-3.5 rounded-[4px] bg-slate-100" />
          <span className="h-3.5 w-3.5 rounded-[4px] bg-emerald-100" />
          <span className="h-3.5 w-3.5 rounded-[4px] bg-emerald-300" />
          <span className="h-3.5 w-3.5 rounded-[4px] bg-emerald-500" />
          <span className="h-3.5 w-3.5 rounded-[4px] bg-emerald-600" />
          <span>更多</span>
        </div>
        <div className="flex gap-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            农场
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            金库
          </span>
        </div>
      </div>
    </div>
  );
}

export default function OverviewPage() {
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });
  const supportedChain = isFluxSupportedChain(chainId);
  const managerAddress = getContractAddress('FluxMultiPoolManager', chainId);
  const treasuryAddress = getContractAddress('FluxSwapTreasury', chainId);
  const wrappedNativeAddress = getContractAddress('MockWETH', chainId);
  const configuredTokens = useMemo(() => getAdminTokenOptions(chainId), [chainId]);

  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const readTokenMeta = useCallback(
    async (tokenAddress: Address): Promise<TokenMeta> => {
      if (!publicClient) {
        return {
          label: shortAddress(tokenAddress),
          symbol: 'TOKEN',
          decimals: 18,
        };
      }

      try {
        const [token0, token1, decimals] = await Promise.all([
          publicClient.readContract({
            address: tokenAddress,
            abi: fluxSwapPairAbi,
            functionName: 'token0',
          }),
          publicClient.readContract({
            address: tokenAddress,
            abi: fluxSwapPairAbi,
            functionName: 'token1',
          }),
          publicClient.readContract({
            address: tokenAddress,
            abi: fluxSwapPairAbi,
            functionName: 'decimals',
          }),
        ]);

        const [token0Symbol, token1Symbol] = await Promise.all([
          publicClient.readContract({
            address: token0,
            abi: fluxSwapErc20Abi,
            functionName: 'symbol',
          }),
          publicClient.readContract({
            address: token1,
            abi: fluxSwapErc20Abi,
            functionName: 'symbol',
          }),
        ]);
        const normalizedToken0 = normalizeSymbol(token0Symbol, token0, wrappedNativeAddress);
        const normalizedToken1 = normalizeSymbol(token1Symbol, token1, wrappedNativeAddress);

        return {
          label: `${normalizedToken0} / ${normalizedToken1}`,
          symbol: `${normalizedToken0}-${normalizedToken1} LP`,
          decimals: Number(decimals),
        };
      } catch {
        const [symbolResult, decimalsResult] = await Promise.allSettled([
          publicClient.readContract({
            address: tokenAddress,
            abi: fluxSwapErc20Abi,
            functionName: 'symbol',
          }),
          publicClient.readContract({
            address: tokenAddress,
            abi: fluxSwapErc20Abi,
            functionName: 'decimals',
          }),
        ]);
        const symbol =
          symbolResult.status === 'fulfilled'
            ? normalizeSymbol(symbolResult.value, tokenAddress, wrappedNativeAddress)
            : 'TOKEN';
        const decimals = decimalsResult.status === 'fulfilled' ? Number(decimalsResult.value) : 18;

        return {
          label: symbol,
          symbol,
          decimals,
        };
      }
    },
    [publicClient, wrappedNativeAddress],
  );

  const loadOverview = useCallback(async () => {
    if (!publicClient || !supportedChain || !managerAddress || !treasuryAddress) {
      setOverview(null);
      setLoading(false);
      setError(supportedChain ? '当前链缺少管理合约地址。' : '当前网络暂不支持 FluxSwap 管理端。');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [
        poolLength,
        totalAllocPoint,
        totalPendingRewards,
        undistributedRewards,
        rewardTokenAddress,
        managerTreasuryAddress,
      ] = await Promise.all([
        publicClient.readContract({
          address: managerAddress,
          abi: fluxMultiPoolManagerAbi,
          functionName: 'poolLength',
        }),
        publicClient.readContract({
          address: managerAddress,
          abi: fluxMultiPoolManagerAbi,
          functionName: 'totalAllocPoint',
        }),
        publicClient.readContract({
          address: managerAddress,
          abi: fluxMultiPoolManagerAbi,
          functionName: 'totalPendingRewards',
        }),
        publicClient.readContract({
          address: managerAddress,
          abi: fluxMultiPoolManagerAbi,
          functionName: 'undistributedRewards',
        }),
        publicClient.readContract({
          address: managerAddress,
          abi: fluxMultiPoolManagerAbi,
          functionName: 'rewardToken',
        }),
        publicClient.readContract({
          address: managerAddress,
          abi: fluxMultiPoolManagerAbi,
          functionName: 'treasury',
        }),
      ]);
      const resolvedTreasuryAddress = managerTreasuryAddress || treasuryAddress;
      const rewardTokenMeta = await readTokenMeta(rewardTokenAddress);
      const poolCount = Number(poolLength);
      const poolRows = await Promise.all(
        Array.from({ length: poolCount }, async (_, index) => {
          const poolData = (await publicClient.readContract({
            address: managerAddress,
            abi: fluxMultiPoolManagerAbi,
            functionName: 'pools',
            args: [BigInt(index)],
          })) as PoolTuple;
          const [poolAddress, allocPoint, active] = poolData;

          try {
            const [stakingToken, totalStaked] = await Promise.all([
              publicClient.readContract({
                address: poolAddress,
                abi: fluxSwapStakingRewardsAbi,
                functionName: 'stakingToken',
              }),
              publicClient.readContract({
                address: poolAddress,
                abi: fluxSwapStakingRewardsAbi,
                functionName: 'totalStaked',
              }),
            ]);
            const stakingTokenMeta = await readTokenMeta(stakingToken);

            return {
              label: stakingTokenMeta.label,
              poolAddress,
              allocPoint,
              active,
              totalStaked,
              stakingDecimals: stakingTokenMeta.decimals,
              stakingSymbol: stakingTokenMeta.symbol,
            } satisfies FarmWeightSlice;
          } catch {
            return {
              label: shortAddress(poolAddress),
              poolAddress,
              allocPoint,
              active,
              totalStaked: ZERO_BIGINT,
              stakingDecimals: 18,
              stakingSymbol: 'TOKEN',
            } satisfies FarmWeightSlice;
          }
        }),
      );
      const [treasuryPausedResult, treasuryRewardBalanceResult, treasuryApprovedSpendRemainingResult] =
        await Promise.allSettled([
          publicClient.readContract({
            address: resolvedTreasuryAddress,
            abi: fluxSwapTreasuryAbi,
            functionName: 'paused',
          }),
          publicClient.readContract({
            address: rewardTokenAddress,
            abi: fluxSwapErc20Abi,
            functionName: 'balanceOf',
            args: [resolvedTreasuryAddress],
          }),
          publicClient.readContract({
            address: resolvedTreasuryAddress,
            abi: fluxSwapTreasuryAbi,
            functionName: 'approvedSpendRemaining',
            args: [rewardTokenAddress, managerAddress],
          }),
        ]);
      const allowedTokenResults = await Promise.allSettled(
        configuredTokens.map((token) =>
          publicClient.readContract({
            address: resolvedTreasuryAddress,
            abi: fluxSwapTreasuryAbi,
            functionName: 'allowedTokens',
            args: [token.address],
          }),
        ),
      );
      const latestBlock = await publicClient.getBlockNumber();
      const fromBlock = latestBlock > RECENT_BLOCK_WINDOW ? latestBlock - RECENT_BLOCK_WINDOW : ZERO_BIGINT;
      const [poolUpdatedResult, rewardsDistributedResult, spenderApprovedResult, dailyCapResult, pausedResult, unpausedResult] =
        await Promise.allSettled([
          publicClient.getContractEvents({
            address: managerAddress,
            abi: fluxMultiPoolManagerAbi,
            eventName: 'PoolUpdated',
            fromBlock,
            toBlock: latestBlock,
          }),
          publicClient.getContractEvents({
            address: managerAddress,
            abi: fluxMultiPoolManagerAbi,
            eventName: 'RewardsDistributed',
            fromBlock,
            toBlock: latestBlock,
          }),
          publicClient.getContractEvents({
            address: resolvedTreasuryAddress,
            abi: fluxSwapTreasuryAbi,
            eventName: 'SpenderApproved',
            fromBlock,
            toBlock: latestBlock,
          }),
          publicClient.getContractEvents({
            address: resolvedTreasuryAddress,
            abi: fluxSwapTreasuryAbi,
            eventName: 'DailySpendCapUpdated',
            fromBlock,
            toBlock: latestBlock,
          }),
          publicClient.getContractEvents({
            address: resolvedTreasuryAddress,
            abi: fluxSwapTreasuryAbi,
            eventName: 'Paused',
            fromBlock,
            toBlock: latestBlock,
          }),
          publicClient.getContractEvents({
            address: resolvedTreasuryAddress,
            abi: fluxSwapTreasuryAbi,
            eventName: 'Unpaused',
            fromBlock,
            toBlock: latestBlock,
          }),
        ]);
      const farmEvents = [
        ...(poolUpdatedResult.status === 'fulfilled' ? poolUpdatedResult.value : []),
        ...(rewardsDistributedResult.status === 'fulfilled' ? rewardsDistributedResult.value : []),
      ];
      const treasuryEvents = [
        ...(spenderApprovedResult.status === 'fulfilled' ? spenderApprovedResult.value : []),
        ...(dailyCapResult.status === 'fulfilled' ? dailyCapResult.value : []),
        ...(pausedResult.status === 'fulfilled' ? pausedResult.value : []),
        ...(unpausedResult.status === 'fulfilled' ? unpausedResult.value : []),
      ];

      setOverview({
        poolLength: poolCount,
        activePoolCount: poolRows.filter((pool) => pool.active && pool.allocPoint > ZERO_BIGINT).length,
        totalAllocPoint,
        totalPendingRewards,
        undistributedRewards,
        rewardTokenSymbol: rewardTokenMeta.symbol,
        rewardTokenDecimals: rewardTokenMeta.decimals,
        rewardTokenAddress,
        treasuryAddress: resolvedTreasuryAddress,
        treasuryPaused: treasuryPausedResult.status === 'fulfilled' ? treasuryPausedResult.value : false,
        treasuryRewardBalance:
          treasuryRewardBalanceResult.status === 'fulfilled' ? treasuryRewardBalanceResult.value : ZERO_BIGINT,
        treasuryApprovedSpendRemaining:
          treasuryApprovedSpendRemainingResult.status === 'fulfilled'
            ? treasuryApprovedSpendRemainingResult.value
            : ZERO_BIGINT,
        configuredTokenCount: configuredTokens.length,
        allowedTokenCount: allowedTokenResults.filter((result) => result.status === 'fulfilled' && result.value).length,
        recentFarmEvents: farmEvents.length,
        recentTreasuryEvents: treasuryEvents.length,
        farmWeightSlices: poolRows.sort((left, right) => {
          if (left.allocPoint === right.allocPoint) {
            return left.label.localeCompare(right.label);
          }

          return left.allocPoint > right.allocPoint ? -1 : 1;
        }),
        operationBuckets: buildOperationBuckets({
          latestBlock,
          fromBlock,
          farmEvents,
          treasuryEvents,
        }),
      });
      setLastUpdatedAt(new Date());
    } catch (loadError) {
      setError(formatErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [configuredTokens, managerAddress, publicClient, readTokenMeta, supportedChain, treasuryAddress]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadOverview();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadOverview]);

  const healthScore = useMemo(() => getHealthScore(overview), [overview]);
  const healthTone = useMemo(() => getToneByScore(healthScore), [healthScore]);
  const nodes = useMemo<ProtocolNode[]>(() => {
    const rewardToken = overview?.rewardTokenSymbol ?? 'FLUX';
    const rewardDecimals = overview?.rewardTokenDecimals ?? 18;

    return [
      {
        label: '农场',
        value: `${overview?.activePoolCount ?? 0}/${overview?.poolLength ?? 0}`,
        detail: `总权重 ${overview?.totalAllocPoint.toString() ?? '0'}`,
        tone: overview && overview.activePoolCount > 0 && overview.totalAllocPoint > ZERO_BIGINT ? 'success' : 'warning',
        href: '/farm',
        icon: <Sprout size={16} />,
      },
      {
        label: '奖励',
        value: `${formatBigIntAmountDown(overview?.totalPendingRewards, rewardDecimals, 3)} ${rewardToken}`,
        detail: `未分配 ${formatBigIntAmountDown(overview?.undistributedRewards, rewardDecimals, 3)}`,
        tone: overview && overview.treasuryApprovedSpendRemaining > ZERO_BIGINT ? 'success' : 'warning',
        href: '/farm',
        icon: <Activity size={16} />,
      },
      {
        label: '金库',
        value: overview?.treasuryPaused ? '已暂停' : '正常',
        detail: `余额 ${formatBigIntAmountDown(overview?.treasuryRewardBalance, rewardDecimals, 3)} ${rewardToken}`,
        tone: overview?.treasuryPaused ? 'danger' : 'success',
        href: '/treasury',
        icon: <Vault size={16} />,
      },
      {
        label: '代币',
        value: `${overview?.allowedTokenCount ?? 0}/${overview?.configuredTokenCount ?? 0}`,
        detail: '白名单覆盖',
        tone:
          overview && overview.allowedTokenCount >= overview.configuredTokenCount && overview.configuredTokenCount > 0
            ? 'success'
            : 'warning',
        href: '/tokens',
        icon: <Coins size={16} />,
      },
      {
        label: '操作',
        value: `${(overview?.recentFarmEvents ?? 0) + (overview?.recentTreasuryEvents ?? 0)}`,
        detail: '最近 20,000 区块',
        tone: (overview?.recentFarmEvents ?? 0) + (overview?.recentTreasuryEvents ?? 0) > 0 ? 'success' : 'neutral',
        href: '/logs',
        icon: <ScrollText size={16} />,
      },
    ];
  }, [overview]);
  const actionItems = useMemo<ActionItem[]>(() => {
    if (!overview) {
      return [
        {
          title: '正在读取链上状态',
          detail: '连接 RPC 后会生成协议图谱和待处理事项。',
          tone: 'neutral',
        },
      ];
    }

    const items: ActionItem[] = [];

    if (overview.activePoolCount === 0) {
      items.push({
        title: '暂无启用农场',
        detail: '先创建并启用质押池，奖励分发才有目标。',
        tone: 'warning',
      });
    }
    if (overview.treasuryPaused) {
      items.push({
        title: '金库处于暂停状态',
        detail: '暂停状态下不能正常拉取奖励。',
        tone: 'danger',
      });
    }
    if (overview.treasuryRewardBalance <= ZERO_BIGINT) {
      items.push({
        title: '金库奖励余额为 0',
        detail: `需要补充 ${overview.rewardTokenSymbol} 后再分发。`,
        tone: 'warning',
      });
    }
    if (overview.treasuryApprovedSpendRemaining <= ZERO_BIGINT) {
      items.push({
        title: 'MultiPoolManager 授权不足',
        detail: '金库需要给管理合约配置可拉取额度。',
        tone: 'warning',
      });
    }
    if (overview.allowedTokenCount < overview.configuredTokenCount) {
      items.push({
        title: '代币白名单未完全覆盖',
        detail: '配置代币中仍有未加入 Treasury 白名单的资产。',
        tone: 'warning',
      });
    }

    if (items.length === 0) {
      items.push({
        title: '当前没有明显待处理事项',
        detail: '农场、奖励、金库和白名单状态看起来都正常。',
        tone: 'success',
      });
    }

    return items;
  }, [overview]);

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-slate-950 p-6 text-white shadow-sm md:p-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Overview</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">协议状态图谱</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              这里作为管理端首页，用图谱方式汇总农场、奖励、金库、代币白名单和最近操作，方便先判断整体状态，再进入具体页面处理。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
              <p className="text-xs text-slate-400">最近刷新</p>
              <p className="mt-1 font-mono text-sm text-white">{formatRefreshTime(lastUpdatedAt)}</p>
            </div>
            <button
              type="button"
              onClick={() => void loadOverview()}
              disabled={loading}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-100 disabled:bg-slate-700 disabled:text-slate-400"
            >
              {loading ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              刷新
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle size={18} />
          {error}
        </div>
      ) : null}

      <Card className="p-5">
        <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">整体状态图谱</h2>
            <p className="mt-1 text-sm text-slate-500">按奖励流、授权流和农场分发关系展示整体状态。</p>
          </div>
          <div
            className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 md:w-52 ${
              healthTone === 'danger'
                ? 'border-rose-200 bg-rose-50'
                : healthTone === 'warning'
                  ? 'border-amber-200 bg-amber-50'
                  : 'border-emerald-200 bg-emerald-50'
            }`}
          >
            <span className="text-sm font-semibold text-slate-600">健康度</span>
            <span
              className={`text-3xl font-semibold ${
                healthTone === 'danger'
                  ? 'text-rose-700'
                  : healthTone === 'warning'
                    ? 'text-amber-700'
                    : 'text-emerald-700'
              }`}
            >
              {healthScore}
            </span>
          </div>
        </div>
        {loading && !overview ? (
          <div className="flex min-h-[520px] items-center justify-center rounded-2xl bg-slate-50 text-sm text-slate-500">
            <LoaderCircle size={18} className="mr-2 animate-spin" />
            正在生成协议状态图谱
          </div>
        ) : (
          <ProtocolMap nodes={nodes} tone={healthTone} />
        )}
      </Card>

      <Card className="p-5">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div className="flex items-center gap-3">
            <span className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl ${getToneClasses(healthTone).soft} ${getToneClasses(healthTone).text}`}>
              <ShieldCheck size={20} />
            </span>
            <div>
              <h2 className="font-semibold text-slate-950">待处理事项</h2>
              <p className="text-sm text-slate-500">按当前链上状态自动生成，优先处理异常和授权问题。</p>
            </div>
          </div>
          <StatusPill tone={actionItems.some((item) => item.tone === 'danger') ? 'danger' : actionItems.some((item) => item.tone === 'warning') ? 'warning' : 'success'}>
            {actionItems.length} 项
          </StatusPill>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {actionItems.map((item) => {
            const toneClasses = getToneClasses(item.tone);

            return (
              <div key={item.title} className={`rounded-2xl border ${toneClasses.border} ${toneClasses.bg} p-4`}>
                <div className="flex items-start gap-3">
                  <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: toneClasses.stroke }} />
                  <div>
                    <p className={`font-semibold ${toneClasses.text}`}>{item.title}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{item.detail}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">奖励容量</h2>
              <p className="mt-1 text-sm text-slate-500">用同心环对比金库余额、授权额度和待分发奖励。</p>
            </div>
            <StatusPill tone={overview && overview.treasuryApprovedSpendRemaining > ZERO_BIGINT ? 'success' : 'warning'}>
              {overview?.rewardTokenSymbol ?? 'FLUX'}
            </StatusPill>
          </div>
          <RewardCapacityRings overview={overview} />
        </Card>

        <Card className="p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">农场权重</h2>
              <p className="mt-1 text-sm text-slate-500">按奖励权重展示农场之间的分配比例。</p>
            </div>
            <StatusPill tone={overview && overview.activePoolCount > 0 ? 'success' : 'neutral'}>
              {overview?.activePoolCount ?? 0} 个启用
            </StatusPill>
          </div>
          <FarmWeightDonut overview={overview} />
        </Card>
      </div>

      <Card className="p-5">
        <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">管理事件频率</h2>
          </div>
          <StatusPill tone={(overview?.recentFarmEvents ?? 0) + (overview?.recentTreasuryEvents ?? 0) > 0 ? 'success' : 'neutral'}>
            {(overview?.recentFarmEvents ?? 0) + (overview?.recentTreasuryEvents ?? 0)} 条事件
          </StatusPill>
        </div>
        <OperationHeatmap overview={overview} />
      </Card>
    </div>
  );
}
