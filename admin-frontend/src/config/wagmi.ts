import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { hardhat, sepolia } from 'wagmi/chains';
import { fluxChainId } from './contracts';

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? 'YOUR_PROJECT_ID';

export const config = getDefaultConfig({
  appName: 'FluxSwap Admin',
  projectId,
  chains: [fluxChainId === hardhat.id ? hardhat : sepolia],
  ssr: true,
});
