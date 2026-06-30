import type { Address } from 'viem';

import { getContractAddress } from './contracts';

export type AdminTokenOption = {
  symbol: string;
  name: string;
  decimals: number;
  address: Address;
};

type TokenRegistryEntry = {
  symbol: string;
  name: string;
  decimals: number;
  resolveAddress: (chainId?: number | null) => Address | undefined;
};

const tokenRegistry: TokenRegistryEntry[] = [
  {
    symbol: 'FLUX',
    name: 'Flux Token',
    decimals: 18,
    resolveAddress: (chainId) => getContractAddress('FluxToken', chainId),
  },
  {
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    resolveAddress: (chainId) => getContractAddress('MockUSDT', chainId),
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    resolveAddress: (chainId) => getContractAddress('MockUSDC', chainId),
  },
  {
    symbol: 'WBTC',
    name: 'Wrapped Bitcoin',
    decimals: 8,
    resolveAddress: (chainId) => getContractAddress('MockWBTC', chainId),
  },
  {
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
    resolveAddress: (chainId) => getContractAddress('MockWETH', chainId),
  },
];

export function getAdminTokenOptions(chainId?: number | null): AdminTokenOption[] {
  return tokenRegistry.flatMap((token) => {
    const address = token.resolveAddress(chainId);

    if (!address) {
      return [];
    }

    return [{ ...token, address }];
  });
}
