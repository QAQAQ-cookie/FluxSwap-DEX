import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAccount, useChainId, usePublicClient } from 'wagmi';

import { getContractAddress, getLocalGasOverride, isFluxSupportedChain } from '@/config/contracts';
import { getSwapTokenOptions } from '@/config/tokens';

export function useEarnPageEnvironment() {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const supportedChain = useMemo(() => isFluxSupportedChain(chainId), [chainId]);
  const managerAddress = useMemo(() => getContractAddress('FluxMultiPoolManager', chainId), [chainId]);
  const wrappedNativeAddress = useMemo(() => getContractAddress('MockWETH', chainId), [chainId]);
  const knownTokens = useMemo(() => getSwapTokenOptions(chainId), [chainId]);
  const localGasOverride = useMemo(() => getLocalGasOverride(chainId), [chainId]);

  return {
    isZh,
    chainId,
    publicClient,
    address,
    isConnected,
    openConnectModal,
    supportedChain,
    managerAddress,
    wrappedNativeAddress,
    knownTokens,
    localGasOverride,
  };
}

export type EarnPageEnvironment = ReturnType<typeof useEarnPageEnvironment>;
