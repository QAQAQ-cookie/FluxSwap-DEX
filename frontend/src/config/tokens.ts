import type { Address } from 'viem'

import { getContractAddress } from './contracts'

export type SwapTokenSymbol = string

export interface SwapTokenOption {
  symbol: SwapTokenSymbol
  name: string
  decimals: number
  kind: 'native' | 'erc20'
  address?: Address
  routeAddress: Address
}

type TokenRegistryEntry = {
  symbol: SwapTokenSymbol
  name: string
  decimals: number
  kind: 'native' | 'erc20'
  resolveAddress?: (chainId?: number | null) => Address | undefined
  resolveRouteAddress: (chainId?: number | null) => Address | undefined
}

const tokenRegistry: TokenRegistryEntry[] = [
  {
    symbol: 'ETH',
    name: 'Ether',
    decimals: 18,
    kind: 'native',
    resolveRouteAddress: (chainId) => getContractAddress('MockWETH', chainId),
  },
  {
    symbol: 'FLUX',
    name: 'Flux Token',
    decimals: 18,
    kind: 'erc20',
    resolveAddress: (chainId) => getContractAddress('FluxToken', chainId),
    resolveRouteAddress: (chainId) => getContractAddress('FluxToken', chainId),
  },
  {
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    kind: 'erc20',
    resolveAddress: (chainId) => getContractAddress('MockUSDT', chainId),
    resolveRouteAddress: (chainId) => getContractAddress('MockUSDT', chainId),
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    kind: 'erc20',
    resolveAddress: (chainId) => getContractAddress('MockUSDC', chainId),
    resolveRouteAddress: (chainId) => getContractAddress('MockUSDC', chainId),
  },
  {
    symbol: 'WBTC',
    name: 'Wrapped Bitcoin',
    decimals: 8,
    kind: 'erc20',
    resolveAddress: (chainId) => getContractAddress('MockWBTC', chainId),
    resolveRouteAddress: (chainId) => getContractAddress('MockWBTC', chainId),
  },
]

export function getSwapTokenOptions(chainId?: number | null): SwapTokenOption[] {
  return tokenRegistry.flatMap((token) => {
    const routeAddress = token.resolveRouteAddress(chainId)

    if (!routeAddress) {
      return []
    }

    const address = token.resolveAddress?.(chainId)

    return [
      {
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        kind: token.kind,
        address,
        routeAddress,
      } satisfies SwapTokenOption,
    ]
  })
}
