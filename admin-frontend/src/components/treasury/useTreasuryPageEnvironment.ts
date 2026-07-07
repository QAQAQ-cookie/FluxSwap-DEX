'use client';

import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useMemo } from 'react';
import { useAccount, useChainId, useSignMessage, useWriteContract } from 'wagmi';

import { getContractAddress, getLocalGasOverride, isFluxSupportedChain } from '@/config/contracts';
import { getAdminTokenOptions } from '@/config/tokens';

export function useTreasuryPageEnvironment() {
  const chainId = useChainId();
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { writeContractAsync } = useWriteContract();
  const { signMessageAsync } = useSignMessage();

  const supportedChain = isFluxSupportedChain(chainId);
  const treasuryAddress = getContractAddress('FluxSwapTreasury', chainId);
  const managerAddress = getContractAddress('FluxMultiPoolManager', chainId);
  const localGasOverride = getLocalGasOverride(chainId);
  const tokens = useMemo(() => getAdminTokenOptions(chainId), [chainId]);

  return {
    chainId,
    address,
    isConnected,
    openConnectModal,
    writeContractAsync,
    signMessageAsync,
    supportedChain,
    treasuryAddress,
    managerAddress,
    localGasOverride,
    tokens,
  };
}
