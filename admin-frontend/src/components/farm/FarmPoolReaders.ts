import type { Address } from 'viem';

import type { FarmRow, PoolTuple, TokenMeta } from '@/components/farm/FarmTypes';
import type { FarmPublicClient } from '@/components/farm/FarmReaderTypes';
import { fluxMultiPoolManagerAbi, fluxSwapStakingRewardsAbi } from '@/lib/contracts';

export async function readFarmRows({
  publicClient,
  managerAddress,
  poolCount,
  readTokenMeta,
}: {
  publicClient: FarmPublicClient;
  managerAddress: Address;
  poolCount: number;
  readTokenMeta: (tokenAddress: Address) => Promise<TokenMeta>;
}): Promise<FarmRow[]> {
  return Promise.all(
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
}
