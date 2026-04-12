'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import {
  useAccount,
  useBalance,
  useChainId,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import {
  Coins,
  Gift,
  Info,
  ShieldCheck,
  Sparkles,
  Vault,
} from 'lucide-react';
import { formatUnits, maxUint256, zeroAddress } from 'viem';

import { getContractAddress, isFluxSupportedChain } from '@/config/contracts';
import { ActionButton } from '@/components/ActionButton';
import { TokenAmountCard } from '@/components/TokenAmountCard';
import { useIsClient } from '@/hooks/useIsClient';
import {
  formatBigIntAmount,
  formatDisplayAmount,
  parseAmount,
} from '@/lib/amounts';
import { formatErrorMessage } from '@/lib/errors';
import {
  fluxSwapLpStakingPoolAbi,
  fluxSwapPairAbi,
  useReadFluxMultiPoolManagerPendingPoolRewards,
  useReadFluxPoolFactoryLpTokenPools,
  useReadFluxSwapFactoryGetPair,
  useReadFluxSwapLpStakingPoolBalanceOf,
  useReadFluxSwapLpStakingPoolEarned,
  useReadFluxSwapLpStakingPoolPendingUserRewards,
  useReadFluxSwapLpStakingPoolRewardReserve,
  useReadFluxSwapLpStakingPoolRewardsToken,
  useReadFluxSwapLpStakingPoolTotalStaked,
  useReadFluxSwapPairAllowance,
} from '@/lib/contracts';

type EarnAction = 'approve-lp' | 'stake' | 'withdraw' | 'claim' | 'exit' | null;

