'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { type Address, zeroAddress } from 'viem';

import { useTokensPageDerivedState } from '@/components/tokens/useTokensPageDerivedState';
import { useTokensPageEnvironment } from '@/components/tokens/useTokensPageEnvironment';
import { useTokensPageState } from '@/components/tokens/useTokensPageState';
import type { TokenRow, TokenUsage } from '@/components/tokens/TokensTypes';
import {
  fluxPoolFactoryAbi,
  fluxSwapErc20Abi,
  fluxSwapFactoryAbi,
  fluxSwapTreasuryAbi,
} from '@/lib/contracts';
import { formatErrorMessage } from '@/lib/errors';

const READ_FAILED_LABEL = '读取失败';

function sameAddress(left?: string, right?: string) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

async function readHasSwapPair({
  publicClient,
  swapFactoryAddress,
  tokenAddress,
  candidateAddresses,
}: {
  publicClient: NonNullable<ReturnType<typeof useTokensPageEnvironment>['publicClient']>;
  swapFactoryAddress?: Address;
  tokenAddress: Address;
  candidateAddresses: Address[];
}) {
  if (!swapFactoryAddress || candidateAddresses.length === 0) {
    return false;
  }

  const pairAddresses = await Promise.all(
    candidateAddresses.map((candidateAddress) =>
      publicClient
        .readContract({
          address: swapFactoryAddress,
          abi: fluxSwapFactoryAbi,
          functionName: 'getPair',
          args: [tokenAddress, candidateAddress],
        })
        .catch(() => zeroAddress),
    ),
  );

  return pairAddresses.some((pairAddress) => pairAddress !== zeroAddress);
}

function buildFailedTokenRow({
  address,
  configuredSymbol,
  configuredName,
  configuredDecimals,
  isRewardToken,
}: {
  address: Address;
  configuredSymbol: string;
  configuredName: string;
  configuredDecimals: number;
  isRewardToken: boolean;
}): TokenRow {
  const usage: TokenUsage = {
    inWalletConfig: true,
    inFarmSinglePoolConfig: false,
    isRewardToken,
    hasSwapPair: false,
  };

  return {
    address,
    configuredSymbol,
    configuredName,
    configuredDecimals,
    chainSymbol: READ_FAILED_LABEL,
    chainName: READ_FAILED_LABEL,
    chainDecimals: configuredDecimals,
    totalSupply: BigInt(0),
    treasuryAllowed: undefined,
    treasuryBalance: undefined,
    usage,
    mismatch: {
      symbol: true,
      name: true,
      decimals: true,
    },
    readFailed: true,
  };
}

