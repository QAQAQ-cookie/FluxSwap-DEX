import type { Address } from 'viem';

import type { LpPairOption, TokenMeta } from '@/components/farm/FarmTypes';
import type { FarmPublicClient } from '@/components/farm/FarmReaderTypes';
import { fluxSwapFactoryAbi } from '@/lib/contracts';

export async function readLpPairOptions({
  publicClient,
  swapFactoryAddress,
  existingStakingTokens,
  readTokenMeta,
}: {
  publicClient: FarmPublicClient;
  swapFactoryAddress?: Address;
  existingStakingTokens: Set<string>;
  readTokenMeta: (tokenAddress: Address) => Promise<TokenMeta>;
}): Promise<LpPairOption[]> {
  if (!swapFactoryAddress) {
    return [];
  }

  const pairCount = Number(
    await publicClient.readContract({
      address: swapFactoryAddress,
      abi: fluxSwapFactoryAbi,
      functionName: 'allPairsLength',
    }),
  );

  return Promise.all(
    Array.from({ length: pairCount }, async (_, index) => {
      const pairAddress = await publicClient.readContract({
        address: swapFactoryAddress,
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
}
