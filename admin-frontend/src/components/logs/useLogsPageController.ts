'use client';

import { useCallback, useEffect } from 'react';
import { formatUnits } from 'viem';

import type { LogRow } from '@/components/logs/LogsTypes';
import { compareLogsByBlockDesc, getLogId } from '@/components/logs/LogsUtils';
import { useLogsPageEnvironment } from '@/components/logs/useLogsPageEnvironment';
import { useLogsPageState } from '@/components/logs/useLogsPageState';
import {
  fluxMultiPoolManagerAbi,
  fluxPoolFactoryAbi,
  fluxSwapErc20Abi,
  fluxSwapTreasuryAbi,
} from '@/lib/contracts';
import { formatErrorMessage } from '@/lib/errors';
import { shortAddress } from '@/components/AdminPrimitives';
import { listAdminOperationLogs } from '@/lib/admin-api';

export function useLogsPageController() {
  const environment = useLogsPageEnvironment();
  const pageState = useLogsPageState();

  const loadLogs = useCallback(async () => {
    if (!environment.publicClient || !environment.supportedChain) {
      pageState.setLogs([]);
      pageState.setError(
        environment.supportedChain
          ? 'RPC 连接尚未就绪，请稍后刷新重试。'
          : '当前网络还未接入 FluxSwap 管理端。',
      );
      return;
    }

    pageState.setLoading(true);
    pageState.setError(null);

    try {
      const latestBlock = await environment.publicClient.getBlockNumber();
      const fromBlock = latestBlock > BigInt(20_000) ? latestBlock - BigInt(20_000) : BigInt(0);
      const rows: LogRow[] = [];
      let rewardTokenDecimals = 18;
      let rewardTokenSymbol = 'FLUX';
      const backendLogs = await listAdminOperationLogs({
        chainId: environment.chainId,
        pageSize: 80,
      }).catch(() => null);

      for (const log of backendLogs?.items ?? []) {
        rows.push({
          id: `backend-${log.id}`,
          scope: toLogScope(log.moduleCode),
          action: log.actionLabel || log.actionCode,
          summary: buildBackendLogSummary(log),
          blockNumber: BigInt(0),
          transactionHash: log.txHash ?? '',
          createdAt: log.createdAt,
        });
      }

      if (environment.rewardTokenAddress) {
        const [decimals, symbol] = await Promise.all([
          environment.publicClient.readContract({
            address: environment.rewardTokenAddress,
            abi: fluxSwapErc20Abi,
            functionName: 'decimals',
          }),
          environment.publicClient.readContract({
            address: environment.rewardTokenAddress,
            abi: fluxSwapErc20Abi,
            functionName: 'symbol',
          }),
        ]);
        rewardTokenDecimals = Number(decimals);
        rewardTokenSymbol = symbol;
      }

      if (environment.factoryAddress) {
        const [lpCreatedLogs, singleCreatedLogs] = await Promise.all([
          environment.publicClient.getContractEvents({
            address: environment.factoryAddress,
            abi: fluxPoolFactoryAbi,
            eventName: 'LPPoolCreated',
            fromBlock,
            toBlock: latestBlock,
          }),
          environment.publicClient.getContractEvents({
            address: environment.factoryAddress,
            abi: fluxPoolFactoryAbi,
            eventName: 'SingleTokenPoolCreated',
            fromBlock,
            toBlock: latestBlock,
          }),
        ]);

        for (const log of lpCreatedLogs) {
          rows.push({
            id: getLogId(log),
            scope: 'farm',
            action: '创建 LP 质押池',
            summary: `${shortAddress(log.args.lpToken)} -> ${shortAddress(log.args.pool)}，权重 ${log.args.allocPoint?.toString() ?? '--'}`,
            blockNumber: log.blockNumber ?? BigInt(0),
            transactionHash: log.transactionHash ?? '',
          });
        }

        for (const log of singleCreatedLogs) {
          rows.push({
            id: getLogId(log),
            scope: 'farm',
            action: '创建单币质押池',
            summary: `${shortAddress(log.args.stakingToken)} -> ${shortAddress(log.args.pool)}，权重 ${log.args.allocPoint?.toString() ?? '--'}`,
            blockNumber: log.blockNumber ?? BigInt(0),
            transactionHash: log.transactionHash ?? '',
          });
        }
      }

      if (environment.managerAddress) {
        const [poolUpdatedLogs, rewardsDistributedLogs] = await Promise.all([
          environment.publicClient.getContractEvents({
            address: environment.managerAddress,
            abi: fluxMultiPoolManagerAbi,
            eventName: 'PoolUpdated',
            fromBlock,
            toBlock: latestBlock,
          }),
          environment.publicClient.getContractEvents({
            address: environment.managerAddress,
            abi: fluxMultiPoolManagerAbi,
            eventName: 'RewardsDistributed',
            fromBlock,
            toBlock: latestBlock,
          }),
        ]);

        for (const log of poolUpdatedLogs) {
          rows.push({
            id: getLogId(log),
            scope: 'farm',
            action: '更新农场',
            summary: `PID ${log.args.pid?.toString() ?? '--'}，权重 ${log.args.allocPoint?.toString() ?? '--'}，${log.args.active ? '启用' : '停用'}`,
            blockNumber: log.blockNumber ?? BigInt(0),
            transactionHash: log.transactionHash ?? '',
          });
        }

        for (const log of rewardsDistributedLogs) {
          rows.push({
            id: getLogId(log),
            scope: 'farm',
            action: '分发奖励',
            summary: `${formatUnits(log.args.totalReward ?? BigInt(0), rewardTokenDecimals)} ${rewardTokenSymbol}，执行人 ${shortAddress(log.args.executor)}`,
            blockNumber: log.blockNumber ?? BigInt(0),
            transactionHash: log.transactionHash ?? '',
          });
        }
      }

      if (environment.treasuryAddress) {
        const [spenderApprovedLogs, dailyCapLogs, pausedLogs, unpausedLogs] = await Promise.all([
          environment.publicClient.getContractEvents({
            address: environment.treasuryAddress,
            abi: fluxSwapTreasuryAbi,
            eventName: 'SpenderApproved',
            fromBlock,
            toBlock: latestBlock,
          }),
          environment.publicClient.getContractEvents({
            address: environment.treasuryAddress,
            abi: fluxSwapTreasuryAbi,
            eventName: 'DailySpendCapUpdated',
            fromBlock,
            toBlock: latestBlock,
          }),
          environment.publicClient.getContractEvents({
            address: environment.treasuryAddress,
            abi: fluxSwapTreasuryAbi,
            eventName: 'Paused',
            fromBlock,
            toBlock: latestBlock,
          }),
          environment.publicClient.getContractEvents({
            address: environment.treasuryAddress,
            abi: fluxSwapTreasuryAbi,
            eventName: 'Unpaused',
            fromBlock,
            toBlock: latestBlock,
          }),
        ]);

        for (const log of spenderApprovedLogs) {
          rows.push({
            id: getLogId(log),
            scope: 'treasury',
            action: '授权花费者',
            summary: `${shortAddress(log.args.spender)} 可拉取 ${shortAddress(log.args.token)}，额度 ${log.args.amount?.toString() ?? '--'}`,
            blockNumber: log.blockNumber ?? BigInt(0),
            transactionHash: log.transactionHash ?? '',
          });
        }

        for (const log of dailyCapLogs) {
          rows.push({
            id: getLogId(log),
            scope: 'treasury',
            action: '更新每日额度',
            summary: `${shortAddress(log.args.token)}：${log.args.oldCap?.toString() ?? '--'} -> ${log.args.newCap?.toString() ?? '--'}`,
            blockNumber: log.blockNumber ?? BigInt(0),
            transactionHash: log.transactionHash ?? '',
          });
        }

        for (const log of pausedLogs) {
          rows.push({
            id: getLogId(log),
            scope: 'treasury',
            action: '暂停金库',
            summary: `执行账户 ${shortAddress(log.args.account)}`,
            blockNumber: log.blockNumber ?? BigInt(0),
            transactionHash: log.transactionHash ?? '',
          });
        }

        for (const log of unpausedLogs) {
          rows.push({
            id: getLogId(log),
            scope: 'treasury',
            action: '恢复金库',
            summary: `执行账户 ${shortAddress(log.args.account)}`,
            blockNumber: log.blockNumber ?? BigInt(0),
            transactionHash: log.transactionHash ?? '',
          });
        }
      }

      pageState.setLogs(rows.sort(compareLogsByBlockDesc).slice(0, 80));
    } catch (loadError) {
      pageState.setError(formatErrorMessage(loadError));
    } finally {
      pageState.setLoading(false);
    }
  }, [environment, pageState]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadLogs();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadLogs]);

  return {
    environment,
    pageState,
    loadLogs,
  };
}

function toLogScope(moduleCode: string): LogRow['scope'] {
  if (moduleCode === 'farm' || moduleCode === 'treasury' || moduleCode === 'auth' || moduleCode === 'sync' || moduleCode === 'token') {
    return moduleCode;
  }
  return 'treasury';
}

function buildBackendLogSummary(log: Awaited<ReturnType<typeof listAdminOperationLogs>>['items'][number]) {
  const target = log.targetId ? `对象 ${shortAddress(log.targetId)}` : '';
  const result = log.resultLabel ? `结果 ${log.resultLabel}` : '';
  const tx = log.txHash ? `交易 ${shortAddress(log.txHash)}` : '';
  return [target, result, tx].filter(Boolean).join('，') || log.moduleLabel || '管理端操作';
}
