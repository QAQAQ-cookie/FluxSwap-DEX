"use client";

import { useDeferredValue, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import {
  useAccount,
  useBalance,
  useChainId,
  usePublicClient,
  useSignTypedData,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import {
  ArrowDown,
  ChevronDown,
  ChevronUp,
  Settings2,
  Info,
} from "lucide-react";
import { type Address, maxUint256, parseAbi, zeroAddress } from "viem";

import { ActionButton } from "@/components/ActionButton";
import {
  getContractAddress,
  getLocalGasOverride,
  isFluxSupportedChain,
} from "@/config/contracts";
import {
  getSwapTokenOptions,
  type SwapTokenOption,
  type SwapTokenSymbol,
} from "@/config/tokens";
import {
  fluxSwapRouterAbi,
  fluxTokenAbi,
  useReadFluxSwapFactoryGetPair,
  useReadFluxSwapPairGetReserves,
  useReadFluxSwapPairToken0,
  useReadFluxTokenAllowance,
} from "@/lib/contracts";
import { useIsClient } from "@/hooks/useIsClient";
import {
  DECIMAL_INPUT_REGEX,
  formatBigIntAmount,
  formatDisplayAmount,
  parseAmount,
  parsePercentToBps,
} from "@/lib/amounts";
import { formatErrorMessage } from "@/lib/errors";
import {
  LIMIT_ORDER_DEFAULT_MAX_EXECUTOR_REWARD_BPS,
  buildSignedLimitOrderTypedData,
  calculateTriggerPriceX18,
  hashSignedLimitOrder,
  toSignedLimitOrderTokenAddress,
  type SignedLimitOrder,
} from "@/lib/limitOrders";

type SelectorTarget = "pay" | "receive" | null;
type ActionKind = "approve" | "revoke" | "swap" | "limit" | "wrap" | null;
type InputMode = "pay" | "receive";
type TradeMode = "swap" | "limit";
type LimitPricePreset = "market" | "0.1" | "0.5" | "1.0" | "custom";
type SwapSlippageMode = "auto" | "custom";
type RoutePath = readonly Address[];
type BackendQuoteType =
  | "ROUTE_QUOTE_TYPE_EXACT_INPUT"
  | "ROUTE_QUOTE_TYPE_EXACT_OUTPUT";
type BackendRouteState = {
  didFetch: boolean;
  loading: boolean;
  executionPath?: RoutePath;
  displayPath?: readonly string[];
  amountIn?: bigint;
  amountOut?: bigint;
  error?: string;
};
const MIN_CUSTOM_SLIPPAGE = "0.1";

function getTokenBySymbol(
  tokens: SwapTokenOption[],
  symbol: string,
): SwapTokenOption | undefined {
  return tokens.find((token) => token.symbol === symbol);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function areAddressesEqual(left?: string, right?: string) {
  if (!left || !right) {
    return false;
  }

  return left.toLowerCase() === right.toLowerCase();
}

function normalizeCustomSlippage(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "") {
    return MIN_CUSTOM_SLIPPAGE;
  }

  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric) || numeric < Number(MIN_CUSTOM_SLIPPAGE)) {
    return MIN_CUSTOM_SLIPPAGE;
  }

  return trimmed;
}

function isMeaningfulPath(path: RoutePath | undefined): path is RoutePath {
  return Boolean(
    path &&
    path.length >= 2 &&
    path.every((address) => address !== zeroAddress),
  );
}

function parseOptionalBigInt(value: string | undefined): bigint | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

function parseRoutePath(path: string[] | undefined): RoutePath | undefined {
  if (!path || path.length < 2) {
    return undefined;
  }

  const normalized = path.map((item) => item as Address);
  return isMeaningfulPath(normalized) ? normalized : undefined;
}

function getBackendRequestTokenAddress(
  token: SwapTokenOption | undefined,
): Address | undefined {
  if (!token) {
    return undefined;
  }

  if (token.kind === "native") {
    return zeroAddress;
  }

  return token.address;
}

