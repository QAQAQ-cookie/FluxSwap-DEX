'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Coins, LoaderCircle, RefreshCw } from 'lucide-react';
import type { Address } from 'viem';
import { useChainId, usePublicClient } from 'wagmi';

import { Card, PageHeader, shortAddress, StatusPill } from '@/components/AdminPrimitives';
import { getContractAddress, isFluxSupportedChain } from '@/config/contracts';
import { getAdminTokenOptions } from '@/config/tokens';
import { formatBigIntAmountDown } from '@/lib/amounts';
import { fluxSwapErc20Abi, fluxSwapTreasuryAbi } from '@/lib/contracts';
import { formatErrorMessage } from '@/lib/errors';

type TokenRow = {
  address: Address;
  configuredSymbol: string;
  configuredName: string;
  configuredDecimals: number;
  chainSymbol: string;
  chainName: string;
  chainDecimals: number;
  totalSupply: bigint;
  treasuryAllowed?: boolean;
  treasuryBalance?: bigint;
};

export default function TokensPage() {
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });
  const supportedChain = isFluxSupportedChain(chainId);
  const treasuryAddress = getContractAddress('FluxSwapTreasury', chainId);
  const configuredTokens = useMemo(() => getAdminTokenOptions(chainId), [chainId]);

  const [tokenRows, setTokenRows] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTokens = useCallback(async () => {
    if (!publicClient || !supportedChain) {
      setTokenRows([]);
      setError(supportedChain ? '当前 RPC 客户端尚未准备好。' : '当前网络暂不支持 FluxSwap 管理端。');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const rows = await Promise.all(
        configuredTokens.map(async (token) => {
          const [chainSymbol, chainName, chainDecimals, totalSupply, treasuryAllowed, treasuryBalance] =
            await Promise.all([
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
            ]);

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
          };
        }),
      );

      setTokenRows(rows);
    } catch (loadError) {
      setError(formatErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [configuredTokens, publicClient, supportedChain, treasuryAddress]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadTokens();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadTokens]);

  const matchedTokenCount = tokenRows.filter((token) => {
    return token.configuredSymbol === token.chainSymbol && token.configuredDecimals === token.chainDecimals;
  }).length;
  const allowedTokenCount = tokenRows.filter((token) => token.treasuryAllowed).length;

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <PageHeader
          eyebrow="Tokens"
          title="代币管理"
          description="查看管理端配置的代币、链上代币信息和 Treasury 白名单状态。上新币和白名单治理后续可以在这里扩展。"
        />
        <button
          type="button"
          onClick={() => void loadTokens()}
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

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm text-slate-500">配置代币</p>
          <p className="mt-3 text-2xl font-semibold text-slate-950">{configuredTokens.length}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-slate-500">链上信息匹配</p>
          <p className="mt-3 text-2xl font-semibold text-slate-950">
            {matchedTokenCount} / {tokenRows.length}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-slate-500">金库白名单</p>
          <p className="mt-3 text-2xl font-semibold text-slate-950">
            {allowedTokenCount} / {tokenRows.length}
          </p>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 p-5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Coins size={19} />
            </span>
            <div>
              <h2 className="font-semibold text-slate-950">代币列表</h2>
              <p className="text-sm text-slate-500">用于单币质押池选择、金库资产展示和后续白名单治理。</p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1080px] w-full border-collapse text-left">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-5 py-3">代币</th>
                <th className="px-5 py-3">链上名称</th>
                <th className="px-5 py-3">精度</th>
                <th className="px-5 py-3">配置匹配</th>
                <th className="px-5 py-3">总供应</th>
                <th className="px-5 py-3">金库白名单</th>
                <th className="px-5 py-3">金库余额</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading && tokenRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-sm text-slate-500">
                    <LoaderCircle size={18} className="mx-auto mb-2 animate-spin" />
                    正在加载代币数据
                  </td>
                </tr>
              ) : tokenRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-sm text-slate-500">
                    暂无配置代币
                  </td>
                </tr>
              ) : (
                tokenRows.map((token) => {
                  const matched =
                    token.configuredSymbol === token.chainSymbol && token.configuredDecimals === token.chainDecimals;

                  return (
                    <tr key={token.address} className="align-middle">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-950">{token.configuredSymbol}</p>
                        <p className="mt-1 font-mono text-xs text-slate-500">{shortAddress(token.address)}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm font-medium text-slate-900">{token.chainName}</p>
                        <p className="mt-1 text-xs text-slate-500">{token.chainSymbol}</p>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-700">
                        配置 {token.configuredDecimals} / 链上 {token.chainDecimals}
                      </td>
                      <td className="px-5 py-4">
                        <StatusPill tone={matched ? 'success' : 'warning'}>{matched ? '匹配' : '需检查'}</StatusPill>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-700">
                        {formatBigIntAmountDown(token.totalSupply, token.chainDecimals, 2)}
                      </td>
                      <td className="px-5 py-4">
                        <StatusPill tone={token.treasuryAllowed ? 'success' : 'neutral'}>
                          {token.treasuryAllowed ? '允许' : '未允许'}
                        </StatusPill>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-700">
                        {token.treasuryBalance === undefined
                          ? '--'
                          : `${formatBigIntAmountDown(token.treasuryBalance, token.chainDecimals, 4)} ${token.chainSymbol}`}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
