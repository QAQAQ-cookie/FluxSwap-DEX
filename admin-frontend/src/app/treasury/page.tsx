'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  LoaderCircle,
  PauseCircle,
  Play,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Vault,
  Wallet,
  X,
} from 'lucide-react';
import { isAddress, type Address, type Hex } from 'viem';
import { useAccount, useChainId, usePublicClient, useWriteContract } from 'wagmi';

import { Card, PageHeader, shortAddress, StatusPill } from '@/components/AdminPrimitives';
import { getContractAddress, getLocalGasOverride, isFluxSupportedChain } from '@/config/contracts';
import { getAdminTokenOptions } from '@/config/tokens';
import { formatBigIntAmountDown, parseAmount } from '@/lib/amounts';
import { fluxSwapErc20Abi, fluxSwapTreasuryAbi } from '@/lib/contracts';
import { formatErrorMessage } from '@/lib/errors';

const ZERO_BIGINT = BigInt(0);
const EVENT_LOOKBACK_BLOCKS = BigInt(20_000);
const TREASURY_OPERATION_STORAGE_PREFIX = 'fluxswap-admin:treasury-operations';

function sameAddress(left?: string, right?: string) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

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
  metadata?: TreasuryOperationMetadata;
};

type TreasuryRiskRow = {
  token: TreasuryTokenRow;
  risk: 'danger' | 'warning' | 'success' | 'neutral';
  reason: string;
  spendRatio?: number;
};

type TreasuryOperationKind =
  | 'setAllowedToken'
  | 'setAllowedRecipient'
  | 'setDailySpendCap'
  | 'approveSpender'
  | 'revokeSpender'
  | 'setGuardian'
  | 'setOperator'
  | 'setMinDelay';

type TreasuryOperationMetadata = {
  version: 1;
  chainId: number;
  treasuryAddress: Address;
  operationId: Hex;
  kind: TreasuryOperationKind;
  label: string;
  summary: string;
  params: {
    token?: Address;
    tokenSymbol?: string;
    allowed?: boolean;
    recipient?: Address;
    spender?: Address;
    amountUnits?: string;
    amountDisplay?: string;
    newGuardian?: Address;
    newOperator?: Address;
    newMinDelay?: string;
  };
  createdAt: number;
};

type ResultModalState =
  | {
      kind: 'success' | 'error';
      title: string;
      message: string;
    }
  | null;

type ConfirmModalState =
  | {
      title: string;
      message: string;
      tone?: 'danger' | 'default';
      confirmLabel: string;
      action: () => void;
    }
  | null;

type ActiveTreasuryAction = 'schedule' | 'pause' | 'unpause' | `execute:${string}` | `cancel:${string}` | null;

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

function formatMetadataValue(value?: string | boolean) {
  if (value === undefined) {
    return '--';
  }

  if (typeof value === 'boolean') {
    return value ? '允许' : '移除';
  }

  return value;
}

function buildOperationDetailItems(operation: TreasuryOperationRow) {
  const metadata = operation.metadata;

  if (!metadata) {
    return [
      { label: '操作 ID', value: operation.operationId },
      { label: '元数据状态', value: '缺少本地参数元数据' },
      { label: '可执行时间', value: formatUnixTime(operation.executeAfter) },
      { label: '发起人', value: operation.scheduler ?? '--' },
    ];
  }

  const items: Array<{ label: string; value: string }> = [
    { label: '操作 ID', value: metadata.operationId },
    { label: '元数据状态', value: '已记录' },
    { label: '本地创建时间', value: new Date(metadata.createdAt).toLocaleString('zh-CN', { hour12: false }) },
    { label: '可执行时间', value: formatUnixTime(operation.executeAfter) },
    { label: '发起人', value: operation.scheduler ?? '--' },
  ];

  if (metadata.params.token) {
    items.push({ label: '资产地址', value: metadata.params.token });
  }
  if (metadata.params.tokenSymbol) {
    items.push({ label: '资产符号', value: metadata.params.tokenSymbol });
  }
  if (metadata.params.recipient) {
    items.push({ label: '接收地址', value: metadata.params.recipient });
  }
  if (metadata.params.spender) {
    items.push({ label: '花费者地址', value: metadata.params.spender });
  }
  if (metadata.params.newGuardian) {
    items.push({ label: '新 Guardian', value: metadata.params.newGuardian });
  }
  if (metadata.params.newOperator) {
    items.push({ label: '新 Operator', value: metadata.params.newOperator });
  }
  if (metadata.params.allowed !== undefined) {
    items.push({ label: '白名单状态', value: formatMetadataValue(metadata.params.allowed) });
  }
  if (metadata.params.amountDisplay) {
    items.push({ label: '数量', value: metadata.params.amountDisplay });
  }
  if (metadata.params.amountUnits) {
    items.push({ label: '链上数量', value: metadata.params.amountUnits });
  }
  if (metadata.params.newMinDelay) {
    items.push({ label: '新治理延迟（秒）', value: metadata.params.newMinDelay });
  }

  return items;
}

function isChainValue(value: string) {
  return /^0x[0-9a-fA-F]{20,}$/.test(value);
}

