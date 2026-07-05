'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Address, Hex } from 'viem';
import { zeroAddress } from 'viem';
import { usePublicClient } from 'wagmi';

import type { AdminTokenOption } from '@/config/tokens';
import { fluxSwapErc20Abi, fluxSwapTreasuryAbi } from '@/lib/contracts';
import { formatErrorMessage } from '@/lib/errors';

import type { TreasuryInfo, TreasuryOperationMetadata, TreasuryOperationRow, TreasuryTokenRow } from './TreasuryTypes';
import { EVENT_LOOKBACK_BLOCKS, ZERO_BIGINT, sortOperations } from './TreasuryUtils';

type UseTreasuryDataParameters = {
  chainId: number;
  supportedChain: boolean;
  treasuryAddress?: Address;
  managerAddress?: Address;
  tokens: AdminTokenOption[];
  operationMetadataById: Record<Hex, TreasuryOperationMetadata>;
};

export function useTreasuryData({
  chainId,
  supportedChain,
  treasuryAddress,
  managerAddress,
  tokens,
  operationMetadataById,
}: UseTreasuryDataParameters) {
  const publicClient = usePublicClient({ chainId });
  const [treasuryInfo, setTreasuryInfo] = useState<TreasuryInfo | null>(null);
  const [tokenRows, setTokenRows] = useState<TreasuryTokenRow[]>([]);
  const [operationRows, setOperationRows] = useState<TreasuryOperationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTreasuryData = useCallback(async () => {
    if (!publicClient || !supportedChain || !treasuryAddress) {
      setTreasuryInfo(null);
      setTokenRows([]);
      setOperationRows([]);
      setError(supportedChain ? '当前链缺少金库合约地址。' : '当前网络暂不支持 FluxSwap 管理端。');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [multisig, guardian, operator, minDelay, paused, latestBlock] = await Promise.all([
        publicClient.readContract({
          address: treasuryAddress,
          abi: fluxSwapTreasuryAbi,
          functionName: 'multisig',
        }),
        publicClient.readContract({
          address: treasuryAddress,
          abi: fluxSwapTreasuryAbi,
          functionName: 'guardian',
        }),
        publicClient.readContract({
          address: treasuryAddress,
          abi: fluxSwapTreasuryAbi,
          functionName: 'operator',
        }),
        publicClient.readContract({
          address: treasuryAddress,
          abi: fluxSwapTreasuryAbi,
          functionName: 'minDelay',
        }),
        publicClient.readContract({
          address: treasuryAddress,
          abi: fluxSwapTreasuryAbi,
          functionName: 'paused',
        }),
        publicClient.getBlockNumber(),
      ]);

      const fromBlock = latestBlock > EVENT_LOOKBACK_BLOCKS ? latestBlock - EVENT_LOOKBACK_BLOCKS : ZERO_BIGINT;

      const [erc20Rows, nativeBalance, nativeDailySpendCap, nativeSpentToday, scheduledLogs] = await Promise.all([
        Promise.all(
          tokens.map(async (token) => {
            const [balance, approvedSpendRemaining, dailySpendCap, spentToday, allowed] = await Promise.all([
              publicClient.readContract({
                address: token.address,
                abi: fluxSwapErc20Abi,
                functionName: 'balanceOf',
                args: [treasuryAddress],
              }),
              managerAddress
                ? publicClient.readContract({
                    address: treasuryAddress,
                    abi: fluxSwapTreasuryAbi,
                    functionName: 'approvedSpendRemaining',
                    args: [token.address, managerAddress],
                  })
                : Promise.resolve(ZERO_BIGINT),
              publicClient.readContract({
                address: treasuryAddress,
                abi: fluxSwapTreasuryAbi,
                functionName: 'dailySpendCap',
                args: [token.address],
              }),
              publicClient.readContract({
                address: treasuryAddress,
                abi: fluxSwapTreasuryAbi,
                functionName: 'spentToday',
                args: [token.address],
              }),
              publicClient.readContract({
                address: treasuryAddress,
                abi: fluxSwapTreasuryAbi,
                functionName: 'allowedTokens',
                args: [token.address],
              }),
            ]);

            return {
              ...token,
              balance,
              approvedSpendRemaining,
              dailySpendCap,
              spentToday,
              allowed,
            };
          }),
        ),
        publicClient.getBalance({ address: treasuryAddress }),
        publicClient.readContract({
          address: treasuryAddress,
          abi: fluxSwapTreasuryAbi,
          functionName: 'dailySpendCap',
          args: [zeroAddress],
        }),
        publicClient.readContract({
          address: treasuryAddress,
          abi: fluxSwapTreasuryAbi,
          functionName: 'spentToday',
          args: [zeroAddress],
        }),
        publicClient.getContractEvents({
          address: treasuryAddress,
          abi: fluxSwapTreasuryAbi,
          eventName: 'OperationScheduled',
          fromBlock,
          toBlock: latestBlock,
        }),
      ]);

      const scheduledById = new Map<Hex, TreasuryOperationRow>();

      for (const log of scheduledLogs) {
        const operationId = log.args.operationId;
        if (!operationId) {
          continue;
        }

        const blockNumber = log.blockNumber ?? ZERO_BIGINT;
        const current = scheduledById.get(operationId);

        if (current && current.blockNumber >= blockNumber) {
          continue;
        }

        scheduledById.set(operationId, {
          operationId,
          executeAfter: log.args.executeAfter ?? ZERO_BIGINT,
          scheduler: log.args.scheduler,
          status: 'pending',
          blockNumber,
        });
      }

      const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
      const operationCandidates = await Promise.all(
        Array.from(scheduledById.values()).map(async (operation): Promise<TreasuryOperationRow | null> => {
          const readyAt = await publicClient.readContract({
            address: treasuryAddress,
            abi: fluxSwapTreasuryAbi,
            functionName: 'operationReadyAt',
            args: [operation.operationId],
          });

          if (readyAt <= ZERO_BIGINT) {
            return null;
          }

          return {
            ...operation,
            executeAfter: readyAt,
            status: readyAt <= nowSeconds ? 'ready' : 'pending',
            metadata: operationMetadataById[operation.operationId],
          };
        }),
      );

      const activeOperations = operationCandidates
        .filter((operation): operation is TreasuryOperationRow => operation !== null)
        .sort(sortOperations);
      const nativeRow: TreasuryTokenRow = {
        address: zeroAddress,
        symbol: 'ETH',
        name: 'Ether',
        decimals: 18,
        balance: nativeBalance,
        approvedSpendRemaining: ZERO_BIGINT,
        dailySpendCap: nativeDailySpendCap,
        spentToday: nativeSpentToday,
        allowed: true,
        isNative: true,
      };

      setTreasuryInfo({
        address: treasuryAddress,
        multisig,
        guardian,
        operator,
        minDelay,
        paused,
      });
      setTokenRows([nativeRow, ...erc20Rows]);
      setOperationRows(activeOperations);
    } catch (loadError) {
      setError(formatErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [managerAddress, operationMetadataById, publicClient, supportedChain, tokens, treasuryAddress]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadTreasuryData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadTreasuryData]);

  return {
    publicClient,
    treasuryInfo,
    tokenRows,
    operationRows,
    loading,
    error,
    loadTreasuryData,
  };
}
