'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import {
  useAccount,
  useBalance,
  useChainId,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import {
  Droplets,
  Info,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import { formatUnits, maxUint256, zeroAddress } from 'viem';

import { getContractAddress, isFluxSupportedChain } from '@/config/contracts';
import { ActionButton } from '@/components/ActionButton';
import { TokenAmountCard } from '@/components/TokenAmountCard';
import { useIsClient } from '@/hooks/useIsClient';
import {
  formatBigIntAmount,
  formatDisplayAmount,
  parseAmount,
  parsePercentToBps,
} from '@/lib/amounts';
import { formatErrorMessage } from '@/lib/errors';
import {
  fluxSwapPairAbi,
  fluxSwapRouterAbi,
  fluxTokenAbi,
  useReadFluxSwapFactoryGetPair,
  useReadFluxSwapPairAllowance,
  useReadFluxSwapPairBalanceOf,
  useReadFluxSwapPairGetReserves,
  useReadFluxSwapPairToken0,
  useReadFluxSwapPairTotalSupply,
  useReadFluxTokenAllowance,
} from '@/lib/contracts';

type FlowAction =
  | 'approve-token'
  | 'add-liquidity'
  | 'approve-lp'
  | 'remove-liquidity'
  | null;

export default function PoolPage() {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const copy = {
    unsupportedChain: isZh
      ? '当前网络未同步池子相关合约地址'
      : 'Contracts are not configured for this network',
    poolMissing: isZh ? '当前还没有 ETH / FLUX 池' : 'ETH / FLUX pool has not been created yet',
    poolReady: isZh ? '池子已存在' : 'Pool is active',
    poolEmpty: isZh ? '池子已创建但暂无流动性' : 'Pool exists but currently has no liquidity',
    walletNeeded: isZh ? '连接钱包后查看头寸' : 'Connect wallet to view positions',
    addTitle: isZh ? '添加流动性' : 'Add Liquidity',
    removeTitle: isZh ? '移除流动性' : 'Remove Liquidity',
    enterAmount: isZh ? '请输入有效数量' : 'Enter a valid amount',
    insufficientBalance: isZh ? '余额不足' : 'Insufficient balance',
    insufficientLp: isZh ? 'LP 余额不足' : 'Insufficient LP balance',
    approveFlux: isZh ? '授权 FLUX' : 'Approve FLUX',
    approveLp: isZh ? '授权 LP' : 'Approve LP',
    addNow: isZh ? '添加流动性' : 'Add Liquidity',
    removeNow: isZh ? '移除流动性' : 'Remove Liquidity',
    approving: isZh ? '授权中...' : 'Approving...',
    adding: isZh ? '加池中...' : 'Adding liquidity...',
    removing: isZh ? '撤池中...' : 'Removing liquidity...',
    txSubmitted: isZh ? '交易已提交' : 'Transaction submitted',
    txConfirmed: isZh ? '交易已确认' : 'Transaction confirmed',
    expectedOutput: isZh ? '预计取回' : 'Expected withdrawal',
    lpBalance: isZh ? '我的 LP 余额' : 'My LP Balance',
    totalLiquidity: isZh ? '总 LP 供应' : 'Total LP Supply',
    pairAddress: isZh ? '交易对地址' : 'Pair Address',
    reserves: isZh ? '池子储备' : 'Pool Reserves',
    tokenAllowance: isZh ? 'FLUX 授权额度' : 'FLUX Allowance',
    lpAllowance: isZh ? 'LP 授权额度' : 'LP Allowance',
    noPosition: isZh ? '当前没有流动性头寸' : 'No active liquidity position yet',
    bootstrapHint: isZh
      ? '如果池子不存在，首次加池会一并创建交易对'
      : 'If the pool does not exist yet, the first add will bootstrap it',
    slippage: isZh ? '滑点保护' : 'Slippage Protection',
  };

  const mounted = useIsClient();
  const chainId = useChainId();
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { writeContractAsync, data: hash, isPending: isWritePending } =
    useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash });

  const [addEthAmount, setAddEthAmount] = useState('');
  const [addFluxAmount, setAddFluxAmount] = useState('');
  const [removeLpAmount, setRemoveLpAmount] = useState('');
  const [slippage, setSlippage] = useState('0.5');
  const [txError, setTxError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<FlowAction>(null);

  const supportedChain = isFluxSupportedChain(chainId);
  const routerAddress = getContractAddress('FluxSwapRouter', chainId);
  const factoryAddress = getContractAddress('FluxSwapFactory', chainId);
  const fluxTokenAddress = getContractAddress('FluxToken', chainId);
  const wrappedNativeAddress = getContractAddress('MockWETH', chainId);

  const pairArgs = [
    fluxTokenAddress ?? zeroAddress,
    wrappedNativeAddress ?? zeroAddress,
  ] as const;

  const { data: pairAddress } = useReadFluxSwapFactoryGetPair({
    address: factoryAddress ?? zeroAddress,
    chainId,
    args: pairArgs,
    query: {
      enabled:
        supportedChain &&
        !!factoryAddress &&
        !!fluxTokenAddress &&
        !!wrappedNativeAddress,
      retry: false,
      refetchInterval: 10000,
    },
  });

  const normalizedPairAddress =
    pairAddress && pairAddress !== zeroAddress ? pairAddress : undefined;

  const { data: reservesData } = useReadFluxSwapPairGetReserves({
    address: normalizedPairAddress ?? zeroAddress,
    chainId,
    query: {
      enabled: !!normalizedPairAddress,
      retry: false,
      refetchInterval: 10000,
    },
  });

  const { data: token0 } = useReadFluxSwapPairToken0({
    address: normalizedPairAddress ?? zeroAddress,
    chainId,
    query: {
      enabled: !!normalizedPairAddress,
      retry: false,
      refetchInterval: 10000,
    },
  });

  const { data: totalSupply } = useReadFluxSwapPairTotalSupply({
    address: normalizedPairAddress ?? zeroAddress,
    chainId,
    query: {
      enabled: !!normalizedPairAddress,
      retry: false,
      refetchInterval: 10000,
    },
  });

  const { data: lpBalance } = useReadFluxSwapPairBalanceOf({
    address: normalizedPairAddress ?? zeroAddress,
    chainId,
    args: [address ?? zeroAddress],
    query: {
      enabled: !!normalizedPairAddress && !!address && isConnected,
      retry: false,
      refetchInterval: 8000,
    },
  });

  const { data: tokenAllowance } = useReadFluxTokenAllowance({
    address: fluxTokenAddress ?? zeroAddress,
    chainId,
    args: [address ?? zeroAddress, routerAddress ?? zeroAddress],
    query: {
      enabled:
        !!address &&
        !!routerAddress &&
        !!fluxTokenAddress &&
        isConnected,
      refetchInterval: 8000,
    },
  });

  const { data: lpAllowance } = useReadFluxSwapPairAllowance({
    address: normalizedPairAddress ?? zeroAddress,
    chainId,
    args: [address ?? zeroAddress, routerAddress ?? zeroAddress],
    query: {
      enabled:
        !!address &&
        !!routerAddress &&
        !!normalizedPairAddress &&
        isConnected,
      refetchInterval: 8000,
    },
  });

  const { data: ethBalance } = useBalance({
    address,
    chainId,
    query: {
      enabled: !!address && isConnected,
      refetchInterval: 8000,
    },
  });

  const { data: fluxBalance } = useBalance({
    address,
    chainId,
    token: fluxTokenAddress,
    query: {
      enabled: !!address && !!fluxTokenAddress && isConnected,
      refetchInterval: 8000,
    },
  });

  const hasLiquidity = Boolean(
    reservesData &&
      reservesData[0] > BigInt(0) &&
      reservesData[1] > BigInt(0),
  );

  const reserveFlux =
    reservesData && token0 && fluxTokenAddress
      ? token0.toLowerCase() === fluxTokenAddress.toLowerCase()
        ? reservesData[0]
        : reservesData[1]
      : undefined;
  const reserveEth =
    reservesData && token0 && fluxTokenAddress
      ? token0.toLowerCase() === fluxTokenAddress.toLowerCase()
        ? reservesData[1]
        : reservesData[0]
      : undefined;

  const addEthParsed = parseAmount(addEthAmount);
  const addFluxParsed = parseAmount(addFluxAmount);
  const removeLpParsed = parseAmount(removeLpAmount);

  const addNeedsApproval = Boolean(
    addFluxParsed &&
      addFluxParsed > BigInt(0) &&
      tokenAllowance !== undefined &&
      addFluxParsed > tokenAllowance,
  );
  const removeNeedsApproval = Boolean(
    removeLpParsed &&
      removeLpParsed > BigInt(0) &&
      lpAllowance !== undefined &&
      removeLpParsed > lpAllowance,
  );

  const slippageBps = parsePercentToBps(slippage);
  const addFluxMin =
    addFluxParsed !== undefined
      ? (addFluxParsed * (BigInt(10000) - slippageBps)) / BigInt(10000)
      : undefined;
  const addEthMin =
    addEthParsed !== undefined
      ? (addEthParsed * (BigInt(10000) - slippageBps)) / BigInt(10000)
      : undefined;

  const expectedFluxOut =
    removeLpParsed && totalSupply && reserveFlux && totalSupply > BigInt(0)
      ? (removeLpParsed * reserveFlux) / totalSupply
      : undefined;
  const expectedEthOut =
    removeLpParsed && totalSupply && reserveEth && totalSupply > BigInt(0)
      ? (removeLpParsed * reserveEth) / totalSupply
      : undefined;

  const removeFluxMin =
    expectedFluxOut !== undefined
      ? (expectedFluxOut * (BigInt(10000) - slippageBps)) / BigInt(10000)
      : undefined;
  const removeEthMin =
    expectedEthOut !== undefined
      ? (expectedEthOut * (BigInt(10000) - slippageBps)) / BigInt(10000)
      : undefined;

  const deadline =
    BigInt(Math.floor(Date.now() / 1000)) + BigInt(20 * 60);

  const insufficientEth = Boolean(
    addEthParsed &&
      ethBalance?.value !== undefined &&
      addEthParsed > ethBalance.value,
  );
  const insufficientFlux = Boolean(
    addFluxParsed &&
      fluxBalance?.value !== undefined &&
      addFluxParsed > fluxBalance.value,
  );
  const insufficientLp = Boolean(
    removeLpParsed &&
      lpBalance !== undefined &&
      removeLpParsed > lpBalance,
  );

  const isSubmitting = isWritePending || isConfirming;

  let addButtonLabel = copy.addNow;
  let addDisabled = false;
  let addAction: FlowAction = 'add-liquidity';

  if (!mounted || !isConnected) {
    addButtonLabel = t('swap.connectWallet');
    addAction = null;
  } else if (!supportedChain || !routerAddress || !fluxTokenAddress) {
    addButtonLabel = copy.unsupportedChain;
    addDisabled = true;
    addAction = null;
  } else if (!addEthParsed || !addFluxParsed) {
    addButtonLabel = copy.enterAmount;
    addDisabled = true;
    addAction = null;
  } else if (insufficientEth || insufficientFlux) {
    addButtonLabel = copy.insufficientBalance;
    addDisabled = true;
    addAction = null;
  } else if (isSubmitting) {
    addButtonLabel =
      lastAction === 'approve-token' ? copy.approving : copy.adding;
    addDisabled = true;
    addAction = null;
  } else if (addNeedsApproval) {
    addButtonLabel = copy.approveFlux;
    addAction = 'approve-token';
  }

  let removeButtonLabel = copy.removeNow;
  let removeDisabled = false;
  let removeAction: FlowAction = 'remove-liquidity';

  if (!mounted || !isConnected) {
    removeButtonLabel = t('swap.connectWallet');
    removeAction = null;
  } else if (!supportedChain || !routerAddress || !normalizedPairAddress) {
    removeButtonLabel = copy.poolMissing;
    removeDisabled = true;
    removeAction = null;
  } else if (!removeLpParsed) {
    removeButtonLabel = copy.enterAmount;
    removeDisabled = true;
    removeAction = null;
  } else if (insufficientLp) {
    removeButtonLabel = copy.insufficientLp;
    removeDisabled = true;
    removeAction = null;
  } else if (isSubmitting) {
    removeButtonLabel =
      lastAction === 'approve-lp' ? copy.approving : copy.removing;
    removeDisabled = true;
    removeAction = null;
  } else if (removeNeedsApproval) {
    removeButtonLabel = copy.approveLp;
    removeAction = 'approve-lp';
  }

  const pairState = !supportedChain
    ? copy.unsupportedChain
    : !normalizedPairAddress
      ? copy.poolMissing
      : hasLiquidity
        ? copy.poolReady
        : copy.poolEmpty;

  const handleMaxEth = () => {
    if (ethBalance?.formatted) {
      handleAddEthChange(ethBalance.formatted);
    }
  };

  const handleMaxFlux = () => {
    if (fluxBalance?.formatted) {
      handleAddFluxChange(fluxBalance.formatted);
    }
  };

  const handleMaxLp = () => {
    if (lpBalance !== undefined) {
      setRemoveLpAmount(formatUnits(lpBalance, 18));
    }
  };

  const handleAddEthChange = (value: string) => {
    setAddEthAmount(value);

    if (
      !value ||
      !reserveEth ||
      !reserveFlux ||
      reserveEth <= BigInt(0) ||
      reserveFlux <= BigInt(0)
    ) {
      return;
    }

    const parsed = parseAmount(value);
    if (!parsed) {
      return;
    }

    const proportionalFlux = (parsed * reserveFlux) / reserveEth;
    setAddFluxAmount(formatUnits(proportionalFlux, 18));
  };

  const handleAddFluxChange = (value: string) => {
    setAddFluxAmount(value);

    if (
      !value ||
      !reserveEth ||
      !reserveFlux ||
      reserveEth <= BigInt(0) ||
      reserveFlux <= BigInt(0)
    ) {
      return;
    }

    const parsed = parseAmount(value);
    if (!parsed) {
      return;
    }

    const proportionalEth = (parsed * reserveEth) / reserveFlux;
    setAddEthAmount(formatUnits(proportionalEth, 18));
  };

  const handleAddLiquidity = async () => {
    if (!mounted || !isConnected) {
      openConnectModal?.();
      return;
    }

    if (!addAction || !routerAddress || !fluxTokenAddress || !address) {
      return;
    }

    setTxError(null);
    setLastAction(addAction);

    try {
      if (addAction === 'approve-token') {
        await writeContractAsync({
          address: fluxTokenAddress,
          abi: fluxTokenAbi,
          functionName: 'approve',
          args: [routerAddress, maxUint256],
          chainId,
        });
        return;
      }

      if (!addEthParsed || !addFluxParsed || !addEthMin || !addFluxMin) {
        return;
      }

      await writeContractAsync({
        address: routerAddress,
        abi: fluxSwapRouterAbi,
        functionName: 'addLiquidityETH',
        args: [
          fluxTokenAddress,
          addFluxParsed,
          addFluxMin,
          addEthMin,
          address,
          deadline,
        ],
        value: addEthParsed,
        chainId,
      });
    } catch (error) {
      setTxError(formatErrorMessage(error));
    }
  };

  const handleRemoveLiquidity = async () => {
    if (!mounted || !isConnected) {
      openConnectModal?.();
      return;
    }

    if (
      !removeAction ||
      !routerAddress ||
      !normalizedPairAddress ||
      !fluxTokenAddress ||
      !address
    ) {
      return;
    }

    setTxError(null);
    setLastAction(removeAction);

    try {
      if (removeAction === 'approve-lp') {
        await writeContractAsync({
          address: normalizedPairAddress,
          abi: fluxSwapPairAbi,
          functionName: 'approve',
          args: [routerAddress, maxUint256],
          chainId,
        });
        return;
      }

      if (!removeLpParsed || !removeFluxMin || !removeEthMin) {
        return;
      }

      await writeContractAsync({
        address: routerAddress,
        abi: fluxSwapRouterAbi,
        functionName: 'removeLiquidityETH',
        args: [
          fluxTokenAddress,
          removeLpParsed,
          removeFluxMin,
          removeEthMin,
          address,
          deadline,
        ],
        chainId,
      });
    } catch (error) {
      setTxError(formatErrorMessage(error));
    }
  };

  return (
    <div className="min-h-[calc(100vh-80px)] bg-gray-50 px-4 py-20 transition-colors duration-300 dark:bg-gray-900">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[2rem] border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
                  {t('pool.title')}
                </h2>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  {t('pool.subtitle')}
                </p>
              </div>
              <div className="rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 dark:border-blue-900/60 dark:bg-blue-500/10 dark:text-blue-300">
                ETH / FLUX
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl bg-gray-100 p-4 dark:bg-gray-900">
                <div className="mb-2 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <Droplets size={16} />
                  <span>{copy.reserves}</span>
                </div>
                <div className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
                  <div>ETH: {formatBigIntAmount(reserveEth, 18, 4)}</div>
                  <div>FLUX: {formatBigIntAmount(reserveFlux, 18, 4)}</div>
                </div>
              </div>

              <div className="rounded-3xl bg-gray-100 p-4 dark:bg-gray-900">
                <div className="mb-2 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <ShieldCheck size={16} />
                  <span>{copy.totalLiquidity}</span>
                </div>
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  {formatBigIntAmount(totalSupply, 18, 4)}
                </div>
              </div>

              <div className="rounded-3xl bg-gray-100 p-4 dark:bg-gray-900">
                <div className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                  {copy.lpBalance}
                </div>
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  {isConnected ? formatBigIntAmount(lpBalance, 18, 4) : '--'}
                </div>
              </div>

              <div className="rounded-3xl bg-gray-100 p-4 dark:bg-gray-900">
                <div className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                  {copy.pairAddress}
                </div>
                <div className="break-all text-sm font-medium text-gray-900 dark:text-white">
                  {normalizedPairAddress ?? '--'}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-3xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/60">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    {pairState}
                  </div>
                  <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {normalizedPairAddress ? copy.walletNeeded : copy.bootstrapHint}
                  </div>
                </div>
                <div className="text-right text-xs text-gray-500 dark:text-gray-400">
                  <div>{copy.tokenAllowance}: {formatBigIntAmount(tokenAllowance, 18, 4)}</div>
                  <div>{copy.lpAllowance}: {formatBigIntAmount(lpAllowance, 18, 4)}</div>
                </div>
              </div>
            </div>

            {txError && (
              <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
                {txError}
              </div>
            )}

            {hash && (
              <div className="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                {isConfirmed ? copy.txConfirmed : copy.txSubmitted}: {hash.slice(0, 10)}...
              </div>
            )}
          </div>

          <div className="rounded-[2rem] border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
              {copy.removeTitle}
            </div>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              {copy.expectedOutput}
            </p>

            <TokenAmountCard
              label="LP Token"
              value={removeLpAmount}
              onChange={setRemoveLpAmount}
              symbol="LP"
              balance={isConnected ? formatBigIntAmount(lpBalance, 18, 4) : '0.00'}
              onMax={handleMaxLp}
            />

            <div className="mt-4 rounded-3xl bg-gray-100 p-4 text-sm dark:bg-gray-900">
              <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
                <span>ETH</span>
                <span>{formatBigIntAmount(expectedEthOut, 18, 4)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-gray-600 dark:text-gray-300">
                <span>FLUX</span>
                <span>{formatBigIntAmount(expectedFluxOut, 18, 4)}</span>
              </div>
            </div>

            {!mounted || !isConnected ? (
              <ActionButton
                label={t('swap.connectWallet')}
                disabled={false}
                onClick={() => openConnectModal?.()}
                className="mt-4"
              />
            ) : (
              <ActionButton
                label={removeButtonLabel}
                disabled={removeDisabled}
                loading={isSubmitting && (lastAction === 'approve-lp' || lastAction === 'remove-liquidity')}
                onClick={handleRemoveLiquidity}
                variant="danger"
                className="mt-4"
              />
            )}
          </div>
        </div>

        <div className="rounded-[2rem] border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-lg font-semibold text-gray-900 dark:text-white">
                {copy.addTitle}
              </div>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                ETH + FLUX
              </p>
            </div>
            <div className="rounded-full bg-gray-100 px-4 py-2 text-sm text-gray-600 dark:bg-gray-900 dark:text-gray-300">
              {copy.slippage}: {slippage}%
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr]">
            <TokenAmountCard
              label="ETH"
              value={addEthAmount}
              onChange={handleAddEthChange}
              symbol="ETH"
              balance={ethBalance?.formatted ? formatDisplayAmount(ethBalance.formatted) : '0.00'}
              onMax={handleMaxEth}
            />

            <div className="flex items-center justify-center">
              <div className="rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                <Plus size={18} className="text-gray-500 dark:text-gray-400" />
              </div>
            </div>

            <TokenAmountCard
              label="FLUX"
              value={addFluxAmount}
              onChange={handleAddFluxChange}
              symbol="FLUX"
              balance={fluxBalance?.formatted ? formatDisplayAmount(fluxBalance.formatted) : '0.00'}
              onMax={handleMaxFlux}
            />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <button
              onClick={() => setSlippage('0.1')}
              className={`rounded-2xl px-4 py-3 text-sm font-medium transition-colors ${
                slippage === '0.1'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'
              }`}
            >
              0.1%
            </button>
            <button
              onClick={() => setSlippage('0.5')}
              className={`rounded-2xl px-4 py-3 text-sm font-medium transition-colors ${
                slippage === '0.5'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'
              }`}
            >
              0.5%
            </button>
            <button
              onClick={() => setSlippage('1.0')}
              className={`rounded-2xl px-4 py-3 text-sm font-medium transition-colors ${
                slippage === '1.0'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'
              }`}
            >
              1.0%
            </button>
          </div>

          <div className="mt-4 rounded-3xl border border-gray-200 bg-gray-50 p-4 text-sm dark:border-gray-700 dark:bg-gray-900/50">
            <div className="flex items-start gap-2 text-gray-600 dark:text-gray-300">
              <Info size={16} className="mt-0.5 shrink-0" />
              <div>
                <div>{copy.bootstrapHint}</div>
                <div className="mt-1">
                  {copy.tokenAllowance}: {formatBigIntAmount(tokenAllowance, 18, 4)}
                </div>
              </div>
            </div>
          </div>

          {!mounted || !isConnected ? (
            <ActionButton
              label={t('swap.connectWallet')}
              disabled={false}
              onClick={() => openConnectModal?.()}
              className="mt-4"
            />
          ) : (
            <ActionButton
              label={addButtonLabel}
              disabled={addDisabled}
              loading={isSubmitting && (lastAction === 'approve-token' || lastAction === 'add-liquidity')}
              onClick={handleAddLiquidity}
              className="mt-4"
            />
          )}

          {!lpBalance || lpBalance === BigInt(0) ? (
            <div className="mt-4 rounded-2xl bg-gray-100 px-4 py-3 text-sm text-gray-500 dark:bg-gray-900 dark:text-gray-400">
              {copy.noPosition}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              <div>{copy.lpBalance}: {formatBigIntAmount(lpBalance, 18, 4)}</div>
              <Link
                href="/earn"
                className="mt-2 inline-block font-semibold text-emerald-700 transition-colors hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200"
              >
                {isZh ? '前往 Earn 质押 LP' : 'Go to Earn'}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
