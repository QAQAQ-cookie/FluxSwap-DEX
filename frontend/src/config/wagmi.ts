import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { mainnet, sepolia, hardhat } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'FluxSwap DEX',
  projectId: 'YOUR_PROJECT_ID', // You can get a project ID from WalletConnect Cloud
  chains: [mainnet, sepolia, hardhat],
  ssr: true, // If your dApp uses server side rendering (SSR)
});
