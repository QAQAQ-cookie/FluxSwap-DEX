'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownUp,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Clock3,
  Coins,
  Droplets,
  History,
  Layers3,
  ListOrdered,
  ShieldCheck,
  WalletCards,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAccount, useBalance, useChainId, usePublicClient } from 'wagmi';

import { getContractAddress, isFluxSupportedChain } from '@/config/contracts';
import { getSwapTokenOptions, type SwapTokenOption } from '@/config/tokens';
import { formatBigIntAmount, formatBigIntAmountDown, formatDisplayAmount } from '@/lib/amounts';
import { fluxSwapPairAbi } from '@/lib/contracts';
import { fluxSwapErc20Abi } from '@/lib/contracts/generated/FluxSwapERC20';
import {
  LOCAL_LIMIT_ORDERS_UPDATED_EVENT,
  listLocalLimitOrders,
  syncLocalLimitOrdersWithChain,
  type LocalLimitOrderRecord,
} from '@/lib/localLimitOrders';
import { getPools, type PoolViewModel } from '@/lib/subgraph/pools';
import { getTrades, type TradeViewModel } from '@/lib/subgraph/trades';
import { formatTimestamp, truncateAddress } from '@/lib/wallet';

function SummaryBlock({
  title,
  value,
  suffix,
  icon: Icon,
}: {
  title: string;
  value: string;
  suffix: string;
  icon: typeof Coins;
}) {
  return (
    <div className="px-2 py-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-500 dark:text-gray-400">
        <Icon size={16} />
        <span>{title}</span>
      </div>

      <div className="mt-4 flex items-end gap-2">
        <div className="text-4xl font-black tracking-tight text-gray-900 dark:text-white">
          {value}
        </div>
        <div className="pb-1 text-sm font-semibold text-gray-500 dark:text-gray-400">
          {suffix}
        </div>
      </div>
    </div>
  );
}

function FluxSwapLogo() {
  return (
    <div className="relative flex h-20 w-20 items-center justify-center rounded-[1.75rem] border border-sky-100/90 bg-white/80 shadow-[0_16px_36px_rgba(56,189,248,0.10)] backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.05]">
      <span className="absolute h-12 w-12 rounded-full border border-sky-200/90 dark:border-sky-400/20" />
      <span className="absolute h-8 w-14 rounded-[999px] border border-emerald-200/90 dark:border-emerald-400/20" />
      <span className="absolute h-px w-12 bg-gradient-to-r from-transparent via-sky-300/80 to-transparent dark:via-sky-400/30" />
      <span className="absolute w-px h-12 bg-gradient-to-b from-transparent via-sky-300/80 to-transparent dark:via-sky-400/30" />
      <span className="absolute left-[22px] top-[24px] h-2.5 w-2.5 rounded-full bg-sky-300/80 dark:bg-sky-300/60" />
      <span className="absolute right-[20px] bottom-[22px] h-2.5 w-2.5 rounded-full bg-emerald-300/80 dark:bg-emerald-300/60" />
      <span className="absolute h-6 w-6 rounded-full bg-gradient-to-br from-sky-400 via-cyan-400 to-emerald-300 shadow-[0_0_22px_rgba(34,211,238,0.30)]" />
      <span className="relative text-[10px] font-black tracking-[0.24em] text-slate-500 dark:text-slate-300">
        FS
      </span>
    </div>
  );
}

function DividerPattern() {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center px-2">
      <div className="relative h-28 w-32">
        <span className="absolute left-1/2 top-1/2 h-28 w-px -translate-x-1/2 -translate-y-1/2 bg-gradient-to-b from-transparent via-sky-200/70 to-transparent dark:via-sky-400/30" />
        <span className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-sky-100/90 dark:border-sky-400/10" />
        <span className="absolute left-1/2 top-1/2 h-12 w-28 -translate-x-1/2 -translate-y-1/2 rounded-[999px] border border-emerald-100/90 dark:border-emerald-400/10" />
        <span className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-100/70 blur-md dark:bg-sky-400/10" />
        <span className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-sky-400 via-cyan-400 to-emerald-300 shadow-[0_0_22px_rgba(34,211,238,0.28)]" />
        <span className="absolute left-[26px] top-[36px] h-2.5 w-2.5 rounded-full bg-sky-300/75 shadow-[0_0_12px_rgba(125,211,252,0.28)] dark:bg-sky-300/55" />
        <span className="absolute right-[24px] bottom-[34px] h-2.5 w-2.5 rounded-full bg-emerald-300/75 shadow-[0_0_12px_rgba(110,231,183,0.28)] dark:bg-emerald-300/55" />
      </div>
    </div>
  );
}

function PortfolioSection({
  title,
  description,
  icon: Icon,
  emptyContent,
  contentClassName,
  children,
}: {
  title: string;
  description: string;
  icon: typeof ListOrdered;
  emptyContent?: React.ReactNode;
  contentClassName?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="flex min-h-[360px] flex-col rounded-[2rem] border border-black/5 bg-white/72 p-6 shadow-xl shadow-sky-500/5 backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 text-gray-700 dark:bg-white/[0.05] dark:text-gray-200">
          <Icon size={18} />
        </div>
        <div>
          <div className="text-lg font-black tracking-tight text-gray-900 dark:text-white">
            {title}
          </div>
          <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {description}
          </div>
        </div>
      </div>

      <div
        className={
          contentClassName ??
          'mt-6 flex flex-1 items-center justify-center rounded-[1.5rem] border border-dashed border-black/10 bg-gray-50/80 px-5 py-20 text-center dark:border-white/10 dark:bg-white/[0.03]'
        }
      >
        {children ?? emptyContent ?? (
          <div className="text-sm text-gray-400 dark:text-gray-500">--</div>
        )}
      </div>
    </section>
  );
}

type WalletActivityRow = {
  id: string;
  txHash: string;
  walletAddress: string;
  activityLabel: string;
  pairLabel: string;
  primaryLabel: string;
  secondaryLabel: string;
  timeLabel: string;
  isLiquidity: boolean;
};

type WalletTokenRow = {
  symbol: string;
  name: string;
  amountLabel: string;
  rawAmount: bigint;
};

type LimitOrderTokenMeta = {
  symbol: string;
  name: string;
  decimals: number;
};

type LimitOrderDisplayRow = {
  order: LocalLimitOrderRecord;
  pairLabel: string;
  compactAmountLabel: string;
  paySymbol: string;
  receiveSymbol: string;
  payAmountLabel: string;
  receiveAmountLabel: string;
  priceLabel: string;
  statusLabel: string;
  createdAtLabel: string;
  expiryLabel: string;
  recipientLabel: string;
};

type TokenSortDirection = 'desc' | 'asc';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ZERO_BIGINT = BigInt(0);

function getTransactionHref(chainId: number | undefined, txHash: string): string | undefined {
  if (!txHash) {
    return undefined;
  }

  if (chainId === 11155111) {
    return `https://sepolia.etherscan.io/tx/${txHash}`;
  }

  return undefined;
}

function normalizeTokenSymbol(symbol: string, tokenAddress: string, wrappedNativeAddress?: string) {
  if (wrappedNativeAddress && tokenAddress.toLowerCase() === wrappedNativeAddress.toLowerCase()) {
    return 'ETH';
  }

  return symbol.toUpperCase();
}

