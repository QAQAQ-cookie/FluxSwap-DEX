'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  CheckCircle2,
  Coins,
  Gift,
  LoaderCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Vault,
  Wallet,
  X,
} from 'lucide-react';
import { formatUnits, maxUint256, type Address } from 'viem';
import { useAccount, useChainId, usePublicClient, useWriteContract } from 'wagmi';

import { getContractAddress, getLocalGasOverride, isFluxSupportedChain } from '@/config/contracts';
import { getSwapTokenOptions } from '@/config/tokens';
import { formatBigIntAmountDown, parseAmount } from '@/lib/amounts';
import {
  fluxMultiPoolManagerAbi,
  fluxSwapErc20Abi,
  fluxSwapPairAbi,
  fluxSwapStakingRewardsAbi,
} from '@/lib/contracts';
import { formatErrorMessage } from '@/lib/errors';

const ZERO_BIGINT = BigInt(0);
const FARM_REFRESH_INTERVAL_MS = 8000;

type FarmRow = {
  pid: number;
  poolAddress: Address;
  stakingToken: Address;
  rewardsToken: Address;
  label: string;
  tokenSymbol: string;
  tokenName: string;
  tokenDecimals: number;
  isLp: boolean;
  active: boolean;
  allocPoint: bigint;
  totalAllocPoint: bigint;
  managerPendingRewards: bigint;
  totalStaked: bigint;
  rewardReserve: bigint;
  queuedRewards: bigint;
  pendingUserRewards: bigint;
  walletBalance: bigint;
  stakedBalance: bigint;
  earnedRewards: bigint;
  allowance: bigint;
};

type FarmAction = 'approve' | 'stake' | 'withdraw' | 'claim' | 'exit' | null;

type ResultModalState =
  | {
      kind: 'success' | 'error';
      title: string;
      message: string;
    }
  | null;

