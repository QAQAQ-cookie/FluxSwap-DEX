'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownUp,
  ArrowRight,
  Clock3,
  Coins,
  Droplets,
  History,
  Layers3,
  ListOrdered,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAccount, useBalance, useChainId, usePublicClient } from 'wagmi';

import { getContractAddress, isFluxSupportedChain } from '@/config/contracts';
import { getSwapTokenOptions } from '@/config/tokens';
import { formatBigIntAmount, formatBigIntAmountDown, formatDisplayAmount } from '@/lib/amounts';
import { fluxSwapPairAbi } from '@/lib/contracts';
import { fluxSwapErc20Abi } from '@/lib/contracts/generated/FluxSwapERC20';
import { getPools, type PoolViewModel } from '@/lib/subgraph/pools';
import { getTrades, type TradeViewModel } from '@/lib/subgraph/trades';
import { formatTimestamp } from '@/lib/wallet';

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
}: {
  title: string;
  description: string;
  icon: typeof ListOrdered;
  emptyContent?: React.ReactNode;
}) {
  return (
    <section className="rounded-[2rem] border border-black/5 bg-white/72 p-6 shadow-xl shadow-sky-500/5 backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.04] min-h-[360px]">
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

      <div className="mt-6 rounded-[1.5rem] border border-dashed border-black/10 bg-gray-50/80 px-5 py-20 text-center dark:border-white/10 dark:bg-white/[0.03] min-h-[240px] flex items-center justify-center">
        {emptyContent ?? (
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

type TokenSortDirection = 'desc' | 'asc';

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
    () => Object.values(lpBalances).reduce((sum, balance) => sum + balance, 0n),
    [lpBalances],
  );
  const activePositionCount = useMemo(
    () => Object.values(lpBalances).filter((balance) => balance > 0n).length,
    [lpBalances],
  );

  const fluxDisplay = isConnected
    ? formatDisplayAmount(fluxBalance?.formatted)
    : '--';

  const lpDisplay = isConnected
    ? formatBigIntAmount(totalLpBalance, 18, 4)
    : '--';
  const showLpHint = isConnected && totalLpBalance > 0n;
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

    const nativeRawAmount = nativeBalance?.value ?? 0n;
    if (nativeRawAmount > 0n) {
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
        const rawAmount = tokenBalances[token.symbol] ?? 0n;
        if (rawAmount <= 0n) {
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
                  title={isZh ? 'FLUX 数量' : 'FLUX Balance'}
                  value={fluxDisplay}
                  suffix="FLUX"
                  icon={Coins}
                />
                <DividerPattern />
                <div className="px-2 py-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-500 dark:text-gray-400">
                    <Layers3 size={16} />
                    <span>{isZh ? 'LP 数量' : 'LP Balance'}</span>
                    {showLpHint ? (
                      <span className="text-xs font-semibold text-gray-400 dark:text-gray-500">
                        {isZh
                          ? `已汇总 ${activePositionCount} 个池子的 LP 余额`
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

        <div className="mt-8 grid gap-6 xl:grid-cols-3">
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
                    ? '去交易页面创建你的第一笔限价单。'
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
            title={isZh ? '你的头寸' : 'Your Positions'}
            description={
              isZh
                ? '展示当前用户持有的流动性与仓位'
                : 'Liquidity and position overview for the current wallet'
            }
            icon={WalletCards}
            emptyContent={
              <div className="flex flex-col items-center justify-center">
                <div className="text-lg font-black tracking-tight text-gray-900 dark:text-white">
                  {isZh ? '还没有头寸' : 'No positions yet'}
                </div>
                <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  {isZh
                    ? '去资金池页面添加流动性，建立你的第一笔头寸。'
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
            title={isZh ? '你的质押' : 'Your Staking'}
            description={
              isZh
                ? '展示当前用户的质押与收益状态'
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
                    ? '去质押页面查看可用池子并开始质押。'
                    : 'Visit the earn page to view available pools and start staking.'}
                </div>
                <Link
                  href="/earn"
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
                >
                  <span>{isZh ? '去查看质押' : 'View staking'}</span>
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
                    ? '展示当前连接钱包发起的全部事件活动'
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
                      ? '这里会展示当前钱包的交换、添加流动性和移除流动性记录'
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
                      ? '完成一次交换或流动性操作后，这里会显示对应事件'
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
      </div>
    </div>
  );
}
