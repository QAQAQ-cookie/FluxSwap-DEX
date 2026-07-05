import { isAddress, type Address, type Hex } from 'viem';
import type { UsePublicClientReturnType, UseWriteContractReturnType } from 'wagmi';

import type { TreasuryTokenRow } from '@/components/treasury/TreasuryTypes';
import { ZERO_BIGINT } from '@/components/treasury/TreasuryUtils';
import { parseAmount } from '@/lib/amounts';
import { fluxSwapTreasuryAbi } from '@/lib/contracts';

type TreasuryPublicClient = NonNullable<UsePublicClientReturnType>;
type WriteContractAsync = UseWriteContractReturnType['writeContractAsync'];

type SubmitTreasuryAllocationParams = {
  treasuryAddress?: Address;
  selectedToken?: TreasuryTokenRow;
  publicClient?: TreasuryPublicClient;
  mounted: boolean;
  isConnected: boolean;
  canAllocate: boolean;
  paused?: boolean;
  recipientAddress: string;
  amountValue: string;
  localGasOverride: { gas?: bigint };
  writeContractAsync: WriteContractAsync;
  openConnectModal?: () => void;
  onError: (state: { kind: 'error'; title: string; message: string }) => void;
  runTransaction: (action: 'allocate', title: string, tx: () => Promise<Hex>) => void;
};

export async function submitTreasuryAllocation({
  treasuryAddress,
  selectedToken,
  publicClient,
  mounted,
  isConnected,
  canAllocate,
  paused,
  recipientAddress,
  amountValue,
  localGasOverride,
  writeContractAsync,
  openConnectModal,
  onError,
  runTransaction,
}: SubmitTreasuryAllocationParams) {
  if (!treasuryAddress || !selectedToken || !publicClient) {
    onError({ kind: 'error', title: '暂无法划拨', message: '金库资产信息尚未加载完成。' });
    return;
  }

  if (!mounted || !isConnected) {
    openConnectModal?.();
    return;
  }

  if (!canAllocate) {
    onError({
      kind: 'error',
      title: '暂无法划拨',
      message: paused ? '金库当前已暂停，不能执行资产划拨。' : '只有操作员或多签钱包可以划拨资产。',
    });
    return;
  }

  if (!isAddress(recipientAddress)) {
    onError({ kind: 'error', title: '参数无效', message: '请输入有效的划拨接收地址。' });
    return;
  }

  const amountUnits = parseAmount(amountValue, selectedToken.decimals);
  if (!amountUnits || amountUnits <= ZERO_BIGINT) {
    onError({ kind: 'error', title: '参数无效', message: '划拨数量必须大于 0。' });
    return;
  }

  if (amountUnits > selectedToken.balance) {
    onError({ kind: 'error', title: '划拨失败', message: '划拨数量不能超过当前金库余额。' });
    return;
  }

  if (selectedToken.dailySpendCap > ZERO_BIGINT && selectedToken.spentToday + amountUnits > selectedToken.dailySpendCap) {
    onError({ kind: 'error', title: '划拨失败', message: '本次划拨会超过该资产今日剩余额度。' });
    return;
  }

  const recipientAllowed = await publicClient.readContract({
    address: treasuryAddress,
    abi: fluxSwapTreasuryAbi,
    functionName: 'allowedRecipients',
    args: [recipientAddress],
  });

  if (!recipientAllowed) {
    onError({
      kind: 'error',
      title: '划拨失败',
      message: '请先通过治理操作把该接收地址加入白名单，再执行划拨。',
    });
    return;
  }

  runTransaction('allocate', '已划拨金库资产', () =>
    selectedToken.isNative
      ? writeContractAsync({
          address: treasuryAddress,
          abi: fluxSwapTreasuryAbi,
          functionName: 'allocateETH',
          args: [recipientAddress, amountUnits],
          ...localGasOverride,
        })
      : writeContractAsync({
          address: treasuryAddress,
          abi: fluxSwapTreasuryAbi,
          functionName: 'allocate',
          args: [selectedToken.address, recipientAddress, amountUnits],
          ...localGasOverride,
        }),
  );
}
