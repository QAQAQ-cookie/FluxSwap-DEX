'use client';

import { useDeferredValue, useState } from 'react';
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
  ArrowDown,
  ChevronDown,
  Info,
  LoaderCircle,
  Settings,
  X,
} from 'lucide-react';
import { formatUnits, maxUint256, parseUnits, zeroAddress } from 'viem';

import { getContractAddress, isFluxSupportedChain } from '@/config/contracts';
import { getSwapTokenOptions, type SwapTokenOption } from '@/config/tokens';
import {
  fluxSwapRouterAbi,
  fluxTokenAbi,
  useReadFluxSwapFactoryGetPair,
  useReadFluxSwapPairGetReserves,
  useReadFluxSwapRouterGetAmountsOut,
  useReadFluxTokenAllowance,
} from '@/lib/contracts';
import { useIsClient } from '@/hooks/useIsClient';

type SelectorTarget = 'pay' | 'receive' | null;
type ActionKind = 'approve' | 'swap' | null;

const INPUT_REGEX = /^\d*(\.\d*)?$/;

function formatDisplayAmount(value?: string, fractionDigits = 6): string {
  if (!value) {
    return '0.00';
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '0.00';
  }

  return numeric.toLocaleString(undefined, {
    maximumFractionDigits: fractionDigits,
  });
}

function formatBigIntAmount(
  value: bigint | undefined,
  decimals: number,
  fractionDigits = 6,
): string {
  if (value === undefined) {
    return '';
  }

  return formatDisplayAmount(formatUnits(value, decimals), fractionDigits);
}

function parseAmount(value: string, decimals: number): bigint | undefined {
  if (!value || !INPUT_REGEX.test(value)) {
    return undefined;
  }

  try {
    return parseUnits(value, decimals);
  } catch {
    return undefined;
  }
}

function parsePercentToBps(value: string): bigint {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return BigInt(50);
  }

  return BigInt(Math.min(Math.max(Math.round(numeric * 100), 0), 5000));
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Unknown error';
}

function getTokenBySymbol(
  tokens: SwapTokenOption[],
  symbol: string,
): SwapTokenOption | undefined {
  return tokens.find((token) => token.symbol === symbol);
}

function TokenPicker({
  isOpen,
  onClose,
  onSelect,
  options,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (token: SwapTokenOption) => void;
  options: SwapTokenOption[];
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="absolute right-0 top-full z-30 mt-2 w-52 rounded-2xl border border-gray-200 bg-white p-2 shadow-2xl dark:border-gray-700 dark:bg-gray-800">
      {options.map((token) => (
        <button
          key={token.symbol}
          onClick={() => {
            onSelect(token);
            onClose();
          }}
          className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <span className="font-semibold text-gray-900 dark:text-white">{token.symbol}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">{token.name}</span>
        </button>
      ))}
    </div>
  );
}

