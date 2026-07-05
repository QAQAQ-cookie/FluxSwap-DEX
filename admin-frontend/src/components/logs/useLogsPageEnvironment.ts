'use client';

import { useChainId, usePublicClient } from 'wagmi';

import { getContractAddress, isFluxSupportedChain } from '@/config/contracts';

export function useLogsPageEnvironment() {
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });
  const supportedChain = isFluxSupportedChain(chainId);
  const factoryAddress = getContractAddress('FluxPoolFactory', chainId);
  const managerAddress = getContractAddress('FluxMultiPoolManager', chainId);
  const treasuryAddress = getContractAddress('FluxSwapTreasury', chainId);
  const rewardTokenAddress = getContractAddress('FluxToken', chainId);

  return {
    chainId,
    publicClient,
    supportedChain,
    factoryAddress,
    managerAddress,
    treasuryAddress,
    rewardTokenAddress,
  };
}
