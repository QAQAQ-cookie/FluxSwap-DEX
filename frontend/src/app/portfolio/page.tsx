'use client';

import { useConnectModal } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownUp,
  ArrowRight,
  CheckCircle2,
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
import type { Address } from 'viem';
import { maxUint256 } from 'viem';
import { useAccount, useBalance, useChainId, usePublicClient, useSignTypedData, useWriteContract } from 'wagmi';

import { getContractAddress, getLocalGasOverride, isFluxSupportedChain } from '@/config/contracts';
import { getSwapTokenOptions, type SwapTokenOption } from '@/config/tokens';
import {
  formatBigIntAmount,
  formatBigIntAmountDown,
  formatDisplayAmount,
  formatPairLpAmountDown,
} from '@/lib/amounts';
import { fluxSignedOrderSettlementAbi, fluxSwapPairAbi, fluxSwapRouterAbi } from '@/lib/contracts';
import { fluxSwapErc20Abi } from '@/lib/contracts/generated/FluxSwapERC20';
import { formatErrorMessage } from '@/lib/errors';
import { buildInvalidateNoncesTypedData } from '@/lib/limitOrders';
import {
  LOCAL_LIMIT_ORDERS_UPDATED_EVENT,
  listLocalLimitOrders,
  syncLocalLimitOrdersWithChain,
  upsertLocalLimitOrder,
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

type PositionDisplayRow = {
  pairId: string;
  pairLabel: string;
  lpBalanceLabel: string;
  poolShareLabel: string;
  withdrawToken0Label: string;
  withdrawToken1Label: string;
  reserveToken0Label: string;
  reserveToken1Label: string;
  totalLpLabel: string;
  token0Symbol: string;
  token1Symbol: string;
  token0Address: Address;
  token1Address: Address;
  token0Decimals: number;
  token1Decimals: number;
  addLiquidityHref: string;
  poolHref: string;
  rawLpBalance: bigint;
  totalSupply: bigint;
  reserve0: bigint;
  reserve1: bigint;
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
  statusDetailLabel: string;
  createdAtLabel: string;
  expiryLabel: string;
  recipientLabel: string;
  cancelTxHash: string;
  cancelTxHref?: string;
};

type LimitOrdersApiResponse = {
  orders?: LocalLimitOrderRecord[];
  nextCursor?: string;
  hasMore?: boolean;
  updatesCursor?: string;
  notice?: {
    success?: boolean;
    code?: string;
    message?: string;
    hint?: string;
    stage?: string;
  };
};

type CancelOrdersApiResponse = {
  total?: number;
  cancelledCount?: number;
  results?: Array<{
    chainId?: number;
    settlementAddress?: string;
    orderHash?: string;
    cancelled?: boolean;
    error?: string;
    code?: string;
    message?: string;
    hint?: string;
    stage?: string;
    order?: LocalLimitOrderRecord | null;
  }>;
  notice?: {
    success?: boolean;
    code?: string;
    message?: string;
    hint?: string;
    stage?: string;
  };
};

type FetchLimitOrdersParams = {
  chainId: number;
  maker: string;
  settlementAddress?: string;
  statuses?: string[];
  limit?: number;
  cursor?: string;
  view?: 'orders' | 'updates';
};

type TokenSortDirection = 'desc' | 'asc';
type RemoveLiquidityAction = 'approve' | 'remove' | null;

type LimitOrderResultModalState =
  | {
      kind: 'success' | 'error';
      title: string;
      message: string;
    }
  | null;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ZERO_BIGINT = BigInt(0);
const LIMIT_ORDER_PAGE_SIZE = 100;
const LIMIT_ORDER_MAX_PAGES = 10;
const LIMIT_ORDER_POLL_LIMIT = 100;
const LIMIT_ORDER_REFRESH_INTERVAL_MS = 8000;
const LIMIT_ORDER_CANCEL_DEADLINE_SECONDS = BigInt(30 * 60);
const LIMIT_ORDER_CANCEL_REGISTER_RETRIES = 6;
const LIMIT_ORDER_CANCEL_REGISTER_RETRY_MS = 1500;
const TOKEN_BALANCE_REFRESH_INTERVAL_MS = 8000;
const REMOVE_LIQUIDITY_DEADLINE_SECONDS = BigInt(30 * 60);
const DEFAULT_REMOVE_SLIPPAGE_BPS = BigInt(50);
const PERCENT_BPS_BASE = BigInt(10_000);

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function buildLimitOrderKey(order: Pick<LocalLimitOrderRecord, 'chainId' | 'settlementAddress' | 'orderHash'>) {
  return `${order.chainId}:${order.settlementAddress.trim().toLowerCase()}:${order.orderHash.trim().toLowerCase()}`;
}

function sortLimitOrders(orders: LocalLimitOrderRecord[]) {
  return [...orders].sort((left, right) => {
    const createdAtCompare = right.createdAt.localeCompare(left.createdAt);
    if (createdAtCompare !== 0) {
      return createdAtCompare;
    }

    const updatedAtCompare = right.updatedAt.localeCompare(left.updatedAt);
    if (updatedAtCompare !== 0) {
      return updatedAtCompare;
    }

    return right.orderHash.localeCompare(left.orderHash);
  });
}

function mergeLimitOrders(...lists: LocalLimitOrderRecord[][]) {
  const merged = new Map<string, LocalLimitOrderRecord>();

  for (const list of lists) {
    for (const order of list) {
      const key = buildLimitOrderKey(order);
      const previous = merged.get(key);

      merged.set(key, previous ? { ...previous, ...order } : order);
    }
  }

  return sortLimitOrders(Array.from(merged.values()));
}

function filterWalletLimitOrders(
  orders: LocalLimitOrderRecord[],
  {
    chainId,
    maker,
    settlementAddress,
  }: {
    chainId: number;
    maker: string;
    settlementAddress?: string;
  },
) {
  const normalizedMaker = maker.trim().toLowerCase();
  const normalizedSettlement = settlementAddress?.trim().toLowerCase();

  return sortLimitOrders(
    orders.filter((order) => {
      if (order.chainId !== chainId) {
        return false;
      }
      if (order.maker.trim().toLowerCase() !== normalizedMaker) {
        return false;
      }
      if (normalizedSettlement && order.settlementAddress.trim().toLowerCase() !== normalizedSettlement) {
        return false;
      }
      return true;
    }),
  );
}

async function fetchLimitOrdersPage(params: FetchLimitOrdersParams) {
  const searchParams = new URLSearchParams();
  searchParams.set('chainId', String(params.chainId));
  searchParams.set('maker', params.maker);

  if (params.settlementAddress) {
    searchParams.set('settlementAddress', params.settlementAddress);
  }
  if (params.limit) {
    searchParams.set('limit', String(params.limit));
  }
  if (params.cursor) {
    searchParams.set('cursor', params.cursor);
  }
  if (params.view === 'updates') {
    searchParams.set('view', 'updates');
  }
  for (const status of params.statuses ?? []) {
    const normalizedStatus = status.trim();
    if (normalizedStatus) {
      searchParams.append('status', normalizedStatus);
    }
  }

  const response = await fetch(`/api/orders?${searchParams.toString()}`, {
    cache: 'no-store',
  });
  const payload = (await response.json().catch(() => null)) as LimitOrdersApiResponse | null;

  if (!response.ok || payload?.notice?.success === false) {
    const message = payload?.notice?.message ?? 'Failed to load limit orders';
    const hint = payload?.notice?.hint;
    throw new Error(hint ? `${message}: ${hint}` : message);
  }

  return {
    orders: payload?.orders ?? [],
    nextCursor: payload?.nextCursor ?? '',
    hasMore: payload?.hasMore === true,
    updatesCursor: payload?.updatesCursor ?? '',
  };
}

async function fetchAllLimitOrders(params: Omit<FetchLimitOrdersParams, 'cursor' | 'view'>) {
  const collected: LocalLimitOrderRecord[] = [];
  let cursor = '';
  let hasMore = true;
  let pageCount = 0;

  while (hasMore && pageCount < LIMIT_ORDER_MAX_PAGES) {
    const page = await fetchLimitOrdersPage({
      ...params,
      limit: params.limit ?? LIMIT_ORDER_PAGE_SIZE,
      cursor,
      view: 'orders',
    });

    collected.push(...page.orders);
    hasMore = page.hasMore && !!page.nextCursor;
    cursor = page.nextCursor;
    pageCount += 1;
  }

  return mergeLimitOrders(collected);
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
    <div className="mx-auto grid w-full max-w-[92rem] gap-x-8 gap-y-5 pt-1 sm:grid-cols-2 xl:translate-x-16 xl:grid-cols-8">
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

      {row.statusDetailLabel ? (
        <LimitOrderField
          label={isZh ? '当前进度' : 'Current Progress'}
          value={row.statusDetailLabel}
          className="sm:col-span-2 xl:col-span-8"
          valueClassName="break-words font-medium text-gray-700 dark:text-gray-300"
        />
      ) : null}

      {row.cancelTxHash ? (
        <LimitOrderField
          label={isZh ? '撤单交易哈希' : 'Cancel Tx Hash'}
          value={
            row.cancelTxHref ? (
              <a
                href={row.cancelTxHref}
                target="_blank"
                rel="noreferrer"
                className="text-sky-600 underline decoration-sky-200 underline-offset-4 transition-colors hover:text-sky-500 dark:text-sky-300 dark:decoration-sky-400/30 dark:hover:text-sky-200"
              >
                {row.cancelTxHash}
              </a>
            ) : (
              row.cancelTxHash
            )
          }
          className="sm:col-span-2 xl:col-span-8"
          valueClassName="font-mono text-[13px]"
        />
      ) : null}
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

function calculateProportionalAmount(amount: bigint, balance: bigint, totalSupply: bigint) {
  if (amount <= ZERO_BIGINT || balance <= ZERO_BIGINT || totalSupply <= ZERO_BIGINT) {
    return ZERO_BIGINT;
  }

  return (amount * balance) / totalSupply;
}

function formatPoolShare(balance: bigint, totalSupply: bigint) {
  if (balance <= ZERO_BIGINT || totalSupply <= ZERO_BIGINT) {
    return '0%';
  }

  const basisPoints = (balance * BigInt(1_000_000)) / totalSupply;
  const percent = Number(basisPoints) / 10_000;

  if (!Number.isFinite(percent) || percent <= 0) {
    return '<0.0001%';
  }

  return `${percent.toLocaleString('en-US', {
    minimumFractionDigits: percent >= 1 ? 2 : 4,
    maximumFractionDigits: percent >= 1 ? 2 : 4,
  })}%`;
}

function parsePercentToBasisPoints(value: string) {
  const trimmed = value.trim();
  if (!/^\d*(?:\.\d{0,2})?$/.test(trimmed) || trimmed === '' || trimmed === '.') {
    return undefined;
  }

  const [integerPart = '0', fractionPart = ''] = trimmed.split('.');
  const integer = BigInt(integerPart === '' ? '0' : integerPart);
  const fraction = BigInt(fractionPart.padEnd(2, '0').slice(0, 2));
  const basisPoints = integer * BigInt(100) + fraction;

  if (basisPoints <= ZERO_BIGINT || basisPoints > PERCENT_BPS_BASE) {
    return undefined;
  }

  return basisPoints;
}

function applySlippage(amount: bigint, slippageBps = DEFAULT_REMOVE_SLIPPAGE_BPS) {
  if (amount <= ZERO_BIGINT) {
    return ZERO_BIGINT;
  }

  return (amount * (PERCENT_BPS_BASE - slippageBps)) / PERCENT_BPS_BASE;
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

function getLimitOrderStatusDetailLabel(
  order: Pick<LocalLimitOrderRecord, 'status' | 'statusReason' | 'cancelledTxHash'>,
  isZh: boolean,
) {
  const status = order.status.trim().toLowerCase();
  const statusReason = order.statusReason?.trim().toLowerCase() ?? '';

  if (status === 'pending_cancel') {
    switch (statusReason) {
      case 'cancel_tx_submitted_by_user':
      case 'cancel_tx_pending_on_chain':
        return isZh ? '撤单交易已提交，等待链上确认' : 'Cancel transaction submitted and waiting for chain confirmation';
      case 'cancel_tx_confirmed_waiting_for_indexer':
        return isZh ? '链上已确认，等待索引回写' : 'Confirmed on-chain and waiting for indexer sync';
      case 'cancel_tx_missing_from_chain_retryable':
        return isZh ? '暂未从节点查到撤单交易，系统会继续重试' : 'Cancel transaction is not indexed by the node yet, and the system will keep retrying';
      case 'cancel_tx_reverted_retryable':
        return isZh ? '撤单交易已回退，系统正在重新校验状态' : 'Cancel transaction reverted and the system is re-checking the order state';
      case 'confirmed_by_chain_state':
        return isZh ? '链上状态已确认，等待页面同步最终结果' : 'Chain state is confirmed and the page is waiting to sync the final result';
      default:
        return isZh ? '撤单处理中' : 'Cancellation in progress';
    }
  }

  if (status === 'cancelled') {
    if (statusReason === 'confirmed_by_chain_state' && !order.cancelledTxHash) {
      return isZh ? '链上已确认撤单，撤单哈希稍后补齐' : 'Cancellation is confirmed on-chain and the cancel transaction hash will sync later';
    }

    return isZh ? '订单已撤单完成' : 'The order has been cancelled';
  }

  if (status === 'pending_execute') {
    return isZh ? '执行交易已提交，等待链上确认' : 'Execution transaction submitted and waiting for chain confirmation';
  }

  if (status === 'submitting_execute') {
    return isZh ? '执行器正在提交执行交易' : 'Executor is submitting the execution transaction';
  }

  return '';
}

function getLimitOrderActionMeta(
  order: Pick<LocalLimitOrderRecord, 'status' | 'statusReason' | 'cancelledTxHash'>,
  isZh: boolean,
  isProcessingCurrent: boolean,
  isAnotherActionRunning: boolean,
) {
  const status = order.status.trim().toLowerCase();
  const statusDetailLabel = getLimitOrderStatusDetailLabel(order, isZh);

  if (isProcessingCurrent) {
    return {
      label: isZh ? '处理中...' : 'Processing...',
      title: isZh ? '正在提交撤单请求，请稍候' : 'Submitting cancel request. Please wait.',
      disabled: true,
    };
  }

  if (isAnotherActionRunning) {
    return {
      label: isZh ? '撤单' : 'Cancel',
      title: isZh ? '当前有另一笔撤单正在处理' : 'Another cancel request is currently being processed.',
      disabled: true,
    };
  }

  switch (status.trim().toLowerCase()) {
    case 'open':
      return {
        label: isZh ? '撤单' : 'Cancel',
        title: isZh ? '发起链上撤单并登记到后端' : 'Submit on-chain cancellation and register it with the backend.',
        disabled: false,
      };
    case 'pending_cancel':
      return {
        label: isZh ? '撤单中' : 'Cancelling',
        title: statusDetailLabel || (isZh ? '撤单交易已提交，等待链上确认和状态回写' : 'Cancel transaction submitted. Waiting for chain confirmation and status sync.'),
        disabled: true,
      };
    case 'submitting_execute':
      return {
        label: isZh ? '执行中' : 'Executing',
        title: isZh ? '订单正在提交执行，暂时不能撤单' : 'The order is being submitted for execution and cannot be cancelled right now.',
        disabled: true,
      };
    case 'pending_execute':
      return {
        label: isZh ? '执行中' : 'Executing',
        title: isZh ? '订单执行交易已在链上处理中，暂时不能撤单' : 'The execution transaction is pending on-chain and cannot be cancelled right now.',
        disabled: true,
      };
    case 'executed':
      return {
        label: isZh ? '已执行' : 'Executed',
        title: isZh ? '已执行的订单不能撤单' : 'Executed orders cannot be cancelled.',
        disabled: true,
      };
    case 'cancelled':
      return {
        label: isZh ? '已撤单' : 'Cancelled',
        title: isZh ? '这笔订单已经撤单' : 'This order has already been cancelled.',
        disabled: true,
      };
    case 'expired':
      return {
        label: isZh ? '已过期' : 'Expired',
        title: isZh ? '已过期的订单不能撤单' : 'Expired orders cannot be cancelled.',
        disabled: true,
      };
    default:
      return {
        label: isZh ? '不可撤单' : 'Unavailable',
        title: isZh ? '当前状态暂不支持撤单' : 'Cancellation is not available in the current state.',
        disabled: true,
      };
  }
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
  const { openConnectModal } = useConnectModal();
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync } = useWriteContract();
  const localGasOverride = getLocalGasOverride(chainId);

  const supportedChain = isFluxSupportedChain(chainId);
  const fluxTokenAddress = getContractAddress('FluxToken', chainId);
  const wrappedNativeAddress = getContractAddress('MockWETH', chainId);
  const routerAddress = getContractAddress('FluxSwapRouter', chainId);
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
  const [limitOrdersError, setLimitOrdersError] = useState<string | null>(null);
  const [walletLimitOrders, setWalletLimitOrders] = useState<LocalLimitOrderRecord[]>([]);
  const [isLimitOrdersModalOpen, setIsLimitOrdersModalOpen] = useState(false);
  const [expandedLimitOrderKey, setExpandedLimitOrderKey] = useState<string | null>(null);
  const [limitOrderResultModal, setLimitOrderResultModal] = useState<LimitOrderResultModalState>(null);
  const [selectedLimitOrderKeys, setSelectedLimitOrderKeys] = useState<string[]>([]);
  const [cancellingOrderKeys, setCancellingOrderKeys] = useState<string[]>([]);
  const [isPositionsModalOpen, setIsPositionsModalOpen] = useState(false);
  const [removePosition, setRemovePosition] = useState<PositionDisplayRow | null>(null);
  const [removePercentInput, setRemovePercentInput] = useState('50');
  const [removeLiquidityAction, setRemoveLiquidityAction] = useState<RemoveLiquidityAction>(null);
  const [removeLiquidityResultModal, setRemoveLiquidityResultModal] = useState<LimitOrderResultModalState>(null);
  const [removeLpAllowance, setRemoveLpAllowance] = useState<bigint | null>(null);
  const [removeLpAllowanceLoading, setRemoveLpAllowanceLoading] = useState(false);

  const { data: nativeBalance, refetch: refetchNativeBalance } = useBalance({
    address,
    chainId,
    query: {
      enabled: !!address && isConnected,
      refetchInterval: 8000,
    },
  });

  const { data: fluxBalance, refetch: refetchFluxBalance } = useBalance({
    address,
    chainId,
    token: fluxTokenAddress,
    query: {
      enabled: !!address && !!fluxTokenAddress && isConnected,
      refetchInterval: 8000,
    },
  });

  const refreshTokenBalances = useCallback(
    async ({ background = false }: { background?: boolean } = {}) => {
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

      if (!background) {
        setTokenLoading(true);
      }
      setTokenError(null);

      try {
        const entries = await Promise.all(
          erc20Tokens.map(async (token) => {
            const balance = await publicClient.readContract({
              address: token.address!,
              abi: fluxSwapErc20Abi,
              functionName: 'balanceOf',
              args: [address],
            });

            return [token.symbol, balance] as const;
          }),
        );

        setTokenBalances(Object.fromEntries(entries));
      } catch (error) {
        if (!background) {
          setTokenBalances({});
        }
        setTokenError(error instanceof Error ? error.message : 'Failed to load token balances');
      } finally {
        if (!background) {
          setTokenLoading(false);
        }
      }
    },
    [address, isConnected, publicClient, trackedTokens],
  );

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
    let cancelled = false;

    const refresh = async (options?: { background?: boolean }) => {
      if (cancelled) {
        return;
      }

      await refreshTokenBalances(options);
    };

    void refresh();

    const refreshTimer = window.setInterval(() => {
      void refresh({ background: true });
    }, TOKEN_BALANCE_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, [refreshTokenBalances]);

  useEffect(() => {
    if (!supportedChain || !isConnected || !address) {
      setLimitOrdersLoading(false);
      setLimitOrdersError(null);
      setWalletLimitOrders([]);
      setIsLimitOrdersModalOpen(false);
      return;
    }

    let cancelled = false;
    const normalizedWallet = address.toLowerCase();
    const normalizedSettlement = limitSettlementAddress?.toLowerCase();

    const readLocalWalletOrders = () =>
      filterWalletLimitOrders(listLocalLimitOrders(), {
        chainId,
        maker: normalizedWallet,
        settlementAddress: normalizedSettlement,
      });

    const loadLimitOrders = async ({ background = false }: { background?: boolean } = {}) => {
      if (cancelled) {
        return;
      }

      if (!background) {
        setLimitOrdersLoading(true);
      }

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

      const localOrders = readLocalWalletOrders();

      try {
        const backendOrders = await fetchAllLimitOrders({
          chainId,
          maker: normalizedWallet,
          settlementAddress: normalizedSettlement,
          limit: LIMIT_ORDER_PAGE_SIZE,
        });

        if (!cancelled) {
          setWalletLimitOrders(mergeLimitOrders(localOrders, backendOrders));
          setLimitOrdersError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setWalletLimitOrders((current) => (background ? mergeLimitOrders(localOrders, current) : localOrders));
          if (!background && localOrders.length === 0) {
            setLimitOrdersError(
              error instanceof Error ? error.message : 'Failed to load limit orders',
            );
          }
        }
      } finally {
        if (!cancelled && !background) {
          setLimitOrdersLoading(false);
        }
      }
    };

    const refreshLimitOrderUpdates = async () => {
      const localOrders = readLocalWalletOrders();

      try {
        const page = await fetchLimitOrdersPage({
          chainId,
          maker: normalizedWallet,
          settlementAddress: normalizedSettlement,
          limit: LIMIT_ORDER_POLL_LIMIT,
          view: 'updates',
        });

        if (!cancelled) {
          setWalletLimitOrders((current) => mergeLimitOrders(localOrders, current, page.orders));
          setLimitOrdersError(null);
        }
      } catch {
        if (!cancelled) {
          setWalletLimitOrders((current) => mergeLimitOrders(localOrders, current));
        }
      }
    };

    void loadLimitOrders();

    const handleLimitOrdersUpdated = () => {
      void loadLimitOrders({ background: true });
    };
    const refreshTimer = window.setInterval(() => {
      void refreshLimitOrderUpdates();
    }, LIMIT_ORDER_REFRESH_INTERVAL_MS);

    window.addEventListener('storage', handleLimitOrdersUpdated);
    window.addEventListener(
      LOCAL_LIMIT_ORDERS_UPDATED_EVENT,
      handleLimitOrdersUpdated as EventListener,
    );

    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
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

  const activePositionCount = useMemo(
    () => Object.values(lpBalances).filter((balance) => balance > ZERO_BIGINT).length,
    [lpBalances],
  );

  const fluxDisplay = isConnected
    ? formatDisplayAmount(fluxBalance?.formatted)
    : '--';

  const lpDisplay = isConnected ? String(activePositionCount) : '--';
  const showLpHint = isConnected && activePositionCount > 0;
  const positionRows = useMemo<PositionDisplayRow[]>(() => {
    return pairs
      .map((pair) => {
        const rawLpBalance = lpBalances[pair.id.toLowerCase()] ?? ZERO_BIGINT;
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
        const withdrawToken0 = calculateProportionalAmount(
          pair.reserve0,
          rawLpBalance,
          pair.totalSupply,
        );
        const withdrawToken1 = calculateProportionalAmount(
          pair.reserve1,
          rawLpBalance,
          pair.totalSupply,
        );

        return {
          pairId: pair.id,
          pairLabel: `${token0Symbol} / ${token1Symbol}`,
          lpBalanceLabel: `${formatPairLpAmountDown(
            rawLpBalance,
            pair.token0.decimals,
            pair.token1.decimals,
            6,
          )} LP`,
          poolShareLabel: formatPoolShare(rawLpBalance, pair.totalSupply),
          withdrawToken0Label: `${formatBigIntAmountDown(
            withdrawToken0,
            pair.token0.decimals,
            6,
          )} ${token0Symbol}`,
          withdrawToken1Label: `${formatBigIntAmountDown(
            withdrawToken1,
            pair.token1.decimals,
            6,
          )} ${token1Symbol}`,
          reserveToken0Label: `${formatBigIntAmountDown(pair.reserve0, pair.token0.decimals, 6)} ${token0Symbol}`,
          reserveToken1Label: `${formatBigIntAmountDown(pair.reserve1, pair.token1.decimals, 6)} ${token1Symbol}`,
          totalLpLabel: `${formatPairLpAmountDown(
            pair.totalSupply,
            pair.token0.decimals,
            pair.token1.decimals,
            6,
          )} LP`,
          token0Symbol,
          token1Symbol,
          token0Address: pair.token0.id,
          token1Address: pair.token1.id,
          token0Decimals: pair.token0.decimals,
          token1Decimals: pair.token1.decimals,
          addLiquidityHref: `/portfolio/liquidity?tokenA=${pair.token0.id}&tokenB=${pair.token1.id}`,
          poolHref: `/pool/${pair.id}`,
          rawLpBalance,
          totalSupply: pair.totalSupply,
          reserve0: pair.reserve0,
          reserve1: pair.reserve1,
        };
      })
      .filter((row) => row.rawLpBalance > ZERO_BIGINT)
      .sort((left, right) => {
        if (left.rawLpBalance === right.rawLpBalance) {
          return left.pairLabel.localeCompare(right.pairLabel);
        }

        return left.rawLpBalance > right.rawLpBalance ? -1 : 1;
      });
  }, [lpBalances, pairs, wrappedNativeAddress]);
  const removePercentBps = parsePercentToBasisPoints(removePercentInput);
  const removeLiquidityAmount =
    removePosition && removePercentBps
      ? (removePosition.rawLpBalance * removePercentBps) / PERCENT_BPS_BASE
      : ZERO_BIGINT;
  const removeEstimatedToken0 = removePosition
    ? calculateProportionalAmount(removePosition.reserve0, removeLiquidityAmount, removePosition.totalSupply)
    : ZERO_BIGINT;
  const removeEstimatedToken1 = removePosition
    ? calculateProportionalAmount(removePosition.reserve1, removeLiquidityAmount, removePosition.totalSupply)
    : ZERO_BIGINT;
  const removeMinToken0 = applySlippage(removeEstimatedToken0);
  const removeMinToken1 = applySlippage(removeEstimatedToken1);
  const needsRemoveLpApproval =
    Boolean(removePosition && removeLiquidityAmount > ZERO_BIGINT) &&
    (removeLpAllowance === null || removeLpAllowance < removeLiquidityAmount);
  const isRemoveLpAllowanceLoading =
    Boolean(removePosition && removeLiquidityAmount > ZERO_BIGINT && publicClient && routerAddress && address) &&
    removeLpAllowanceLoading;
  const removeLiquidityAmountLabel = removePosition
    ? `${formatPairLpAmountDown(
        removeLiquidityAmount,
        removePosition.token0Decimals,
        removePosition.token1Decimals,
        6,
      )} LP`
    : '';
  const removeEstimatedToken0Label = removePosition
    ? `${formatBigIntAmountDown(removeEstimatedToken0, removePosition.token0Decimals, 6)} ${removePosition.token0Symbol}`
    : '';
  const removeEstimatedToken1Label = removePosition
    ? `${formatBigIntAmountDown(removeEstimatedToken1, removePosition.token1Decimals, 6)} ${removePosition.token1Symbol}`
    : '';
  const removeMinToken0Label = removePosition
    ? `${formatBigIntAmountDown(removeMinToken0, removePosition.token0Decimals, 6)} ${removePosition.token0Symbol}`
    : '';
  const removeMinToken1Label = removePosition
    ? `${formatBigIntAmountDown(removeMinToken1, removePosition.token1Decimals, 6)} ${removePosition.token1Symbol}`
    : '';
  const removeLiquidityButtonLabel = !isConnected
    ? isZh
      ? '连接钱包'
      : 'Connect Wallet'
    : removeLiquidityAction === 'approve'
      ? isZh
        ? '授权确认中...'
        : 'Approving...'
      : removeLiquidityAction === 'remove'
        ? isZh
          ? '移除中...'
          : 'Removing...'
        : !routerAddress || !publicClient
          ? isZh
            ? '当前网络暂不支持'
            : 'Unsupported network'
          : isRemoveLpAllowanceLoading
            ? isZh
              ? '读取授权中...'
              : 'Checking approval...'
          : !removePercentBps || removeLiquidityAmount <= ZERO_BIGINT
            ? isZh
              ? '请输入有效比例'
              : 'Enter a valid percent'
            : needsRemoveLpApproval
              ? isZh
                ? '授权 LP'
                : 'Approve LP'
              : isZh
                ? '确认移除'
                : 'Remove Liquidity';
  const removeLiquidityButtonDisabled =
    Boolean(removeLiquidityAction) ||
    isRemoveLpAllowanceLoading ||
    (isConnected && (!routerAddress || !publicClient || !removePercentBps || removeLiquidityAmount <= ZERO_BIGINT));

  useEffect(() => {
    if (!publicClient || !address || !routerAddress || !removePosition) {
      setRemoveLpAllowance(null);
      setRemoveLpAllowanceLoading(false);
      return;
    }

    let cancelled = false;
    setRemoveLpAllowanceLoading(true);

    publicClient
      .readContract({
        address: removePosition.pairId as Address,
        abi: fluxSwapPairAbi,
        functionName: 'allowance',
        args: [address, routerAddress],
      })
      .then((allowance) => {
        if (!cancelled) {
          setRemoveLpAllowance(allowance);
          setRemoveLpAllowanceLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRemoveLpAllowance(null);
          setRemoveLpAllowanceLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [address, publicClient, removePosition, routerAddress]);
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
        statusDetailLabel: getLimitOrderStatusDetailLabel(order, isZh),
        createdAtLabel: formatIsoDateTime(order.createdAt, locale),
        expiryLabel: formatIsoDateTime(
          parseOptionalBigInt(order.expiry) ? new Date(Number(order.expiry) * 1000).toISOString() : '',
          locale,
        ),
        recipientLabel: truncateAddress(order.recipient, 8, 6),
        cancelTxHash: order.cancelledTxHash?.trim() ?? '',
        cancelTxHref: getTransactionHref(order.chainId, order.cancelledTxHash?.trim() ?? ''),
      };
    });
  }, [isZh, tokenLookup, walletLimitOrders, wrappedNativeAddress]);
  const selectedLimitOrderKeySet = useMemo(() => new Set(selectedLimitOrderKeys), [selectedLimitOrderKeys]);
  const cancellingOrderKeySet = useMemo(() => new Set(cancellingOrderKeys), [cancellingOrderKeys]);
  const isCancellingLimitOrders = cancellingOrderKeys.length > 0;
  const selectableLimitOrderRows = useMemo(
    () =>
      limitOrderRows.filter(
        (row) =>
          !getLimitOrderActionMeta(
            row.order,
            isZh,
            cancellingOrderKeySet.has(buildLimitOrderKey(row.order)),
            isCancellingLimitOrders && !cancellingOrderKeySet.has(buildLimitOrderKey(row.order)),
          ).disabled,
      ),
    [cancellingOrderKeySet, isCancellingLimitOrders, isZh, limitOrderRows],
  );
  const selectedLimitOrders = useMemo(() => {
    if (selectedLimitOrderKeySet.size === 0) {
      return [];
    }

    return limitOrderRows
      .filter((row) => selectedLimitOrderKeySet.has(buildLimitOrderKey(row.order)))
      .map((row) => row.order);
  }, [limitOrderRows, selectedLimitOrderKeySet]);
  const allSelectableLimitOrdersSelected =
    selectableLimitOrderRows.length > 0 &&
    selectableLimitOrderRows.every((row) => selectedLimitOrderKeySet.has(buildLimitOrderKey(row.order)));

  const toggleLimitOrderSelection = (order: LocalLimitOrderRecord) => {
    const key = buildLimitOrderKey(order);
    setSelectedLimitOrderKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  };

  const toggleAllSelectableLimitOrders = () => {
    const selectableKeys = selectableLimitOrderRows.map((row) => buildLimitOrderKey(row.order));
    if (selectableKeys.length === 0) {
      return;
    }

    setSelectedLimitOrderKeys((current) => {
      const currentSet = new Set(current);
      const allSelected = selectableKeys.every((key) => currentSet.has(key));

      if (allSelected) {
        return current.filter((key) => !selectableKeys.includes(key));
      }

      const next = new Set(current);
      selectableKeys.forEach((key) => next.add(key));
      return Array.from(next);
    });
  };

  const clearSelectedLimitOrders = () => {
    setSelectedLimitOrderKeys([]);
  };
  const cancellingOrderHash = useMemo(() => {
    const firstKey = cancellingOrderKeys[0];
    if (!firstKey) {
      return null;
    }

    return limitOrderRows.find((row) => buildLimitOrderKey(row.order) === firstKey)?.order.orderHash ?? null;
  }, [cancellingOrderKeys, limitOrderRows]);
  const setCancellingOrderHash = (orderHash: string | null) => {
    if (!orderHash) {
      setCancellingOrderKeys([]);
      return;
    }

    const normalizedOrderHash = orderHash.trim().toLowerCase();
    const row = limitOrderRows.find((item) => item.order.orderHash.trim().toLowerCase() === normalizedOrderHash);
    setCancellingOrderKeys([row ? buildLimitOrderKey(row.order) : normalizedOrderHash]);
  };

  const syncLimitOrderRecord = (nextOrder: LocalLimitOrderRecord) => {
    upsertLocalLimitOrder(nextOrder);
    setWalletLimitOrders((current) => mergeLimitOrders(current, [nextOrder]));
  };

  const closeLimitOrderResultModal = () => {
    setLimitOrderResultModal(null);
  };

  const closeRemoveLiquidityResultModal = () => {
    setRemoveLiquidityResultModal(null);
  };

  const handleCancelLimitOrder = async (order: LocalLimitOrderRecord) => {
    if (!isConnected || !address) {
      openConnectModal?.();
      return;
    }

    if (cancellingOrderHash) {
      return;
    }

    const actionMeta = getLimitOrderActionMeta(order, isZh, false, false);
    if (actionMeta.disabled) {
      setLimitOrderResultModal({
        kind: 'error',
        title: isZh ? '当前不能撤单' : 'Cancellation unavailable',
        message: actionMeta.title,
      });
      return;
    }

    if (!limitSettlementAddress || !publicClient || !supportedChain) {
      setLimitOrderResultModal({
        kind: 'error',
        title: isZh ? '撤单失败' : 'Cancel failed',
        message: isZh ? '当前链路尚未准备好，请确认钱包网络和结算合约配置。' : 'The current network path is not ready. Please verify the connected network and settlement contract configuration.',
      });
      return;
    }

    const nonce = parseOptionalBigInt(order.nonce);
    if (nonce === undefined || nonce < ZERO_BIGINT) {
      setLimitOrderResultModal({
        kind: 'error',
        title: isZh ? '撤单失败' : 'Cancel failed',
        message: isZh ? '订单 nonce 无效，暂时无法发起撤单。' : 'The order nonce is invalid, so cancellation cannot be submitted.',
      });
      return;
    }

    setLimitOrderResultModal(null);
    setCancellingOrderHash(order.orderHash);

    try {
      const latestBlock = await publicClient.getBlock();
      const cancelDeadline = latestBlock.timestamp + LIMIT_ORDER_CANCEL_DEADLINE_SECONDS;
      const cancelSignature = await signTypedDataAsync(
        buildInvalidateNoncesTypedData(
          chainId,
          limitSettlementAddress,
          order.maker as Address,
          [nonce],
          cancelDeadline,
        ),
      );

      const cancelTxHash = await writeContractAsync({
        address: limitSettlementAddress,
        abi: fluxSignedOrderSettlementAbi,
        functionName: 'invalidateNoncesBySig',
        args: [order.maker as Address, [nonce], cancelDeadline, cancelSignature],
        chainId,
        ...localGasOverride,
      });

      syncLimitOrderRecord({
        ...order,
        status: 'pending_cancel',
        statusReason: 'cancel_tx_pending_on_chain',
        cancelledTxHash: cancelTxHash,
        updatedAt: new Date().toISOString(),
      });

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: cancelTxHash,
      });

      if (receipt.status !== 'success') {
        syncLimitOrderRecord({
          ...order,
          updatedAt: new Date().toISOString(),
        });
        throw new Error(isZh ? '链上撤单交易执行失败。' : 'The on-chain cancellation transaction failed.');
      }

      syncLimitOrderRecord({
        ...order,
        status: 'pending_cancel',
        statusReason: 'cancel_tx_confirmed_waiting_for_indexer',
        cancelledTxHash: cancelTxHash,
        updatedAt: new Date().toISOString(),
      });

      let didRegister = false;
      let finalMessage = '';
      let lastRetryableMessage = '';

      for (let attempt = 0; attempt < LIMIT_ORDER_CANCEL_REGISTER_RETRIES; attempt += 1) {
        const response = await fetch('/api/orders', {
          method: 'DELETE',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            cancelTxHash,
            orders: [
              {
                chainId,
                settlementAddress: order.settlementAddress,
                orderHash: order.orderHash,
                maker: order.maker,
                reason: 'user_requested_cancel',
              },
            ],
          }),
        });
        const payload = (await response.json().catch(() => null)) as CancelOrdersApiResponse | null;
        const result = payload?.results?.[0];
        const returnedOrder = result?.order ?? null;

        if (returnedOrder) {
          syncLimitOrderRecord(returnedOrder);
        }

        const message = [result?.message ?? payload?.notice?.message, result?.hint ?? payload?.notice?.hint]
          .map((item) => item?.trim())
          .filter(Boolean)
          .join(' ');

        if (
          (response.ok && payload?.notice?.success !== false && result?.cancelled) ||
          (returnedOrder && ['pending_cancel', 'cancelled'].includes(returnedOrder.status.trim().toLowerCase()))
        ) {
          didRegister = true;
          finalMessage =
            message ||
            (isZh ? '撤单请求已登记，订单状态会在链上确认后自动刷新。' : 'The cancel request has been registered and the order status will refresh after chain confirmation.');
          break;
        }

        if (result?.code === 'CANCEL_TX_NOT_INDEXED_YET') {
          lastRetryableMessage =
            message ||
            (isZh ? '链上撤单已确认，后端正在等待索引这笔交易。' : 'The on-chain cancellation is confirmed and the backend is waiting to index the transaction.');

          if (attempt < LIMIT_ORDER_CANCEL_REGISTER_RETRIES - 1) {
            await sleep(LIMIT_ORDER_CANCEL_REGISTER_RETRY_MS);
            continue;
          }

          break;
        }

        throw new Error(
          message ||
            (isZh ? '撤单登记失败，请稍后刷新订单状态后重试。' : 'Failed to register the cancellation. Please refresh the order state and try again later.'),
        );
      }

      setLimitOrderResultModal({
        kind: 'success',
        title: isZh ? '撤单已提交' : 'Cancel submitted',
        message:
          didRegister
            ? finalMessage
            : lastRetryableMessage ||
              (isZh ? '链上撤单已确认，页面稍后会自动同步最新状态。' : 'The on-chain cancellation is confirmed and the page will sync the latest status shortly.'),
      });
    } catch (error) {
      setLimitOrderResultModal({
        kind: 'error',
        title: isZh ? '撤单失败' : 'Cancel failed',
        message: formatErrorMessage(error, {
          rejectedMessage: isZh ? '你已取消本次撤单签名或钱包交易。' : 'You cancelled the cancellation signature or wallet transaction.',
        }),
      });
    } finally {
      setCancellingOrderHash(null);
    }
  };

  const handleBatchCancelLimitOrders = async () => {
    const uniqueOrders = Array.from(
      new Map(selectedLimitOrders.map((order) => [buildLimitOrderKey(order), order])).values(),
    );

    if (uniqueOrders.length === 0) {
      setLimitOrderResultModal({
        kind: 'error',
        title: isZh ? '请选择订单' : 'Select orders',
        message: isZh ? '请先选择需要撤单的限价单。' : 'Please select limit orders to cancel first.',
      });
      return;
    }

    if (!isConnected || !address) {
      openConnectModal?.();
      return;
    }

    if (isCancellingLimitOrders) {
      return;
    }

    if (!limitSettlementAddress || !publicClient || !supportedChain) {
      setLimitOrderResultModal({
        kind: 'error',
        title: isZh ? '批量撤单失败' : 'Batch cancel failed',
        message: isZh ? '当前链路尚未准备好，请确认钱包网络和结算合约配置。' : 'The current network path is not ready. Please verify the connected network and settlement contract configuration.',
      });
      return;
    }

    const firstOrder = uniqueOrders[0];
    const normalizedMaker = firstOrder.maker.trim().toLowerCase();
    const normalizedSettlement = firstOrder.settlementAddress.trim().toLowerCase();
    const invalidScopeOrder = uniqueOrders.find(
      (order) =>
        order.chainId !== firstOrder.chainId ||
        order.maker.trim().toLowerCase() !== normalizedMaker ||
        order.settlementAddress.trim().toLowerCase() !== normalizedSettlement,
    );
    if (invalidScopeOrder) {
      setLimitOrderResultModal({
        kind: 'error',
        title: isZh ? '批量撤单失败' : 'Batch cancel failed',
        message: isZh ? '批量撤单只能处理同一钱包、同一条链、同一个结算合约下的订单。' : 'Batch cancellation can only include orders from the same wallet, chain, and settlement contract.',
      });
      return;
    }

    const disabledOrder = uniqueOrders.find((order) => getLimitOrderActionMeta(order, isZh, false, false).disabled);
    if (disabledOrder) {
      const actionMeta = getLimitOrderActionMeta(disabledOrder, isZh, false, false);
      setLimitOrderResultModal({
        kind: 'error',
        title: isZh ? '当前不能撤单' : 'Cancellation unavailable',
        message: actionMeta.title,
      });
      return;
    }

    const nonces = uniqueOrders.map((order) => parseOptionalBigInt(order.nonce));
    if (nonces.some((nonce) => nonce === undefined || nonce < ZERO_BIGINT)) {
      setLimitOrderResultModal({
        kind: 'error',
        title: isZh ? '批量撤单失败' : 'Batch cancel failed',
        message: isZh ? '存在 nonce 无效的订单，暂时无法发起批量撤单。' : 'At least one order has an invalid nonce, so batch cancellation cannot be submitted.',
      });
      return;
    }

    const uniqueNonces = Array.from(new Set(nonces.map((nonce) => nonce?.toString() ?? ''))).map((nonce) => BigInt(nonce));
    const orderKeys = uniqueOrders.map((order) => buildLimitOrderKey(order));
    setLimitOrderResultModal(null);
    setCancellingOrderKeys(orderKeys);

    try {
      const latestBlock = await publicClient.getBlock();
      const cancelDeadline = latestBlock.timestamp + LIMIT_ORDER_CANCEL_DEADLINE_SECONDS;
      const cancelSignature = await signTypedDataAsync(
        buildInvalidateNoncesTypedData(
          chainId,
          limitSettlementAddress,
          firstOrder.maker as Address,
          uniqueNonces,
          cancelDeadline,
        ),
      );

      const cancelTxHash = await writeContractAsync({
        address: limitSettlementAddress,
        abi: fluxSignedOrderSettlementAbi,
        functionName: 'invalidateNoncesBySig',
        args: [firstOrder.maker as Address, uniqueNonces, cancelDeadline, cancelSignature],
        chainId,
        ...localGasOverride,
      });

      uniqueOrders.forEach((order) => {
        syncLimitOrderRecord({
          ...order,
          status: 'pending_cancel',
          statusReason: 'cancel_tx_pending_on_chain',
          cancelledTxHash: cancelTxHash,
          updatedAt: new Date().toISOString(),
        });
      });

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: cancelTxHash,
      });

      if (receipt.status !== 'success') {
        uniqueOrders.forEach((order) => {
          syncLimitOrderRecord({
            ...order,
            updatedAt: new Date().toISOString(),
          });
        });
        throw new Error(isZh ? '链上批量撤单交易执行失败。' : 'The on-chain batch cancellation transaction failed.');
      }

      uniqueOrders.forEach((order) => {
        syncLimitOrderRecord({
          ...order,
          status: 'pending_cancel',
          statusReason: 'cancel_tx_confirmed_waiting_for_indexer',
          cancelledTxHash: cancelTxHash,
          updatedAt: new Date().toISOString(),
        });
      });

      let didRegister = false;
      let finalMessage = '';
      let lastRetryableMessage = '';
      let successfulKeys: string[] = [];

      for (let attempt = 0; attempt < LIMIT_ORDER_CANCEL_REGISTER_RETRIES; attempt += 1) {
        const response = await fetch('/api/orders', {
          method: 'DELETE',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            cancelTxHash,
            orders: uniqueOrders.map((order) => ({
              chainId,
              settlementAddress: order.settlementAddress,
              orderHash: order.orderHash,
              maker: order.maker,
              reason: 'user_requested_batch_cancel',
            })),
          }),
        });
        const payload = (await response.json().catch(() => null)) as CancelOrdersApiResponse | null;
        const results = payload?.results ?? [];

        results.forEach((result) => {
          if (result.order) {
            syncLimitOrderRecord(result.order);
          }
        });

        successfulKeys = results
          .filter(
            (result) =>
              result.cancelled === true ||
              (result.order && ['pending_cancel', 'cancelled'].includes(result.order.status.trim().toLowerCase())),
          )
          .map((result) =>
            buildLimitOrderKey({
              chainId: result.chainId ?? chainId,
              settlementAddress: result.settlementAddress ?? firstOrder.settlementAddress,
              orderHash: result.orderHash ?? '',
            }),
          )
          .filter((key) => !key.endsWith(':'));

        const message = [payload?.notice?.message, payload?.notice?.hint]
          .map((item) => item?.trim())
          .filter(Boolean)
          .join(' ');

        if (response.ok && payload?.notice?.success !== false && successfulKeys.length > 0) {
          const failedCount = Math.max(0, uniqueOrders.length - successfulKeys.length);
          didRegister = true;
          finalMessage =
            message ||
            (failedCount > 0
              ? isZh
                ? `已登记 ${successfulKeys.length} 笔撤单，${failedCount} 笔未登记，请刷新后查看原因。`
                : `${successfulKeys.length} cancellation(s) registered, ${failedCount} failed. Please refresh to inspect the reason.`
              : isZh
                ? `已登记 ${successfulKeys.length} 笔撤单，订单状态会在链上确认后自动刷新。`
                : `${successfulKeys.length} cancellation(s) registered. Order status will refresh after chain confirmation.`);
          break;
        }

        if (results.some((result) => result.code === 'CANCEL_TX_NOT_INDEXED_YET')) {
          lastRetryableMessage =
            message ||
            (isZh ? '链上批量撤单已确认，后端正在等待索引这笔交易。' : 'The on-chain batch cancellation is confirmed and the backend is waiting to index the transaction.');

          if (attempt < LIMIT_ORDER_CANCEL_REGISTER_RETRIES - 1) {
            await sleep(LIMIT_ORDER_CANCEL_REGISTER_RETRY_MS);
            continue;
          }

          break;
        }

        throw new Error(
          message ||
            (isZh ? '批量撤单登记失败，请稍后刷新订单状态后重试。' : 'Failed to register the batch cancellation. Please refresh order state and try again later.'),
        );
      }

      setSelectedLimitOrderKeys((current) =>
        successfulKeys.length > 0
          ? current.filter((key) => !successfulKeys.includes(key))
          : current.filter((key) => !orderKeys.includes(key)),
      );

      setLimitOrderResultModal({
        kind: 'success',
        title: isZh ? '批量撤单已提交' : 'Batch cancel submitted',
        message:
          didRegister
            ? finalMessage
            : lastRetryableMessage ||
              (isZh ? '链上批量撤单已确认，页面稍后会自动同步最新状态。' : 'The on-chain batch cancellation is confirmed and the page will sync the latest status shortly.'),
      });
    } catch (error) {
      setLimitOrderResultModal({
        kind: 'error',
        title: isZh ? '批量撤单失败' : 'Batch cancel failed',
        message: formatErrorMessage(error, {
          rejectedMessage: isZh ? '你已取消本次批量撤单签名或钱包交易。' : 'You cancelled the batch cancellation signature or wallet transaction.',
        }),
      });
    } finally {
      setCancellingOrderKeys([]);
    }
  };

  useEffect(() => {
    if (!isLimitOrdersModalOpen) {
      return;
    }

    setExpandedLimitOrderKey((current) => {
      if (!current) {
        return null;
      }

      return limitOrderRows.some((row) => buildLimitOrderKey(row.order) === current) ? current : null;
    });
  }, [isLimitOrdersModalOpen, limitOrderRows]);

  useEffect(() => {
    const validKeys = new Set(selectableLimitOrderRows.map((row) => buildLimitOrderKey(row.order)));
    setSelectedLimitOrderKeys((current) => current.filter((key) => validKeys.has(key)));
  }, [selectableLimitOrderRows]);

  useEffect(() => {
    if (!isConnected || !address || positionRows.length === 0) {
      setIsPositionsModalOpen(false);
    }
  }, [address, isConnected, positionRows.length]);

  const closeLimitOrdersModal = () => {
    setIsLimitOrdersModalOpen(false);
    setExpandedLimitOrderKey(null);
    setSelectedLimitOrderKeys([]);
  };

  const closePositionsModal = () => {
    setIsPositionsModalOpen(false);
  };

  const openRemoveLiquidityModal = (row: PositionDisplayRow) => {
    setRemovePosition(row);
    setRemovePercentInput('50');
    setRemoveLiquidityAction(null);
    setRemoveLiquidityResultModal(null);
    setRemoveLpAllowance(null);
    setRemoveLpAllowanceLoading(false);
  };

  const closeRemoveLiquidityModal = () => {
    if (removeLiquidityAction) {
      return;
    }

    setRemovePosition(null);
    setRemovePercentInput('50');
    setRemoveLiquidityResultModal(null);
    setRemoveLpAllowance(null);
    setRemoveLpAllowanceLoading(false);
  };

  const refreshPositionPoolState = async (pairId: Address) => {
    if (!publicClient || !address) {
      return;
    }

    const [balance, totalSupply, reserves] = await Promise.all([
      publicClient.readContract({
        address: pairId,
        abi: fluxSwapPairAbi,
        functionName: 'balanceOf',
        args: [address],
      }),
      publicClient.readContract({
        address: pairId,
        abi: fluxSwapPairAbi,
        functionName: 'totalSupply',
      }),
      publicClient.readContract({
        address: pairId,
        abi: fluxSwapPairAbi,
        functionName: 'getReserves',
      }),
    ]);

    setLpBalances((current) => ({
      ...current,
      [pairId.toLowerCase()]: balance,
    }));
    setPairs((current) =>
      current.map((pair) =>
        pair.id.toLowerCase() === pairId.toLowerCase()
          ? {
              ...pair,
              reserve0: reserves[0],
              reserve1: reserves[1],
              totalSupply,
            }
          : pair,
      ),
    );
  };

  const handleRemoveLiquidityAction = async () => {
    if (!isConnected || !address) {
      openConnectModal?.();
      return;
    }

    if (!removePosition || !routerAddress || !publicClient || removeLiquidityAmount <= ZERO_BIGINT) {
      return;
    }

    setRemoveLiquidityResultModal(null);
    const action: RemoveLiquidityAction = needsRemoveLpApproval ? 'approve' : 'remove';
    setRemoveLiquidityAction(action);

    try {
      if (action === 'approve') {
        const txHash = await writeContractAsync({
          address: removePosition.pairId as Address,
          abi: fluxSwapPairAbi,
          functionName: 'approve',
          args: [routerAddress, maxUint256],
          chainId,
          ...localGasOverride,
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        if (receipt.status !== 'success') {
          throw new Error(isZh ? 'LP 授权交易失败。' : 'LP approval transaction failed.');
        }

        setRemoveLpAllowance(maxUint256);
        setRemoveLpAllowanceLoading(false);
        setRemoveLiquidityResultModal({
          kind: 'success',
          title: isZh ? '授权成功' : 'Approval successful',
          message: isZh ? 'LP 已授权，现在可以继续移除流动性。' : 'LP approved. You can now remove liquidity.',
        });
        return;
      }

      const latestBlock = await publicClient.getBlock();
      const deadline = latestBlock.timestamp + REMOVE_LIQUIDITY_DEADLINE_SECONDS;
      const token0IsNative =
        wrappedNativeAddress &&
        removePosition.token0Address.toLowerCase() === wrappedNativeAddress.toLowerCase();
      const token1IsNative =
        wrappedNativeAddress &&
        removePosition.token1Address.toLowerCase() === wrappedNativeAddress.toLowerCase();

      let txHash: `0x${string}`;

      if (token0IsNative || token1IsNative) {
        const tokenAddress = token0IsNative ? removePosition.token1Address : removePosition.token0Address;
        const amountTokenMin = token0IsNative ? removeMinToken1 : removeMinToken0;
        const amountETHMin = token0IsNative ? removeMinToken0 : removeMinToken1;

        txHash = await writeContractAsync({
          address: routerAddress,
          abi: fluxSwapRouterAbi,
          functionName: 'removeLiquidityETH',
          args: [
            tokenAddress,
            removeLiquidityAmount,
            amountTokenMin,
            amountETHMin,
            address,
            deadline,
          ],
          chainId,
          ...localGasOverride,
        });
      } else {
        txHash = await writeContractAsync({
          address: routerAddress,
          abi: fluxSwapRouterAbi,
          functionName: 'removeLiquidity',
          args: [
            removePosition.token0Address,
            removePosition.token1Address,
            removeLiquidityAmount,
            removeMinToken0,
            removeMinToken1,
            address,
            deadline,
          ],
          chainId,
          ...localGasOverride,
        });
      }

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== 'success') {
        throw new Error(isZh ? '移除流动性交易失败。' : 'Remove liquidity transaction failed.');
      }

      await Promise.allSettled([
        refreshPositionPoolState(removePosition.pairId as Address),
        refreshTokenBalances({ background: true }),
        refetchNativeBalance(),
        refetchFluxBalance(),
      ]);
      setRemoveLiquidityResultModal({
        kind: 'success',
        title: isZh ? '移除成功' : 'Liquidity removed',
        message: isZh ? '流动性已移除，仓位数据会随链上和子图刷新。' : 'Liquidity was removed. Position data will update with chain and subgraph refresh.',
      });
      setRemovePosition(null);
    } catch (error) {
      setRemoveLiquidityResultModal({
        kind: 'error',
        title: isZh ? '移除失败' : 'Remove failed',
        message: formatErrorMessage(error, {
          rejectedMessage: isZh ? '你已取消本次操作。' : 'You rejected this action.',
        }),
      });
    } finally {
      setRemoveLiquidityAction(null);
    }
  };

  const toggleExpandedLimitOrder = (order: LocalLimitOrderRecord) => {
    const orderKey = buildLimitOrderKey(order);
    setExpandedLimitOrderKey((current) => (current === orderKey ? null : orderKey));
  };

  if (!isConnected || !address) {
    return (
      <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-4 py-10 lg:px-6">
        <section className="w-full max-w-[560px] rounded-[2.25rem] border border-black/5 bg-white/78 p-7 text-center shadow-2xl shadow-sky-500/5 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.04]">
          <div className="mx-auto flex justify-center">
            <FluxSwapLogo />
          </div>

          <div className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
            {isZh ? '资产页' : 'Portfolio'}
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-gray-900 dark:text-white">
            {isZh ? '连接钱包后查看资产' : 'Connect wallet to view portfolio'}
          </h1>
          <p className="mx-auto mt-3 max-w-[380px] text-sm leading-6 text-gray-500 dark:text-gray-400">
            {isZh
              ? '连接钱包后，这里会展示你的资产余额、限价单、流动性仓位、活动和代币。'
              : 'After connecting your wallet, your balances, limit orders, liquidity positions, activity, and tokens will appear here.'}
          </p>

          <button
            type="button"
            onClick={() => openConnectModal?.()}
            className="mt-7 inline-flex h-12 items-center justify-center rounded-full bg-gray-900 px-7 text-sm font-bold text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
          >
            {isZh ? '连接钱包' : 'Connect wallet'}
          </button>
        </section>
      </div>
    );
  }

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
                    <span>{isZh ? '仓位数量' : 'Positions'}</span>
                    {showLpHint ? (
                      <span className="text-xs font-semibold text-gray-400 dark:text-gray-500">
                        {isZh
                          ? `持有 ${activePositionCount} 个池子`
                          : `${activePositionCount} active pools`}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 flex items-end gap-2">
                    <div className="text-4xl font-black tracking-tight text-gray-900 dark:text-white">
                      {lpDisplay}
                    </div>
                    <div className="pb-1 text-sm font-semibold text-gray-500 dark:text-gray-400">
                      {isZh ? '个' : 'positions'}
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
            contentClassName="mt-6 flex h-[360px] min-h-0 overflow-hidden rounded-[1.5rem] border border-dashed border-black/10 bg-gray-50/80 dark:border-white/10 dark:bg-white/[0.03]"
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
            ) : limitOrdersError ? (
              <div className="flex h-full w-full flex-1 flex-col items-center justify-center px-5 text-center">
                <div className="text-lg font-black tracking-tight text-gray-900 dark:text-white">
                  {isZh ? '限价单加载失败' : 'Failed to load limit orders'}
                </div>
                <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">{limitOrdersError}</div>
              </div>
            ) : limitOrderRows.length > 0 ? (
              <div className="flex h-full min-h-0 w-full flex-col">
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

                  <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1 [scrollbar-gutter:stable]">
                    {limitOrderRows.map((row) => (
                      <button
                        key={row.order.orderHash}
                        type="button"
                        onClick={() => {
                          setExpandedLimitOrderKey(buildLimitOrderKey(row.order));
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
            contentClassName="mt-6 flex h-[360px] min-h-0 overflow-hidden rounded-[1.5rem] border border-dashed border-black/10 bg-gray-50/80 dark:border-white/10 dark:bg-white/[0.03]"
          >
            {!isConnected || !address ? (
              <div className="flex h-full w-full flex-1 flex-col items-center justify-center px-5 text-center">
                <div className="text-lg font-black tracking-tight text-gray-900 dark:text-white">
                  {isZh ? '连接钱包后查看仓位' : 'Connect wallet to view positions'}
                </div>
                <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  {isZh
                    ? '这里会展示当前钱包持有的流动性仓位。'
                    : 'Liquidity positions held by this wallet will appear here.'}
                </div>
              </div>
            ) : positionRows.length > 0 ? (
              <div className="flex h-full min-h-0 w-full flex-col">
                <div className="flex items-center justify-between border-b border-black/5 px-5 py-4 dark:border-white/10">
                  <div>
                    <div className="text-sm font-black tracking-tight text-gray-900 dark:text-white">
                      {isZh ? '当前仓位' : 'Current positions'}
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {isZh ? '展示钱包持有 LP 的流动性池' : 'Pools where this wallet holds LP tokens'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsPositionsModalOpen(true)}
                    className="inline-flex min-w-8 items-center justify-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25"
                    title={isZh ? '查看仓位详情' : 'View position details'}
                  >
                    {positionRows.length}
                  </button>
                </div>

                <div className="flex min-h-0 flex-1 flex-col px-5 pb-5 pt-1">
                  <div className="grid grid-cols-[minmax(0,1fr)_128px] items-center gap-x-4 border-b border-black/5 px-3 py-3 text-[13px] font-semibold text-gray-500 dark:border-white/10 dark:text-gray-400">
                    <div className="min-w-0 whitespace-nowrap">{isZh ? '交易对' : 'Pair'}</div>
                    <div className="whitespace-nowrap text-right">{isZh ? 'LP 余额' : 'LP Balance'}</div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1 [scrollbar-gutter:stable]">
                    {positionRows.map((row) => (
                      <button
                        type="button"
                        key={row.pairId}
                        onClick={() => setIsPositionsModalOpen(true)}
                        className="grid w-full grid-cols-[minmax(0,1fr)_128px] items-center gap-x-4 border-b border-black/5 px-3 py-4 text-left transition-colors last:border-b-0 hover:bg-sky-50/60 dark:border-white/10 dark:hover:bg-white/[0.05]"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[15px] font-semibold tracking-tight text-gray-900 dark:text-white">
                            {row.pairLabel}
                          </div>
                        </div>
                        <div className="min-w-0 truncate text-right text-[14px] font-semibold tabular-nums text-gray-800 dark:text-gray-200">
                          {row.lpBalanceLabel}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full w-full flex-1 flex-col items-center justify-center px-5 text-center">
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
            )}
          </PortfolioSection>
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

        {isPositionsModalOpen && positionRows.length > 0 ? (
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm"
            onClick={closePositionsModal}
          >
            <div
              className="flex h-[760px] max-h-[calc(100vh-2rem)] w-full max-w-[76rem] flex-col rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-[#0f1726] xl:p-6"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">
                    {isZh ? '流动性仓位' : 'Liquidity Positions'}
                  </div>
                  <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {isZh
                      ? `共 ${positionRows.length} 个持仓池子`
                      : `${positionRows.length} pool position${positionRows.length > 1 ? 's' : ''}`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closePositionsModal}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.10]"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[1.25rem] border border-black/5 bg-gray-50/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]">
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                    {isZh ? '仓位数量' : 'Positions'}
                  </div>
                  <div className="mt-2 text-2xl font-black tracking-tight text-gray-900 dark:text-white">
                    {positionRows.length}
                  </div>
                </div>
                <div className="rounded-[1.25rem] border border-black/5 bg-gray-50/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]">
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                    {isZh ? '主要指标' : 'Key metric'}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                    {isZh ? '按 LP 份额估算可取回数量' : 'Withdrawable amounts estimated by LP share'}
                  </div>
                </div>
                <div className="rounded-[1.25rem] border border-black/5 bg-gray-50/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]">
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                    {isZh ? '说明' : 'Note'}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                    {isZh ? '实际移除时以链上池子状态为准' : 'Final withdrawal depends on on-chain pool state'}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex-1 overflow-hidden rounded-[1.5rem] border border-black/5 dark:border-white/10">
                <div className="hidden h-full overflow-y-auto overflow-x-hidden xl:block">
                  <div className="sticky top-0 z-10 grid grid-cols-[1.05fr_1.05fr_0.78fr_1.15fr_1.15fr_1fr] items-center gap-x-3 border-b border-black/5 bg-white/95 px-5 py-3 text-xs font-bold tracking-[0.08em] text-gray-500 backdrop-blur-sm dark:border-white/10 dark:bg-[#0f1726]/95 dark:text-gray-400">
                    <div>{isZh ? '交易对' : 'Pair'}</div>
                    <div className="text-right">{isZh ? 'LP 余额' : 'LP Balance'}</div>
                    <div className="text-right">{isZh ? '池子份额' : 'Pool Share'}</div>
                    <div className="text-right">{isZh ? '可取回代币一' : 'Token A'}</div>
                    <div className="text-right">{isZh ? '可取回代币二' : 'Token B'}</div>
                    <div className="text-right">{isZh ? '操作' : 'Action'}</div>
                  </div>

                  <div className="divide-y divide-black/5 dark:divide-white/10">
                    {positionRows.map((row) => (
                      <div
                        key={row.pairId}
                        className="grid grid-cols-[1.05fr_1.05fr_0.78fr_1.15fr_1.15fr_1fr] items-center gap-x-3 px-5 py-4 text-sm text-gray-700 dark:text-gray-300"
                      >
                        <Link href={row.poolHref} className="min-w-0 rounded-xl transition-colors hover:text-sky-600">
                          <div className="truncate font-black tracking-tight text-gray-900 transition-colors hover:text-sky-600 dark:text-white dark:hover:text-sky-300">
                            {row.pairLabel}
                          </div>
                          <div className="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400">
                            {truncateAddress(row.pairId)}
                          </div>
                        </Link>
                        <div className="min-w-0 truncate text-right font-semibold tabular-nums">{row.lpBalanceLabel}</div>
                        <div className="text-right font-semibold tabular-nums">{row.poolShareLabel}</div>
                        <div className="min-w-0 truncate text-right font-semibold tabular-nums">{row.withdrawToken0Label}</div>
                        <div className="min-w-0 truncate text-right font-semibold tabular-nums">{row.withdrawToken1Label}</div>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openRemoveLiquidityModal(row)}
                            className="inline-flex h-9 items-center justify-center rounded-full border border-rose-200 px-3 text-xs font-semibold text-rose-600 transition-colors hover:border-rose-300 hover:bg-rose-50 dark:border-rose-400/25 dark:text-rose-300 dark:hover:bg-rose-400/10"
                          >
                            {isZh ? '移除' : 'Remove'}
                          </button>
                          <Link
                            href={row.addLiquidityHref}
                            className="inline-flex h-9 items-center justify-center rounded-full bg-gray-900 px-3 text-xs font-semibold text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
                          >
                            {isZh ? '添加' : 'Add'}
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="h-full space-y-3 overflow-y-auto p-4 xl:hidden">
                  {positionRows.map((row) => (
                    <div
                      key={row.pairId}
                      className="rounded-[1.35rem] border border-black/5 bg-gray-50/80 p-4 dark:border-white/10 dark:bg-white/[0.03]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link href={row.poolHref} className="block truncate text-base font-black tracking-tight text-gray-900 transition-colors hover:text-sky-600 dark:text-white dark:hover:text-sky-300">
                            {row.pairLabel}
                          </Link>
                          <div className="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400">
                            {truncateAddress(row.pairId)}
                          </div>
                        </div>
                        <div className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                          {row.poolShareLabel}
                        </div>
                      </div>

                      <div className="mt-4 grid gap-2.5 text-sm">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-gray-500 dark:text-gray-400">{isZh ? 'LP 余额' : 'LP Balance'}</span>
                          <span className="font-semibold tabular-nums text-gray-900 dark:text-white">{row.lpBalanceLabel}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-gray-500 dark:text-gray-400">{row.token0Symbol}</span>
                          <span className="font-semibold tabular-nums text-gray-900 dark:text-white">{row.withdrawToken0Label}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-gray-500 dark:text-gray-400">{row.token1Symbol}</span>
                          <span className="font-semibold tabular-nums text-gray-900 dark:text-white">{row.withdrawToken1Label}</span>
                        </div>
                      </div>

                      <div className="mt-4 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openRemoveLiquidityModal(row)}
                          className="inline-flex h-9 items-center justify-center rounded-full border border-rose-200 px-3 text-xs font-semibold text-rose-600 transition-colors hover:border-rose-300 hover:bg-rose-50 dark:border-rose-400/25 dark:text-rose-300 dark:hover:bg-rose-400/10"
                        >
                          {isZh ? '移除流动性' : 'Remove liquidity'}
                        </button>
                        <Link
                          href={row.addLiquidityHref}
                          className="inline-flex h-9 items-center justify-center rounded-full bg-gray-900 px-3 text-xs font-semibold text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
                        >
                          {isZh ? '添加流动性' : 'Add liquidity'}
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {removePosition ? (
          <div
            className="fixed inset-0 z-[95] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm"
            onClick={closeRemoveLiquidityModal}
          >
            <div
              className="w-full max-w-[560px] rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-[#0f1726]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">
                    {isZh ? '移除流动性' : 'Remove Liquidity'}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-gray-500 dark:text-gray-400">
                    {removePosition.pairLabel}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeRemoveLiquidityModal}
                  disabled={Boolean(removeLiquidityAction)}
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
                    removeLiquidityAction
                      ? 'cursor-not-allowed bg-gray-100 text-gray-300 dark:bg-white/[0.04] dark:text-gray-600'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.10]'
                  }`}
                  aria-label={isZh ? '关闭' : 'Close'}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[1.2rem] bg-gray-50/90 px-4 py-3 dark:bg-white/[0.04]">
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                    {isZh ? 'LP 余额' : 'LP Balance'}
                  </div>
                  <div className="mt-1 truncate text-base font-black tabular-nums text-gray-900 dark:text-white">
                    {removePosition.lpBalanceLabel}
                  </div>
                </div>
                <div className="rounded-[1.2rem] bg-gray-50/90 px-4 py-3 dark:bg-white/[0.04]">
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                    {isZh ? '池子份额' : 'Pool Share'}
                  </div>
                  <div className="mt-1 text-base font-black tabular-nums text-gray-900 dark:text-white">
                    {removePosition.poolShareLabel}
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-[1.35rem] border border-black/5 p-4 dark:border-white/10">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-bold text-gray-900 dark:text-white">
                    {isZh ? '移除比例' : 'Remove Percent'}
                  </div>
                  <div className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                    {removeLiquidityAmountLabel}
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2 rounded-[1.15rem] bg-gray-50 p-2 dark:bg-white/[0.04]">
                  <input
                    value={removePercentInput}
                    onChange={(event) => setRemovePercentInput(event.target.value)}
                    inputMode="decimal"
                    disabled={Boolean(removeLiquidityAction)}
                    className="min-w-0 flex-1 bg-transparent px-2 text-3xl font-black tabular-nums text-gray-900 outline-none placeholder:text-gray-300 disabled:cursor-not-allowed dark:text-white dark:placeholder:text-gray-700"
                    placeholder="0"
                  />
                  <span className="pr-2 text-xl font-black text-gray-400">%</span>
                </div>

                <div className="mt-3 grid grid-cols-4 gap-2">
                  {['25', '50', '75', '100'].map((percent) => (
                    <button
                      type="button"
                      key={percent}
                      disabled={Boolean(removeLiquidityAction)}
                      onClick={() => setRemovePercentInput(percent)}
                      className={`h-9 rounded-full text-sm font-bold transition-colors ${
                        removePercentInput === percent
                          ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.10]'
                      } ${removeLiquidityAction ? 'cursor-not-allowed opacity-60' : ''}`}
                    >
                      {percent}%
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid gap-3">
                <div className="rounded-[1.25rem] bg-gray-50/90 px-4 py-3 dark:bg-white/[0.04]">
                  <div className="text-sm font-bold text-gray-900 dark:text-white">
                    {isZh ? '预计取回' : 'Estimated Receive'}
                  </div>
                  <div className="mt-3 grid gap-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-gray-500 dark:text-gray-400">{removePosition.token0Symbol}</span>
                      <span className="min-w-0 truncate font-semibold tabular-nums text-gray-900 dark:text-white">
                        {removeEstimatedToken0Label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-gray-500 dark:text-gray-400">{removePosition.token1Symbol}</span>
                      <span className="min-w-0 truncate font-semibold tabular-nums text-gray-900 dark:text-white">
                        {removeEstimatedToken1Label}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.25rem] bg-amber-50/80 px-4 py-3 dark:bg-amber-400/[0.08]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-bold text-amber-800 dark:text-amber-200">
                      {isZh ? '最少取回' : 'Minimum Receive'}
                    </div>
                    <div className="text-xs font-semibold text-amber-700/80 dark:text-amber-200/80">
                      {isZh ? '含 0.5% 滑点保护' : '0.5% slippage protected'}
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-amber-700/80 dark:text-amber-200/80">{removePosition.token0Symbol}</span>
                      <span className="min-w-0 truncate font-semibold tabular-nums text-amber-900 dark:text-amber-100">
                        {removeMinToken0Label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-amber-700/80 dark:text-amber-200/80">{removePosition.token1Symbol}</span>
                      <span className="min-w-0 truncate font-semibold tabular-nums text-amber-900 dark:text-amber-100">
                        {removeMinToken1Label}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  void handleRemoveLiquidityAction();
                }}
                disabled={removeLiquidityButtonDisabled}
                className={`mt-5 inline-flex h-12 w-full items-center justify-center rounded-[1rem] text-base font-bold transition-colors ${
                  removeLiquidityButtonDisabled
                    ? 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-white/[0.06] dark:text-gray-500'
                    : needsRemoveLpApproval
                      ? 'bg-sky-600 text-white hover:bg-sky-700'
                      : 'bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200'
                }`}
              >
                {removeLiquidityButtonLabel}
              </button>
            </div>
          </div>
        ) : null}

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

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-black/5 bg-gray-50/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]">
                <div className="flex flex-wrap items-center gap-3 pl-[36px] text-sm text-gray-600 dark:text-gray-300">
                  <span>
                    {isZh
                      ? `已选择 ${selectedLimitOrders.length} 笔，可撤 ${selectableLimitOrderRows.length} 笔`
                      : `${selectedLimitOrders.length} selected, ${selectableLimitOrderRows.length} cancellable`}
                  </span>
                </div>

                <div className="mr-[36px] flex items-center gap-2">
                  <button
                    type="button"
                    onClick={clearSelectedLimitOrders}
                    disabled={selectedLimitOrders.length === 0 || isCancellingLimitOrders}
                    className={`inline-flex h-9 items-center justify-center rounded-full px-3 text-sm font-semibold transition-colors ${
                      selectedLimitOrders.length > 0 && !isCancellingLimitOrders
                        ? 'text-gray-600 hover:bg-white dark:text-gray-300 dark:hover:bg-white/[0.08]'
                        : 'cursor-not-allowed text-gray-400 dark:text-gray-600'
                    }`}
                  >
                    {isZh ? '清空' : 'Clear'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleBatchCancelLimitOrders();
                    }}
                    disabled={selectedLimitOrders.length === 0 || isCancellingLimitOrders}
                    className={`inline-flex h-9 min-w-[112px] items-center justify-center rounded-full px-4 text-sm font-semibold transition-colors ${
                      selectedLimitOrders.length > 0 && !isCancellingLimitOrders
                        ? 'bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200'
                        : 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-white/[0.06] dark:text-gray-500'
                    }`}
                  >
                    {isCancellingLimitOrders
                      ? isZh
                        ? '处理中...'
                        : 'Processing...'
                      : isZh
                        ? '批量撤单'
                        : 'Batch Cancel'}
                  </button>
                </div>
              </div>

              <div className="mt-4 flex-1 overflow-hidden rounded-[1.5rem] border border-black/5 dark:border-white/10">
                <div className="hidden h-full overflow-y-auto overflow-x-hidden xl:block">
                  <div className="mx-auto w-full max-w-[82rem]">
                    <div className="sticky top-0 z-10 grid w-full grid-cols-[44px_1.35fr_1.35fr_1.35fr_1.35fr_0.9fr_0.9fr_0.9fr_0.9fr] items-center gap-x-2 border-b border-black/5 bg-white/95 px-4 py-3 text-[11px] font-bold tracking-[0.08em] text-gray-500 backdrop-blur-sm dark:border-white/10 dark:bg-[#0f1726]/95 dark:text-gray-400">
                      <div className="flex justify-center">
                        <button
                          type="button"
                          onClick={toggleAllSelectableLimitOrders}
                          disabled={selectableLimitOrderRows.length === 0 || isCancellingLimitOrders}
                          className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                            allSelectableLimitOrdersSelected
                              ? 'border-sky-600 bg-sky-600 text-white'
                              : 'border-gray-300 bg-white hover:border-gray-400 dark:border-gray-600 dark:bg-transparent'
                          } ${
                            selectableLimitOrderRows.length === 0 || isCancellingLimitOrders
                              ? 'cursor-not-allowed opacity-50'
                              : ''
                          }`}
                          aria-label={isZh ? '全选可撤单订单' : 'Select all cancellable orders'}
                        >
                          {allSelectableLimitOrdersSelected ? <CheckCircle2 size={13} /> : null}
                        </button>
                      </div>
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
                        const createdAtParts = splitDateTimeLabel(row.createdAtLabel);
                        const expiryParts = splitDateTimeLabel(row.expiryLabel);
                        const orderKey = buildLimitOrderKey(row.order);
                        const isExpanded = expandedLimitOrderKey === orderKey;
                        const isProcessingCurrent = cancellingOrderKeySet.has(orderKey);
                        const isAnotherActionRunning = isCancellingLimitOrders && !isProcessingCurrent;
                        const actionMeta = getLimitOrderActionMeta(
                          row.order,
                          isZh,
                          isProcessingCurrent,
                          isAnotherActionRunning,
                        );
                        const isSelected = selectedLimitOrderKeySet.has(orderKey);
                        const canSelect = !actionMeta.disabled && !isCancellingLimitOrders;

                        return (
                          <div
                            key={row.order.orderHash}
                            className="overflow-hidden"
                          >
                            <div
                              role="button"
                              tabIndex={0}
                              aria-expanded={isExpanded}
                              onClick={() => toggleExpandedLimitOrder(row.order)}
                              onKeyDown={(event) =>
                                toggleWithKeyboard(event, () => toggleExpandedLimitOrder(row.order))
                              }
                              className={`grid w-full cursor-pointer grid-cols-[44px_1.35fr_1.35fr_1.35fr_1.35fr_0.9fr_0.9fr_0.9fr_0.9fr] items-center gap-x-2 px-4 py-4 text-sm leading-5 text-gray-700 transition-colors dark:text-gray-300 ${
                                isExpanded
                                  ? 'bg-sky-50/70 dark:bg-white/[0.06]'
                                  : 'hover:bg-sky-50/50 dark:hover:bg-white/[0.05]'
                              }`}
                            >
                              <div className="flex justify-center">
                                <button
                                  type="button"
                                  disabled={!canSelect}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (canSelect) {
                                      toggleLimitOrderSelection(row.order);
                                    }
                                  }}
                                  className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                                    isSelected
                                      ? 'border-sky-600 bg-sky-600 text-white'
                                      : 'border-gray-300 bg-white hover:border-gray-400 dark:border-gray-600 dark:bg-transparent'
                                  } ${!canSelect ? 'cursor-not-allowed opacity-40' : ''}`}
                                  aria-label={isZh ? '选择订单' : 'Select order'}
                                >
                                  {isSelected ? <CheckCircle2 size={13} /> : null}
                                </button>
                              </div>
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
                                  disabled={actionMeta.disabled}
                                  title={actionMeta.title}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (!actionMeta.disabled) {
                                      void handleCancelLimitOrder(row.order);
                                    }
                                  }}
                                  className={`inline-flex min-w-[68px] items-center justify-center rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
                                    !actionMeta.disabled
                                      ? 'bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200'
                                      : 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-white/[0.06] dark:text-gray-500'
                                  }`}
                                >
                                  {actionMeta.label}
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
                    const orderKey = buildLimitOrderKey(row.order);
                    const isExpanded = expandedLimitOrderKey === orderKey;
                    const isProcessingCurrent = cancellingOrderKeySet.has(orderKey);
                    const isAnotherActionRunning = isCancellingLimitOrders && !isProcessingCurrent;
                    const actionMeta = getLimitOrderActionMeta(
                      row.order,
                      isZh,
                      isProcessingCurrent,
                      isAnotherActionRunning,
                    );
                    const isSelected = selectedLimitOrderKeySet.has(orderKey);
                    const canSelect = !actionMeta.disabled && !isCancellingLimitOrders;

                    return (
                      <div
                        key={row.order.orderHash}
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        onClick={() => toggleExpandedLimitOrder(row.order)}
                        onKeyDown={(event) =>
                          toggleWithKeyboard(event, () => toggleExpandedLimitOrder(row.order))
                        }
                        className={`rounded-[1.35rem] border border-black/5 p-4 transition-colors dark:border-white/10 ${
                          isExpanded
                            ? 'bg-sky-50/70 dark:bg-white/[0.05]'
                            : 'bg-gray-50/80 dark:bg-white/[0.03]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <button
                              type="button"
                              disabled={!canSelect}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (canSelect) {
                                  toggleLimitOrderSelection(row.order);
                                }
                              }}
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                                isSelected
                                  ? 'border-sky-600 bg-sky-600 text-white'
                                  : 'border-gray-300 bg-white hover:border-gray-400 dark:border-gray-600 dark:bg-transparent'
                              } ${!canSelect ? 'cursor-not-allowed opacity-40' : ''}`}
                              aria-label={isZh ? '选择订单' : 'Select order'}
                            >
                              {isSelected ? <CheckCircle2 size={13} /> : null}
                            </button>
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
                            disabled={actionMeta.disabled}
                            title={actionMeta.title}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (!actionMeta.disabled) {
                                void handleCancelLimitOrder(row.order);
                              }
                            }}
                            className={`inline-flex min-w-[88px] items-center justify-center rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${
                              !actionMeta.disabled
                                ? 'bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200'
                                : 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-white/[0.06] dark:text-gray-500'
                            }`}
                          >
                            {actionMeta.label}
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
        {limitOrderResultModal ? (
          <div
            className="fixed inset-0 z-[95] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]"
            onClick={closeLimitOrderResultModal}
          >
            <div
              className="w-full max-w-[460px] rounded-[1.7rem] bg-white px-5 py-5 shadow-2xl dark:bg-gray-900"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-end">
                <button
                  type="button"
                  onClick={closeLimitOrderResultModal}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                  aria-label={isZh ? '关闭' : 'Close'}
                >
                  <X size={22} />
                </button>
              </div>

              <div className="flex flex-col items-center px-3 pb-1 pt-1 text-center">
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-[1rem] ${
                    limitOrderResultModal.kind === 'success'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  {limitOrderResultModal.kind === 'success' ? (
                    <CheckCircle2 size={26} />
                  ) : (
                    <AlertCircle size={26} />
                  )}
                </div>

                <h3 className="mt-5 text-[1.65rem] font-semibold tracking-tight text-gray-950 dark:text-white">
                  {limitOrderResultModal.title}
                </h3>

                <p className="mt-2.5 text-base leading-7 text-gray-500 dark:text-gray-300">
                  {limitOrderResultModal.message}
                </p>
              </div>

              <div className="mt-6">
                <button
                  type="button"
                  onClick={closeLimitOrderResultModal}
                  className="inline-flex h-11 w-full items-center justify-center rounded-[1rem] bg-[#232323] text-base font-medium text-white transition-colors hover:bg-black dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
                >
                  {isZh ? '确定' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {removeLiquidityResultModal ? (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]"
            onClick={closeRemoveLiquidityResultModal}
          >
            <div
              className="w-full max-w-[460px] rounded-[1.7rem] bg-white px-5 py-5 shadow-2xl dark:bg-gray-900"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-end">
                <button
                  type="button"
                  onClick={closeRemoveLiquidityResultModal}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                  aria-label={isZh ? '关闭' : 'Close'}
                >
                  <X size={22} />
                </button>
              </div>

              <div className="flex flex-col items-center px-3 pb-1 pt-1 text-center">
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-[1rem] ${
                    removeLiquidityResultModal.kind === 'success'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  {removeLiquidityResultModal.kind === 'success' ? (
                    <CheckCircle2 size={26} />
                  ) : (
                    <AlertCircle size={26} />
                  )}
                </div>

                <h3 className="mt-5 text-[1.65rem] font-semibold tracking-tight text-gray-950 dark:text-white">
                  {removeLiquidityResultModal.title}
                </h3>

                <p className="mt-2.5 text-base leading-7 text-gray-500 dark:text-gray-300">
                  {removeLiquidityResultModal.message}
                </p>
              </div>

              <div className="mt-6">
                <button
                  type="button"
                  onClick={closeRemoveLiquidityResultModal}
                  className="inline-flex h-11 w-full items-center justify-center rounded-[1rem] bg-[#232323] text-base font-medium text-white transition-colors hover:bg-black dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
                >
                  {isZh ? '确定' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
