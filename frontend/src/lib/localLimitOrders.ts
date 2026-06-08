import type { PublicClient } from 'viem'
import { hardhat } from 'wagmi/chains'

export const LOCAL_LIMIT_ORDERS_STORAGE_KEY = 'fluxswap:limit-orders:v1'
export const LOCAL_LIMIT_ORDERS_UPDATED_EVENT = 'fluxswap:limit-orders-updated'
const LOCAL_LIMIT_ORDERS_CHAIN_STATE_STORAGE_KEY =
  'fluxswap:limit-orders:chain-state:v1'

export type LocalLimitOrderRecord = {
  chainId: number
  settlementAddress: string
  orderHash: string
  maker: string
  inputToken: string
  outputToken: string
  amountIn: string
  minAmountOut: string
  maxExecutorRewardBps: string
  triggerPriceX18: string
  expiry: string
  nonce: string
  recipient: string
  source: string
  status: string
  createdAt: string
  updatedAt: string
}

type LocalLimitOrdersChainState = {
  chainId: number
  lastSeenBlockNumber: string
  lastSeenBlockHash: string
}

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function normalizeAddress(value: string) {
  return value.trim().toLowerCase()
}

function normalizeHash(value: string) {
  return value.trim().toLowerCase()
}

function parseStoredBigInt(value: string) {
  try {
    return BigInt(value)
  } catch {
    return undefined
  }
}

function buildOrderKey(order: Pick<LocalLimitOrderRecord, 'chainId' | 'settlementAddress' | 'orderHash'>) {
  return `${order.chainId}:${normalizeAddress(order.settlementAddress)}:${normalizeHash(order.orderHash)}`
}

function isLocalLimitOrderRecord(value: unknown): value is LocalLimitOrderRecord {
  if (!value || typeof value !== 'object') {
    return false
  }

  const item = value as Partial<LocalLimitOrderRecord>

  return (
    typeof item.chainId === 'number' &&
    typeof item.settlementAddress === 'string' &&
    typeof item.orderHash === 'string' &&
    typeof item.maker === 'string' &&
    typeof item.inputToken === 'string' &&
    typeof item.outputToken === 'string' &&
    typeof item.amountIn === 'string' &&
    typeof item.minAmountOut === 'string' &&
    typeof item.maxExecutorRewardBps === 'string' &&
    typeof item.triggerPriceX18 === 'string' &&
    typeof item.expiry === 'string' &&
    typeof item.nonce === 'string' &&
    typeof item.recipient === 'string' &&
    typeof item.source === 'string' &&
    typeof item.status === 'string' &&
    typeof item.createdAt === 'string' &&
    typeof item.updatedAt === 'string'
  )
}

function isLocalLimitOrdersChainState(
  value: unknown,
): value is LocalLimitOrdersChainState {
  if (!value || typeof value !== 'object') {
    return false
  }

  const item = value as Partial<LocalLimitOrdersChainState>

  return (
    typeof item.chainId === 'number' &&
    typeof item.lastSeenBlockNumber === 'string' &&
    typeof item.lastSeenBlockHash === 'string'
  )
}

