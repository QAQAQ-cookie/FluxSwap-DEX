import { hardhat, sepolia, type Chain } from 'wagmi/chains'

const configuredChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID?.trim() || hardhat.id)

function resolveChain(chainId: number): Chain {
  if (chainId === hardhat.id) {
    return hardhat
  }

  if (chainId === sepolia.id) {
    return sepolia
  }

  throw new Error(`Unsupported NEXT_PUBLIC_CHAIN_ID: ${chainId}`)
}

function configuredUrl(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized ? normalized.replace(/\/$/, '') : undefined
}

export const fluxChain = resolveChain(configuredChainId)
export const fluxChainId = fluxChain.id

export function getSubgraphUrl(): string {
  return (
    configuredUrl(process.env.NEXT_PUBLIC_SUBGRAPH_URL) ??
    'http://localhost:8000/subgraphs/name/fluxswap-subgraph'
  )
}

export function getTransactionExplorerUrl(
  chainId: number | undefined,
  txHash: string,
): string | undefined {
  if (!txHash || chainId !== fluxChainId) {
    return undefined
  }

  const explorerUrl =
    configuredUrl(process.env.NEXT_PUBLIC_EXPLORER_URL) ??
    (fluxChainId === sepolia.id ? 'https://sepolia.etherscan.io' : undefined)

  return explorerUrl ? `${explorerUrl}/tx/${txHash}` : undefined
}
