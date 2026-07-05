'use client';

import { useMemo } from 'react';
import { useChainId, usePublicClient } from 'wagmi';

import { getContractAddress, isFluxSupportedChain } from '@/config/contracts';
import { getAdminTokenOptions } from '@/config/tokens';

export function useOverviewPageEnvironment() {
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });
  const supportedChain = isFluxSupportedChain(chainId);
  const configuredTokens = useMemo(() => getAdminTokenOptions(chainId), [chainId]);
  const managerAddress = getContractAddress('FluxMultiPoolManager', chainId);
  const treasuryAddress = getContractAddress('FluxSwapTreasury', chainId);
  const wrappedNativeAddress = getContractAddress('MockWETH', chainId);

  return {
    chainId,
    publicClient,
    supportedChain,
    configuredTokens,
    managerAddress,
    treasuryAddress,
    wrappedNativeAddress,
  };
}
