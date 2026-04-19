'use client';

import { useDeferredValue, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import {
  useAccount,
  useBalance,
  useChainId,
  usePublicClient,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import {
  ArrowDown,
  ChevronDown,
  ChevronUp,
  Info,
  ShieldOff,
  Wallet,
} from 'lucide-react';
import { maxUint256, zeroAddress } from 'viem';

import { ActionButton } from '@/components/ActionButton';
import {
  getContractAddress,
  getLocalGasOverride,
  isFluxSupportedChain,
} from '@/config/contracts';
import {
  getSwapTokenOptions,
  type SwapTokenOption,
  type SwapTokenSymbol,
} from '@/config/tokens';
import {
  fluxSwapRouterAbi,
  fluxTokenAbi,
  useReadFluxSwapFactoryGetPair,
  useReadFluxSwapPairGetReserves,
  useReadFluxSwapPairToken0,
  useReadFluxSwapRouterGetAmountsIn,
  useReadFluxSwapRouterGetAmountsOut,
  useReadFluxTokenAllowance,
} from '@/lib/contracts';
import { useIsClient } from '@/hooks/useIsClient';
import {
  DECIMAL_INPUT_REGEX,
  formatBigIntAmount,
  formatDisplayAmount,
  parseAmount,
  parsePercentToBps,
} from '@/lib/amounts';
import { formatErrorMessage } from '@/lib/errors';
import { watchWalletAsset } from '@/lib/wallet';

type SelectorTarget = 'pay' | 'receive' | null;
type ActionKind = 'approve' | 'revoke' | 'swap' | null;
type InputMode = 'pay' | 'receive';
type TradeMode = 'swap' | 'limit';
type LimitPricePreset = 'market' | '0.1' | '0.5' | '1.0' | 'custom';

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
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-[1.75rem] border border-gray-200 bg-white p-3 shadow-2xl dark:border-gray-700 dark:bg-gray-800"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-2 px-2 py-1 text-sm font-semibold text-gray-500 dark:text-gray-400">
          Select token
        </div>
        <div className="space-y-1">
          {options.map((token) => (
            <button
              key={token.symbol}
              onClick={() => {
                onSelect(token);
                onClose();
              }}
              className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <span className="font-semibold text-gray-900 dark:text-white">{token.symbol}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">{token.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SwapWidget({
  hideDetails = false,
  enableModeSwitch = false,
}: {
  hideDetails?: boolean;
  enableModeSwitch?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const copy = {
    unsupportedChain: isZh
      ? '当前网络未同步合约地址'
      : 'Contracts are not configured for this network',
    unsupportedPair: isZh ? '请选择可交易的代币对' : 'Please select a supported token pair',
    enterAmount: isZh ? '请输入数量' : 'Enter an amount',
    invalidAmount: isZh ? '数量格式无效' : 'Invalid amount',
    insufficientBalance: isZh ? '余额不足' : 'Insufficient balance',
    poolNotCreated: isZh ? '未创建' : 'Not created',
    poolEmpty: isZh ? '无流动性' : 'No liquidity',
    poolReady: isZh ? '可交易' : 'Tradable',
    poolUnavailable: isZh ? '不可用' : 'Unavailable',
    poolNotCreatedHint: isZh
      ? '当前交易对还没有创建，所以暂时不能交换。'
      : 'This trading pair has not been created yet, so swapping is unavailable.',
    poolNoLiquidityHint: isZh
      ? '当前交易对已存在，但池子里还没有可用流动性。'
      : 'This trading pair exists, but there is no available liquidity yet.',
    poolReadyHint: isZh
      ? '当前交易对已就绪，可以直接发起交换。'
      : 'This trading pair is ready and can be swapped now.',
    poolUnavailableHint: isZh
      ? '当前网络没有同步好这组合约地址，请先切换到受支持网络。'
      : 'Contracts are not configured for this network. Please switch to a supported network.',
    quotePending: isZh ? '等待链上报价中' : 'Waiting for live quote',
    quoteError: isZh ? '当前无法获取链上报价' : 'Unable to fetch a live quote right now',
    allowance: isZh ? 'Router 授权额度' : 'Router Allowance',
    poolState: isZh ? '池子状态' : 'Pool Status',
    approveButton: (symbol: string) => (isZh ? `授权 ${symbol}` : `Approve ${symbol}`),
    approving: isZh ? '授权中...' : 'Approving...',
    approvalSubmitted: isZh ? '授权已提交' : 'Approval submitted',
    approvalConfirmed: isZh ? '授权已确认' : 'Approval confirmed',
    swapping: isZh ? '交换中...' : 'Swapping...',
    readyToSwap: isZh ? '立即交换' : 'Swap Now',
    swapTab: isZh ? '交换' : 'Swap',
    limitTab: isZh ? '限价' : 'Limit',
    limitTitle: isZh ? '创建限价单' : 'Create Limit Order',
    limitTargetRate: isZh ? '目标价格' : 'Target price',
    limitExpiry: isZh ? '有效期' : 'Expiry',
    limitVsMarket: isZh ? '较市场价' : 'Vs market',
    marketPrice: isZh ? '市场' : 'Market',
    limitOrderNotice: isZh
      ? '当前前端已提供限价单录入界面，但合约侧还没有原生限价撮合能力。你可以先填写目标价格与数量，后续接入执行器后即可自动触发。'
      : 'The limit order form is available in the frontend, but native on-chain matching is not wired yet. You can prepare target price and amount now, and plug in an executor later.',
    limitOrderSubmit: isZh ? '创建限价单' : 'Create Limit Order',
    limitOrderPending: isZh ? '限价单功能接入中' : 'Limit order support is in progress',
    liveQuote: isZh ? '链上报价已就绪' : 'Live quote ready',
    txSubmitted: isZh ? '交易已提交' : 'Transaction submitted',
    txConfirmed: isZh ? '交易已确认' : 'Transaction confirmed',
    nativeAsset: isZh ? '原生资产，无需授权' : 'Native asset',
    loading: isZh ? '加载中...' : 'Loading...',
  };

  const revokeApprovalLabel = (symbol: string) =>
    isZh ? `撤销 ${symbol} 授权` : `Revoke ${symbol} approval`;
  const addFluxToWalletLabel = isZh ? '添加 FLUX 到钱包' : 'Add FLUX to wallet';
  const walletPromptOpenedLabel = isZh ? '已向钱包发起添加请求' : 'Wallet prompt opened';
  const walletPromptUnavailableLabel = isZh
    ? '当前钱包不支持添加资产'
    : 'This wallet does not support adding assets';

  const mounted = useIsClient();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { writeContractAsync, data: hash, isPending: isWritePending } =
    useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash,
    });

  const effectiveChainId = mounted ? chainId : undefined;
  const tokenOptions = getSwapTokenOptions(effectiveChainId);
  const [payTokenSymbol, setPayTokenSymbol] = useState<SwapTokenSymbol>('ETH');
  const [receiveTokenSymbol, setReceiveTokenSymbol] =
    useState<SwapTokenSymbol>('FLUX');
  const [payAmount, setPayAmount] = useState('');
  const [receiveAmountInput, setReceiveAmountInput] = useState('');
  const [slippage, setSlippage] = useState('0.5');
  const [deadline] = useState('20');
  const [openSelector, setOpenSelector] = useState<SelectorTarget>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [walletNotice, setWalletNotice] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<ActionKind>(null);
  const [inputMode, setInputMode] = useState<InputMode>('pay');
  const [tradeMode, setTradeMode] = useState<TradeMode>('swap');
  const [limitRate, setLimitRate] = useState('');
  const [limitExpiry, setLimitExpiry] = useState('7');
  const [limitPremium, setLimitPremium] = useState('0.0');
  const [limitPricePreset, setLimitPricePreset] =
    useState<LimitPricePreset>('market');
  const isLimitMode = enableModeSwitch && tradeMode === 'limit';

  const deferredPayAmount = useDeferredValue(payAmount);
  const deferredReceiveAmount = useDeferredValue(receiveAmountInput);
  const supportedChain = isFluxSupportedChain(effectiveChainId);
  const routerAddress = getContractAddress('FluxSwapRouter', effectiveChainId);
  const factoryAddress = getContractAddress('FluxSwapFactory', effectiveChainId);
  const fluxTokenAddress = getContractAddress('FluxToken', effectiveChainId);
  const wrappedNativeAddress = getContractAddress('MockWETH', effectiveChainId);

  const payToken = getTokenBySymbol(tokenOptions, payTokenSymbol) ?? tokenOptions[0];
  const receiveToken =
    tokenOptions.find(
      (token) =>
        token.symbol === receiveTokenSymbol && token.symbol !== payToken?.symbol,
    ) ?? tokenOptions.find((token) => token.symbol !== payToken?.symbol);
  const pairLabel =
    payToken && receiveToken
      ? `${payToken.symbol} / ${receiveToken.symbol}`
      : isZh
        ? '当前交易对'
        : 'the selected pair';

  const parsedPayAmount = parseAmount(
    deferredPayAmount,
    payToken?.decimals ?? 18,
  );
  const parsedReceiveAmount = parseAmount(
    deferredReceiveAmount,
    receiveToken?.decimals ?? 18,
  );
  const quotePath =
    payToken && receiveToken
      ? ([payToken.routeAddress, receiveToken.routeAddress] as const)
      : ([zeroAddress, zeroAddress] as const);
  const pairArgs =
    payToken && receiveToken
      ? ([payToken.routeAddress, receiveToken.routeAddress] as const)
      : ([zeroAddress, zeroAddress] as const);

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

  const { data: token0 } = useReadFluxSwapPairToken0({
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
      normalizedPairAddress &&
      hasLiquidity &&
      (
        (inputMode === 'pay' && parsedPayAmount && parsedPayAmount > BigInt(0)) ||
        (inputMode === 'receive' && parsedReceiveAmount && parsedReceiveAmount > BigInt(0))
      ),
  );

  const quoteQuery = useReadFluxSwapRouterGetAmountsOut({
    address: routerAddress ?? zeroAddress,
    chainId,
    args: [parsedPayAmount ?? BigInt(0), quotePath],
    query: {
      enabled: canRequestQuote && inputMode === 'pay',
      retry: false,
      refetchInterval: 8000,
    },
  });

  const quoteInQuery = useReadFluxSwapRouterGetAmountsIn({
    address: routerAddress ?? zeroAddress,
    chainId,
    args: [parsedReceiveAmount ?? BigInt(0), quotePath],
    query: {
      enabled: canRequestQuote && inputMode === 'receive',
      retry: false,
      refetchInterval: 8000,
    },
  });

  const quoteAmounts = inputMode === 'pay' ? quoteQuery.data : quoteInQuery.data;
  const quotedAmountOut =
    inputMode === 'pay'
      ? quoteAmounts?.[quoteAmounts.length - 1]
      : parsedReceiveAmount;
  const quotedAmountIn =
    inputMode === 'receive'
      ? quoteAmounts?.[0]
      : parsedPayAmount;
  const rateQuoteAmountIn = payToken
    ? BigInt(10) ** BigInt(payToken.decimals)
    : undefined;

  const rateQuoteQuery = useReadFluxSwapRouterGetAmountsOut({
    address: routerAddress ?? zeroAddress,
    chainId,
    args: [rateQuoteAmountIn ?? BigInt(0), quotePath],
    query: {
      enabled: Boolean(
        routerAddress &&
          payToken &&
          receiveToken &&
          rateQuoteAmountIn &&
          normalizedPairAddress &&
          hasLiquidity,
      ),
      retry: false,
      refetchInterval: 8000,
    },
  });

  const rateQuoteAmounts = rateQuoteQuery.data;
  const quotedRateOut = rateQuoteAmounts?.[rateQuoteAmounts.length - 1];

  const { data: allowance } = useReadFluxTokenAllowance({
    address: payToken?.kind === 'erc20' ? payToken.address ?? zeroAddress : zeroAddress,
    chainId,
    args: [address ?? zeroAddress, routerAddress ?? zeroAddress],
    query: {
      enabled:
        mounted &&
        isConnected &&
        !!address &&
        !!routerAddress &&
        !!payToken?.address &&
        payToken?.kind === 'erc20',
      refetchInterval: 8000,
    },
  });

  const limitRateNumeric = Number(limitRate);
  const payAmountNumeric = Number(payAmount);
  const limitReceiveAmount =
    isLimitMode &&
    limitRate !== '' &&
    payAmount !== '' &&
    Number.isFinite(limitRateNumeric) &&
    limitRateNumeric >= 0 &&
    Number.isFinite(payAmountNumeric) &&
    payAmountNumeric >= 0 &&
    receiveToken
      ? formatDisplayAmount(String(payAmountNumeric * limitRateNumeric), Math.min(receiveToken.decimals, 8))
      : '';

  const payBalanceDisplay = payBalanceData?.formatted
    ? formatDisplayAmount(payBalanceData.formatted)
    : '0.00';
  const receiveBalanceDisplay = receiveBalanceData?.formatted
    ? formatDisplayAmount(receiveBalanceData.formatted)
    : '0.00';
  const receiveAmount =
    isLimitMode
      ? limitReceiveAmount
      : inputMode === 'receive'
      ? receiveAmountInput
      : formatBigIntAmount(quotedAmountOut, receiveToken?.decimals ?? 18);
  const payAmountDisplay =
    inputMode === 'pay'
      ? payAmount
      : formatBigIntAmount(quotedAmountIn, payToken?.decimals ?? 18);
  const rateDisplay =
    receiveToken && quotedRateOut
      ? formatBigIntAmount(quotedRateOut, receiveToken.decimals, 6)
      : '--';
  const limitMarketRateDisplay =
    receiveToken && quotedRateOut
      ? formatBigIntAmount(quotedRateOut, receiveToken.decimals, 8)
      : '';
  const limitTargetRateDisplay =
    payToken && receiveToken
      ? limitRate
        ? `1 ${payToken.symbol} = ${limitRate} ${receiveToken.symbol}`
        : `1 ${payToken.symbol} = -- ${receiveToken.symbol}`
      : '--';
  const payTokenIsToken0 =
    Boolean(token0 && payToken) &&
    token0?.toLowerCase() === payToken?.routeAddress.toLowerCase();
  const payReserve =
    reservesData && payToken && receiveToken
      ? payTokenIsToken0
        ? reservesData[0]
        : reservesData[1]
      : undefined;
  const receiveReserve =
    reservesData && payToken && receiveToken
      ? payTokenIsToken0
        ? reservesData[1]
        : reservesData[0]
      : undefined;
  const maxPayAmountDisplay =
    payReserve !== undefined && payToken
      ? formatBigIntAmount(payReserve, payToken.decimals, Math.min(payToken.decimals, 8))
      : undefined;
  const maxReceiveAmountDisplay =
    receiveReserve !== undefined && receiveToken
      ? formatBigIntAmount(
          receiveReserve > BigInt(0) ? receiveReserve - BigInt(1) : BigInt(0),
          receiveToken.decimals,
          Math.min(receiveToken.decimals, 8),
        )
      : undefined;
  const noPoolLabel = isZh
    ? `当前网络还没有 ${pairLabel} 交易对`
    : `${pairLabel} pair has not been created yet`;
  const noLiquidityLabel = isZh
    ? `${pairLabel} 交易对已创建，但暂无可用流动性`
    : `${pairLabel} pair exists, but there is no active liquidity`;

  const insufficientBalance = Boolean(
    quotedAmountIn &&
      payBalanceData?.value !== undefined &&
      quotedAmountIn > payBalanceData.value,
  );

  const needsApproval = Boolean(
    payToken?.kind === 'erc20' &&
      quotedAmountIn &&
      allowance !== undefined &&
      quotedAmountIn > allowance,
  );
  const canRevokeAllowance = Boolean(
    payToken?.kind === 'erc20' &&
      allowance !== undefined &&
      allowance > BigInt(0),
  );

  const slippageBps = parsePercentToBps(slippage);
  const amountOutMin =
    quotedAmountOut !== undefined
      ? (quotedAmountOut * (BigInt(10000) - slippageBps)) / BigInt(10000)
      : undefined;
  const amountInMax =
    quotedAmountIn !== undefined
      ? (quotedAmountIn * (BigInt(10000) + slippageBps)) / BigInt(10000)
      : undefined;
  const isSubmitting = isWritePending || isConfirming;
  const localGasOverride = getLocalGasOverride(chainId);

  useEffect(() => {
    if (!isConfirmed || lastAction !== 'swap') {
      return;
    }

    setPayAmount('');
    setReceiveAmountInput('');
    setTxError(null);
  }, [isConfirmed, lastAction]);

  useEffect(() => {
    if (!isLimitMode) {
      return;
    }

    if (limitPricePreset === 'custom') {
      return;
    }

    if (!limitMarketRateDisplay) {
      setLimitRate('');
      return;
    }

    if (limitPricePreset === 'market') {
      setLimitPremium('0.0');
      setLimitRate(limitMarketRateDisplay);
      return;
    }

    const market = Number(limitMarketRateDisplay);
    const premium = Number(limitPricePreset);

    if (!Number.isFinite(market) || !Number.isFinite(premium)) {
      setLimitPremium('0.0');
      setLimitRate(limitMarketRateDisplay);
      return;
    }

    setLimitPremium(limitPricePreset);
    const nextRate = market * (1 + premium / 100);
    setLimitRate(nextRate.toFixed(8).replace(/\.?0+$/, ''));
  }, [isLimitMode, limitMarketRateDisplay, limitPricePreset]);

  let actionLabel = copy.readyToSwap;
  let actionDisabled = false;
  let actionKind: ActionKind = 'swap';
  const statusLabel =
    lastAction === 'approve' || lastAction === 'revoke'
      ? isConfirmed
        ? copy.approvalConfirmed
        : copy.approvalSubmitted
      : isConfirmed
        ? copy.txConfirmed
        : copy.txSubmitted;

  if (isLimitMode) {
    actionLabel = copy.limitOrderSubmit;
    actionDisabled = true;
    actionKind = null;
  } else if (!mounted || !isConnected) {
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
  } else if (
    (inputMode === 'pay' && (!parsedPayAmount || parsedPayAmount <= BigInt(0))) ||
    (inputMode === 'receive' && (!parsedReceiveAmount || parsedReceiveAmount <= BigInt(0)))
  ) {
    actionLabel = copy.invalidAmount;
    actionDisabled = true;
    actionKind = null;
  } else if (insufficientBalance) {
    actionLabel = copy.insufficientBalance;
    actionDisabled = true;
    actionKind = null;
  } else if (!normalizedPairAddress) {
    actionLabel = noPoolLabel;
    actionDisabled = true;
    actionKind = null;
  } else if (!hasLiquidity) {
    actionLabel = noLiquidityLabel;
    actionDisabled = true;
    actionKind = null;
  } else if (
    !quotedAmountOut ||
    quotedAmountOut <= BigInt(0) ||
    !quotedAmountIn ||
    quotedAmountIn <= BigInt(0)
  ) {
    actionLabel = copy.quotePending;
    actionDisabled = true;
    actionKind = null;
  } else if (isSubmitting) {
    actionLabel =
      lastAction === 'approve' || lastAction === 'revoke'
        ? copy.approving
        : copy.swapping;
    actionDisabled = true;
    actionKind = null;
  } else if (needsApproval) {
    actionLabel = copy.approveButton(payToken.symbol);
    actionKind = 'approve';
  }

  const pairStatus = !supportedChain
    ? copy.poolUnavailable
    : !normalizedPairAddress
      ? copy.poolNotCreated
      : hasLiquidity
        ? copy.poolReady
        : copy.poolEmpty;

  const pairStatusHint = !supportedChain
    ? copy.poolUnavailableHint
    : !normalizedPairAddress
      ? noPoolLabel
      : hasLiquidity
        ? copy.poolReadyHint
        : noLiquidityLabel;

  const pairStatusClass = !supportedChain
    ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
    : !normalizedPairAddress
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
      : hasLiquidity
        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
        : 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300';

  const allowanceStatus =
    payToken?.kind !== 'erc20'
      ? copy.nativeAsset
      : allowance === undefined
        ? copy.loading
        : allowance === maxUint256
          ? (isZh ? '无限授权' : 'Unlimited')
          : formatBigIntAmount(allowance, payToken.decimals, 4);

  const handlePayAmountChange = (value: string) => {
    if (!DECIMAL_INPUT_REGEX.test(value)) {
      return;
    }

    const normalizedValue =
      value !== '' &&
      parsedPayAmount !== undefined &&
      payReserve !== undefined &&
      parsedPayAmount > payReserve
        ? maxPayAmountDisplay ?? value
        : value;

    setInputMode('pay');
    setPayAmount(normalizedValue);
    if (normalizedValue === '') {
      setReceiveAmountInput('');
    }
  };

  const handleReceiveAmountChange = (value: string) => {
    if (!DECIMAL_INPUT_REGEX.test(value)) {
      return;
    }

    const normalizedParsedReceiveAmount = parseAmount(
      value,
      receiveToken?.decimals ?? 18,
    );
    const maxReceivable =
      receiveReserve !== undefined && receiveReserve > BigInt(0)
        ? receiveReserve - BigInt(1)
        : receiveReserve;
    const normalizedValue =
      value !== '' &&
      normalizedParsedReceiveAmount !== undefined &&
      maxReceivable !== undefined &&
      normalizedParsedReceiveAmount > maxReceivable
        ? maxReceiveAmountDisplay ?? value
        : value;

    setInputMode('receive');
    setReceiveAmountInput(normalizedValue);
    if (normalizedValue === '') {
      setPayAmount('');
    }
  };

  const handleSlippageChange = (value: string) => {
    if (value === '') {
      setSlippage('');
      return;
    }

    if (!DECIMAL_INPUT_REGEX.test(value)) {
      return;
    }

    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
      return;
    }

    setSlippage(value);
  };

  const adjustLimitPremium = (delta: number) => {
    const current = Number(limitPremium || '0');
    const safeCurrent = Number.isFinite(current) && current >= 0 ? current : 0;
    const nextValue = Math.max(
      0,
      Math.min(50, Math.round((safeCurrent + delta) * 10) / 10),
    );

    const nextPremium = nextValue.toFixed(1);
    setLimitPremium(nextPremium);
    setLimitPricePreset('custom');

    if (!limitMarketRateDisplay) {
      setLimitRate('');
      return;
    }

    const market = Number(limitMarketRateDisplay);
    if (!Number.isFinite(market)) {
      setLimitRate(limitMarketRateDisplay);
      return;
    }

    const nextRate = market * (1 + nextValue / 100);
    setLimitRate(nextRate.toFixed(8).replace(/\.?0+$/, ''));
  };

  const applyLimitPreset = (preset: Exclude<LimitPricePreset, 'custom'>) => {
    setLimitPricePreset(preset);

    if (!limitMarketRateDisplay) {
      setLimitPremium('0.0');
      setLimitRate('');
      return;
    }

    if (preset === 'market') {
      setLimitPremium('0.0');
      setLimitRate(limitMarketRateDisplay);
      return;
    }

    const market = Number(limitMarketRateDisplay);
    const premium = Number(preset);

    if (!Number.isFinite(market) || !Number.isFinite(premium)) {
      setLimitPremium('0.0');
      setLimitRate(limitMarketRateDisplay);
      return;
    }

    setLimitPremium(preset);
    const nextRate = market * (1 + premium / 100);
    setLimitRate(nextRate.toFixed(8).replace(/\.?0+$/, ''));
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
      setPayAmount('');
      setReceiveAmountInput('');
      setInputMode('pay');
      return;
    }

    setReceiveTokenSymbol(token.symbol);
    if (payToken?.symbol === token.symbol) {
      setPayTokenSymbol(receiveToken?.symbol ?? payTokenSymbol);
    }
    setPayAmount('');
    setReceiveAmountInput('');
    setInputMode('pay');
  };

  const handleFlip = () => {
    if (!payToken || !receiveToken) {
      return;
    }

    setPayTokenSymbol(receiveToken.symbol);
    setReceiveTokenSymbol(payToken.symbol);
    setPayAmount('');
    setReceiveAmountInput('');
    setInputMode('pay');
    setLimitRate('');
    setLimitPremium('0.0');
    setLimitPricePreset('market');
  };

  const handleMaxPay = () => {
    if (!payBalanceData?.formatted) {
      return;
    }

    setInputMode('pay');
    setPayAmount(payBalanceData.formatted);
  };

  const handleWatchFlux = async () => {
    if (!fluxTokenAddress) {
      return;
    }

    setWalletNotice(null);

    try {
      const watched = await watchWalletAsset({
        address: fluxTokenAddress,
        symbol: 'FLUX',
        decimals: 18,
      });
      setWalletNotice(watched ? walletPromptOpenedLabel : walletPromptUnavailableLabel);
    } catch (error) {
      setWalletNotice(
        formatErrorMessage(error, {
          rejectedMessage: isZh
            ? '你已取消本次钱包添加请求'
            : 'You cancelled the wallet asset request',
        }),
      );
    }
  };

  const handleRevokeAllowance = async () => {
    if (!payToken?.address || !routerAddress) {
      return;
    }

    setTxError(null);
    setLastAction('revoke');

    try {
      await writeContractAsync({
        address: payToken.address,
        abi: fluxTokenAbi,
        functionName: 'approve',
        args: [routerAddress, BigInt(0)],
        chainId,
        ...localGasOverride,
      });
    } catch (error) {
      setTxError(
        formatErrorMessage(error, {
          rejectedMessage: isZh ? '你已取消本次授权' : 'You cancelled the approval request',
        }),
      );
    }
  };

  const handleAction = async () => {
    if (isLimitMode) {
      setTxError(copy.limitOrderPending);
      return;
    }

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
          ...localGasOverride,
        });
        return;
      }

      if (!quotedAmountIn || !quotedAmountOut) {
        return;
      }

      if (!publicClient) {
        throw new Error('Unable to read the latest block timestamp.');
      }

      const transactionDeadline =
        (await publicClient.getBlock()).timestamp +
        BigInt(Math.max(1, Number.parseInt(deadline || '20', 10) || 20) * 60);

      if (payToken.kind === 'native' && inputMode === 'pay') {
        if (amountOutMin === undefined) {
          return;
        }

        await writeContractAsync({
          address: routerAddress,
          abi: fluxSwapRouterAbi,
          functionName: 'swapExactETHForTokens',
          args: [amountOutMin, quotePath, address, transactionDeadline],
          value: quotedAmountIn,
          chainId,
          ...localGasOverride,
        });
        return;
      }

      if (payToken.kind === 'native' && inputMode === 'receive') {
        if (amountInMax === undefined || parsedReceiveAmount === undefined) {
          return;
        }

        await writeContractAsync({
          address: routerAddress,
          abi: fluxSwapRouterAbi,
          functionName: 'swapETHForExactTokens',
          args: [parsedReceiveAmount, quotePath, address, transactionDeadline],
          value: amountInMax,
          chainId,
          ...localGasOverride,
        });
        return;
      }

      if (inputMode === 'receive') {
        if (amountInMax === undefined || parsedReceiveAmount === undefined) {
          return;
        }

        await writeContractAsync({
          address: routerAddress,
          abi: fluxSwapRouterAbi,
          functionName: 'swapTokensForExactETH',
          args: [parsedReceiveAmount, amountInMax, quotePath, address, transactionDeadline],
          chainId,
          ...localGasOverride,
        });
        return;
      }

      if (amountOutMin === undefined) {
        return;
      }

      await writeContractAsync({
        address: routerAddress,
        abi: fluxSwapRouterAbi,
        functionName: 'swapExactTokensForETH',
        args: [quotedAmountIn, amountOutMin, quotePath, address, transactionDeadline],
        chainId,
        ...localGasOverride,
      });
    } catch (error) {
      setTxError(
        formatErrorMessage(error, {
          rejectedMessage:
            actionKind === 'approve'
              ? '你已取消本次授权'
              : '你已取消本次交易',
        }),
      );
    }
  };

  const detailsPanel = !hideDetails ? (
    <div className="space-y-2 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm dark:border-gray-700 dark:bg-gray-900/50">
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
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${pairStatusClass}`}>
          {pairStatus}
        </span>
      </div>
      <div className="rounded-xl bg-white/80 px-3 py-2 text-xs leading-6 text-gray-500 dark:bg-gray-800/70 dark:text-gray-400">
        {pairStatusHint}
      </div>
      <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
        <span>{copy.allowance}</span>
        <span className="font-medium">{allowanceStatus}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleWatchFlux}
          disabled={!fluxTokenAddress}
          className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <Wallet size={14} />
          <span>{addFluxToWalletLabel}</span>
        </button>

        {canRevokeAllowance && payToken?.kind === 'erc20' && (
          <button
            onClick={handleRevokeAllowance}
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-900/60 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
          >
            <ShieldOff size={14} />
            <span>{revokeApprovalLabel(payToken.symbol)}</span>
          </button>
        )}
      </div>
      {quoteQuery.error && (
        <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          <Info size={16} className="mt-0.5 shrink-0" />
          <span>{copy.quoteError}</span>
        </div>
      )}
      {walletNotice && (
        <div className="rounded-xl bg-amber-50 px-3 py-2 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          {walletNotice}
        </div>
      )}
      {txError && (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {txError}
        </div>
      )}
      {hash && (
        <div className="rounded-xl bg-blue-50 px-3 py-2 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
          {statusLabel}: {hash.slice(0, 10)}...
        </div>
      )}
    </div>
  ) : null;

  const actionButton = !mounted || !isConnected ? (
    <ActionButton
      label={t('swap.connectWallet')}
      disabled={false}
      onClick={() => openConnectModal?.()}
      variant="ghost"
      className="border-blue-200 bg-blue-100 text-blue-600 hover:bg-blue-200 dark:border-blue-900/50 dark:bg-blue-600/20 dark:text-blue-400 dark:hover:bg-blue-600/30"
    />
  ) : (
    <ActionButton
      label={actionLabel}
      disabled={actionDisabled}
      loading={isSubmitting}
      onClick={handleAction}
    />
  );

  return (
    <div className="w-full">
      <div className="relative overflow-hidden rounded-[2rem] border border-gray-200 bg-white p-4 shadow-2xl dark:border-gray-700 dark:bg-gray-800">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(59,130,246,0.18),_transparent_38%),radial-gradient(circle_at_bottom_left,_rgba(16,185,129,0.12),_transparent_35%)]" />

        <div
          className={`relative ${
            enableModeSwitch && !hideDetails
              ? 'lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(400px,0.95fr)] lg:gap-5'
              : ''
          }`}
        >
          <div>
          {enableModeSwitch && (
            <div className="mb-4 px-2">
              <div className="grid grid-cols-2 rounded-2xl border border-gray-200 bg-gray-100 p-1 dark:border-gray-700 dark:bg-gray-900">
                <button
                  onClick={() => setTradeMode('swap')}
                  className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                    tradeMode === 'swap'
                      ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-white'
                      : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}
                >
                  {copy.swapTab}
                </button>
                <button
                  onClick={() => setTradeMode('limit')}
                  className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                    tradeMode === 'limit'
                      ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-white'
                      : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}
                >
                  {copy.limitTab}
                </button>
              </div>
            </div>
          )}

          <div className="rounded-3xl border border-transparent bg-gray-100 p-4 transition-colors hover:border-gray-300 dark:bg-gray-900 dark:hover:border-gray-700">
            <div className="mb-2 text-sm text-gray-500 dark:text-gray-400">
              {t('swap.pay')}
            </div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.0"
                value={payAmountDisplay}
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

          <div className="relative z-10 -mb-1 -mt-1 flex h-5 items-center justify-center">
            <button
              onClick={handleFlip}
              disabled={!receiveToken}
              className="rounded-2xl border-4 border-white bg-gray-100 p-2.5 text-gray-500 shadow-lg shadow-black/5 transition-colors hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:text-blue-400"
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
                onChange={(event) => {
                  if (isLimitMode) {
                    return;
                  }
                  handleReceiveAmountChange(event.target.value);
                }}
                readOnly={isLimitMode}
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

          {isLimitMode && (
            <div className="mb-4 space-y-4 rounded-3xl border border-sky-200 bg-sky-50/80 p-4 dark:border-sky-900/40 dark:bg-sky-500/10">
              <div className="block">
                <span className="mb-2 block text-sm text-gray-500 dark:text-gray-400">
                  {copy.limitTargetRate}
                </span>
                <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 py-3 text-base font-medium text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white">
                  <span>{limitTargetRateDisplay}</span>
                </div>
              </div>

              <div className="block">
                <span className="mb-2 block text-sm text-gray-500 dark:text-gray-400">
                  {copy.limitExpiry}
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { value: '1', label: isZh ? '1天' : '1 Day' },
                    { value: '7', label: isZh ? '1周' : '1 Week' },
                    { value: '30', label: isZh ? '1个月' : '1 Month' },
                    { value: '365', label: isZh ? '1年' : '1 Year' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setLimitExpiry(option.value)}
                      className={`rounded-2xl px-3 py-3 text-sm font-medium transition-colors ${
                        limitExpiry === option.value
                          ? 'bg-sky-600 text-white'
                          : 'bg-white text-gray-700 hover:bg-sky-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-sky-500/20'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 block text-sm text-gray-500 dark:text-gray-400">
                  {copy.limitVsMarket}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => applyLimitPreset('market')}
                    className={`shrink-0 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                      limitPricePreset === 'market'
                        ? 'bg-sky-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-sky-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-sky-500/20'
                    }`}
                  >
                    {copy.marketPrice}
                  </button>
                  {['0.1', '0.5', '1.0'].map((value) => (
                    <button
                      key={value}
                      onClick={() => {
                        applyLimitPreset(value as Exclude<LimitPricePreset, 'market' | 'custom'>);
                      }}
                      className={`shrink-0 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                        limitPricePreset === value
                          ? 'bg-sky-600 text-white'
                          : 'bg-white text-gray-700 hover:bg-sky-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-sky-500/20'
                      }`}
                    >
                      {value}%
                    </button>
                  ))}
                  <div className="flex w-[100px] shrink-0 items-center rounded-xl border border-gray-200 bg-white px-2 dark:border-gray-700 dark:bg-gray-800">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={limitPremium}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setLimitPremium(nextValue === '' ? '' : nextValue);
                        setLimitPricePreset('custom');

                        if (nextValue === '') {
                          setLimitRate(limitMarketRateDisplay);
                          return;
                        }

                        const premium = Number(nextValue);
                        const market = Number(limitMarketRateDisplay);

                        if (!Number.isFinite(premium) || premium < 0 || !Number.isFinite(market)) {
                          return;
                        }

                        const nextRate = market * (1 + premium / 100);
                        setLimitRate(nextRate.toFixed(8).replace(/\.?0+$/, ''));
                      }}
                      className="min-w-0 flex-1 bg-transparent py-2 text-right text-gray-900 outline-none dark:text-white"
                      placeholder="0.5"
                    />
                    <span className="ml-1 shrink-0 text-gray-500">%</span>
                    <div className="ml-1.5 flex w-5 shrink-0 flex-col overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                      <button
                        type="button"
                        onClick={() => adjustLimitPremium(0.1)}
                        className="flex h-4 w-full items-center justify-center bg-gray-50 text-gray-500 transition-colors hover:bg-sky-100 hover:text-sky-600 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-sky-500/20 dark:hover:text-sky-300"
                      >
                        <ChevronUp size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => adjustLimitPremium(-0.1)}
                        className="flex h-4 w-full items-center justify-center border-t border-gray-200 bg-gray-50 text-gray-500 transition-colors hover:bg-sky-100 hover:text-sky-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-sky-500/20 dark:hover:text-sky-300"
                      >
                        <ChevronDown size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-white/80 px-4 py-3 text-sm leading-6 text-gray-600 dark:bg-gray-900/60 dark:text-gray-300">
                {copy.limitOrderNotice}
              </div>
            </div>
          )}

          {!(enableModeSwitch && !hideDetails) && actionButton}
          </div>

          {detailsPanel && (
            <div className="mt-4 space-y-4 lg:mt-0">
              {detailsPanel}
              {enableModeSwitch && !hideDetails && actionButton}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

