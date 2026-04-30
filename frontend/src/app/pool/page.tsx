'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Droplets } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Address } from 'viem';
import { useChainId } from 'wagmi';

import { MarketTabs } from '@/components/pool/MarketTabs';
import { getContractAddress, isFluxSupportedChain } from '@/config/contracts';
import { formatBigIntAmount } from '@/lib/amounts';
import { getPools, type PoolViewModel } from '@/lib/subgraph/pools';
import { truncateAddress } from '@/lib/wallet';

type EmptyPoolStateProps = {
  isZh: boolean;
  supportedChain: boolean;
  title?: string;
  description?: string;
};

type PoolRow = {
  id: Address;
  token0Symbol: string;
  token1Symbol: string;
  pairLabel: string;
  reservesLabel: string;
  feeTierLabel: string;
  protocolLabel: string;
};

function TokenPairBadge({
  token0Symbol,
  token1Symbol,
}: {
  token0Symbol: string;
  token1Symbol: string;
}) {
  return (
    <div className="flex items-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-400 text-sm font-black text-white shadow-lg shadow-sky-500/20">
        {token0Symbol.slice(0, 3)}
      </div>
      <div className="-ml-3 flex h-11 w-11 items-center justify-center rounded-2xl border-4 border-white bg-gradient-to-br from-emerald-500 to-lime-400 text-sm font-black text-white shadow-lg shadow-emerald-500/20 dark:border-[#09101c]">
        {token1Symbol.slice(0, 3)}
      </div>
    </div>
  );
}

