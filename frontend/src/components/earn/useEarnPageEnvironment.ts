import { useConnectModal } from '@rainbow-me/rainbowkit';
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

  return {
    isZh,
    chainId,
    publicClient,
    address,
    isConnected,
    openConnectModal,
    supportedChain: isFluxSupportedChain(chainId),
    managerAddress: getContractAddress('FluxMultiPoolManager', chainId),
    wrappedNativeAddress: getContractAddress('MockWETH', chainId),
    knownTokens: getSwapTokenOptions(chainId),
    localGasOverride: getLocalGasOverride(chainId),
  };
}

export type EarnPageEnvironment = ReturnType<typeof useEarnPageEnvironment>;
