'use client';

import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Address } from 'viem';
import { formatUnits, maxUint256, zeroAddress } from 'viem';
import {
  ChevronDown,
  ChevronUp,
  ChevronRight,
  CircleHelp,
  Info,
  RotateCcw,
  Settings2,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  useAccount,
  useBalance,
  useChainId,
  usePublicClient,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';

import { ActionButton } from '@/components/ActionButton';
import { getContractAddress, getLocalGasOverride, isFluxSupportedChain } from '@/config/contracts';
import { getSwapTokenOptions, type SwapTokenOption } from '@/config/tokens';
import { useIsClient } from '@/hooks/useIsClient';
import {
  DECIMAL_INPUT_REGEX,
  formatDisplayAmount,
  parseAmount,
  parsePercentToBps,
} from '@/lib/amounts';
import { formatErrorMessage } from '@/lib/errors';
import { sortPairTokens } from '@/lib/poolOrder';
import { getPoolByTokens, type PoolViewModel } from '@/lib/subgraph/pools';
import {
  fluxSwapErc20Abi,
  fluxSwapRouterAbi,
  useReadFluxSwapErc20Allowance,
  useReadFluxSwapFactoryGetPair,
  useReadFluxSwapPairGetReserves,
  useReadFluxSwapPairToken0,
} from '@/lib/contracts';

type Step = 1 | 2;
type FeeTier = '0.3%';
type SelectorTarget = 'a' | 'b' | null;
type SlippageMode = 'auto' | 'custom';
type LiquidityAction = 'approve-a' | 'approve-b' | 'add' | null;
type ResultModalState =
  | {
      kind: 'success' | 'error';
      message: string;
    }
  | null;

const MIN_CUSTOM_SLIPPAGE = '0.1';

function normalizeCustomSlippage(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '') {
    return MIN_CUSTOM_SLIPPAGE;
  }

  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric) || numeric < Number(MIN_CUSTOM_SLIPPAGE)) {
    return MIN_CUSTOM_SLIPPAGE;
  }

  return trimmed;
}

function formatLinkedAmount(value: bigint, decimals: number): string {
  const formatted = formatUnits(value, decimals);
  return formatted.includes('.')
    ? formatted.replace(/\.?0+$/, '')
    : formatted;
}

function getTokenAccent(symbol: string) {
  if (symbol === 'ETH') {
    return 'from-indigo-400 to-indigo-600';
  }
  if (symbol === 'USDC') {
    return 'from-blue-500 to-blue-700';
  }
  if (symbol === 'USDT') {
    return 'from-emerald-500 to-emerald-700';
  }
  if (symbol === 'WBTC') {
    return 'from-amber-400 to-orange-500';
  }
  return 'from-sky-500 to-cyan-500';
}

function TokenCircle({ symbol }: { symbol: string }) {
  return (
    <span
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br ${getTokenAccent(symbol)} text-xs font-black text-white shadow-sm`}
    >
      {symbol.slice(0, 1)}
    </span>
  );
}

function findTokenByRouteAddress(
  options: SwapTokenOption[],
  routeAddress: Address,
): SwapTokenOption | undefined {
  return options.find((token) => token.routeAddress.toLowerCase() === routeAddress.toLowerCase());
}

function StepCard({
  index,
  label,
  title,
  active,
  showLine,
  onClick,
}: {
  index: number;
  label: string;
  title: string;
  active: boolean;
  showLine?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <div className="relative pl-14">
      <div
        className={`absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ${
          active ? 'bg-black text-white' : 'bg-gray-100 text-gray-500'
        }`}
      >
        {index}
      </div>
      {showLine ? <div className="absolute left-5 top-10 h-10 w-px bg-gray-200" /> : null}
      <div>
        <div className={`text-sm ${active ? 'text-gray-500' : 'text-gray-400'}`}>{label}</div>
        <div className="mt-1 text-[1.1rem] font-medium tracking-tight text-gray-950">{title}</div>
      </div>
    </div>
  );

  if (!onClick) {
    return content;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left transition-opacity hover:opacity-80"
    >
      {content}
    </button>
  );
}

function TokenSelectButton({
  token,
  onClick,
  placeholder,
}: {
  token: SwapTokenOption | undefined;
  onClick: () => void;
  placeholder: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-[1.2rem] px-4 py-4 text-left transition-colors ${
        token ? 'bg-gray-100 hover:bg-gray-200/80' : 'bg-[#232323] hover:bg-black'
      }`}
    >
      {token ? <TokenCircle symbol={token.symbol} /> : null}
      <span
        className={`flex-1 text-[1.15rem] font-semibold tracking-tight ${
          token ? 'text-gray-950' : 'text-white'
        }`}
      >
        {token?.symbol ?? placeholder}
      </span>
      <ChevronDown size={18} className={token ? 'text-gray-500' : 'text-white'} />
    </button>
  );
}

