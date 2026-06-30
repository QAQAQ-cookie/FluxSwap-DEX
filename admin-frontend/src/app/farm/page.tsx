'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import {
  AlertCircle,
  CheckCircle2,
  CircleDollarSign,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sprout,
  Wallet,
  X,
} from 'lucide-react';
import { isAddress, type Address } from 'viem';
import { useAccount, useChainId, usePublicClient, useWriteContract } from 'wagmi';

import { getContractAddress, getLocalGasOverride, isFluxSupportedChain } from '@/config/contracts';
import { getAdminTokenOptions } from '@/config/tokens';
import { formatBigIntAmountDown, formatWeight, parseAmount } from '@/lib/amounts';
import {
  fluxMultiPoolManagerAbi,
  fluxPoolFactoryAbi,
  fluxSwapErc20Abi,
  fluxSwapFactoryAbi,
  fluxSwapPairAbi,
  fluxSwapStakingRewardsAbi,
  fluxSwapTreasuryAbi,
} from '@/lib/contracts';
import { formatErrorMessage } from '@/lib/errors';

const REFRESH_INTERVAL_MS = 8000;
const ZERO_BIGINT = BigInt(0);
const REWARD_PRECISION = BigInt(10) ** BigInt(18);
const MIN_ALLOC_POINT = BigInt(1);
const MAX_ALLOC_POINT = BigInt(1_000_000);
const ALLOC_POINT_HINT = '建议 1 - 1,000,000；系统按所有启用池权重的相对比例分配奖励。';

type PoolTuple = readonly [Address, bigint, boolean, bigint, bigint];

type TokenMeta = {
  address: Address;
  label: string;
  symbol: string;
  decimals: number;
  isLp: boolean;
};

type LpPairOption = {
  address: Address;
  label: string;
  token0Symbol: string;
  token1Symbol: string;
  alreadyFarmed: boolean;
};

type SingleTokenOption = TokenMeta & {
  alreadyFarmed: boolean;
};

type FarmRow = {
  pid: number;
  poolAddress: Address;
  stakingToken: TokenMeta;
  rewardToken: TokenMeta;
  active: boolean;
  allocPoint: bigint;
  rewardDebt: bigint;
  pendingRewards: bigint;
  managerPendingRewards: bigint;
  totalStaked: bigint;
  rewardReserve: bigint;
  queuedRewards: bigint;
};

type TreasuryStatus = {
  paused: boolean;
  rewardBalance: bigint;
  approvedSpendRemaining: bigint;
  dailySpendCap: bigint;
  spentToday: bigint;
  multisig?: Address;
  operator?: Address;
};

type AdminInfo = {
  factoryOwner?: Address;
  managerOwner?: Address;
  managerOperator?: Address;
  treasury?: Address;
  rewardToken?: TokenMeta;
  totalAllocPoint: bigint;
  totalPendingRewards: bigint;
  undistributedRewards: bigint;
  poolLength: number;
  activePoolCount: number;
  treasuryStatus?: TreasuryStatus;
  treasuryStatusError?: string;
};

type ResultModalState =
  | {
      kind: 'success' | 'error';
      title: string;
      message: string;
    }
  | null;

type ActiveAction =
  | 'create-lp'
  | 'create-single'
  | 'distribute'
  | `update-${number}`
  | null;

