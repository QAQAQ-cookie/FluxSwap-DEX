'use client';

import { useCallback, useEffect, useMemo } from 'react';

import type { FarmWeightSlice } from '@/components/overview/OverviewTypes';
import {
  buildActionItems,
  buildOperationBuckets,
  buildProtocolNodes,
  getHealthScore,
  getToneByScore,
  normalizeSymbol,
  RECENT_BLOCK_WINDOW,
  sameAddress,
  ZERO_BIGINT,
} from '@/components/overview/OverviewUtils';
import { useOverviewPageEnvironment } from '@/components/overview/useOverviewPageEnvironment';
import { useOverviewPageState } from '@/components/overview/useOverviewPageState';
import {
  fluxMultiPoolManagerAbi,
  fluxSwapErc20Abi,
  fluxSwapPairAbi,
  fluxSwapStakingRewardsAbi,
  fluxSwapTreasuryAbi,
} from '@/lib/contracts';
import { formatErrorMessage } from '@/lib/errors';
import { shortAddress } from '@/components/AdminPrimitives';

export function useOverviewPageController() {
  const environment = useOverviewPageEnvironment();
  const pageState = useOverviewPageState();

  const readTokenMeta = useCallback(
    async (tokenAddress: `0x${string}`) => {
      if (!environment.publicClient) {
        throw new Error('public_client_unavailable');
      }

      try {
        const [token0, token1, decimals] = await Promise.all([
          environment.publicClient.readContract({
            address: tokenAddress,
            abi: fluxSwapPairAbi,
            functionName: 'token0',
          }),
          environment.publicClient.readContract({
            address: tokenAddress,
            abi: fluxSwapPairAbi,
            functionName: 'token1',
          }),
          environment.publicClient.readContract({
            address: tokenAddress,
            abi: fluxSwapPairAbi,
            functionName: 'decimals',
          }),
        ]);
        const [token0Symbol, token1Symbol] = await Promise.all([
          environment.publicClient.readContract({
            address: token0,
            abi: fluxSwapErc20Abi,
            functionName: 'symbol',
          }),
          environment.publicClient.readContract({
            address: token1,
            abi: fluxSwapErc20Abi,
            functionName: 'symbol',
          }),
        ]);

        const normalizedToken0 = normalizeSymbol(token0Symbol, token0, environment.wrappedNativeAddress);
        const normalizedToken1 = normalizeSymbol(token1Symbol, token1, environment.wrappedNativeAddress);

        return {
          label: `${normalizedToken0} / ${normalizedToken1}`,
          symbol: `${normalizedToken0}-${normalizedToken1} LP`,
          decimals: Number(decimals),
        };
      } catch {
        const configured = environment.configuredTokens.find((token) => sameAddress(token.address, tokenAddress));
        const [symbolResult, decimalsResult] = await Promise.allSettled([
          environment.publicClient.readContract({
            address: tokenAddress,
            abi: fluxSwapErc20Abi,
            functionName: 'symbol',
          }),
          environment.publicClient.readContract({
            address: tokenAddress,
            abi: fluxSwapErc20Abi,
            functionName: 'decimals',
          }),
        ]);

        return {
          label: configured?.symbol ?? shortAddress(tokenAddress),
          symbol:
            symbolResult.status === 'fulfilled'
              ? normalizeSymbol(symbolResult.value, tokenAddress, environment.wrappedNativeAddress)
              : configured?.symbol ?? 'TOKEN',
          decimals: decimalsResult.status === 'fulfilled' ? Number(decimalsResult.value) : configured?.decimals ?? 18,
        };
      }
    },
    [environment],
  );

  const loadOverview = useCallback(async () => {
    if (!environment.publicClient || !environment.supportedChain || !environment.managerAddress || !environment.treasuryAddress) {
      pageState.setOverview(null);
      pageState.setLoading(false);
      pageState.setError(environment.supportedChain ? '当前链缺少管理合约地址。' : '当前网络暂不支持 FluxSwap 管理端。');
      return;
    }

    const publicClient = environment.publicClient;
    const managerAddress = environment.managerAddress;
    const treasuryAddress = environment.treasuryAddress;

    pageState.setLoading(true);
    pageState.setError(null);

    try {
      const [
        poolLength,
        totalAllocPoint,
        totalPendingRewards,
        undistributedRewards,
        rewardTokenAddress,
        managerTreasuryAddress,
      ] = await Promise.all([
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
        publicClient.readContract({
          address: managerAddress,
          abi: fluxMultiPoolManagerAbi,
          functionName: 'totalPendingRewards',
        }),
        publicClient.readContract({
          address: managerAddress,
          abi: fluxMultiPoolManagerAbi,
          functionName: 'undistributedRewards',
        }),
        publicClient.readContract({
          address: managerAddress,
          abi: fluxMultiPoolManagerAbi,
          functionName: 'rewardToken',
        }),
        publicClient.readContract({
          address: managerAddress,
          abi: fluxMultiPoolManagerAbi,
          functionName: 'treasury',
        }),
      ]);

      const resolvedTreasuryAddress = managerTreasuryAddress || treasuryAddress;
      const rewardTokenMeta = await readTokenMeta(rewardTokenAddress);
      const poolCount = Number(poolLength);
      const poolRows = await Promise.all(
        Array.from({ length: poolCount }, async (_, index) => {
          const poolData = (await publicClient.readContract({
            address: managerAddress,
            abi: fluxMultiPoolManagerAbi,
            functionName: 'pools',
            args: [BigInt(index)],
          })) as readonly [`0x${string}`, bigint, boolean, bigint, bigint];
          const [poolAddress, allocPoint, active] = poolData;

          try {
            const [stakingToken, totalStaked] = await Promise.all([
              publicClient.readContract({
                address: poolAddress,
                abi: fluxSwapStakingRewardsAbi,
                functionName: 'stakingToken',
              }),
              publicClient.readContract({
                address: poolAddress,
                abi: fluxSwapStakingRewardsAbi,
                functionName: 'totalStaked',
              }),
            ]);
            const stakingTokenMeta = await readTokenMeta(stakingToken);

            return {
              label: stakingTokenMeta.label,
              poolAddress,
              allocPoint,
              active,
              totalStaked,
              stakingDecimals: stakingTokenMeta.decimals,
              stakingSymbol: stakingTokenMeta.symbol,
            } satisfies FarmWeightSlice;
          } catch {
            return {
              label: shortAddress(poolAddress),
              poolAddress,
              allocPoint,
              active,
              totalStaked: ZERO_BIGINT,
              stakingDecimals: 18,
              stakingSymbol: 'TOKEN',
            } satisfies FarmWeightSlice;
          }
        }),
      );

      const [treasuryPausedResult, treasuryRewardBalanceResult, treasuryApprovedSpendRemainingResult] =
        await Promise.allSettled([
          publicClient.readContract({
            address: resolvedTreasuryAddress,
            abi: fluxSwapTreasuryAbi,
            functionName: 'paused',
          }),
          publicClient.readContract({
            address: rewardTokenAddress,
            abi: fluxSwapErc20Abi,
            functionName: 'balanceOf',
            args: [resolvedTreasuryAddress],
          }),
          publicClient.readContract({
            address: resolvedTreasuryAddress,
            abi: fluxSwapTreasuryAbi,
            functionName: 'approvedSpendRemaining',
            args: [rewardTokenAddress, managerAddress],
          }),
        ]);

      const allowedTokenResults = await Promise.allSettled(
        environment.configuredTokens.map((token) =>
          publicClient.readContract({
            address: resolvedTreasuryAddress,
            abi: fluxSwapTreasuryAbi,
            functionName: 'allowedTokens',
            args: [token.address],
          }),
        ),
      );

      const latestBlock = await publicClient.getBlockNumber();
      const fromBlock = latestBlock > RECENT_BLOCK_WINDOW ? latestBlock - RECENT_BLOCK_WINDOW : ZERO_BIGINT;
      const [poolUpdatedResult, rewardsDistributedResult, spenderApprovedResult, dailyCapResult, pausedResult, unpausedResult] =
        await Promise.allSettled([
          publicClient.getContractEvents({
            address: managerAddress,
            abi: fluxMultiPoolManagerAbi,
            eventName: 'PoolUpdated',
            fromBlock,
            toBlock: latestBlock,
          }),
          publicClient.getContractEvents({
            address: managerAddress,
            abi: fluxMultiPoolManagerAbi,
            eventName: 'RewardsDistributed',
            fromBlock,
            toBlock: latestBlock,
          }),
          publicClient.getContractEvents({
            address: resolvedTreasuryAddress,
            abi: fluxSwapTreasuryAbi,
            eventName: 'SpenderApproved',
            fromBlock,
            toBlock: latestBlock,
          }),
          publicClient.getContractEvents({
            address: resolvedTreasuryAddress,
            abi: fluxSwapTreasuryAbi,
            eventName: 'DailySpendCapUpdated',
            fromBlock,
            toBlock: latestBlock,
          }),
          publicClient.getContractEvents({
            address: resolvedTreasuryAddress,
            abi: fluxSwapTreasuryAbi,
            eventName: 'Paused',
            fromBlock,
            toBlock: latestBlock,
          }),
          publicClient.getContractEvents({
            address: resolvedTreasuryAddress,
            abi: fluxSwapTreasuryAbi,
            eventName: 'Unpaused',
            fromBlock,
            toBlock: latestBlock,
          }),
        ]);

      const farmEvents = [
        ...(poolUpdatedResult.status === 'fulfilled' ? poolUpdatedResult.value : []),
        ...(rewardsDistributedResult.status === 'fulfilled' ? rewardsDistributedResult.value : []),
      ];
      const treasuryEvents = [
        ...(spenderApprovedResult.status === 'fulfilled' ? spenderApprovedResult.value : []),
        ...(dailyCapResult.status === 'fulfilled' ? dailyCapResult.value : []),
        ...(pausedResult.status === 'fulfilled' ? pausedResult.value : []),
        ...(unpausedResult.status === 'fulfilled' ? unpausedResult.value : []),
      ];

      pageState.setOverview({
        poolLength: poolCount,
        activePoolCount: poolRows.filter((pool) => pool.active && pool.allocPoint > ZERO_BIGINT).length,
        totalAllocPoint,
        totalPendingRewards,
        undistributedRewards,
        rewardTokenSymbol: rewardTokenMeta.symbol,
        rewardTokenDecimals: rewardTokenMeta.decimals,
        rewardTokenAddress,
        treasuryAddress: resolvedTreasuryAddress,
        treasuryPaused: treasuryPausedResult.status === 'fulfilled' ? treasuryPausedResult.value : false,
        treasuryRewardBalance:
          treasuryRewardBalanceResult.status === 'fulfilled' ? treasuryRewardBalanceResult.value : ZERO_BIGINT,
        treasuryApprovedSpendRemaining:
          treasuryApprovedSpendRemainingResult.status === 'fulfilled'
            ? treasuryApprovedSpendRemainingResult.value
            : ZERO_BIGINT,
        configuredTokenCount: environment.configuredTokens.length,
        allowedTokenCount: allowedTokenResults.filter((result) => result.status === 'fulfilled' && result.value).length,
        recentFarmEvents: farmEvents.length,
        recentTreasuryEvents: treasuryEvents.length,
        farmWeightSlices: poolRows.sort((left, right) => {
          if (left.allocPoint === right.allocPoint) {
            return left.label.localeCompare(right.label);
          }

          return left.allocPoint > right.allocPoint ? -1 : 1;
        }),
        operationBuckets: buildOperationBuckets({
          latestBlock,
          fromBlock,
          farmEvents,
          treasuryEvents,
        }),
      });
      pageState.setLastUpdatedAt(new Date());
    } catch (loadError) {
      pageState.setError(formatErrorMessage(loadError));
    } finally {
      pageState.setLoading(false);
    }
  }, [environment, pageState, readTokenMeta]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadOverview();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadOverview]);

  const healthScore = useMemo(() => getHealthScore(pageState.overview), [pageState.overview]);
  const healthTone = useMemo(() => getToneByScore(healthScore), [healthScore]);
  const nodes = useMemo(() => buildProtocolNodes(pageState.overview), [pageState.overview]);
  const actionItems = useMemo(() => buildActionItems(pageState.overview), [pageState.overview]);

  return {
    environment,
    pageState,
    loadOverview,
    healthScore,
    healthTone,
    nodes,
    actionItems,
  };
}