function TokenSelectorModal({
  open,
  title,
  options,
  selectedSymbol,
  onSelect,
  onClose,
}: {
  open: boolean;
  title: string;
  options: SwapTokenOption[];
  selectedSymbol?: string;
  onSelect: (token: SwapTokenOption) => void;
  onClose: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/25 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-[1.5rem] bg-white p-4 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-2 pb-3 pt-1 text-lg font-semibold text-gray-900">{title}</div>
        <div className="space-y-2">
          {options.map((token) => {
            const selected = token.symbol === selectedSymbol;
            return (
              <button
                key={token.symbol}
                type="button"
                onClick={() => {
                  onSelect(token);
                  onClose();
                }}
                className={`flex w-full items-center gap-3 rounded-[1rem] px-4 py-3.5 text-left transition-colors ${
                  selected ? 'bg-gray-100' : 'hover:bg-gray-50'
                }`}
              >
                <TokenCircle symbol={token.symbol} />
                <div className="flex-1">
                  <div className="text-base font-semibold text-gray-950">{token.symbol}</div>
                  <div className="text-sm text-gray-500">{token.name}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function PortfolioLiquidityPage() {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const router = useRouter();
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
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });
  const tokens = getSwapTokenOptions(chainId);
  const initialTokenA = tokens.find((token) => token.symbol === 'ETH') ?? tokens[0];
  const supportedChain = isFluxSupportedChain(chainId);
  const routerAddress = getContractAddress('FluxSwapRouter', chainId);
  const localGasOverride = getLocalGasOverride(chainId);

  const [step, setStep] = useState<Step>(1);
  const [feeTier] = useState<FeeTier>('0.3%');
  const [tokenA, setTokenA] = useState<SwapTokenOption | undefined>(initialTokenA);
  const [tokenB, setTokenB] = useState<SwapTokenOption | undefined>(undefined);
  const [amountA, setAmountA] = useState('');
  const [amountB, setAmountB] = useState('');
  const [selectorTarget, setSelectorTarget] = useState<SelectorTarget>(null);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [slippage, setSlippage] = useState('0.5');
  const [slippageMode, setSlippageMode] = useState<SlippageMode>('auto');
  const [deadline, setDeadline] = useState('30');
  const [txError, setTxError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<LiquidityAction>(null);
  const [resultModal, setResultModal] = useState<ResultModalState>(null);
  const [displayPair, setDisplayPair] = useState<PoolViewModel | undefined>(undefined);

  const settingsWrapRef = useRef<HTMLDivElement | null>(null);
  const [orderedTokenA, orderedTokenB] = useMemo(
    () => sortPairTokens(tokenA, tokenB),
    [tokenA, tokenB],
  );
  const pairArgs =
    orderedTokenA && orderedTokenB
      ? ([orderedTokenA.routeAddress, orderedTokenB.routeAddress] as const)
      : ([zeroAddress, zeroAddress] as const);

  const selectableForA = useMemo(
    () => tokens.filter((token) => token.symbol !== tokenB?.symbol),
    [tokenB?.symbol, tokens],
  );

  const selectableForB = useMemo(
    () => tokens.filter((token) => token.symbol !== tokenA?.symbol),
    [tokenA?.symbol, tokens],
  );

  useEffect(() => {
    if (!supportedChain || !orderedTokenA || !orderedTokenB) {
      setDisplayPair(undefined);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const pair = await getPoolByTokens(orderedTokenA.routeAddress, orderedTokenB.routeAddress);
        if (!cancelled) {
          setDisplayPair(pair);
        }
      } catch {
        if (!cancelled) {
          setDisplayPair(undefined);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orderedTokenA, orderedTokenB, supportedChain]);

  const [displayTokenA, displayTokenB] = useMemo(() => {
    if (!displayPair) {
      return [orderedTokenA, orderedTokenB] as const;
    }

    const first = findTokenByRouteAddress(tokens, displayPair.token0.id);
    const second = findTokenByRouteAddress(tokens, displayPair.token1.id);

    return [first ?? orderedTokenA, second ?? orderedTokenB] as const;
  }, [displayPair, orderedTokenA, orderedTokenB, tokens]);

  const pairLabel =
    displayTokenA && displayTokenB
      ? `${displayTokenA.symbol} / ${displayTokenB.symbol}`
      : '--';
  const canContinue = Boolean(tokenA && tokenB);
  const canReset =
    step !== 1 ||
    tokenA?.symbol !== initialTokenA?.symbol ||
    tokenB !== undefined ||
    amountA.trim() !== '' ||
    amountB.trim() !== '' ||
    slippageMode !== 'auto' ||
    slippage.trim() !== '0.5' ||
    deadline.trim() !== '30';

  const parsedAmountA = parseAmount(amountA, orderedTokenA?.decimals ?? 18);
  const parsedAmountB = parseAmount(amountB, orderedTokenB?.decimals ?? 18);
  const parsedDeadlineMinutes = Math.max(1, Number.parseInt(deadline || '30', 10) || 30);

  const { data: pairAddress, refetch: refetchPairAddress } = useReadFluxSwapFactoryGetPair({
    address: getContractAddress('FluxSwapFactory', chainId) ?? zeroAddress,
    chainId,
    args: pairArgs,
    query: {
      enabled: Boolean(supportedChain && orderedTokenA && orderedTokenB),
      retry: false,
      refetchInterval: 10000,
    },
  });

  const normalizedPairAddress =
    pairAddress && pairAddress !== zeroAddress ? pairAddress : undefined;

  const { data: reservesData, refetch: refetchReserves } = useReadFluxSwapPairGetReserves({
    address: normalizedPairAddress ?? zeroAddress,
    chainId,
    query: {
      enabled: Boolean(normalizedPairAddress),
      retry: false,
      refetchInterval: 10000,
    },
  });

  const { data: token0, refetch: refetchToken0 } = useReadFluxSwapPairToken0({
    address: normalizedPairAddress ?? zeroAddress,
    chainId,
    query: {
      enabled: Boolean(normalizedPairAddress),
      retry: false,
      refetchInterval: 10000,
    },
  });

  const reserveA =
    orderedTokenA && orderedTokenB && reservesData && token0
      ? token0.toLowerCase() === orderedTokenA.routeAddress.toLowerCase()
        ? reservesData[0]
        : reservesData[1]
      : undefined;
  const reserveB =
    orderedTokenA && orderedTokenB && reservesData && token0
      ? token0.toLowerCase() === orderedTokenA.routeAddress.toLowerCase()
        ? reservesData[1]
        : reservesData[0]
      : undefined;
  const canLinkAmounts = Boolean(
    reserveA && reserveB && reserveA > BigInt(0) && reserveB > BigInt(0),
  );
  const hasValidAmounts = Boolean(
    parsedAmountA !== undefined &&
      parsedAmountB !== undefined &&
      parsedAmountA > BigInt(0) &&
      parsedAmountB > BigInt(0),
  );

  const { data: balanceAData, refetch: refetchBalanceA } = useBalance({
    address,
    chainId,
    token: orderedTokenA?.kind === 'erc20' ? orderedTokenA.address : undefined,
    query: {
      enabled: mounted && isConnected && !!address && !!orderedTokenA,
      refetchInterval: 8000,
    },
  });

  const { data: balanceBData, refetch: refetchBalanceB } = useBalance({
    address,
    chainId,
    token: orderedTokenB?.kind === 'erc20' ? orderedTokenB.address : undefined,
    query: {
      enabled: mounted && isConnected && !!address && !!orderedTokenB,
      refetchInterval: 8000,
    },
  });

  const { data: allowanceA, refetch: refetchAllowanceA } = useReadFluxSwapErc20Allowance({
    address: orderedTokenA?.address ?? zeroAddress,
    chainId,
    args: [address ?? zeroAddress, routerAddress ?? zeroAddress],
    query: {
      enabled:
        mounted &&
        isConnected &&
        !!address &&
        !!routerAddress &&
        orderedTokenA?.kind === 'erc20' &&
        !!orderedTokenA.address,
      refetchInterval: 8000,
    },
  });

  const { data: allowanceB, refetch: refetchAllowanceB } = useReadFluxSwapErc20Allowance({
    address: orderedTokenB?.address ?? zeroAddress,
    chainId,
    args: [address ?? zeroAddress, routerAddress ?? zeroAddress],
    query: {
      enabled:
        mounted &&
        isConnected &&
        !!address &&
        !!routerAddress &&
        orderedTokenB?.kind === 'erc20' &&
        !!orderedTokenB.address,
      refetchInterval: 8000,
    },
  });

  const normalizedCustomSlippage = normalizeCustomSlippage(slippage);
  const effectiveSlippage = slippageMode === 'auto' ? '2.5' : normalizedCustomSlippage;
  const slippageBps = parsePercentToBps(effectiveSlippage);
  const customSlippageDisplay = `${normalizedCustomSlippage}%`;

  const minAmountA =
    parsedAmountA !== undefined
      ? (parsedAmountA * (BigInt(10000) - slippageBps)) / BigInt(10000)
      : undefined;
  const minAmountB =
    parsedAmountB !== undefined
      ? (parsedAmountB * (BigInt(10000) - slippageBps)) / BigInt(10000)
      : undefined;

  const minAmountADisplay =
    minAmountA !== undefined && orderedTokenA
      ? formatDisplayAmount((Number(minAmountA) / 10 ** orderedTokenA.decimals).toString(), 6)
      : '--';
  const minAmountBDisplay =
    minAmountB !== undefined && orderedTokenB
      ? formatDisplayAmount((Number(minAmountB) / 10 ** orderedTokenB.decimals).toString(), 6)
      : '--';
  const insufficientBalanceA =
    parsedAmountA !== undefined && balanceAData?.value !== undefined
      ? parsedAmountA > balanceAData.value
      : false;
  const insufficientBalanceB =
    parsedAmountB !== undefined && balanceBData?.value !== undefined
      ? parsedAmountB > balanceBData.value
      : false;
  const needsAllowanceA =
    hasValidAmounts &&
    orderedTokenA?.kind === 'erc20' &&
    orderedTokenA.address !== undefined &&
    routerAddress !== undefined &&
    parsedAmountA !== undefined &&
    (allowanceA === undefined || allowanceA < parsedAmountA);
  const needsAllowanceB =
    hasValidAmounts &&
    orderedTokenB?.kind === 'erc20' &&
    orderedTokenB.address !== undefined &&
    routerAddress !== undefined &&
    parsedAmountB !== undefined &&
    (allowanceB === undefined || allowanceB < parsedAmountB);
  const actionKind: LiquidityAction = !mounted || !isConnected
    ? null
    : needsAllowanceA
      ? 'approve-a'
      : needsAllowanceB
        ? 'approve-b'
        : hasValidAmounts
          ? 'add'
          : null;
  const isSubmitting = isWritePending || isConfirming;

  const resetForm = () => {
    setStep(1);
    setTokenA(initialTokenA);
    setTokenB(undefined);
    setAmountA('');
    setAmountB('');
    setSelectorTarget(null);
    setResetModalOpen(false);
    setSettingsOpen(false);
    setSlippage('0.5');
    setSlippageMode('auto');
    setDeadline('30');
    setTxError(null);
    setLastAction(null);
    setResultModal(null);
  };

  useEffect(() => {
    if (!isConfirmed) {
      return;
    }

    void Promise.all([
      refetchBalanceA(),
      refetchBalanceB(),
      refetchAllowanceA(),
      refetchAllowanceB(),
      refetchPairAddress(),
      refetchReserves(),
      refetchToken0(),
    ]);
  }, [
    isConfirmed,
    refetchAllowanceA,
    refetchAllowanceB,
    refetchBalanceA,
    refetchBalanceB,
    refetchPairAddress,
    refetchReserves,
    refetchToken0,
  ]);

  useEffect(() => {
    if (!isConfirmed || lastAction !== 'add') {
      return;
    }

    setResultModal({
      kind: 'success',
      message: isZh ? '添加流动性成功。' : 'Liquidity added successfully.',
    });
  }, [isConfirmed, isZh, lastAction]);

  useEffect(() => {
    if (!settingsOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!settingsWrapRef.current?.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [settingsOpen]);

  const updateCustomSlippage = (nextValue: string) => {
    if (nextValue === '' || DECIMAL_INPUT_REGEX.test(nextValue)) {
      setSlippageMode('custom');
      setSlippage(nextValue);
    }
  };

  const activateCustomSlippage = () => {
    setSlippageMode('custom');
    setSlippage((current) => normalizeCustomSlippage(current));
  };

  const commitCustomSlippage = () => {
    setSlippage((current) => normalizeCustomSlippage(current));
  };

  const updateDeadline = (nextValue: string) => {
    if (nextValue === '') {
      setDeadline('');
      return;
    }

    if (!/^\d+$/.test(nextValue)) {
      return;
    }

    const normalized = Math.min(30, Math.max(1, Number.parseInt(nextValue, 10) || 1));
    setDeadline(String(normalized));
  };

  const adjustDeadline = (delta: number) => {
    const current = Number.parseInt(deadline || '30', 10);
    const safeCurrent = Number.isFinite(current) ? current : 30;
    const nextValue = Math.min(30, Math.max(1, safeCurrent + delta));
    setDeadline(String(nextValue));
  };

  const handleAmountAChange = (nextValue: string) => {
    if (!DECIMAL_INPUT_REGEX.test(nextValue)) {
      return;
    }

    setAmountA(nextValue);

    if (nextValue.trim() === '') {
      setAmountB('');
      return;
    }

    if (
      !canLinkAmounts ||
      !orderedTokenA ||
      !orderedTokenB ||
      reserveA === undefined ||
      reserveB === undefined
    ) {
      return;
    }

    const parsedValue = parseAmount(nextValue, orderedTokenA.decimals);
    if (parsedValue === undefined) {
      return;
    }

    const linkedAmount = (parsedValue * reserveB) / reserveA;
    setAmountB(formatLinkedAmount(linkedAmount, orderedTokenB.decimals));
  };

  const handleAmountBChange = (nextValue: string) => {
    if (!DECIMAL_INPUT_REGEX.test(nextValue)) {
      return;
    }

    setAmountB(nextValue);

    if (nextValue.trim() === '') {
      setAmountA('');
      return;
    }

    if (
      !canLinkAmounts ||
      !orderedTokenA ||
      !orderedTokenB ||
      reserveA === undefined ||
      reserveB === undefined
    ) {
      return;
    }

    const parsedValue = parseAmount(nextValue, orderedTokenB.decimals);
    if (parsedValue === undefined) {
      return;
    }

    const linkedAmount = (parsedValue * reserveA) / reserveB;
    setAmountA(formatLinkedAmount(linkedAmount, orderedTokenA.decimals));
  };

  const handleLiquidityAction = async () => {
    if (!mounted || !isConnected) {
      openConnectModal?.();
      return;
    }

    if (!actionKind || !address || !routerAddress) {
      return;
    }

    setTxError(null);
    setLastAction(actionKind);

    try {
      if (actionKind === 'approve-a') {
        if (!orderedTokenA?.address) {
          return;
        }

        await writeContractAsync({
          address: orderedTokenA.address,
          abi: fluxSwapErc20Abi,
          functionName: 'approve',
          args: [routerAddress, maxUint256],
          chainId,
          ...localGasOverride,
        });
        return;
      }

      if (actionKind === 'approve-b') {
        if (!orderedTokenB?.address) {
          return;
        }

        await writeContractAsync({
          address: orderedTokenB.address,
          abi: fluxSwapErc20Abi,
          functionName: 'approve',
          args: [routerAddress, maxUint256],
          chainId,
          ...localGasOverride,
        });
        return;
      }

      if (
        !publicClient ||
        !orderedTokenA ||
        !orderedTokenB ||
        !parsedAmountA ||
        !parsedAmountB
      ) {
        return;
      }

      const transactionDeadline =
        (await publicClient.getBlock()).timestamp + BigInt(parsedDeadlineMinutes * 60);

      if (orderedTokenA.kind === 'native' || orderedTokenB.kind === 'native') {
        const nativeIsTokenA = orderedTokenA.kind === 'native';
        const nativeAmount = nativeIsTokenA ? parsedAmountA : parsedAmountB;
        const tokenAmount = nativeIsTokenA ? parsedAmountB : parsedAmountA;
        const amountETHMin = nativeIsTokenA ? (minAmountA ?? BigInt(0)) : (minAmountB ?? BigInt(0));
        const amountTokenMin = nativeIsTokenA
          ? (minAmountB ?? BigInt(0))
          : (minAmountA ?? BigInt(0));
        const erc20Token = nativeIsTokenA ? orderedTokenB : orderedTokenA;

        if (!erc20Token.address) {
          return;
        }

        await writeContractAsync({
          address: routerAddress,
          abi: fluxSwapRouterAbi,
          functionName: 'addLiquidityETH',
          args: [
            erc20Token.address,
            tokenAmount,
            amountTokenMin,
            amountETHMin,
            address,
            transactionDeadline,
          ],
          value: nativeAmount,
          chainId,
          ...localGasOverride,
        });
        return;
      }

      if (!orderedTokenA.address || !orderedTokenB.address) {
        return;
      }

      await writeContractAsync({
        address: routerAddress,
        abi: fluxSwapRouterAbi,
        functionName: 'addLiquidity',
        args: [
          orderedTokenA.address,
          orderedTokenB.address,
          parsedAmountA,
          parsedAmountB,
          minAmountA ?? BigInt(0),
          minAmountB ?? BigInt(0),
          address,
          transactionDeadline,
        ],
        chainId,
        ...localGasOverride,
      });
    } catch (error) {
      const errorMessage = formatErrorMessage(error, {
        rejectedMessage:
          actionKind === 'approve-a' || actionKind === 'approve-b'
            ? '你已取消本次授权'
            : '你已取消本次交易',
      });
      setTxError(errorMessage);
      if (actionKind === 'add') {
        setResultModal({
          kind: 'error',
          message: errorMessage,
        });
      }
    }
  };

  const actionLabel = !mounted || !isConnected
    ? (isZh ? '连接钱包' : 'Connect Wallet')
    : !supportedChain || !routerAddress
      ? (isZh ? '当前网络暂不支持' : 'Unsupported network')
      : !orderedTokenA || !orderedTokenB
        ? (isZh ? '请选择代币' : 'Select tokens')
        : !hasValidAmounts
          ? (isZh ? '请输入有效金额' : 'Enter valid amounts')
          : insufficientBalanceA || insufficientBalanceB
            ? (isZh ? '余额不足' : 'Insufficient balance')
            : actionKind === 'approve-a'
              ? `${isZh ? '授权 ' : 'Approve '}${orderedTokenA?.symbol ?? ''}`
              : actionKind === 'approve-b'
                ? `${isZh ? '授权 ' : 'Approve '}${orderedTokenB?.symbol ?? ''}`
                : (isZh ? '添加流动性' : 'Add Liquidity');
  const actionDisabled =
    mounted &&
    isConnected &&
    (!supportedChain ||
      !routerAddress ||
      !orderedTokenA ||
      !orderedTokenB ||
      !hasValidAmounts ||
      insufficientBalanceA ||
      insufficientBalanceB ||
      (needsAllowanceA && allowanceA === undefined) ||
      (needsAllowanceB && allowanceB === undefined));
  const statusMessage = txError
    ? txError
    : isConfirmed
      ? lastAction === 'approve-a' || lastAction === 'approve-b'
        ? (isZh ? '授权已确认' : 'Approval confirmed')
        : (isZh ? '添加流动性交易已确认' : 'Add liquidity transaction confirmed')
      : hash && isConfirming
        ? lastAction === 'approve-a' || lastAction === 'approve-b'
          ? (isZh ? '授权交易确认中...' : 'Approval confirming...')
          : (isZh ? '添加流动性交易确认中...' : 'Add liquidity confirming...')
        : hash
          ? lastAction === 'approve-a' || lastAction === 'approve-b'
            ? (isZh ? '授权交易已提交' : 'Approval submitted')
            : (isZh ? '添加流动性交易已提交' : 'Add liquidity submitted')
          : null;
  const closeResultModal = () => {
    if (resultModal?.kind === 'success') {
      router.push('/portfolio');
      return;
    }

    setResultModal(null);
  };

  return (
    <div className="min-h-[calc(100vh-80px)] px-4 py-8 lg:px-6 xl:px-8">
      <div className="mx-auto max-w-[1280px]">
        <div className="flex flex-col gap-7">
          <div className="mx-auto w-full max-w-[980px]">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-[#a96b2c]">
                <Link href="/portfolio" className="transition-colors hover:text-[#8b5623]">
                  {isZh ? '资产' : 'Assets'}
                </Link>
                <ChevronRight size={14} className="text-gray-400" />
                <span className="text-gray-900">{isZh ? '新仓位' : 'New Position'}</span>
              </div>

              <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <h1 className="text-[2.5rem] font-medium tracking-tight text-gray-950">
                  {isZh ? '新仓位' : 'New Position'}
                </h1>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setResetModalOpen(true)}
                    disabled={!canReset}
                    className="inline-flex h-11 items-center gap-2 rounded-[0.95rem] border border-gray-200 bg-transparent px-4 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50/80 disabled:cursor-not-allowed disabled:border-gray-100 disabled:text-gray-300 disabled:hover:bg-transparent"
                  >
                    <RotateCcw size={16} />
                    <span>{isZh ? '重置' : 'Reset'}</span>
                  </button>

                  {slippageMode === 'custom' ? (
                    <span className="inline-flex h-11 items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700">
                      {customSlippageDisplay}
                    </span>
                  ) : null}

                  <div ref={settingsWrapRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setSettingsOpen((current) => !current)}
                      className={`inline-flex h-11 w-11 items-center justify-center rounded-[0.95rem] border transition-colors ${
                        settingsOpen
                          ? 'border-gray-300 bg-gray-100 text-gray-900'
                          : 'border-gray-200 bg-transparent text-gray-700 hover:bg-gray-50/80'
                      }`}
                    >
                      <Settings2 size={18} />
                    </button>

                    {settingsOpen ? (
                      <div className="absolute right-0 top-[calc(100%+0.75rem)] z-40 w-[min(420px,calc(100vw-2rem))] overflow-visible rounded-[1.5rem] border border-gray-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.16)]">
                        <div className="divide-y divide-gray-100">
                          <div className="flex items-center justify-between gap-4 px-5 py-4">
                            <div className="flex items-center gap-2 text-gray-900">
                              <span className="text-base font-medium">
                                {isZh ? '滑点上限' : 'Max slippage'}
                              </span>
                              <div className="group relative">
                                <Info size={15} className="text-gray-400" />
                                <div className="pointer-events-none absolute left-1/2 top-[calc(100%+0.75rem)] z-50 w-[280px] -translate-x-1/2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm leading-6 text-gray-600 opacity-0 shadow-[0_18px_40px_rgba(15,23,42,0.12)] transition-opacity duration-150 group-hover:opacity-100">
                                  {isZh
                                    ? '如果价格变动超过该滑点百分比，交易将会回退。'
                                    : 'If the price moves beyond this slippage percentage, the transaction will revert.'}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center rounded-full border border-gray-200 bg-white px-2 py-1 shadow-sm">
                              <button
                                type="button"
                                onClick={() => setSlippageMode('auto')}
                                className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                                  slippageMode === 'auto'
                                    ? 'bg-pink-100 text-pink-600'
                                    : 'text-gray-500 hover:text-gray-700'
                                }`}
                              >
                                {isZh ? '自动' : 'Auto'}
                              </button>

                              <div className="ml-2 flex items-center gap-2">
                                {slippageMode === 'custom' && (
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={slippage}
                                    onChange={(event) => updateCustomSlippage(event.target.value)}
                                    onBlur={commitCustomSlippage}
                                    className="w-14 bg-transparent text-right text-sm font-semibold text-gray-900 outline-none"
                                    placeholder={MIN_CUSTOM_SLIPPAGE}
                                    autoFocus
                                  />
                                )}

                                {slippageMode === 'auto' ? (
                                  <button
                                    type="button"
                                    onClick={activateCustomSlippage}
                                    className="min-w-[56px] text-right text-sm font-semibold text-gray-900 transition-colors hover:text-sky-600"
                                  >
                                    2.5%
                                  </button>
                                ) : (
                                  <span className="min-w-[16px] text-right text-sm font-semibold text-gray-900">
                                    %
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-4 px-5 py-4">
                            <div className="flex items-center gap-2 text-gray-900">
                              <span className="text-base font-medium">
                                {isZh ? '交易截止日期' : 'Transaction deadline'}
                              </span>
                              <div className="group relative">
                                <Info size={15} className="text-gray-400" />
                                <div className="pointer-events-none absolute left-1/2 top-[calc(100%+0.75rem)] z-50 w-[280px] -translate-x-1/2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm leading-6 text-gray-600 opacity-0 shadow-[0_18px_40px_rgba(15,23,42,0.12)] transition-opacity duration-150 group-hover:opacity-100">
                                  {isZh
                                    ? '如果你的交易等待时间超过这个时长，交易将会被取消。'
                                    : 'If the transaction stays pending longer than this duration, it will be canceled.'}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center rounded-full border border-gray-200 bg-white px-3 py-1.5 shadow-sm">
                              <input
                                type="text"
                                inputMode="numeric"
                                value={deadline}
                                onChange={(event) => updateDeadline(event.target.value)}
                                className="w-8 bg-transparent text-right text-sm font-semibold text-gray-900 outline-none"
                                placeholder="30"
                              />
                              <span className="ml-1 text-sm font-medium text-gray-700">
                                minutes
                              </span>
                              <div className="ml-2 flex w-5 shrink-0 flex-col overflow-hidden rounded-md border border-gray-200">
                                <button
                                  type="button"
                                  onClick={() => adjustDeadline(1)}
                                  className="flex h-4 w-full items-center justify-center bg-gray-50 text-gray-500 transition-colors hover:bg-sky-100 hover:text-sky-600"
                                >
                                  <ChevronUp size={12} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => adjustDeadline(-1)}
                                  className="flex h-4 w-full items-center justify-center border-t border-gray-200 bg-gray-50 text-gray-500 transition-colors hover:bg-sky-100 hover:text-sky-600"
                                >
                                  <ChevronDown size={12} />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mx-auto grid w-full max-w-[980px] gap-5 xl:grid-cols-[0.9fr_1.65fr]">
            <section className="rounded-[1.7rem] border border-gray-200 bg-transparent px-6 py-6">
              <div className="space-y-12">
                <StepCard
                  index={1}
                  label={isZh ? '步骤 1' : 'Step 1'}
                  title={isZh ? '选择代币对和费用' : 'Select pair and fee'}
                  active={step === 1}
                  showLine
                  onClick={step === 2 ? () => setStep(1) : undefined}
                />
                <StepCard
                  index={2}
                  label={isZh ? '步骤 2' : 'Step 2'}
                  title={isZh ? '输入存款金额' : 'Enter deposit amounts'}
                  active={step === 2}
                />
              </div>
            </section>

            <section className="rounded-[1.7rem] border border-gray-200 bg-transparent px-7 py-7">
              {step === 1 ? (
                <div>
                  <div>
                    <h2 className="text-[1.05rem] font-semibold tracking-tight text-gray-950">
                      {isZh ? '选择配对' : 'Select Pair'}
                    </h2>
                    <p className="mt-2 max-w-[640px] text-sm leading-6 text-gray-500">
                      {isZh
                        ? '选择你想要提供流动性的代币。你可以在所有支持的网络上选择代币。'
                        : 'Choose the tokens you want to provide liquidity for. You can select supported tokens across supported networks.'}
                    </p>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <TokenSelectButton
                      token={tokenA}
                      onClick={() => setSelectorTarget('a')}
                      placeholder={isZh ? '选择代币' : 'Select token'}
                    />
                    <TokenSelectButton
                      token={tokenB}
                      onClick={() => setSelectorTarget('b')}
                      placeholder={isZh ? '选择代币' : 'Select token'}
                    />
                  </div>

                  <div className="mt-10">
                    <h3 className="text-[1.05rem] font-semibold tracking-tight text-gray-950">
                      {isZh ? '费用等级' : 'Fee Tier'}
                    </h3>
                    <p className="mt-2 max-w-[700px] text-sm leading-6 text-gray-500">
                      {isZh
                        ? '通过提供流动性赚取的金额。所有 v2 资金池均收取 0.3% 的固定费用。'
                        : 'Earn fees by providing liquidity. All v2 pools use a fixed 0.3% fee tier.'}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={!canContinue}
                    onClick={() => setStep(2)}
                    className="mt-12 inline-flex h-14 w-full items-center justify-center rounded-[1.2rem] bg-[#232323] text-lg font-semibold text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:bg-gray-300"
                  >
                    {isZh ? '继续' : 'Continue'}
                  </button>
                </div>
              ) : (
                <div>
                  <div>
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-800"
                    >
                      <ChevronRight className="rotate-180" size={16} />
                      <span>{isZh ? '返回上一步' : 'Back'}</span>
                    </button>
                    <h2 className="mt-4 text-[1.05rem] font-semibold tracking-tight text-gray-950">
                      {isZh ? '输入存款金额' : 'Enter Deposit Amounts'}
                    </h2>
                    <p className="mt-2 max-w-[640px] text-sm leading-6 text-gray-500">
                      {isZh
                        ? `为 ${pairLabel} 头寸输入你想要提供的两种资产数量。`
                        : `Enter the amounts of both assets you want to provide for the ${pairLabel} position.`}
                    </p>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <div className="rounded-[1.35rem] bg-gray-100 px-4 py-4">
                      <div className="text-sm text-gray-500">{isZh ? '代币一' : 'Token A'}</div>
                      <div className="mt-4 flex items-center gap-3">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={amountA}
                          onChange={(event) => handleAmountAChange(event.target.value)}
                          placeholder="0.0"
                          className="min-w-0 flex-1 bg-transparent text-[1.4rem] font-semibold tracking-tight text-gray-950 outline-none placeholder:text-gray-400"
                        />
                        <div className="inline-flex items-center gap-2 rounded-full bg-transparent px-2 py-1.5">
                          {orderedTokenA ? <TokenCircle symbol={orderedTokenA.symbol} /> : null}
                          <span className="text-sm font-semibold text-gray-950">
                            {orderedTokenA?.symbol ?? '--'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[1.35rem] bg-gray-100 px-4 py-4">
                      <div className="text-sm text-gray-500">{isZh ? '代币二' : 'Token B'}</div>
                      <div className="mt-4 flex items-center gap-3">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={amountB}
                          onChange={(event) => handleAmountBChange(event.target.value)}
                          placeholder="0.0"
                          className="min-w-0 flex-1 bg-transparent text-[1.4rem] font-semibold tracking-tight text-gray-950 outline-none placeholder:text-gray-400"
                        />
                        <div className="inline-flex items-center gap-2 rounded-full bg-transparent px-2 py-1.5">
                          {orderedTokenB ? <TokenCircle symbol={orderedTokenB.symbol} /> : null}
                          <span className="text-sm font-semibold text-gray-950">
                            {orderedTokenB?.symbol ?? '--'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 px-1 py-1">
                    <div className="text-base font-semibold text-gray-950">
                      {isZh ? '头寸预览' : 'Position Preview'}
                    </div>
                    <div className="mt-4 grid gap-5 px-1 md:grid-cols-2">
                      <div className="space-y-5">
                        <div>
                          <div className="text-sm text-gray-400">{isZh ? '交易对' : 'Pair'}</div>
                          <div className="mt-2 text-[1.25rem] font-semibold tracking-tight text-gray-950">
                            {pairLabel}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-400">
                            {isZh ? '资金池费率' : 'Pool fee tier'}
                          </div>
                          <div className="mt-2 text-[1.15rem] font-semibold text-gray-950">
                            {feeTier}
                          </div>
                          <div className="mt-2 whitespace-nowrap text-xs leading-5 text-gray-500">
                            {isZh
                              ? '总费率为 0.30%，其中 0.25% 分配给 LP，0.05% 进入协议金库。'
                              : 'The total fee is 0.30%, with 0.25% going to LPs and 0.05% going to the protocol treasury.'}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-5">
                        <div>
                          <div className="text-sm text-gray-400">
                            {isZh ? '最小代币一' : 'Min token A'}
                          </div>
                          <div className="mt-2 text-[1.15rem] font-semibold text-gray-950">
                            {minAmountADisplay}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-400">
                            {isZh ? '最小代币二' : 'Min token B'}
                          </div>
                          <div className="mt-2 text-[1.15rem] font-semibold text-gray-950">
                            {minAmountBDisplay}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-12">
                    <ActionButton
                      label={actionLabel}
                      disabled={actionDisabled}
                      loading={isSubmitting}
                      onClick={handleLiquidityAction}
                      className="rounded-[1.2rem] bg-[#232323] py-4 text-lg font-semibold hover:bg-black"
                    />
                    {statusMessage ? (
                      <div
                        className={`mt-3 text-sm ${
                          txError ? 'text-rose-600' : 'text-gray-500'
                        }`}
                      >
                        {statusMessage}
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

      <TokenSelectorModal
        open={selectorTarget === 'a'}
        title={isZh ? '选择第一个代币' : 'Select first token'}
        options={selectableForA}
        selectedSymbol={tokenA?.symbol}
        onSelect={(token) => {
          setTokenA(token);
        }}
        onClose={() => setSelectorTarget(null)}
      />

      <TokenSelectorModal
        open={selectorTarget === 'b'}
        title={isZh ? '选择第二个代币' : 'Select second token'}
        options={selectableForB}
        selectedSymbol={tokenB?.symbol}
        onSelect={(token) => {
          setTokenB(token);
        }}
        onClose={() => setSelectorTarget(null)}
      />

      {resetModalOpen ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]"
          onClick={() => setResetModalOpen(false)}
        >
          <div
            className="w-full max-w-[520px] rounded-[1.7rem] bg-white px-5 py-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-end">
              <button
                type="button"
                onClick={() => setResetModalOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
                aria-label={isZh ? '关闭' : 'Close'}
              >
                <X size={22} />
              </button>
            </div>

            <div className="flex flex-col items-center px-3 pb-1 pt-1 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-[1rem] bg-gray-100 text-gray-800">
                <CircleHelp size={26} />
              </div>

              <h3 className="mt-5 text-[1.65rem] font-semibold tracking-tight text-gray-950">
                {isZh ? '你确定吗？' : 'Are you sure?'}
              </h3>

              <p className="mt-2.5 text-base leading-7 text-gray-500">
                {isZh
                  ? '你的代币、价格选择将会重置。'
                  : 'Your token and price selections will be reset.'}
              </p>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setResetModalOpen(false)}
                className="inline-flex h-11 items-center justify-center rounded-[1rem] bg-gray-100 text-base font-medium text-gray-900 transition-colors hover:bg-gray-200"
              >
                {isZh ? '取消' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex h-11 items-center justify-center rounded-[1rem] bg-[#232323] text-base font-medium text-white transition-colors hover:bg-black"
              >
                {isZh ? '重置' : 'Reset'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {resultModal ? (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]"
          onClick={closeResultModal}
        >
          <div
            className="w-full max-w-[460px] rounded-[1.7rem] bg-white px-5 py-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-end">
              <button
                type="button"
                onClick={closeResultModal}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
                aria-label={isZh ? '关闭' : 'Close'}
              >
                <X size={22} />
              </button>
            </div>

            <div className="flex flex-col items-center px-3 pb-1 pt-1 text-center">
              <div
                className={`flex h-14 w-14 items-center justify-center rounded-[1rem] ${
                  resultModal.kind === 'success'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-rose-100 text-rose-700'
                }`}
              >
                <CircleHelp size={26} />
              </div>

              <h3 className="mt-5 text-[1.65rem] font-semibold tracking-tight text-gray-950">
                {resultModal.kind === 'success'
                  ? (isZh ? '添加成功' : 'Success')
                  : (isZh ? '添加失败' : 'Failed')}
              </h3>

              <p className="mt-2.5 text-base leading-7 text-gray-500">{resultModal.message}</p>
            </div>

            <div className="mt-6">
              <button
                type="button"
                onClick={closeResultModal}
                className="inline-flex h-11 w-full items-center justify-center rounded-[1rem] bg-[#232323] text-base font-medium text-white transition-colors hover:bg-black"
              >
                {resultModal.kind === 'success'
                  ? (isZh ? '确定' : 'Confirm')
                  : (isZh ? '关闭' : 'Close')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