function shortAddress(address?: string) {
  if (!address) {
    return '--';
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function sameAddress(left?: string, right?: string) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function normalizeSymbol(symbol: string, tokenAddress: Address, wrappedNativeAddress?: Address) {
  if (wrappedNativeAddress && sameAddress(tokenAddress, wrappedNativeAddress)) {
    return 'ETH';
  }

  return symbol || 'TOKEN';
}

function formatDateTime(value = new Date()) {
  return value.toLocaleString('zh-CN', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function parseAllocPoint(value: string): bigint | null {
  const normalized = value.trim().replace(/,/g, '');

  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const allocPoint = BigInt(normalized);

  if (allocPoint < MIN_ALLOC_POINT || allocPoint > MAX_ALLOC_POINT) {
    return null;
  }

  return allocPoint;
}

function formatOptionalTokenAmount(value: bigint | undefined, token?: TokenMeta, fractionDigits = 4): string {
  if (value === undefined) {
    return '--';
  }

  return `${formatBigIntAmountDown(value, token?.decimals ?? 18, fractionDigits)} ${token?.symbol ?? ''}`.trim();
}

function Card({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </section>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{children}</label>;
}

function TextInput({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-500 disabled:bg-slate-100 disabled:text-slate-400"
    />
  );
}

function SelectInput({
  value,
  onChange,
  disabled,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-500 disabled:bg-slate-100 disabled:text-slate-400"
    >
      {children}
    </select>
  );
}

function PrimaryButton({
  children,
  disabled,
  loading,
  onClick,
  className = '',
}: {
  children: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onClick}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-500 ${className}`}
    >
      {loading ? <LoaderCircle size={16} className="animate-spin" /> : null}
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  disabled,
  loading,
  onClick,
  className = '',
}: {
  children: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onClick}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400 ${className}`}
    >
      {loading ? <LoaderCircle size={15} className="animate-spin" /> : null}
      {children}
    </button>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex h-7 items-center rounded-full px-2.5 text-xs font-semibold ${
        active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
      }`}
    >
      {active ? '启用' : '停用'}
    </span>
  );
}

function ResultModal({
  state,
  onClose,
}: {
  state: ResultModalState;
  onClose: () => void;
}) {
  if (!state) {
    return null;
  }

  const Icon = state.kind === 'success' ? CheckCircle2 : AlertCircle;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <span
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
              state.kind === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
            }`}
          >
            <Icon size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-slate-950">{state.title}</h2>
            <p className="mt-2 break-words text-sm leading-6 text-slate-600">{state.message}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminFarmPage() {
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { writeContractAsync } = useWriteContract();

  const supportedChain = isFluxSupportedChain(chainId);
  const managerAddress = getContractAddress('FluxMultiPoolManager', chainId);
  const factoryAddress = getContractAddress('FluxPoolFactory', chainId);
  const swapFactoryAddress = getContractAddress('FluxSwapFactory', chainId);
  const wrappedNativeAddress = getContractAddress('MockWETH', chainId);
  const localGasOverride = getLocalGasOverride(chainId);
  const configuredSingleTokens = useMemo(() => getAdminTokenOptions(chainId), [chainId]);

  const [mounted, setMounted] = useState(false);
  const [adminInfo, setAdminInfo] = useState<AdminInfo | null>(null);
  const [farms, setFarms] = useState<FarmRow[]>([]);
  const [lpPairOptions, setLpPairOptions] = useState<LpPairOption[]>([]);
  const [singleTokenOptions, setSingleTokenOptions] = useState<SingleTokenOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [lpManualMode, setLpManualMode] = useState(false);
  const [singleManualMode, setSingleManualMode] = useState(false);
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);
  const [resultModal, setResultModal] = useState<ResultModalState>(null);

  const [lpTokenAddress, setLpTokenAddress] = useState('');
  const [lpAllocPoint, setLpAllocPoint] = useState('100');
  const [lpActive, setLpActive] = useState(true);

  const [singleTokenAddress, setSingleTokenAddress] = useState('');
  const [singleAllocPoint, setSingleAllocPoint] = useState('100');
  const [singleActive, setSingleActive] = useState(true);

  const [rewardAmount, setRewardAmount] = useState('');
  const [poolEdits, setPoolEdits] = useState<Record<number, { allocPoint: string; active: boolean }>>({});

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMounted(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const isFactoryOwner = sameAddress(address, adminInfo?.factoryOwner);
  const isManagerOwner = sameAddress(address, adminInfo?.managerOwner);
  const isManagerOperator = sameAddress(address, adminInfo?.managerOperator);
  const canCreatePool = mounted && isConnected && isFactoryOwner && Boolean(factoryAddress);
  const canUpdatePool = mounted && isConnected && isManagerOwner && Boolean(managerAddress);
  const canDistribute = mounted && isConnected && (isManagerOwner || isManagerOperator) && Boolean(managerAddress);

  const parsedRewardAmount = adminInfo?.rewardToken
    ? parseAmount(rewardAmount, adminInfo.rewardToken.decimals)
    : undefined;

  const dailySpendRemaining = useMemo(() => {
    const treasuryStatus = adminInfo?.treasuryStatus;
    if (!treasuryStatus || treasuryStatus.dailySpendCap <= ZERO_BIGINT) {
      return undefined;
    }

    return treasuryStatus.dailySpendCap > treasuryStatus.spentToday
      ? treasuryStatus.dailySpendCap - treasuryStatus.spentToday
      : ZERO_BIGINT;
  }, [adminInfo?.treasuryStatus]);

  const distributionBlockReason = useMemo(() => {
    if (!mounted) {
      return '页面正在初始化。';
    }
    if (!isConnected) {
      return '请先连接钱包。';
    }
    if (!isManagerOwner && !isManagerOperator) {
      return '当前钱包不是 MultiPoolManager 的 owner/operator，不能分发奖励。';
    }
    if (!managerAddress || !adminInfo?.rewardToken) {
      return '奖励合约信息尚未加载完成。';
    }
    if (adminInfo.totalAllocPoint <= ZERO_BIGINT || adminInfo.activePoolCount <= 0) {
      return '暂无可分发农场，请先创建并启用质押池。';
    }
    if (adminInfo.treasuryStatusError || !adminInfo.treasuryStatus) {
      return adminInfo.treasuryStatusError ?? '金库状态尚未加载完成。';
    }
    if (adminInfo.treasuryStatus.paused) {
      return 'Treasury 当前处于暂停状态，不能拉取奖励。';
    }
    if (!parsedRewardAmount || parsedRewardAmount <= ZERO_BIGINT) {
      return '请输入大于 0 的奖励数量。';
    }
    if (parsedRewardAmount > adminInfo.treasuryStatus.rewardBalance) {
      return '金库奖励代币余额不足。';
    }
    if (parsedRewardAmount > adminInfo.treasuryStatus.approvedSpendRemaining) {
      return '金库授权给 MultiPoolManager 的可拉取额度不足。';
    }
    if (dailySpendRemaining !== undefined && parsedRewardAmount > dailySpendRemaining) {
      return '本日金库支出剩余额度不足。';
    }
    if (((parsedRewardAmount + adminInfo.undistributedRewards) * REWARD_PRECISION) / adminInfo.totalAllocPoint <= ZERO_BIGINT) {
      return '本次奖励数量太小，按当前总权重分配后会被链上拒绝。';
    }

    return null;
  }, [
    adminInfo,
    dailySpendRemaining,
    isConnected,
    isManagerOperator,
    isManagerOwner,
    managerAddress,
    mounted,
    parsedRewardAmount,
  ]);

  const canSubmitDistribution = canDistribute && distributionBlockReason === null;

  const readTokenMeta = useCallback(
    async (tokenAddress: Address): Promise<TokenMeta> => {
      if (!publicClient) {
        return {
          address: tokenAddress,
          label: shortAddress(tokenAddress),
          symbol: 'TOKEN',
          decimals: 18,
          isLp: false,
        };
      }

      try {
        const [token0, token1, decimals] = await Promise.all([
          publicClient.readContract({
            address: tokenAddress,
            abi: fluxSwapPairAbi,
            functionName: 'token0',
          }),
          publicClient.readContract({
            address: tokenAddress,
            abi: fluxSwapPairAbi,
            functionName: 'token1',
          }),
          publicClient.readContract({
            address: tokenAddress,
            abi: fluxSwapPairAbi,
            functionName: 'decimals',
          }),
        ]);

        const [token0Symbol, token1Symbol] = await Promise.all([
          publicClient.readContract({
            address: token0,
            abi: fluxSwapErc20Abi,
            functionName: 'symbol',
          }),
          publicClient.readContract({
            address: token1,
            abi: fluxSwapErc20Abi,
            functionName: 'symbol',
          }),
        ]);

        const normalizedToken0 = normalizeSymbol(token0Symbol, token0, wrappedNativeAddress);
        const normalizedToken1 = normalizeSymbol(token1Symbol, token1, wrappedNativeAddress);

        return {
          address: tokenAddress,
          label: `${normalizedToken0} / ${normalizedToken1}`,
          symbol: `${normalizedToken0}-${normalizedToken1} LP`,
          decimals: Number(decimals),
          isLp: true,
        };
      } catch {
        const [symbolResult, decimalsResult] = await Promise.allSettled([
          publicClient.readContract({
            address: tokenAddress,
            abi: fluxSwapErc20Abi,
            functionName: 'symbol',
          }),
          publicClient.readContract({
            address: tokenAddress,
            abi: fluxSwapErc20Abi,
            functionName: 'decimals',
          }),
        ]);

        const symbol =
          symbolResult.status === 'fulfilled'
            ? normalizeSymbol(symbolResult.value, tokenAddress, wrappedNativeAddress)
            : 'TOKEN';
        const decimals = decimalsResult.status === 'fulfilled' ? Number(decimalsResult.value) : 18;

        return {
          address: tokenAddress,
          label: symbol,
          symbol,
          decimals,
          isLp: false,
        };
      }
    },
    [publicClient, wrappedNativeAddress],
  );

  const loadAdminData = useCallback(
    async ({ background = false }: { background?: boolean } = {}) => {
      if (!publicClient || !supportedChain || !managerAddress || !factoryAddress) {
        setAdminInfo(null);
        setFarms([]);
        setLoading(false);
        setError(supportedChain ? '当前链缺少管理合约地址。' : '当前网络暂不支持 FluxSwap 管理端。');
        return;
      }

      if (!background) {
        setLoading(true);
      }
      setError(null);

      try {
        const [
          factoryOwner,
          managerOwner,
          managerOperator,
          treasury,
          rewardToken,
          totalAllocPoint,
          totalPendingRewards,
          undistributedRewards,
          poolLength,
        ] = await Promise.all([
            publicClient.readContract({
              address: factoryAddress,
              abi: fluxPoolFactoryAbi,
              functionName: 'owner',
            }),
            publicClient.readContract({
              address: managerAddress,
              abi: fluxMultiPoolManagerAbi,
              functionName: 'owner',
            }),
            publicClient.readContract({
              address: managerAddress,
              abi: fluxMultiPoolManagerAbi,
              functionName: 'operator',
            }),
            publicClient.readContract({
              address: managerAddress,
              abi: fluxMultiPoolManagerAbi,
              functionName: 'treasury',
            }),
            publicClient.readContract({
              address: managerAddress,
              abi: fluxMultiPoolManagerAbi,
              functionName: 'rewardToken',
            }),
            publicClient.readContract({
              address: managerAddress,
              abi: fluxMultiPoolManagerAbi,
              functionName: 'totalAllocPoint',
            }),
            publicClient.readContract({
              address: managerAddress,
              abi: fluxMultiPoolManagerAbi,
              functionName: 'totalPendingRewards',
            }),
            publicClient.readContract({
              address: managerAddress,
              abi: fluxMultiPoolManagerAbi,
              functionName: 'undistributedRewards',
            }),
            publicClient.readContract({
              address: managerAddress,
              abi: fluxMultiPoolManagerAbi,
              functionName: 'poolLength',
            }),
          ]);

        const rewardTokenMeta = await readTokenMeta(rewardToken);
        const poolCount = Number(poolLength);
        const poolRows = await Promise.all(
          Array.from({ length: poolCount }, async (_, index) => {
            const poolData = (await publicClient.readContract({
              address: managerAddress,
              abi: fluxMultiPoolManagerAbi,
              functionName: 'pools',
              args: [BigInt(index)],
            })) as PoolTuple;

            const [poolAddress, allocPoint, active, rewardDebt, pendingRewards] = poolData;
            const [stakingToken, rewardsToken, totalStaked, rewardReserve, queuedRewards, managerPendingRewards] =
              await Promise.all([
                publicClient.readContract({
                  address: poolAddress,
                  abi: fluxSwapStakingRewardsAbi,
                  functionName: 'stakingToken',
                }),
                publicClient.readContract({
                  address: poolAddress,
                  abi: fluxSwapStakingRewardsAbi,
                  functionName: 'rewardsToken',
                }),
                publicClient.readContract({
                  address: poolAddress,
                  abi: fluxSwapStakingRewardsAbi,
                  functionName: 'totalStaked',
                }),
                publicClient.readContract({
                  address: poolAddress,
                  abi: fluxSwapStakingRewardsAbi,
                  functionName: 'rewardReserve',
                }),
                publicClient.readContract({
                  address: poolAddress,
                  abi: fluxSwapStakingRewardsAbi,
                  functionName: 'queuedRewards',
                }),
                publicClient.readContract({
                  address: managerAddress,
                  abi: fluxMultiPoolManagerAbi,
                  functionName: 'pendingPoolRewards',
                  args: [poolAddress],
                }),
              ]);

            const [stakingTokenMeta, poolRewardTokenMeta] = await Promise.all([
              readTokenMeta(stakingToken),
              readTokenMeta(rewardsToken),
            ]);

            return {
              pid: index,
              poolAddress,
              stakingToken: stakingTokenMeta,
              rewardToken: poolRewardTokenMeta,
              active,
              allocPoint,
              rewardDebt,
              pendingRewards,
              managerPendingRewards,
              totalStaked,
              rewardReserve,
              queuedRewards,
            };
          }),
        );
        const existingStakingTokens = new Set(
          poolRows.map((farm) => farm.stakingToken.address.toLowerCase()),
        );
        const pairCount =
          swapFactoryAddress !== undefined
            ? Number(
                await publicClient.readContract({
                  address: swapFactoryAddress,
                  abi: fluxSwapFactoryAbi,
                  functionName: 'allPairsLength',
                }),
              )
            : 0;
        const lpOptions = await Promise.all(
          Array.from({ length: pairCount }, async (_, index) => {
            const pairAddress = await publicClient.readContract({
              address: swapFactoryAddress!,
              abi: fluxSwapFactoryAbi,
              functionName: 'allPairs',
              args: [BigInt(index)],
            });
            const pairMeta = await readTokenMeta(pairAddress);
            const [token0Symbol, token1Symbol] = pairMeta.label.includes(' / ')
              ? (pairMeta.label.split(' / ') as [string, string])
              : [pairMeta.symbol, 'LP'];

            return {
              address: pairAddress,
              label: pairMeta.label,
              token0Symbol,
              token1Symbol,
              alreadyFarmed: existingStakingTokens.has(pairAddress.toLowerCase()),
            } satisfies LpPairOption;
          }),
        );
        const treasuryReads = await Promise.allSettled([
          publicClient.readContract({
            address: rewardToken,
            abi: fluxSwapErc20Abi,
            functionName: 'balanceOf',
            args: [treasury],
          }),
          publicClient.readContract({
            address: treasury,
            abi: fluxSwapTreasuryAbi,
            functionName: 'approvedSpendRemaining',
            args: [rewardToken, managerAddress],
          }),
          publicClient.readContract({
            address: treasury,
            abi: fluxSwapTreasuryAbi,
            functionName: 'dailySpendCap',
            args: [rewardToken],
          }),
          publicClient.readContract({
            address: treasury,
            abi: fluxSwapTreasuryAbi,
            functionName: 'spentToday',
            args: [rewardToken],
          }),
          publicClient.readContract({
            address: treasury,
            abi: fluxSwapTreasuryAbi,
            functionName: 'paused',
          }),
          publicClient.readContract({
            address: treasury,
            abi: fluxSwapTreasuryAbi,
            functionName: 'multisig',
          }),
          publicClient.readContract({
            address: treasury,
            abi: fluxSwapTreasuryAbi,
            functionName: 'operator',
          }),
        ]);
        let treasuryStatus: TreasuryStatus | undefined;
        if (treasuryReads.every((result) => result.status === 'fulfilled')) {
          const [
            rewardBalanceResult,
            approvedSpendRemainingResult,
            dailySpendCapResult,
            spentTodayResult,
            pausedResult,
            multisigResult,
            operatorResult,
          ] = treasuryReads as [
            PromiseFulfilledResult<bigint>,
            PromiseFulfilledResult<bigint>,
            PromiseFulfilledResult<bigint>,
            PromiseFulfilledResult<bigint>,
            PromiseFulfilledResult<boolean>,
            PromiseFulfilledResult<Address>,
            PromiseFulfilledResult<Address>,
          ];

          treasuryStatus = {
            rewardBalance: rewardBalanceResult.value,
            approvedSpendRemaining: approvedSpendRemainingResult.value,
            dailySpendCap: dailySpendCapResult.value,
            spentToday: spentTodayResult.value,
            paused: pausedResult.value,
            multisig: multisigResult.value,
            operator: operatorResult.value,
          };
        }
        const singleOptions = configuredSingleTokens.map((token) => ({
          address: token.address,
          label: token.symbol,
          symbol: token.symbol,
          decimals: token.decimals,
          isLp: false,
          alreadyFarmed: existingStakingTokens.has(token.address.toLowerCase()),
        })) satisfies SingleTokenOption[];

        setAdminInfo({
          factoryOwner,
          managerOwner,
          managerOperator,
          treasury,
          rewardToken: rewardTokenMeta,
          totalAllocPoint,
          totalPendingRewards,
          undistributedRewards,
          poolLength: poolCount,
          activePoolCount: poolRows.filter((farm) => farm.active && farm.allocPoint > ZERO_BIGINT).length,
          treasuryStatus,
          treasuryStatusError: treasuryStatus ? undefined : '金库状态读取失败，请检查 Treasury 合约或 RPC 状态。',
        });
        setFarms(poolRows);
        setLpPairOptions(lpOptions);
        setSingleTokenOptions(singleOptions);
        setLpTokenAddress((current) => {
          if (current && (lpManualMode || lpOptions.some((option) => sameAddress(option.address, current)))) {
            return current;
          }

          return lpOptions.find((option) => !option.alreadyFarmed)?.address ?? lpOptions[0]?.address ?? '';
        });
        setSingleTokenAddress((current) => {
          if (
            current &&
            (singleManualMode || singleOptions.some((option) => sameAddress(option.address, current)))
          ) {
            return current;
          }

          return singleOptions.find((option) => !option.alreadyFarmed)?.address ?? singleOptions[0]?.address ?? '';
        });
        setPoolEdits((current) => {
          const next = { ...current };
          for (const farm of poolRows) {
            if (!next[farm.pid]) {
              next[farm.pid] = {
                allocPoint: farm.allocPoint.toString(),
                active: farm.active,
              };
            }
          }

          return next;
        });
        setLastUpdatedAt(new Date());
      } catch (loadError) {
        setError(formatErrorMessage(loadError));
      } finally {
        setLoading(false);
      }
    },
    [
      configuredSingleTokens,
      factoryAddress,
      lpManualMode,
      managerAddress,
      publicClient,
      readTokenMeta,
      singleManualMode,
      supportedChain,
      swapFactoryAddress,
    ],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAdminData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadAdminData]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadAdminData({ background: true });
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [loadAdminData]);

  const filteredFarms = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return farms.filter((farm) => {
      if (activeOnly && !farm.active) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return (
        farm.stakingToken.label.toLowerCase().includes(normalizedQuery) ||
        farm.poolAddress.toLowerCase().includes(normalizedQuery) ||
        farm.stakingToken.address.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [activeOnly, farms, searchQuery]);

  const runTransaction = useCallback(
    async (action: ActiveAction, title: string, tx: () => Promise<Address | `0x${string}`>) => {
      if (!publicClient) {
        setResultModal({
          kind: 'error',
          title: '无法提交交易',
          message: '当前 RPC 客户端尚未准备好，请稍后再试。',
        });
        return;
      }

      setActiveAction(action);

      try {
        const hash = await tx();
        await publicClient.waitForTransactionReceipt({ hash });
        setResultModal({
          kind: 'success',
          title,
          message: `交易已确认：${shortAddress(hash)}`,
        });
        await loadAdminData({ background: true });
      } catch (txError) {
        setResultModal({
          kind: 'error',
          title: '操作失败',
          message: formatErrorMessage(txError),
        });
      } finally {
        setActiveAction(null);
      }
    },
    [loadAdminData, publicClient],
  );

  const handleCreateLpPool = useCallback(() => {
    if (!factoryAddress || !isAddress(lpTokenAddress)) {
      setResultModal({ kind: 'error', title: '参数无效', message: '请输入有效的 LP Token 地址。' });
      return;
    }

    const selectedPair = lpPairOptions.find((option) => sameAddress(option.address, lpTokenAddress));
    if (selectedPair?.alreadyFarmed) {
      setResultModal({ kind: 'error', title: '质押池已存在', message: `${selectedPair.label} 已经创建过质押池。` });
      return;
    }

    const allocPoint = parseAllocPoint(lpAllocPoint);
    if (allocPoint === null) {
      setResultModal({ kind: 'error', title: '参数无效', message: '奖励权重请输入 1 到 1,000,000 之间的整数。' });
      return;
    }

    void runTransaction('create-lp', 'LP 质押池创建成功', () =>
      writeContractAsync({
        address: factoryAddress,
        abi: fluxPoolFactoryAbi,
        functionName: 'createLPPool',
        args: [lpTokenAddress as Address, allocPoint, lpActive],
        ...localGasOverride,
      }),
    );
  }, [
    factoryAddress,
    localGasOverride,
    lpActive,
    lpAllocPoint,
    lpPairOptions,
    lpTokenAddress,
    runTransaction,
    writeContractAsync,
  ]);

  const handleCreateSinglePool = useCallback(() => {
    if (!factoryAddress || !isAddress(singleTokenAddress)) {
      setResultModal({ kind: 'error', title: '参数无效', message: '请输入有效的单币 Token 地址。' });
      return;
    }

    const selectedToken = singleTokenOptions.find((option) => sameAddress(option.address, singleTokenAddress));
    if (selectedToken?.alreadyFarmed) {
      setResultModal({ kind: 'error', title: '质押池已存在', message: `${selectedToken.symbol} 已经创建过质押池。` });
      return;
    }

    const allocPoint = parseAllocPoint(singleAllocPoint);
    if (allocPoint === null) {
      setResultModal({ kind: 'error', title: '参数无效', message: '奖励权重请输入 1 到 1,000,000 之间的整数。' });
      return;
    }

    void runTransaction('create-single', '单币质押池创建成功', () =>
      writeContractAsync({
        address: factoryAddress,
        abi: fluxPoolFactoryAbi,
        functionName: 'createSingleTokenPool',
        args: [singleTokenAddress as Address, allocPoint, singleActive],
        ...localGasOverride,
      }),
    );
  }, [
    factoryAddress,
    localGasOverride,
    runTransaction,
    singleActive,
    singleAllocPoint,
    singleTokenOptions,
    singleTokenAddress,
    writeContractAsync,
  ]);

  const handleDistributeRewards = useCallback(() => {
    if (!managerAddress || !adminInfo?.rewardToken) {
      setResultModal({ kind: 'error', title: '参数无效', message: '奖励合约信息尚未加载完成。' });
      return;
    }

    if (distributionBlockReason || !parsedRewardAmount) {
      setResultModal({
        kind: 'error',
        title: '暂不能分发奖励',
        message: distributionBlockReason ?? '请输入有效的奖励数量。',
      });
      return;
    }

    void runTransaction('distribute', '奖励分发成功', () =>
      writeContractAsync({
        address: managerAddress,
        abi: fluxMultiPoolManagerAbi,
        functionName: 'distributeRewards',
        args: [parsedRewardAmount],
        ...localGasOverride,
      }),
    );
  }, [
    adminInfo?.rewardToken,
    distributionBlockReason,
    localGasOverride,
    managerAddress,
    parsedRewardAmount,
    runTransaction,
    writeContractAsync,
  ]);

  const handleUpdatePool = useCallback(
    (farm: FarmRow) => {
      if (!managerAddress) {
        return;
      }

      const edit = poolEdits[farm.pid];
      const allocPoint = parseAllocPoint(edit?.allocPoint ?? '');
      if (allocPoint === null) {
        setResultModal({ kind: 'error', title: '参数无效', message: '奖励权重请输入 1 到 1,000,000 之间的整数。' });
        return;
      }

      void runTransaction(`update-${farm.pid}`, '农场配置已更新', () =>
        writeContractAsync({
          address: managerAddress,
          abi: fluxMultiPoolManagerAbi,
          functionName: 'setPool',
          args: [BigInt(farm.pid), allocPoint, edit?.active ?? farm.active],
          ...localGasOverride,
        }),
      );
    },
    [localGasOverride, managerAddress, poolEdits, runTransaction, writeContractAsync],
  );

  const connectButton = (
    <PrimaryButton onClick={openConnectModal ?? undefined} disabled={!mounted || isConnected}>
      <Wallet size={16} />
      连接钱包
    </PrimaryButton>
  );

  return (
    <>
      <ResultModal state={resultModal} onClose={() => setResultModal(null)} />

      <div className="space-y-8">
        <section className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Farms</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
              农场与奖励管理
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              用来创建 LP/单币质押池、调整奖励权重、启停农场，以及把 FLUX 奖励分发到 MultiPoolManager。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {lastUpdatedAt ? (
              <span className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                最近刷新：{formatDateTime(lastUpdatedAt)}
              </span>
            ) : null}
            <SecondaryButton onClick={() => void loadAdminData()} loading={loading}>
              <RefreshCw size={15} />
              刷新
            </SecondaryButton>
            {!mounted || !isConnected ? connectButton : null}
          </div>
        </section>

        {error ? (
          <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <AlertCircle size={18} />
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="p-5">
            <p className="text-sm text-slate-500">总农场数</p>
            <p className="mt-3 text-2xl font-semibold text-slate-950">{adminInfo?.poolLength ?? 0}</p>
          </Card>
          <Card className="p-5">
            <p className="text-sm text-slate-500">启用中</p>
            <p className="mt-3 text-2xl font-semibold text-slate-950">{farms.filter((farm) => farm.active).length}</p>
          </Card>
          <Card className="p-5">
            <p className="text-sm text-slate-500">总权重</p>
            <p className="mt-3 text-2xl font-semibold text-slate-950">
              {adminInfo?.totalAllocPoint.toString() ?? '0'}
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-sm text-slate-500">待分发奖励</p>
            <p className="mt-3 text-2xl font-semibold text-slate-950">
              {formatBigIntAmountDown(adminInfo?.totalPendingRewards, adminInfo?.rewardToken?.decimals ?? 18, 4)}
            </p>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <div className="border-b border-slate-200 p-5">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">权限与合约状态</h2>
                <p className="mt-1 text-sm text-slate-500">当前钱包需要具备对应 owner/operator 权限才能执行管理操作。</p>
              </div>
              <span
                className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold ${
                  isFactoryOwner || isManagerOwner || isManagerOperator
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-amber-50 text-amber-700'
                }`}
              >
                {isFactoryOwner || isManagerOwner || isManagerOperator ? '当前钱包有管理权限' : '当前钱包暂无管理权限'}
              </span>
            </div>
          </div>
          <div className="grid gap-0 divide-y divide-slate-200 md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-4">
            <div className="p-5">
              <p className="text-xs text-slate-500">Factory Owner</p>
              <p className="mt-2 font-mono text-sm text-slate-900">{shortAddress(adminInfo?.factoryOwner)}</p>
              <p className="mt-2 text-xs text-slate-500">{isFactoryOwner ? '可创建质押池' : '创建池需要此权限'}</p>
            </div>
            <div className="p-5">
              <p className="text-xs text-slate-500">Manager Owner</p>
              <p className="mt-2 font-mono text-sm text-slate-900">{shortAddress(adminInfo?.managerOwner)}</p>
              <p className="mt-2 text-xs text-slate-500">{isManagerOwner ? '可调整池权重/启停' : '调整池需要此权限'}</p>
            </div>
            <div className="p-5">
              <p className="text-xs text-slate-500">Manager Operator</p>
              <p className="mt-2 font-mono text-sm text-slate-900">{shortAddress(adminInfo?.managerOperator)}</p>
              <p className="mt-2 text-xs text-slate-500">{isManagerOperator ? '可分发奖励' : '奖励分发需要 owner/operator'}</p>
            </div>
            <div className="p-5">
              <p className="text-xs text-slate-500">Treasury</p>
              <p className="mt-2 font-mono text-sm text-slate-900">{shortAddress(adminInfo?.treasury)}</p>
              <p className="mt-2 text-xs text-slate-500">
                Operator：{shortAddress(adminInfo?.treasuryStatus?.operator)}
              </p>
            </div>
          </div>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="flex h-full flex-col p-5">
            <div className="mb-5 flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                <Plus size={19} />
              </span>
              <div>
                <h2 className="font-semibold text-slate-950">创建 LP 质押池</h2>
                <p className="text-sm text-slate-500">用于 LP Token 农场</p>
              </div>
            </div>
            <div className="flex flex-1 flex-col space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <FieldLabel>{lpManualMode ? 'LP Token 地址' : '选择交易对'}</FieldLabel>
                  <button
                    type="button"
                    onClick={() => setLpManualMode((current) => !current)}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-900"
                  >
                    {lpManualMode ? '使用列表选择' : '手动输入'}
                  </button>
                </div>
                {lpManualMode ? (
                  <TextInput
                    value={lpTokenAddress}
                    onChange={setLpTokenAddress}
                    placeholder="0x..."
                    disabled={!canCreatePool}
                  />
                ) : (
                  <SelectInput value={lpTokenAddress} onChange={setLpTokenAddress} disabled={!canCreatePool}>
                    {lpPairOptions.length === 0 ? <option value="">暂无可选交易对</option> : null}
                    {lpPairOptions.map((option) => (
                      <option key={option.address} value={option.address}>
                        {option.label}
                        {option.alreadyFarmed ? '（已创建）' : ''}
                      </option>
                    ))}
                  </SelectInput>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <FieldLabel>奖励权重</FieldLabel>
                  <label className="inline-flex shrink-0 items-center gap-2 text-sm font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={lpActive}
                      disabled={!canCreatePool}
                      onChange={(event) => setLpActive(event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    创建后启用
                  </label>
                </div>
                <TextInput value={lpAllocPoint} onChange={setLpAllocPoint} placeholder="100" disabled={!canCreatePool} />
                <p className="text-xs leading-5 text-slate-500">{ALLOC_POINT_HINT}</p>
              </div>
              <PrimaryButton
                onClick={handleCreateLpPool}
                disabled={!canCreatePool}
                loading={activeAction === 'create-lp'}
                className="mt-auto w-full"
              >
                创建 LP 池
              </PrimaryButton>
            </div>
          </Card>

          <Card className="flex h-full flex-col p-5">
            <div className="mb-5 flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Sprout size={19} />
              </span>
              <div>
                <h2 className="font-semibold text-slate-950">创建单币质押池</h2>
                <p className="text-sm text-slate-500">用于 FLUX、USDC 等单币锁仓</p>
              </div>
            </div>
            <div className="flex flex-1 flex-col space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <FieldLabel>{singleManualMode ? 'Token 地址' : '选择代币'}</FieldLabel>
                  <button
                    type="button"
                    onClick={() => setSingleManualMode((current) => !current)}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-900"
                  >
                    {singleManualMode ? '使用列表选择' : '手动输入'}
                  </button>
                </div>
                {singleManualMode ? (
                  <TextInput
                    value={singleTokenAddress}
                    onChange={setSingleTokenAddress}
                    placeholder="0x..."
                    disabled={!canCreatePool}
                  />
                ) : (
                  <SelectInput value={singleTokenAddress} onChange={setSingleTokenAddress} disabled={!canCreatePool}>
                    {singleTokenOptions.length === 0 ? <option value="">暂无可选代币</option> : null}
                    {singleTokenOptions.map((option) => (
                      <option key={option.address} value={option.address}>
                        {option.symbol}
                        {option.alreadyFarmed ? '（已创建）' : ''}
                      </option>
                    ))}
                  </SelectInput>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <FieldLabel>奖励权重</FieldLabel>
                  <label className="inline-flex shrink-0 items-center gap-2 text-sm font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={singleActive}
                      disabled={!canCreatePool}
                      onChange={(event) => setSingleActive(event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    创建后启用
                  </label>
                </div>
                <TextInput
                  value={singleAllocPoint}
                  onChange={setSingleAllocPoint}
                  placeholder="100"
                  disabled={!canCreatePool}
                />
                <p className="text-xs leading-5 text-slate-500">{ALLOC_POINT_HINT}</p>
              </div>
              <PrimaryButton
                onClick={handleCreateSinglePool}
                disabled={!canCreatePool}
                loading={activeAction === 'create-single'}
                className="mt-auto w-full"
              >
                创建单币池
              </PrimaryButton>
            </div>
          </Card>
        </div>

        <Card className="p-5">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                  <CircleDollarSign size={19} />
                </span>
                <div>
                  <h2 className="font-semibold text-slate-950">分发奖励</h2>
                  <p className="text-sm text-slate-500">把可用奖励分配到农场</p>
                </div>
              </div>

              <span
                className={`inline-flex min-h-8 w-fit max-w-full items-center rounded-full px-3 py-1 text-xs font-semibold leading-5 ${
                  distributionBlockReason ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                {distributionBlockReason ? `暂不能分发：${distributionBlockReason}` : '可以分发'}
              </span>
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.72fr)_1.28fr]">
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <FieldLabel>奖励数量</FieldLabel>
                    <TextInput value={rewardAmount} onChange={setRewardAmount} placeholder="0.0" disabled={!canDistribute} />
                  </div>
                  <PrimaryButton
                    onClick={handleDistributeRewards}
                    disabled={!canSubmitDistribution}
                    loading={activeAction === 'distribute'}
                    className="w-full"
                  >
                    分发奖励
                  </PrimaryButton>
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs text-slate-500">奖励代币</p>
                    <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                      {adminInfo?.rewardToken?.symbol ?? 'FLUX'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs text-slate-500">待分发</p>
                    <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                      {formatBigIntAmountDown(adminInfo?.totalPendingRewards, adminInfo?.rewardToken?.decimals ?? 18, 4)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs text-slate-500">启用农场</p>
                    <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                      {adminInfo?.activePoolCount ?? 0} / {adminInfo?.poolLength ?? 0}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs text-slate-500">金库余额</p>
                    <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                      {formatOptionalTokenAmount(adminInfo?.treasuryStatus?.rewardBalance, adminInfo?.rewardToken)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs text-slate-500">已授权额度</p>
                    <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                      {formatOptionalTokenAmount(adminInfo?.treasuryStatus?.approvedSpendRemaining, adminInfo?.rewardToken)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs text-slate-500">今日剩余额度</p>
                    <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                      {dailySpendRemaining === undefined
                        ? '未设置上限'
                        : formatOptionalTokenAmount(dailySpendRemaining, adminInfo?.rewardToken)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs text-slate-500">金库状态</p>
                    <p
                      className={`mt-1 truncate text-sm font-semibold ${
                        adminInfo?.treasuryStatus?.paused ? 'text-rose-600' : 'text-emerald-600'
                      }`}
                    >
                      {adminInfo?.treasuryStatus ? (adminInfo.treasuryStatus.paused ? '已暂停' : '正常') : '--'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs text-slate-500">金库 Operator</p>
                    <p className="mt-1 truncate font-mono text-sm font-semibold text-slate-900">
                      {shortAddress(adminInfo?.treasuryStatus?.operator)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-slate-200 p-5">
            <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">农场列表</h2>
                <p className="mt-1 text-sm text-slate-500">查看所有质押池，调整权重和启停状态。</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-full sm:w-72">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="搜索交易对、池地址或 Token 地址"
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-slate-500"
                  />
                </div>
                <label className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={activeOnly}
                    onChange={(event) => setActiveOnly(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  只看启用
                </label>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1120px] w-full border-collapse text-left">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-5 py-3">农场</th>
                  <th className="px-5 py-3">状态</th>
                  <th className="px-5 py-3">当前权重</th>
                  <th className="px-5 py-3">质押总量</th>
                  <th className="px-5 py-3">待领取奖励</th>
                  <th className="px-5 py-3">池内奖励</th>
                  <th className="px-5 py-3">编辑</th>
                  <th className="px-5 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading && farms.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-sm text-slate-500">
                      <LoaderCircle size={18} className="mx-auto mb-2 animate-spin" />
                      正在加载农场数据
                    </td>
                  </tr>
                ) : filteredFarms.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-sm text-slate-500">
                      暂无农场数据
                    </td>
                  </tr>
                ) : (
                  filteredFarms.map((farm) => {
                    const edit = poolEdits[farm.pid] ?? {
                      allocPoint: farm.allocPoint.toString(),
                      active: farm.active,
                    };
                    const rewardDecimals = farm.rewardToken.decimals || adminInfo?.rewardToken?.decimals || 18;

                    return (
                      <tr key={`${farm.pid}-${farm.poolAddress}`} className="align-middle">
                        <td className="px-5 py-4">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                              {farm.stakingToken.isLp ? <Sprout size={18} /> : <CircleDollarSign size={18} />}
                            </span>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-950">{farm.stakingToken.label}</p>
                              <p className="mt-1 font-mono text-xs text-slate-500">
                                PID {farm.pid} · {shortAddress(farm.poolAddress)}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <StatusBadge active={farm.active} />
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-semibold text-slate-900">{farm.allocPoint.toString()}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            占比 {formatWeight(farm.allocPoint, adminInfo?.totalAllocPoint ?? ZERO_BIGINT)}
                          </p>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-700">
                          {formatBigIntAmountDown(farm.totalStaked, farm.stakingToken.decimals, 4)}
                          <span className="ml-1 text-xs text-slate-400">{farm.stakingToken.symbol}</span>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-700">
                          {formatBigIntAmountDown(farm.managerPendingRewards + farm.pendingRewards, rewardDecimals, 4)}
                          <span className="ml-1 text-xs text-slate-400">{farm.rewardToken.symbol}</span>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-700">
                          {formatBigIntAmountDown(farm.rewardReserve + farm.queuedRewards, rewardDecimals, 4)}
                          <span className="ml-1 text-xs text-slate-400">{farm.rewardToken.symbol}</span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex min-w-[210px] items-center gap-2">
                            <div className="space-y-1">
                              <input
                                value={edit.allocPoint}
                                disabled={!canUpdatePool}
                                onChange={(event) =>
                                  setPoolEdits((current) => ({
                                    ...current,
                                    [farm.pid]: {
                                      ...edit,
                                      allocPoint: event.target.value,
                                    },
                                  }))
                                }
                                title={ALLOC_POINT_HINT}
                                className="h-10 w-24 rounded-xl border border-slate-200 px-3 text-sm outline-none transition focus:border-slate-500 disabled:bg-slate-100 disabled:text-slate-400"
                              />
                              <p className="text-[11px] text-slate-400">1 - 1,000,000</p>
                            </div>
                            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                              <input
                                type="checkbox"
                                checked={edit.active}
                                disabled={!canUpdatePool}
                                onChange={(event) =>
                                  setPoolEdits((current) => ({
                                    ...current,
                                    [farm.pid]: {
                                      ...edit,
                                      active: event.target.checked,
                                    },
                                  }))
                                }
                                className="h-4 w-4 rounded border-slate-300"
                              />
                              启用
                            </label>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <SecondaryButton
                            onClick={() => handleUpdatePool(farm)}
                            disabled={!canUpdatePool}
                            loading={activeAction === `update-${farm.pid}`}
                          >
                            <Settings2 size={15} />
                            保存
                          </SecondaryButton>
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
    </>
  );
}
