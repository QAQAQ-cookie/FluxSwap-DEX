'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useChainId } from 'wagmi';
import { Droplets, Repeat2, Sparkles, Zap } from 'lucide-react';

import { isFluxSupportedChain } from '@/config/contracts';
import { useIsClient } from '@/hooks/useIsClient';

const SwapWidget = dynamic(
  () => import('@/components/SwapWidget').then((mod) => mod.SwapWidget),
  {
    ssr: false,
    loading: () => (
      <div className="w-full rounded-[2rem] border border-gray-200 bg-white p-4 shadow-2xl dark:border-gray-700 dark:bg-gray-800">
        <div className="animate-pulse space-y-4">
          <div className="h-7 w-32 rounded-xl bg-gray-200 dark:bg-gray-700" />
          <div className="h-36 rounded-3xl bg-gray-100 dark:bg-gray-900" />
          <div className="mx-auto h-5 w-12 rounded-xl bg-gray-200 dark:bg-gray-700" />
          <div className="h-36 rounded-3xl bg-gray-100 dark:bg-gray-900" />
          <div className="h-12 rounded-xl bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>
    ),
  },
);

export default function Home() {
  const mounted = useIsClient();
  const { i18n } = useTranslation();
  const isZh = mounted ? i18n.language.startsWith('zh') : true;
  const chainId = useChainId();
  const effectiveChainId = mounted ? chainId : undefined;
  const supportedChain = isFluxSupportedChain(effectiveChainId);

  const features = [
    {
      icon: <Repeat2 size={28} className="text-sky-500" />,
      title: isZh ? '极速兑换' : 'Lightning Swap',
      desc: isZh 
        ? '以极低的滑点和最优的价格在 ETH 与 FLUX 之间进行即时兑换。' 
        : 'Swap instantly between ETH and FLUX with minimal slippage and optimal pricing.',
      link: '/swap',
    },
    {
      icon: <Droplets size={28} className="text-emerald-500" />,
      title: isZh ? '流动性池' : 'Liquidity Pools',
      desc: isZh 
        ? '为协议提供流动性并赚取交易手续费分成，支持随时存取。' 
        : 'Provide liquidity to the protocol, earn trading fees, and manage your positions anytime.',
      link: '/pool',
    },
    {
      icon: <Sparkles size={28} className="text-purple-500" />,
      title: isZh ? '收益农场' : 'Yield Farming',
      desc: isZh 
        ? '质押您的 LP 代币以获取额外的 FLUX 奖励，最大化资金效率。' 
        : 'Stake your LP tokens to earn additional FLUX rewards and maximize your capital efficiency.',
      link: '/earn',
    }
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1500px] min-h-[calc(100vh-180px)] flex-col justify-start px-4 pt-12 pb-16 lg:px-6 xl:px-8 lg:pt-20 lg:pb-24">
      
      {/* Hero Section */}
      <div className="relative mb-20 w-full text-left flex flex-col lg:flex-row lg:items-center lg:justify-between gap-12 lg:gap-8">
        
        {/* Left Content */}
        <div className="relative w-full max-w-3xl lg:w-3/5">
          {/* Glow effect behind the title */}
          <div className="pointer-events-none absolute left-0 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-sky-500/20 blur-[100px]" />

          <h1 className="mb-6 text-5xl font-black leading-tight tracking-tight text-gray-900 dark:text-white md:text-7xl lg:text-[5.5rem]">
            <span className="bg-gradient-to-r from-sky-400 via-emerald-400 to-sky-400 bg-clip-text text-transparent">
              FluxSwap
            </span>
            <br />
            <span className="mt-2 block text-4xl md:text-5xl lg:text-6xl">
              {isZh ? '下一代去中心化交易' : 'Next-Gen DeFi Protocol'}
            </span>
          </h1>

          <p className="mb-10 max-w-2xl text-lg leading-relaxed text-gray-600 dark:text-gray-300 md:text-xl">
            {isZh
              ? '高效、安全、易用的去中心化交易协议。围绕极速兑换、深度流动性与高收益场景构建，让您的数字资产释放最大潜能。'
              : 'A highly efficient, secure, and user-friendly decentralized trading protocol. Built for lightning-fast swaps, deep liquidity, and high-yield farming.'}
          </p>

          <div className="flex flex-col items-start gap-4 sm:flex-row">
            <Link
              href="/swap"
              className="group relative inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 to-emerald-500 px-8 py-4 text-lg font-bold text-white shadow-xl shadow-sky-500/25 transition-all hover:scale-105 hover:shadow-sky-500/40"
            >
              <Repeat2 size={20} className="transition-transform group-hover:rotate-180" />
              <span>{isZh ? '立即交易' : 'Start Trading'}</span>
            </Link>
            <Link
              href="/pool"
              className="inline-flex items-center gap-2 rounded-2xl border border-black/10 bg-white/50 px-8 py-4 text-lg font-bold text-gray-900 backdrop-blur-md transition-all hover:scale-105 hover:bg-white/80 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            >
              <Droplets size={20} />
              <span>{isZh ? '提供流动性' : 'Provide Liquidity'}</span>
            </Link>
          </div>
        </div>

        {/* Right Swap UI */}
        <div className="w-full max-w-md lg:w-2/5 shrink-0 mx-auto lg:mx-0">
          <div className="relative">
            {/* Glow behind the swap card */}
            <div className="pointer-events-none absolute -inset-4 -z-10 rounded-[3rem] bg-gradient-to-br from-sky-500/20 to-emerald-500/20 blur-2xl opacity-50 dark:opacity-30" />
            <SwapWidget hideDetails />
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="grid w-full gap-6 md:grid-cols-3 xl:gap-8">
        {features.map((feature, idx) => (
          <Link href={feature.link} key={idx} className="block h-full">
            <div className="group flex h-full flex-col rounded-[2rem] border border-black/5 bg-white/60 p-8 shadow-lg backdrop-blur-xl transition-all hover:-translate-y-2 hover:bg-white/80 hover:shadow-xl dark:border-white/10 dark:bg-white/[0.02] dark:hover:bg-white/[0.05]">
              <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-md transition-transform group-hover:scale-110 dark:bg-white/[0.08]">
                {feature.icon}
              </div>
              <h3 className="mb-3 text-2xl font-bold text-gray-900 transition-colors group-hover:text-sky-500 dark:text-white">
                {feature.title}
              </h3>
              <p className="text-base leading-relaxed text-gray-600 dark:text-gray-400">
                {feature.desc}
              </p>
            </div>
          </Link>
        ))}
      </div>
      
      {/* Network Status Alert */}
      {!supportedChain && (
        <div className="mt-12 flex w-full max-w-2xl items-center gap-4 rounded-3xl border border-amber-200/50 bg-amber-50/50 p-6 backdrop-blur-md dark:border-amber-900/30 dark:bg-amber-900/10">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-400">
            <Zap size={24} />
          </div>
          <div>
            <h4 className="text-lg font-bold text-amber-900 dark:text-amber-300">
              {isZh ? '网络未支持' : 'Unsupported Network'}
            </h4>
            <p className="mt-1 text-amber-700 dark:text-amber-400/80">
              {isZh 
                ? '当前网络还没有配置 FluxSwap 合约地址，请在钱包中切换到已支持的网络（如 Sepolia 测试网 或 Hardhat Local）。' 
                : 'FluxSwap contracts are not configured for the current network. Please switch to a supported network (e.g., Sepolia or Hardhat Local) in your wallet.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
