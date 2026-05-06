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
  pair: SubgraphPair;
};

type SubgraphMintEvent = {
  id: string;
  sender: string;
  amount0: string;
  amount1: string;
  timestamp: string;
  blockNumber: string;
  txHash: string;
  pair: SubgraphPair;
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
  pair: SubgraphPair;
};

type ActivitiesQueryResult = {
  swapEvents?: SubgraphSwapEvent[];
  mintEvents?: SubgraphMintEvent[];
  burnEvents?: SubgraphBurnEvent[];
};

type ActivityPairViewModel = {
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
};

type ActivityBase = {
  id: string;
  txHash: string;
  sender: Address;
  timestamp: number;
  blockNumber: bigint;
  pair: ActivityPairViewModel;
};

export type SwapTradeViewModel = ActivityBase & {
  type: 'swap';
  recipient: Address;
  amount0In: bigint;
  amount1In: bigint;
  amount0Out: bigint;
  amount1Out: bigint;
};

export type MintTradeViewModel = ActivityBase & {
  type: 'add';
  amount0: bigint;
  amount1: bigint;
};

export type BurnTradeViewModel = ActivityBase & {
  type: 'remove';
  recipient: Address;
  amount0: bigint;
  amount1: bigint;
};

export type TradeViewModel =
  | SwapTradeViewModel
  | MintTradeViewModel
  | BurnTradeViewModel;

const ACTIVITIES_LIST_QUERY = `
  query ActivitiesList($first: Int!) {
    swapEvents(first: $first, orderBy: timestamp, orderDirection: desc) {
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
      pair {
        id
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
    mintEvents(first: $first, orderBy: timestamp, orderDirection: desc) {
      id
      sender
      amount0
      amount1
      timestamp
      blockNumber
      txHash
      pair {
        id
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
    burnEvents(first: $first, orderBy: timestamp, orderDirection: desc) {
      id
      sender
      to
      amount0
      amount1
      timestamp
      blockNumber
      txHash
      pair {
        id
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
  }
`;

function mapPair(pair: SubgraphPair): ActivityPairViewModel {
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
  };
}

function mapSubgraphSwap(swap: SubgraphSwapEvent): SwapTradeViewModel {
  return {
    type: 'swap',
    id: swap.id,
    txHash: swap.txHash,
    sender: swap.sender as Address,
    recipient: swap.to as Address,
    timestamp: Number(swap.timestamp),
    blockNumber: BigInt(swap.blockNumber),
    pair: mapPair(swap.pair),
    amount0In: BigInt(swap.amount0In),
    amount1In: BigInt(swap.amount1In),
    amount0Out: BigInt(swap.amount0Out),
    amount1Out: BigInt(swap.amount1Out),
  };
}

function mapSubgraphMint(mint: SubgraphMintEvent): MintTradeViewModel {
  return {
    type: 'add',
    id: mint.id,
    txHash: mint.txHash,
    sender: mint.sender as Address,
    timestamp: Number(mint.timestamp),
    blockNumber: BigInt(mint.blockNumber),
    pair: mapPair(mint.pair),
    amount0: BigInt(mint.amount0),
    amount1: BigInt(mint.amount1),
  };
}

function mapSubgraphBurn(burn: SubgraphBurnEvent): BurnTradeViewModel {
  return {
    type: 'remove',
    id: burn.id,
    txHash: burn.txHash,
    sender: burn.sender as Address,
    recipient: burn.to as Address,
    timestamp: Number(burn.timestamp),
    blockNumber: BigInt(burn.blockNumber),
    pair: mapPair(burn.pair),
    amount0: BigInt(burn.amount0),
    amount1: BigInt(burn.amount1),
  };
}

export async function getTrades(first = 100): Promise<TradeViewModel[]> {
  const data = await fetchSubgraph<ActivitiesQueryResult>(ACTIVITIES_LIST_QUERY, { first });
  const swaps = (data.swapEvents ?? []).map(mapSubgraphSwap);
  const mints = (data.mintEvents ?? []).map(mapSubgraphMint);
  const burns = (data.burnEvents ?? []).map(mapSubgraphBurn);

  return [...swaps, ...mints, ...burns].sort((left, right) => {
    if (left.timestamp !== right.timestamp) {
      return right.timestamp - left.timestamp;
    }

    if (left.blockNumber !== right.blockNumber) {
      return left.blockNumber > right.blockNumber ? -1 : 1;
    }

    return left.id.localeCompare(right.id);
  });
}
