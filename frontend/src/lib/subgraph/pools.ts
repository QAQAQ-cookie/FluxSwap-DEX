import type { Address } from 'viem';

import { fetchSubgraph } from './client';

type SubgraphToken = {
  id: string;
  symbol: string;
  decimals?: number | string | null;
};

type SubgraphPair = {
  id: string;
  token0: SubgraphToken;
  token1: SubgraphToken;
  reserve0: string;
  reserve1: string;
  swaps?: SubgraphSwapEvent[];
  totalSupply?: string;
  txCount?: string;
  swapCount?: string;
  mintCount?: string;
  burnCount?: string;
  createdAtTimestamp?: string;
  createdAtTxHash?: string;
};

type PoolsQueryResult = {
  pairs?: SubgraphPair[];
};

type SubgraphSwapEvent = {
  id: string;
  sender: string;
  to: string;
  amount0In: string;
  amount1In: string;
  amount0Out: string;
  amount1Out: string;
  timestamp: string;
  blockNumber: string;
  txHash: string;
  logIndex: string;
};

type SubgraphMintEvent = {
  id: string;
  sender: string;
  amount0: string;
  amount1: string;
  timestamp: string;
  blockNumber: string;
  txHash: string;
  logIndex: string;
};

type SubgraphBurnEvent = {
  id: string;
  sender: string;
  to: string;
  amount0: string;
  amount1: string;
  timestamp: string;
  blockNumber: string;
  txHash: string;
  logIndex: string;
};

type SubgraphSyncEvent = {
  id: string;
  reserve0: string;
  reserve1: string;
  timestamp: string;
  blockNumber: string;
  txHash: string;
  logIndex: string;
};

type PoolDetailQueryResult = {
  pair?: SubgraphPair | null;
  swapEvents?: SubgraphSwapEvent[];
  mintEvents?: SubgraphMintEvent[];
  burnEvents?: SubgraphBurnEvent[];
  syncEvents?: SubgraphSyncEvent[];
};

export type PoolViewModel = {
  id: Address;
  token0: {
    id: Address;
    symbol: string;
    decimals: number;
  };
  token1: {
    id: Address;
    symbol: string;
    decimals: number;
  };
  reserve0: bigint;
  reserve1: bigint;
  recentSwaps: PoolRecentSwapViewModel[];
};

export type PoolRecentSwapViewModel = {
  amount0In: bigint;
  amount1In: bigint;
  amount0Out: bigint;
  amount1Out: bigint;
  timestamp: number;
};

export type PoolDetailViewModel = PoolViewModel & {
  totalSupply: bigint;
  txCount: bigint;
  swapCount: bigint;
  mintCount: bigint;
  burnCount: bigint;
  createdAtTimestamp: number;
  createdAtTxHash: string;
};

export type PoolSwapEventViewModel = {
  type: 'swap';
  id: string;
  sender: Address;
  recipient: Address;
  amount0In: bigint;
  amount1In: bigint;
  amount0Out: bigint;
  amount1Out: bigint;
  timestamp: number;
  blockNumber: bigint;
  txHash: string;
  logIndex: bigint;
};

export type PoolMintEventViewModel = {
  type: 'add';
  id: string;
  sender: Address;
  amount0: bigint;
  amount1: bigint;
  timestamp: number;
  blockNumber: bigint;
  txHash: string;
  logIndex: bigint;
};

export type PoolBurnEventViewModel = {
  type: 'remove';
  id: string;
  sender: Address;
  recipient: Address;
  amount0: bigint;
  amount1: bigint;
  timestamp: number;
  blockNumber: bigint;
  txHash: string;
  logIndex: bigint;
};

export type PoolSyncEventViewModel = {
  type: 'sync';
  id: string;
  reserve0: bigint;
  reserve1: bigint;
  timestamp: number;
  blockNumber: bigint;
  txHash: string;
  logIndex: bigint;
};

export type PoolActivityViewModel =
  | PoolSwapEventViewModel
  | PoolMintEventViewModel
  | PoolBurnEventViewModel
  | PoolSyncEventViewModel;

export type PoolDetailResult = {
  pool?: PoolDetailViewModel;
  activities: PoolActivityViewModel[];
};

const POOLS_LIST_QUERY = `
  query PoolsList {
    pairs(orderBy: createdAtTimestamp, orderDirection: desc) {
      id
      reserve0
      reserve1
      token0 {
        id
        symbol
        decimals
      }
      token1 {
        id
        symbol
        decimals
      }
      swaps(first: 500, orderBy: timestamp, orderDirection: desc) {
        amount0In
        amount1In
        amount0Out
        amount1Out
        timestamp
      }
    }
  }
`;

