import type { Address } from 'viem'
import { hardhat, sepolia } from 'wagmi/chains'

import {
  fluxContractNames,
  generatedContractAddressesByChain,
  type FluxContractAddressMap,
  type FluxContractName,
} from './contracts.generated'

type OptionalAddress = Address | undefined
const generatedContractsByChain: Record<number, FluxContractAddressMap> =
  generatedContractAddressesByChain

function compactAddressMap(
  addressMap: Partial<Record<FluxContractName, OptionalAddress>>,
): FluxContractAddressMap {
  const entries = Object.entries(addressMap).filter((entry): entry is [FluxContractName, Address] =>
    typeof entry[1] === 'string' && entry[1].startsWith('0x'),
  )

  return Object.fromEntries(entries) as FluxContractAddressMap
}

const sepoliaContracts = compactAddressMap({
  FluxBuybackExecutor: process.env.NEXT_PUBLIC_SEPOLIA_FLUX_BUYBACK_EXECUTOR as OptionalAddress,
  FluxMultiPoolManager: process.env.NEXT_PUBLIC_SEPOLIA_FLUX_MULTI_POOL_MANAGER as OptionalAddress,
  FluxPoolFactory: process.env.NEXT_PUBLIC_SEPOLIA_FLUX_POOL_FACTORY as OptionalAddress,
  FluxRevenueDistributor: process.env.NEXT_PUBLIC_SEPOLIA_FLUX_REVENUE_DISTRIBUTOR as OptionalAddress,
  FluxSwapFactory: process.env.NEXT_PUBLIC_SEPOLIA_FLUX_SWAP_FACTORY as OptionalAddress,
  FluxSwapRouter: process.env.NEXT_PUBLIC_SEPOLIA_FLUX_SWAP_ROUTER as OptionalAddress,
  FluxSwapTreasury: process.env.NEXT_PUBLIC_SEPOLIA_FLUX_SWAP_TREASURY as OptionalAddress,
  FluxToken: process.env.NEXT_PUBLIC_SEPOLIA_FLUX_TOKEN as OptionalAddress,
  MockWETH: process.env.NEXT_PUBLIC_SEPOLIA_WETH as OptionalAddress,
})

export { fluxContractNames }
export type { FluxContractAddressMap, FluxContractName }

export const fluxContractAddressesByChain: Record<number, FluxContractAddressMap> = {
  [hardhat.id]: generatedContractsByChain[hardhat.id] ?? {},
  [sepolia.id]: sepoliaContracts,
}

export function getContractsForChain(chainId?: number | null): FluxContractAddressMap {
  if (chainId === undefined || chainId === null) {
    return {}
  }

  return fluxContractAddressesByChain[chainId] ?? generatedContractsByChain[chainId] ?? {}
}

export function getContractAddress(
  contractName: FluxContractName,
  chainId?: number | null,
): Address | undefined {
  return getContractsForChain(chainId)[contractName]
}

export function getRequiredContractAddress(
  contractName: FluxContractName,
  chainId?: number | null,
): Address {
  const address = getContractAddress(contractName, chainId)

  if (address === undefined) {
    throw new Error(`Missing ${contractName} address for chain ${chainId ?? 'unknown'}`)
  }

  return address
}

export function isFluxSupportedChain(chainId?: number | null): boolean {
  return Object.keys(getContractsForChain(chainId)).length > 0
}
