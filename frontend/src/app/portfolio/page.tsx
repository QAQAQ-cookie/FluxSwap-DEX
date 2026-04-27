'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useAccount, useBalance, useChainId } from 'wagmi';
import { ArrowRight, Coins, Droplets, Gift, Layers3, ShieldCheck, Wallet } from 'lucide-react';
import { zeroAddress } from 'viem';

import {
  getContractAddress,
  isFluxSupportedChain,
} from '@/config/contracts';
import {
  formatBigIntAmount,
  formatDisplayAmount,
} from '@/lib/amounts';
import { truncateAddress } from '@/lib/wallet';
import {
  useReadFluxPoolFactoryLpTokenPools,
  useReadFluxSwapFactoryGetPair,
  useReadFluxSwapLpStakingPoolBalanceOf,
  useReadFluxSwapLpStakingPoolEarned,
  useReadFluxSwapLpStakingPoolPendingUserRewards,
  useReadFluxSwapLpStakingPoolRewardReserve,
  useReadFluxSwapPairBalanceOf,
  useReadFluxSwapPairGetReserves,
  useReadFluxSwapPairToken0,
  useReadFluxSwapPairTotalSupply,
} from '@/lib/contracts';

function MetricCard({
  title,
  value,
  detail,
  icon: Icon,
}: {
  title: string;
  value: string;
  detail: string;
  icon: typeof Wallet;
}) {
  return (
    <div className="rounded-[1.75rem] border border-black/5 bg-white/75 p-5 shadow-xl shadow-sky-500/5 backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Icon size={16} />
        <span>{title}</span>
      </div>
      <div className="mt-3 text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
      <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">{detail}</div>
    </div>
  );
}

