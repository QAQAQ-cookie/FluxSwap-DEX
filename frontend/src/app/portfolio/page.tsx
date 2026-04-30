'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Coins, Layers3, ListOrdered, ShieldCheck, WalletCards } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAccount, useBalance, useChainId, usePublicClient } from 'wagmi';

import { getContractAddress, isFluxSupportedChain } from '@/config/contracts';
import { formatBigIntAmount, formatDisplayAmount } from '@/lib/amounts';
import { fluxSwapPairAbi } from '@/lib/contracts';
import { getPools, type PoolViewModel } from '@/lib/subgraph/pools';

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

export default function PortfolioPage() {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });
  const { address, isConnected } = useAccount();

  const supportedChain = isFluxSupportedChain(chainId);
  const fluxTokenAddress = getContractAddress('FluxToken', chainId);
  const [pairs, setPairs] = useState<PoolViewModel[]>([]);
  const [lpBalances, setLpBalances] = useState<Record<string, bigint>>({});

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
      </div>
    </div>
  );
}
