'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownUp,
  Check,
  ChevronsUpDown,
  ChevronRight,
  Clock3,
  Droplets,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useChainId, usePublicClient } from 'wagmi';

import { MarketTabs } from '@/components/pool/MarketTabs';
import { getContractAddress, isFluxSupportedChain } from '@/config/contracts';
import { formatBigIntAmountDown } from '@/lib/amounts';
import { getTrades, type TradeViewModel } from '@/lib/subgraph/trades';
import { formatTimestamp, truncateAddress } from '@/lib/wallet';

type EmptyTradeStateProps = {
  isZh: boolean;
  supportedChain: boolean;
  title?: string;
  description?: string;
};

type TradeActivityType = TradeViewModel['type'];

type TradeRow = {
  id: string;
  txHash: string;
  activityType: TradeActivityType;
  activityLabel: string;
  relationLabel: string;
  primaryLabel: string;
  secondaryLabel: string;
  walletLabel: string;
  timeLabel: string;
  isLiquidity: boolean;
};

type ActivityFilterOption = {
  value: TradeActivityType;
  label: string;
};

const ALL_ACTIVITY_TYPES: TradeActivityType[] = ['swap', 'add', 'remove'];

function getTransactionHref(chainId: number | undefined, txHash: string): string | undefined {
  if (!txHash) {
    return undefined;
  }

  if (chainId === 11155111) {
    return `https://sepolia.etherscan.io/tx/${txHash}`;
  }

  return undefined;
}

