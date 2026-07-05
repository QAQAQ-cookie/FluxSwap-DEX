'use client';

import { useMemo } from 'react';
import { useChainId, usePublicClient } from 'wagmi';

import { getContractAddress, isFluxSupportedChain } from '@/config/contracts';
import { getAdminTokenOptions } from '@/config/tokens';

export function useTokensPageEnvironment() {
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });
  const supportedChain = isFluxSupportedChain(chainId);
  const treasuryAddress = getContractAddress('FluxSwapTreasury', chainId);
  const swapFactoryAddress = getContractAddress('FluxSwapFactory', chainId);
  const poolFactoryAddress = getContractAddress('FluxPoolFactory', chainId);
  const wrappedNativeAddress = getContractAddress('MockWETH', chainId);
  const rewardTokenAddress = getContractAddress('FluxToken', chainId);
  const configuredTokens = useMemo(() => getAdminTokenOptions(chainId), [chainId]);

  return {
    chainId,
    publicClient,
    supportedChain,
    treasuryAddress,
    swapFactoryAddress,
    poolFactoryAddress,
    wrappedNativeAddress,
    rewardTokenAddress,
    configuredTokens,
  };
}
