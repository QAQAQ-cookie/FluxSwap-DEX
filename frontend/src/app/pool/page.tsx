'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useAccount, useChainId } from 'wagmi';
import {
  ArrowRight,
  ChevronRight,
  Droplets,
  Layers3,
  ShieldCheck,
  Sparkles,
  Waves,
} from 'lucide-react';
import { zeroAddress } from 'viem';

import { getContractAddress, isFluxSupportedChain } from '@/config/contracts';
import { formatBigIntAmount } from '@/lib/amounts';
import {
  useReadFluxSwapFactoryGetPair,
  useReadFluxSwapPairBalanceOf,
  useReadFluxSwapPairGetReserves,
  useReadFluxSwapPairToken0,
  useReadFluxSwapPairTotalSupply,
} from '@/lib/contracts';
import { truncateAddress } from '@/lib/wallet';

function OverviewMetric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-[1.75rem] border border-white/60 bg-white/75 p-5 shadow-lg shadow-sky-500/5 backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.05]">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div className="mt-3 text-2xl font-black tracking-tight text-gray-900 dark:text-white">
        {value}
      </div>
      <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">{hint}</div>
    </div>
  );
}

function TokenPairBadge() {
  return (
    <div className="flex items-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-400 text-sm font-black text-white shadow-lg shadow-sky-500/20">
        ETH
      </div>
      <div className="-ml-3 flex h-11 w-11 items-center justify-center rounded-2xl border-4 border-white bg-gradient-to-br from-emerald-500 to-lime-400 text-sm font-black text-white shadow-lg shadow-emerald-500/20 dark:border-[#09101c]">
        FX
      </div>
    </div>
  );
}

