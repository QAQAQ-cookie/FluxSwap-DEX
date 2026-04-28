'use client';

import Link from 'next/link';
import { ChevronRight, Droplets } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { zeroAddress } from 'viem';
import { useAccount, useChainId } from 'wagmi';

import { MarketTabs } from '@/components/pool/MarketTabs';
import { getContractAddress, isFluxSupportedChain } from '@/config/contracts';
import { formatBigIntAmount } from '@/lib/amounts';
import {
  useReadFluxSwapFactoryGetPair,
  useReadFluxSwapPairBalanceOf,
  useReadFluxSwapPairGetReserves,
  useReadFluxSwapPairToken0,
} from '@/lib/contracts';

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

type EmptyPoolStateProps = {
  isZh: boolean;
  supportedChain: boolean;
};

function EmptyPoolState({ isZh, supportedChain }: EmptyPoolStateProps) {
  const title = supportedChain
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
        {title}
      </div>

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

  const tvlDisplay = normalizedPairAddress
    ? `${formatBigIntAmount(reserveEth, 18, 3)} ETH / ${formatBigIntAmount(reserveFlux, 18, 3)} FLUX`
    : '--';

  const myPositionDisplay = isConnected
    ? formatBigIntAmount(lpBalance, 18, 4)
    : '--';

  return (
    <div className="px-4 py-8 lg:px-6 lg:py-10">
      <section className="lg:px-1">
        <MarketTabs active="pool" />

        <div className="mt-6 hidden lg:block">
          <div className="grid grid-cols-[0.55fr_1.7fr_0.8fr_0.9fr_0.9fr_0.85fr_0.8fr] gap-4 rounded-[1.5rem] bg-gray-100/80 px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:bg-white/[0.04] dark:text-gray-400">
            <div>#</div>
            <div>{isZh ? '资金池' : 'Pool'}</div>
            <div>{isZh ? '协议' : 'Protocol'}</div>
            <div>{isZh ? '费率' : 'Fee tier'}</div>
            <div>{isZh ? '储备' : 'Reserves'}</div>
            <div>{isZh ? '我的头寸' : 'My position'}</div>
            <div className="text-right">{isZh ? '操作' : 'Action'}</div>
          </div>

          {hasLiquidity ? (
            <div className="mt-3 grid grid-cols-[0.55fr_1.7fr_0.8fr_0.9fr_0.9fr_0.85fr_0.8fr] items-center gap-4 rounded-[1.8rem] border border-black/5 px-5 py-5 transition-colors hover:bg-sky-50/50 dark:border-white/10 dark:hover:bg-white/[0.03]">
              <div className="text-lg font-black text-gray-400 dark:text-gray-500">1</div>

              <div className="min-w-0">
                <div className="flex items-center gap-4">
                  <TokenPairBadge />
                  <div className="min-w-0">
                    <div className="text-lg font-black tracking-tight text-gray-900 dark:text-white">
                      ETH / FLUX
                    </div>
                    <div className="truncate text-sm text-gray-500 dark:text-gray-400">
                      {isZh
                        ? '当前接入的核心流动性池'
                        : 'Core liquidity market currently wired into the app'}
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
                  href="/portfolio/liquidity"
                  className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-200 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-100 dark:hover:bg-white/[0.1]"
                >
                  <span>{isZh ? '管理' : 'Manage'}</span>
                  <ChevronRight size={16} />
                </Link>
              </div>
            </div>
          ) : (
            <EmptyPoolState isZh={isZh} supportedChain={supportedChain} />
          )}
        </div>

        <div className="mt-6 lg:hidden">
          {hasLiquidity ? (
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

                <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                  {isZh ? '活跃' : 'Active'}
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
                  {isZh ? '储备' : 'Reserves'}
                </div>
                <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                  {tvlDisplay}
                </div>
              </div>

              <Link
                href="/portfolio/liquidity"
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-[1.2rem] bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
              >
                <span>{isZh ? '进入池子详情' : 'Open pool detail'}</span>
                <ChevronRight size={16} />
              </Link>
            </div>
          ) : (
            <EmptyPoolState isZh={isZh} supportedChain={supportedChain} />
          )}
        </div>
      </section>
    </div>
  );
}
