import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { fluxChain } from './chain';

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? 'YOUR_PROJECT_ID';

export const config = getDefaultConfig({
  appName: 'FluxSwap DEX',
  projectId,
  chains: [fluxChain],
  ssr: true, // If your dApp uses server side rendering (SSR)
});
