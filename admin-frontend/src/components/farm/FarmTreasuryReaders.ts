import type { Address } from 'viem';

import type { TreasuryStatus } from '@/components/farm/FarmTypes';
import type { FarmPublicClient } from '@/components/farm/FarmReaderTypes';
import { fluxSwapErc20Abi, fluxSwapTreasuryAbi } from '@/lib/contracts';

export async function readFarmTreasuryStatus({
  publicClient,
  rewardToken,
  treasury,
  managerAddress,
}: {
  publicClient: FarmPublicClient;
  rewardToken: Address;
  treasury: Address;
  managerAddress: Address;
}): Promise<TreasuryStatus | undefined> {
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

  if (!treasuryReads.every((result) => result.status === 'fulfilled')) {
    return undefined;
  }

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

  return {
    rewardBalance: rewardBalanceResult.value,
    approvedSpendRemaining: approvedSpendRemainingResult.value,
    dailySpendCap: dailySpendCapResult.value,
    spentToday: spentTodayResult.value,
    paused: pausedResult.value,
    multisig: multisigResult.value,
    operator: operatorResult.value,
  };
}
