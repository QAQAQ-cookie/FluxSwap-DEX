import type { Address } from 'viem'

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

type WatchAssetOptions = {
  address: Address
  symbol: string
  decimals: number
  image?: string
}

function getEthereumProvider(): EthereumProvider | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  return (window as Window & { ethereum?: EthereumProvider }).ethereum
}

export async function watchWalletAsset(options: WatchAssetOptions): Promise<boolean> {
  const provider = getEthereumProvider()
  if (!provider) {
    throw new Error('Wallet provider is not available.')
  }

  const result = await provider.request({
    method: 'wallet_watchAsset',
    params: [
      {
        type: 'ERC20',
        options,
      },
    ],
  })

  return Boolean(result)
}

export function truncateAddress(
  value?: string,
  leading = 6,
  trailing = 4,
): string {
  if (!value) {
    return '--'
  }

  if (value.length <= leading + trailing + 3) {
    return value
  }

  return `${value.slice(0, leading)}...${value.slice(-trailing)}`
}

export function formatTimestamp(
  timestamp?: number,
  locale = 'en-US',
): string {
  if (!timestamp) {
    return '--'
  }

  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp * 1000))
}