export default function EarnPage() {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const copy = {
    title: isZh ? '收益农场' : 'Earn',
    subtitle: isZh
      ? '围绕 ETH / FLUX LP 的质押、提取与奖励领取'
      : 'Stake ETH / FLUX LP, withdraw staked LP, and claim rewards',
    unsupportedChain: isZh
      ? '当前网络未同步收益相关合约地址'
      : 'Contracts are not configured for this network',
    noPair: isZh ? '当前还没有 ETH / FLUX LP' : 'ETH / FLUX LP does not exist yet',
    noStakingPool: isZh
      ? '当前 LP 还没有关联收益池'
      : 'This LP does not have a staking pool yet',
    stakingPoolReady: isZh ? '收益池已就绪' : 'Staking pool is active',
    walletNeeded: isZh ? '连接钱包后查看并参与质押' : 'Connect wallet to view and stake',
    stakeTitle: isZh ? '质押 LP' : 'Stake LP',
    withdrawTitle: isZh ? '提取 LP' : 'Withdraw LP',
    rewardTitle: isZh ? '奖励中心' : 'Rewards',
    approveLp: isZh ? '授权 LP' : 'Approve LP',
    stakeNow: isZh ? '立即质押' : 'Stake Now',
    withdrawNow: isZh ? '提取质押' : 'Withdraw',
    claimNow: isZh ? '领取奖励' : 'Claim Rewards',
    exitNow: isZh ? '退出池子' : 'Exit Pool',
    approving: isZh ? '授权中...' : 'Approving...',
    staking: isZh ? '质押中...' : 'Staking...',
    withdrawing: isZh ? '提取中...' : 'Withdrawing...',
    claiming: isZh ? '领取中...' : 'Claiming...',
    exiting: isZh ? '退出中...' : 'Exiting...',
    enterAmount: isZh ? '请输入有效数量' : 'Enter a valid amount',
    insufficientLp: isZh ? 'LP 余额不足' : 'Insufficient LP balance',
    insufficientStaked: isZh ? '已质押余额不足' : 'Insufficient staked balance',
    nothingToClaim: isZh ? '暂无可领取奖励' : 'No rewards available to claim',
    txSubmitted: isZh ? '交易已提交' : 'Transaction submitted',
    txConfirmed: isZh ? '交易已确认' : 'Transaction confirmed',
    refreshNote: isZh
      ? '交易确认后已自动刷新链上数据'
      : 'On-chain data refreshed after confirmation',
    lpWalletBalance: isZh ? '钱包 LP 余额' : 'Wallet LP Balance',
    stakedBalance: isZh ? '已质押 LP' : 'Staked LP',
    totalStaked: isZh ? '总质押量' : 'Total Staked',
    rewardReserve: isZh ? '奖励储备' : 'Reward Reserve',
    earned: isZh ? '可领取奖励' : 'Earned Rewards',
    pendingUserRewards: isZh ? '用户待记账奖励' : 'Pending User Rewards',
    pendingPoolRewards: isZh ? '池子待同步奖励' : 'Pending Pool Rewards',
    stakingPoolAddress: isZh ? '收益池地址' : 'Staking Pool Address',
    pairAddress: isZh ? 'LP 地址' : 'LP Address',
    rewardToken: isZh ? '奖励代币' : 'Reward Token',
    poolFactoryAddress: isZh ? '收益池工厂地址' : 'Pool Factory Address',
    managerAddress: isZh ? '多池管理器地址' : 'Multi Pool Manager',
    setupStatus: isZh ? '当前状态' : 'Setup Status',
    lpReady: isZh ? 'LP 已创建' : 'LP ready',
    lpMissing: isZh ? 'LP 未创建' : 'LP missing',
    stakingReady: isZh ? '收益池已创建' : 'Staking ready',
    stakingMissing: isZh ? '收益池未创建' : 'Staking missing',
    bootstrapHint: isZh
      ? '如果这里显示还没有 LP，请先去 Pool 页面创建 ETH / FLUX 流动性头寸。'
      : 'If there is no LP yet, create an ETH / FLUX liquidity position on the Pool page first.',
    createStakingHint: isZh
      ? 'LP 已经存在，但还没有关联收益池。需要治理或管理员通过 PoolFactory / MultiPoolManager 完成收益池创建与初始化。'
      : 'The LP already exists, but there is no linked staking pool yet. Governance or admin still needs to create and initialize it through the PoolFactory / MultiPoolManager.',
    toPool: isZh ? '前往创建 LP' : 'Create LP position first',
    connectWallet: isZh ? '连接钱包' : 'Connect Wallet',
    lpAllowance: isZh ? 'LP 授权额度' : 'LP Allowance',
    fluxBalance: 'FLUX Balance',
  };

  const mounted = useIsClient();
  const chainId = useChainId();
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { writeContractAsync, data: hash, isPending: isWritePending } =
    useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash });

  const [stakeAmount, setStakeAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [txError, setTxError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<EarnAction>(null);

  const supportedChain = isFluxSupportedChain(chainId);
  const factoryAddress = getContractAddress('FluxSwapFactory', chainId);
  const poolFactoryAddress = getContractAddress('FluxPoolFactory', chainId);
  const managerAddress = getContractAddress('FluxMultiPoolManager', chainId);
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

  const { data: lpWalletBalance, refetch: refetchLpWalletBalance } = useBalance({
    address,
    chainId,
    token: normalizedPairAddress,
    query: {
      enabled: !!address && !!normalizedPairAddress && isConnected,
      refetchInterval: 8000,
    },
  });

  const { data: rewardWalletBalance, refetch: refetchRewardWalletBalance } = useBalance({
    address,
    chainId,
    token: fluxTokenAddress,
    query: {
      enabled: !!address && !!fluxTokenAddress && isConnected,
      refetchInterval: 8000,
    },
  });

  const {
    data: stakedBalance,
    refetch: refetchStakedBalance,
  } = useReadFluxSwapLpStakingPoolBalanceOf({
    address: normalizedStakingPoolAddress ?? zeroAddress,
    chainId,
    args: [address ?? zeroAddress],
    query: {
      enabled: !!normalizedStakingPoolAddress && !!address && isConnected,
      refetchInterval: 8000,
    },
  });

  const {
    data: earnedRewards,
    refetch: refetchEarnedRewards,
  } = useReadFluxSwapLpStakingPoolEarned({
    address: normalizedStakingPoolAddress ?? zeroAddress,
    chainId,
    args: [address ?? zeroAddress],
    query: {
      enabled: !!normalizedStakingPoolAddress && !!address && isConnected,
      refetchInterval: 8000,
    },
  });

  const {
    data: pendingUserRewards,
    refetch: refetchPendingUserRewards,
  } = useReadFluxSwapLpStakingPoolPendingUserRewards({
    address: normalizedStakingPoolAddress ?? zeroAddress,
    chainId,
    query: {
      enabled: !!normalizedStakingPoolAddress,
      refetchInterval: 8000,
    },
  });

  const {
    data: totalStaked,
    refetch: refetchTotalStaked,
  } = useReadFluxSwapLpStakingPoolTotalStaked({
    address: normalizedStakingPoolAddress ?? zeroAddress,
    chainId,
    query: {
      enabled: !!normalizedStakingPoolAddress,
      refetchInterval: 10000,
    },
  });

  const {
    data: rewardReserve,
    refetch: refetchRewardReserve,
  } = useReadFluxSwapLpStakingPoolRewardReserve({
    address: normalizedStakingPoolAddress ?? zeroAddress,
    chainId,
    query: {
      enabled: !!normalizedStakingPoolAddress,
      refetchInterval: 10000,
    },
  });

  const {
    data: rewardsToken,
    refetch: refetchRewardsToken,
  } = useReadFluxSwapLpStakingPoolRewardsToken({
    address: normalizedStakingPoolAddress ?? zeroAddress,
    chainId,
    query: {
      enabled: !!normalizedStakingPoolAddress,
      refetchInterval: 10000,
    },
  });

  const {
    data: pendingPoolRewards,
    refetch: refetchPendingPoolRewards,
  } = useReadFluxMultiPoolManagerPendingPoolRewards({
    address: managerAddress ?? zeroAddress,
    chainId,
    args: [normalizedStakingPoolAddress ?? zeroAddress],
    query: {
      enabled: !!managerAddress && !!normalizedStakingPoolAddress,
      refetchInterval: 10000,
    },
  });

  const { data: lpAllowance, refetch: refetchLpAllowance } = useReadFluxSwapPairAllowance({
    address: normalizedPairAddress ?? zeroAddress,
    chainId,
    args: [address ?? zeroAddress, normalizedStakingPoolAddress ?? zeroAddress],
    query: {
      enabled:
        !!normalizedPairAddress &&
        !!normalizedStakingPoolAddress &&
        !!address &&
        isConnected,
      refetchInterval: 8000,
    },
  });

  const parsedStakeAmount = parseAmount(stakeAmount);
  const parsedWithdrawAmount = parseAmount(withdrawAmount);

  const stakeNeedsApproval = Boolean(
    parsedStakeAmount &&
      parsedStakeAmount > BigInt(0) &&
      lpAllowance !== undefined &&
      parsedStakeAmount > lpAllowance,
  );

  const insufficientLp = Boolean(
    parsedStakeAmount &&
      lpWalletBalance?.value !== undefined &&
      parsedStakeAmount > lpWalletBalance.value,
  );
  const insufficientStaked = Boolean(
    parsedWithdrawAmount &&
      stakedBalance !== undefined &&
      parsedWithdrawAmount > stakedBalance,
  );
  const stakingSetupReady = Boolean(normalizedPairAddress && normalizedStakingPoolAddress);
  const hasLpPosition = Boolean(
    lpWalletBalance?.value !== undefined && lpWalletBalance.value > BigInt(0),
  );
  const setupHint = !normalizedPairAddress
    ? copy.bootstrapHint
    : !normalizedStakingPoolAddress
      ? copy.createStakingHint
      : copy.walletNeeded;

  const isSubmitting = isWritePending || isConfirming;
  const handledReceiptHashRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!hash || !isConfirmed || handledReceiptHashRef.current === hash) {
      return;
    }

    handledReceiptHashRef.current = hash;

    void Promise.allSettled([
      refetchLpWalletBalance(),
      refetchRewardWalletBalance(),
      refetchStakedBalance(),
      refetchEarnedRewards(),
      refetchPendingUserRewards(),
      refetchTotalStaked(),
      refetchRewardReserve(),
      refetchRewardsToken(),
      refetchPendingPoolRewards(),
      refetchLpAllowance(),
    ]);

    if (lastAction === 'stake' || lastAction === 'approve-lp') {
      setStakeAmount('');
    }

    if (lastAction === 'withdraw' || lastAction === 'exit') {
      setWithdrawAmount('');
    }
  }, [
    hash,
    isConfirmed,
    lastAction,
    refetchEarnedRewards,
    refetchLpAllowance,
    refetchLpWalletBalance,
    refetchPendingPoolRewards,
    refetchPendingUserRewards,
    refetchRewardReserve,
    refetchRewardWalletBalance,
    refetchRewardsToken,
    refetchStakedBalance,
    refetchTotalStaked,
  ]);

  let stakeLabel = copy.stakeNow;
  let stakeAction: EarnAction = 'stake';
  let stakeDisabled = false;

  if (!mounted || !isConnected) {
    stakeLabel = copy.connectWallet;
    stakeAction = null;
  } else if (!supportedChain || !normalizedPairAddress || !normalizedStakingPoolAddress) {
    stakeLabel = normalizedPairAddress ? copy.noStakingPool : copy.noPair;
    stakeAction = null;
    stakeDisabled = true;
  } else if (!parsedStakeAmount || parsedStakeAmount <= BigInt(0)) {
    stakeLabel = copy.enterAmount;
    stakeAction = null;
    stakeDisabled = true;
  } else if (insufficientLp) {
    stakeLabel = copy.insufficientLp;
    stakeAction = null;
    stakeDisabled = true;
  } else if (isSubmitting) {
    stakeLabel =
      lastAction === 'approve-lp'
        ? copy.approving
        : lastAction === 'stake'
          ? copy.staking
          : copy.stakeNow;
    stakeAction = null;
    stakeDisabled = true;
  } else if (stakeNeedsApproval) {
    stakeLabel = copy.approveLp;
    stakeAction = 'approve-lp';
  }

  let withdrawLabel = copy.withdrawNow;
  let withdrawAction: EarnAction = 'withdraw';
  let withdrawDisabled = false;

  if (!mounted || !isConnected) {
    withdrawLabel = copy.connectWallet;
    withdrawAction = null;
  } else if (!supportedChain || !normalizedStakingPoolAddress) {
    withdrawLabel = copy.noStakingPool;
    withdrawAction = null;
    withdrawDisabled = true;
  } else if (!parsedWithdrawAmount || parsedWithdrawAmount <= BigInt(0)) {
    withdrawLabel = copy.enterAmount;
    withdrawAction = null;
    withdrawDisabled = true;
  } else if (insufficientStaked) {
    withdrawLabel = copy.insufficientStaked;
    withdrawAction = null;
    withdrawDisabled = true;
  } else if (isSubmitting) {
    withdrawLabel =
      lastAction === 'withdraw' ? copy.withdrawing : copy.withdrawNow;
    withdrawAction = null;
    withdrawDisabled = true;
  }

  const claimDisabled =
    !mounted ||
    !isConnected ||
    !normalizedStakingPoolAddress ||
    !earnedRewards ||
    earnedRewards <= BigInt(0) ||
    isSubmitting;

  const exitDisabled =
    !mounted ||
    !isConnected ||
    !normalizedStakingPoolAddress ||
    !stakedBalance ||
    stakedBalance <= BigInt(0) ||
    isSubmitting;

  const pairState = !supportedChain
    ? copy.unsupportedChain
    : !normalizedPairAddress
      ? copy.noPair
      : !normalizedStakingPoolAddress
        ? copy.noStakingPool
        : copy.stakingPoolReady;

  const handleMaxStake = () => {
    if (lpWalletBalance?.formatted) {
      setStakeAmount(lpWalletBalance.formatted);
    }
  };

  const handleMaxWithdraw = () => {
    if (stakedBalance !== undefined) {
      setWithdrawAmount(formatUnits(stakedBalance, 18));
    }
  };

  const handleStake = async () => {
    if (!mounted || !isConnected) {
      openConnectModal?.();
      return;
    }

    if (!stakeAction || !normalizedPairAddress || !normalizedStakingPoolAddress) {
      return;
    }

    setTxError(null);
    setLastAction(stakeAction);

    try {
      if (stakeAction === 'approve-lp') {
        await writeContractAsync({
          address: normalizedPairAddress,
          abi: fluxSwapPairAbi,
          functionName: 'approve',
          args: [normalizedStakingPoolAddress, maxUint256],
          chainId,
        });
        return;
      }

      if (!parsedStakeAmount) {
        return;
      }

      await writeContractAsync({
        address: normalizedStakingPoolAddress,
        abi: fluxSwapLpStakingPoolAbi,
        functionName: 'stake',
        args: [parsedStakeAmount],
        chainId,
      });
    } catch (error) {
      setTxError(formatErrorMessage(error));
    }
  };

  const handleWithdraw = async () => {
    if (!mounted || !isConnected) {
      openConnectModal?.();
      return;
    }

    if (!withdrawAction || !normalizedStakingPoolAddress || !parsedWithdrawAmount) {
      return;
    }

    setTxError(null);
    setLastAction(withdrawAction);

    try {
      await writeContractAsync({
        address: normalizedStakingPoolAddress,
        abi: fluxSwapLpStakingPoolAbi,
        functionName: 'withdraw',
        args: [parsedWithdrawAmount],
        chainId,
      });
    } catch (error) {
      setTxError(formatErrorMessage(error));
    }
  };

  const handleClaim = async () => {
    if (!mounted || !isConnected) {
      openConnectModal?.();
      return;
    }

    if (!normalizedStakingPoolAddress || !earnedRewards || earnedRewards <= BigInt(0)) {
      return;
    }

    setTxError(null);
    setLastAction('claim');

    try {
      await writeContractAsync({
        address: normalizedStakingPoolAddress,
        abi: fluxSwapLpStakingPoolAbi,
        functionName: 'getReward',
        args: [],
        chainId,
      });
    } catch (error) {
      setTxError(formatErrorMessage(error));
    }
  };

  const handleExit = async () => {
    if (!mounted || !isConnected) {
      openConnectModal?.();
      return;
    }

    if (!normalizedStakingPoolAddress || !stakedBalance || stakedBalance <= BigInt(0)) {
      return;
    }

    setTxError(null);
    setLastAction('exit');

    try {
      await writeContractAsync({
        address: normalizedStakingPoolAddress,
        abi: fluxSwapLpStakingPoolAbi,
        functionName: 'exit',
        args: [],
        chainId,
      });
    } catch (error) {
      setTxError(formatErrorMessage(error));
    }
  };

  return (
    <div className="min-h-[calc(100vh-80px)] bg-gray-50 px-4 py-20 transition-colors duration-300 dark:bg-gray-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="rounded-[2rem] border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
                {copy.title}
              </h2>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                {copy.subtitle}
              </p>
            </div>
            <div className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-500/10 dark:text-emerald-300">
              ETH / FLUX LP
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-3xl bg-gray-100 p-4 dark:bg-gray-900">
              <div className="mb-2 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Vault size={16} />
                <span>{copy.pairAddress}</span>
              </div>
              <div className="break-all text-sm font-medium text-gray-900 dark:text-white">
                {normalizedPairAddress ?? '--'}
              </div>
            </div>

            <div className="rounded-3xl bg-gray-100 p-4 dark:bg-gray-900">
              <div className="mb-2 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <ShieldCheck size={16} />
                <span>{copy.stakingPoolAddress}</span>
              </div>
              <div className="break-all text-sm font-medium text-gray-900 dark:text-white">
                {normalizedStakingPoolAddress ?? '--'}
              </div>
            </div>

            <div className="rounded-3xl bg-gray-100 p-4 dark:bg-gray-900">
              <div className="mb-2 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Coins size={16} />
                <span>{copy.totalStaked}</span>
              </div>
              <div className="text-lg font-semibold text-gray-900 dark:text-white">
                {formatBigIntAmount(totalStaked, 18, 4)}
              </div>
            </div>

            <div className="rounded-3xl bg-gray-100 p-4 dark:bg-gray-900">
              <div className="mb-2 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Gift size={16} />
                <span>{copy.rewardReserve}</span>
              </div>
              <div className="text-lg font-semibold text-gray-900 dark:text-white">
                {formatBigIntAmount(rewardReserve, 18, 4)}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-3xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/60">
            <div className="flex items-start gap-3">
              <Info size={18} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
              <div className="text-sm">
                <div className="font-medium text-gray-900 dark:text-white">{pairState}</div>
                <div className="mt-1 text-gray-500 dark:text-gray-400">{setupHint}</div>
                {!normalizedPairAddress && (
                  <Link
                    href="/pool"
                    className="mt-2 inline-block font-semibold text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    {copy.toPool}
                  </Link>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-500/10">
              <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                {copy.setupStatus}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    normalizedPairAddress
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                      : 'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                  }`}
                >
                  {normalizedPairAddress ? copy.lpReady : copy.lpMissing}
                </span>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    normalizedStakingPoolAddress
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                      : 'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                  }`}
                >
                  {normalizedStakingPoolAddress ? copy.stakingReady : copy.stakingMissing}
                </span>
              </div>
              <div className="mt-3 text-sm text-amber-900/80 dark:text-amber-100/80">
                {setupHint}
              </div>
              {!normalizedPairAddress && (
                <Link
                  href="/pool"
                  className="mt-3 inline-block font-semibold text-blue-700 transition-colors hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
                >
                  {copy.toPool}
                </Link>
              )}
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <div className="space-y-3 text-sm">
                <div>
                  <div className="text-gray-500 dark:text-gray-400">{copy.poolFactoryAddress}</div>
                  <div className="mt-1 break-all font-medium text-gray-900 dark:text-white">
                    {poolFactoryAddress ?? '--'}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 dark:text-gray-400">{copy.managerAddress}</div>
                  <div className="mt-1 break-all font-medium text-gray-900 dark:text-white">
                    {managerAddress ?? '--'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {txError && (
            <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
              {txError}
            </div>
          )}

          {hash && (
            <div className="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
              {isConfirmed ? copy.txConfirmed : copy.txSubmitted}: {hash.slice(0, 10)}...
              {isConfirmed && <span className="ml-2">- {copy.refreshNote}</span>}
            </div>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1fr_0.9fr]">
          <div
            className={`rounded-[2rem] border border-gray-200 bg-white p-6 shadow-2xl transition-opacity dark:border-gray-700 dark:bg-gray-800 ${
              stakingSetupReady ? '' : 'opacity-75'
            }`}
          >
            <div className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
              <Sparkles size={18} />
              <span>{copy.stakeTitle}</span>
            </div>

            <TokenAmountCard
              label="LP Token"
              value={stakeAmount}
              onChange={setStakeAmount}
              symbol="LP"
              balanceLabel={copy.lpWalletBalance}
              balance={
                lpWalletBalance?.formatted
                  ? formatDisplayAmount(lpWalletBalance.formatted)
                  : '0.00'
              }
              onMax={handleMaxStake}
            />

            <div className="mt-4 rounded-3xl bg-gray-100 p-4 text-sm dark:bg-gray-900">
              <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
                <span>{copy.lpWalletBalance}</span>
                <span>
                  {lpWalletBalance?.formatted
                    ? formatDisplayAmount(lpWalletBalance.formatted)
                    : '0.00'}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-gray-600 dark:text-gray-300">
                <span>{copy.lpAllowance}</span>
                <span>{formatBigIntAmount(lpAllowance, 18, 4)}</span>
              </div>
            </div>

            <div className="mt-4">
              {!mounted || !isConnected ? (
                <ActionButton
                  label={copy.connectWallet}
                  disabled={false}
                  onClick={() => openConnectModal?.()}
                />
              ) : (
                <ActionButton
                  label={stakeLabel}
                  disabled={stakeDisabled}
                  loading={isSubmitting && (lastAction === 'approve-lp' || lastAction === 'stake')}
                  onClick={handleStake}
                />
              )}
            </div>
          </div>

          <div
            className={`rounded-[2rem] border border-gray-200 bg-white p-6 shadow-2xl transition-opacity dark:border-gray-700 dark:bg-gray-800 ${
              stakingSetupReady ? '' : 'opacity-75'
            }`}
          >
            <div className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
              <Vault size={18} />
              <span>{copy.withdrawTitle}</span>
            </div>

            <TokenAmountCard
              label="LP Token"
              value={withdrawAmount}
              onChange={setWithdrawAmount}
              symbol="LP"
              balanceLabel={copy.stakedBalance}
              balance={formatBigIntAmount(stakedBalance, 18, 4)}
              onMax={handleMaxWithdraw}
            />

            <div className="mt-4">
              <ActionButton
                label={withdrawLabel}
                disabled={withdrawDisabled}
                loading={isSubmitting && lastAction === 'withdraw'}
                onClick={handleWithdraw}
                variant="secondary"
              />
            </div>

            <div className="mt-4">
              <ActionButton
                label={
                  isSubmitting && lastAction === 'exit'
                    ? copy.exiting
                    : copy.exitNow
                }
                disabled={exitDisabled}
                loading={isSubmitting && lastAction === 'exit'}
                onClick={handleExit}
                variant="ghost"
              />
            </div>
          </div>

          <div
            className={`rounded-[2rem] border border-gray-200 bg-white p-6 shadow-2xl transition-opacity dark:border-gray-700 dark:bg-gray-800 ${
              stakingSetupReady ? '' : 'opacity-75'
            }`}
          >
            <div className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
              <Gift size={18} />
              <span>{copy.rewardTitle}</span>
            </div>

            <div className="space-y-3 rounded-3xl bg-gray-100 p-4 text-sm dark:bg-gray-900">
              <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
                <span>{copy.earned}</span>
                <span>{formatBigIntAmount(earnedRewards, 18, 4)}</span>
              </div>
              <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
                <span>{copy.pendingUserRewards}</span>
                <span>{formatBigIntAmount(pendingUserRewards, 18, 4)}</span>
              </div>
              <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
                <span>{copy.pendingPoolRewards}</span>
                <span>{formatBigIntAmount(pendingPoolRewards, 18, 4)}</span>
              </div>
              <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
                <span>{copy.rewardToken}</span>
                <span className="break-all text-right">
                  {rewardsToken ?? fluxTokenAddress ?? '--'}
                </span>
              </div>
              <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
                <span>{copy.fluxBalance}</span>
                <span>
                  {rewardWalletBalance?.formatted
                    ? formatDisplayAmount(rewardWalletBalance.formatted)
                    : '0.00'}
                </span>
              </div>
              <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
                <span>{copy.lpWalletBalance}</span>
                <span>
                  {hasLpPosition
                    ? formatDisplayAmount(lpWalletBalance?.formatted ?? '0')
                    : '0.00'}
                </span>
              </div>
            </div>

            <div className="mt-4">
              <ActionButton
                label={
                  isSubmitting && lastAction === 'claim'
                    ? copy.claiming
                    : earnedRewards && earnedRewards > BigInt(0)
                      ? copy.claimNow
                      : copy.nothingToClaim
                }
                disabled={claimDisabled}
                loading={isSubmitting && lastAction === 'claim'}
                onClick={handleClaim}
                variant="secondary"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