function ActivityIcon({
  isLiquidity,
}: {
  isLiquidity: boolean;
}) {
  return (
    <span
      className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${
        isLiquidity
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
          : 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300'
      }`}
    >
      {isLiquidity ? <Droplets size={18} /> : <ArrowDownUp size={18} />}
    </span>
  );
}

function LimitOrderField({
  label,
  value,
  className,
  valueClassName,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={`min-w-0 ${className ?? ''}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div className={`mt-1.5 break-all text-sm font-semibold leading-5 text-gray-900 dark:text-white ${valueClassName ?? ''}`}>
        {value}
      </div>
    </div>
  );
}

function LimitOrderExpandedDetails({
  row,
  isZh,
}: {
  row: LimitOrderDisplayRow;
  isZh: boolean;
}) {
  return (
    <div className="grid gap-x-8 gap-y-5 pt-1 sm:grid-cols-2 xl:mx-6 xl:grid-cols-8">
      <div className="text-base font-black tracking-tight text-gray-900 dark:text-white sm:col-span-2 xl:col-span-4">
        {isZh ? '订单详情' : 'Order Details'}
      </div>
      <div className="hidden xl:block xl:col-span-4" />

      <LimitOrderField
        label={isZh ? '订单哈希' : 'Order Hash'}
        value={row.order.orderHash}
        className="xl:col-span-4"
        valueClassName="font-mono text-[13px]"
      />
      <LimitOrderField
        label={isZh ? '接收地址' : 'Recipient'}
        value={row.order.recipient}
        className="xl:col-span-4"
        valueClassName="font-mono text-[13px]"
      />

      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:col-span-4">
        <LimitOrderField label={isZh ? '交易对' : 'Pair'} value={row.pairLabel} />
        <LimitOrderField label={isZh ? '卖出数量' : 'Sell Amount'} value={row.payAmountLabel} />
        <LimitOrderField label={isZh ? '限价值' : 'Limit Price'} value={row.priceLabel} />
        <LimitOrderField label={isZh ? '创建时间' : 'Created At'} value={row.createdAtLabel} />
      </div>

      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:col-span-4">
        <LimitOrderField label={isZh ? '状态' : 'Status'} value={row.statusLabel} />
        <LimitOrderField label={isZh ? '最少买入' : 'Minimum Buy'} value={row.receiveAmountLabel} />
        <LimitOrderField label={isZh ? '有效期' : 'Expiry'} value={row.expiryLabel} />
        <LimitOrderField
          label={isZh ? '执行奖励上限' : 'Executor Reward Cap'}
          value={`${row.order.maxExecutorRewardBps} bps`}
        />
      </div>
    </div>
  );
}

function toggleWithKeyboard(event: React.KeyboardEvent<HTMLElement>, onToggle: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    onToggle();
  }
}