function readStoredLimitOrders(): LocalLimitOrderRecord[] {
  if (!canUseLocalStorage()) {
    return []
  }

  try {
    const raw = window.localStorage.getItem(LOCAL_LIMIT_ORDERS_STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter(isLocalLimitOrderRecord)
  } catch {
    return []
  }
}

function writeStoredLimitOrders(orders: LocalLimitOrderRecord[]) {
  if (!canUseLocalStorage()) {
    return
  }

  window.localStorage.setItem(LOCAL_LIMIT_ORDERS_STORAGE_KEY, JSON.stringify(orders))
  window.dispatchEvent(new CustomEvent(LOCAL_LIMIT_ORDERS_UPDATED_EVENT))
}

function readStoredChainStates(): LocalLimitOrdersChainState[] {
  if (!canUseLocalStorage()) {
    return []
  }

  try {
    const raw = window.localStorage.getItem(LOCAL_LIMIT_ORDERS_CHAIN_STATE_STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter(isLocalLimitOrdersChainState)
  } catch {
    return []
  }
}

function writeStoredChainStates(states: LocalLimitOrdersChainState[]) {
  if (!canUseLocalStorage()) {
    return
  }

  window.localStorage.setItem(
    LOCAL_LIMIT_ORDERS_CHAIN_STATE_STORAGE_KEY,
    JSON.stringify(states),
  )
}

function updateStoredChainState(
  chainId: number,
  lastSeenBlockNumber: bigint,
  lastSeenBlockHash: string,
) {
  const nextState: LocalLimitOrdersChainState = {
    chainId,
    lastSeenBlockNumber: lastSeenBlockNumber.toString(),
    lastSeenBlockHash: normalizeHash(lastSeenBlockHash),
  }
  const states = readStoredChainStates()
  const nextStates = [...states]
  const existingIndex = nextStates.findIndex((item) => item.chainId === chainId)

  if (existingIndex >= 0) {
    nextStates[existingIndex] = nextState
  } else {
    nextStates.push(nextState)
  }

  writeStoredChainStates(nextStates)
}

function clearStoredLimitOrdersForChain(chainId: number) {
  const orders = readStoredLimitOrders()
  const nextOrders = orders.filter((order) => order.chainId !== chainId)

  if (nextOrders.length !== orders.length) {
    writeStoredLimitOrders(nextOrders)
  }
}

export function listLocalLimitOrders(): LocalLimitOrderRecord[] {
  return readStoredLimitOrders()
}

export async function syncLocalLimitOrdersWithChain({
  publicClient,
  chainId,
  latestBlockNumber,
  latestBlockHash,
}: {
  publicClient: PublicClient
  chainId: number
  latestBlockNumber?: bigint
  latestBlockHash?: string
}) {
  const latestBlock =
    latestBlockNumber !== undefined && latestBlockHash
      ? { number: latestBlockNumber, hash: latestBlockHash }
      : await publicClient.getBlock()
  const currentBlockNumber = latestBlock.number
  const currentBlockHash = latestBlock.hash

  if (currentBlockNumber === null || !currentBlockHash) {
    return false
  }

  const chainStates = readStoredChainStates()
  const currentState = chainStates.find((item) => item.chainId === chainId)
  const shouldBootstrapReset = chainId === hardhat.id && !currentState

  let didClear = false
  if (shouldBootstrapReset) {
    clearStoredLimitOrdersForChain(chainId)
    didClear = true
  } else if (currentState) {
    const storedBlockNumber = parseStoredBigInt(currentState.lastSeenBlockNumber)
    const storedBlockHash = normalizeHash(currentState.lastSeenBlockHash)

    if (
      storedBlockNumber === undefined ||
      storedBlockHash === '' ||
      currentBlockNumber < storedBlockNumber
    ) {
      clearStoredLimitOrdersForChain(chainId)
      didClear = true
    } else {
      try {
        const historicalBlock = await publicClient.getBlock({
          blockNumber: storedBlockNumber,
        })
        const historicalBlockHash = historicalBlock.hash
          ? normalizeHash(historicalBlock.hash)
          : ''

        if (!historicalBlockHash || historicalBlockHash !== storedBlockHash) {
          clearStoredLimitOrdersForChain(chainId)
          didClear = true
        }
      } catch {
        clearStoredLimitOrdersForChain(chainId)
        didClear = true
      }
    }
  }

  updateStoredChainState(chainId, currentBlockNumber, currentBlockHash)
  return didClear
}

export function upsertLocalLimitOrder(order: LocalLimitOrderRecord) {
  const orders = readStoredLimitOrders()
  const orderKey = buildOrderKey(order)
  const nextOrders = [...orders]
  const existingIndex = nextOrders.findIndex((item) => buildOrderKey(item) === orderKey)

  if (existingIndex >= 0) {
    nextOrders[existingIndex] = {
      ...nextOrders[existingIndex],
      ...order,
      createdAt: nextOrders[existingIndex].createdAt || order.createdAt,
    }
  } else {
    nextOrders.unshift(order)
  }

  writeStoredLimitOrders(nextOrders)
}
