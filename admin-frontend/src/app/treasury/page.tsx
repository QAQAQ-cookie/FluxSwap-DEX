'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, LoaderCircle, RefreshCw, Settings2, ShieldCheck, Vault } from 'lucide-react';
import type { Address, Hex } from 'viem';
import { useChainId, usePublicClient } from 'wagmi';

import { Card, PageHeader, shortAddress, StatusPill } from '@/components/AdminPrimitives';
import { getContractAddress, isFluxSupportedChain } from '@/config/contracts';
import { getAdminTokenOptions } from '@/config/tokens';
import { formatBigIntAmountDown } from '@/lib/amounts';
import { fluxSwapErc20Abi, fluxSwapTreasuryAbi } from '@/lib/contracts';
import { formatErrorMessage } from '@/lib/errors';

const ZERO_BIGINT = BigInt(0);
const EVENT_LOOKBACK_BLOCKS = BigInt(20_000);

type TreasuryInfo = {
  address: Address;
  multisig: Address;
  guardian: Address;
  operator: Address;
  minDelay: bigint;
  paused: boolean;
};

type TreasuryTokenRow = {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  balance: bigint;
  approvedSpendRemaining: bigint;
  dailySpendCap: bigint;
  spentToday: bigint;
  allowed: boolean;
};

type TreasuryOperationRow = {
  operationId: Hex;
  executeAfter: bigint;
  scheduler?: Address;
  status: 'pending' | 'ready';
  blockNumber: bigint;
};

type TreasuryRiskRow = {
  token: TreasuryTokenRow;
  risk: 'danger' | 'warning' | 'success' | 'neutral';
  reason: string;
  spendRatio?: number;
};

function formatDuration(seconds: bigint) {
  if (seconds <= ZERO_BIGINT) {
    return '无延迟';
  }

  const minutes = Number(seconds / BigInt(60));
  const hours = Number(seconds / BigInt(3600));

  if (hours >= 24) {
    return `${Math.round(hours / 24)} 天`;
  }

  if (hours >= 1) {
    return `${hours} 小时`;
  }

  return `${minutes || 1} 分钟`;
}