function parseOptionalBigInt(value: string): bigint | undefined {
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

function formatIsoDateTime(value: string | undefined, locale: string) {
  if (!value) {
    return '--';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function splitDateTimeLabel(label: string) {
  if (!label || label === '--') {
    return { date: '--', time: '' };
  }

  const normalized = label.replace(',', '').trim();
  const match = normalized.match(/^(.*?)(\d{1,2}:\d{2}:\d{2}(?:\s?[AP]M)?)$/i);
  if (match) {
    return {
      date: match[1].trim(),
      time: match[2].trim(),
    };
  }

  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return {
      date: parts.slice(0, -1).join(' '),
      time: parts[parts.length - 1],
    };
  }

  return { date: normalized, time: '' };
}

function getLimitOrderStatusLabel(status: string, isZh: boolean) {
  switch (status.trim().toLowerCase()) {
    case 'open':
      return isZh ? '待执行' : 'Open';
    case 'pending_execute':
      return isZh ? '执行中' : 'Pending';
    case 'executed':
      return isZh ? '已执行' : 'Executed';
    case 'pending_cancel':
      return isZh ? '撤单中' : 'Cancelling';
    case 'cancelled':
      return isZh ? '已撤单' : 'Cancelled';
    case 'expired':
      return isZh ? '已过期' : 'Expired';
    default:
      return status || '--';
  }
}


function getLimitOrderStatusBadgeClass(status: string) {
  switch (status.trim().toLowerCase()) {
    case 'executed':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300';
    case 'cancelled':
    case 'expired':
      return 'bg-gray-100 text-gray-700 dark:bg-white/[0.06] dark:text-gray-300';
    case 'pending_execute':
    case 'pending_cancel':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300';
    default:
      return 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300';
  }
}

function canCancelLimitOrder(status: string) {
  return status.trim().toLowerCase() === 'open';
}

function resolveLimitOrderTokenMeta(
  tokenAddress: string,
  tokenLookup: Map<string, SwapTokenOption>,
  wrappedNativeAddress?: string,
): LimitOrderTokenMeta {
  const normalizedAddress = tokenAddress.trim().toLowerCase();

  if (
    normalizedAddress === ZERO_ADDRESS ||
    (wrappedNativeAddress && normalizedAddress === wrappedNativeAddress.toLowerCase())
  ) {
    return {
      symbol: 'ETH',
      name: 'Ether',
      decimals: 18,
    };
  }

  const matchedToken = tokenLookup.get(normalizedAddress);
  if (matchedToken) {
    return {
      symbol: matchedToken.symbol,
      name: matchedToken.name,
      decimals: matchedToken.decimals,
    };
  }

  return {
    symbol: truncateAddress(tokenAddress, 6, 4),
    name: truncateAddress(tokenAddress, 6, 4),
    decimals: 18,
  };
}

function buildWalletActivityRow(
  trade: TradeViewModel,
  walletAddress: string | undefined,
  wrappedNativeAddress?: string,
  isZh?: boolean,
): WalletActivityRow {
  const token0Symbol = normalizeTokenSymbol(
    trade.pair.token0.symbol,
    trade.pair.token0.id,
    wrappedNativeAddress,
  );
  const token1Symbol = normalizeTokenSymbol(
    trade.pair.token1.symbol,
    trade.pair.token1.id,
    wrappedNativeAddress,
  );
  const pairLabel = `${token0Symbol} / ${token1Symbol}`;
  const timeLabel = formatTimestamp(trade.timestamp, isZh ? 'zh-CN' : 'en-US');

  if (trade.type === 'swap') {
    const zero = BigInt(0);
    const soldToken =
      trade.amount0In > zero
        ? {
            symbol: token0Symbol,
            amount: trade.amount0In,
            decimals: trade.pair.token0.decimals,
          }
        : {
            symbol: token1Symbol,
            amount: trade.amount1In,
            decimals: trade.pair.token1.decimals,
          };

    const boughtToken =
      trade.amount0Out > zero
        ? {
            symbol: token0Symbol,
            amount: trade.amount0Out,
            decimals: trade.pair.token0.decimals,
          }
        : {
            symbol: token1Symbol,
            amount: trade.amount1Out,
            decimals: trade.pair.token1.decimals,
          };

    return {
      id: trade.id,
      txHash: trade.txHash,
      walletAddress: (walletAddress ?? trade.sender).toLowerCase(),
      activityLabel: isZh ? '交换' : 'Swap',
      pairLabel: `${soldToken.symbol} -> ${boughtToken.symbol}`,
      primaryLabel: `${formatBigIntAmountDown(soldToken.amount, soldToken.decimals, 6)} ${soldToken.symbol}`,
      secondaryLabel: `${formatBigIntAmountDown(boughtToken.amount, boughtToken.decimals, 6)} ${boughtToken.symbol}`,
      timeLabel,
      isLiquidity: false,
    };
  }

  if (trade.type === 'add') {
    return {
      id: trade.id,
      txHash: trade.txHash,
      walletAddress: (walletAddress ?? trade.sender).toLowerCase(),
      activityLabel: isZh ? '添加流动性' : 'Add liquidity',
      pairLabel,
      primaryLabel: `${formatBigIntAmountDown(trade.amount0, trade.pair.token0.decimals, 6)} ${token0Symbol}`,
      secondaryLabel: `${formatBigIntAmountDown(trade.amount1, trade.pair.token1.decimals, 6)} ${token1Symbol}`,
      timeLabel,
      isLiquidity: true,
    };
  }

  return {
    id: trade.id,
    txHash: trade.txHash,
    walletAddress: (walletAddress ?? trade.sender).toLowerCase(),
    activityLabel: isZh ? '移除流动性' : 'Remove liquidity',
    pairLabel,
    primaryLabel: `${formatBigIntAmountDown(trade.amount0, trade.pair.token0.decimals, 6)} ${token0Symbol}`,
    secondaryLabel: `${formatBigIntAmountDown(trade.amount1, trade.pair.token1.decimals, 6)} ${token1Symbol}`,
    timeLabel,
    isLiquidity: true,
  };
}

export default function PortfolioPage() {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });
  const { address, isConnected } = useAccount();

  const supportedChain = isFluxSupportedChain(chainId);
  const fluxTokenAddress = getContractAddress('FluxToken', chainId);
  const wrappedNativeAddress = getContractAddress('MockWETH', chainId);
  const limitSettlementAddress = getContractAddress('FluxSignedOrderSettlement', chainId);
  const trackedTokens = useMemo(() => getSwapTokenOptions(chainId), [chainId]);
  const [pairs, setPairs] = useState<PoolViewModel[]>([]);
  const [lpBalances, setLpBalances] = useState<Record<string, bigint>>({});
  const [trades, setTrades] = useState<TradeViewModel[]>([]);
  const [walletByTxHash, setWalletByTxHash] = useState<Record<string, string>>({});
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [tokenBalances, setTokenBalances] = useState<Record<string, bigint>>({});
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenSortDirection, setTokenSortDirection] = useState<TokenSortDirection>('desc');
  const [limitOrdersLoading, setLimitOrdersLoading] = useState(false);
  const [walletLimitOrders, setWalletLimitOrders] = useState<LocalLimitOrderRecord[]>([]);
  const [isLimitOrdersModalOpen, setIsLimitOrdersModalOpen] = useState(false);
  const [expandedLimitOrderHash, setExpandedLimitOrderHash] = useState<string | null>(null);

  const { data: nativeBalance } = useBalance({
    address,
    chainId,
    query: {
      enabled: !!address && isConnected,
      refetchInterval: 8000,
    },
  });

  const { data: fluxBalance } = useBalance({
    address,
    chainId,
    token: fluxTokenAddress,
    query: {
      enabled: !!address && !!fluxTokenAddress && isConnected,
      refetchInterval: 8000,
    },
  });

  useEffect(() => {
    if (!supportedChain) {
      setPairs([]);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const nextPairs = await getPools();
        if (!cancelled) {
          setPairs(nextPairs);
        }
      } catch {
        if (!cancelled) {
          setPairs([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supportedChain]);

  useEffect(() => {
    if (!supportedChain) {
      setTrades([]);
      setWalletByTxHash({});
      setActivityLoading(false);
      setActivityError(null);
      return;
    }

    let cancelled = false;
    setActivityLoading(true);
    setActivityError(null);

    (async () => {
      try {
        const nextTrades = await getTrades(120);
        if (!cancelled) {
          setTrades(nextTrades);
          setWalletByTxHash({});
        }
      } catch (error) {
        if (!cancelled) {
          setTrades([]);
          setWalletByTxHash({});
          setActivityError(
            error instanceof Error ? error.message : 'Failed to load wallet activity',
          );
        }
      } finally {
        if (!cancelled) {
          setActivityLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supportedChain]);

  useEffect(() => {
    if (!publicClient || !isConnected || !address || pairs.length === 0) {
      setLpBalances({});
      return;
    }

    let cancelled = false;

    Promise.all(
      pairs.map(async (pair) => {
        const balance = await publicClient.readContract({
          address: pair.id,
          abi: fluxSwapPairAbi,
          functionName: 'balanceOf',
          args: [address],
        });

        return [pair.id.toLowerCase(), balance] as const;
      }),
    )
      .then((entries) => {
        if (!cancelled) {
          setLpBalances(Object.fromEntries(entries));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLpBalances({});
        }
      });

    return () => {
      cancelled = true;
    };
  }, [address, isConnected, pairs, publicClient]);

  useEffect(() => {
    if (!publicClient || !isConnected || !address) {
      setTokenBalances({});
      setTokenLoading(false);
      setTokenError(null);
      return;
    }

    const erc20Tokens = trackedTokens.filter((token) => token.kind === 'erc20' && token.address);

    if (erc20Tokens.length === 0) {
      setTokenBalances({});
      setTokenLoading(false);
      setTokenError(null);
      return;
    }

    let cancelled = false;
    setTokenLoading(true);
    setTokenError(null);

    Promise.all(
      erc20Tokens.map(async (token) => {
        const balance = await publicClient.readContract({
          address: token.address!,
          abi: fluxSwapErc20Abi,
          functionName: 'balanceOf',
          args: [address],
        });

        return [token.symbol, balance] as const;
      }),
    )
      .then((entries) => {
        if (!cancelled) {
          setTokenBalances(Object.fromEntries(entries));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setTokenBalances({});
          setTokenError(error instanceof Error ? error.message : 'Failed to load token balances');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setTokenLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [address, isConnected, publicClient, trackedTokens]);

  useEffect(() => {
    if (!supportedChain || !isConnected || !address) {
      setLimitOrdersLoading(false);
      setWalletLimitOrders([]);
      setIsLimitOrdersModalOpen(false);
      return;
    }

    let cancelled = false;

    const loadLimitOrders = async () => {
      if (cancelled) {
        return;
      }

      setLimitOrdersLoading(true);

      if (publicClient) {
        try {
          await syncLocalLimitOrdersWithChain({
            publicClient,
            chainId,
          });
        } catch {
          // Ignore sync failures and fall back to current local cache.
        }
      }

      const normalizedWallet = address.toLowerCase();
      const normalizedSettlement = limitSettlementAddress?.toLowerCase();
      const nextOrders = listLocalLimitOrders()
        .filter((order) => {
          if (order.chainId !== chainId) {
            return false;
          }
          if (order.maker.toLowerCase() !== normalizedWallet) {
            return false;
          }
          if (normalizedSettlement && order.settlementAddress.toLowerCase() !== normalizedSettlement) {
            return false;
          }
          return true;
        })
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

      if (!cancelled) {
        setWalletLimitOrders(nextOrders);
        setLimitOrdersLoading(false);
      }
    };

    void loadLimitOrders();

    const handleLimitOrdersUpdated = () => {
      void loadLimitOrders();
    };

    window.addEventListener('storage', handleLimitOrdersUpdated);
    window.addEventListener(
      LOCAL_LIMIT_ORDERS_UPDATED_EVENT,
      handleLimitOrdersUpdated as EventListener,
    );

    return () => {
      cancelled = true;
      window.removeEventListener('storage', handleLimitOrdersUpdated);
      window.removeEventListener(
        LOCAL_LIMIT_ORDERS_UPDATED_EVENT,
        handleLimitOrdersUpdated as EventListener,
      );
    };
  }, [address, chainId, isConnected, limitSettlementAddress, publicClient, supportedChain]);

  useEffect(() => {
    if (!publicClient || trades.length === 0) {
      setWalletByTxHash({});
      return;
    }

    let cancelled = false;

    Promise.all(
      trades.map(async (trade) => {
        try {
          const transaction = await publicClient.getTransaction({
            hash: trade.txHash as `0x${string}`,
          });

          return [trade.txHash.toLowerCase(), transaction.from] as const;
        } catch {
          return [trade.txHash.toLowerCase(), trade.sender] as const;
        }
      }),
    ).then((entries) => {
      if (!cancelled) {
        setWalletByTxHash(Object.fromEntries(entries));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [publicClient, trades]);

  const totalLpBalance = useMemo(
    () => Object.values(lpBalances).reduce((sum, balance) => sum + balance, ZERO_BIGINT),
    [lpBalances],
  );
  const activePositionCount = useMemo(
    () => Object.values(lpBalances).filter((balance) => balance > ZERO_BIGINT).length,
    [lpBalances],
  );

  const fluxDisplay = isConnected
    ? formatDisplayAmount(fluxBalance?.formatted)
    : '--';

  const lpDisplay = isConnected
    ? formatBigIntAmount(totalLpBalance, 18, 4)
    : '--';
  const showLpHint = isConnected && totalLpBalance > ZERO_BIGINT;
  const walletActivityRows = useMemo(() => {
    return trades.map((trade) =>
      buildWalletActivityRow(
        trade,
        walletByTxHash[trade.txHash.toLowerCase()],
        wrappedNativeAddress,
        isZh,
      ),
    );
  }, [trades, walletByTxHash, wrappedNativeAddress, isZh]);
  const connectedWalletActivity = useMemo(() => {
    if (!address) {
      return [];
    }

    const normalizedAddress = address.toLowerCase();
    return walletActivityRows.filter((trade) => trade.walletAddress === normalizedAddress);
  }, [address, walletActivityRows]);
  const walletTokens = useMemo<WalletTokenRow[]>(() => {
    const rows: WalletTokenRow[] = [];

    const nativeRawAmount = nativeBalance?.value ?? ZERO_BIGINT;
    if (nativeRawAmount > ZERO_BIGINT) {
      rows.push({
        symbol: 'ETH',
        name: 'Ether',
        amountLabel: formatBigIntAmount(nativeRawAmount, 18, 6),
        rawAmount: nativeRawAmount,
      });
    }

    trackedTokens
      .filter((token) => token.kind === 'erc20')
      .forEach((token) => {
        const rawAmount = tokenBalances[token.symbol] ?? ZERO_BIGINT;
        if (rawAmount <= ZERO_BIGINT) {
          return;
        }

        rows.push({
          symbol: token.symbol,
          name: token.name,
          amountLabel: formatBigIntAmount(rawAmount, token.decimals, 6),
          rawAmount,
        });
      });

    return rows.sort((left, right) => {
      if (left.rawAmount === right.rawAmount) {
        return left.symbol.localeCompare(right.symbol);
      }

      if (tokenSortDirection === 'desc') {
        return left.rawAmount > right.rawAmount ? -1 : 1;
      }

      return left.rawAmount > right.rawAmount ? 1 : -1;
    });
  }, [nativeBalance?.value, tokenBalances, tokenSortDirection, trackedTokens]);
  const tokenLookup = useMemo(() => {
    const nextLookup = new Map<string, SwapTokenOption>();

    trackedTokens.forEach((token) => {
      if (token.address) {
        nextLookup.set(token.address.toLowerCase(), token);
      }
      nextLookup.set(token.routeAddress.toLowerCase(), token);
    });

    return nextLookup;
  }, [trackedTokens]);
  const limitOrderRows = useMemo<LimitOrderDisplayRow[]>(() => {
    const locale = isZh ? 'zh-CN' : 'en-US';

    return walletLimitOrders.map((order) => {
      const inputToken = resolveLimitOrderTokenMeta(
        order.inputToken,
        tokenLookup,
        wrappedNativeAddress,
      );
      const outputToken = resolveLimitOrderTokenMeta(
        order.outputToken,
        tokenLookup,
        wrappedNativeAddress,
      );
      const amountIn = parseOptionalBigInt(order.amountIn);
      const minAmountOut = parseOptionalBigInt(order.minAmountOut);
      const triggerPriceX18 = parseOptionalBigInt(order.triggerPriceX18);

      return {
        order,
        pairLabel: `${inputToken.symbol} / ${outputToken.symbol}`,
        compactAmountLabel: `${formatBigIntAmountDown(amountIn, inputToken.decimals, 6)} / ${formatBigIntAmountDown(minAmountOut, outputToken.decimals, 6)}`,
        paySymbol: inputToken.symbol,
        receiveSymbol: outputToken.symbol,
        payAmountLabel: `${formatBigIntAmountDown(amountIn, inputToken.decimals, 6)} ${inputToken.symbol}`,
        receiveAmountLabel: `${formatBigIntAmountDown(minAmountOut, outputToken.decimals, 6)} ${outputToken.symbol}`,
        priceLabel: `1 ${inputToken.symbol} = ${formatBigIntAmountDown(triggerPriceX18, 18, 8)} ${outputToken.symbol}`,
        statusLabel: getLimitOrderStatusLabel(order.status, isZh),
        createdAtLabel: formatIsoDateTime(order.createdAt, locale),
        expiryLabel: formatIsoDateTime(
          parseOptionalBigInt(order.expiry) ? new Date(Number(order.expiry) * 1000).toISOString() : '',
          locale,
        ),
        recipientLabel: truncateAddress(order.recipient, 8, 6),
      };
    });
  }, [isZh, tokenLookup, walletLimitOrders, wrappedNativeAddress]);

  useEffect(() => {
    if (!isLimitOrdersModalOpen) {
      return;
    }

    if (limitOrderRows.length === 0) {
      setExpandedLimitOrderHash(null);
      return;
    }

    setExpandedLimitOrderHash((current) => {
      if (current && limitOrderRows.some((row) => row.order.orderHash === current)) {
        return current;
      }

      return limitOrderRows[0]?.order.orderHash ?? null;
    });
  }, [isLimitOrdersModalOpen, limitOrderRows]);

  const closeLimitOrdersModal = () => {
    setIsLimitOrdersModalOpen(false);
    setExpandedLimitOrderHash(null);
  };

  const toggleExpandedLimitOrder = (orderHash: string) => {
    setExpandedLimitOrderHash((current) => (current === orderHash ? null : orderHash));
  };

  return (
    <div className="px-4 py-10 lg:px-6">
      <div className="mx-auto max-w-[1500px]">
        <section className="rounded-[2.25rem] border border-black/5 bg-white/78 p-6 shadow-2xl shadow-sky-500/5 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.04] lg:p-7">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-center">
            <div className={`xl:shrink-0 ${isZh ? 'xl:w-[220px]' : 'xl:w-[320px]'}`}>
              <div className="flex items-center gap-4">
                <FluxSwapLogo />
                <div className={isZh ? '' : 'min-w-[180px]'}>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                    {isZh ? '资产概览' : 'Portfolio overview'}
                  </div>
                  <h1
                    className={`mt-2 text-3xl font-black tracking-tight text-gray-900 dark:text-white ${
                      isZh ? '' : 'whitespace-nowrap'
                    }`}
                  >
                    {isZh ? '我的资产' : 'My assets'}
                  </h1>
                </div>
              </div>
            </div>

            <div className="xl:flex-1 xl:-ml-3">
              <div className="mr-[320px] ml-auto grid w-fit items-center gap-2 md:grid-cols-[auto_120px_auto]">
                <SummaryBlock
                  title={isZh ? 'FLUX 余额' : 'FLUX Balance'}
                  value={fluxDisplay}
                  suffix="FLUX"
                  icon={Coins}
                />
                <DividerPattern />
                <div className="px-2 py-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-500 dark:text-gray-400">
                    <Layers3 size={16} />
                    <span>{isZh ? 'LP 余额' : 'LP Balance'}</span>
                    {showLpHint ? (
                      <span className="text-xs font-semibold text-gray-400 dark:text-gray-500">
                        {isZh
                          ? `汇总 ${activePositionCount} 个池子`
                          : `Aggregated across ${activePositionCount} pools`}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 flex items-end gap-2">
                    <div className="text-4xl font-black tracking-tight text-gray-900 dark:text-white">
                      {lpDisplay}
                    </div>
                    <div className="pb-1 text-sm font-semibold text-gray-500 dark:text-gray-400">
                      LP
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-8 grid gap-6 xl:grid-cols-3 [&>section:nth-child(2)]:hidden">
          <PortfolioSection
            title={isZh ? '限价单' : 'Limit Orders'}
            description={
              isZh
                ? '展示当前钱包创建的限价单'
                : 'Orders created by the connected wallet'
            }
            icon={ListOrdered}
            contentClassName="mt-6 flex flex-1 overflow-hidden rounded-[1.5rem] border border-dashed border-black/10 bg-gray-50/80 dark:border-white/10 dark:bg-white/[0.03]"
          >
            {!isConnected || !address ? (
              <div className="flex h-full w-full flex-1 flex-col items-center justify-center px-5 text-center">
                <div className="text-lg font-black tracking-tight text-gray-900 dark:text-white">
                  {isZh ? '连接钱包后查看限价单' : 'Connect wallet to view limit orders'}
                </div>
                <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  {isZh
                    ? '这里会展示当前钱包创建的限价单'
                    : 'Orders created by this wallet will appear here.'}
                </div>
              </div>
            ) : limitOrdersLoading ? (
              <div className="flex h-full w-full flex-1 flex-col items-center justify-center px-5 text-center">
                <div className="text-lg font-black tracking-tight text-gray-900 dark:text-white">
                  {isZh ? '正在加载限价单' : 'Loading limit orders'}
                </div>
              </div>
            ) : limitOrderRows.length > 0 ? (
              <div className="flex h-full min-h-0 flex-col">
                <div className="flex items-center justify-between border-b border-black/5 px-5 py-4 dark:border-white/10">
                  <div>
                    <div className="text-sm font-black tracking-tight text-gray-900 dark:text-white">
                      {isZh ? '当前限价单' : 'Current limit orders'}
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {isZh ? '点击中间列表查看订单详情' : 'Click any order to open details'}
                    </div>
                  </div>
                  <span className="inline-flex min-w-8 items-center justify-center rounded-full bg-sky-100 px-2.5 py-1 text-xs font-bold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                    {limitOrderRows.length}
                  </span>
                </div>

                <div className="flex min-h-0 flex-1 flex-col px-5 pb-5 pt-1">
                  <div className="grid grid-cols-[minmax(0,1.15fr)_118px_92px] items-center gap-x-4 border-b border-black/5 px-3 py-3 text-[13px] font-semibold text-gray-500 dark:border-white/10 dark:text-gray-400">
                    <div className="min-w-0 whitespace-nowrap">{isZh ? '交易对' : 'Pair'}</div>
                    <div className="min-w-0 whitespace-nowrap text-center">{isZh ? '卖出 / 买入' : 'Sell / Buy'}</div>
                    <div className="whitespace-nowrap text-center">{isZh ? '状态' : 'Status'}</div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
                    {limitOrderRows.map((row) => (
                      <button
                        key={row.order.orderHash}
                        type="button"
                        onClick={() => {
                          setExpandedLimitOrderHash(row.order.orderHash);
                          setIsLimitOrdersModalOpen(true);
                        }}
                        className="grid w-full grid-cols-[minmax(0,1.15fr)_118px_92px] items-center gap-x-4 border-b border-black/5 px-3 py-4 text-left transition-colors last:border-b-0 hover:bg-sky-50/70 dark:border-white/10 dark:hover:bg-white/[0.08]"
                      >
                        <div className="min-w-0 truncate pr-2 text-[15px] font-semibold tracking-tight text-gray-900 dark:text-white">
                          {row.pairLabel}
                        </div>
                        <div className="min-w-0 truncate text-center text-[14px] font-medium leading-5 tabular-nums text-gray-800 dark:text-gray-200">
                          {row.compactAmountLabel}
                        </div>
                        <div className="flex justify-center">
                          <span
                            className={`inline-flex min-w-[72px] items-center justify-center rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none ${getLimitOrderStatusBadgeClass(row.order.status)}`}
                          >
                            {row.statusLabel}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full w-full flex-1 flex-col items-center justify-center px-5 text-center">
                <div className="text-lg font-black tracking-tight text-gray-900 dark:text-white">
                  {isZh ? '还没创建限价单' : 'No limit orders yet'}
                </div>
                <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  {isZh
                    ? '先在交易页创建一笔限价单，这里就会显示出来。'
                    : 'Create your first limit order from the trade page.'}
                </div>
                <Link
                  href="/swap?mode=limit"
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
                >
                  <span>{isZh ? '去创建限价单' : 'Create limit order'}</span>
                  <ArrowRight size={16} />
                </Link>
              </div>
            )}
          </PortfolioSection>
          <PortfolioSection
            title={isZh ? '限价单订单' : 'Limit Orders'}
            description={
              isZh
                ? '展示当前用户创建的限价单订单'
                : 'Orders created by the current wallet'
            }
            icon={ListOrdered}
            emptyContent={
              <div className="flex flex-col items-center justify-center">
                <div className="text-lg font-black tracking-tight text-gray-900 dark:text-white">
                  {isZh ? '还没创建限价单' : 'No limit orders yet'}
                </div>
                <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  {isZh
                    ? '去交易页创建你的第一笔限价单。'
                    : 'Create your first limit order from the trade page.'}
                </div>
                <Link
                  href="/swap?mode=limit"
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
                >
                  <span>{isZh ? '去创建限价单' : 'Create limit order'}</span>
                  <ArrowRight size={16} />
                </Link>
              </div>
            }
          />
          <PortfolioSection
            title={isZh ? '我的仓位' : 'Your Positions'}
            description={
              isZh
                ? '展示当前钱包的流动性仓位和持仓概览'
                : 'Liquidity and position overview for the current wallet'
            }
            icon={WalletCards}
            emptyContent={
              <div className="flex flex-col items-center justify-center">
                <div className="text-lg font-black tracking-tight text-gray-900 dark:text-white">
                  {isZh ? '还没有仓位' : 'No positions yet'}
                </div>
                <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  {isZh
                    ? '去流动性页面添加流动性后，这里会显示你的仓位。'
                    : 'Add liquidity from the portfolio page to create your first position.'}
                </div>
                <Link
                  href="/portfolio/liquidity"
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
                >
                  <span>{isZh ? '去添加流动性' : 'Add liquidity'}</span>
                  <ArrowRight size={16} />
                </Link>
              </div>
            }
          />
          <PortfolioSection
            title={isZh ? '我的质押' : 'Your Staking'}
            description={
              isZh
                ? '展示当前钱包的质押余额和奖励状态'
                : 'Staking balances and reward status'
            }
            icon={ShieldCheck}
            emptyContent={
              <div className="flex flex-col items-center justify-center">
                <div className="text-lg font-black tracking-tight text-gray-900 dark:text-white">
                  {isZh ? '还没有质押' : 'No staking yet'}
                </div>
                <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  {isZh
                    ? '去赚币页面查看可用池子并开始质押。'
                    : 'Visit the earn page to view available pools and start staking.'}
                </div>
                <Link
                  href="/earn"
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
                >
                  <span>{isZh ? '查看质押' : 'View staking'}</span>
                  <ArrowRight size={16} />
                </Link>
              </div>
            }
          />
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-2">
          <section className="rounded-[2rem] border border-black/5 bg-white/72 p-6 shadow-xl shadow-sky-500/5 backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.04]">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 text-gray-700 dark:bg-white/[0.05] dark:text-gray-200">
                <History size={18} />
              </div>
              <div>
                <div className="text-lg font-black tracking-tight text-gray-900 dark:text-white">
                  {isZh ? '活动' : 'Activity'}
                </div>
                <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {isZh
                    ? '展示当前连接钱包发起的所有活动记录'
                    : 'All event activity initiated by the connected wallet'}
                </div>
              </div>
            </div>

            <div className="mt-6">
              {!isConnected || !address ? (
                <div className="rounded-[1.5rem] border border-dashed border-black/10 bg-gray-50/80 px-5 py-16 text-center dark:border-white/10 dark:bg-white/[0.03]">
                  <div className="text-lg font-black tracking-tight text-gray-900 dark:text-white">
                    {isZh ? '连接钱包后查看活动' : 'Connect wallet to view activity'}
                  </div>
                  <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    {isZh
                      ? '这里会展示当前钱包的交换、添加流动性和移除流动性记录。'
                      : 'Swap, add liquidity, and remove liquidity events for this wallet will appear here.'}
                  </div>
                </div>
              ) : activityLoading ? (
                <div className="rounded-[1.5rem] border border-dashed border-black/10 bg-gray-50/80 px-5 py-16 text-center dark:border-white/10 dark:bg-white/[0.03]">
                  <div className="text-lg font-black tracking-tight text-gray-900 dark:text-white">
                    {isZh ? '正在加载钱包活动' : 'Loading wallet activity'}
                  </div>
                </div>
              ) : activityError ? (
                <div className="rounded-[1.5rem] border border-dashed border-black/10 bg-gray-50/80 px-5 py-16 text-center dark:border-white/10 dark:bg-white/[0.03]">
                  <div className="text-lg font-black tracking-tight text-gray-900 dark:text-white">
                    {isZh ? '钱包活动加载失败' : 'Failed to load wallet activity'}
                  </div>
                  <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">{activityError}</div>
                </div>
              ) : connectedWalletActivity.length > 0 ? (
                <div className="overflow-hidden rounded-[1.5rem]">
                  <div className="hidden max-h-[560px] overflow-y-auto pr-1 sm:block">
                    <div className="sticky top-0 z-10 grid grid-cols-[1fr_1.55fr_1fr_1fr] items-center gap-3 border-b border-black/5 bg-white/95 px-2 py-3 text-xs font-bold tracking-[0.08em] text-gray-500 backdrop-blur-sm dark:border-white/10 dark:bg-[#0f1726]/95 dark:text-gray-400">
                      <div>{isZh ? '时间' : 'Time'}</div>
                      <div>{isZh ? '类型' : 'Type'}</div>
                      <div>{isZh ? '数量一' : 'Amount 1'}</div>
                      <div>{isZh ? '数量二' : 'Amount 2'}</div>
                    </div>

                    <div className="divide-y divide-black/5 dark:divide-white/10">
                      {connectedWalletActivity.map((trade) => {
                        const transactionHref = getTransactionHref(chainId, trade.txHash);

                        const rowContent = (
                          <>
                            <div className="flex items-center gap-2 text-sm font-semibold text-gray-600 dark:text-gray-300">
                              <Clock3 size={15} />
                              <span>{trade.timeLabel}</span>
                            </div>

                            <div className="flex min-w-0 items-center gap-3">
                              <ActivityIcon isLiquidity={trade.isLiquidity} />
                              <div className="min-w-0">
                                <div className="text-[15px] font-black tracking-tight text-gray-900 dark:text-white">
                                  {trade.activityLabel}
                                </div>
                                <div className="mt-1 text-sm font-medium text-gray-600 dark:text-gray-300">
                                  {trade.pairLabel}
                                </div>
                              </div>
                            </div>

                            <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                              {trade.primaryLabel}
                            </div>

                            <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                              {trade.secondaryLabel}
                            </div>
                          </>
                        );

                        if (!transactionHref) {
                          return (
                            <div
                              key={trade.id}
                              className="grid grid-cols-[1fr_1.55fr_1fr_1fr] items-center gap-3 px-2 py-4 transition-colors hover:bg-sky-50/50 dark:hover:bg-white/[0.05]"
                            >
                              {rowContent}
                            </div>
                          );
                        }

                        return (
                          <a
                            key={trade.id}
                            href={transactionHref}
                            target="_blank"
                            rel="noreferrer"
                            className="grid grid-cols-[1fr_1.55fr_1fr_1fr] items-center gap-3 px-2 py-4 transition-colors hover:bg-sky-50/50 dark:hover:bg-white/[0.05]"
                          >
                            {rowContent}
                          </a>
                        );
                      })}
                    </div>
                  </div>

                  <div className="max-h-[560px] space-y-3 overflow-y-auto pr-1 sm:hidden">
                    {connectedWalletActivity.map((trade) => {
                      const transactionHref = getTransactionHref(chainId, trade.txHash);

                      const mobileContent = (
                        <>
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex min-w-0 items-start gap-3">
                              <ActivityIcon isLiquidity={trade.isLiquidity} />
                              <div className="min-w-0">
                                <div className="text-lg font-black tracking-tight text-gray-900 dark:text-white">
                                  {trade.activityLabel}
                                </div>
                                <div className="mt-1 text-base font-medium text-gray-700 dark:text-gray-300">
                                  {trade.pairLabel}
                                </div>
                              </div>
                            </div>

                            <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                              <Clock3 size={12} />
                              {trade.timeLabel}
                            </span>
                          </div>

                          <div className="mt-4 grid gap-3">
                            <div className="rounded-[1.2rem] bg-gray-100 p-4 dark:bg-white/[0.05]">
                              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                                {isZh ? '数量一' : 'Amount 1'}
                              </div>
                              <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                                {trade.primaryLabel}
                              </div>
                            </div>

                            <div className="rounded-[1.2rem] bg-gray-100 p-4 dark:bg-white/[0.05]">
                              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                                {isZh ? '数量二' : 'Amount 2'}
                              </div>
                              <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                                {trade.secondaryLabel}
                              </div>
                            </div>
                          </div>
                        </>
                      );

                      if (!transactionHref) {
                        return (
                          <div
                            key={trade.id}
                            className="rounded-[1.5rem] border border-black/5 bg-white/70 px-4 py-4 transition-colors hover:bg-sky-50/50 dark:border-white/10 dark:bg-white/[0.02] dark:hover:bg-white/[0.05]"
                          >
                            {mobileContent}
                          </div>
                        );
                      }

                      return (
                        <a
                          key={trade.id}
                          href={transactionHref}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-[1.5rem] border border-black/5 bg-white/70 px-4 py-4 transition-colors hover:bg-sky-50/50 dark:border-white/10 dark:bg-white/[0.02] dark:hover:bg-white/[0.05]"
                        >
                          {mobileContent}
                        </a>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-[1.5rem] border border-dashed border-black/10 bg-gray-50/80 px-5 py-16 text-center dark:border-white/10 dark:bg-white/[0.03]">
                  <div className="text-lg font-black tracking-tight text-gray-900 dark:text-white">
                    {isZh ? '当前钱包还没有活动记录' : 'No wallet activity yet'}
                  </div>
                  <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    {isZh
                      ? '完成一次交换或流动性操作后，这里会显示对应事件。'
                      : 'Your swaps and liquidity events will appear here after you make them.'}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-[2rem] border border-black/5 bg-white/72 p-6 shadow-xl shadow-sky-500/5 backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.04]">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 text-gray-700 dark:bg-white/[0.05] dark:text-gray-200">
                <Coins size={18} />
              </div>
              <div>
                <div className="text-lg font-black tracking-tight text-gray-900 dark:text-white">
                  {isZh ? '代币' : 'Tokens'}
                </div>
                <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {isZh
                    ? '展示当前钱包持有的全部代币'
                    : 'All tokens currently held by the connected wallet'}
                </div>
              </div>
            </div>

            <div className="mt-6">
              {!isConnected || !address ? (
                <div className="rounded-[1.5rem] border border-dashed border-black/10 bg-gray-50/80 px-5 py-16 text-center dark:border-white/10 dark:bg-white/[0.03]">
                  <div className="text-lg font-black tracking-tight text-gray-900 dark:text-white">
                    {isZh ? '连接钱包后查看代币' : 'Connect wallet to view tokens'}
                  </div>
                </div>
              ) : tokenLoading ? (
                <div className="rounded-[1.5rem] border border-dashed border-black/10 bg-gray-50/80 px-5 py-16 text-center dark:border-white/10 dark:bg-white/[0.03]">
                  <div className="text-lg font-black tracking-tight text-gray-900 dark:text-white">
                    {isZh ? '正在加载代币余额' : 'Loading token balances'}
                  </div>
                </div>
              ) : tokenError ? (
                <div className="rounded-[1.5rem] border border-dashed border-black/10 bg-gray-50/80 px-5 py-16 text-center dark:border-white/10 dark:bg-white/[0.03]">
                  <div className="text-lg font-black tracking-tight text-gray-900 dark:text-white">
                    {isZh ? '代币余额加载失败' : 'Failed to load token balances'}
                  </div>
                  <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">{tokenError}</div>
                </div>
              ) : walletTokens.length > 0 ? (
                <div className="overflow-hidden rounded-[1.5rem]">
                  <div className="hidden max-h-[560px] overflow-y-auto pr-1 sm:block">
                    <div className="sticky top-0 z-10 grid grid-cols-[1.2fr_1.6fr_1fr] items-center gap-3 border-b border-black/5 bg-white/95 px-2 py-3 text-xs font-bold tracking-[0.08em] text-gray-500 backdrop-blur-sm dark:border-white/10 dark:bg-[#0f1726]/95 dark:text-gray-400">
                      <div>{isZh ? '代币' : 'Token'}</div>
                      <div>{isZh ? '名称' : 'Name'}</div>
                      <button
                        type="button"
                        onClick={() =>
                          setTokenSortDirection((current) => (current === 'desc' ? 'asc' : 'desc'))
                        }
                        className="inline-flex items-center gap-1 text-left text-xs font-bold tracking-[0.08em] text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      >
                        <span>{isZh ? '余额' : 'Balance'}</span>
                        <ArrowDownUp size={13} className="shrink-0" />
                      </button>
                    </div>

                    <div className="divide-y divide-black/5 dark:divide-white/10">
                      {walletTokens.map((token) => (
                        <div
                          key={token.symbol}
                          className="grid grid-cols-[1.2fr_1.6fr_1fr] items-center gap-3 px-2 py-4 transition-colors hover:bg-sky-50/50 dark:hover:bg-white/[0.05]"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-400 text-sm font-black text-white shadow-lg shadow-sky-500/20">
                              {token.symbol.slice(0, 3)}
                            </div>
                            <div className="text-[15px] font-black tracking-tight text-gray-900 dark:text-white">
                              {token.symbol}
                            </div>
                          </div>

                          <div className="text-sm font-medium text-gray-600 dark:text-gray-300">
                            {token.name}
                          </div>

                          <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                            {token.amountLabel} {token.symbol}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="max-h-[560px] space-y-3 overflow-y-auto pr-1 sm:hidden">
                    {walletTokens.map((token) => (
                      <div
                        key={token.symbol}
                        className="rounded-[1.5rem] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-white/[0.02]"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-400 text-sm font-black text-white shadow-lg shadow-sky-500/20">
                              {token.symbol.slice(0, 3)}
                            </div>
                            <div>
                              <div className="text-lg font-black tracking-tight text-gray-900 dark:text-white">
                                {token.symbol}
                              </div>
                              <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                {token.name}
                              </div>
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-lg font-black tracking-tight text-gray-900 dark:text-white">
                              {token.amountLabel}
                            </div>
                            <div className="mt-1 text-sm font-semibold text-gray-500 dark:text-gray-400">
                              {token.symbol}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-[1.5rem] border border-dashed border-black/10 bg-gray-50/80 px-5 py-16 text-center dark:border-white/10 dark:bg-white/[0.03]">
                  <div className="text-lg font-black tracking-tight text-gray-900 dark:text-white">
                    {isZh ? '当前钱包还没有代币余额' : 'No token balances yet'}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        {isLimitOrdersModalOpen && limitOrderRows.length > 0 ? (
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm"
            onClick={closeLimitOrdersModal}
          >
            <div
              className="flex h-[820px] max-h-[calc(100vh-2rem)] w-full max-w-[88rem] flex-col rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-[#0f1726] xl:p-6"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">
                    {isZh ? '限价订单' : 'Limit Orders'}
                  </div>
                  <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {isZh ? `共 ${limitOrderRows.length} 笔限价单` : `${limitOrderRows.length} limit orders`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeLimitOrdersModal}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.10]"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-6 flex-1 overflow-hidden rounded-[1.5rem] border border-black/5 dark:border-white/10">
                <div className="hidden h-full overflow-y-auto overflow-x-hidden xl:block">
                  <div className="mx-auto w-full max-w-[82rem]">
                    <div className="sticky top-0 z-10 grid w-full grid-cols-[1.5fr_1.5fr_1.5fr_1.5fr_1fr_1fr_1fr_1fr] items-center gap-x-3 border-b border-black/5 bg-white/95 px-4 py-3 text-[11px] font-bold tracking-[0.08em] text-gray-500 backdrop-blur-sm dark:border-white/10 dark:bg-[#0f1726]/95 dark:text-gray-400">
                      <div className="text-center">{isZh ? '交易对' : 'Pair'}</div>
                      <div className="text-center">{isZh ? '卖出' : 'Sell'}</div>
                      <div className="text-center">{isZh ? '最少买入' : 'Minimum Buy'}</div>
                      <div className="text-center">{isZh ? '限价值' : 'Limit Price'}</div>
                      <div className="text-center">{isZh ? '创建时间' : 'Created At'}</div>
                      <div className="text-center">{isZh ? '有效期' : 'Expiry'}</div>
                      <div className="text-center">{isZh ? '状态' : 'Status'}</div>
                      <div className="text-center">{isZh ? '操作' : 'Action'}</div>
                    </div>

                    <div className="divide-y divide-black/5 dark:divide-white/10">
                      {limitOrderRows.map((row) => {
                        const canCancel = canCancelLimitOrder(row.order.status);
                        const createdAtParts = splitDateTimeLabel(row.createdAtLabel);
                        const expiryParts = splitDateTimeLabel(row.expiryLabel);
                        const isExpanded = expandedLimitOrderHash === row.order.orderHash;

                        return (
                          <div
                            key={row.order.orderHash}
                            className="overflow-hidden"
                          >
                            <div
                              role="button"
                              tabIndex={0}
                              aria-expanded={isExpanded}
                              onClick={() => toggleExpandedLimitOrder(row.order.orderHash)}
                              onKeyDown={(event) =>
                                toggleWithKeyboard(event, () => toggleExpandedLimitOrder(row.order.orderHash))
                              }
                              className={`grid w-full cursor-pointer grid-cols-[1.5fr_1.5fr_1.5fr_1.5fr_1fr_1fr_1fr_1fr] items-center gap-x-3 px-4 py-4 text-sm leading-5 text-gray-700 transition-colors dark:text-gray-300 ${
                                isExpanded
                                  ? 'bg-sky-50/70 dark:bg-white/[0.06]'
                                  : 'hover:bg-sky-50/50 dark:hover:bg-white/[0.05]'
                              }`}
                            >
                              <div className="min-w-0 px-2">
                                <div className="flex items-center justify-center gap-2">
                                  <span className="truncate font-semibold text-gray-900 dark:text-white">{row.pairLabel}</span>
                                  {isExpanded ? (
                                    <ChevronUp size={16} className="shrink-0 text-gray-400 dark:text-gray-500" />
                                  ) : (
                                    <ChevronDown size={16} className="shrink-0 text-gray-400 dark:text-gray-500" />
                                  )}
                                </div>
                              </div>
                              <div className="min-w-0 text-center font-medium whitespace-nowrap">{row.payAmountLabel}</div>
                              <div className="min-w-0 text-center font-medium whitespace-nowrap">{row.receiveAmountLabel}</div>
                              <div className="min-w-0 text-center font-medium whitespace-nowrap text-[13px]">{row.priceLabel}</div>
                              <div className="min-w-0 text-center font-medium tabular-nums leading-4">
                                <div className="whitespace-nowrap">{createdAtParts.date}</div>
                                {createdAtParts.time ? (
                                  <div className="mt-1 whitespace-nowrap text-[12px] text-gray-500 dark:text-gray-400">
                                    {createdAtParts.time}
                                  </div>
                                ) : null}
                              </div>
                              <div className="min-w-0 text-center font-medium tabular-nums leading-4">
                                <div className="whitespace-nowrap">{expiryParts.date}</div>
                                {expiryParts.time ? (
                                  <div className="mt-1 whitespace-nowrap text-[12px] text-gray-500 dark:text-gray-400">
                                    {expiryParts.time}
                                  </div>
                                ) : null}
                              </div>
                              <div className="flex justify-center">
                                <span
                                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${getLimitOrderStatusBadgeClass(row.order.status)}`}
                                >
                                  {row.statusLabel}
                                </span>
                              </div>
                              <div className="flex justify-center">
                                <button
                                  type="button"
                                  disabled={!canCancel}
                                  title={canCancel ? (isZh ? '撤单功能待接入' : 'Cancel action coming soon') : undefined}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                  }}
                                  className={`inline-flex min-w-[68px] items-center justify-center rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
                                    canCancel
                                      ? 'bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200'
                                      : 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-white/[0.06] dark:text-gray-500'
                                  }`}
                                >
                                  {isZh ? '撤单' : 'Cancel'}
                                </button>
                              </div>
                            </div>

                            {isExpanded ? (
                              <div className="border-t border-black/5 bg-black/[0.02] px-4 py-4 dark:border-white/10 dark:bg-white/[0.03]">
                                <LimitOrderExpandedDetails row={row} isZh={isZh} />
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="h-full space-y-3 overflow-y-auto p-4 xl:hidden">
                  {limitOrderRows.map((row) => {
                    const canCancel = canCancelLimitOrder(row.order.status);
                    const isExpanded = expandedLimitOrderHash === row.order.orderHash;

                    return (
                      <div
                        key={row.order.orderHash}
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        onClick={() => toggleExpandedLimitOrder(row.order.orderHash)}
                        onKeyDown={(event) =>
                          toggleWithKeyboard(event, () => toggleExpandedLimitOrder(row.order.orderHash))
                        }
                        className={`rounded-[1.35rem] border border-black/5 p-4 transition-colors dark:border-white/10 ${
                          isExpanded
                            ? 'bg-sky-50/70 dark:bg-white/[0.05]'
                            : 'bg-gray-50/80 dark:bg-white/[0.03]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <div className="text-base font-black tracking-tight text-gray-900 dark:text-white">
                              {row.pairLabel}
                            </div>
                            {isExpanded ? (
                              <ChevronUp size={16} className="shrink-0 text-gray-400 dark:text-gray-500" />
                            ) : (
                              <ChevronDown size={16} className="shrink-0 text-gray-400 dark:text-gray-500" />
                            )}
                          </div>
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${getLimitOrderStatusBadgeClass(row.order.status)}`}
                          >
                            {row.statusLabel}
                          </span>
                        </div>

                        <div className="mt-4 rounded-[1rem] bg-black/[0.02] px-3.5 py-3 dark:bg-white/[0.04]">
                          <div className="grid gap-2.5">
                            <div className="grid grid-cols-[88px_minmax(0,1fr)] items-start gap-3 text-sm">
                              <div className="text-gray-500 dark:text-gray-400">{isZh ? '卖出' : 'Sell'}</div>
                              <div className="min-w-0 text-right font-medium text-gray-700 dark:text-gray-300">{row.payAmountLabel}</div>
                            </div>
                            <div className="grid grid-cols-[88px_minmax(0,1fr)] items-start gap-3 text-sm">
                              <div className="text-gray-500 dark:text-gray-400">{isZh ? '最少买入' : 'Minimum Buy'}</div>
                              <div className="min-w-0 text-right font-medium text-gray-700 dark:text-gray-300">{row.receiveAmountLabel}</div>
                            </div>
                            <div className="grid grid-cols-[88px_minmax(0,1fr)] items-start gap-3 text-sm">
                              <div className="text-gray-500 dark:text-gray-400">{isZh ? '限价值' : 'Limit Price'}</div>
                              <div className="min-w-0 text-right font-medium text-gray-700 dark:text-gray-300">{row.priceLabel}</div>
                            </div>
                            <div className="grid grid-cols-[88px_minmax(0,1fr)] items-start gap-3 text-sm">
                              <div className="text-gray-500 dark:text-gray-400">{isZh ? '创建时间' : 'Created At'}</div>
                              <div className="min-w-0 text-right font-medium text-gray-700 dark:text-gray-300">{row.createdAtLabel}</div>
                            </div>
                            <div className="grid grid-cols-[88px_minmax(0,1fr)] items-start gap-3 text-sm">
                              <div className="text-gray-500 dark:text-gray-400">{isZh ? '有效期' : 'Expiry'}</div>
                              <div className="min-w-0 text-right font-medium text-gray-700 dark:text-gray-300">{row.expiryLabel}</div>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 flex justify-end">
                          <button
                            type="button"
                            disabled={!canCancel}
                            title={canCancel ? (isZh ? '撤单功能待接入' : 'Cancel action coming soon') : undefined}
                            onClick={(event) => {
                              event.stopPropagation();
                            }}
                            className={`inline-flex min-w-[88px] items-center justify-center rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${
                              canCancel
                                ? 'bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200'
                                : 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-white/[0.06] dark:text-gray-500'
                            }`}
                          >
                            {isZh ? '撤单' : 'Cancel'}
                          </button>
                        </div>

                        {isExpanded ? (
                          <div className="mt-4">
                            <LimitOrderExpandedDetails row={row} isZh={isZh} />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
