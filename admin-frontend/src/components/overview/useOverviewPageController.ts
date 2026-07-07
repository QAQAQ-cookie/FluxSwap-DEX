'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';

import type { FarmWeightSlice } from '@/components/overview/OverviewTypes';
import {
  buildActionItems,
  buildOperationBuckets,
  FALLBACK_BLOCK_TIME_MS,
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
  const autoLoadKeyRef = useRef<string | null>(null);
  const {
    chainId,
    configuredTokens,
    managerAddress,
    publicClient,
    supportedChain,
    treasuryAddress,
    wrappedNativeAddress,
  } = environment;
  const { setError, setLastUpdatedAt, setLoading, setOverview } = pageState;

  const readTokenMeta = useCallback(
    async (tokenAddress: `0x${string}`) => {
      if (!publicClient) {
        throw new Error('public_client_unavailable');
      }

      try {
        const [token0, token1, decimals] = await Promise.all([
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

        const normalizedToken0 = normalizeSymbol(token0Symbol, token0, wrappedNativeAddress);
        const normalizedToken1 = normalizeSymbol(token1Symbol, token1, wrappedNativeAddress);

        return {
          label: `${normalizedToken0} / ${normalizedToken1}`,
          symbol: `${normalizedToken0}-${normalizedToken1} LP`,
          decimals: Number(decimals),
        };
      } catch {
        const configured = configuredTokens.find((token) => sameAddress(token.address, tokenAddress));
        const [symbolResult, decimalsResult] = await Promise.allSettled([
          publicClient.readContract({
            address: tokenAddress,
            abi: fluxSwapErc20Abi,
            functionName: 'symbol',
          }),
          publicClient.readContract({
            address: tokenAddress,
            abi: fluxSwapErc20Abi,
            functionName: 'decimals',
          }),
        ]);

        return {
          label: configured?.symbol ?? shortAddress(tokenAddress),
          symbol:
            symbolResult.status === 'fulfilled'
              ? normalizeSymbol(symbolResult.value, tokenAddress, wrappedNativeAddress)
              : configured?.symbol ?? 'TOKEN',
          decimals: decimalsResult.status === 'fulfilled' ? Number(decimalsResult.value) : configured?.decimals ?? 18,
        };
      }
    },
    [configuredTokens, publicClient, wrappedNativeAddress],
  );

  const loadOverview = useCallback(async () => {
    if (!publicClient || !supportedChain || !managerAddress || !treasuryAddress) {
      setOverview(null);
      setLoading(false);
      setError(
        supportedChain
          ? '当前网络缺少管理端合约配置，请检查部署和前端配置。'
          : '当前网络还未接入 FluxSwap 管理端。',
      );
      return;
    }

    setLoading(true);
    setError(null);

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
        configuredTokens.map((token) =>
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
      const [fromBlockDataResult, latestBlockDataResult] = await Promise.allSettled([
        publicClient.getBlock({ blockNumber: fromBlock }),
        publicClient.getBlock({ blockNumber: latestBlock }),
      ]);
      const nowMs = Date.now();
      const latestBlockTimeMs =
        latestBlockDataResult.status === 'fulfilled'
          ? Number(latestBlockDataResult.value.timestamp) * 1_000
          : nowMs;
      const fromBlockTimeMs =
        fromBlockDataResult.status === 'fulfilled'
          ? Number(fromBlockDataResult.value.timestamp) * 1_000
          : latestBlockTimeMs - Number(latestBlock - fromBlock) * FALLBACK_BLOCK_TIME_MS;
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

      setOverview({
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
        configuredTokenCount: configuredTokens.length,
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
          fromTimeMs: fromBlockTimeMs,
          toTimeMs: latestBlockTimeMs,
          farmEvents,
          treasuryEvents,
        }),
        operationWindow: {
          fromBlock,
          toBlock: latestBlock,
          fromTimeMs: fromBlockTimeMs,
          toTimeMs: latestBlockTimeMs,
        },
      });
      setLastUpdatedAt(new Date());
    } catch (loadError) {
      setError(formatErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [
    configuredTokens,
    managerAddress,
    publicClient,
    readTokenMeta,
    setError,
    setLastUpdatedAt,
    setLoading,
    setOverview,
    supportedChain,
    treasuryAddress,
  ]);

  useEffect(() => {
    const autoLoadKey = `${chainId}:${supportedChain}:${managerAddress ?? ''}:${treasuryAddress ?? ''}`;
    if (autoLoadKeyRef.current === autoLoadKey) {
      return undefined;
    }
    autoLoadKeyRef.current = autoLoadKey;

    const timer = window.setTimeout(() => {
      void loadOverview();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [chainId, loadOverview, managerAddress, supportedChain, treasuryAddress]);

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