function formatUnixTime(seconds: bigint) {
  if (seconds <= ZERO_BIGINT) {
    return '--';
  }

  return new Date(Number(seconds) * 1000).toLocaleString('zh-CN', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatTokenAmount(value: bigint, token: TreasuryTokenRow, fractionDigits = 4) {
  return `${formatBigIntAmountDown(value, token.decimals, fractionDigits)} ${token.symbol}`;
}

function getDailySpendRatio(token: TreasuryTokenRow) {
  if (token.dailySpendCap <= ZERO_BIGINT) {
    return undefined;
  }

  const ratio = Number((token.spentToday * BigInt(10_000)) / token.dailySpendCap) / 100;
  return Math.min(100, Math.max(0, ratio));
}

function formatRatio(ratio?: number) {
  if (ratio === undefined) {
    return '--';
  }

  return `${ratio.toLocaleString('zh-CN', {
    minimumFractionDigits: ratio >= 10 ? 1 : 2,
    maximumFractionDigits: 2,
  })}%`;
}

function getSpendTone(ratio?: number): 'success' | 'warning' | 'danger' | 'neutral' {
  if (ratio === undefined) {
    return 'neutral';
  }

  if (ratio >= 90) {
    return 'danger';
  }

  if (ratio >= 75) {
    return 'warning';
  }

  return 'success';
}

function getSpendBarClass(ratio?: number) {
  const tone = getSpendTone(ratio);

  if (tone === 'danger') {
    return 'bg-rose-500';
  }

  if (tone === 'warning') {
    return 'bg-amber-500';
  }

  if (tone === 'success') {
    return 'bg-emerald-500';
  }

  return 'bg-slate-300';
}

function buildRiskRows(tokenRows: TreasuryTokenRow[]): TreasuryRiskRow[] {
  const riskRank = {
    danger: 0,
    warning: 1,
    neutral: 2,
    success: 3,
  };

  return tokenRows
    .map((token) => {
      const spendRatio = getDailySpendRatio(token);

      if (!token.allowed) {
        return {
          token,
          risk: 'warning',
          reason: '未加入白名单，金库不会放行该资产',
          spendRatio,
        } satisfies TreasuryRiskRow;
      }

      if (spendRatio !== undefined && spendRatio >= 90) {
        return {
          token,
          risk: 'danger',
          reason: '今日额度已接近用完，需要关注后续分发',
          spendRatio,
        } satisfies TreasuryRiskRow;
      }

      if (spendRatio !== undefined && spendRatio >= 75) {
        return {
          token,
          risk: 'warning',
          reason: '今日额度使用偏高',
          spendRatio,
        } satisfies TreasuryRiskRow;
      }

      if (token.balance > ZERO_BIGINT && token.approvedSpendRemaining <= ZERO_BIGINT) {
        return {
          token,
          risk: 'warning',
          reason: '金库有余额，但 Manager 暂无可拉取额度',
          spendRatio,
        } satisfies TreasuryRiskRow;
      }

      if (token.balance <= ZERO_BIGINT && token.approvedSpendRemaining > ZERO_BIGINT) {
        return {
          token,
          risk: 'warning',
          reason: '余额为 0，但仍保留授权额度',
          spendRatio,
        } satisfies TreasuryRiskRow;
      }

      if (token.dailySpendCap <= ZERO_BIGINT && token.balance > ZERO_BIGINT) {
        return {
          token,
          risk: 'neutral',
          reason: '未设置每日额度，暂不限制当日支出',
          spendRatio,
        } satisfies TreasuryRiskRow;
      }

      return {
        token,
        risk: 'success',
        reason: '授权、白名单和每日额度正常',
        spendRatio,
      } satisfies TreasuryRiskRow;
    })
    .sort((left, right) => {
      const rankDiff = riskRank[left.risk] - riskRank[right.risk];
      if (rankDiff !== 0) {
        return rankDiff;
      }

      return left.token.symbol.localeCompare(right.token.symbol);
    });
}

function sortOperations(left: TreasuryOperationRow, right: TreasuryOperationRow) {
  if (left.status !== right.status) {
    return left.status === 'ready' ? -1 : 1;
  }

  if (left.executeAfter === right.executeAfter) {
    return left.blockNumber > right.blockNumber ? -1 : 1;
  }

  return left.executeAfter < right.executeAfter ? -1 : 1;
}

function getOperationStatusLabel(status: TreasuryOperationRow['status']) {
  return status === 'ready' ? '可执行' : '等待中';
}

function getOperationStatusTone(status: TreasuryOperationRow['status']) {
  return status === 'ready' ? 'warning' : 'neutral';
}

export default function TreasuryPage() {
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });
  const supportedChain = isFluxSupportedChain(chainId);
  const treasuryAddress = getContractAddress('FluxSwapTreasury', chainId);
  const managerAddress = getContractAddress('FluxMultiPoolManager', chainId);
  const tokens = useMemo(() => getAdminTokenOptions(chainId), [chainId]);

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
      setError(supportedChain ? '当前链缺少 Treasury 合约地址。' : '当前网络暂不支持 FluxSwap 管理端。');
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

      const [rows, scheduledLogs] = await Promise.all([
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
      const activeOperations = (
        await Promise.all(
          Array.from(scheduledById.values()).map(async (operation) => {
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
            } satisfies TreasuryOperationRow;
          }),
        )
      )
        .filter((operation): operation is TreasuryOperationRow => operation !== null)
        .sort(sortOperations);

      setTreasuryInfo({
        address: treasuryAddress,
        multisig,
        guardian,
        operator,
        minDelay,
        paused,
      });
      setTokenRows(rows);
      setOperationRows(activeOperations);
    } catch (loadError) {
      setError(formatErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [managerAddress, publicClient, supportedChain, tokens, treasuryAddress]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadTreasuryData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadTreasuryData]);

  const totalConfiguredAssets = tokenRows.length;
  const allowedTokenCount = tokenRows.filter((token) => token.allowed).length;
  const readyOperationCount = operationRows.filter((operation) => operation.status === 'ready').length;
  const riskRows = useMemo(() => buildRiskRows(tokenRows), [tokenRows]);
  const warningRiskCount = riskRows.filter((row) => row.risk === 'danger' || row.risk === 'warning').length;

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <PageHeader
          eyebrow="Treasury"
          title="金库管理"
          description="查看 Treasury 的关键权限、资产余额、Manager 授权额度、每日支出额度和待处理治理操作。当前页面先做只读管理视图，高风险执行动作后续再接入治理确认。"
        />
        <button
          type="button"
          onClick={() => void loadTreasuryData()}
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5">
          <p className="text-sm text-slate-500">金库状态</p>
          <div className="mt-3">
            <StatusPill tone={treasuryInfo?.paused ? 'danger' : 'success'}>
              {treasuryInfo?.paused ? '已暂停' : '正常'}
            </StatusPill>
          </div>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-slate-500">配置资产</p>
          <p className="mt-3 text-2xl font-semibold text-slate-950">{totalConfiguredAssets}</p>
          <p className="mt-1 text-xs text-slate-500">{allowedTokenCount} 个已加入白名单</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-slate-500">待执行治理</p>
          <p className="mt-3 text-2xl font-semibold text-slate-950">{operationRows.length}</p>
          <p className="mt-1 text-xs text-slate-500">{readyOperationCount} 个已到可执行时间</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-slate-500">治理延迟</p>
          <p className="mt-3 text-2xl font-semibold text-slate-950">
            {formatDuration(treasuryInfo?.minDelay ?? ZERO_BIGINT)}
          </p>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 p-5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <ShieldCheck size={19} />
            </span>
            <div>
              <h2 className="font-semibold text-slate-950">权限与治理地址</h2>
              <p className="text-sm text-slate-500">治理、多签、紧急控制和执行账户的当前配置。</p>
            </div>
          </div>
        </div>
        <div className="grid gap-0 divide-y divide-slate-200 md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-4">
          <div className="p-5">
            <p className="text-xs text-slate-500">Treasury</p>
            <p className="mt-2 font-mono text-sm font-semibold text-slate-900">{shortAddress(treasuryInfo?.address)}</p>
          </div>
          <div className="p-5">
            <p className="text-xs text-slate-500">Multisig</p>
            <p className="mt-2 font-mono text-sm font-semibold text-slate-900">{shortAddress(treasuryInfo?.multisig)}</p>
          </div>
          <div className="p-5">
            <p className="text-xs text-slate-500">Guardian</p>
            <p className="mt-2 font-mono text-sm font-semibold text-slate-900">{shortAddress(treasuryInfo?.guardian)}</p>
          </div>
          <div className="p-5">
            <p className="text-xs text-slate-500">Operator</p>
            <p className="mt-2 font-mono text-sm font-semibold text-slate-900">{shortAddress(treasuryInfo?.operator)}</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="overflow-hidden">
          <div className="border-b border-slate-200 p-5">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Settings2 size={19} />
              </span>
              <div>
                <h2 className="font-semibold text-slate-950">待处理治理操作</h2>
                <p className="text-sm text-slate-500">最近 20,000 区块内排队、尚未执行的金库操作。</p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-5 py-3">操作 ID</th>
                  <th className="px-5 py-3">状态</th>
                  <th className="px-5 py-3">可执行时间</th>
                  <th className="px-5 py-3">发起人</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading && operationRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-sm text-slate-500">
                      <LoaderCircle size={18} className="mx-auto mb-2 animate-spin" />
                      正在加载治理操作
                    </td>
                  </tr>
                ) : operationRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-sm text-slate-500">
                      暂无待处理治理操作
                    </td>
                  </tr>
                ) : (
                  operationRows.map((operation) => (
                    <tr key={operation.operationId} className="align-middle">
                      <td className="px-5 py-4 font-mono text-sm font-semibold text-slate-900">
                        {shortAddress(operation.operationId)}
                      </td>
                      <td className="px-5 py-4">
                        <StatusPill tone={getOperationStatusTone(operation.status)}>
                          {getOperationStatusLabel(operation.status)}
                        </StatusPill>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-700">{formatUnixTime(operation.executeAfter)}</td>
                      <td className="px-5 py-4 font-mono text-sm text-slate-700">
                        {shortAddress(operation.scheduler)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-slate-200 p-5">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <AlertCircle size={19} />
              </span>
              <div>
                <h2 className="font-semibold text-slate-950">授权风险</h2>
                <p className="text-sm text-slate-500">{warningRiskCount} 个资产需要关注。</p>
              </div>
            </div>
          </div>

          <div className="max-h-[340px] divide-y divide-slate-200 overflow-y-auto">
            {loading && riskRows.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500">
                <LoaderCircle size={18} className="mx-auto mb-2 animate-spin" />
                正在检查授权风险
              </div>
            ) : riskRows.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500">暂无资产风险数据</div>
            ) : (
              riskRows.map((row) => (
                <div key={row.token.address} className="flex items-start justify-between gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-950">{row.token.symbol}</p>
                      <StatusPill tone={row.risk}>
                        {row.risk === 'danger'
                          ? '高风险'
                          : row.risk === 'warning'
                            ? '需关注'
                            : row.risk === 'success'
                              ? '正常'
                              : '提示'}
                      </StatusPill>
                    </div>
                    <p className="mt-1 text-sm leading-5 text-slate-500">{row.reason}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-slate-500">今日额度</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{formatRatio(row.spendRatio)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 p-5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <Vault size={19} />
            </span>
            <div>
              <h2 className="font-semibold text-slate-950">金库资产</h2>
              <p className="text-sm text-slate-500">
                展示配置代币在 Treasury 内的余额、给 MultiPoolManager 的可拉取额度，以及每日额度使用进度。
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] border-collapse text-left">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-5 py-3">资产</th>
                <th className="px-5 py-3">白名单</th>
                <th className="px-5 py-3">金库余额</th>
                <th className="px-5 py-3">Manager 授权</th>
                <th className="px-5 py-3">每日额度</th>
                <th className="px-5 py-3">今日使用</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading && tokenRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-500">
                    <LoaderCircle size={18} className="mx-auto mb-2 animate-spin" />
                    正在加载金库数据
                  </td>
                </tr>
              ) : tokenRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-500">
                    暂无配置代币
                  </td>
                </tr>
              ) : (
                tokenRows.map((token) => {
                  const spendRatio = getDailySpendRatio(token);

                  return (
                    <tr key={token.address} className="align-middle">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-950">{token.symbol}</p>
                        <p className="mt-1 font-mono text-xs text-slate-500">{shortAddress(token.address)}</p>
                      </td>
                      <td className="px-5 py-4">
                        <StatusPill tone={token.allowed ? 'success' : 'neutral'}>
                          {token.allowed ? '允许' : '未允许'}
                        </StatusPill>
                      </td>
                      <td className="px-5 py-4 text-sm font-semibold text-slate-900">
                        {formatTokenAmount(token.balance, token)}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-700">
                        {formatTokenAmount(token.approvedSpendRemaining, token)}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-700">
                        {token.dailySpendCap > ZERO_BIGINT ? formatTokenAmount(token.dailySpendCap, token) : '未设置'}
                      </td>
                      <td className="px-5 py-4">
                        <div className="min-w-[190px]">
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="font-medium text-slate-800">{formatTokenAmount(token.spentToday, token)}</span>
                            <span className="text-xs font-semibold text-slate-500">{formatRatio(spendRatio)}</span>
                          </div>
                          <div className="mt-2 h-2 rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full transition-all ${getSpendBarClass(spendRatio)}`}
                              style={{ width: `${spendRatio ?? 0}%` }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <AlertCircle size={18} className="mt-0.5 text-amber-600" />
          <p className="text-sm leading-6 text-slate-600">
            授权额度、每日额度、白名单、暂停和恢复都属于高风险金库动作。当前页面先做只读管理视图；真正执行时建议走治理排队、延迟执行和二次确认。
          </p>
        </div>
      </Card>
    </div>
  );
}