async function fetchBestRoute(payload: {
  chainId: number;
  tokenIn: Address;
  tokenOut: Address;
  amount: bigint;
  quoteType: BackendQuoteType;
  maxHops?: number;
}): Promise<BackendRouteState> {
  const response = await fetch("/api/routes/best", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      chainId: payload.chainId,
      tokenIn: payload.tokenIn,
      tokenOut: payload.tokenOut,
      amount: payload.amount.toString(),
      quoteType: payload.quoteType,
      maxHops: payload.maxHops ?? 1,
    }),
  });

  const result = (await response.json().catch(() => null)) as {
    notice?: {
      success?: boolean;
      message?: string;
      hint?: string;
    };
    selectedRoute?: {
      pathTokens?: string[];
      amountIn?: string;
      amountOut?: string;
    };
    execution?: {
      routerPath?: string[];
    };
  } | null;

  const message = result?.notice?.message;
  const hint = result?.notice?.hint;
  if (!response.ok || result?.notice?.success === false) {
    throw new Error(
      hint
        ? `${message ?? "Get best route failed"}: ${hint}`
        : (message ?? "Get best route failed"),
    );
  }

  return {
    didFetch: true,
    loading: false,
    executionPath: parseRoutePath(result?.execution?.routerPath),
    displayPath: result?.selectedRoute?.pathTokens,
    amountIn: parseOptionalBigInt(result?.selectedRoute?.amountIn),
    amountOut: parseOptionalBigInt(result?.selectedRoute?.amountOut),
  };
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
              <span className="font-semibold text-gray-900 dark:text-white">
                {token.symbol}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {token.name}
              </span>
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
  initialTradeMode = "swap",
}: {
  hideDetails?: boolean;
  enableModeSwitch?: boolean;
  initialTradeMode?: TradeMode;
}) {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language.startsWith("zh");
  const copy = {
    unsupportedChain: isZh
      ? "当前网络未同步合约地址"
      : "Contracts are not configured for this network",
    unsupportedPair: isZh
      ? "请选择可交易的代币对"
      : "Please select a supported token pair",
    enterAmount: isZh ? "请输入数量" : "Enter an amount",
    invalidAmount: isZh ? "数量格式无效" : "Invalid amount",
    insufficientBalance: isZh ? "余额不足" : "Insufficient balance",
    poolNotCreated: isZh ? "未创建" : "Not created",
    poolEmpty: isZh ? "无流动性" : "No liquidity",
    poolReady: isZh ? "可交易" : "Tradable",
    poolUnavailable: isZh ? "不可用" : "Unavailable",
    poolNotCreatedHint: isZh
      ? "当前交易对还没有创建，所以暂时不能交换。"
      : "This trading pair has not been created yet, so swapping is unavailable.",
    poolNoLiquidityHint: isZh
      ? "当前交易对已存在，但池子里还没有可用流动性。"
      : "This trading pair exists, but there is no available liquidity yet.",
    poolReadyHint: isZh
      ? "当前交易对已就绪，可以直接发起交换。"
      : "This trading pair is ready and can be swapped now.",
    poolUnavailableHint: isZh
      ? "当前网络没有同步好这组合约地址，请先切换到受支持网络。"
      : "Contracts are not configured for this network. Please switch to a supported network.",
    quotePending: isZh ? "等待链上报价中" : "Waiting for live quote",
    quoteError: isZh
      ? "当前无法获取链上报价"
      : "Unable to fetch a live quote right now",
    poolState: isZh ? "池子状态" : "Pool Status",
    approveButton: (symbol: string) =>
      isZh ? `授权 ${symbol}` : `Approve ${symbol}`,
    approving: isZh ? "授权中..." : "Approving...",
    approvalSubmitted: isZh ? "授权已提交" : "Approval submitted",
    approvalConfirmed: isZh ? "授权已确认" : "Approval confirmed",
    swapping: isZh ? "交换中..." : "Swapping...",
    readyToSwap: isZh ? "立即交换" : "Swap Now",
    swapTab: isZh ? "交换" : "Swap",
    limitTab: isZh ? "限价" : "Limit",
    limitTitle: isZh ? "创建限价单" : "Create Limit Order",
    limitTargetRate: isZh ? "目标价格" : "Target price",
    limitExpiry: isZh ? "有效期" : "Expiry",
    limitVsMarket: isZh ? "较市场价" : "Vs market",
    marketPrice: isZh ? "市场" : "Market",
    limitOrderNotice: isZh
      ? "限价单会签名一组链上可验证参数。执行器实际成交时，只能从超过最低购买数量的 surplus 中领取不超过比例上限的奖励。"
      : "Limit orders sign chain-verifiable parameters. At execution, the executor can only take a capped share of surplus above the minimum buy amount.",
    limitOrderSubmit: isZh ? "创建限价单" : "Create Limit Order",
    limitOrderPending: isZh
      ? "请在钱包中确认限价单签名"
      : "Confirm the limit order signature in your wallet",
    limitOrderSigned: isZh ? "限价单已签名" : "Limit order signed",
    limitOrderStored: isZh
      ? "限价单已创建，等待执行器扫描"
      : "Limit order created and waiting for executor scan",
    limitWrapNotice: isZh
      ? "限价单卖出原生币时，会先将对应数量包装为 WETH，再继续授权与下单。"
      : "Selling the native token with a limit order wraps that amount into WETH before approval and order creation.",
    wrapForLimit: isZh ? "先包装为 WETH" : "Wrap to WETH first",
    wrapping: isZh ? "包装中..." : "Wrapping...",
    wrapSubmitted: isZh ? "WETH 包装已提交" : "WETH wrap submitted",
    wrapConfirmed: isZh ? "WETH 包装已确认" : "WETH wrap confirmed",
    liveQuote: isZh ? "链上报价已就绪" : "Live quote ready",
    txSubmitted: isZh ? "交易已提交" : "Transaction submitted",
    txConfirmed: isZh ? "交易已确认" : "Transaction confirmed",
  };

  const settingsLabel = isZh ? "交易设置" : "Trade Settings";
  const slippageLabel = isZh ? "滑点上限" : "Max slippage";
  const deadlineLabel = isZh ? "交换截止时间" : "Swap deadline";
  const autoLabel = isZh ? "自动" : "Auto";
  const slippageTooltip = isZh
    ? "???????????????????????????????????????????????????????"
    : "If the price moves beyond your slippage percentage, the trade will revert. For multi-hop routes, this slippage applies to the overall route result.";
  const deadlineTooltip = isZh
    ? "如果你的交易处于待处理状态超过该时间，则交易将被撤销。（最长时间：30 分钟）。"
    : "If your transaction stays pending longer than this duration, it will be canceled. (Maximum duration: 30 minutes).";
  const mounted = useIsClient();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const {
    writeContractAsync,
    data: hash,
    isPending: isWritePending,
  } = useWriteContract();
  const { signTypedDataAsync, isPending: isSigningLimitOrder } =
    useSignTypedData();
  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash,
    });

  const effectiveChainId = mounted ? chainId : undefined;
  const tokenOptions = getSwapTokenOptions(effectiveChainId);
  const [payTokenSymbol, setPayTokenSymbol] = useState<SwapTokenSymbol>("ETH");
  const [receiveTokenSymbol, setReceiveTokenSymbol] =
    useState<SwapTokenSymbol>("FLUX");
  const [payAmount, setPayAmount] = useState("");
  const [receiveAmountInput, setReceiveAmountInput] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [slippageMode, setSlippageMode] = useState<SwapSlippageMode>("auto");
  const [deadline, setDeadline] = useState("30");
  const [swapSettingsOpen, setSwapSettingsOpen] = useState(false);
  const [openSelector, setOpenSelector] = useState<SelectorTarget>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [lastLimitOrderHash, setLastLimitOrderHash] = useState<string | null>(
    null,
  );
  const [lastLimitOrderSignature, setLastLimitOrderSignature] = useState<
    string | null
  >(null);
  const [lastAction, setLastAction] = useState<ActionKind>(null);
  const [inputMode, setInputMode] = useState<InputMode>("pay");
  const [tradeMode, setTradeMode] = useState<TradeMode>(initialTradeMode);
  const [limitRate, setLimitRate] = useState("");
  const [limitExpiry, setLimitExpiry] = useState("7");
  const [limitPremium, setLimitPremium] = useState("0.0");
  const [limitPricePreset, setLimitPricePreset] =
    useState<LimitPricePreset>("market");
  const [tradeRouteState, setTradeRouteState] = useState<BackendRouteState>({
    didFetch: false,
    loading: false,
  });
  const [rateRouteState, setRateRouteState] = useState<BackendRouteState>({
    didFetch: false,
    loading: false,
  });
  const isLimitMode = enableModeSwitch && tradeMode === "limit";
  const swapWidgetRef = useRef<HTMLDivElement | null>(null);
  const swapSettingsButtonRef = useRef<HTMLDivElement | null>(null);
  const swapSettingsPanelRef = useRef<HTMLDivElement | null>(null);

  const deferredPayAmount = useDeferredValue(payAmount);
  const deferredReceiveAmount = useDeferredValue(receiveAmountInput);
  const supportedChain = isFluxSupportedChain(effectiveChainId);
  const routerAddress = getContractAddress("FluxSwapRouter", effectiveChainId);
  const settlementAddress = getContractAddress(
    "FluxSignedOrderSettlement",
    effectiveChainId,
  );
  const factoryAddress = getContractAddress(
    "FluxSwapFactory",
    effectiveChainId,
  );
  const wrappedNativeAddress = getContractAddress("MockWETH", effectiveChainId);

  const payToken =
    getTokenBySymbol(tokenOptions, payTokenSymbol) ?? tokenOptions[0];
  const receiveToken =
    tokenOptions.find(
      (token) =>
        token.symbol === receiveTokenSymbol &&
        token.symbol !== payToken?.symbol,
    ) ?? tokenOptions.find((token) => token.symbol !== payToken?.symbol);
  const approvalSpenderAddress = isLimitMode
    ? settlementAddress
    : routerAddress;
  const approvalTokenAddress =
    payToken?.kind === "erc20"
      ? payToken.address
      : isLimitMode
        ? wrappedNativeAddress
        : undefined;
  const approvalTokenSymbol =
    payToken?.kind === "erc20"
      ? payToken.symbol
      : isLimitMode
        ? "WETH"
        : payToken?.symbol;
  const approvalTokenDecimals =
    payToken?.kind === "erc20"
      ? payToken.decimals
      : isLimitMode
        ? 18
        : (payToken?.decimals ?? 18);
  const payBalanceTokenAddress =
    payToken?.kind === "erc20"
      ? payToken.address
      : isLimitMode
        ? wrappedNativeAddress
        : undefined;

  const parsedPayAmount = parseAmount(
    deferredPayAmount,
    payToken?.decimals ?? 18,
  );
  const parsedReceiveAmount = parseAmount(
    deferredReceiveAmount,
    receiveToken?.decimals ?? 18,
  );
  const payBackendTokenAddress = getBackendRequestTokenAddress(payToken);
  const receiveBackendTokenAddress =
    getBackendRequestTokenAddress(receiveToken);
  const directPath =
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
    token: payBalanceTokenAddress,
    query: {
      enabled: mounted && isConnected && !!address && !!payToken,
      refetchInterval: 8000,
    },
  });

  const { data: receiveBalanceData } = useBalance({
    address,
    chainId,
    token: receiveToken?.kind === "erc20" ? receiveToken.address : undefined,
    query: {
      enabled: mounted && isConnected && !!address && !!receiveToken,
      refetchInterval: 8000,
    },
  });
  const { data: nativeBalanceData } = useBalance({
    address,
    chainId,
    query: {
      enabled: mounted && isConnected && !!address,
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
        !!payToken &&
        !!receiveToken &&
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

  const hasQuoteInput =
    inputMode === "pay"
      ? Boolean(parsedPayAmount && parsedPayAmount > BigInt(0))
      : Boolean(parsedReceiveAmount && parsedReceiveAmount > BigInt(0));
  const rateQuoteAmountIn = payToken
    ? BigInt(10) ** BigInt(payToken.decimals)
    : undefined;

  useEffect(() => {
    if (
      !supportedChain ||
      !effectiveChainId ||
      !payBackendTokenAddress ||
      !receiveBackendTokenAddress ||
      (inputMode === "pay"
        ? !parsedPayAmount || parsedPayAmount <= BigInt(0)
        : !parsedReceiveAmount || parsedReceiveAmount <= BigInt(0)) ||
      isLimitMode
    ) {
      setTradeRouteState({
        didFetch: false,
        loading: false,
      });
      return;
    }

    let cancelled = false;
    const tradeQuoteAmount =
      inputMode === "pay" ? parsedPayAmount : parsedReceiveAmount;
    if (tradeQuoteAmount === undefined) {
      setTradeRouteState({
        didFetch: false,
        loading: false,
      });
      return;
    }
    setTradeRouteState({
      didFetch: false,
      loading: true,
    });

    fetchBestRoute({
      chainId: effectiveChainId,
      tokenIn: payBackendTokenAddress,
      tokenOut: receiveBackendTokenAddress,
      amount: tradeQuoteAmount,
      quoteType:
        inputMode === "pay"
          ? "ROUTE_QUOTE_TYPE_EXACT_INPUT"
          : "ROUTE_QUOTE_TYPE_EXACT_OUTPUT",
      maxHops: 1,
    })
      .then((nextState) => {
        if (!cancelled) {
          setTradeRouteState(nextState);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setTradeRouteState({
            didFetch: true,
            loading: false,
            error:
              error instanceof Error ? error.message : "Get best route failed",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    effectiveChainId,
    inputMode,
    isLimitMode,
    parsedPayAmount,
    parsedReceiveAmount,
    payBackendTokenAddress,
    receiveBackendTokenAddress,
    supportedChain,
  ]);

  useEffect(() => {
    if (
      !supportedChain ||
      !effectiveChainId ||
      !payBackendTokenAddress ||
      !receiveBackendTokenAddress ||
      !rateQuoteAmountIn ||
      rateQuoteAmountIn <= BigInt(0) ||
      isLimitMode
    ) {
      setRateRouteState({
        didFetch: false,
        loading: false,
      });
      return;
    }

    let cancelled = false;
    setRateRouteState({
      didFetch: false,
      loading: true,
    });

    fetchBestRoute({
      chainId: effectiveChainId,
      tokenIn: payBackendTokenAddress,
      tokenOut: receiveBackendTokenAddress,
      amount: rateQuoteAmountIn,
      quoteType: "ROUTE_QUOTE_TYPE_EXACT_INPUT",
      maxHops: 1,
    })
      .then((nextState) => {
        if (!cancelled) {
          setRateRouteState(nextState);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setRateRouteState({
            didFetch: true,
            loading: false,
            error:
              error instanceof Error ? error.message : "Get best route failed",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    effectiveChainId,
    isLimitMode,
    payBackendTokenAddress,
    rateQuoteAmountIn,
    receiveBackendTokenAddress,
    supportedChain,
  ]);

  const selectedExecutionPath = tradeRouteState.executionPath;
  const selectedDisplayPath = tradeRouteState.displayPath;
  const quotedAmountOut = tradeRouteState.amountOut;
  const quotedAmountIn = tradeRouteState.amountIn;
  const quotedRateOut = rateRouteState.amountOut;
  const hasAvailableSwapRoute = Boolean(
    rateRouteState.executionPath && quotedRateOut && quotedRateOut > BigInt(0),
  );
  const displayedRoutePath =
    selectedExecutionPath ?? rateRouteState.executionPath ?? directPath;
  const displayedRouteTokens =
    selectedDisplayPath ?? rateRouteState.displayPath ?? displayedRoutePath;
  const canUseDirectReserveData =
    displayedRoutePath.length === 2 &&
    areAddressesEqual(displayedRoutePath[0], directPath[0]) &&
    areAddressesEqual(displayedRoutePath[1], directPath[1]);
  const isQuoteLoading = hasQuoteInput && tradeRouteState.loading;
  const hasQuoteError =
    hasQuoteInput &&
    !isQuoteLoading &&
    Boolean(
      tradeRouteState.error ||
      (tradeRouteState.didFetch &&
        (!tradeRouteState.amountIn || !tradeRouteState.amountOut)),
    );
  const executableRoutePath =
    selectedExecutionPath ?? rateRouteState.executionPath;
  const noRouteLabel = isZh ? "暂无可用路径" : "No route";
  const { data: allowance } = useReadFluxTokenAllowance({
    address: approvalTokenAddress ?? zeroAddress,
    chainId,
    args: [address ?? zeroAddress, approvalSpenderAddress ?? zeroAddress],
    query: {
      enabled:
        mounted &&
        isConnected &&
        !!address &&
        !!approvalSpenderAddress &&
        !!approvalTokenAddress,
      refetchInterval: 8000,
    },
  });
  const limitMarketRateDisplay =
    receiveToken && quotedRateOut
      ? formatBigIntAmount(quotedRateOut, receiveToken.decimals, 8)
      : "";
  const limitTargetRateDisplay =
    payToken && receiveToken
      ? limitRate
        ? `1 ${payToken.symbol} = ${limitRate} ${receiveToken.symbol}`
        : `1 ${payToken.symbol} = -- ${receiveToken.symbol}`
      : "--";
  const payTokenIsToken0 =
    Boolean(token0 && payToken) &&
    token0?.toLowerCase() === payToken?.routeAddress.toLowerCase();
  const payReserve =
    canUseDirectReserveData && reservesData && payToken && receiveToken
      ? payTokenIsToken0
        ? reservesData[0]
        : reservesData[1]
      : undefined;
  const receiveReserve =
    canUseDirectReserveData && reservesData && payToken && receiveToken
      ? payTokenIsToken0
        ? reservesData[1]
        : reservesData[0]
      : undefined;
  const maxPayAmountDisplay =
    payReserve !== undefined && payToken
      ? formatBigIntAmount(
          payReserve,
          payToken.decimals,
          Math.min(payToken.decimals, 8),
        )
      : undefined;
  const maxReceiveAmountDisplay =
    receiveReserve !== undefined && receiveToken
      ? formatBigIntAmount(
          receiveReserve > BigInt(0) ? receiveReserve - BigInt(1) : BigInt(0),
          receiveToken.decimals,
          Math.min(receiveToken.decimals, 8),
        )
      : undefined;
  const limitRateNumeric = Number(limitRate);
  const payAmountNumeric = Number(payAmount);
  const limitReceiveAmount =
    isLimitMode &&
    limitRate !== "" &&
    payAmount !== "" &&
    Number.isFinite(limitRateNumeric) &&
    limitRateNumeric >= 0 &&
    Number.isFinite(payAmountNumeric) &&
    payAmountNumeric >= 0 &&
    receiveToken
      ? formatDisplayAmount(
          String(payAmountNumeric * limitRateNumeric),
          Math.min(receiveToken.decimals, 8),
        )
      : "";
  const payBalanceDisplay = payBalanceData?.formatted
    ? formatDisplayAmount(payBalanceData.formatted)
    : "0.00";
  const receiveBalanceDisplay = receiveBalanceData?.formatted
    ? formatDisplayAmount(receiveBalanceData.formatted)
    : "0.00";
  const receiveAmount = isLimitMode
    ? limitReceiveAmount
    : inputMode === "receive"
      ? receiveAmountInput
      : formatBigIntAmount(quotedAmountOut, receiveToken?.decimals ?? 18);
  const parsedLimitReceiveAmount =
    isLimitMode && receiveToken
      ? parseAmount(limitReceiveAmount, receiveToken.decimals)
      : undefined;
  const payAmountDisplay =
    inputMode === "pay"
      ? payAmount
      : formatBigIntAmount(quotedAmountIn, payToken?.decimals ?? 18);
  const hasSwapInputValue =
    inputMode === "pay"
      ? payAmount.trim() !== ""
      : receiveAmountInput.trim() !== "";
  const insufficientBalance = Boolean(
    quotedAmountIn &&
    payBalanceData?.value !== undefined &&
    quotedAmountIn > payBalanceData.value,
  );
  const needsWrapForLimit = Boolean(
    isLimitMode &&
    payToken?.kind === "native" &&
    parsedPayAmount &&
    parsedPayAmount > BigInt(0) &&
    wrappedNativeAddress &&
    nativeBalanceData?.value !== undefined &&
    payBalanceData?.value !== undefined &&
    parsedPayAmount > payBalanceData.value &&
    parsedPayAmount <= nativeBalanceData.value,
  );

  const needsApproval = Boolean(
    approvalTokenAddress &&
    quotedAmountIn &&
    allowance !== undefined &&
    quotedAmountIn > allowance,
  );

  const midPrice =
    quotedRateOut !== undefined && quotedRateOut > BigInt(0) && receiveToken
      ? Number(quotedRateOut) / 10 ** receiveToken.decimals
      : undefined;
  const executionPrice =
    quotedAmountIn !== undefined &&
    quotedAmountOut !== undefined &&
    quotedAmountIn > BigInt(0) &&
    quotedAmountOut > BigInt(0) &&
    payToken &&
    receiveToken
      ? Number(quotedAmountOut) /
        10 ** receiveToken.decimals /
        (Number(quotedAmountIn) / 10 ** payToken.decimals)
      : undefined;
  const priceImpactPercent =
    midPrice !== undefined &&
    executionPrice !== undefined &&
    Number.isFinite(midPrice) &&
    Number.isFinite(executionPrice) &&
    midPrice > 0 &&
    executionPrice > 0
      ? Math.max(0, ((midPrice - executionPrice) / midPrice) * 100)
      : undefined;
  const autoSlippagePercent =
    priceImpactPercent !== undefined
      ? clamp(priceImpactPercent * 1.5 + 0.2, 0.5, 5)
      : 0.5;
  const normalizedCustomSlippage = normalizeCustomSlippage(slippage);
  const effectiveSlippage =
    slippageMode === "auto"
      ? autoSlippagePercent.toFixed(1)
      : normalizedCustomSlippage;
  const slippageBps = parsePercentToBps(effectiveSlippage);
  const autoSlippageDisplay = `${formatDisplayAmount(autoSlippagePercent.toFixed(1), 1)}%`;
  const customSlippageDisplay = `${normalizedCustomSlippage}%`;
  const amountOutMin =
    quotedAmountOut !== undefined
      ? (quotedAmountOut * (BigInt(10000) - slippageBps)) / BigInt(10000)
      : undefined;
  const amountInMax =
    quotedAmountIn !== undefined
      ? (quotedAmountIn * (BigInt(10000) + slippageBps)) / BigInt(10000)
      : undefined;
  const isSubmitting = isWritePending || isConfirming || isSigningLimitOrder;
  const localGasOverride = getLocalGasOverride(chainId);
  const limitExpirySeconds = BigInt(
    Math.max(1, Number.parseInt(limitExpiry, 10) || 7) * 24 * 60 * 60,
  );

  useEffect(() => {
    if (!isConfirmed || lastAction !== "swap") {
      return;
    }

    setPayAmount("");
    setReceiveAmountInput("");
    setTxError(null);
  }, [isConfirmed, lastAction]);

  useEffect(() => {
    if (!isLimitMode) {
      return;
    }

    if (limitPricePreset === "custom") {
      return;
    }

    if (!limitMarketRateDisplay) {
      setLimitRate("");
      return;
    }

    if (limitPricePreset === "market") {
      setLimitPremium("0.0");
      setLimitRate(limitMarketRateDisplay);
      return;
    }

    const market = Number(limitMarketRateDisplay);
    const premium = Number(limitPricePreset);

    if (!Number.isFinite(market) || !Number.isFinite(premium)) {
      setLimitPremium("0.0");
      setLimitRate(limitMarketRateDisplay);
      return;
    }

    setLimitPremium(limitPricePreset);
    const nextRate = market * (1 + premium / 100);
    setLimitRate(nextRate.toFixed(8).replace(/\.?0+$/, ""));
  }, [isLimitMode, limitMarketRateDisplay, limitPricePreset]);

  useEffect(() => {
    if (!swapSettingsOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;

      if (swapSettingsButtonRef.current?.contains(target)) {
        return;
      }

      if (swapSettingsPanelRef.current?.contains(target)) {
        return;
      }

      setSwapSettingsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSwapSettingsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [swapSettingsOpen]);

  let actionLabel = copy.readyToSwap;
  let actionDisabled = false;
  let actionKind: ActionKind = "swap";
  const statusLabel =
    lastAction === "approve" || lastAction === "revoke"
      ? isConfirmed
        ? copy.approvalConfirmed
        : copy.approvalSubmitted
      : isConfirmed
        ? copy.txConfirmed
        : copy.txSubmitted;

  if (isLimitMode) {
    actionLabel = isSigningLimitOrder
      ? copy.limitOrderPending
      : copy.limitOrderSubmit;
    actionKind = "limit";

    if (!mounted || !isConnected) {
      actionLabel = t("swap.connectWallet");
      actionKind = null;
    } else if (!supportedChain || !settlementAddress || !factoryAddress) {
      actionLabel = copy.unsupportedChain;
      actionDisabled = true;
      actionKind = null;
    } else if (!payToken || !receiveToken) {
      actionLabel = copy.unsupportedPair;
      actionDisabled = true;
      actionKind = null;
    } else if (!payAmount || !limitRate) {
      actionLabel = copy.enterAmount;
      actionDisabled = true;
      actionKind = null;
    } else if (
      !parsedPayAmount ||
      parsedPayAmount <= BigInt(0) ||
      !parsedLimitReceiveAmount ||
      calculateTriggerPriceX18(
        parsedPayAmount,
        parsedLimitReceiveAmount,
        payToken.decimals,
        receiveToken.decimals,
      ) <= BigInt(0)
    ) {
      actionLabel = copy.invalidAmount;
      actionDisabled = true;
      actionKind = null;
    } else if (needsWrapForLimit) {
      actionLabel = copy.wrapForLimit;
      actionKind = "wrap";
    } else if (insufficientBalance) {
      actionLabel = copy.insufficientBalance;
      actionDisabled = true;
      actionKind = null;
    } else if (!hasAvailableSwapRoute) {
      actionLabel = noRouteLabel;
      actionDisabled = true;
      actionKind = null;
    } else if (isSubmitting) {
      actionDisabled = true;
      actionKind = null;
    } else if (needsApproval) {
      actionLabel = copy.approveButton(approvalTokenSymbol ?? payToken.symbol);
      actionKind = "approve";
    }
  } else if (!mounted || !isConnected) {
    actionLabel = t("swap.connectWallet");
    actionKind = null;
  } else if (!supportedChain || !routerAddress || !factoryAddress) {
    actionLabel = copy.unsupportedChain;
    actionDisabled = true;
    actionKind = null;
  } else if (!payToken || !receiveToken) {
    actionLabel = copy.unsupportedPair;
    actionDisabled = true;
    actionKind = null;
  } else if (!hasSwapInputValue) {
    actionLabel = copy.enterAmount;
    actionDisabled = true;
    actionKind = null;
  } else if (
    (inputMode === "pay" &&
      (!parsedPayAmount || parsedPayAmount <= BigInt(0))) ||
    (inputMode === "receive" &&
      (!parsedReceiveAmount || parsedReceiveAmount <= BigInt(0)))
  ) {
    actionLabel = copy.invalidAmount;
    actionDisabled = true;
    actionKind = null;
  } else if (needsWrapForLimit) {
    actionLabel = copy.wrapForLimit;
    actionKind = "wrap";
  } else if (insufficientBalance) {
    actionLabel = copy.insufficientBalance;
    actionDisabled = true;
    actionKind = null;
  } else if (!hasAvailableSwapRoute) {
    actionLabel = noRouteLabel;
    actionDisabled = true;
    actionKind = null;
  } else if (
    !quotedAmountOut ||
    quotedAmountOut <= BigInt(0) ||
    !quotedAmountIn ||
    quotedAmountIn <= BigInt(0)
  ) {
    actionLabel = hasQuoteError ? copy.quoteError : copy.quotePending;
    actionDisabled = true;
    actionKind = null;
  } else if (isSubmitting) {
    actionLabel =
      lastAction === "approve" || lastAction === "revoke"
        ? copy.approving
        : lastAction === "wrap"
          ? copy.wrapping
          : lastAction === "limit"
            ? copy.limitOrderPending
            : copy.swapping;
    actionDisabled = true;
    actionKind = null;
  } else if (needsApproval) {
    actionLabel = copy.approveButton(approvalTokenSymbol ?? payToken.symbol);
    actionKind = "approve";
  }

  const handlePayAmountChange = (value: string) => {
    if (!DECIMAL_INPUT_REGEX.test(value)) {
      return;
    }

    const normalizedValue =
      value !== "" &&
      parsedPayAmount !== undefined &&
      payReserve !== undefined &&
      parsedPayAmount > payReserve
        ? (maxPayAmountDisplay ?? value)
        : value;

    setInputMode("pay");
    setPayAmount(normalizedValue);
    setLastLimitOrderHash(null);
    setLastLimitOrderSignature(null);
    if (normalizedValue === "") {
      setReceiveAmountInput("");
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
      value !== "" &&
      normalizedParsedReceiveAmount !== undefined &&
      maxReceivable !== undefined &&
      normalizedParsedReceiveAmount > maxReceivable
        ? (maxReceiveAmountDisplay ?? value)
        : value;

    setInputMode("receive");
    setReceiveAmountInput(normalizedValue);
    setLastLimitOrderHash(null);
    setLastLimitOrderSignature(null);
    if (normalizedValue === "") {
      setPayAmount("");
    }
  };

  const adjustLimitPremium = (delta: number) => {
    const current = Number(limitPremium || "0");
    const safeCurrent = Number.isFinite(current) && current >= 0 ? current : 0;
    const nextValue = Math.max(
      0,
      Math.min(50, Math.round((safeCurrent + delta) * 10) / 10),
    );

    const nextPremium = nextValue.toFixed(1);
    setLimitPremium(nextPremium);
    setLimitPricePreset("custom");
    setLastLimitOrderHash(null);
    setLastLimitOrderSignature(null);

    if (!limitMarketRateDisplay) {
      setLimitRate("");
      return;
    }

    const market = Number(limitMarketRateDisplay);
    if (!Number.isFinite(market)) {
      setLimitRate(limitMarketRateDisplay);
      return;
    }

    const nextRate = market * (1 + nextValue / 100);
    setLimitRate(nextRate.toFixed(8).replace(/\.?0+$/, ""));
  };

  const updateSwapSlippage = (nextValue: string) => {
    if (nextValue === "" || DECIMAL_INPUT_REGEX.test(nextValue)) {
      setSlippageMode("custom");
      setSlippage(nextValue);
    }
  };

  const activateCustomSlippage = () => {
    setSlippageMode("custom");
    setSlippage((current) => normalizeCustomSlippage(current));
  };

  const commitCustomSlippage = () => {
    setSlippage((current) => normalizeCustomSlippage(current));
  };

  const updateSwapDeadline = (nextValue: string) => {
    if (nextValue === "") {
      setDeadline("");
      return;
    }

    if (!/^\d+$/.test(nextValue)) {
      return;
    }

    const normalized = Math.min(
      30,
      Math.max(0, Number.parseInt(nextValue, 10) || 0),
    );
    setDeadline(String(normalized));
  };

  const adjustSwapDeadline = (delta: number) => {
    const current = Number.parseInt(deadline || "30", 10);
    const safeCurrent = Number.isFinite(current) ? current : 30;
    const nextValue = Math.min(30, Math.max(0, safeCurrent + delta));
    setDeadline(String(nextValue));
  };

  const applyLimitPreset = (preset: Exclude<LimitPricePreset, "custom">) => {
    setLimitPricePreset(preset);
    setLastLimitOrderHash(null);
    setLastLimitOrderSignature(null);

    if (!limitMarketRateDisplay) {
      setLimitPremium("0.0");
      setLimitRate("");
      return;
    }

    if (preset === "market") {
      setLimitPremium("0.0");
      setLimitRate(limitMarketRateDisplay);
      return;
    }

    const market = Number(limitMarketRateDisplay);
    const premium = Number(preset);

    if (!Number.isFinite(market) || !Number.isFinite(premium)) {
      setLimitPremium("0.0");
      setLimitRate(limitMarketRateDisplay);
      return;
    }

    setLimitPremium(preset);
    const nextRate = market * (1 + premium / 100);
    setLimitRate(nextRate.toFixed(8).replace(/\.?0+$/, ""));
  };

  const handleSelectToken = (
    target: Exclude<SelectorTarget, null>,
    token: SwapTokenOption,
  ) => {
    if (target === "pay") {
      setPayTokenSymbol(token.symbol);
      if (receiveToken?.symbol === token.symbol) {
        setReceiveTokenSymbol(payToken?.symbol ?? receiveTokenSymbol);
      }
      setPayAmount("");
      setReceiveAmountInput("");
      setInputMode("pay");
      setLastLimitOrderHash(null);
      setLastLimitOrderSignature(null);
      return;
    }

    setReceiveTokenSymbol(token.symbol);
    if (payToken?.symbol === token.symbol) {
      setPayTokenSymbol(receiveToken?.symbol ?? payTokenSymbol);
    }
    setPayAmount("");
    setReceiveAmountInput("");
    setInputMode("pay");
    setLastLimitOrderHash(null);
    setLastLimitOrderSignature(null);
  };

  const handleFlip = () => {
    if (!payToken || !receiveToken) {
      return;
    }

    setPayTokenSymbol(receiveToken.symbol);
    setReceiveTokenSymbol(payToken.symbol);
    setPayAmount("");
    setReceiveAmountInput("");
    setInputMode("pay");
    setLimitRate("");
    setLimitPremium("0.0");
    setLimitPricePreset("market");
    setLastLimitOrderHash(null);
    setLastLimitOrderSignature(null);
  };

  const handleMaxPay = () => {
    if (!payBalanceData?.formatted) {
      return;
    }

    setInputMode("pay");
    setPayAmount(payBalanceData.formatted);
  };

  const handleAction = async () => {
    if (!mounted || !isConnected) {
      openConnectModal?.();
      return;
    }

    if (!actionKind || !address || !payToken || !receiveToken) {
      return;
    }

    setTxError(null);
    setLastAction(actionKind);

    try {
      if (actionKind === "wrap") {
        if (
          !wrappedNativeAddress ||
          !parsedPayAmount ||
          parsedPayAmount <= BigInt(0)
        ) {
          return;
        }

        await writeContractAsync({
          address: wrappedNativeAddress,
          abi: parseAbi(["function deposit() payable"]),
          functionName: "deposit",
          value: parsedPayAmount,
          chainId,
          ...localGasOverride,
        });
        return;
      }

      if (actionKind === "approve") {
        const spender = isLimitMode ? settlementAddress : routerAddress;
        if (!approvalTokenAddress || !spender) {
          return;
        }

        await writeContractAsync({
          address: approvalTokenAddress,
          abi: fluxTokenAbi,
          functionName: "approve",
          args: [spender, maxUint256],
          chainId,
          ...localGasOverride,
        });
        return;
      }

      if (actionKind === "limit") {
        if (
          !settlementAddress ||
          !publicClient ||
          !parsedPayAmount ||
          !receiveToken
        ) {
          return;
        }

        const minAmountOut = parsedLimitReceiveAmount;
        if (!minAmountOut || minAmountOut <= BigInt(0)) {
          setTxError(copy.invalidAmount);
          return;
        }

        const latestBlock = await publicClient.getBlock();
        const nonceSeed = new Uint32Array(2);
        globalThis.crypto.getRandomValues(nonceSeed);
        const nonce =
          (BigInt(nonceSeed[0]) << BigInt(32)) + BigInt(nonceSeed[1]);
        const expiry = latestBlock.timestamp + limitExpirySeconds;
        const order: SignedLimitOrder = {
          maker: address,
          inputToken:
            payToken.kind === "native"
              ? (wrappedNativeAddress ?? zeroAddress)
              : toSignedLimitOrderTokenAddress(payToken.address, false),
          outputToken: toSignedLimitOrderTokenAddress(
            receiveToken.address,
            receiveToken.kind === "native",
          ),
          amountIn: parsedPayAmount,
          minAmountOut,
          maxExecutorRewardBps: LIMIT_ORDER_DEFAULT_MAX_EXECUTOR_REWARD_BPS,
          triggerPriceX18: calculateTriggerPriceX18(
            parsedPayAmount,
            minAmountOut,
            payToken.decimals,
            receiveToken.decimals,
          ),
          expiry,
          nonce,
          recipient: address,
        };

        const typedData = buildSignedLimitOrderTypedData(
          chainId,
          settlementAddress,
          order,
        );
        const signature = await signTypedDataAsync(typedData);
        const orderHash = hashSignedLimitOrder(
          chainId,
          settlementAddress,
          order,
        );
        const createOrderResponse = await fetch("/api/orders", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            chainId,
            settlementAddress,
            orderHash,
            maker: order.maker,
            inputToken: order.inputToken,
            outputToken: order.outputToken,
            amountIn: order.amountIn.toString(),
            minAmountOut: order.minAmountOut.toString(),
            maxExecutorRewardBps: order.maxExecutorRewardBps.toString(),
            triggerPriceX18: order.triggerPriceX18.toString(),
            expiry: order.expiry.toString(),
            nonce: order.nonce.toString(),
            recipient: order.recipient,
            signature,
            source: "frontend",
          }),
        });
        const createOrderResult = (await createOrderResponse
          .json()
          .catch(() => null)) as {
          notice?: {
            success?: boolean;
            message?: string;
            hint?: string;
          };
        } | null;

        if (
          !createOrderResponse.ok ||
          createOrderResult?.notice?.success === false
        ) {
          const message =
            createOrderResult?.notice?.message ??
            (isZh ? "限价单创建失败" : "Create limit order failed");
          const hint = createOrderResult?.notice?.hint;

          throw new Error(hint ? `${message}: ${hint}` : message);
        }

        setLastLimitOrderHash(orderHash);
        setLastLimitOrderSignature(signature);
        setTxError(null);
        return;
      }

      if (
        !routerAddress ||
        !quotedAmountIn ||
        !quotedAmountOut ||
        !executableRoutePath
      ) {
        return;
      }

      if (!publicClient) {
        throw new Error("Unable to read the latest block timestamp.");
      }

      const transactionDeadline =
        (await publicClient.getBlock()).timestamp +
        BigInt(Math.max(1, Number.parseInt(deadline || "30", 10) || 30) * 60);

      if (payToken.kind === "native" && inputMode === "pay") {
        if (amountOutMin === undefined) {
          return;
        }

        await writeContractAsync({
          address: routerAddress,
          abi: fluxSwapRouterAbi,
          functionName: "swapExactETHForTokens",
          args: [
            amountOutMin,
            executableRoutePath,
            address,
            transactionDeadline,
          ],
          value: quotedAmountIn,
          chainId,
          ...localGasOverride,
        });
        return;
      }

      if (payToken.kind === "native" && inputMode === "receive") {
        if (amountInMax === undefined || parsedReceiveAmount === undefined) {
          return;
        }

        await writeContractAsync({
          address: routerAddress,
          abi: fluxSwapRouterAbi,
          functionName: "swapETHForExactTokens",
          args: [
            parsedReceiveAmount,
            executableRoutePath,
            address,
            transactionDeadline,
          ],
          value: amountInMax,
          chainId,
          ...localGasOverride,
        });
        return;
      }

      if (
        payToken.kind !== "native" &&
        receiveToken.kind === "native" &&
        inputMode === "receive"
      ) {
        if (amountInMax === undefined || parsedReceiveAmount === undefined) {
          return;
        }

        await writeContractAsync({
          address: routerAddress,
          abi: fluxSwapRouterAbi,
          functionName: "swapTokensForExactETH",
          args: [
            parsedReceiveAmount,
            amountInMax,
            executableRoutePath,
            address,
            transactionDeadline,
          ],
          chainId,
          ...localGasOverride,
        });
        return;
      }

      if (payToken.kind !== "native" && receiveToken.kind === "native") {
        if (amountOutMin === undefined) {
          return;
        }

        await writeContractAsync({
          address: routerAddress,
          abi: fluxSwapRouterAbi,
          functionName: "swapExactTokensForETH",
          args: [
            quotedAmountIn,
            amountOutMin,
            executableRoutePath,
            address,
            transactionDeadline,
          ],
          chainId,
          ...localGasOverride,
        });
        return;
      }

      if (inputMode === "receive") {
        if (amountInMax === undefined || parsedReceiveAmount === undefined) {
          return;
        }

        await writeContractAsync({
          address: routerAddress,
          abi: fluxSwapRouterAbi,
          functionName: "swapTokensForExactTokens",
          args: [
            parsedReceiveAmount,
            amountInMax,
            executableRoutePath,
            address,
            transactionDeadline,
          ],
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
        functionName: "swapExactTokensForTokens",
        args: [
          quotedAmountIn,
          amountOutMin,
          executableRoutePath,
          address,
          transactionDeadline,
        ],
        chainId,
        ...localGasOverride,
      });
    } catch (error) {
      setTxError(
        formatErrorMessage(error, {
          rejectedMessage:
            actionKind === "approve"
              ? "你已取消本次授权"
              : actionKind === "limit"
                ? "你已取消本次限价单签名"
                : "你已取消本次交易",
        }),
      );
    }
  };

  const actionButton =
    !mounted || !isConnected ? (
      <ActionButton
        label={t("swap.connectWallet")}
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

  const swapSettingsPanel =
    !hideDetails && !isLimitMode && swapSettingsOpen ? (
      <div
        ref={swapSettingsPanelRef}
        className="absolute right-0 top-[calc(100%+0.75rem)] z-30 w-[min(420px,calc(100vw-2rem))] overflow-visible rounded-[1.5rem] border border-gray-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.16)] dark:border-gray-700 dark:bg-gray-900/95"
      >
        <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <div className="text-sm font-semibold text-gray-900 dark:text-white">
            {settingsLabel}
          </div>
        </div>

        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="flex items-center gap-2 text-gray-900 dark:text-white">
              <span className="text-base font-medium">{slippageLabel}</span>
              <div className="group relative">
                <Info size={15} className="text-gray-400" />
                <div className="pointer-events-none absolute left-1/2 top-[calc(100%+0.75rem)] z-50 w-[280px] -translate-x-1/2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm leading-6 text-gray-600 opacity-0 shadow-[0_18px_40px_rgba(15,23,42,0.12)] transition-opacity duration-150 group-hover:opacity-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                  {slippageTooltip}
                </div>
              </div>
            </div>
            <div className="flex items-center rounded-full border border-gray-200 bg-white px-2 py-1 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <button
                type="button"
                onClick={() => setSlippageMode("auto")}
                className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                  slippageMode === "auto"
                    ? "bg-pink-100 text-pink-600 dark:bg-pink-500/15 dark:text-pink-300"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
              >
                {autoLabel}
              </button>
              <div className="ml-2 flex items-center gap-2">
                {slippageMode === "custom" && (
                  <input
                    type="text"
                    inputMode="decimal"
                    value={slippage}
                    onChange={(event) => updateSwapSlippage(event.target.value)}
                    onBlur={commitCustomSlippage}
                    className="w-14 bg-transparent text-right text-sm font-semibold text-gray-900 outline-none dark:text-white"
                    placeholder={MIN_CUSTOM_SLIPPAGE}
                    autoFocus
                  />
                )}
                {slippageMode === "auto" ? (
                  <button
                    type="button"
                    onClick={activateCustomSlippage}
                    className="min-w-[56px] text-right text-sm font-semibold text-gray-900 transition-colors hover:text-sky-600 dark:text-white dark:hover:text-sky-300"
                  >
                    {autoSlippageDisplay}
                  </button>
                ) : (
                  <span className="min-w-[16px] text-right text-sm font-semibold text-gray-900 dark:text-white">
                    %
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="flex items-center gap-2 text-gray-900 dark:text-white">
              <span className="text-base font-medium">{deadlineLabel}</span>
              <div className="group relative">
                <Info size={15} className="text-gray-400" />
                <div className="pointer-events-none absolute left-1/2 top-[calc(100%+0.75rem)] z-50 w-[280px] -translate-x-1/2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm leading-6 text-gray-600 opacity-0 shadow-[0_18px_40px_rgba(15,23,42,0.12)] transition-opacity duration-150 group-hover:opacity-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                  {deadlineTooltip}
                </div>
              </div>
            </div>
            <div className="flex items-center rounded-full border border-gray-200 bg-white px-3 py-1.5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <input
                type="text"
                inputMode="numeric"
                value={deadline}
                onChange={(event) => updateSwapDeadline(event.target.value)}
                className="w-8 bg-transparent text-right text-sm font-semibold text-gray-900 outline-none dark:text-white"
                placeholder="30"
              />
              <span className="ml-1 text-sm font-medium text-gray-600 dark:text-gray-300">
                {isZh ? "分钟" : "minutes"}
              </span>
              <div className="ml-2 flex w-5 shrink-0 flex-col overflow-hidden rounded-md border border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => adjustSwapDeadline(1)}
                  className="flex h-4 w-full items-center justify-center bg-gray-50 text-gray-500 transition-colors hover:bg-sky-100 hover:text-sky-600 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-sky-500/20 dark:hover:text-sky-300"
                >
                  <ChevronUp size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => adjustSwapDeadline(-1)}
                  className="flex h-4 w-full items-center justify-center border-t border-gray-200 bg-gray-50 text-gray-500 transition-colors hover:bg-sky-100 hover:text-sky-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-sky-500/20 dark:hover:text-sky-300"
                >
                  <ChevronDown size={12} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    ) : null;

  const modeSwitchControls = enableModeSwitch ? (
    <div className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100/90 p-1 shadow-sm dark:border-gray-700 dark:bg-gray-900/80">
      <button
        onClick={() => setTradeMode("swap")}
        className={`rounded-full px-5 py-2 text-sm font-semibold transition-all duration-200 ${
          tradeMode === "swap"
            ? "bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-white"
            : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
        }`}
      >
        {copy.swapTab}
      </button>
      <button
        onClick={() => setTradeMode("limit")}
        className={`rounded-full px-5 py-2 text-sm font-semibold transition-all duration-200 ${
          tradeMode === "limit"
            ? "bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-white"
            : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
        }`}
      >
        {copy.limitTab}
      </button>
    </div>
  ) : null;

  return (
    <div ref={swapWidgetRef} className="relative mx-auto w-full max-w-[540px]">
      <div className="relative overflow-hidden rounded-[2rem] border border-gray-200 bg-white p-4 shadow-2xl dark:border-gray-700 dark:bg-gray-800">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(59,130,246,0.18),_transparent_38%),radial-gradient(circle_at_bottom_left,_rgba(16,185,129,0.12),_transparent_35%)]" />

        <div className="relative">
          <div>
            {(enableModeSwitch || (!hideDetails && !isLimitMode)) && (
              <div className="mb-4 flex items-center justify-between px-2">
                <div>{modeSwitchControls}</div>
                <div
                  ref={swapSettingsButtonRef}
                  className="relative flex items-center gap-2"
                >
                  {!hideDetails &&
                    !isLimitMode &&
                    slippageMode === "custom" && (
                      <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
                        {customSlippageDisplay}
                      </span>
                    )}
                  {!hideDetails && !isLimitMode && (
                    <button
                      type="button"
                      onClick={() => setSwapSettingsOpen((current) => !current)}
                      className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border bg-white transition-all dark:bg-gray-900 ${
                        swapSettingsOpen
                          ? "border-sky-300 bg-sky-100 text-sky-700 shadow-sm dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-300"
                          : "border-gray-200 text-gray-500 hover:border-sky-300 hover:text-sky-600 dark:border-gray-700 dark:text-gray-400 dark:hover:border-sky-500/40 dark:hover:text-sky-300"
                      }`}
                      aria-label={settingsLabel}
                    >
                      <Settings2 size={16} />
                    </button>
                  )}
                  {swapSettingsPanel}
                </div>
              </div>
            )}

            <div className="rounded-3xl border border-transparent bg-gray-100 p-4 transition-colors hover:border-gray-300 dark:bg-gray-900 dark:hover:border-gray-700">
              <div className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                {t("swap.pay")}
              </div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.0"
                  value={payAmountDisplay}
                  onChange={(event) =>
                    handlePayAmountChange(event.target.value)
                  }
                  className="w-full bg-transparent text-3xl font-bold text-gray-900 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-gray-600"
                />

                <div className="relative">
                  <button
                    onClick={() =>
                      setOpenSelector((current) =>
                        current === "pay" ? null : "pay",
                      )
                    }
                    className="flex items-center gap-2 whitespace-nowrap rounded-full border border-gray-200 bg-white px-4 py-2 font-bold text-gray-900 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700"
                  >
                    {payToken?.symbol ?? t("swap.selectToken")}
                    <ChevronDown size={14} />
                  </button>

                  <TokenPicker
                    isOpen={openSelector === "pay"}
                    onClose={() => setOpenSelector(null)}
                    onSelect={(token) => handleSelectToken("pay", token)}
                    options={tokenOptions.filter(
                      (token) => token.symbol !== receiveToken?.symbol,
                    )}
                  />
                </div>
              </div>

              {mounted && isConnected && (
                <div className="flex justify-end text-sm text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-2">
                    {t("swap.balance")}: {payBalanceDisplay}
                    <button
                      onClick={handleMaxPay}
                      className="font-semibold text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      {t("swap.max")}
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
                {t("swap.receive")}
              </div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <input
                  type="text"
                  placeholder={isQuoteLoading ? "..." : "0.0"}
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
                      setOpenSelector((current) =>
                        current === "receive" ? null : "receive",
                      )
                    }
                    className="flex items-center gap-2 whitespace-nowrap rounded-full border border-gray-200 bg-white px-4 py-2 font-bold text-gray-900 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700"
                  >
                    {receiveToken?.symbol ?? t("swap.selectToken")}
                    <ChevronDown size={14} />
                  </button>

                  <TokenPicker
                    isOpen={openSelector === "receive"}
                    onClose={() => setOpenSelector(null)}
                    onSelect={(token) => handleSelectToken("receive", token)}
                    options={tokenOptions.filter(
                      (token) => token.symbol !== payToken?.symbol,
                    )}
                  />
                </div>
              </div>

              {mounted && isConnected && receiveToken && (
                <div className="flex justify-end text-sm text-gray-500 dark:text-gray-400">
                  <span>
                    {t("swap.balance")}: {receiveBalanceDisplay}
                  </span>
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
                      { value: "1", label: isZh ? "1天" : "1 Day" },
                      { value: "7", label: isZh ? "1周" : "1 Week" },
                      { value: "30", label: isZh ? "1个月" : "1 Month" },
                      { value: "365", label: isZh ? "1年" : "1 Year" },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setLimitExpiry(option.value)}
                        className={`rounded-2xl px-3 py-3 text-sm font-medium transition-colors ${
                          limitExpiry === option.value
                            ? "bg-sky-600 text-white"
                            : "bg-white text-gray-700 hover:bg-sky-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-sky-500/20"
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
                      onClick={() => applyLimitPreset("market")}
                      className={`shrink-0 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                        limitPricePreset === "market"
                          ? "bg-sky-600 text-white"
                          : "bg-white text-gray-700 hover:bg-sky-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-sky-500/20"
                      }`}
                    >
                      {copy.marketPrice}
                    </button>
                    {["0.1", "0.5", "1.0"].map((value) => (
                      <button
                        key={value}
                        onClick={() => {
                          applyLimitPreset(
                            value as Exclude<
                              LimitPricePreset,
                              "market" | "custom"
                            >,
                          );
                        }}
                        className={`shrink-0 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                          limitPricePreset === value
                            ? "bg-sky-600 text-white"
                            : "bg-white text-gray-700 hover:bg-sky-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-sky-500/20"
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
                          setLimitPremium(nextValue === "" ? "" : nextValue);
                          setLimitPricePreset("custom");

                          if (nextValue === "") {
                            setLimitRate(limitMarketRateDisplay);
                            return;
                          }

                          const premium = Number(nextValue);
                          const market = Number(limitMarketRateDisplay);

                          if (
                            !Number.isFinite(premium) ||
                            premium < 0 ||
                            !Number.isFinite(market)
                          ) {
                            return;
                          }

                          const nextRate = market * (1 + premium / 100);
                          setLimitRate(
                            nextRate.toFixed(8).replace(/\.?0+$/, ""),
                          );
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
                {payToken?.kind === "native" && (
                  <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200">
                    {copy.limitWrapNotice}
                  </div>
                )}
              </div>
            )}

            {actionButton}
          </div>
        </div>
      </div>
    </div>
  );
}
