import type { Address } from 'viem';

import type { TokenMeta } from '@/components/farm/FarmTypes';
import type { FarmPublicClient } from '@/components/farm/FarmReaderTypes';
import { normalizeSymbol, shortAddress } from '@/components/farm/FarmUtils';
import { fluxSwapErc20Abi, fluxSwapPairAbi } from '@/lib/contracts';

export async function readFarmTokenMeta({
  publicClient,
  tokenAddress,
  wrappedNativeAddress,
}: {
  publicClient: FarmPublicClient;
  tokenAddress: Address;
  wrappedNativeAddress?: Address;
}): Promise<TokenMeta> {
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
}

export function getFallbackTokenMeta(tokenAddress: Address): TokenMeta {
  return {
    address: tokenAddress,
    label: shortAddress(tokenAddress),
    symbol: 'TOKEN',
    decimals: 18,
    isLp: false,
  };
}
