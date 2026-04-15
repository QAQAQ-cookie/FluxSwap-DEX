'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
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
  Droplets,
  History,
  Info,
  Plus,
  ShieldCheck,
  ShieldOff,
  Wallet,
} from 'lucide-react';
import {
  formatUnits,
  maxUint256,
  parseEventLogs,
  type Address,
  zeroAddress,
} from 'viem';

import {
  getContractAddress,
  getLocalGasOverride,
  isFluxSupportedChain,
} from '@/config/contracts';
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
  formatTimestamp,
  truncateAddress,
  watchWalletAsset,
} from '@/lib/wallet';
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
  | 'revoke-token'
  | 'add-liquidity'
  | 'approve-lp'
  | 'revoke-lp'
  | 'remove-liquidity'
  | null;

type PoolActivityItem = {
  id: string;
  title: string;
  detail: string;
  actor: Address;
  txHash: `0x${string}`;
  timestamp?: number;
  isMine: boolean;
};

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
    approvalSubmitted: isZh ? '授权已提交' : 'Approval submitted',
    approvalConfirmed: isZh ? '授权已确认' : 'Approval confirmed',
    revokeFluxApproval: isZh ? '撤销 FLUX 授权' : 'Revoke FLUX approval',
    revokeLpApproval: isZh ? '撤销 LP 授权' : 'Revoke LP approval',
    addFluxToWallet: isZh ? '添加 FLUX 到钱包' : 'Add FLUX to wallet',
    addLpToWallet: isZh ? '添加 LP 到钱包' : 'Add LP to wallet',
    walletPromptOpened: isZh ? '已向钱包发起添加请求' : 'Wallet prompt opened',
    walletPromptUnavailable: isZh ? '当前钱包不支持添加资产' : 'This wallet does not support adding assets',
    activityTitle: isZh ? '池子最近交易' : 'Recent Pool Activity',
    activityLoading: isZh ? '正在读取链上交易...' : 'Loading on-chain activity...',
    activityEmpty: isZh ? '当前池子还没有可展示的链上交易记录' : 'No recent on-chain pool activity yet',
    mine: isZh ? '我的操作' : 'Mine',
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
  const publicClient = usePublicClient({ chainId });
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
  const [walletNotice, setWalletNotice] = useState<string | null>(null);
  const [activity, setActivity] = useState<PoolActivityItem[]>([]);
  const [isActivityLoading, setIsActivityLoading] = useState(false);
  const handledReceiptHashRef = useRef<string | undefined>(undefined);

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
  const fluxIsToken0 =
    Boolean(token0 && fluxTokenAddress) &&
    token0?.toLowerCase() === fluxTokenAddress?.toLowerCase();

  const unlimitedApprovalLabel = isZh ? '无限授权' : 'Unlimited';
  const tokenAllowanceDisplay =
    tokenAllowance === undefined
      ? '0.00'
      : tokenAllowance === maxUint256
        ? unlimitedApprovalLabel
        : formatBigIntAmount(tokenAllowance, 18, 4);
  const lpAllowanceDisplay =
    lpAllowance === undefined
      ? '0.00'
      : lpAllowance === maxUint256
        ? unlimitedApprovalLabel
        : formatBigIntAmount(lpAllowance, 18, 4);
  const canRevokeTokenAllowance = Boolean(
    tokenAllowance !== undefined && tokenAllowance > BigInt(0),
  );
  const canRevokeLpAllowance = Boolean(
    lpAllowance !== undefined && lpAllowance > BigInt(0),
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

  useEffect(() => {
    if (!hash || !isConfirmed || handledReceiptHashRef.current === hash) {
      return;
    }

    handledReceiptHashRef.current = hash;

    if (lastAction === 'add-liquidity') {
      setAddEthAmount('');
      setAddFluxAmount('');
    }

    if (lastAction === 'remove-liquidity') {
      setRemoveLpAmount('');
    }
  }, [hash, isConfirmed, lastAction]);

  useEffect(() => {
    if (!publicClient || !normalizedPairAddress || !fluxTokenAddress || !token0) {
      setActivity([]);
      return;
    }

    let cancelled = false;

    const loadActivity = async () => {
      setIsActivityLoading(true);

      try {
        const latestBlock = await publicClient.getBlockNumber();
        const fromBlock = latestBlock > BigInt(5000) ? latestBlock - BigInt(5000) : BigInt(0);
        const rawLogs = await publicClient.getLogs({
          address: normalizedPairAddress,
          fromBlock,
          toBlock: latestBlock,
        });
        const parsedLogs = parseEventLogs({
          abi: fluxSwapPairAbi,
          logs: rawLogs,
          eventName: ['Mint', 'Burn', 'Swap'],
          strict: false,
        });
        const recentLogs = parsedLogs
          .filter((log) => Boolean(log.eventName && log.transactionHash && log.blockNumber !== null))
          .sort((left, right) => {
            const blockDiff = Number((right.blockNumber ?? BigInt(0)) - (left.blockNumber ?? BigInt(0)));
            if (blockDiff !== 0) {
              return blockDiff;
            }

            return Number(right.logIndex ?? 0) - Number(left.logIndex ?? 0);
          })
          .slice(0, 8);

        const items = await Promise.all(
          recentLogs.map(async (log) => {
            const [transaction, block] = await Promise.all([
              publicClient
                .getTransaction({ hash: log.transactionHash as `0x${string}` })
                .catch(() => undefined),
              publicClient
                .getBlock({ blockNumber: log.blockNumber ?? undefined })
                .catch(() => undefined),
            ]);

            const actor = (transaction?.from ?? zeroAddress) as Address;
            const args =
              ((log as unknown as { args?: Record<string, bigint | Address> }).args ?? {});
            const amount0 =
              typeof args.amount0 === 'bigint' ? args.amount0 : BigInt(0);
            const amount1 =
              typeof args.amount1 === 'bigint' ? args.amount1 : BigInt(0);
            const tokenAmount = fluxIsToken0 ? amount0 : amount1;
            const ethAmount = fluxIsToken0 ? amount1 : amount0;
            let title: string = log.eventName;
            let detail = '--';

            if (log.eventName === 'Mint') {
              title = isZh ? '添加流动性' : 'Added liquidity';
              detail = `${formatBigIntAmount(ethAmount, 18, 4)} ETH + ${formatBigIntAmount(tokenAmount, 18, 4)} FLUX`;
            }

            if (log.eventName === 'Burn') {
              title = isZh ? '移除流动性' : 'Removed liquidity';
              detail = `${formatBigIntAmount(ethAmount, 18, 4)} ETH + ${formatBigIntAmount(tokenAmount, 18, 4)} FLUX`;
            }

            if (log.eventName === 'Swap') {
              const amount0In =
                typeof args.amount0In === 'bigint' ? args.amount0In : BigInt(0);
              const amount1In =
                typeof args.amount1In === 'bigint' ? args.amount1In : BigInt(0);
              const amount0Out =
                typeof args.amount0Out === 'bigint' ? args.amount0Out : BigInt(0);
              const amount1Out =
                typeof args.amount1Out === 'bigint' ? args.amount1Out : BigInt(0);
              const fluxIn = fluxIsToken0 ? amount0In : amount1In;
              const ethIn = fluxIsToken0 ? amount1In : amount0In;
              const fluxOut = fluxIsToken0 ? amount0Out : amount1Out;
              const ethOut = fluxIsToken0 ? amount1Out : amount0Out;

              if (ethIn > BigInt(0) && fluxOut > BigInt(0)) {
                title = isZh ? '买入 FLUX' : 'Bought FLUX';
                detail = `${formatBigIntAmount(ethIn, 18, 4)} ETH -> ${formatBigIntAmount(fluxOut, 18, 4)} FLUX`;
              } else if (fluxIn > BigInt(0) && ethOut > BigInt(0)) {
                title = isZh ? '卖出 FLUX' : 'Sold FLUX';
                detail = `${formatBigIntAmount(fluxIn, 18, 4)} FLUX -> ${formatBigIntAmount(ethOut, 18, 4)} ETH`;
              } else {
                title = 'Swap';
                detail = `${formatBigIntAmount(ethIn + ethOut, 18, 4)} ETH / ${formatBigIntAmount(fluxIn + fluxOut, 18, 4)} FLUX`;
              }
            }

            return {
              id: `${log.transactionHash}-${log.logIndex ?? 0}`,
              title,
              detail,
              actor,
              txHash: log.transactionHash as `0x${string}`,
              timestamp: block ? Number(block.timestamp) : undefined,
              isMine: Boolean(address && actor.toLowerCase() === address.toLowerCase()),
            } satisfies PoolActivityItem;
          }),
        );

        if (!cancelled) {
          setActivity(items);
        }
      } catch {
        if (!cancelled) {
          setActivity([]);
        }
      } finally {
        if (!cancelled) {
          setIsActivityLoading(false);
        }
      }
    };

    void loadActivity();

    return () => {
      cancelled = true;
    };
  }, [address, fluxIsToken0, fluxTokenAddress, isZh, normalizedPairAddress, publicClient, token0]);

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

  const localGasOverride = getLocalGasOverride(chainId);

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
  const statusLabel =
    lastAction === 'approve-token' ||
    lastAction === 'approve-lp' ||
    lastAction === 'revoke-token' ||
    lastAction === 'revoke-lp'
      ? isConfirmed
        ? copy.approvalConfirmed
        : copy.approvalSubmitted
      : isConfirmed
        ? copy.txConfirmed
        : copy.txSubmitted;

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
      setWalletNotice(watched ? copy.walletPromptOpened : copy.walletPromptUnavailable);
    } catch (error) {
      setWalletNotice(
        formatErrorMessage(error, {
          rejectedMessage: isZh ? '你已取消本次钱包添加请求' : 'You cancelled the wallet asset request',
        }),
      );
    }
  };

  const handleWatchLp = async () => {
    if (!normalizedPairAddress) {
      return;
    }

    setWalletNotice(null);

    try {
      const watched = await watchWalletAsset({
        address: normalizedPairAddress,
        symbol: 'FLUX-LP',
        decimals: 18,
      });
      setWalletNotice(watched ? copy.walletPromptOpened : copy.walletPromptUnavailable);
    } catch (error) {
      setWalletNotice(
        formatErrorMessage(error, {
          rejectedMessage: isZh ? '你已取消本次钱包添加请求' : 'You cancelled the wallet asset request',
        }),
      );
    }
  };

  const handleRevokeTokenApproval = async () => {
    if (!fluxTokenAddress || !routerAddress) {
      return;
    }

    setTxError(null);
    setLastAction('revoke-token');

    try {
      await writeContractAsync({
        address: fluxTokenAddress,
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

  const handleRevokeLpApproval = async () => {
    if (!normalizedPairAddress || !routerAddress) {
      return;
    }

    setTxError(null);
    setLastAction('revoke-lp');

    try {
      await writeContractAsync({
        address: normalizedPairAddress,
        abi: fluxSwapPairAbi,
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

  const handleAddEthChange = (value: string) => {
    setAddEthAmount(value);

    if (!value) {
      setAddFluxAmount('');
      return;
    }

    if (
      !reserveEth ||
      !reserveFlux ||
      reserveEth <= BigInt(0) ||
      reserveFlux <= BigInt(0)
    ) {
      return;
    }

    const parsed = parseAmount(value);
    if (!parsed) {
      setAddFluxAmount('');
      return;
    }

    const proportionalFlux = (parsed * reserveFlux) / reserveEth;
    setAddFluxAmount(formatUnits(proportionalFlux, 18));
  };

  const handleAddFluxChange = (value: string) => {
    setAddFluxAmount(value);

    if (!value) {
      setAddEthAmount('');
      return;
    }

    if (
      !reserveEth ||
      !reserveFlux ||
      reserveEth <= BigInt(0) ||
      reserveFlux <= BigInt(0)
    ) {
      return;
    }

    const parsed = parseAmount(value);
    if (!parsed) {
      setAddEthAmount('');
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
          ...localGasOverride,
        });
        return;
      }

      if (!addEthParsed || !addFluxParsed || !addEthMin || !addFluxMin) {
        return;
      }

      if (!publicClient) {
        throw new Error('Unable to read the latest block timestamp.');
      }

      const deadline = (await publicClient.getBlock()).timestamp + BigInt(20 * 60);

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
        ...localGasOverride,
      });
    } catch (error) {
      setTxError(
        formatErrorMessage(error, {
          rejectedMessage:
            addAction === 'approve-token'
              ? '你已取消本次授权'
              : '你已取消本次交易',
        }),
      );
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
          ...localGasOverride,
        });
        return;
      }

      if (!removeLpParsed || !removeFluxMin || !removeEthMin) {
        return;
      }

      if (!publicClient) {
        throw new Error('Unable to read the latest block timestamp.');
      }

      const deadline = (await publicClient.getBlock()).timestamp + BigInt(20 * 60);

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
        ...localGasOverride,
      });
    } catch (error) {
      setTxError(
        formatErrorMessage(error, {
          rejectedMessage:
            removeAction === 'approve-lp'
              ? '你已取消本次授权'
              : '你已取消本次交易',
        }),
      );
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
                  <div>{copy.tokenAllowance}: {tokenAllowanceDisplay}</div>
                  <div>{copy.lpAllowance}: {lpAllowanceDisplay}</div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={handleWatchFlux}
                  disabled={!fluxTokenAddress}
                  className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  <Wallet size={14} />
                  <span>{copy.addFluxToWallet}</span>
                </button>

                <button
                  onClick={handleWatchLp}
                  disabled={!normalizedPairAddress}
                  className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  <Wallet size={14} />
                  <span>{copy.addLpToWallet}</span>
                </button>

                {canRevokeTokenAllowance && (
                  <button
                    onClick={handleRevokeTokenApproval}
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-900/60 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
                  >
                    <ShieldOff size={14} />
                    <span>{copy.revokeFluxApproval}</span>
                  </button>
                )}

                {canRevokeLpAllowance && (
                  <button
                    onClick={handleRevokeLpApproval}
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-900/60 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
                  >
                    <ShieldOff size={14} />
                    <span>{copy.revokeLpApproval}</span>
                  </button>
                )}
              </div>
            </div>

            {walletNotice && (
              <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                {walletNotice}
              </div>
            )}

            {txError && (
              <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
                {txError}
              </div>
            )}

            {hash && (
              <div className="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                {statusLabel}: {hash.slice(0, 10)}...
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
                  {copy.tokenAllowance}: {tokenAllowanceDisplay}
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

        <div className="rounded-[2rem] border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-4 flex items-center gap-2">
            <History size={18} className="text-gray-500 dark:text-gray-400" />
            <div>
              <div className="text-lg font-semibold text-gray-900 dark:text-white">
                {copy.activityTitle}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {normalizedPairAddress
                  ? truncateAddress(normalizedPairAddress, 10, 8)
                  : copy.poolMissing}
              </div>
            </div>
          </div>

          {!normalizedPairAddress ? (
            <div className="rounded-2xl bg-gray-100 px-4 py-3 text-sm text-gray-500 dark:bg-gray-900 dark:text-gray-400">
              {copy.poolMissing}
            </div>
          ) : isActivityLoading ? (
            <div className="rounded-2xl bg-gray-100 px-4 py-3 text-sm text-gray-500 dark:bg-gray-900 dark:text-gray-400">
              {copy.activityLoading}
            </div>
          ) : activity.length === 0 ? (
            <div className="rounded-2xl bg-gray-100 px-4 py-3 text-sm text-gray-500 dark:bg-gray-900 dark:text-gray-400">
              {copy.activityEmpty}
            </div>
          ) : (
            <div className="space-y-3">
              {activity.map((item) => (
                <div
                  key={item.id}
                  className="rounded-3xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/60"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                          {item.title}
                        </span>
                        {item.isMine && (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                            {copy.mine}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                        {item.detail}
                      </div>
                      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        {truncateAddress(item.actor)} · {truncateAddress(item.txHash, 10, 8)}
                      </div>
                    </div>

                    <div className="text-right text-xs text-gray-500 dark:text-gray-400">
                      {formatTimestamp(item.timestamp, isZh ? 'zh-CN' : 'en-US')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