function OperationDetailValue({ value }: { value: string }) {
  if (isChainValue(value)) {
    return (
      <div className="mt-1 min-w-0">
        <p className="font-mono text-sm leading-6 text-slate-900">{shortAddress(value)}</p>
        <p className="mt-0.5 break-all font-mono text-xs leading-5 text-slate-500">{value}</p>
      </div>
    );
  }

  return <p className="mt-1 break-words text-sm leading-6 text-slate-800">{value}</p>;
}

function getTreasuryOperationStorageKey(chainId: number, treasuryAddress: Address) {
  return `${TREASURY_OPERATION_STORAGE_PREFIX}:${chainId}:${treasuryAddress.toLowerCase()}`;
}

function loadTreasuryOperationMetadata(chainId: number, treasuryAddress: Address) {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const rawValue = window.localStorage.getItem(getTreasuryOperationStorageKey(chainId, treasuryAddress));
    if (!rawValue) {
      return {};
    }

    const parsed = JSON.parse(rawValue) as Record<Hex, TreasuryOperationMetadata>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveTreasuryOperationMetadata(
  chainId: number,
  treasuryAddress: Address,
  metadataById: Record<Hex, TreasuryOperationMetadata>,
) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(getTreasuryOperationStorageKey(chainId, treasuryAddress), JSON.stringify(metadataById));
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

function ConfirmModal({
  state,
  onClose,
}: {
  state: ConfirmModalState;
  onClose: () => void;
}) {
  if (!state) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <span
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
              state.tone === 'danger' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {state.tone === 'danger' ? <AlertCircle size={22} /> : <ShieldCheck size={22} />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-slate-950">{state.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{state.message}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => {
              state.action();
              onClose();
            }}
            className={`inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold text-white transition ${
              state.tone === 'danger' ? 'bg-rose-600 hover:bg-rose-500' : 'bg-slate-950 hover:bg-slate-800'
            }`}
          >
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TreasuryPage() {
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { writeContractAsync } = useWriteContract();
  const supportedChain = isFluxSupportedChain(chainId);
  const treasuryAddress = getContractAddress('FluxSwapTreasury', chainId);
  const managerAddress = getContractAddress('FluxMultiPoolManager', chainId);
  const localGasOverride = getLocalGasOverride(chainId);
  const tokens = useMemo(() => getAdminTokenOptions(chainId), [chainId]);

  const [mounted, setMounted] = useState(false);
  const [treasuryInfo, setTreasuryInfo] = useState<TreasuryInfo | null>(null);
  const [tokenRows, setTokenRows] = useState<TreasuryTokenRow[]>([]);
  const [operationRows, setOperationRows] = useState<TreasuryOperationRow[]>([]);
  const [operationMetadataById, setOperationMetadataById] = useState<Record<Hex, TreasuryOperationMetadata>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<ActiveTreasuryAction>(null);
  const [resultModal, setResultModal] = useState<ResultModalState>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>(null);
  const [expandedOperationId, setExpandedOperationId] = useState<Hex | null>(null);

  const [operationKind, setOperationKind] = useState<TreasuryOperationKind>('setAllowedToken');
  const [selectedTokenAddress, setSelectedTokenAddress] = useState('');
  const [booleanValue, setBooleanValue] = useState('true');
  const [targetAddress, setTargetAddress] = useState('');
  const [spenderAddress, setSpenderAddress] = useState('');
  const [amountValue, setAmountValue] = useState('');
  const [delaySeconds, setDelaySeconds] = useState('');
  const [newMinDelayValue, setNewMinDelayValue] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMounted(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!mounted || !treasuryAddress) {
        setOperationMetadataById({});
        return;
      }

      setOperationMetadataById(loadTreasuryOperationMetadata(chainId, treasuryAddress));
    }, 0);

    return () => window.clearTimeout(timer);
  }, [chainId, mounted, treasuryAddress]);

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
      const operationCandidates = await Promise.all(
        Array.from(scheduledById.values()).map(async (operation): Promise<TreasuryOperationRow | null> => {
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
            metadata: operationMetadataById[operation.operationId],
          };
        }),
      );

      const activeOperations = operationCandidates
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
  }, [managerAddress, operationMetadataById, publicClient, supportedChain, tokens, treasuryAddress]);

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
  const walletConnected = mounted && isConnected;
  const isMultisig = walletConnected && sameAddress(address, treasuryInfo?.multisig);
  const isGuardian = walletConnected && sameAddress(address, treasuryInfo?.guardian);
  const isOperator = walletConnected && sameAddress(address, treasuryInfo?.operator);
  const effectiveSelectedTokenAddress = selectedTokenAddress || tokens[0]?.address || '';
  const selectedToken = tokens.find((token) => sameAddress(token.address, effectiveSelectedTokenAddress)) ?? tokens[0];
  const effectiveDelaySeconds = delaySeconds || treasuryInfo?.minDelay.toString() || '';
  const canPause = walletConnected && (isMultisig || isGuardian) && Boolean(treasuryAddress);
  const canUnpause = walletConnected && isMultisig && Boolean(treasuryAddress);

  const persistMetadata = useCallback(
    (metadata: TreasuryOperationMetadata) => {
      if (!treasuryAddress) {
        return;
      }

      const nextMetadata = {
        ...operationMetadataById,
        [metadata.operationId]: metadata,
      };
      setOperationMetadataById(nextMetadata);
      saveTreasuryOperationMetadata(chainId, treasuryAddress, nextMetadata);
    },
    [chainId, operationMetadataById, treasuryAddress],
  );

  const removeMetadata = useCallback(
    (operationId: Hex) => {
      if (!treasuryAddress) {
        return;
      }

      if (!(operationId in operationMetadataById)) {
        return;
      }

      const nextMetadata = { ...operationMetadataById };
      delete nextMetadata[operationId];
      setOperationMetadataById(nextMetadata);
      saveTreasuryOperationMetadata(chainId, treasuryAddress, nextMetadata);
    },
    [chainId, operationMetadataById, treasuryAddress],
  );

  const runTransaction = useCallback(
    async (action: ActiveTreasuryAction, title: string, tx: () => Promise<Hex>, onConfirmed?: () => void) => {
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
        onConfirmed?.();
        setResultModal({
          kind: 'success',
          title,
          message: `交易已确认：${shortAddress(hash)}`,
        });
        await loadTreasuryData();
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
    [loadTreasuryData, publicClient],
  );

  const buildOperationDraft = useCallback(async (): Promise<TreasuryOperationMetadata | null> => {
    if (!publicClient || !treasuryAddress) {
      setResultModal({ kind: 'error', title: '无法创建操作', message: 'Treasury 合约信息尚未加载完成。' });
      return null;
    }

    const delay = effectiveDelaySeconds.trim() ? BigInt(effectiveDelaySeconds.trim()) : treasuryInfo?.minDelay;
    if (!delay || delay < (treasuryInfo?.minDelay ?? ZERO_BIGINT)) {
      setResultModal({
        kind: 'error',
        title: '延迟时间无效',
        message: `延迟时间不能小于当前治理延迟：${treasuryInfo ? formatDuration(treasuryInfo.minDelay) : '--'}。`,
      });
      return null;
    }

    const allowed = booleanValue === 'true';
    const common = {
      version: 1 as const,
      chainId,
      treasuryAddress,
      kind: operationKind,
      createdAt: Date.now(),
    };

    if (operationKind === 'setAllowedToken') {
      if (!selectedToken || !isAddress(selectedToken.address)) {
        setResultModal({ kind: 'error', title: '参数无效', message: '请选择有效的资产。' });
        return null;
      }

      const operationId = await publicClient.readContract({
        address: treasuryAddress,
        abi: fluxSwapTreasuryAbi,
        functionName: 'hashSetAllowedToken',
        args: [selectedToken.address, allowed],
      });

      return {
        ...common,
        operationId,
        label: '资产白名单',
        summary: `${allowed ? '允许' : '移除'} ${selectedToken.symbol}`,
        params: { token: selectedToken.address, tokenSymbol: selectedToken.symbol, allowed },
      };
    }

    if (operationKind === 'setAllowedRecipient') {
      if (!isAddress(targetAddress)) {
        setResultModal({ kind: 'error', title: '参数无效', message: '请输入有效的接收地址。' });
        return null;
      }

      const operationId = await publicClient.readContract({
        address: treasuryAddress,
        abi: fluxSwapTreasuryAbi,
        functionName: 'hashSetAllowedRecipient',
        args: [targetAddress, allowed],
      });

      return {
        ...common,
        operationId,
        label: '接收方白名单',
        summary: `${allowed ? '允许' : '移除'} ${shortAddress(targetAddress)}`,
        params: { recipient: targetAddress, allowed },
      };
    }

    if (operationKind === 'setDailySpendCap') {
      if (!selectedToken) {
        setResultModal({ kind: 'error', title: '参数无效', message: '请选择有效的资产。' });
        return null;
      }

      const amountUnits = parseAmount(amountValue, selectedToken.decimals);
      if (amountUnits === undefined) {
        setResultModal({ kind: 'error', title: '参数无效', message: '请输入有效的每日额度。' });
        return null;
      }

      const operationId = await publicClient.readContract({
        address: treasuryAddress,
        abi: fluxSwapTreasuryAbi,
        functionName: 'hashSetDailySpendCap',
        args: [selectedToken.address, amountUnits],
      });

      return {
        ...common,
        operationId,
        label: '每日额度',
        summary: `${selectedToken.symbol} 每日额度设为 ${amountValue || '0'}`,
        params: {
          token: selectedToken.address,
          tokenSymbol: selectedToken.symbol,
          amountUnits: amountUnits.toString(),
          amountDisplay: amountValue || '0',
        },
      };
    }

    if (operationKind === 'approveSpender' || operationKind === 'revokeSpender') {
      if (!selectedToken || !isAddress(spenderAddress)) {
        setResultModal({ kind: 'error', title: '参数无效', message: '请选择资产并输入有效的花费者地址。' });
        return null;
      }

      if (operationKind === 'revokeSpender') {
        const operationId = await publicClient.readContract({
          address: treasuryAddress,
          abi: fluxSwapTreasuryAbi,
          functionName: 'hashRevokeSpender',
          args: [selectedToken.address, spenderAddress],
        });

        return {
          ...common,
          operationId,
          label: '撤销授权',
          summary: `撤销 ${shortAddress(spenderAddress)} 的 ${selectedToken.symbol} 授权`,
          params: { token: selectedToken.address, tokenSymbol: selectedToken.symbol, spender: spenderAddress },
        };
      }

      const amountUnits = parseAmount(amountValue, selectedToken.decimals);
      if (!amountUnits || amountUnits <= ZERO_BIGINT) {
        setResultModal({ kind: 'error', title: '参数无效', message: '授权额度必须大于 0。' });
        return null;
      }

      const operationId = await publicClient.readContract({
        address: treasuryAddress,
        abi: fluxSwapTreasuryAbi,
        functionName: 'hashApproveSpender',
        args: [selectedToken.address, spenderAddress, amountUnits],
      });

      return {
        ...common,
        operationId,
        label: '授权额度',
        summary: `授权 ${shortAddress(spenderAddress)} 可使用 ${amountValue} ${selectedToken.symbol}`,
        params: {
          token: selectedToken.address,
          tokenSymbol: selectedToken.symbol,
          spender: spenderAddress,
          amountUnits: amountUnits.toString(),
          amountDisplay: amountValue,
        },
      };
    }

    if (operationKind === 'setGuardian' || operationKind === 'setOperator') {
      if (!isAddress(targetAddress)) {
        setResultModal({ kind: 'error', title: '参数无效', message: '请输入有效的新角色地址。' });
        return null;
      }

      const functionName = operationKind === 'setGuardian' ? 'hashSetGuardian' : 'hashSetOperator';
      const operationId = await publicClient.readContract({
        address: treasuryAddress,
        abi: fluxSwapTreasuryAbi,
        functionName,
        args: [targetAddress],
      });

      return {
        ...common,
        operationId,
        label: operationKind === 'setGuardian' ? '更新 Guardian' : '更新 Operator',
        summary: `${operationKind === 'setGuardian' ? 'Guardian' : 'Operator'} 更新为 ${shortAddress(targetAddress)}`,
        params: operationKind === 'setGuardian' ? { newGuardian: targetAddress } : { newOperator: targetAddress },
      };
    }

    const newMinDelay = newMinDelayValue.trim() ? BigInt(newMinDelayValue.trim()) : undefined;
    if (!newMinDelay || newMinDelay <= ZERO_BIGINT) {
      setResultModal({ kind: 'error', title: '参数无效', message: '请输入有效的新治理延迟秒数。' });
      return null;
    }

    const operationId = await publicClient.readContract({
      address: treasuryAddress,
      abi: fluxSwapTreasuryAbi,
      functionName: 'hashSetMinDelay',
      args: [newMinDelay],
    });

    return {
      ...common,
      operationId,
      label: '治理延迟',
      summary: `治理延迟更新为 ${formatDuration(newMinDelay)}`,
      params: { newMinDelay: newMinDelay.toString() },
    };
  }, [
    amountValue,
    booleanValue,
    chainId,
    effectiveDelaySeconds,
    newMinDelayValue,
    operationKind,
    publicClient,
    selectedToken,
    spenderAddress,
    targetAddress,
    treasuryAddress,
    treasuryInfo,
  ]);

  const handleScheduleOperation = useCallback(async () => {
    if (!treasuryAddress) {
      setResultModal({ kind: 'error', title: '无法创建操作', message: 'Treasury 合约地址尚未加载完成。' });
      return;
    }

    if (!mounted || !isConnected) {
      openConnectModal?.();
      return;
    }

    if (!isMultisig) {
      setResultModal({
        kind: 'error',
        title: '权限不足',
        message: '只有当前 Treasury 的 Multisig 钱包可以排队治理操作。',
      });
      return;
    }

    const draft = await buildOperationDraft();
    if (!draft) {
      return;
    }

    const delay = effectiveDelaySeconds.trim() ? BigInt(effectiveDelaySeconds.trim()) : (treasuryInfo?.minDelay ?? ZERO_BIGINT);

    void runTransaction(
      'schedule',
      '治理操作已排队',
      () =>
        writeContractAsync({
          address: treasuryAddress,
          abi: fluxSwapTreasuryAbi,
          functionName: 'scheduleOperation',
          args: [draft.operationId, delay],
          ...localGasOverride,
        }),
      () => persistMetadata(draft),
    );
  }, [
    buildOperationDraft,
    effectiveDelaySeconds,
    isConnected,
    isMultisig,
    localGasOverride,
    mounted,
    openConnectModal,
    persistMetadata,
    runTransaction,
    treasuryAddress,
    treasuryInfo?.minDelay,
    writeContractAsync,
  ]);

  const submitPauseToggle = useCallback(() => {
    if (!treasuryAddress || !treasuryInfo) {
      return;
    }

    if (!mounted || !isConnected) {
      openConnectModal?.();
      return;
    }

    if (treasuryInfo.paused) {
      if (!canUnpause) {
        setResultModal({ kind: 'error', title: '权限不足', message: '只有 Multisig 钱包可以恢复金库。' });
        return;
      }

      void runTransaction('unpause', '金库已恢复', () =>
        writeContractAsync({
          address: treasuryAddress,
          abi: fluxSwapTreasuryAbi,
          functionName: 'unpause',
          ...localGasOverride,
        }),
      );
      return;
    }

    if (!canPause) {
      setResultModal({ kind: 'error', title: '权限不足', message: '只有 Guardian 或 Multisig 钱包可以暂停金库。' });
      return;
    }

    void runTransaction('pause', '金库已暂停', () =>
      writeContractAsync({
        address: treasuryAddress,
        abi: fluxSwapTreasuryAbi,
        functionName: 'pause',
        ...localGasOverride,
      }),
    );
  }, [
    canPause,
    canUnpause,
    isConnected,
    localGasOverride,
    mounted,
    openConnectModal,
    runTransaction,
    treasuryAddress,
    treasuryInfo,
    writeContractAsync,
  ]);

  const handlePauseToggle = useCallback(() => {
    setConfirmModal({
      title: treasuryInfo?.paused ? '确认恢复金库' : '确认暂停金库',
      message: treasuryInfo?.paused
        ? '恢复后，Treasury 会重新允许相关业务动作继续执行。'
        : '暂停后，依赖 Treasury 的拉取和业务执行会被阻断，请确认当前是紧急处理场景。',
      tone: treasuryInfo?.paused ? 'default' : 'danger',
      confirmLabel: treasuryInfo?.paused ? '确认恢复' : '确认暂停',
      action: () => {
        submitPauseToggle();
      },
    });
  }, [submitPauseToggle, treasuryInfo?.paused]);

  const submitCancelOperation = useCallback(
    (operation: TreasuryOperationRow) => {
      if (!treasuryAddress) {
        return;
      }

      if (!mounted || !isConnected) {
        openConnectModal?.();
        return;
      }

      if (!isMultisig) {
        setResultModal({ kind: 'error', title: '权限不足', message: '只有 Multisig 钱包可以取消治理操作。' });
        return;
      }

      void runTransaction(
        `cancel:${operation.operationId}`,
        '治理操作已取消',
        () =>
          writeContractAsync({
            address: treasuryAddress,
            abi: fluxSwapTreasuryAbi,
            functionName: 'cancelOperation',
            args: [operation.operationId],
            ...localGasOverride,
          }),
        () => removeMetadata(operation.operationId),
      );
    },
    [
      isConnected,
      isMultisig,
      localGasOverride,
      mounted,
      openConnectModal,
      removeMetadata,
      runTransaction,
      treasuryAddress,
      writeContractAsync,
    ],
  );

  const handleCancelOperation = useCallback((operation: TreasuryOperationRow) => {
    setConfirmModal({
      title: '确认取消治理操作',
      message: `将取消操作 ${shortAddress(operation.operationId)}，取消后如果仍要执行，需要重新由 Multisig 排队。`,
      tone: 'danger',
      confirmLabel: '确认取消',
      action: () => {
        submitCancelOperation(operation);
      },
    });
  }, [submitCancelOperation]);

  const submitExecuteOperation = useCallback(
    (operation: TreasuryOperationRow) => {
      if (!treasuryAddress) {
        return;
      }

      const metadata = operation.metadata;
      if (!metadata) {
        setResultModal({
          kind: 'error',
          title: '缺少操作参数',
          message: '链上事件只记录 operationId 和时间，不包含具体参数。这个操作不是从当前管理端创建的，暂不能直接执行。',
        });
        return;
      }

      if (operation.status !== 'ready') {
        setResultModal({ kind: 'error', title: '尚不可执行', message: '该操作还没有到治理延迟时间。' });
        return;
      }

      const action = `execute:${operation.operationId}` as const;
      const params = metadata.params;

      if (metadata.kind === 'setAllowedToken' && params.token && params.allowed !== undefined) {
        void runTransaction(
          action,
          '资产白名单已更新',
          () =>
            writeContractAsync({
              address: treasuryAddress,
              abi: fluxSwapTreasuryAbi,
              functionName: 'executeSetAllowedToken',
              args: [params.token!, params.allowed!, operation.operationId],
              ...localGasOverride,
            }),
          () => removeMetadata(operation.operationId),
        );
        return;
      }

      if (metadata.kind === 'setAllowedRecipient' && params.recipient && params.allowed !== undefined) {
        void runTransaction(
          action,
          '接收方白名单已更新',
          () =>
            writeContractAsync({
              address: treasuryAddress,
              abi: fluxSwapTreasuryAbi,
              functionName: 'executeSetAllowedRecipient',
              args: [params.recipient!, params.allowed!, operation.operationId],
              ...localGasOverride,
            }),
          () => removeMetadata(operation.operationId),
        );
        return;
      }

      if (metadata.kind === 'setDailySpendCap' && params.token && params.amountUnits !== undefined) {
        void runTransaction(
          action,
          '每日额度已更新',
          () =>
            writeContractAsync({
              address: treasuryAddress,
              abi: fluxSwapTreasuryAbi,
              functionName: 'executeSetDailySpendCap',
              args: [params.token!, BigInt(params.amountUnits!), operation.operationId],
              ...localGasOverride,
            }),
          () => removeMetadata(operation.operationId),
        );
        return;
      }

      if (metadata.kind === 'approveSpender' && params.token && params.spender && params.amountUnits) {
        void runTransaction(
          action,
          '授权额度已更新',
          () =>
            writeContractAsync({
              address: treasuryAddress,
              abi: fluxSwapTreasuryAbi,
              functionName: 'executeApproveSpender',
              args: [params.token!, params.spender!, BigInt(params.amountUnits!), operation.operationId],
              ...localGasOverride,
            }),
          () => removeMetadata(operation.operationId),
        );
        return;
      }

      if (metadata.kind === 'revokeSpender' && params.token && params.spender) {
        void runTransaction(
          action,
          '授权额度已撤销',
          () =>
            writeContractAsync({
              address: treasuryAddress,
              abi: fluxSwapTreasuryAbi,
              functionName: 'executeRevokeSpender',
              args: [params.token!, params.spender!, operation.operationId],
              ...localGasOverride,
            }),
          () => removeMetadata(operation.operationId),
        );
        return;
      }

      if (metadata.kind === 'setGuardian' && params.newGuardian) {
        void runTransaction(
          action,
          'Guardian 已更新',
          () =>
            writeContractAsync({
              address: treasuryAddress,
              abi: fluxSwapTreasuryAbi,
              functionName: 'executeSetGuardian',
              args: [params.newGuardian!, operation.operationId],
              ...localGasOverride,
            }),
          () => removeMetadata(operation.operationId),
        );
        return;
      }

      if (metadata.kind === 'setOperator' && params.newOperator) {
        void runTransaction(
          action,
          'Operator 已更新',
          () =>
            writeContractAsync({
              address: treasuryAddress,
              abi: fluxSwapTreasuryAbi,
              functionName: 'executeSetOperator',
              args: [params.newOperator!, operation.operationId],
              ...localGasOverride,
            }),
          () => removeMetadata(operation.operationId),
        );
        return;
      }

      if (metadata.kind === 'setMinDelay' && params.newMinDelay) {
        void runTransaction(
          action,
          '治理延迟已更新',
          () =>
            writeContractAsync({
              address: treasuryAddress,
              abi: fluxSwapTreasuryAbi,
              functionName: 'executeSetMinDelay',
              args: [BigInt(params.newMinDelay!), operation.operationId],
              ...localGasOverride,
            }),
          () => removeMetadata(operation.operationId),
        );
        return;
      }

      setResultModal({ kind: 'error', title: '参数不完整', message: '该操作的本地参数元数据不完整，不能安全执行。' });
    },
    [localGasOverride, removeMetadata, runTransaction, treasuryAddress, writeContractAsync],
  );

  const handleExecuteOperation = useCallback((operation: TreasuryOperationRow) => {
    const summary = operation.metadata?.summary ?? '该操作缺少本地参数元数据';

    setConfirmModal({
      title: '确认执行治理操作',
      message: `${summary}。执行后会立即消耗链上的 operationId，且本地参数记录也会一并清理。`,
      tone: 'danger',
      confirmLabel: '确认执行',
      action: () => {
        submitExecuteOperation(operation);
      },
    });
  }, [submitExecuteOperation]);

  return (
    <>
      <ResultModal state={resultModal} onClose={() => setResultModal(null)} />
      <ConfirmModal state={confirmModal} onClose={() => setConfirmModal(null)} />

      <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <PageHeader
          eyebrow="Treasury"
          title="金库管理"
          description="查看 Treasury 的关键权限、资产余额、Manager 授权额度、每日支出额度和待处理治理操作。"
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

      <Card className="p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Wallet size={19} />
              </span>
              <div>
                <h2 className="font-semibold text-slate-950">治理操作入口</h2>
                <p className="text-sm text-slate-500">先识别当前钱包角色，后续排队、执行和取消操作都会基于这里的权限状态。</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500">当前钱包</p>
              <p className="mt-1 font-mono text-sm font-semibold text-slate-900">
                {walletConnected ? shortAddress(address) : '未连接'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusPill tone={isMultisig ? 'success' : 'neutral'}>Multisig</StatusPill>
              <StatusPill tone={isGuardian ? 'success' : 'neutral'}>Guardian</StatusPill>
              <StatusPill tone={isOperator ? 'success' : 'neutral'}>Operator</StatusPill>
            </div>
            {!walletConnected ? (
              <button
                type="button"
                onClick={openConnectModal ?? undefined}
                disabled={!mounted}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-500"
              >
                <Wallet size={15} />
                连接钱包
              </button>
            ) : null}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <Card className="overflow-hidden">
          <div className="border-b border-slate-200 p-5">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Settings2 size={19} />
              </span>
              <div>
                <h2 className="font-semibold text-slate-950">创建治理操作</h2>
                <p className="text-sm text-slate-500">由 Multisig 排队，达到治理延迟后再执行。页面会保存参数元数据，方便后续安全执行。</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 p-5 lg:grid-cols-2">
            <div className="space-y-2">
              <FieldLabel>操作类型</FieldLabel>
              <SelectInput value={operationKind} onChange={(value) => setOperationKind(value as TreasuryOperationKind)}>
                <option value="setAllowedToken">资产白名单</option>
                <option value="setAllowedRecipient">接收方白名单</option>
                <option value="setDailySpendCap">每日支出额度</option>
                <option value="approveSpender">授权花费者额度</option>
                <option value="revokeSpender">撤销花费者额度</option>
                <option value="setGuardian">更新 Guardian</option>
                <option value="setOperator">更新 Operator</option>
                <option value="setMinDelay">更新治理延迟</option>
              </SelectInput>
            </div>

            <div className="space-y-2">
              <FieldLabel>排队延迟（秒）</FieldLabel>
              <TextInput
                value={delaySeconds}
                onChange={setDelaySeconds}
                placeholder={treasuryInfo?.minDelay.toString() ?? '3600'}
              />
            </div>

            {['setAllowedToken', 'setDailySpendCap', 'approveSpender', 'revokeSpender'].includes(operationKind) ? (
              <div className="space-y-2">
                <FieldLabel>资产</FieldLabel>
                <SelectInput value={effectiveSelectedTokenAddress} onChange={setSelectedTokenAddress}>
                  {tokens.map((token) => (
                    <option key={token.address} value={token.address}>
                      {token.symbol} - {shortAddress(token.address)}
                    </option>
                  ))}
                </SelectInput>
              </div>
            ) : null}

            {['setAllowedToken', 'setAllowedRecipient'].includes(operationKind) ? (
              <div className="space-y-2">
                <FieldLabel>白名单状态</FieldLabel>
                <SelectInput value={booleanValue} onChange={setBooleanValue}>
                  <option value="true">允许</option>
                  <option value="false">移除</option>
                </SelectInput>
              </div>
            ) : null}

            {['setAllowedRecipient', 'setGuardian', 'setOperator'].includes(operationKind) ? (
              <div className="space-y-2 lg:col-span-2">
                <FieldLabel>
                  {operationKind === 'setAllowedRecipient'
                    ? '接收地址'
                    : operationKind === 'setGuardian'
                      ? '新 Guardian 地址'
                      : '新 Operator 地址'}
                </FieldLabel>
                <TextInput value={targetAddress} onChange={setTargetAddress} placeholder="0x..." />
              </div>
            ) : null}

            {['approveSpender', 'revokeSpender'].includes(operationKind) ? (
              <div className="space-y-2 lg:col-span-2">
                <FieldLabel>花费者地址</FieldLabel>
                <TextInput value={spenderAddress} onChange={setSpenderAddress} placeholder={managerAddress ?? '0x...'} />
              </div>
            ) : null}

            {['setDailySpendCap', 'approveSpender'].includes(operationKind) ? (
              <div className="space-y-2">
                <FieldLabel>{operationKind === 'setDailySpendCap' ? '每日额度' : '授权额度'}</FieldLabel>
                <TextInput
                  value={amountValue}
                  onChange={setAmountValue}
                  placeholder={selectedToken ? `输入 ${selectedToken.symbol} 数量` : '输入数量'}
                />
              </div>
            ) : null}

            {operationKind === 'setMinDelay' ? (
              <div className="space-y-2">
                <FieldLabel>新的治理延迟（秒）</FieldLabel>
                <TextInput value={newMinDelayValue} onChange={setNewMinDelayValue} placeholder="例如 86400" />
              </div>
            ) : null}

            <div className="flex items-end justify-end lg:col-span-2">
              <button
                type="button"
                onClick={() => void handleScheduleOperation()}
                disabled={activeAction === 'schedule' || !mounted || (walletConnected && !isMultisig)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-500"
              >
                {activeAction === 'schedule' ? <LoaderCircle size={16} className="animate-spin" /> : <Play size={16} />}
                {walletConnected ? '生成并排队' : '连接钱包'}
              </button>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex h-full flex-col justify-between gap-5">
            <div>
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${
                    treasuryInfo?.paused ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
                  }`}
                >
                  {treasuryInfo?.paused ? <PauseCircle size={19} /> : <ShieldCheck size={19} />}
                </span>
                <div>
                  <h2 className="font-semibold text-slate-950">紧急状态</h2>
                  <p className="text-sm text-slate-500">
                    暂停由 Guardian 或 Multisig 执行，恢复只能由 Multisig 执行。
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs text-slate-500">当前状态</p>
                <div className="mt-2">
                  <StatusPill tone={treasuryInfo?.paused ? 'danger' : 'success'}>
                    {treasuryInfo?.paused ? '已暂停' : '正常'}
                  </StatusPill>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handlePauseToggle}
              disabled={activeAction === 'pause' || activeAction === 'unpause' || !mounted}
              className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:bg-slate-300 disabled:text-slate-500 ${
                treasuryInfo?.paused
                  ? 'bg-slate-950 text-white hover:bg-slate-800'
                  : 'bg-rose-600 text-white hover:bg-rose-500'
              }`}
            >
              {activeAction === 'pause' || activeAction === 'unpause' ? (
                <LoaderCircle size={16} className="animate-spin" />
              ) : treasuryInfo?.paused ? (
                <Play size={16} />
              ) : (
                <Ban size={16} />
              )}
              {treasuryInfo?.paused ? '恢复金库' : '暂停金库'}
            </button>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="overflow-hidden">
          <div className="border-b border-slate-200 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Settings2 size={19} />
                </span>
                <div>
                  <h2 className="font-semibold text-slate-950">待处理治理操作</h2>
                  <p className="text-sm text-slate-500">最近 20,000 区块内排队、尚未执行的金库操作。</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:w-[260px]">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">总数</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">{operationRows.length}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">可执行</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">{readyOperationCount}</p>
                </div>
              </div>
            </div>
          </div>

          {loading && operationRows.length === 0 ? (
            <div className="flex h-[200px] flex-col items-center justify-center gap-3 px-6 text-center text-sm text-slate-500">
              <LoaderCircle size={22} className="animate-spin text-slate-400" />
              <p>正在加载治理操作</p>
            </div>
          ) : operationRows.length === 0 ? (
            <div className="flex h-[200px] flex-col items-center justify-center gap-4 px-8 text-center">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                <Settings2 size={20} />
              </span>
              <div className="max-w-md space-y-1">
                <p className="text-base font-semibold text-slate-900">暂无待处理治理操作</p>
                <p className="text-sm leading-6 text-slate-500">
                  等 Multisig 排队治理动作后，这里会显示操作类型、可执行时间和执行入口。
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-left">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="w-10 px-4 py-3" aria-label="展开详情" />
                    <th className="px-4 py-3">类型</th>
                    <th className="px-5 py-3">内容</th>
                    <th className="px-5 py-3">状态</th>
                    <th className="px-5 py-3">可执行时间</th>
                    <th className="px-5 py-3">发起人</th>
                    <th className="px-5 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {operationRows.map((operation) => {
                    const expanded = expandedOperationId === operation.operationId;
                    const detailItems = buildOperationDetailItems(operation);

                    return (
                      <Fragment key={operation.operationId}>
                        <tr
                          className="cursor-pointer align-middle transition hover:bg-slate-50/80"
                          onClick={() =>
                            setExpandedOperationId((current) =>
                              current === operation.operationId ? null : operation.operationId,
                            )
                          }
                        >
                          <td className="px-4 py-4">
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition group-hover:border-slate-300">
                              {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <p className="text-sm font-semibold text-slate-950">
                              {operation.metadata?.label ?? '未知操作'}
                            </p>
                            <p className="mt-1 font-mono text-xs text-slate-500">{shortAddress(operation.operationId)}</p>
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-700">
                            {operation.metadata?.summary ?? '缺少本地参数元数据，只能取消，不能直接执行'}
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
                          <td className="px-5 py-4">
                            <div className="flex justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => handleExecuteOperation(operation)}
                                disabled={
                                  activeAction === `execute:${operation.operationId}` ||
                                  operation.status !== 'ready' ||
                                  !operation.metadata
                                }
                                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400"
                              >
                                {activeAction === `execute:${operation.operationId}` ? (
                                  <LoaderCircle size={14} className="animate-spin" />
                                ) : (
                                  <Play size={14} />
                                )}
                                执行
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCancelOperation(operation)}
                                disabled={activeAction === `cancel:${operation.operationId}` || !isMultisig}
                                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400"
                              >
                                {activeAction === `cancel:${operation.operationId}` ? (
                                  <LoaderCircle size={14} className="animate-spin" />
                                ) : (
                                  <X size={14} />
                                )}
                                取消
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expanded ? (
                          <tr key={`${operation.operationId}-detail`} className="bg-slate-50/70">
                            <td colSpan={7} className="px-5 py-4">
                              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                                <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-start lg:justify-between">
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-slate-950">
                                      {operation.metadata?.label ?? '未知操作'}
                                    </p>
                                    <p className="mt-1 text-sm text-slate-500">
                                      {operation.metadata?.summary ?? '这个操作缺少本地参数元数据，因此只能查看基础链上信息。'}
                                    </p>
                                  </div>
                                  <StatusPill tone={operation.metadata ? 'success' : 'warning'}>
                                    {operation.metadata ? '元数据完整' : '缺少元数据'}
                                  </StatusPill>
                                </div>

                                <div className="mt-4 grid gap-x-8 gap-y-4 md:grid-cols-2">
                                  {detailItems.map((item) => (
                                    <div
                                      key={`${operation.operationId}-${item.label}`}
                                      className="min-w-0 border-b border-dashed border-slate-100 pb-3 last:border-b-0"
                                    >
                                      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
                                      <OperationDetailValue value={item.value} />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
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
            授权额度、每日额度、白名单、暂停和恢复都属于高风险金库动作。排队操作只允许 Multisig 发起；达到治理延迟后，带有本地参数元数据的操作才能在页面内执行。
          </p>
        </div>
      </Card>
      </div>
    </>
  );
}
