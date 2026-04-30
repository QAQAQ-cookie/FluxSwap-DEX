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
};

type PoolsQueryResult = {
  pairs?: SubgraphPair[];
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
