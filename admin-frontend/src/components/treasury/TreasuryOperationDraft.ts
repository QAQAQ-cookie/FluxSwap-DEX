import { isAddress, type Address } from 'viem';
import type { UsePublicClientReturnType } from 'wagmi';

import { shortAddress } from '@/components/AdminPrimitives';
import type { ResultModalState } from '@/components/treasury/TreasuryModals';
import type { TreasuryOperationKind, TreasuryOperationMetadata } from '@/components/treasury/TreasuryTypes';
import { ZERO_BIGINT, formatDuration } from '@/components/treasury/TreasuryUtils';
import type { AdminTokenOption } from '@/config/tokens';
import { parseAmount } from '@/lib/amounts';
import { fluxSwapTreasuryAbi } from '@/lib/contracts';

type TreasuryPublicClient = NonNullable<UsePublicClientReturnType>;
type TreasuryDraftError = Exclude<ResultModalState, null>;

type BuildTreasuryOperationDraftParams = {
  publicClient?: TreasuryPublicClient;
  chainId: number;
  treasuryAddress?: Address;
  treasuryMinDelay?: bigint;
  operationKind: TreasuryOperationKind;
  selectedToken?: AdminTokenOption;
  booleanValue: string;
  targetAddress: string;
  spenderAddress: string;
  amountValue: string;
  effectiveDelaySeconds: string;
  newMinDelayValue: string;
  withdrawRecipientAddress: string;
  withdrawAmountValue: string;
  onError: (state: TreasuryDraftError) => void;
};

export async function buildTreasuryOperationDraft({
  publicClient,
  chainId,
  treasuryAddress,
  treasuryMinDelay,
  operationKind,
  selectedToken,
  booleanValue,
  targetAddress,
  spenderAddress,
  amountValue,
  effectiveDelaySeconds,
  newMinDelayValue,
  withdrawRecipientAddress,
  withdrawAmountValue,
  onError,
}: BuildTreasuryOperationDraftParams): Promise<TreasuryOperationMetadata | null> {
  if (!publicClient || !treasuryAddress) {
    onError({ kind: 'error', title: '暂无法创建操作', message: '金库合约信息尚未加载完成。' });
    return null;
  }

  const delay = effectiveDelaySeconds.trim() ? BigInt(effectiveDelaySeconds.trim()) : treasuryMinDelay;
  if (!delay || delay < (treasuryMinDelay ?? ZERO_BIGINT)) {
    onError({
      kind: 'error',
      title: '延迟时间无效',
      message: `延迟时间不能小于当前治理延迟：${treasuryMinDelay ? formatDuration(treasuryMinDelay) : '--'}。`,
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
      onError({ kind: 'error', title: '参数无效', message: '请选择有效的资产。' });
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
      onError({ kind: 'error', title: '参数无效', message: '请输入有效的接收地址。' });
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
      onError({ kind: 'error', title: '参数无效', message: '请选择有效的资产。' });
      return null;
    }

    const amountUnits = parseAmount(amountValue, selectedToken.decimals);
    if (amountUnits === undefined) {
      onError({ kind: 'error', title: '参数无效', message: '请输入有效的每日额度。' });
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
      onError({ kind: 'error', title: '参数无效', message: '请选择资产并输入有效的花费者地址。' });
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
      onError({ kind: 'error', title: '参数无效', message: '授权额度必须大于 0。' });
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
      onError({ kind: 'error', title: '参数无效', message: '请输入有效的新角色地址。' });
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
      label: operationKind === 'setGuardian' ? '更新守护者' : '更新操作员',
      summary: `${operationKind === 'setGuardian' ? '守护者' : '操作员'} 更新为 ${shortAddress(targetAddress)}`,
      params: operationKind === 'setGuardian' ? { newGuardian: targetAddress } : { newOperator: targetAddress },
    };
  }

  if (operationKind === 'setMinDelay') {
    const newMinDelay = newMinDelayValue.trim() ? BigInt(newMinDelayValue.trim()) : undefined;
    if (!newMinDelay || newMinDelay <= ZERO_BIGINT) {
      onError({ kind: 'error', title: '参数无效', message: '请输入有效的新治理延迟秒数。' });
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
  }

  if (operationKind === 'emergencyWithdraw') {
    if (!selectedToken) {
      onError({ kind: 'error', title: '参数无效', message: '请选择有效的提取资产。' });
      return null;
    }

    if (!isAddress(withdrawRecipientAddress)) {
      onError({ kind: 'error', title: '参数无效', message: '请输入有效的提取接收地址。' });
      return null;
    }

    const amountUnits = parseAmount(withdrawAmountValue, selectedToken.decimals);
    if (!amountUnits || amountUnits <= ZERO_BIGINT) {
      onError({ kind: 'error', title: '参数无效', message: '紧急提取数量必须大于 0。' });
      return null;
    }

    const operationId = await publicClient.readContract({
      address: treasuryAddress,
      abi: fluxSwapTreasuryAbi,
      functionName: 'hashEmergencyWithdraw',
      args: [selectedToken.address, withdrawRecipientAddress, amountUnits],
    });

    return {
      ...common,
      operationId,
      label: '紧急提取',
      summary: `提取 ${withdrawAmountValue} ${selectedToken.symbol} 到 ${shortAddress(withdrawRecipientAddress)}`,
      params: {
        withdrawToken: selectedToken.address,
        withdrawTokenSymbol: selectedToken.symbol,
        withdrawTokenDecimals: selectedToken.decimals,
        withdrawRecipient: withdrawRecipientAddress,
        withdrawAmountUnits: amountUnits.toString(),
        withdrawAmountDisplay: `${withdrawAmountValue} ${selectedToken.symbol}`,
      },
    };
  }

  if (!isAddress(withdrawRecipientAddress)) {
    onError({ kind: 'error', title: '参数无效', message: '请输入有效的 ETH 提取接收地址。' });
    return null;
  }

  const amountUnits = parseAmount(withdrawAmountValue, 18);
  if (!amountUnits || amountUnits <= ZERO_BIGINT) {
    onError({ kind: 'error', title: '参数无效', message: 'ETH 紧急提取数量必须大于 0。' });
    return null;
  }

  const operationId = await publicClient.readContract({
    address: treasuryAddress,
    abi: fluxSwapTreasuryAbi,
    functionName: 'hashEmergencyWithdrawETH',
    args: [withdrawRecipientAddress, amountUnits],
  });

  return {
    ...common,
    operationId,
    label: '紧急提取 ETH',
    summary: `提取 ${withdrawAmountValue} ETH 到 ${shortAddress(withdrawRecipientAddress)}`,
    params: {
      withdrawTokenSymbol: 'ETH',
      withdrawTokenDecimals: 18,
      withdrawRecipient: withdrawRecipientAddress,
      withdrawAmountUnits: amountUnits.toString(),
      withdrawAmountDisplay: `${withdrawAmountValue} ETH`,
    },
  };
}
