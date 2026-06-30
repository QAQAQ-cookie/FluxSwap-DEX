'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, LoaderCircle, RefreshCw, ScrollText } from 'lucide-react';
import type { Log } from 'viem';
import { formatUnits } from 'viem';
import { useChainId, usePublicClient } from 'wagmi';

import { Card, PageHeader, shortAddress, StatusPill } from '@/components/AdminPrimitives';
import { getContractAddress, isFluxSupportedChain } from '@/config/contracts';
import {
  fluxMultiPoolManagerAbi,
  fluxPoolFactoryAbi,
  fluxSwapErc20Abi,
  fluxSwapTreasuryAbi,
} from '@/lib/contracts';
import { formatErrorMessage } from '@/lib/errors';

type LogRow = {
  id: string;
  scope: 'farm' | 'treasury';
  action: string;
  summary: string;
  blockNumber: bigint;
  transactionHash: string;
};

function compareLogsByBlockDesc(left: LogRow, right: LogRow) {
  if (left.blockNumber === right.blockNumber) {
    return right.transactionHash.localeCompare(left.transactionHash);
  }

  return left.blockNumber > right.blockNumber ? -1 : 1;
}

function getLogId(log: Log) {
  return `${log.transactionHash ?? 'unknown'}-${log.logIndex ?? 0}`;
}

export default function LogsPage() {
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });
  const supportedChain = isFluxSupportedChain(chainId);
  const factoryAddress = getContractAddress('FluxPoolFactory', chainId);
  const managerAddress = getContractAddress('FluxMultiPoolManager', chainId);
  const treasuryAddress = getContractAddress('FluxSwapTreasury', chainId);
  const rewardTokenAddress = getContractAddress('FluxToken', chainId);

  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    if (!publicClient || !supportedChain) {
      setLogs([]);
      setError(supportedChain ? '当前 RPC 客户端尚未准备好。' : '当前网络暂不支持 FluxSwap 管理端。');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const latestBlock = await publicClient.getBlockNumber();
      const fromBlock = latestBlock > BigInt(20_000) ? latestBlock - BigInt(20_000) : BigInt(0);
      const rows: LogRow[] = [];
      let rewardTokenDecimals = 18;
      let rewardTokenSymbol = 'FLUX';

      if (rewardTokenAddress) {
        const [decimals, symbol] = await Promise.all([
          publicClient.readContract({
            address: rewardTokenAddress,
            abi: fluxSwapErc20Abi,
            functionName: 'decimals',
          }),
          publicClient.readContract({
            address: rewardTokenAddress,
            abi: fluxSwapErc20Abi,
            functionName: 'symbol',
          }),
        ]);
        rewardTokenDecimals = Number(decimals);
        rewardTokenSymbol = symbol;
      }

      if (factoryAddress) {
        const [lpCreatedLogs, singleCreatedLogs] = await Promise.all([
          publicClient.getContractEvents({
            address: factoryAddress,
            abi: fluxPoolFactoryAbi,
            eventName: 'LPPoolCreated',
            fromBlock,
            toBlock: latestBlock,
          }),
          publicClient.getContractEvents({
            address: factoryAddress,
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

      if (managerAddress) {
        const [poolUpdatedLogs, rewardsDistributedLogs] = await Promise.all([
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

      if (treasuryAddress) {
        const [spenderApprovedLogs, dailyCapLogs, pausedLogs, unpausedLogs] = await Promise.all([
          publicClient.getContractEvents({
            address: treasuryAddress,
            abi: fluxSwapTreasuryAbi,
            eventName: 'SpenderApproved',
            fromBlock,
            toBlock: latestBlock,
          }),
          publicClient.getContractEvents({
            address: treasuryAddress,
            abi: fluxSwapTreasuryAbi,
            eventName: 'DailySpendCapUpdated',
            fromBlock,
            toBlock: latestBlock,
          }),
          publicClient.getContractEvents({
            address: treasuryAddress,
            abi: fluxSwapTreasuryAbi,
            eventName: 'Paused',
            fromBlock,
            toBlock: latestBlock,
          }),
          publicClient.getContractEvents({
            address: treasuryAddress,
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

      setLogs(rows.sort(compareLogsByBlockDesc).slice(0, 80));
    } catch (loadError) {
      setError(formatErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [factoryAddress, managerAddress, publicClient, rewardTokenAddress, supportedChain, treasuryAddress]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadLogs();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadLogs]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <PageHeader
          eyebrow="Logs"
          title="操作记录"
          description="从链上事件读取最近的农场和金库管理动作，方便回溯创建、权重调整、奖励分发和金库配置变化。"
        />
        <button
          type="button"
          onClick={() => void loadLogs()}
          disabled={loading}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400"
        >
          {loading ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          刷新
        </button>
      </div>

      {error ? (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle size={18} />
          {error}
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 p-5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <ScrollText size={19} />
            </span>
            <div>
              <h2 className="font-semibold text-slate-950">最近操作</h2>
              <p className="text-sm text-slate-500">默认读取最近 20,000 个区块内最多 80 条管理事件。</p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-collapse text-left">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-5 py-3">模块</th>
                <th className="px-5 py-3">动作</th>
                <th className="px-5 py-3">内容</th>
                <th className="px-5 py-3">区块</th>
                <th className="px-5 py-3">交易</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-500">
                    <LoaderCircle size={18} className="mx-auto mb-2 animate-spin" />
                    正在加载操作记录
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-500">
                    暂无操作记录
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="align-middle">
                    <td className="px-5 py-4">
                      <StatusPill tone={log.scope === 'farm' ? 'success' : 'warning'}>
                        {log.scope === 'farm' ? '农场' : '金库'}
                      </StatusPill>
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-slate-900">{log.action}</td>
                    <td className="px-5 py-4 text-sm text-slate-700">{log.summary}</td>
                    <td className="px-5 py-4 font-mono text-sm text-slate-600">{log.blockNumber.toString()}</td>
                    <td className="px-5 py-4 font-mono text-sm text-slate-600">{shortAddress(log.transactionHash)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