function EmptyPoolState({
  isZh,
  supportedChain,
  title,
  description,
}: EmptyPoolStateProps) {
  const resolvedTitle = title
    ? title
    : supportedChain
      ? isZh
        ? '当前还没有资金池'
        : 'No pool yet'
      : isZh
        ? '当前网络暂不支持'
        : 'Unsupported network';

  return (
    <div className="mt-3 rounded-[1.8rem] border border-dashed border-black/10 bg-white/45 px-6 py-12 text-center backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.03]">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300">
        <Droplets size={24} />
      </div>

      <div className="mt-4 text-lg font-black tracking-tight text-gray-900 dark:text-white">
        {resolvedTitle}
      </div>

      {description ? (
        <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">{description}</div>
      ) : null}

      {supportedChain ? (
        <Link
          href="/portfolio/liquidity"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
        >
          <span>{isZh ? '去添加流动性' : 'Add liquidity'}</span>
          <ChevronRight size={16} />
        </Link>
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

export default function PoolMarketsPage() {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const chainId = useChainId();

  const supportedChain = isFluxSupportedChain(chainId);
  const factoryAddress = getContractAddress('FluxSwapFactory', chainId);
  const wrappedNativeAddress = getContractAddress('MockWETH', chainId);

  const [pairs, setPairs] = useState<PoolViewModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!supportedChain) {
      setPairs([]);
      setFetchError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setFetchError(null);

    (async () => {
      try {
        const subgraphPairs = await getPools();
        if (!cancelled) {
          setPairs(subgraphPairs);
        }
      } catch (error) {
        if (!cancelled) {
          setPairs([]);
          setFetchError(error instanceof Error ? error.message : 'Failed to load pools');
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

  const poolRows = useMemo<PoolRow[]>(() => {
    return pairs.map((pair) => {
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

      return {
        id: pair.id,
        token0Symbol,
        token1Symbol,
        pairLabel: `${token0Symbol} / ${token1Symbol}`,
        reservesLabel: `${formatBigIntAmount(pair.reserve0, pair.token0.decimals, 3)} ${token0Symbol} / ${formatBigIntAmount(pair.reserve1, pair.token1.decimals, 3)} ${token1Symbol}`,
        feeTierLabel: '0.3%',
        protocolLabel: 'FluxSwap',
      };
    });
  }, [pairs, wrappedNativeAddress]);

  return (
    <div className="px-4 py-8 lg:px-6 lg:py-10">
      <section className="lg:px-1">
        <MarketTabs active="pool" />

        <div className="mt-6 hidden lg:block">
          <div className="grid grid-cols-[0.55fr_1.7fr_0.8fr_0.9fr_1.45fr_0.8fr] gap-4 rounded-[1.5rem] bg-gray-100/80 px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:bg-white/[0.04] dark:text-gray-400">
            <div>#</div>
            <div>{isZh ? '资金池' : 'Pool'}</div>
            <div>{isZh ? '协议' : 'Protocol'}</div>
            <div>{isZh ? '费率' : 'Fee tier'}</div>
            <div>{isZh ? '储备' : 'Reserves'}</div>
            <div className="text-right">{isZh ? '操作' : 'Action'}</div>
          </div>

          {loading ? (
            <EmptyPoolState
              isZh={isZh}
              supportedChain={supportedChain}
              title={isZh ? '正在加载资金池' : 'Loading pools'}
            />
          ) : fetchError ? (
            <EmptyPoolState
              isZh={isZh}
              supportedChain={supportedChain}
              title={isZh ? '资金池加载失败' : 'Failed to load pools'}
              description={fetchError}
            />
          ) : poolRows.length > 0 ? (
            poolRows.map((pool, index) => (
              <div
                key={pool.id}
                className="mt-3 grid grid-cols-[0.55fr_1.7fr_0.8fr_0.9fr_1.45fr_0.8fr] items-center gap-4 rounded-[1.8rem] border border-black/5 px-5 py-5 transition-colors hover:bg-sky-50/50 dark:border-white/10 dark:hover:bg-white/[0.03]"
              >
                <div className="text-lg font-black text-gray-400 dark:text-gray-500">
                  {index + 1}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-4">
                    <TokenPairBadge
                      token0Symbol={pool.token0Symbol}
                      token1Symbol={pool.token1Symbol}
                    />
                    <div className="min-w-0">
                      <div className="text-lg font-black tracking-tight text-gray-900 dark:text-white">
                        {pool.pairLabel}
                      </div>
                      <div className="truncate text-sm text-gray-500 dark:text-gray-400">
                        {truncateAddress(pool.id)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {pool.protocolLabel}
                </div>

                <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {pool.feeTierLabel}
                </div>

                <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {pool.reservesLabel}
                </div>

                <div className="flex justify-end">
                  <Link
                    href="/portfolio/liquidity"
                    className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-200 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-100 dark:hover:bg-white/[0.1]"
                  >
                    <span>{isZh ? '管理' : 'Manage'}</span>
                    <ChevronRight size={16} />
                  </Link>
                </div>
              </div>
            ))
          ) : (
            <EmptyPoolState isZh={isZh} supportedChain={supportedChain} />
          )}
        </div>

        <div className="mt-6 lg:hidden">
          {loading ? (
            <EmptyPoolState
              isZh={isZh}
              supportedChain={supportedChain}
              title={isZh ? '正在加载资金池' : 'Loading pools'}
            />
          ) : fetchError ? (
            <EmptyPoolState
              isZh={isZh}
              supportedChain={supportedChain}
              title={isZh ? '资金池加载失败' : 'Failed to load pools'}
              description={fetchError}
            />
          ) : poolRows.length > 0 ? (
            <div className="space-y-4">
              {poolRows.map((pool) => (
                <div
                  key={pool.id}
                  className="rounded-[1.9rem] border border-black/5 bg-white p-5 dark:border-white/10 dark:bg-white/[0.03]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <TokenPairBadge
                        token0Symbol={pool.token0Symbol}
                        token1Symbol={pool.token1Symbol}
                      />
                      <div>
                        <div className="text-lg font-black tracking-tight text-gray-900 dark:text-white">
                          {pool.pairLabel}
                        </div>
                        <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                          {pool.protocolLabel}
                        </div>
                      </div>
                    </div>

                    <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                      {isZh ? '活跃' : 'Active'}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-3">
                    <div className="rounded-[1.35rem] bg-gray-100 p-4 dark:bg-white/[0.05]">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                        {isZh ? '费率' : 'Fee tier'}
                      </div>
                      <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                        {pool.feeTierLabel}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-[1.35rem] bg-gray-100 p-4 dark:bg-white/[0.05]">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                      {isZh ? '储备' : 'Reserves'}
                    </div>
                    <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                      {pool.reservesLabel}
                    </div>
                  </div>

                  <Link
                    href="/portfolio/liquidity"
                    className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-[1.2rem] bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-white/[0.1]"
                  >
                    <span>{isZh ? '进入池子详情' : 'Open pool detail'}</span>
                    <ChevronRight size={16} />
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <EmptyPoolState isZh={isZh} supportedChain={supportedChain} />
          )}
        </div>
      </section>
    </div>
  );
}
