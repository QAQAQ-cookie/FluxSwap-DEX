import type { Address } from 'viem'
import { hardhat } from 'wagmi/chains'

import {
  fluxContractNames,
  generatedContractAddressesByChain,
  type FluxContractAddressMap,
  type FluxContractName,
} from './contracts.generated'
import { fluxChainId } from './chain'

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

const configuredContracts = compactAddressMap({
  FluxBuybackExecutor: process.env.NEXT_PUBLIC_FLUX_BUYBACK_EXECUTOR as OptionalAddress,
  FluxMultiPoolManager: process.env.NEXT_PUBLIC_FLUX_MULTI_POOL_MANAGER as OptionalAddress,
  FluxPoolFactory: process.env.NEXT_PUBLIC_FLUX_POOL_FACTORY as OptionalAddress,
  FluxRevenueDistributor: process.env.NEXT_PUBLIC_FLUX_REVENUE_DISTRIBUTOR as OptionalAddress,
  FluxSignedOrderSettlement: process.env.NEXT_PUBLIC_FLUX_SIGNED_ORDER_SETTLEMENT as OptionalAddress,
  FluxSwapFactory: process.env.NEXT_PUBLIC_FLUX_SWAP_FACTORY as OptionalAddress,
  FluxSwapRouter: process.env.NEXT_PUBLIC_FLUX_SWAP_ROUTER as OptionalAddress,
  FluxSwapTreasury: process.env.NEXT_PUBLIC_FLUX_SWAP_TREASURY as OptionalAddress,
  FluxToken: process.env.NEXT_PUBLIC_FLUX_TOKEN as OptionalAddress,
  MockUSDT: process.env.NEXT_PUBLIC_USDT as OptionalAddress,
  MockUSDC: process.env.NEXT_PUBLIC_USDC as OptionalAddress,
  MockWBTC: process.env.NEXT_PUBLIC_WBTC as OptionalAddress,
  MockWETH: process.env.NEXT_PUBLIC_WETH as OptionalAddress,
})

const requiredProtocolContracts: readonly FluxContractName[] = fluxContractNames

export { fluxContractNames }
export type { FluxContractAddressMap, FluxContractName }

const configuredContractAddresses =
  fluxChainId === hardhat.id ? generatedContractsByChain[hardhat.id] ?? {} : configuredContracts

export function getContractsForChain(chainId?: number | null): FluxContractAddressMap {
  if (chainId === undefined || chainId === null) {
    return {}
  }

  if (chainId !== fluxChainId) {
    return {}
  }

  return configuredContractAddresses
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
  const contracts = getContractsForChain(chainId)

  return requiredProtocolContracts.every((contractName) => contracts[contractName] !== undefined)
}

export function getLocalGasOverride(
  chainId?: number | null,
  gas: bigint = BigInt(8_000_000),
): { gas?: bigint } {
  if (chainId === hardhat.id) {
    return { gas }
  }

  return {}
}