function shortAddress(address?: string) {
  if (!address) {
    return '--';
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function normalizeTokenSymbol(symbol: string, tokenAddress: string, wrappedNativeAddress?: string) {
  if (wrappedNativeAddress && tokenAddress.toLowerCase() === wrappedNativeAddress.toLowerCase()) {
    return 'ETH';
  }

  return symbol;
}

function formatWeight(allocPoint: bigint, totalAllocPoint: bigint) {
  if (allocPoint <= ZERO_BIGINT || totalAllocPoint <= ZERO_BIGINT) {
    return '0%';
  }

  const basisPoints = Number((allocPoint * BigInt(1_000_000)) / totalAllocPoint) / 100;
  return `${basisPoints.toLocaleString('en-US', {
    minimumFractionDigits: basisPoints >= 100 ? 0 : 2,
    maximumFractionDigits: 2,
  })}%`;
}

function getTokenFallback(address: Address, knownTokens: ReturnType<typeof getSwapTokenOptions>) {
  return knownTokens.find((token) => {
    const normalizedAddress = address.toLowerCase();
    return token.address?.toLowerCase() === normalizedAddress || token.routeAddress.toLowerCase() === normalizedAddress;
  });
}

export default function EarnPage() {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { writeContractAsync } = useWriteContract();

  const supportedChain = isFluxSupportedChain(chainId);
  const managerAddress = getContractAddress('FluxMultiPoolManager', chainId);
  const wrappedNativeAddress = getContractAddress('MockWETH', chainId);
  const knownTokens = useMemo(() => getSwapTokenOptions(chainId), [chainId]);
  const localGasOverride = getLocalGasOverride(chainId);

  const [farms, setFarms] = useState<FarmRow[]>([]);
  const [farmLoading, setFarmLoading] = useState(false);
  const [farmError, setFarmError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [stakedOnly, setStakedOnly] = useState(false);
  const [selectedFarmAddress, setSelectedFarmAddress] = useState<Address | null>(null);
  const [stakeAmount, setStakeAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [activeAction, setActiveAction] = useState<FarmAction>(null);
  const [resultModal, setResultModal] = useState<ResultModalState>(null);

  const readTokenMeta = useCallback(
    async (tokenAddress: Address) => {
      const knownToken = getTokenFallback(tokenAddress, knownTokens);

      try {
        const [token0, token1, lpDecimals] = await Promise.all([
          publicClient!.readContract({
            address: tokenAddress,
            abi: fluxSwapPairAbi,
            functionName: 'token0',
          }),
          publicClient!.readContract({
            address: tokenAddress,
            abi: fluxSwapPairAbi,
            functionName: 'token1',
          }),
          publicClient!.readContract({
            address: tokenAddress,
            abi: fluxSwapPairAbi,
            functionName: 'decimals',
          }),
        ]);

        const [token0Symbol, token1Symbol] = await Promise.all([
          publicClient!.readContract({
            address: token0,
            abi: fluxSwapErc20Abi,
            functionName: 'symbol',
          }),
          publicClient!.readContract({
            address: token1,
            abi: fluxSwapErc20Abi,
            functionName: 'symbol',
          }),
        ]);

        const normalizedToken0 = normalizeTokenSymbol(token0Symbol, token0, wrappedNativeAddress);
        const normalizedToken1 = normalizeTokenSymbol(token1Symbol, token1, wrappedNativeAddress);

        return {
          label: `${normalizedToken0} / ${normalizedToken1}`,
          tokenSymbol: `${normalizedToken0}-${normalizedToken1} LP`,
          tokenName: `${normalizedToken0} / ${normalizedToken1} LP`,
          tokenDecimals: Number(lpDecimals),
          isLp: true,
        };
      } catch {
        const [symbolResult, nameResult, decimalsResult] = await Promise.allSettled([
          publicClient!.readContract({
            address: tokenAddress,
            abi: fluxSwapErc20Abi,
            functionName: 'symbol',
          }),
          publicClient!.readContract({
            address: tokenAddress,
            abi: fluxSwapErc20Abi,
            functionName: 'name',
          }),
          publicClient!.readContract({
            address: tokenAddress,
            abi: fluxSwapErc20Abi,
            functionName: 'decimals',
          }),
        ]);

        const symbol =
          symbolResult.status === 'fulfilled'
            ? normalizeTokenSymbol(symbolResult.value, tokenAddress, wrappedNativeAddress)
            : knownToken?.symbol ?? 'TOKEN';
        const name = nameResult.status === 'fulfilled' ? nameResult.value : knownToken?.name ?? symbol;
        const decimals = decimalsResult.status === 'fulfilled' ? Number(decimalsResult.value) : knownToken?.decimals ?? 18;

        return {
          label: symbol,
          tokenSymbol: symbol,
          tokenName: name,
          tokenDecimals: decimals,
          isLp: false,
        };
      }
    },
    [knownTokens, publicClient, wrappedNativeAddress],
  );

  const loadFarms = useCallback(
    async ({ background = false }: { background?: boolean } = {}) => {
      if (!publicClient || !supportedChain || !managerAddress) {
        setFarms([]);
        setFarmLoading(false);
        setFarmError(null);
        return;
      }

      if (!background) {
        setFarmLoading(true);
      }
      setFarmError(null);

      try {
        const [poolLength, totalAllocPoint] = await Promise.all([
          publicClient.readContract({
            address: managerAddress,
            abi: fluxMultiPoolManagerAbi,
            functionName: 'poolLength',
          }),
          publicClient.readContract({
            address: managerAddress,
            abi: fluxMultiPoolManagerAbi,
            functionName: 'totalAllocPoint',
          }),
        ]);

        const poolCount = Number(poolLength);
        const nextFarms = await Promise.all(
          Array.from({ length: poolCount }, async (_, pid) => {
            const poolInfo = (await publicClient.readContract({
              address: managerAddress,
              abi: fluxMultiPoolManagerAbi,
              functionName: 'pools',
              args: [BigInt(pid)],
            })) as readonly [Address, bigint, boolean, bigint, bigint];

            const poolAddress = poolInfo[0];
            const allocPoint = poolInfo[1];
            const active = poolInfo[2];
            const poolPendingRewardsFromInfo = poolInfo[4];

            const [
              stakingToken,
              rewardsToken,
              totalStaked,
              rewardReserve,
              queuedRewards,
              pendingUserRewards,
              managerPendingRewards,
            ] = await Promise.all([
              publicClient.readContract({
                address: poolAddress,
                abi: fluxSwapStakingRewardsAbi,
                functionName: 'stakingToken',
              }),
              publicClient.readContract({
                address: poolAddress,
                abi: fluxSwapStakingRewardsAbi,
                functionName: 'rewardsToken',
              }),
              publicClient.readContract({
                address: poolAddress,
                abi: fluxSwapStakingRewardsAbi,
                functionName: 'totalStaked',
              }),
              publicClient.readContract({
                address: poolAddress,
                abi: fluxSwapStakingRewardsAbi,
                functionName: 'rewardReserve',
              }),
              publicClient.readContract({
                address: poolAddress,
                abi: fluxSwapStakingRewardsAbi,
                functionName: 'queuedRewards',
              }),
              publicClient.readContract({
                address: poolAddress,
                abi: fluxSwapStakingRewardsAbi,
                functionName: 'pendingUserRewards',
              }),
              publicClient
                .readContract({
                  address: managerAddress,
                  abi: fluxMultiPoolManagerAbi,
                  functionName: 'pendingPoolRewards',
                  args: [poolAddress],
                })
                .catch(() => poolPendingRewardsFromInfo),
            ]);

            const tokenMeta = await readTokenMeta(stakingToken);

            let walletBalance = ZERO_BIGINT;
            let stakedBalance = ZERO_BIGINT;
            let earnedRewards = ZERO_BIGINT;
            let allowance = ZERO_BIGINT;

            if (address && isConnected) {
              [walletBalance, stakedBalance, earnedRewards, allowance] = await Promise.all([
                publicClient
                  .readContract({
                    address: stakingToken,
                    abi: fluxSwapErc20Abi,
                    functionName: 'balanceOf',
                    args: [address],
                  })
                  .catch(() => ZERO_BIGINT),
                publicClient
                  .readContract({
                    address: poolAddress,
                    abi: fluxSwapStakingRewardsAbi,
                    functionName: 'balanceOf',
                    args: [address],
                  })
                  .catch(() => ZERO_BIGINT),
                publicClient
                  .readContract({
                    address: poolAddress,
                    abi: fluxSwapStakingRewardsAbi,
                    functionName: 'earned',
                    args: [address],
                  })
                  .catch(() => ZERO_BIGINT),
                publicClient
                  .readContract({
                    address: stakingToken,
                    abi: fluxSwapErc20Abi,
                    functionName: 'allowance',
                    args: [address, poolAddress],
                  })
                  .catch(() => ZERO_BIGINT),
              ]);
            }

            return {
              pid,
              poolAddress,
              stakingToken,
              rewardsToken,
              active,
              allocPoint,
              totalAllocPoint,
              managerPendingRewards,
              totalStaked,
              rewardReserve,
              queuedRewards,
              pendingUserRewards,
              walletBalance,
              stakedBalance,
              earnedRewards,
              allowance,
              ...tokenMeta,
            } satisfies FarmRow;
          }),
        );

        setFarms(
          nextFarms.sort((left, right) => {
            if (left.active !== right.active) {
              return left.active ? -1 : 1;
            }
            if (left.stakedBalance !== right.stakedBalance) {
              return left.stakedBalance > right.stakedBalance ? -1 : 1;
            }
            return left.pid - right.pid;
          }),
        );
      } catch (error) {
        if (!background) {
          setFarms([]);
        }
        setFarmError(error instanceof Error ? error.message : 'Failed to load farms');
      } finally {
        if (!background) {
          setFarmLoading(false);
        }
      }
    },
    [address, isConnected, managerAddress, publicClient, readTokenMeta, supportedChain],
  );

  useEffect(() => {
    let cancelled = false;

    const refresh = async (options?: { background?: boolean }) => {
      if (cancelled) {
        return;
      }

      await loadFarms(options);
    };

    void refresh();

    const refreshTimer = window.setInterval(() => {
      void refresh({ background: true });
    }, FARM_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, [loadFarms]);

  const selectedFarm = useMemo(() => {
    if (!selectedFarmAddress) {
      return null;
    }

    return farms.find((farm) => farm.poolAddress.toLowerCase() === selectedFarmAddress.toLowerCase()) ?? null;
  }, [farms, selectedFarmAddress]);

  const filteredFarms = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return farms.filter((farm) => {
      if (stakedOnly && farm.stakedBalance <= ZERO_BIGINT) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return (
        farm.label.toLowerCase().includes(normalizedQuery) ||
        farm.tokenSymbol.toLowerCase().includes(normalizedQuery) ||
        farm.poolAddress.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [farms, searchQuery, stakedOnly]);

  const totalEarnedRewards = farms.reduce((sum, farm) => sum + farm.earnedRewards, ZERO_BIGINT);
  const totalManagerPendingRewards = farms.reduce((sum, farm) => sum + farm.managerPendingRewards, ZERO_BIGINT);
  const activeFarmCount = farms.filter((farm) => farm.active).length;
  const stakedFarmCount = farms.filter((farm) => farm.stakedBalance > ZERO_BIGINT).length;

  const parsedStakeAmount = selectedFarm ? parseAmount(stakeAmount, selectedFarm.tokenDecimals) : undefined;
  const parsedWithdrawAmount = selectedFarm ? parseAmount(withdrawAmount, selectedFarm.tokenDecimals) : undefined;
  const stakeNeedsApproval = Boolean(
    selectedFarm &&
      parsedStakeAmount &&
      parsedStakeAmount > ZERO_BIGINT &&
      selectedFarm.allowance < parsedStakeAmount,
  );
  const insufficientStakeBalance = Boolean(
    selectedFarm &&
      parsedStakeAmount &&
      parsedStakeAmount > ZERO_BIGINT &&
      selectedFarm.walletBalance < parsedStakeAmount,
  );
  const insufficientWithdrawBalance = Boolean(
    selectedFarm &&
      parsedWithdrawAmount &&
      parsedWithdrawAmount > ZERO_BIGINT &&
      selectedFarm.stakedBalance < parsedWithdrawAmount,
  );
  const canClaim = Boolean(
    selectedFarm &&
      (selectedFarm.earnedRewards > ZERO_BIGINT ||
        (selectedFarm.managerPendingRewards > ZERO_BIGINT && selectedFarm.stakedBalance > ZERO_BIGINT)),
  );
  const canExit = Boolean(selectedFarm && selectedFarm.stakedBalance > ZERO_BIGINT);

  const closeFarmModal = () => {
    if (activeAction) {
      return;
    }

    setSelectedFarmAddress(null);
    setStakeAmount('');
    setWithdrawAmount('');
  };

  const runFarmAction = async (action: Exclude<FarmAction, null>) => {
    if (!isConnected || !address) {
      openConnectModal?.();
      return;
    }

    if (!selectedFarm || !publicClient) {
      return;
    }

    setResultModal(null);
    setActiveAction(action);

    try {
      let txHash: `0x${string}`;

      if (action === 'approve') {
        txHash = await writeContractAsync({
          address: selectedFarm.stakingToken,
          abi: fluxSwapErc20Abi,
          functionName: 'approve',
          args: [selectedFarm.poolAddress, maxUint256],
          chainId,
          ...localGasOverride,
        });
      } else if (action === 'stake') {
        if (!parsedStakeAmount || parsedStakeAmount <= ZERO_BIGINT) {
          return;
        }

        txHash = await writeContractAsync({
          address: selectedFarm.poolAddress,
          abi: fluxSwapStakingRewardsAbi,
          functionName: 'stake',
          args: [parsedStakeAmount],
          chainId,
          ...localGasOverride,
        });
      } else if (action === 'withdraw') {
        if (!parsedWithdrawAmount || parsedWithdrawAmount <= ZERO_BIGINT) {
          return;
        }

        txHash = await writeContractAsync({
          address: selectedFarm.poolAddress,
          abi: fluxSwapStakingRewardsAbi,
          functionName: 'withdraw',
          args: [parsedWithdrawAmount],
          chainId,
          ...localGasOverride,
        });
      } else if (action === 'claim') {
        txHash = await writeContractAsync({
          address: selectedFarm.poolAddress,
          abi: fluxSwapStakingRewardsAbi,
          functionName: 'getReward',
          args: [],
          chainId,
          ...localGasOverride,
        });
      } else {
        txHash = await writeContractAsync({
          address: selectedFarm.poolAddress,
          abi: fluxSwapStakingRewardsAbi,
          functionName: 'exit',
          args: [],
          chainId,
          ...localGasOverride,
        });
      }

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== 'success') {
        throw new Error(isZh ? '链上交易执行失败。' : 'The on-chain transaction failed.');
      }

      await loadFarms({ background: true });
      if (action === 'stake' || action === 'approve') {
        setStakeAmount('');
      }
      if (action === 'withdraw' || action === 'exit') {
        setWithdrawAmount('');
      }

      setResultModal({
        kind: 'success',
        title:
          action === 'approve'
            ? isZh
              ? '授权成功'
              : 'Approval successful'
            : isZh
              ? '交易成功'
              : 'Transaction successful',
        message:
          action === 'approve'
            ? isZh
              ? 'LP 已授权，现在可以继续质押。'
              : 'LP approved. You can now stake.'
            : isZh
              ? '农场数据已刷新。'
              : 'Farm data has been refreshed.',
      });
    } catch (error) {
      setResultModal({
        kind: 'error',
        title: isZh ? '操作失败' : 'Action failed',
        message: formatErrorMessage(error, {
          rejectedMessage: isZh ? '你已取消本次钱包操作。' : 'You rejected this wallet action.',
        }),
      });
    } finally {
      setActiveAction(null);
    }
  };

  const stakeButtonLabel = !isConnected
    ? isZh
      ? '连接钱包'
      : 'Connect Wallet'
    : activeAction === 'approve'
      ? isZh
        ? '授权中...'
        : 'Approving...'
      : activeAction === 'stake'
        ? isZh
          ? '质押中...'
          : 'Staking...'
        : !parsedStakeAmount || parsedStakeAmount <= ZERO_BIGINT
          ? isZh
            ? '请输入质押数量'
            : 'Enter stake amount'
          : insufficientStakeBalance
            ? isZh
              ? '钱包 LP 不足'
              : 'Insufficient LP balance'
            : stakeNeedsApproval
              ? isZh
                ? '授权 LP'
                : 'Approve LP'
              : isZh
                ? '质押'
                : 'Stake';
  const stakeButtonDisabled =
    Boolean(activeAction) ||
    Boolean(
      isConnected &&
        (!selectedFarm ||
          !parsedStakeAmount ||
          parsedStakeAmount <= ZERO_BIGINT ||
          insufficientStakeBalance),
    );
  const withdrawButtonDisabled =
    Boolean(activeAction) ||
    Boolean(
      isConnected &&
        (!selectedFarm ||
          !parsedWithdrawAmount ||
          parsedWithdrawAmount <= ZERO_BIGINT ||
          insufficientWithdrawBalance),
    );

  return (
    <div className="min-h-[calc(100vh-80px)] bg-gray-50 px-4 py-8 transition-colors dark:bg-gray-950 lg:py-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-gray-900 lg:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
                <Sparkles size={15} />
                <span>{isZh ? '收益农场' : 'Yield Farms'}</span>
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-gray-950 dark:text-white lg:text-4xl">
                {isZh ? '质押 LP，赚取 FLUX 奖励' : 'Stake LP and earn FLUX'}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-500 dark:text-gray-400">
                {isZh
                  ? '提供流动性获得 LP 后，可以把 LP 质押到农场中。LP 的手续费收益仍体现在 LP 份额里，农场额外发放 FLUX 激励。'
                  : 'After providing liquidity, stake your LP tokens in farms. Trading fees remain inside your LP position, while farms add FLUX rewards.'}
              </p>
            </div>

            {!isConnected ? (
              <button
                type="button"
                onClick={() => openConnectModal?.()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-gray-900 px-5 text-sm font-bold text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
              >
                <Wallet size={17} />
                <span>{isZh ? '连接钱包' : 'Connect Wallet'}</span>
              </button>
            ) : (
              <div className="rounded-full bg-gray-100 px-4 py-2 font-mono text-sm font-semibold text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                {shortAddress(address)}
              </div>
            )}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-[1.25rem] bg-gray-50 p-4 dark:bg-white/[0.04]">
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
                <Vault size={15} />
                <span>{isZh ? '活跃农场' : 'Active Farms'}</span>
              </div>
              <div className="mt-2 text-2xl font-black text-gray-950 dark:text-white">{activeFarmCount}</div>
            </div>
            <div className="rounded-[1.25rem] bg-gray-50 p-4 dark:bg-white/[0.04]">
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
                <ShieldCheck size={15} />
                <span>{isZh ? '我的质押池' : 'My Staked Farms'}</span>
              </div>
              <div className="mt-2 text-2xl font-black text-gray-950 dark:text-white">{stakedFarmCount}</div>
            </div>
            <div className="rounded-[1.25rem] bg-gray-50 p-4 dark:bg-white/[0.04]">
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
                <Gift size={15} />
                <span>{isZh ? '可领取奖励' : 'Claimable Rewards'}</span>
              </div>
              <div className="mt-2 text-2xl font-black text-gray-950 dark:text-white">
                {formatBigIntAmountDown(totalEarnedRewards, 18, 4)}
              </div>
            </div>
            <div className="rounded-[1.25rem] bg-gray-50 p-4 dark:bg-white/[0.04]">
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
                <Coins size={15} />
                <span>{isZh ? '待同步奖励' : 'Pending Rewards'}</span>
              </div>
              <div className="mt-2 text-2xl font-black text-gray-950 dark:text-white">
                {formatBigIntAmountDown(totalManagerPendingRewards, 18, 4)}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-gray-900">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-black tracking-tight text-gray-950 dark:text-white">
                {isZh ? '农场列表' : 'Farms'}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {isZh ? '选择一个农场进入质押、提取或领取奖励。' : 'Choose a farm to stake, withdraw, or claim rewards.'}
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="flex h-10 items-center gap-2 rounded-full bg-gray-100 px-3 text-sm text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                <Search size={16} />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={isZh ? '搜索农场' : 'Search farms'}
                  className="w-44 bg-transparent outline-none placeholder:text-gray-400"
                />
              </label>
              <button
                type="button"
                onClick={() => setStakedOnly((current) => !current)}
                className={`h-10 rounded-full px-4 text-sm font-bold transition-colors ${
                  stakedOnly
                    ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.10]'
                }`}
              >
                {isZh ? '只看已质押' : 'Staked only'}
              </button>
            </div>
          </div>

          {!supportedChain || !managerAddress ? (
            <div className="mt-5 rounded-[1.25rem] border border-dashed border-black/10 bg-gray-50 px-5 py-12 text-center dark:border-white/10 dark:bg-white/[0.03]">
              <div className="text-lg font-black text-gray-950 dark:text-white">
                {isZh ? '当前网络暂未配置农场合约' : 'Farm contracts are not configured on this network'}
              </div>
            </div>
          ) : farmLoading ? (
            <div className="mt-5 flex items-center justify-center gap-2 rounded-[1.25rem] bg-gray-50 px-5 py-16 text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
              <LoaderCircle size={18} className="animate-spin" />
              <span>{isZh ? '正在加载农场...' : 'Loading farms...'}</span>
            </div>
          ) : farmError ? (
            <div className="mt-5 rounded-[1.25rem] bg-rose-50 px-5 py-5 text-sm text-rose-700 dark:bg-rose-400/10 dark:text-rose-300">
              {farmError}
            </div>
          ) : filteredFarms.length === 0 ? (
            <div className="mt-5 rounded-[1.25rem] border border-dashed border-black/10 bg-gray-50 px-5 py-12 text-center dark:border-white/10 dark:bg-white/[0.03]">
              <div className="text-lg font-black text-gray-950 dark:text-white">
                {isZh ? '暂无可展示农场' : 'No farms to display'}
              </div>
            </div>
          ) : (
            <div className="mt-5 overflow-hidden rounded-[1.25rem] border border-black/5 dark:border-white/10">
              <div className="hidden grid-cols-[1.25fr_0.7fr_0.85fr_0.85fr_0.85fr_0.75fr_0.7fr] items-center gap-3 border-b border-black/5 bg-gray-50 px-5 py-3 text-xs font-bold tracking-[0.08em] text-gray-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-400 xl:grid">
                <div>{isZh ? '农场' : 'Farm'}</div>
                <div>{isZh ? 'APR' : 'APR'}</div>
                <div className="text-right">{isZh ? '总质押' : 'Total Staked'}</div>
                <div className="text-right">{isZh ? '我的质押' : 'My Stake'}</div>
                <div className="text-right">{isZh ? '可领取' : 'Earned'}</div>
                <div className="text-right">{isZh ? '权重' : 'Weight'}</div>
                <div className="text-right">{isZh ? '操作' : 'Action'}</div>
              </div>

              <div className="divide-y divide-black/5 dark:divide-white/10">
                {filteredFarms.map((farm) => (
                  <button
                    type="button"
                    key={farm.poolAddress}
                    onClick={() => {
                      setSelectedFarmAddress(farm.poolAddress);
                      setStakeAmount('');
                      setWithdrawAmount('');
                    }}
                    className="grid w-full gap-3 px-5 py-4 text-left transition-colors hover:bg-emerald-50/50 dark:hover:bg-white/[0.04] xl:grid-cols-[1.25fr_0.7fr_0.85fr_0.85fr_0.85fr_0.75fr_0.7fr] xl:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex h-9 w-9 items-center justify-center rounded-full ${
                            farm.active
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300'
                              : 'bg-gray-100 text-gray-400 dark:bg-white/[0.06] dark:text-gray-500'
                          }`}
                        >
                          <Coins size={17} />
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-base font-black text-gray-950 dark:text-white">{farm.label}</div>
                          <div className="mt-0.5 text-xs font-semibold text-gray-500 dark:text-gray-400">
                            {farm.isLp ? 'LP Farm' : isZh ? '单币池' : 'Single Token'} · {shortAddress(farm.poolAddress)}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="text-sm font-black text-gray-950 dark:text-white">
                      {isZh ? '待计算' : 'TBD'}
                    </div>
                    <div className="text-sm font-semibold tabular-nums text-gray-700 dark:text-gray-300 xl:text-right">
                      {formatBigIntAmountDown(farm.totalStaked, farm.tokenDecimals, 4)}
                    </div>
                    <div className="text-sm font-semibold tabular-nums text-gray-700 dark:text-gray-300 xl:text-right">
                      {formatBigIntAmountDown(farm.stakedBalance, farm.tokenDecimals, 4)}
                    </div>
                    <div className="text-sm font-semibold tabular-nums text-gray-700 dark:text-gray-300 xl:text-right">
                      {formatBigIntAmountDown(farm.earnedRewards, 18, 4)} FLUX
                    </div>
                    <div className="text-sm font-semibold tabular-nums text-gray-700 dark:text-gray-300 xl:text-right">
                      {formatWeight(farm.allocPoint, farm.totalAllocPoint)}
                    </div>
                    <div className="xl:text-right">
                      <span className="inline-flex h-9 items-center justify-center rounded-full bg-gray-900 px-4 text-sm font-bold text-white dark:bg-white dark:text-gray-900">
                        {isZh ? '管理' : 'Manage'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {selectedFarm ? (
          <div
            className="fixed inset-0 z-[95] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm"
            onClick={closeFarmModal}
          >
            <div
              className="flex max-h-[calc(100vh-2rem)] w-full max-w-[760px] flex-col rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-gray-900"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-2xl font-black tracking-tight text-gray-950 dark:text-white">{selectedFarm.label}</div>
                  <div className="mt-1 text-sm font-semibold text-gray-500 dark:text-gray-400">
                    {selectedFarm.isLp ? 'LP Farm' : selectedFarm.tokenName} · {shortAddress(selectedFarm.poolAddress)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeFarmModal}
                  disabled={Boolean(activeAction)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.10]"
                  aria-label={isZh ? '关闭' : 'Close'}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[1.2rem] bg-gray-50 p-4 dark:bg-white/[0.04]">
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">{isZh ? '钱包余额' : 'Wallet Balance'}</div>
                  <div className="mt-2 text-lg font-black tabular-nums text-gray-950 dark:text-white">
                    {formatBigIntAmountDown(selectedFarm.walletBalance, selectedFarm.tokenDecimals, 4)}
                  </div>
                </div>
                <div className="rounded-[1.2rem] bg-gray-50 p-4 dark:bg-white/[0.04]">
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">{isZh ? '已质押' : 'Staked'}</div>
                  <div className="mt-2 text-lg font-black tabular-nums text-gray-950 dark:text-white">
                    {formatBigIntAmountDown(selectedFarm.stakedBalance, selectedFarm.tokenDecimals, 4)}
                  </div>
                </div>
                <div className="rounded-[1.2rem] bg-gray-50 p-4 dark:bg-white/[0.04]">
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">{isZh ? '可领取' : 'Earned'}</div>
                  <div className="mt-2 text-lg font-black tabular-nums text-gray-950 dark:text-white">
                    {formatBigIntAmountDown(selectedFarm.earnedRewards, 18, 4)} FLUX
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-[1.35rem] border border-black/5 p-4 dark:border-white/10">
                  <div className="text-base font-black text-gray-950 dark:text-white">{isZh ? '质押' : 'Stake'}</div>
                  <div className="mt-3 rounded-[1rem] bg-gray-50 p-3 dark:bg-white/[0.04]">
                    <div className="flex items-center justify-between text-xs font-semibold text-gray-500 dark:text-gray-400">
                      <span>{selectedFarm.tokenSymbol}</span>
                      <button
                        type="button"
                        onClick={() => setStakeAmount(formatUnits(selectedFarm.walletBalance, selectedFarm.tokenDecimals))}
                        className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-300"
                      >
                        MAX
                      </button>
                    </div>
                    <input
                      value={stakeAmount}
                      onChange={(event) => setStakeAmount(event.target.value)}
                      inputMode="decimal"
                      placeholder="0"
                      disabled={Boolean(activeAction)}
                      className="mt-2 w-full bg-transparent text-3xl font-black tabular-nums text-gray-950 outline-none placeholder:text-gray-300 disabled:cursor-not-allowed dark:text-white dark:placeholder:text-gray-700"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!isConnected) {
                        openConnectModal?.();
                        return;
                      }
                      void runFarmAction(stakeNeedsApproval ? 'approve' : 'stake');
                    }}
                    disabled={stakeButtonDisabled}
                    className={`mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[1rem] text-sm font-bold transition-colors ${
                      stakeButtonDisabled
                        ? 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-white/[0.06] dark:text-gray-500'
                        : stakeNeedsApproval
                          ? 'bg-sky-600 text-white hover:bg-sky-700'
                          : 'bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200'
                    }`}
                  >
                    {activeAction === 'approve' || activeAction === 'stake' ? <LoaderCircle size={17} className="animate-spin" /> : null}
                    <span>{stakeButtonLabel}</span>
                  </button>
                </div>

                <div className="rounded-[1.35rem] border border-black/5 p-4 dark:border-white/10">
                  <div className="text-base font-black text-gray-950 dark:text-white">{isZh ? '提取' : 'Withdraw'}</div>
                  <div className="mt-3 rounded-[1rem] bg-gray-50 p-3 dark:bg-white/[0.04]">
                    <div className="flex items-center justify-between text-xs font-semibold text-gray-500 dark:text-gray-400">
                      <span>{selectedFarm.tokenSymbol}</span>
                      <button
                        type="button"
                        onClick={() => setWithdrawAmount(formatUnits(selectedFarm.stakedBalance, selectedFarm.tokenDecimals))}
                        className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-300"
                      >
                        MAX
                      </button>
                    </div>
                    <input
                      value={withdrawAmount}
                      onChange={(event) => setWithdrawAmount(event.target.value)}
                      inputMode="decimal"
                      placeholder="0"
                      disabled={Boolean(activeAction)}
                      className="mt-2 w-full bg-transparent text-3xl font-black tabular-nums text-gray-950 outline-none placeholder:text-gray-300 disabled:cursor-not-allowed dark:text-white dark:placeholder:text-gray-700"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!isConnected) {
                        openConnectModal?.();
                        return;
                      }
                      void runFarmAction('withdraw');
                    }}
                    disabled={withdrawButtonDisabled}
                    className={`mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[1rem] text-sm font-bold transition-colors ${
                      withdrawButtonDisabled
                        ? 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-white/[0.06] dark:text-gray-500'
                        : 'bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200'
                    }`}
                  >
                    {activeAction === 'withdraw' ? <LoaderCircle size={17} className="animate-spin" /> : null}
                    <span>
                      {activeAction === 'withdraw'
                        ? isZh
                          ? '提取中...'
                          : 'Withdrawing...'
                        : insufficientWithdrawBalance
                          ? isZh
                            ? '质押余额不足'
                            : 'Insufficient staked balance'
                          : isZh
                            ? '提取'
                            : 'Withdraw'}
                    </span>
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 rounded-[1.25rem] bg-gray-50 p-4 text-sm dark:bg-white/[0.04] sm:grid-cols-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-500 dark:text-gray-400">{isZh ? '总质押' : 'Total Staked'}</span>
                  <span className="font-semibold tabular-nums text-gray-950 dark:text-white">
                    {formatBigIntAmountDown(selectedFarm.totalStaked, selectedFarm.tokenDecimals, 4)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-500 dark:text-gray-400">{isZh ? '农场权重' : 'Farm Weight'}</span>
                  <span className="font-semibold tabular-nums text-gray-950 dark:text-white">
                    {formatWeight(selectedFarm.allocPoint, selectedFarm.totalAllocPoint)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-500 dark:text-gray-400">{isZh ? '奖励储备' : 'Reward Reserve'}</span>
                  <span className="font-semibold tabular-nums text-gray-950 dark:text-white">
                    {formatBigIntAmountDown(selectedFarm.rewardReserve, 18, 4)} FLUX
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-500 dark:text-gray-400">{isZh ? '待同步奖励' : 'Pending Rewards'}</span>
                  <span className="font-semibold tabular-nums text-gray-950 dark:text-white">
                    {formatBigIntAmountDown(selectedFarm.managerPendingRewards + selectedFarm.queuedRewards, 18, 4)} FLUX
                  </span>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={Boolean(activeAction) || !canClaim}
                  onClick={() => {
                    if (!isConnected) {
                      openConnectModal?.();
                      return;
                    }
                    void runFarmAction('claim');
                  }}
                  className={`inline-flex h-11 items-center justify-center gap-2 rounded-[1rem] text-sm font-bold transition-colors ${
                    !canClaim || activeAction
                      ? 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-white/[0.06] dark:text-gray-500'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700'
                  }`}
                >
                  {activeAction === 'claim' ? <LoaderCircle size={17} className="animate-spin" /> : <Gift size={17} />}
                  <span>
                    {activeAction === 'claim'
                      ? isZh
                        ? '领取中...'
                        : 'Claiming...'
                      : isZh
                        ? '领取奖励'
                        : 'Claim Rewards'}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={Boolean(activeAction) || !canExit}
                  onClick={() => {
                    if (!isConnected) {
                      openConnectModal?.();
                      return;
                    }
                    void runFarmAction('exit');
                  }}
                  className={`inline-flex h-11 items-center justify-center gap-2 rounded-[1rem] text-sm font-bold transition-colors ${
                    !canExit || activeAction
                      ? 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-white/[0.06] dark:text-gray-500'
                      : 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-400/25 dark:bg-rose-400/10 dark:text-rose-300 dark:hover:bg-rose-400/15'
                  }`}
                >
                  {activeAction === 'exit' ? <LoaderCircle size={17} className="animate-spin" /> : <Vault size={17} />}
                  <span>
                    {activeAction === 'exit'
                      ? isZh
                        ? '退出中...'
                        : 'Exiting...'
                      : isZh
                        ? '退出池子'
                        : 'Exit Pool'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {resultModal ? (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]"
            onClick={() => setResultModal(null)}
          >
            <div
              className="w-full max-w-[460px] rounded-[1.7rem] bg-white px-5 py-5 shadow-2xl dark:bg-gray-900"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-end">
                <button
                  type="button"
                  onClick={() => setResultModal(null)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                  aria-label={isZh ? '关闭' : 'Close'}
                >
                  <X size={22} />
                </button>
              </div>

              <div className="flex flex-col items-center px-3 pb-1 pt-1 text-center">
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-[1rem] ${
                    resultModal.kind === 'success'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  {resultModal.kind === 'success' ? <CheckCircle2 size={26} /> : <AlertCircle size={26} />}
                </div>

                <h3 className="mt-5 text-[1.65rem] font-semibold tracking-tight text-gray-950 dark:text-white">
                  {resultModal.title}
                </h3>

                <p className="mt-2.5 text-base leading-7 text-gray-500 dark:text-gray-300">
                  {resultModal.message}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setResultModal(null)}
                className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-[1rem] bg-[#232323] text-base font-medium text-white transition-colors hover:bg-black dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
              >
                {isZh ? '确定' : 'Confirm'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
