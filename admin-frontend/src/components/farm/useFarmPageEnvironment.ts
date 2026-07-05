'use client';

import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useMemo } from 'react';
import { useAccount, useChainId, usePublicClient, useWriteContract } from 'wagmi';

import { getContractAddress, getLocalGasOverride, isFluxSupportedChain } from '@/config/contracts';
import { getAdminTokenOptions } from '@/config/tokens';

export function useFarmPageEnvironment() {
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { writeContractAsync } = useWriteContract();

  const supportedChain = isFluxSupportedChain(chainId);
  const managerAddress = getContractAddress('FluxMultiPoolManager', chainId);
  const factoryAddress = getContractAddress('FluxPoolFactory', chainId);
  const swapFactoryAddress = getContractAddress('FluxSwapFactory', chainId);
  const wrappedNativeAddress = getContractAddress('MockWETH', chainId);
  const localGasOverride = getLocalGasOverride(chainId);
  const configuredSingleTokens = useMemo(() => getAdminTokenOptions(chainId), [chainId]);

  return {
    publicClient,
    address,
    isConnected,
    openConnectModal,
    writeContractAsync,
    supportedChain,
    managerAddress,
    factoryAddress,
    swapFactoryAddress,
    wrappedNativeAddress,
    localGasOverride,
    configuredSingleTokens,
  };
}
