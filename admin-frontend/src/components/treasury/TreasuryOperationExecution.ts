import type { Address, Hex } from 'viem';
import type { UseWriteContractReturnType } from 'wagmi';

import type { TreasuryOperationMetadata } from '@/components/treasury/TreasuryTypes';
import { fluxSwapTreasuryAbi } from '@/lib/contracts';

type WriteContractAsync = UseWriteContractReturnType['writeContractAsync'];

type TreasuryExecutionRequest = {
  title: string;
  tx: () => Promise<Hex>;
};

type BuildTreasuryExecutionRequestParams = {
  metadata: TreasuryOperationMetadata;
  operationId: Hex;
  treasuryAddress: Address;
  localGasOverride: { gas?: bigint };
  writeContractAsync: WriteContractAsync;
};

export function buildTreasuryExecutionRequest({
  metadata,
  operationId,
  treasuryAddress,
  localGasOverride,
  writeContractAsync,
}: BuildTreasuryExecutionRequestParams): TreasuryExecutionRequest | null {
  const params = metadata.params;

  if (metadata.kind === 'setAllowedToken' && params.token && params.allowed !== undefined) {
    return {
      title: '已更新资产白名单',
      tx: () =>
        writeContractAsync({
          address: treasuryAddress,
          abi: fluxSwapTreasuryAbi,
          functionName: 'executeSetAllowedToken',
          args: [params.token!, params.allowed!, operationId],
          ...localGasOverride,
        }),
    };
  }

  if (metadata.kind === 'setAllowedRecipient' && params.recipient && params.allowed !== undefined) {
    return {
      title: '已更新接收方白名单',
      tx: () =>
        writeContractAsync({
          address: treasuryAddress,
          abi: fluxSwapTreasuryAbi,
          functionName: 'executeSetAllowedRecipient',
          args: [params.recipient!, params.allowed!, operationId],
          ...localGasOverride,
        }),
    };
  }

  if (metadata.kind === 'setDailySpendCap' && params.token && params.amountUnits !== undefined) {
    return {
      title: '已更新每日额度',
      tx: () =>
        writeContractAsync({
          address: treasuryAddress,
          abi: fluxSwapTreasuryAbi,
          functionName: 'executeSetDailySpendCap',
          args: [params.token!, BigInt(params.amountUnits!), operationId],
          ...localGasOverride,
        }),
    };
  }

  if (metadata.kind === 'approveSpender' && params.token && params.spender && params.amountUnits) {
    return {
      title: '已更新授权额度',
      tx: () =>
        writeContractAsync({
          address: treasuryAddress,
          abi: fluxSwapTreasuryAbi,
          functionName: 'executeApproveSpender',
          args: [params.token!, params.spender!, BigInt(params.amountUnits!), operationId],
          ...localGasOverride,
        }),
    };
  }

  if (metadata.kind === 'revokeSpender' && params.token && params.spender) {
    return {
      title: '已撤销授权额度',
      tx: () =>
        writeContractAsync({
          address: treasuryAddress,
          abi: fluxSwapTreasuryAbi,
          functionName: 'executeRevokeSpender',
          args: [params.token!, params.spender!, operationId],
          ...localGasOverride,
        }),
    };
  }

  if (metadata.kind === 'setGuardian' && params.newGuardian) {
    return {
      title: '已更新守护者',
      tx: () =>
        writeContractAsync({
          address: treasuryAddress,
          abi: fluxSwapTreasuryAbi,
          functionName: 'executeSetGuardian',
          args: [params.newGuardian!, operationId],
          ...localGasOverride,
        }),
    };
  }

  if (metadata.kind === 'setOperator' && params.newOperator) {
    return {
      title: '已更新操作员',
      tx: () =>
        writeContractAsync({
          address: treasuryAddress,
          abi: fluxSwapTreasuryAbi,
          functionName: 'executeSetOperator',
          args: [params.newOperator!, operationId],
          ...localGasOverride,
        }),
    };
  }

  if (metadata.kind === 'setMinDelay' && params.newMinDelay) {
    return {
      title: '已更新治理延迟',
      tx: () =>
        writeContractAsync({
          address: treasuryAddress,
          abi: fluxSwapTreasuryAbi,
          functionName: 'executeSetMinDelay',
          args: [BigInt(params.newMinDelay!), operationId],
          ...localGasOverride,
        }),
    };
  }

  if (
    metadata.kind === 'emergencyWithdraw' &&
    params.withdrawToken &&
    params.withdrawRecipient &&
    params.withdrawAmountUnits
  ) {
    return {
      title: '已执行紧急提取',
      tx: () =>
        writeContractAsync({
          address: treasuryAddress,
          abi: fluxSwapTreasuryAbi,
          functionName: 'executeEmergencyWithdraw',
          args: [params.withdrawToken!, params.withdrawRecipient!, BigInt(params.withdrawAmountUnits!), operationId],
          ...localGasOverride,
        }),
    };
  }

  if (metadata.kind === 'emergencyWithdrawETH' && params.withdrawRecipient && params.withdrawAmountUnits) {
    return {
      title: '已执行 ETH 紧急提取',
      tx: () =>
        writeContractAsync({
          address: treasuryAddress,
          abi: fluxSwapTreasuryAbi,
          functionName: 'executeEmergencyWithdrawETH',
          args: [params.withdrawRecipient!, BigInt(params.withdrawAmountUnits!), operationId],
          ...localGasOverride,
        }),
    };
  }

  return null;
}
