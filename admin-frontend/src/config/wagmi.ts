import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { hardhat, mainnet, sepolia } from 'wagmi/chains';

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? 'YOUR_PROJECT_ID';

export const config = getDefaultConfig({
  appName: 'FluxSwap Admin',
  projectId,
  chains: [hardhat, sepolia, mainnet],
  ssr: true,
});