export default function PoolMarketsPage() {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const chainId = useChainId();
  const { address, isConnected } = useAccount();

  const supportedChain = isFluxSupportedChain(chainId);
  const factoryAddress = getContractAddress('FluxSwapFactory', chainId);
  const fluxTokenAddress = getContractAddress('FluxToken', chainId);
  const wrappedNativeAddress = getContractAddress('MockWETH', chainId);

  const pairArgs = [
    fluxTokenAddress ?? zeroAddress,
    wrappedNativeAddress ?? zeroAddress,
  ] as const;

  const { data: pairAddress } = useReadFluxSwapFactoryGetPair({
    address: factoryAddress ?? zeroAddress,
    chainId,
    args: pairArgs,
    query: {
      enabled:
        supportedChain &&
        !!factoryAddress &&
        !!fluxTokenAddress &&
        !!wrappedNativeAddress,
      retry: false,
      refetchInterval: 10000,
    },
  });

  const normalizedPairAddress =
    pairAddress && pairAddress !== zeroAddress ? pairAddress : undefined;

  const { data: reserves } = useReadFluxSwapPairGetReserves({
    address: normalizedPairAddress ?? zeroAddress,
    chainId,
    query: {
      enabled: !!normalizedPairAddress,
      retry: false,
      refetchInterval: 10000,
    },
  });

  const { data: token0 } = useReadFluxSwapPairToken0({
    address: normalizedPairAddress ?? zeroAddress,
    chainId,
    query: {
      enabled: !!normalizedPairAddress,
      retry: false,
      refetchInterval: 10000,
    },
  });

  const { data: totalSupply } = useReadFluxSwapPairTotalSupply({
    address: normalizedPairAddress ?? zeroAddress,
    chainId,
    query: {
      enabled: !!normalizedPairAddress,
      retry: false,
      refetchInterval: 10000,
    },
  });

  const { data: lpBalance } = useReadFluxSwapPairBalanceOf({
    address: normalizedPairAddress ?? zeroAddress,
    chainId,
    args: [address ?? zeroAddress],
    query: {
      enabled: !!normalizedPairAddress && !!address && isConnected,
      retry: false,
      refetchInterval: 8000,
    },
  });

  const reserveFlux =
    reserves && token0 && fluxTokenAddress
      ? token0.toLowerCase() === fluxTokenAddress.toLowerCase()
        ? reserves[0]
        : reserves[1]
      : undefined;
  const reserveEth =
    reserves && token0 && fluxTokenAddress
      ? token0.toLowerCase() === fluxTokenAddress.toLowerCase()
        ? reserves[1]
        : reserves[0]
      : undefined;

  const hasLiquidity = Boolean(
    reserveEth &&
      reserveFlux &&
      reserveEth > BigInt(0) &&
      reserveFlux > BigInt(0),
  );

  const poolStatus = !supportedChain
    ? isZh
      ? '当前网络未配置'
      : 'Unsupported network'
    : !normalizedPairAddress
      ? isZh
        ? '未创建'
        : 'Not created'
      : hasLiquidity
        ? isZh
          ? '活跃'
          : 'Active'
        : isZh
          ? '待注入流动性'
          : 'Awaiting liquidity';

  const poolStatusTone = hasLiquidity
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
    : normalizedPairAddress
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
      : 'bg-gray-200 text-gray-700 dark:bg-white/10 dark:text-gray-300';

  const reserveEthDisplay = formatBigIntAmount(reserveEth, 18, 4);
  const reserveFluxDisplay = formatBigIntAmount(reserveFlux, 18, 4);
  const tvlDisplay = normalizedPairAddress
    ? `${formatBigIntAmount(reserveEth, 18, 3)} ETH / ${formatBigIntAmount(reserveFlux, 18, 3)} FLUX`
    : '--';
  const myPositionDisplay = isConnected
    ? formatBigIntAmount(lpBalance, 18, 4)
    : '--';
  const totalPoolsDisplay = normalizedPairAddress ? '1' : '0';
  const pairAddressDisplay = normalizedPairAddress
    ? truncateAddress(normalizedPairAddress, 10, 8)
    : '--';

  return (
    <div className="px-4 py-8 lg:px-6 lg:py-10">
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-[2.75rem] border border-black/5 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.14),_transparent_30%),linear-gradient(180deg,_rgba(255,255,255,0.96),_rgba(244,247,251,0.92))] p-6 shadow-2xl shadow-sky-500/10 dark:border-white/10 dark:bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.22),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.16),_transparent_30%),linear-gradient(180deg,_rgba(9,16,28,0.96),_rgba(7,13,23,0.92))] lg:p-8">
          <div className="pointer-events-none absolute -left-12 top-12 h-36 w-36 rounded-full bg-sky-400/20 blur-3xl" />
          <div className="pointer-events-none absolute -right-8 bottom-10 h-40 w-40 rounded-full bg-emerald-400/20 blur-3xl" />

          <div className="relative grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/70 px-4 py-2 text-sm font-semibold text-sky-700 backdrop-blur-sm dark:border-sky-900/40 dark:bg-sky-500/10 dark:text-sky-300">
                <Waves size={16} />
                <span>{isZh ? '市场页' : 'Markets'}</span>
              </div>

              <h1 className="mt-5 max-w-3xl text-4xl font-black tracking-tight text-gray-900 dark:text-white md:text-5xl xl:text-[3.5rem]">
                {isZh ? '流动性市场总览' : 'Liquidity market board'}
              </h1>

              <p className="mt-4 max-w-2xl text-base leading-7 text-gray-600 dark:text-gray-300">
                {isZh
                  ? '先在这里看可用市场，再进入具体池子做添加流动性、移除流动性和头寸管理。当前先接入 ETH / FLUX，后续可以继续扩展更多交易对。'
                  : 'Scan available liquidity markets here first, then jump into a pool to add liquidity, remove liquidity, and manage positions. ETH / FLUX is wired in first, with room to expand later.'}
              </p>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <OverviewMetric
                  label={isZh ? '市场数量' : 'Markets'}
                  value={totalPoolsDisplay}
                  hint={
                    isZh
                      ? '当前前端已接入的池子数量'
                      : 'Pools currently surfaced in the frontend'
                  }
                />
                <OverviewMetric
                  label={isZh ? '总 LP 供应' : 'Total LP Supply'}
                  value={formatBigIntAmount(totalSupply, 18, 4)}
                  hint={
                    isZh
                      ? '来自当前链上池子状态'
                      : 'Pulled from the live on-chain pool state'
                  }
                />
                <OverviewMetric
                  label={isZh ? '我的 LP' : 'My LP'}
                  value={myPositionDisplay}
                  hint={
                    isZh
                      ? '未连接钱包时不显示'
                      : 'Hidden until the wallet is connected'
                  }
                />
              </div>
            </div>

            <div className="relative overflow-hidden rounded-[2.4rem] border border-white/60 bg-white/78 p-6 shadow-xl shadow-sky-500/10 backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.05]">
              <div className="pointer-events-none absolute right-0 top-0 h-24 w-24 rounded-full bg-sky-400/15 blur-3xl" />

              <div className="relative">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">
                      {isZh ? '焦点市场' : 'Spotlight'}
                    </div>
                    <div className="mt-4 flex items-center gap-4">
                      <TokenPairBadge />
                      <div>
                        <div className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">
                          ETH / FLUX
                        </div>
                        <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                          FluxSwap v2
                        </div>
                      </div>
                    </div>
                  </div>

                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${poolStatusTone}`}
                  >
                    {poolStatus}
                  </span>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[1.4rem] bg-gray-100/80 p-4 dark:bg-white/[0.05]">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                      {isZh ? '池子地址' : 'Pair'}
                    </div>
                    <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                      {pairAddressDisplay}
                    </div>
                  </div>
                  <div className="rounded-[1.4rem] bg-gray-100/80 p-4 dark:bg-white/[0.05]">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                      {isZh ? '我的头寸' : 'Position'}
                    </div>
                    <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                      {myPositionDisplay} LP
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-[1.5rem] bg-gradient-to-r from-sky-500 to-emerald-500 p-[1px]">
                  <div className="rounded-[1.45rem] bg-white/95 px-4 py-4 dark:bg-[#0a1320]">
                    <div className="flex items-center justify-between gap-4 text-sm">
                      <div>
                        <div className="text-gray-500 dark:text-gray-400">
                          {isZh ? '当前储备' : 'Current reserves'}
                        </div>
                        <div className="mt-1 font-semibold text-gray-900 dark:text-white">
                          {tvlDisplay}
                        </div>
                      </div>
                      <Link
                        href="/pool/eth-flux"
                        className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-4 py-2 font-semibold text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
                      >
                        <span>{isZh ? '进入详情' : 'Open detail'}</span>
                        <ArrowRight size={16} />
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[2.5rem] border border-black/5 bg-white/80 p-4 shadow-2xl shadow-sky-500/5 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.04] lg:p-5">
          <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/70 p-5 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                  {isZh ? '市场列表' : 'Market list'}
                </div>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-gray-900 dark:text-white">
                  {isZh ? '当前可管理的流动性池' : 'Pools currently available to manage'}
                </h2>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded-full border border-black/5 bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200">
                  FluxSwap v2
                </span>
                <span className="inline-flex items-center rounded-full border border-black/5 bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200">
                  0.3% fee tier
                </span>
                <span className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold ${poolStatusTone}`}>
                  {poolStatus}
                </span>
              </div>
            </div>

            <div className="hidden lg:block">
              <div className="grid grid-cols-[0.55fr_1.7fr_0.8fr_0.9fr_0.9fr_0.85fr_0.8fr] gap-4 rounded-[1.5rem] bg-gray-100/80 px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:bg-white/[0.04] dark:text-gray-400">
                <div>#</div>
                <div>{isZh ? '资金池' : 'Pool'}</div>
                <div>{isZh ? '协议' : 'Protocol'}</div>
                <div>{isZh ? '费率' : 'Fee tier'}</div>
                <div>{isZh ? '储备' : 'Reserves'}</div>
                <div>{isZh ? '我的头寸' : 'My position'}</div>
                <div className="text-right">{isZh ? '操作' : 'Action'}</div>
              </div>

              <div className="mt-3 grid grid-cols-[0.55fr_1.7fr_0.8fr_0.9fr_0.9fr_0.85fr_0.8fr] items-center gap-4 rounded-[1.8rem] border border-black/5 bg-white px-5 py-5 transition-colors hover:bg-sky-50/50 dark:border-white/10 dark:bg-transparent dark:hover:bg-white/[0.03]">
                <div className="text-lg font-black text-gray-400 dark:text-gray-500">1</div>

                <div className="min-w-0">
                  <div className="flex items-center gap-4">
                    <TokenPairBadge />
                    <div className="min-w-0">
                      <div className="text-lg font-black tracking-tight text-gray-900 dark:text-white">
                        ETH / FLUX
                      </div>
                      <div className="truncate text-sm text-gray-500 dark:text-gray-400">
                        {normalizedPairAddress
                          ? isZh
                            ? '当前接入的核心流动性池'
                            : 'Core liquidity market currently wired into the app'
                          : isZh
                            ? '等待首次创建交易对'
                            : 'Waiting for the first pool creation'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  FluxSwap
                </div>

                <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  0.3%
                </div>

                <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {tvlDisplay}
                </div>

                <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {myPositionDisplay} LP
                </div>

                <div className="flex justify-end">
                  <Link
                    href="/pool/eth-flux"
                    className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-200 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-100 dark:hover:bg-white/[0.1]"
                  >
                    <span>{isZh ? '管理' : 'Manage'}</span>
                    <ChevronRight size={16} />
                  </Link>
                </div>
              </div>
            </div>

            <div className="space-y-4 lg:hidden">
              <div className="rounded-[1.9rem] border border-black/5 bg-white p-5 dark:border-white/10 dark:bg-white/[0.03]">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <TokenPairBadge />
                    <div>
                      <div className="text-lg font-black tracking-tight text-gray-900 dark:text-white">
                        ETH / FLUX
                      </div>
                      <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        FluxSwap v2
                      </div>
                    </div>
                  </div>

                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${poolStatusTone}`}
                  >
                    {poolStatus}
                  </span>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[1.35rem] bg-gray-100 p-4 dark:bg-white/[0.05]">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                      {isZh ? '费率' : 'Fee tier'}
                    </div>
                    <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                      0.3%
                    </div>
                  </div>
                  <div className="rounded-[1.35rem] bg-gray-100 p-4 dark:bg-white/[0.05]">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                      {isZh ? '我的头寸' : 'My position'}
                    </div>
                    <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                      {myPositionDisplay} LP
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-[1.35rem] bg-gray-100 p-4 dark:bg-white/[0.05]">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                    {isZh ? '当前储备' : 'Reserves'}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                    {tvlDisplay}
                  </div>
                </div>

                <Link
                  href="/pool/eth-flux"
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-[1.2rem] bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
                >
                  <span>{isZh ? '进入池子详情' : 'Open pool detail'}</span>
                  <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1fr_1fr_0.9fr]">
          <div className="rounded-[2rem] border border-black/5 bg-white/75 p-5 shadow-xl shadow-sky-500/5 backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.04]">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
              <Droplets size={16} />
              <span>{isZh ? '池子储备快照' : 'Reserve snapshot'}</span>
            </div>

            <div className="mt-5 space-y-3">
              <div className="rounded-[1.4rem] bg-gray-100/90 p-4 dark:bg-white/[0.05]">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-gray-500 dark:text-gray-400">ETH</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    {reserveEthDisplay}
                  </span>
                </div>
              </div>

              <div className="rounded-[1.4rem] bg-gray-100/90 p-4 dark:bg-white/[0.05]">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-gray-500 dark:text-gray-400">FLUX</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    {reserveFluxDisplay}
                  </span>
                </div>
              </div>

              <div className="rounded-[1.4rem] border border-dashed border-black/10 px-4 py-4 text-sm text-gray-500 dark:border-white/10 dark:text-gray-400">
                {isZh
                  ? '这里先直接展示链上储备，不额外伪造 USD 估值。'
                  : 'For now this shows raw on-chain reserves instead of a fabricated USD valuation.'}
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-black/5 bg-white/75 p-5 shadow-xl shadow-sky-500/5 backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.04]">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
              <Layers3 size={16} />
              <span>{isZh ? '当前支持范围' : 'Current scope'}</span>
            </div>

            <div className="mt-5 space-y-3 text-sm text-gray-600 dark:text-gray-300">
              <div className="rounded-[1.4rem] bg-gray-100/90 p-4 dark:bg-white/[0.05]">
                <div className="font-semibold text-gray-900 dark:text-white">
                  {isZh ? '普通交换' : 'Swap'}
                </div>
                <div className="mt-1">
                  {isZh
                    ? '可与该市场形成直连池，支持前端继续从市场页跳详情。'
                    : 'This market can be managed directly and linked into the broader swap flow.'}
                </div>
              </div>

              <div className="rounded-[1.4rem] bg-gray-100/90 p-4 dark:bg-white/[0.05]">
                <div className="font-semibold text-gray-900 dark:text-white">
                  {isZh ? '流动性管理' : 'Liquidity management'}
                </div>
                <div className="mt-1">
                  {isZh
                    ? '详情页保留现有添加流动性、移除流动性和最近活动。'
                    : 'The detail page keeps the existing add, remove, and recent activity flows.'}
                </div>
              </div>

              <div className="rounded-[1.4rem] bg-gray-100/90 p-4 dark:bg-white/[0.05]">
                <div className="font-semibold text-gray-900 dark:text-white">
                  {isZh ? '后续扩展' : 'Later expansion'}
                </div>
                <div className="mt-1">
                  {isZh
                    ? '后面可以继续加更多池子、成交量、APR 和更多市场筛选。'
                    : 'More pools, volume, APR, and richer market filters can be layered in later.'}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-black/5 bg-white/75 p-5 shadow-xl shadow-sky-500/5 backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.04]">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
              <Sparkles size={16} />
              <span>{isZh ? '快速入口' : 'Quick actions'}</span>
            </div>

            <div className="mt-5 space-y-3">
              <Link
                href="/pool/eth-flux"
                className="flex items-center justify-between rounded-[1.45rem] border border-black/5 bg-gray-100/90 px-4 py-4 transition-colors hover:bg-gray-200/80 dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.08]"
              >
                <div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">
                    {isZh ? '进入 ETH / FLUX 详情' : 'Open ETH / FLUX detail'}
                  </div>
                  <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {isZh ? '添加或移除流动性' : 'Add or remove liquidity'}
                  </div>
                </div>
                <ChevronRight size={18} className="text-gray-400" />
              </Link>

              <Link
                href="/swap"
                className="flex items-center justify-between rounded-[1.45rem] border border-black/5 bg-gray-100/90 px-4 py-4 transition-colors hover:bg-gray-200/80 dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.08]"
              >
                <div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">
                    {isZh ? '去交换页' : 'Open swap'}
                  </div>
                  <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {isZh ? '回到普通交换流程' : 'Jump back to the swap flow'}
                  </div>
                </div>
                <ChevronRight size={18} className="text-gray-400" />
              </Link>

              <div className="rounded-[1.45rem] bg-gradient-to-br from-sky-500 to-emerald-500 p-[1px]">
                <div className="rounded-[1.4rem] bg-white/95 px-4 py-4 dark:bg-[#0a1320]">
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">
                    {isZh ? '当前网络状态' : 'Network status'}
                  </div>
                  <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    {supportedChain
                      ? isZh
                        ? '当前网络已接入 FluxSwap 合约。'
                        : 'FluxSwap contracts are configured on this network.'
                      : isZh
                        ? '当前网络还没有接入 FluxSwap 合约。'
                        : 'FluxSwap contracts are not configured on this network.'}
                  </div>
                  <div className="mt-3">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${poolStatusTone}`}
                    >
                      {poolStatus}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
