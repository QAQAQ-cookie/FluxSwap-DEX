'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useAccount, useBalance, useChainId } from 'wagmi';
import { Activity, Coins, Droplets, Sparkles } from 'lucide-react';
import { zeroAddress } from 'viem';

import {
  getContractAddress,
  isFluxSupportedChain,
} from '@/config/contracts';
import {
  formatBigIntAmount,
  formatDisplayAmount,
} from '@/lib/amounts';
import {
  useReadFluxPoolFactoryLpTokenPools,
  useReadFluxSwapFactoryGetPair,
  useReadFluxSwapLpStakingPoolRewardReserve,
  useReadFluxSwapLpStakingPoolTotalStaked,
  useReadFluxSwapPairGetReserves,
  useReadFluxSwapPairToken0,
  useReadFluxSwapPairTotalSupply,
} from '@/lib/contracts';

export default function Home() {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const chainId = useChainId();
  const { address, isConnected } = useAccount();

  const supportedChain = isFluxSupportedChain(chainId);
  const factoryAddress = getContractAddress('FluxSwapFactory', chainId);
  const poolFactoryAddress = getContractAddress('FluxPoolFactory', chainId);
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

  const { data: stakingPoolAddress } = useReadFluxPoolFactoryLpTokenPools({
    address: poolFactoryAddress ?? zeroAddress,
    chainId,
    args: [normalizedPairAddress ?? zeroAddress],
    query: {
      enabled: !!poolFactoryAddress && !!normalizedPairAddress,
      retry: false,
      refetchInterval: 10000,
    },
  });

  const normalizedStakingPoolAddress =
    stakingPoolAddress && stakingPoolAddress !== zeroAddress
      ? stakingPoolAddress
      : undefined;

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

  const { data: totalStaked } = useReadFluxSwapLpStakingPoolTotalStaked({
    address: normalizedStakingPoolAddress ?? zeroAddress,
    chainId,
    query: {
      enabled: !!normalizedStakingPoolAddress,
      retry: false,
      refetchInterval: 10000,
    },
  });

  const { data: rewardReserve } = useReadFluxSwapLpStakingPoolRewardReserve({
    address: normalizedStakingPoolAddress ?? zeroAddress,
    chainId,
    query: {
      enabled: !!normalizedStakingPoolAddress,
      retry: false,
      refetchInterval: 10000,
    },
  });

  const { data: walletEth } = useBalance({
    address,
    chainId,
    query: {
      enabled: !!address && isConnected,
      refetchInterval: 8000,
    },
  });

  const { data: walletFlux } = useBalance({
    address,
    chainId,
    token: fluxTokenAddress,
    query: {
      enabled: !!address && !!fluxTokenAddress && isConnected,
      refetchInterval: 8000,
    },
  });

  const { data: walletLp } = useBalance({
    address,
    chainId,
    token: normalizedPairAddress,
    query: {
      enabled: !!address && !!normalizedPairAddress && isConnected,
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
  const liveCards = [
    {
      icon: Activity,
      title: isZh ? '池子状态' : 'Pool Status',
      value: !supportedChain
        ? isZh
          ? '未配置'
          : 'Unsupported'
        : !normalizedPairAddress
          ? isZh
            ? '未创建'
            : 'Missing'
          : isZh
            ? '运行中'
            : 'Active',
      detail: normalizedPairAddress ?? (isZh ? '当前网络暂无 ETH / FLUX 交易对' : 'No ETH / FLUX pair on this chain'),
    },
    {
      icon: Droplets,
      title: isZh ? '池子储备' : 'Pool Reserves',
      value: `${formatBigIntAmount(reserveEth, 18, 3)} ETH`,
      detail: `${formatBigIntAmount(reserveFlux, 18, 3)} FLUX`,
    },
    {
      icon: Coins,
      title: isZh ? 'LP 总供应' : 'Total LP Supply',
      value: formatBigIntAmount(totalSupply, 18, 4),
      detail: isZh ? '当前 ETH / FLUX 份额规模' : 'Current ETH / FLUX pool share supply',
    },
    {
      icon: Sparkles,
      title: isZh ? 'Earn 状态' : 'Earn Status',
      value: normalizedStakingPoolAddress
        ? isZh
          ? '已开启'
          : 'Live'
        : isZh
          ? '未配置'
          : 'Not configured',
      detail: normalizedStakingPoolAddress
        ? `${isZh ? '总质押' : 'Total staked'} ${formatBigIntAmount(totalStaked, 18, 4)} LP · ${
            isZh ? '奖励储备' : 'Reward reserve'
          } ${formatBigIntAmount(rewardReserve, 18, 4)}`
        : isZh
          ? '当前还没有关联 staking pool'
          : 'No linked staking pool yet',
    },
  ];

  return (
    <div className="min-h-[calc(100vh-80px)] bg-gray-50 px-4 py-20 transition-colors duration-300 dark:bg-gray-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <div className="overflow-hidden rounded-[2.5rem] border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800">
          <div className="grid gap-8 px-6 py-10 lg:grid-cols-[1.1fr_0.9fr] lg:px-10">
            <div>
              <div className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 dark:border-blue-900/50 dark:bg-blue-500/10 dark:text-blue-300">
                {supportedChain
                  ? isZh
                    ? `当前网络已连接: ${chainId}`
                    : `Connected network: ${chainId}`
                  : isZh
                    ? '当前网络尚未支持'
                    : 'Current network is not configured'}
              </div>
              <h1 className="mt-6 text-5xl font-extrabold tracking-tight text-gray-900 dark:text-white md:text-7xl">
                {t('home.title1')}
                <br />
                <span className="bg-gradient-to-r from-blue-600 to-emerald-500 bg-clip-text text-transparent dark:from-blue-400 dark:to-emerald-400">
                  {t('home.title2')}
                </span>
              </h1>
              <p className="mt-5 max-w-2xl text-lg text-gray-600 dark:text-gray-400">
                {t('home.desc')}
              </p>

              <div className="mt-8 flex flex-wrap gap-4">
                <Link
                  href="/swap"
                  className="rounded-2xl bg-blue-600 px-8 py-4 text-lg font-bold text-white shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02] hover:bg-blue-700"
                >
                  {t('home.launch')}
                </Link>
                <Link
                  href="/pool"
                  className="rounded-2xl bg-emerald-600 px-8 py-4 text-lg font-bold text-white shadow-lg shadow-emerald-500/20 transition-all hover:scale-[1.02] hover:bg-emerald-700"
                >
                  {t('nav.pools', 'Pools')}
                </Link>
                <Link
                  href="/earn"
                  className="rounded-2xl bg-amber-500 px-8 py-4 text-lg font-bold text-white shadow-lg shadow-amber-500/20 transition-all hover:scale-[1.02] hover:bg-amber-600"
                >
                  {t('nav.earn', 'Earn')}
                </Link>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {liveCards.map((card) => (
                <div
                  key={card.title}
                  className="rounded-3xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-700 dark:bg-gray-900/60"
                >
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <card.icon size={16} />
                    <span>{card.title}</span>
                  </div>
                  <div className="mt-3 text-2xl font-bold text-gray-900 dark:text-white">
                    {card.value}
                  </div>
                  <div className="mt-2 break-all text-sm text-gray-500 dark:text-gray-400">
                    {card.detail}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-[2rem] border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-800">
            <div className="text-lg font-semibold text-gray-900 dark:text-white">
              {isZh ? '当前用户概览' : 'Wallet Snapshot'}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl bg-gray-100 p-4 dark:bg-gray-900">
                <div className="text-sm text-gray-500 dark:text-gray-400">ETH</div>
                <div className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">
                  {isConnected ? formatDisplayAmount(walletEth?.formatted) : '--'}
                </div>
              </div>
              <div className="rounded-3xl bg-gray-100 p-4 dark:bg-gray-900">
                <div className="text-sm text-gray-500 dark:text-gray-400">FLUX</div>
                <div className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">
                  {isConnected ? formatDisplayAmount(walletFlux?.formatted) : '--'}
                </div>
              </div>
              <div className="rounded-3xl bg-gray-100 p-4 dark:bg-gray-900">
                <div className="text-sm text-gray-500 dark:text-gray-400">LP</div>
                <div className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">
                  {isConnected ? formatDisplayAmount(walletLp?.formatted) : '--'}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-800">
            <div className="text-lg font-semibold text-gray-900 dark:text-white">
              {isZh ? '下一步建议' : 'Next Best Actions'}
            </div>
            <div className="mt-4 space-y-3 text-sm text-gray-600 dark:text-gray-300">
              <div className="rounded-3xl bg-gray-100 p-4 dark:bg-gray-900">
                {normalizedPairAddress
                  ? isZh
                    ? '池子已存在，可以直接前往 Swap 或继续补充流动性。'
                    : 'The pool already exists. You can head to Swap or add more liquidity.'
                  : isZh
                    ? '当前还没有 ETH / FLUX 池子，先去 Pool 页面完成第一次加池。'
                    : 'There is no ETH / FLUX pool yet. Bootstrap it from the Pool page first.'}
              </div>
              <div className="rounded-3xl bg-gray-100 p-4 dark:bg-gray-900">
                {normalizedStakingPoolAddress
                  ? isZh
                    ? 'Earn 已可用，有 LP 后可以直接去质押和领取奖励。'
                    : 'Earn is available. Once you hold LP, you can stake and claim rewards.'
                  : isZh
                    ? 'Earn 还没关联 staking pool，当前用户端可先完成 Swap 和 Pool 测试。'
                    : 'Earn does not have a linked staking pool yet, so user flows are currently focused on Swap and Pool.'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