export function useTokensPageController() {
  const environment = useTokensPageEnvironment();
  const pageState = useTokensPageState();

  const {
    publicClient,
    supportedChain,
    treasuryAddress,
    swapFactoryAddress,
    poolFactoryAddress,
    rewardTokenAddress,
    configuredTokens,
  } = environment;
  const {
    tokenRows,
    setTokenRows,
    loading,
    setLoading,
    error,
    setError,
    query,
    setQuery,
    filterMode,
    setFilterMode,
    sortField,
    setSortField,
    sortDirection,
    setSortDirection,
  } = pageState;

  const loadTokens = useCallback(async () => {
    if (!supportedChain) {
      setTokenRows([]);
      setError('当前网络还未接入 FluxSwap 管理端。');
      setLoading(false);
      return;
    }

    if (!publicClient) {
      setTokenRows([]);
      setError('RPC 连接尚未就绪，请稍后刷新重试。');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const rows = await Promise.all(
        configuredTokens.map(async (token) => {
          const isRewardToken = sameAddress(token.address, rewardTokenAddress);

          try {
            const candidateAddresses = configuredTokens
              .filter((candidate) => !sameAddress(candidate.address, token.address))
              .map((candidate) => candidate.address);

            const [
              chainSymbol,
              chainName,
              chainDecimals,
              totalSupply,
              treasuryAllowed,
              treasuryBalance,
              singlePoolAddress,
              hasSwapPair,
            ] = await Promise.all([
              publicClient.readContract({
                address: token.address,
                abi: fluxSwapErc20Abi,
                functionName: 'symbol',
              }),
              publicClient.readContract({
                address: token.address,
                abi: fluxSwapErc20Abi,
                functionName: 'name',
              }),
              publicClient.readContract({
                address: token.address,
                abi: fluxSwapErc20Abi,
                functionName: 'decimals',
              }),
              publicClient.readContract({
                address: token.address,
                abi: fluxSwapErc20Abi,
                functionName: 'totalSupply',
              }),
              treasuryAddress
                ? publicClient.readContract({
                    address: treasuryAddress,
                    abi: fluxSwapTreasuryAbi,
                    functionName: 'allowedTokens',
                    args: [token.address],
                  })
                : Promise.resolve(undefined),
              treasuryAddress
                ? publicClient.readContract({
                    address: token.address,
                    abi: fluxSwapErc20Abi,
                    functionName: 'balanceOf',
                    args: [treasuryAddress],
                  })
                : Promise.resolve(undefined),
              poolFactoryAddress
                ? publicClient.readContract({
                    address: poolFactoryAddress,
                    abi: fluxPoolFactoryAbi,
                    functionName: 'singleTokenPools',
                    args: [token.address],
                  })
                : Promise.resolve(zeroAddress),
              readHasSwapPair({
                publicClient,
                swapFactoryAddress,
                tokenAddress: token.address,
                candidateAddresses,
              }),
            ]);

            const usage: TokenUsage = {
              inWalletConfig: true,
              inFarmSinglePoolConfig: singlePoolAddress !== zeroAddress,
              isRewardToken,
              hasSwapPair,
            };

            return {
              address: token.address,
              configuredSymbol: token.symbol,
              configuredName: token.name,
              configuredDecimals: token.decimals,
              chainSymbol,
              chainName,
              chainDecimals: Number(chainDecimals),
              totalSupply,
              treasuryAllowed,
              treasuryBalance,
              usage,
              mismatch: {
                symbol: token.symbol !== chainSymbol,
                name: token.name !== chainName,
                decimals: token.decimals !== Number(chainDecimals),
              },
              readFailed: false,
            } satisfies TokenRow;
          } catch {
            return buildFailedTokenRow({
              address: token.address,
              configuredSymbol: token.symbol,
              configuredName: token.name,
              configuredDecimals: token.decimals,
              isRewardToken,
            });
          }
        }),
      );

      setTokenRows(rows);
    } catch (loadError) {
      setError(formatErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [
    configuredTokens,
    poolFactoryAddress,
    publicClient,
    rewardTokenAddress,
    setError,
    setLoading,
    setTokenRows,
    supportedChain,
    swapFactoryAddress,
    treasuryAddress,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadTokens();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadTokens]);

  const matchedTokenCount = useMemo(() => {
    return tokenRows.filter(
      (token) => !token.readFailed && !token.mismatch.symbol && !token.mismatch.name && !token.mismatch.decimals,
    ).length;
  }, [tokenRows]);

  const allowedTokenCount = useMemo(() => {
    return tokenRows.filter((token) => token.treasuryAllowed === true).length;
  }, [tokenRows]);

  const swapPairCount = useMemo(() => {
    return tokenRows.filter((token) => token.usage.hasSwapPair).length;
  }, [tokenRows]);

  const singlePoolCount = useMemo(() => {
    return tokenRows.filter((token) => token.usage.inFarmSinglePoolConfig).length;
  }, [tokenRows]);

  const rewardTokenCount = useMemo(() => {
    return tokenRows.filter((token) => token.usage.isRewardToken).length;
  }, [tokenRows]);

  const pendingTreasuryRows = useMemo(() => {
    return tokenRows.filter((token) => {
      return (
        token.treasuryAllowed === false &&
        (token.usage.hasSwapPair || token.usage.inFarmSinglePoolConfig || token.usage.isRewardToken)
      );
    });
  }, [tokenRows]);

  const mismatchRows = useMemo(() => {
    return tokenRows.filter((token) => {
      return token.readFailed || token.mismatch.symbol || token.mismatch.name || token.mismatch.decimals;
    });
  }, [tokenRows]);

  const { filteredRows, mismatchTokenCount, activeUsageTokenCount } = useTokensPageDerivedState({
    tokenRows,
    query,
    filterMode,
    sortField,
    sortDirection,
  });

  return {
    environment,
    pageState: {
      tokenRows,
      setTokenRows,
      loading,
      setLoading,
      error,
      setError,
      query,
      setQuery,
      filterMode,
      setFilterMode,
      sortField,
      setSortField,
      sortDirection,
      setSortDirection,
    },
    loadTokens,
    matchedTokenCount,
    allowedTokenCount,
    swapPairCount,
    singlePoolCount,
    rewardTokenCount,
    pendingTreasuryRows,
    mismatchRows,
    filteredRows,
    mismatchTokenCount,
    activeUsageTokenCount,
  };
}