function EmptyTradeState({
  isZh,
  supportedChain,
  title,
  description,
}: EmptyTradeStateProps) {
  const resolvedTitle = title
    ? title
    : supportedChain
      ? isZh
        ? '当前还没有市场活动'
        : 'No market activity yet'
      : isZh
        ? '当前网络暂不支持'
        : 'Unsupported network';

  return (
    <div className="mt-3 rounded-[1.8rem] border border-dashed border-black/10 bg-white/45 px-6 py-12 text-center backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.03]">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300">
        <ArrowDownUp size={24} />
      </div>

      <div className="mt-4 text-lg font-black tracking-tight text-gray-900 dark:text-white">
        {resolvedTitle}
      </div>

      {description ? (
        <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">{description}</div>
      ) : null}
    </div>
  );
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
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full ${
        isLiquidity
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
          : 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300'
      }`}
    >
      {isLiquidity ? <Droplets size={18} /> : <ArrowDownUp size={18} />}
    </span>
  );
}

function buildTradeSummary(
  trade: TradeViewModel,
  walletAddress: string | undefined,
  wrappedNativeAddress?: string,
  isZh?: boolean,
): TradeRow {
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
  const timeLabel = formatTimestamp(trade.timestamp, isZh ? 'zh-CN' : 'en-US');
  const walletLabel = truncateAddress(walletAddress ?? trade.sender);

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
      activityType: trade.type,
      activityLabel: isZh ? '交换' : 'Swap',
      relationLabel: `${soldToken.symbol} ${isZh ? '兑换' : 'for'} ${boughtToken.symbol}`,
      primaryLabel: `${formatBigIntAmountDown(soldToken.amount, soldToken.decimals, 6)} ${soldToken.symbol}`,
      secondaryLabel: `${formatBigIntAmountDown(boughtToken.amount, boughtToken.decimals, 6)} ${boughtToken.symbol}`,
      walletLabel,
      timeLabel,
      isLiquidity: false,
    };
  }

  if (trade.type === 'add') {
    return {
      id: trade.id,
      txHash: trade.txHash,
      activityType: trade.type,
      activityLabel: isZh ? '添加' : 'Add',
      relationLabel: `${token0Symbol} + ${token1Symbol}`,
      primaryLabel: `${formatBigIntAmountDown(trade.amount0, trade.pair.token0.decimals, 6)} ${token0Symbol}`,
      secondaryLabel: `${formatBigIntAmountDown(trade.amount1, trade.pair.token1.decimals, 6)} ${token1Symbol}`,
      walletLabel,
      timeLabel,
      isLiquidity: true,
    };
  }

  return {
    id: trade.id,
    txHash: trade.txHash,
    activityType: trade.type,
    activityLabel: isZh ? '移除' : 'Remove',
    relationLabel: `${token0Symbol} + ${token1Symbol}`,
    primaryLabel: `${formatBigIntAmountDown(trade.amount0, trade.pair.token0.decimals, 6)} ${token0Symbol}`,
    secondaryLabel: `${formatBigIntAmountDown(trade.amount1, trade.pair.token1.decimals, 6)} ${token1Symbol}`,
    walletLabel,
    timeLabel,
    isLiquidity: true,
  };
}

export default function PoolTradePage() {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });

  const supportedChain = isFluxSupportedChain(chainId);
  const factoryAddress = getContractAddress('FluxSwapFactory', chainId);
  const wrappedNativeAddress = getContractAddress('MockWETH', chainId);

  const [trades, setTrades] = useState<TradeViewModel[]>([]);
  const [walletByTxHash, setWalletByTxHash] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [typeFilterOpen, setTypeFilterOpen] = useState(false);
  const [activeTradeTypes, setActiveTradeTypes] =
    useState<TradeActivityType[]>(ALL_ACTIVITY_TYPES);

  const typeFilterWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!supportedChain) {
      setTrades([]);
      setWalletByTxHash({});
      setFetchError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setFetchError(null);

    (async () => {
      try {
        const subgraphTrades = await getTrades(120);
        if (!cancelled) {
          setTrades(subgraphTrades);
          setWalletByTxHash({});
        }
      } catch (error) {
        if (!cancelled) {
          setTrades([]);
          setWalletByTxHash({});
          setFetchError(error instanceof Error ? error.message : 'Failed to load market activity');
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
  }, [factoryAddress, supportedChain]);

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

  useEffect(() => {
    if (!typeFilterOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!typeFilterWrapRef.current?.contains(event.target as Node)) {
        setTypeFilterOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setTypeFilterOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [typeFilterOpen]);

  const activityFilterOptions = useMemo<ActivityFilterOption[]>(
    () => [
      { value: 'swap', label: isZh ? '交换' : 'Swap' },
      { value: 'add', label: isZh ? '添加流动性' : 'Add liquidity' },
      { value: 'remove', label: isZh ? '移除流动性' : 'Remove liquidity' },
    ],
    [isZh],
  );

  const tradeRows = useMemo(() => {
    return trades.map((trade) =>
      buildTradeSummary(
        trade,
        walletByTxHash[trade.txHash.toLowerCase()],
        wrappedNativeAddress,
        isZh,
      ),
    );
  }, [trades, walletByTxHash, wrappedNativeAddress, isZh]);

  const filteredTradeRows = useMemo(() => {
    const enabledTypes = new Set(activeTradeTypes);
    return tradeRows.filter((trade) => enabledTypes.has(trade.activityType));
  }, [activeTradeTypes, tradeRows]);

  const toggleTradeType = (type: TradeActivityType) => {
    setActiveTradeTypes((current) => {
      if (current.includes(type)) {
        if (current.length === 1) {
          return current;
        }

        return current.filter((item) => item !== type);
      }

      return ALL_ACTIVITY_TYPES.filter((item) => current.includes(item) || item === type);
    });
  };

  return (
    <div className="px-4 py-8 lg:px-6 lg:py-10">
      <section className="lg:px-1">
        <MarketTabs active="transactions" />

        <div className="mt-6 hidden lg:block">
          <div className="grid grid-cols-[0.9fr_1.95fr_1.2fr_1.2fr_0.8fr] gap-4 rounded-[1.5rem] bg-gray-100/80 px-5 py-4 text-sm font-bold tracking-[0.08em] text-gray-600 dark:bg-white/[0.04] dark:text-gray-300">
            <div>{isZh ? '时间' : 'Time'}</div>
            <div className="relative" ref={typeFilterWrapRef}>
              <button
                type="button"
                onClick={() => setTypeFilterOpen((current) => !current)}
                className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700 transition-colors hover:text-gray-900 dark:text-gray-200 dark:hover:text-white"
              >
                <ChevronsUpDown size={14} className="text-gray-400 dark:text-gray-500" />
                <span>{isZh ? '类型' : 'Type'}</span>
              </button>

              {typeFilterOpen ? (
                <div className="absolute left-0 top-full z-20 mt-3 w-56 rounded-2xl border border-black/5 bg-white p-2 shadow-[0_18px_44px_rgba(15,23,42,0.14)] dark:border-white/10 dark:bg-[#0f1726]">
                  {activityFilterOptions.map((option) => {
                    const checked = activeTradeTypes.includes(option.value);

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => toggleTradeType(option.value)}
                        className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/[0.06]"
                      >
                        <span>{option.label}</span>
                        <span
                          className={`inline-flex h-5 w-5 items-center justify-center rounded-md border ${
                            checked
                              ? 'border-sky-500 bg-sky-500 text-white'
                              : 'border-gray-300 text-transparent dark:border-white/15'
                          }`}
                        >
                          <Check size={12} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <div>{isZh ? '代币数量' : 'Token amount'}</div>
            <div>{isZh ? '代币数量' : 'Token amount'}</div>
            <div>{isZh ? '钱包' : 'Wallet'}</div>
          </div>

          {loading ? (
            <EmptyTradeState
              isZh={isZh}
              supportedChain={supportedChain}
              title={isZh ? '正在加载市场活动' : 'Loading market activity'}
            />
          ) : fetchError ? (
            <EmptyTradeState
              isZh={isZh}
              supportedChain={supportedChain}
              title={isZh ? '市场活动加载失败' : 'Failed to load market activity'}
              description={fetchError}
            />
          ) : filteredTradeRows.length > 0 ? (
            filteredTradeRows.map((trade) => {
              const transactionHref = getTransactionHref(chainId, trade.txHash);

              const content = (
                <>
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-600 dark:text-gray-300">
                    <Clock3 size={15} />
                    <span>{trade.timeLabel}</span>
                    {transactionHref ? <ChevronRight size={16} className="text-gray-400" /> : null}
                  </div>

                  <div className="flex min-w-0 items-center gap-4">
                    <ActivityIcon isLiquidity={trade.isLiquidity} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-lg font-black tracking-tight text-gray-900 dark:text-white">
                          {trade.activityLabel}
                        </span>
                        <span className="text-lg font-medium text-gray-700 dark:text-gray-300">
                          {trade.relationLabel}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    {trade.primaryLabel}
                  </div>

                  <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    {trade.secondaryLabel}
                  </div>

                  <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    {trade.walletLabel}
                  </div>
                </>
              );

              if (!transactionHref) {
                return (
                  <div
                    key={trade.id}
                    className="mt-3 grid grid-cols-[0.9fr_1.95fr_1.2fr_1.2fr_0.8fr] items-center gap-4 rounded-[1.8rem] border border-black/5 px-5 py-5 transition-colors hover:bg-sky-50/50 dark:border-white/10 dark:hover:bg-white/[0.03]"
                  >
                    {content}
                  </div>
                );
              }

              return (
                <a
                  key={trade.id}
                  href={transactionHref}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 grid grid-cols-[0.9fr_1.95fr_1.2fr_1.2fr_0.8fr] items-center gap-4 rounded-[1.8rem] border border-black/5 px-5 py-5 transition-colors hover:bg-sky-50/50 dark:border-white/10 dark:hover:bg-white/[0.03]"
                >
                  {content}
                </a>
              );
            })
          ) : (
            <EmptyTradeState
              isZh={isZh}
              supportedChain={supportedChain}
              title={isZh ? '没有符合筛选条件的活动' : 'No matching activity'}
            />
          )}
        </div>

        <div className="mt-6 lg:hidden">
          {loading ? (
            <EmptyTradeState
              isZh={isZh}
              supportedChain={supportedChain}
              title={isZh ? '正在加载市场活动' : 'Loading market activity'}
            />
          ) : fetchError ? (
            <EmptyTradeState
              isZh={isZh}
              supportedChain={supportedChain}
              title={isZh ? '市场活动加载失败' : 'Failed to load market activity'}
              description={fetchError}
            />
          ) : filteredTradeRows.length > 0 ? (
            <div className="space-y-4">
              {filteredTradeRows.map((trade) => {
                const transactionHref = getTransactionHref(chainId, trade.txHash);

                const content = (
                  <>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <ActivityIcon isLiquidity={trade.isLiquidity} />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-lg font-black tracking-tight text-gray-900 dark:text-white">
                              {trade.activityLabel}
                            </span>
                            <span className="text-base font-medium text-gray-700 dark:text-gray-300">
                              {trade.relationLabel}
                            </span>
                          </div>
                        </div>
                      </div>

                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                        <Clock3 size={12} />
                        {trade.timeLabel}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3">
                      <div className="rounded-[1.35rem] bg-gray-100 p-4 dark:bg-white/[0.05]">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                          {isZh ? '代币数量' : 'Token amount'}
                        </div>
                        <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                          {trade.primaryLabel}
                        </div>
                      </div>

                      <div className="rounded-[1.35rem] bg-gray-100 p-4 dark:bg-white/[0.05]">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                          {isZh ? '代币数量' : 'Token amount'}
                        </div>
                        <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                          {trade.secondaryLabel}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between text-sm">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                          {isZh ? '钱包' : 'Wallet'}
                        </div>
                        <div className="mt-1 font-semibold text-gray-900 dark:text-white">
                          {trade.walletLabel}
                        </div>
                      </div>

                      {transactionHref ? (
                        <div className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
                          <span>{isZh ? '查看交易' : 'View transaction'}</span>
                          <ChevronRight size={16} />
                        </div>
                      ) : null}
                    </div>
                  </>
                );

                if (!transactionHref) {
                  return (
                    <div
                      key={trade.id}
                      className="rounded-[1.9rem] border border-black/5 bg-white p-5 dark:border-white/10 dark:bg-white/[0.03]"
                    >
                      {content}
                    </div>
                  );
                }

                return (
                  <a
                    key={trade.id}
                    href={transactionHref}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-[1.9rem] border border-black/5 bg-white p-5 dark:border-white/10 dark:bg-white/[0.03]"
                  >
                    {content}
                  </a>
                );
              })}
            </div>
          ) : (
            <EmptyTradeState
              isZh={isZh}
              supportedChain={supportedChain}
              title={isZh ? '没有符合筛选条件的活动' : 'No matching activity'}
            />
          )}
        </div>
      </section>
    </div>
  );
}
