import type { Address, PublicClient } from 'viem';

import type { getSwapTokenOptions } from '@/config/tokens';
import {
  fluxMultiPoolManagerAbi,
  fluxSwapErc20Abi,
  fluxSwapPairAbi,
  fluxSwapStakingRewardsAbi,
} from '@/lib/contracts';

import type { FarmRow } from './EarnTypes';
import { ZERO_BIGINT, getTokenFallback, normalizeTokenSymbol } from './EarnUtils';

type SwapTokenOptions = ReturnType<typeof getSwapTokenOptions>;

type ReadTokenMetaParams = {
  publicClient: PublicClient;
  tokenAddress: Address;
  wrappedNativeAddress?: Address;
  knownTokens: SwapTokenOptions;
};

export async function readEarnFarmTokenMeta({
  publicClient,
  tokenAddress,
  wrappedNativeAddress,
  knownTokens,
}: ReadTokenMetaParams) {
  const knownToken = getTokenFallback(tokenAddress, knownTokens);

  try {
    const [token0, token1, lpDecimals] = await Promise.all([
      publicClient.readContract({
        address: tokenAddress,
        abi: fluxSwapPairAbi,
        functionName: 'token0',
      }),
      publicClient.readContract({
        address: tokenAddress,
        abi: fluxSwapPairAbi,
        functionName: 'token1',
      }),
      publicClient.readContract({
        address: tokenAddress,
        abi: fluxSwapPairAbi,
        functionName: 'decimals',
      }),
    ]);

    const [token0Symbol, token1Symbol] = await Promise.all([
      publicClient.readContract({
        address: token0,
        abi: fluxSwapErc20Abi,
        functionName: 'symbol',
      }),
      publicClient.readContract({
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
      publicClient.readContract({
        address: tokenAddress,
        abi: fluxSwapErc20Abi,
        functionName: 'symbol',
      }),
      publicClient.readContract({
        address: tokenAddress,
        abi: fluxSwapErc20Abi,
        functionName: 'name',
      }),
      publicClient.readContract({
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
}

type ReadWalletFarmBalancesParams = {
  publicClient: PublicClient;
  stakingToken: Address;
  poolAddress: Address;
  address?: Address;
  isConnected: boolean;
};

async function readWalletFarmBalances({
  publicClient,
  stakingToken,
  poolAddress,
  address,
  isConnected,
}: ReadWalletFarmBalancesParams) {
  if (!address || !isConnected) {
    return {
      walletBalance: ZERO_BIGINT,
      stakedBalance: ZERO_BIGINT,
      earnedRewards: ZERO_BIGINT,
      allowance: ZERO_BIGINT,
    };
  }

  const [walletBalance, stakedBalance, earnedRewards, allowance] = await Promise.all([
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

  return {
    walletBalance,
    stakedBalance,
    earnedRewards,
    allowance,
  };
}

type ReadFarmRowParams = {
  publicClient: PublicClient;
  managerAddress: Address;
  wrappedNativeAddress?: Address;
  knownTokens: SwapTokenOptions;
  address?: Address;
  isConnected: boolean;
  pid: number;
  totalAllocPoint: bigint;
};

export async function readEarnFarmRow({
  publicClient,
  managerAddress,
  wrappedNativeAddress,
  knownTokens,
  address,
  isConnected,
  pid,
  totalAllocPoint,
}: ReadFarmRowParams): Promise<FarmRow> {
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

  const [tokenMeta, walletData] = await Promise.all([
    readEarnFarmTokenMeta({
      publicClient,
      tokenAddress: stakingToken,
      wrappedNativeAddress,
      knownTokens,
    }),
    readWalletFarmBalances({
      publicClient,
      stakingToken,
      poolAddress,
      address,
      isConnected,
    }),
  ]);

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
    walletBalance: walletData.walletBalance,
    stakedBalance: walletData.stakedBalance,
    earnedRewards: walletData.earnedRewards,
    allowance: walletData.allowance,
    ...tokenMeta,
  } satisfies FarmRow;
}
