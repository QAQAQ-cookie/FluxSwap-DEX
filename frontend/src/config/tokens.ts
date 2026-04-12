import type { Address } from 'viem'

import { getContractAddress } from './contracts'

export type SwapTokenSymbol = 'ETH' | 'FLUX'

export interface SwapTokenOption {
  symbol: SwapTokenSymbol
  name: string
  decimals: number
  kind: 'native' | 'erc20'
  address?: Address
  routeAddress: Address
}

export function getSwapTokenOptions(chainId?: number | null): SwapTokenOption[] {
  const wrappedNativeAddress = getContractAddress('MockWETH', chainId)
  const fluxAddress = getContractAddress('FluxToken', chainId)

  const options: SwapTokenOption[] = []

  if (wrappedNativeAddress) {
    options.push({
      symbol: 'ETH',
      name: 'Ether',
      decimals: 18,
      kind: 'native',
      routeAddress: wrappedNativeAddress,
    })
  }

  if (fluxAddress) {
    options.push({
      symbol: 'FLUX',
      name: 'Flux Token',
      decimals: 18,
      kind: 'erc20',
      address: fluxAddress,
      routeAddress: fluxAddress,
    })
  }

  return options
}