export default function SwapPage() {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const copy = {
    unsupportedChain: isZh
      ? '当前网络未同步合约地址'
      : 'Contracts are not configured for this network',
    unsupportedPair: isZh
      ? '当前页面暂时只支持 ETH / FLUX'
      : 'This screen currently supports ETH / FLUX only',
    enterAmount: isZh ? '请输入金额' : 'Enter an amount',
    invalidAmount: isZh ? '金额格式无效' : 'Invalid amount',
    insufficientBalance: isZh ? '余额不足' : 'Insufficient balance',
    noPool: isZh
      ? '当前网络还没有 ETH / FLUX 交易对'
      : 'ETH / FLUX pair has not been created yet',
    noLiquidity: isZh
      ? '交易对已创建，但暂无可用流动性'
      : 'Pool exists, but there is no active liquidity',
    quotePending: isZh ? '等待链上报价中' : 'Waiting for live quote',
    quoteError: isZh ? '当前无法获取链上报价' : 'Unable to fetch a live quote right now',
    allowance: isZh ? 'Router 授权额度' : 'Router Allowance',
    poolState: isZh ? '池子状态' : 'Pool Status',
    approveButton: (symbol: string) => (isZh ? `授权 ${symbol}` : `Approve ${symbol}`),
    approving: isZh ? '授权中...' : 'Approving...',
    swapping: isZh ? '兑换中...' : 'Swapping...',
    readyToSwap: isZh ? '立即兑换' : 'Swap Now',
    liveQuote: isZh ? '链上报价已就绪' : 'Live quote ready',
    txSubmitted: isZh ? '交易已提交' : 'Transaction submitted',
    txConfirmed: isZh ? '交易已确认' : 'Transaction confirmed',
    nativeAsset: isZh ? '原生资产，无需授权' : 'Native asset',
    loading: isZh ? '加载中...' : 'Loading...',
  };

  const mounted = useIsClient();
  const chainId = useChainId();
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { writeContractAsync, data: hash, isPending: isWritePending } =
    useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash,
    });

  const tokenOptions = getSwapTokenOptions(chainId);
  const [payTokenSymbol, setPayTokenSymbol] = useState<'ETH' | 'FLUX'>('ETH');
  const [receiveTokenSymbol, setReceiveTokenSymbol] =
    useState<'ETH' | 'FLUX'>('FLUX');
  const [payAmount, setPayAmount] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [slippage, setSlippage] = useState('0.5');
  const [deadline, setDeadline] = useState('20');
  const [openSelector, setOpenSelector] = useState<SelectorTarget>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<ActionKind>(null);

  const deferredPayAmount = useDeferredValue(payAmount);
  const supportedChain = isFluxSupportedChain(chainId);
  const routerAddress = getContractAddress('FluxSwapRouter', chainId);
  const factoryAddress = getContractAddress('FluxSwapFactory', chainId);
  const fluxTokenAddress = getContractAddress('FluxToken', chainId);
  const wrappedNativeAddress = getContractAddress('MockWETH', chainId);

  const payToken = getTokenBySymbol(tokenOptions, payTokenSymbol) ?? tokenOptions[0];
  const receiveToken =
    tokenOptions.find(
      (token) =>
        token.symbol === receiveTokenSymbol && token.symbol !== payToken?.symbol,
    ) ?? tokenOptions.find((token) => token.symbol !== payToken?.symbol);

  const parsedPayAmount = parseAmount(
    deferredPayAmount,
    payToken?.decimals ?? 18,
  );
  const quotePath =
    payToken && receiveToken
      ? ([payToken.routeAddress, receiveToken.routeAddress] as const)
      : ([zeroAddress, zeroAddress] as const);
  const pairArgs = [
    fluxTokenAddress ?? zeroAddress,
    wrappedNativeAddress ?? zeroAddress,
  ] as const;

  const { data: payBalanceData } = useBalance({
    address,
    chainId,
    token: payToken?.kind === 'erc20' ? payToken.address : undefined,
    query: {
      enabled: mounted && isConnected && !!address && !!payToken,
      refetchInterval: 8000,
    },
  });

  const { data: receiveBalanceData } = useBalance({
    address,
    chainId,
    token: receiveToken?.kind === 'erc20' ? receiveToken.address : undefined,
    query: {
      enabled: mounted && isConnected && !!address && !!receiveToken,
      refetchInterval: 8000,
    },
  });

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

  const hasLiquidity = Boolean(
    reservesData &&
      reservesData[0] > BigInt(0) &&
      reservesData[1] > BigInt(0),
  );

  const canRequestQuote = Boolean(
    routerAddress &&
      payToken &&
      receiveToken &&
      parsedPayAmount &&
      parsedPayAmount > BigInt(0) &&
      normalizedPairAddress &&
      hasLiquidity,
  );

  const quoteQuery = useReadFluxSwapRouterGetAmountsOut({
    address: routerAddress ?? zeroAddress,
    chainId,
    args: [parsedPayAmount ?? BigInt(0), quotePath],
    query: {
      enabled: canRequestQuote,
      retry: false,
      refetchInterval: 8000,
    },
  });

  const quoteAmounts = quoteQuery.data;
  const quotedAmountOut = quoteAmounts?.[quoteAmounts.length - 1];

  const { data: allowance } = useReadFluxTokenAllowance({
    address: fluxTokenAddress ?? zeroAddress,
    chainId,
    args: [address ?? zeroAddress, routerAddress ?? zeroAddress],
    query: {
      enabled:
        mounted &&
        isConnected &&
        !!address &&
        !!routerAddress &&
        payToken?.kind === 'erc20',
      refetchInterval: 8000,
    },
  });

  const payBalanceDisplay = payBalanceData?.formatted
    ? formatDisplayAmount(payBalanceData.formatted)
    : '0.00';
  const receiveBalanceDisplay = receiveBalanceData?.formatted
    ? formatDisplayAmount(receiveBalanceData.formatted)
    : '0.00';
  const receiveAmount = formatBigIntAmount(
    quotedAmountOut,
    receiveToken?.decimals ?? 18,
  );
  const rateDisplay =
    payToken && receiveToken && quotedAmountOut && parsedPayAmount
      ? formatDisplayAmount(
          (
            Number(formatUnits(quotedAmountOut, receiveToken.decimals)) /
            Number(formatUnits(parsedPayAmount, payToken.decimals))
          ).toString(),
          6,
        )
      : '--';

  const insufficientBalance = Boolean(
    parsedPayAmount &&
      payBalanceData?.value !== undefined &&
      parsedPayAmount > payBalanceData.value,
  );

  const needsApproval = Boolean(
    payToken?.kind === 'erc20' &&
      parsedPayAmount &&
      allowance !== undefined &&
      parsedPayAmount > allowance,
  );

  const slippageBps = parsePercentToBps(slippage);
  const amountOutMin =
    quotedAmountOut !== undefined
      ? (quotedAmountOut * (BigInt(10000) - slippageBps)) / BigInt(10000)
      : undefined;
  const transactionDeadline =
    BigInt(Math.floor(Date.now() / 1000)) +
    BigInt(Math.max(1, Number.parseInt(deadline || '20', 10) || 20) * 60);
  const isSubmitting = isWritePending || isConfirming;

  let actionLabel = copy.readyToSwap;
  let actionDisabled = false;
  let actionKind: ActionKind = 'swap';

  if (!mounted || !isConnected) {
    actionLabel = t('swap.connectWallet');
    actionKind = null;
  } else if (!supportedChain || !routerAddress || !factoryAddress) {
    actionLabel = copy.unsupportedChain;
    actionDisabled = true;
    actionKind = null;
  } else if (!payToken || !receiveToken) {
    actionLabel = copy.unsupportedPair;
    actionDisabled = true;
    actionKind = null;
  } else if (!payAmount) {
    actionLabel = copy.enterAmount;
    actionDisabled = true;
    actionKind = null;
  } else if (!parsedPayAmount || parsedPayAmount <= BigInt(0)) {
    actionLabel = copy.invalidAmount;
    actionDisabled = true;
    actionKind = null;
  } else if (insufficientBalance) {
    actionLabel = copy.insufficientBalance;
    actionDisabled = true;
    actionKind = null;
  } else if (!normalizedPairAddress) {
    actionLabel = copy.noPool;
    actionDisabled = true;
    actionKind = null;
  } else if (!hasLiquidity) {
    actionLabel = copy.noLiquidity;
    actionDisabled = true;
    actionKind = null;
  } else if (!quotedAmountOut || quotedAmountOut <= BigInt(0)) {
    actionLabel = copy.quotePending;
    actionDisabled = true;
    actionKind = null;
  } else if (isSubmitting) {
    actionLabel = lastAction === 'approve' ? copy.approving : copy.swapping;
    actionDisabled = true;
    actionKind = null;
  } else if (needsApproval) {
    actionLabel = copy.approveButton(payToken.symbol);
    actionKind = 'approve';
  }

  const pairStatus = !supportedChain
    ? copy.unsupportedChain
    : !normalizedPairAddress
      ? copy.noPool
      : hasLiquidity
        ? copy.liveQuote
        : copy.noLiquidity;

  const allowanceStatus =
    payToken?.kind !== 'erc20'
      ? copy.nativeAsset
      : allowance === undefined
        ? copy.loading
        : formatBigIntAmount(allowance, payToken.decimals, 4);

  const handlePayAmountChange = (value: string) => {
    if (!INPUT_REGEX.test(value)) {
      return;
    }

    setPayAmount(value);
  };

  const handleSelectToken = (
    target: Exclude<SelectorTarget, null>,
    token: SwapTokenOption,
  ) => {
    if (target === 'pay') {
      setPayTokenSymbol(token.symbol);
      if (receiveToken?.symbol === token.symbol) {
        setReceiveTokenSymbol(payToken?.symbol ?? receiveTokenSymbol);
      }
      return;
    }

    setReceiveTokenSymbol(token.symbol);
    if (payToken?.symbol === token.symbol) {
      setPayTokenSymbol(receiveToken?.symbol ?? payTokenSymbol);
    }
  };

  const handleFlip = () => {
    if (!payToken || !receiveToken) {
      return;
    }

    setPayTokenSymbol(receiveToken.symbol);
    setReceiveTokenSymbol(payToken.symbol);
  };

  const handleMaxPay = () => {
    if (!payBalanceData?.formatted) {
      return;
    }

    setPayAmount(payBalanceData.formatted);
  };

  const handleAction = async () => {
    if (!mounted || !isConnected) {
      openConnectModal?.();
      return;
    }

    if (!actionKind || !address || !payToken || !receiveToken || !routerAddress) {
      return;
    }

    setTxError(null);
    setLastAction(actionKind);

    try {
      if (actionKind === 'approve') {
        if (!payToken.address) {
          return;
        }

        await writeContractAsync({
          address: payToken.address,
          abi: fluxTokenAbi,
          functionName: 'approve',
          args: [routerAddress, maxUint256],
          chainId,
        });
        return;
      }

      if (!parsedPayAmount || amountOutMin === undefined) {
        return;
      }

      if (payToken.kind === 'native') {
        await writeContractAsync({
          address: routerAddress,
          abi: fluxSwapRouterAbi,
          functionName: 'swapExactETHForTokens',
          args: [amountOutMin, quotePath, address, transactionDeadline],
          value: parsedPayAmount,
          chainId,
        });
        return;
      }

      await writeContractAsync({
        address: routerAddress,
        abi: fluxSwapRouterAbi,
        functionName: 'swapExactTokensForETH',
        args: [parsedPayAmount, amountOutMin, quotePath, address, transactionDeadline],
        chainId,
      });
    } catch (error) {
      setTxError(formatErrorMessage(error));
    }
  };

  return (
    <div className="min-h-[calc(100vh-80px)] bg-gray-50 px-4 py-20 transition-colors duration-300 dark:bg-gray-900">
      <div className="mx-auto flex w-full max-w-md flex-col">
        <div className="relative overflow-hidden rounded-[2rem] border border-gray-200 bg-white p-4 shadow-2xl dark:border-gray-700 dark:bg-gray-800">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(59,130,246,0.18),_transparent_38%),radial-gradient(circle_at_bottom_left,_rgba(16,185,129,0.12),_transparent_35%)]" />

          <div className="relative">
            <div className="mb-4 flex items-center justify-between px-2">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {t('swap.title')}
              </h2>
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
              >
                <Settings size={20} />
              </button>
            </div>

            <div className="rounded-3xl border border-transparent bg-gray-100 p-4 transition-colors hover:border-gray-300 dark:bg-gray-900 dark:hover:border-gray-700">
              <div className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                {t('swap.pay')}
              </div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.0"
                  value={payAmount}
                  onChange={(event) => handlePayAmountChange(event.target.value)}
                  className="w-full bg-transparent text-3xl font-bold text-gray-900 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-gray-600"
                />

                <div className="relative">
                  <button
                    onClick={() =>
                      setOpenSelector((current) => (current === 'pay' ? null : 'pay'))
                    }
                    className="flex items-center gap-2 whitespace-nowrap rounded-full border border-gray-200 bg-white px-4 py-2 font-bold text-gray-900 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700"
                  >
                    {payToken?.symbol ?? t('swap.selectToken')}
                    <ChevronDown size={14} />
                  </button>

                  <TokenPicker
                    isOpen={openSelector === 'pay'}
                    onClose={() => setOpenSelector(null)}
                    onSelect={(token) => handleSelectToken('pay', token)}
                    options={tokenOptions.filter((token) => token.symbol !== receiveToken?.symbol)}
                  />
                </div>
              </div>

              {mounted && isConnected && (
                <div className="flex justify-end text-sm text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-2">
                    {t('swap.balance')}: {payBalanceDisplay}
                    <button
                      onClick={handleMaxPay}
                      className="font-semibold text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      {t('swap.max')}
                    </button>
                  </span>
                </div>
              )}
            </div>

            <div className="relative -my-2 z-10 flex h-2 items-center justify-center">
              <button
                onClick={handleFlip}
                disabled={!receiveToken}
                className="rounded-xl border-4 border-white bg-gray-100 p-2 text-gray-500 transition-colors hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:text-blue-400"
              >
                <ArrowDown size={16} />
              </button>
            </div>

            <div className="mb-4 rounded-3xl border border-transparent bg-gray-100 p-4 transition-colors hover:border-gray-300 dark:bg-gray-900 dark:hover:border-gray-700">
              <div className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                {t('swap.receive')}
              </div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <input
                  type="text"
                  placeholder={quoteQuery.isLoading || quoteQuery.isFetching ? '...' : '0.0'}
                  value={receiveAmount}
                  readOnly
                  className="w-full bg-transparent text-3xl font-bold text-gray-900 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-gray-600"
                />

                <div className="relative">
                  <button
                    onClick={() =>
                      setOpenSelector((current) => (current === 'receive' ? null : 'receive'))
                    }
                    className="flex items-center gap-2 whitespace-nowrap rounded-full border border-gray-200 bg-white px-4 py-2 font-bold text-gray-900 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700"
                  >
                    {receiveToken?.symbol ?? t('swap.selectToken')}
                    <ChevronDown size={14} />
                  </button>

                  <TokenPicker
                    isOpen={openSelector === 'receive'}
                    onClose={() => setOpenSelector(null)}
                    onSelect={(token) => handleSelectToken('receive', token)}
                    options={tokenOptions.filter((token) => token.symbol !== payToken?.symbol)}
                  />
                </div>
              </div>

              {mounted && isConnected && receiveToken && (
                <div className="flex justify-end text-sm text-gray-500 dark:text-gray-400">
                  <span>{t('swap.balance')}: {receiveBalanceDisplay}</span>
                </div>
              )}
            </div>

            <div className="mb-4 space-y-2 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm dark:border-gray-700 dark:bg-gray-900/50">
              <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
                <span>{t('swap.rate')}</span>
                <span className="font-medium">
                  {payToken && receiveToken
                    ? `1 ${payToken.symbol} ~ ${rateDisplay} ${receiveToken.symbol}`
                    : '--'}
                </span>
              </div>
              <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
                <span>{t('swap.route')}</span>
                <span className="font-medium">
                  {payToken && receiveToken
                    ? `${payToken.symbol} > ${receiveToken.symbol}`
                    : '--'}
                </span>
              </div>
              <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
                <span>{copy.poolState}</span>
                <span className="font-medium">{pairStatus}</span>
              </div>
              <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
                <span>{copy.allowance}</span>
                <span className="font-medium">{allowanceStatus}</span>
              </div>
              {quoteQuery.error && (
                <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                  <Info size={16} className="mt-0.5 shrink-0" />
                  <span>{copy.quoteError}</span>
                </div>
              )}
              {txError && (
                <div className="rounded-xl bg-red-50 px-3 py-2 text-red-700 dark:bg-red-500/10 dark:text-red-300">
                  {txError}
                </div>
              )}
              {hash && (
                <div className="rounded-xl bg-blue-50 px-3 py-2 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                  {isConfirmed ? copy.txConfirmed : copy.txSubmitted}: {hash.slice(0, 10)}...
                </div>
              )}
            </div>

            {!mounted || !isConnected ? (
              <button
                onClick={openConnectModal}
                className="w-full rounded-2xl border border-blue-200 bg-blue-100 py-4 font-bold text-blue-600 transition-colors hover:bg-blue-200 dark:border-blue-900/50 dark:bg-blue-600/20 dark:text-blue-400 dark:hover:bg-blue-600/30"
              >
                {t('swap.connectWallet')}
              </button>
            ) : (
              <button
                onClick={handleAction}
                disabled={actionDisabled}
                className={`flex w-full items-center justify-center gap-2 rounded-2xl py-4 font-bold transition-colors ${
                  actionDisabled
                    ? 'cursor-not-allowed bg-gray-200 text-gray-400 shadow-none dark:bg-gray-700 dark:text-gray-500'
                    : 'bg-blue-600 text-white shadow-lg shadow-blue-500/30 hover:bg-blue-700'
                }`}
              >
                {isSubmitting && <LoaderCircle size={18} className="animate-spin" />}
                <span>{actionLabel}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('swap.settings')}
              </h3>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="mb-3 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('swap.slippage')}
                </label>
                <div className="flex gap-2">
                  {['0.1', '0.5', '1.0'].map((value) => (
                    <button
                      key={value}
                      onClick={() => setSlippage(value)}
                      className={`rounded-xl px-4 py-2 font-medium transition-colors ${
                        slippage === value
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border border-transparent bg-gray-100 text-gray-700 hover:border-gray-300 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      {value}%
                    </button>
                  ))}
                  <div className="flex flex-1 items-center rounded-xl border border-transparent bg-gray-100 px-3 transition-colors focus-within:border-blue-500 dark:bg-gray-900">
                    <input
                      type="number"
                      value={slippage}
                      onChange={(event) => setSlippage(event.target.value)}
                      className="w-full bg-transparent text-right text-gray-900 outline-none dark:text-white"
                      placeholder="0.5"
                    />
                    <span className="ml-1 text-gray-500">%</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-3 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('swap.deadline')}
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={deadline}
                    onChange={(event) => setDeadline(event.target.value)}
                    className="w-24 rounded-xl border border-transparent bg-gray-100 px-4 py-2 text-gray-900 outline-none transition-colors focus:border-blue-500 dark:bg-gray-900 dark:text-white"
                  />
                  <span className="text-gray-500 dark:text-gray-400">{t('swap.minutes')}</span>
                </div>
              </div>

              <button
                onClick={() => setIsSettingsOpen(false)}
                className="mt-4 w-full rounded-xl bg-blue-600 py-3 font-bold text-white transition-colors hover:bg-blue-700"
              >
                {t('swap.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