export default function PortfolioPage() {
  const { i18n } = useTranslation();
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

  const { data: walletLp } = useReadFluxSwapPairBalanceOf({
    address: normalizedPairAddress ?? zeroAddress,
    chainId,
    args: [address ?? zeroAddress],
    query: {
      enabled: !!address && !!normalizedPairAddress && isConnected,
      refetchInterval: 8000,
    },
  });

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

  const { data: stakedLp } = useReadFluxSwapLpStakingPoolBalanceOf({
    address: normalizedStakingPoolAddress ?? zeroAddress,
    chainId,
    args: [address ?? zeroAddress],
    query: {
      enabled: !!normalizedStakingPoolAddress && !!address && isConnected,
      refetchInterval: 8000,
    },
  });

  const { data: earnedRewards } = useReadFluxSwapLpStakingPoolEarned({
    address: normalizedStakingPoolAddress ?? zeroAddress,
    chainId,
    args: [address ?? zeroAddress],
    query: {
      enabled: !!normalizedStakingPoolAddress && !!address && isConnected,
      refetchInterval: 8000,
    },
  });

  const { data: pendingRewards } = useReadFluxSwapLpStakingPoolPendingUserRewards({
    address: normalizedStakingPoolAddress ?? zeroAddress,
    chainId,
    query: {
      enabled: !!normalizedStakingPoolAddress,
      refetchInterval: 8000,
    },
  });

  const { data: rewardReserve } = useReadFluxSwapLpStakingPoolRewardReserve({
    address: normalizedStakingPoolAddress ?? zeroAddress,
    chainId,
    query: {
      enabled: !!normalizedStakingPoolAddress,
      refetchInterval: 10000,
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

  const portfolioCards = [
    {
      title: 'ETH',
      value: isConnected ? formatDisplayAmount(walletEth?.formatted) : '--',
      detail: isZh ? '钱包原生币余额' : 'Native balance in wallet',
      icon: Wallet,
    },
    {
      title: 'FLUX',
      value: isConnected ? formatDisplayAmount(walletFlux?.formatted) : '--',
      detail: isZh ? '钱包中的 FLUX' : 'FLUX held in wallet',
      icon: Coins,
    },
    {
      title: 'LP',
      value: isConnected ? formatBigIntAmount(walletLp, 18, 4) : '--',
      detail: isZh ? '未质押的 LP 份额' : 'Unstaked LP balance',
      icon: Layers3,
    },
    {
      title: isZh ? '已质押 LP' : 'Staked LP',
      value: isConnected ? formatBigIntAmount(stakedLp, 18, 4) : '--',
      detail: isZh ? '已投入 Earn 的 LP' : 'LP already deposited into Earn',
      icon: ShieldCheck,
    },
  ];

  const quickActions = [
    {
      href: '/swap',
      title: isZh ? '去兑换' : 'Open Swap',
      detail: isZh ? '买入或卖出 FLUX，测试滑点与授权。' : 'Buy or sell FLUX and test approvals.',
    },
    {
      href: '/pool/eth-flux',
      title: isZh ? '去池子' : 'Manage Pool',
      detail: isZh ? '添加或移除流动性，查看池子最近交易。' : 'Add or remove liquidity and inspect recent pool activity.',
    },
    {
      href: '/earn',
      title: isZh ? '去 Earn' : 'Open Earn',
      detail: isZh ? '质押 LP、提取仓位、领取奖励。' : 'Stake LP, withdraw positions, and claim rewards.',
    },
  ];

  const poolShare =
    walletLp !== undefined && totalSupply && totalSupply > BigInt(0)
      ? Number((walletLp * BigInt(1000000)) / totalSupply) / 10000
      : 0;

  return (
    <div className="px-4 py-10 lg:px-6">
      <div className="space-y-6">
        <section className="rounded-[2.5rem] border border-black/5 bg-white/75 p-6 shadow-2xl shadow-sky-500/5 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.04]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-500/10 dark:text-emerald-300">
                {supportedChain
                  ? isZh
                    ? '用户资产中心'
                    : 'User Portfolio'
                  : isZh
                    ? '当前网络未配置'
                    : 'Unsupported network'}
              </div>
              <h1 className="mt-4 text-4xl font-black tracking-tight text-gray-900 dark:text-white md:text-5xl">
                {isZh ? '我的资产、LP 与收益位置' : 'Your assets, LP, and reward positions'}
              </h1>
              <p className="mt-3 max-w-3xl text-base text-gray-600 dark:text-gray-300">
                {isZh
                  ? '这个页面把钱包余额、流动性份额、Earn 仓位和协议连接状态集中到一起，方便你连续测试整条用户路径。'
                  : 'This page brings together wallet balances, LP exposure, Earn positions, and protocol state so you can test the full user workflow from one place.'}
              </p>
            </div>

            <div className="rounded-[1.75rem] border border-black/5 bg-black/[0.03] px-5 py-4 text-sm dark:border-white/10 dark:bg-white/[0.04]">
              <div className="text-gray-500 dark:text-gray-400">
                {isZh ? '当前钱包' : 'Connected wallet'}
              </div>
              <div className="mt-1 font-medium text-gray-900 dark:text-white">
                {address ? truncateAddress(address, 10, 8) : '--'}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-4">
          {portfolioCards.map((card) => (
            <MetricCard
              key={card.title}
              title={card.title}
              value={card.value}
              detail={card.detail}
              icon={card.icon}
            />
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[2.25rem] border border-black/5 bg-white/75 p-6 shadow-2xl shadow-sky-500/5 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.04]">
            <div className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
              <Droplets size={18} />
              <span>{isZh ? '池子与份额快照' : 'Pool and share snapshot'}</span>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <MetricCard
                title={isZh ? '池子储备' : 'Pool reserves'}
                value={`${formatBigIntAmount(reserveEth, 18, 3)} ETH`}
                detail={`${formatBigIntAmount(reserveFlux, 18, 3)} FLUX`}
                icon={Droplets}
              />
              <MetricCard
                title={isZh ? '钱包 LP 占比' : 'Wallet LP share'}
                value={`${poolShare.toFixed(2)}%`}
                detail={
                  isZh
                    ? `LP 总供应 ${formatBigIntAmount(totalSupply, 18, 4)}`
                    : `Total LP supply ${formatBigIntAmount(totalSupply, 18, 4)}`
                }
                icon={Layers3}
              />
            </div>

            <div className="mt-5 rounded-[1.75rem] bg-gray-100 p-5 dark:bg-gray-900/60">
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {isZh ? '当前关键地址' : 'Key addresses'}
              </div>
              <div className="mt-3 space-y-2 text-sm text-gray-700 dark:text-gray-300">
                <div className="flex items-center justify-between gap-3">
                  <span>Pair</span>
                  <span className="font-medium">{normalizedPairAddress ? truncateAddress(normalizedPairAddress, 10, 8) : '--'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Staking Pool</span>
                  <span className="font-medium">{normalizedStakingPoolAddress ? truncateAddress(normalizedStakingPoolAddress, 10, 8) : '--'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Reward Reserve</span>
                  <span className="font-medium">{formatBigIntAmount(rewardReserve, 18, 4)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[2.25rem] border border-black/5 bg-white/75 p-6 shadow-2xl shadow-sky-500/5 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.04]">
            <div className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
              <Gift size={18} />
              <span>{isZh ? '收益与待领取状态' : 'Rewards and pending status'}</span>
            </div>

            <div className="mt-5 space-y-4">
              <MetricCard
                title={isZh ? '已赚取奖励' : 'Earned rewards'}
                value={formatBigIntAmount(earnedRewards, 18, 4)}
                detail={isZh ? '当前用户可领取奖励' : 'Rewards currently claimable by the user'}
                icon={Gift}
              />
              <MetricCard
                title={isZh ? '待记账奖励' : 'Pending rewards'}
                value={formatBigIntAmount(pendingRewards, 18, 4)}
                detail={isZh ? '等待同步到用户侧的奖励' : 'Rewards pending sync to the user side'}
                icon={ShieldCheck}
              />
            </div>
          </div>
        </section>

        <section className="rounded-[2.25rem] border border-black/5 bg-white/75 p-6 shadow-2xl shadow-sky-500/5 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.04]">
          <div className="text-lg font-semibold text-gray-900 dark:text-white">
            {isZh ? '下一步操作' : 'Next actions'}
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {quickActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="group rounded-[1.75rem] border border-black/5 bg-gray-100 p-5 transition-all hover:-translate-y-0.5 hover:bg-white dark:border-white/10 dark:bg-gray-900/60 dark:hover:bg-white/[0.06]"
              >
                <div className="flex items-center justify-between">
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">
                    {action.title}
                  </div>
                  <ArrowRight
                    size={18}
                    className="text-gray-400 transition-transform group-hover:translate-x-1 group-hover:text-sky-500"
                  />
                </div>
                <div className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                  {action.detail}
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