const POOL_BY_TOKENS_QUERY = `
  query PoolByTokens($tokenA: Bytes!, $tokenB: Bytes!) {
    pairs(
      where: {
        token0_in: [$tokenA, $tokenB]
        token1_in: [$tokenA, $tokenB]
      }
      first: 1
    ) {
      id
      reserve0
      reserve1
      token0 {
        id
        symbol
        decimals
      }
      token1 {
        id
        symbol
        decimals
      }
    }
  }
`;

const POOL_DETAIL_QUERY = `
  query PoolDetail($id: Bytes!, $first: Int!) {
    pair(id: $id) {
      id
      reserve0
      reserve1
      totalSupply
      txCount
      swapCount
      mintCount
      burnCount
      createdAtTimestamp
      createdAtTxHash
      token0 {
        id
        symbol
        decimals
      }
      token1 {
        id
        symbol
        decimals
      }
    }
    swapEvents(
      first: $first
      orderBy: timestamp
      orderDirection: desc
      where: { pair: $id }
    ) {
      id
      sender
      to
      amount0In
      amount1In
      amount0Out
      amount1Out
      timestamp
      blockNumber
      txHash
      logIndex
    }
    mintEvents(
      first: $first
      orderBy: timestamp
      orderDirection: desc
      where: { pair: $id }
    ) {
      id
      sender
      amount0
      amount1
      timestamp
      blockNumber
      txHash
      logIndex
    }
    burnEvents(
      first: $first
      orderBy: timestamp
      orderDirection: desc
      where: { pair: $id }
    ) {
      id
      sender
      to
      amount0
      amount1
      timestamp
      blockNumber
      txHash
      logIndex
    }
    syncEvents(
      first: $first
      orderBy: timestamp
      orderDirection: desc
      where: { pair: $id }
    ) {
      id
      reserve0
      reserve1
      timestamp
      blockNumber
      txHash
      logIndex
    }
  }
`;

const POOL_DETAIL_LEGACY_QUERY = `
  query PoolDetail($id: Bytes!, $first: Int!) {
    pair(id: $id) {
      id
      reserve0
      reserve1
      totalSupply
      txCount
      swapCount
      mintCount
      burnCount
      createdAtTimestamp
      createdAtTxHash
      token0 {
        id
        symbol
        decimals
      }
      token1 {
        id
        symbol
        decimals
      }
    }
    swapEvents(
      first: $first
      orderBy: timestamp
      orderDirection: desc
      where: { pair: $id }
    ) {
      id
      sender
      to
      amount0In
      amount1In
      amount0Out
      amount1Out
      timestamp
      blockNumber
      txHash
      logIndex
    }
    mintEvents(
      first: $first
      orderBy: timestamp
      orderDirection: desc
      where: { pair: $id }
    ) {
      id
      sender
      amount0
      amount1
      timestamp
      blockNumber
      txHash
      logIndex
    }
    burnEvents(
      first: $first
      orderBy: timestamp
      orderDirection: desc
      where: { pair: $id }
    ) {
      id
      sender
      to
      amount0
      amount1
      timestamp
      blockNumber
      txHash
      logIndex
    }
  }
`;

function mapSubgraphPair(pair: SubgraphPair): PoolViewModel {
  return {
    id: pair.id as Address,
    token0: {
      id: pair.token0.id as Address,
      symbol: pair.token0.symbol,
      decimals: Number(pair.token0.decimals ?? 18),
    },
    token1: {
      id: pair.token1.id as Address,
      symbol: pair.token1.symbol,
      decimals: Number(pair.token1.decimals ?? 18),
    },
    reserve0: BigInt(pair.reserve0),
    reserve1: BigInt(pair.reserve1),
    recentSwaps: (pair.swaps ?? []).map((swap) => ({
      amount0In: BigInt(swap.amount0In),
      amount1In: BigInt(swap.amount1In),
      amount0Out: BigInt(swap.amount0Out),
      amount1Out: BigInt(swap.amount1Out),
      timestamp: Number(swap.timestamp),
    })),
  };
}

function mapSubgraphPairDetail(pair: SubgraphPair): PoolDetailViewModel {
  return {
    ...mapSubgraphPair(pair),
    totalSupply: BigInt(pair.totalSupply ?? '0'),
    txCount: BigInt(pair.txCount ?? '0'),
    swapCount: BigInt(pair.swapCount ?? '0'),
    mintCount: BigInt(pair.mintCount ?? '0'),
    burnCount: BigInt(pair.burnCount ?? '0'),
    createdAtTimestamp: Number(pair.createdAtTimestamp ?? '0'),
    createdAtTxHash: pair.createdAtTxHash ?? '',
  };
}

