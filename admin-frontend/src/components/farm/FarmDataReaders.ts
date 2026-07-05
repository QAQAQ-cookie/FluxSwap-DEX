import type { Address } from 'viem';

import type { AdminInfo, FarmRow, LpPairOption, SingleTokenOption } from '@/components/farm/FarmTypes';
import { readLpPairOptions } from '@/components/farm/FarmPairOptionReaders';
import { readFarmRows } from '@/components/farm/FarmPoolReaders';
import type { FarmPublicClient } from '@/components/farm/FarmReaderTypes';
import { ZERO_BIGINT } from '@/components/farm/FarmUtils';
import { readFarmTokenMeta } from '@/components/farm/FarmTokenReaders';
import { readFarmTreasuryStatus } from '@/components/farm/FarmTreasuryReaders';
import type { AdminTokenOption } from '@/config/tokens';
import { fluxMultiPoolManagerAbi, fluxPoolFactoryAbi } from '@/lib/contracts';

export type FarmAdminSnapshot = {
  adminInfo: AdminInfo;
  farms: FarmRow[];
  lpPairOptions: LpPairOption[];
  singleTokenOptions: SingleTokenOption[];
};

export async function readFarmAdminSnapshot({
  publicClient,
  managerAddress,
  factoryAddress,
  swapFactoryAddress,
  wrappedNativeAddress,
  configuredSingleTokens,
}: {
  publicClient: FarmPublicClient;
  managerAddress: Address;
  factoryAddress: Address;
  swapFactoryAddress?: Address;
  wrappedNativeAddress?: Address;
  configuredSingleTokens: AdminTokenOption[];
}): Promise<FarmAdminSnapshot> {
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

  const readTokenMeta = (tokenAddress: Address) =>
    readFarmTokenMeta({
      publicClient,
      tokenAddress,
      wrappedNativeAddress,
    });

  const rewardTokenMeta = await readTokenMeta(rewardToken);
  const poolCount = Number(poolLength);
  const farms = await readFarmRows({
    publicClient,
    managerAddress,
    poolCount,
    readTokenMeta,
  });
  const existingStakingTokens = new Set(farms.map((farm) => farm.stakingToken.address.toLowerCase()));
  const [lpPairOptions, treasuryStatus] = await Promise.all([
    readLpPairOptions({
      publicClient,
      swapFactoryAddress,
      existingStakingTokens,
      readTokenMeta,
    }),
    readFarmTreasuryStatus({
      publicClient,
      rewardToken,
      treasury,
      managerAddress,
    }),
  ]);
  const singleTokenOptions = configuredSingleTokens.map((token) => ({
    address: token.address,
    label: token.symbol,
    symbol: token.symbol,
    decimals: token.decimals,
    isLp: false,
    alreadyFarmed: existingStakingTokens.has(token.address.toLowerCase()),
  })) satisfies SingleTokenOption[];

  return {
    adminInfo: {
      factoryOwner,
      managerOwner,
      managerOperator,
      treasury,
      rewardToken: rewardTokenMeta,
      totalAllocPoint,
      totalPendingRewards,
      undistributedRewards,
      poolLength: poolCount,
      activePoolCount: farms.filter((farm) => farm.active && farm.allocPoint > ZERO_BIGINT).length,
      treasuryStatus,
      treasuryStatusError: treasuryStatus ? undefined : '金库状态读取失败，请检查金库合约或 RPC 状态。',
    },
    farms,
    lpPairOptions,
    singleTokenOptions,
  };
}