function sortPoolActivities(activities: PoolActivityViewModel[]): PoolActivityViewModel[] {
  return activities.sort((left, right) => {
    if (left.timestamp !== right.timestamp) {
      return right.timestamp - left.timestamp;
    }

    if (left.blockNumber !== right.blockNumber) {
      return left.blockNumber > right.blockNumber ? -1 : 1;
    }

    if (left.logIndex !== right.logIndex) {
      return left.logIndex > right.logIndex ? -1 : 1;
    }

    return left.id.localeCompare(right.id);
  });
}

function mapSubgraphSwapEvent(event: SubgraphSwapEvent): PoolSwapEventViewModel {
  return {
    type: 'swap',
    id: event.id,
    sender: event.sender as Address,
    recipient: event.to as Address,
    amount0In: BigInt(event.amount0In),
    amount1In: BigInt(event.amount1In),
    amount0Out: BigInt(event.amount0Out),
    amount1Out: BigInt(event.amount1Out),
    timestamp: Number(event.timestamp),
    blockNumber: BigInt(event.blockNumber),
    txHash: event.txHash,
    logIndex: BigInt(event.logIndex),
  };
}

function mapSubgraphMintEvent(event: SubgraphMintEvent): PoolMintEventViewModel {
  return {
    type: 'add',
    id: event.id,
    sender: event.sender as Address,
    amount0: BigInt(event.amount0),
    amount1: BigInt(event.amount1),
    timestamp: Number(event.timestamp),
    blockNumber: BigInt(event.blockNumber),
    txHash: event.txHash,
    logIndex: BigInt(event.logIndex),
  };
}

function mapSubgraphBurnEvent(event: SubgraphBurnEvent): PoolBurnEventViewModel {
  return {
    type: 'remove',
    id: event.id,
    sender: event.sender as Address,
    recipient: event.to as Address,
    amount0: BigInt(event.amount0),
    amount1: BigInt(event.amount1),
    timestamp: Number(event.timestamp),
    blockNumber: BigInt(event.blockNumber),
    txHash: event.txHash,
    logIndex: BigInt(event.logIndex),
  };
}

function mapSubgraphSyncEvent(event: SubgraphSyncEvent): PoolSyncEventViewModel {
  return {
    type: 'sync',
    id: event.id,
    reserve0: BigInt(event.reserve0),
    reserve1: BigInt(event.reserve1),
    timestamp: Number(event.timestamp),
    blockNumber: BigInt(event.blockNumber),
    txHash: event.txHash,
    logIndex: BigInt(event.logIndex),
  };
}

export async function getPools(): Promise<PoolViewModel[]> {
  const data = await fetchSubgraph<PoolsQueryResult>(POOLS_LIST_QUERY);
  const pairs = data.pairs ?? [];

  return pairs.map(mapSubgraphPair);
}

export async function getPoolByTokens(
  tokenA: Address,
  tokenB: Address,
): Promise<PoolViewModel | undefined> {
  const data = await fetchSubgraph<PoolsQueryResult>(POOL_BY_TOKENS_QUERY, {
    tokenA: tokenA.toLowerCase(),
    tokenB: tokenB.toLowerCase(),
  });
  const pair = data.pairs?.[0];

  return pair ? mapSubgraphPair(pair) : undefined;
}

export async function getPoolDetail(
  pairAddress: Address,
  first = 120,
): Promise<PoolDetailResult> {
  const variables = {
    id: pairAddress.toLowerCase(),
    first,
  };
  let data: PoolDetailQueryResult;

  try {
    data = await fetchSubgraph<PoolDetailQueryResult>(POOL_DETAIL_QUERY, variables);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (!message.includes('syncEvents')) {
      throw error;
    }

    data = await fetchSubgraph<PoolDetailQueryResult>(POOL_DETAIL_LEGACY_QUERY, variables);
  }

  const activities = sortPoolActivities([
    ...(data.swapEvents ?? []).map(mapSubgraphSwapEvent),
    ...(data.mintEvents ?? []).map(mapSubgraphMintEvent),
    ...(data.burnEvents ?? []).map(mapSubgraphBurnEvent),
    ...(data.syncEvents ?? []).map(mapSubgraphSyncEvent),
  ]);

  return {
    pool: data.pair ? mapSubgraphPairDetail(data.pair) : undefined,
    activities,
  };
}
