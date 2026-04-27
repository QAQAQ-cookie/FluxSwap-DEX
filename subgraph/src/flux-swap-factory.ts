import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import { PairCreated } from "../generated/FluxSwapFactory/FluxSwapFactory";
import { FluxSwapPair as FluxSwapPairTemplate } from "../generated/templates";
import { Pair, Token } from "../generated/schema";

function createTokenIfMissing(address: Bytes, timestamp: BigInt): void {
  let token = Token.load(address);

  if (token == null) {
    token = new Token(address);
    token.symbol = "";
    token.name = "";
    token.decimals = 18;
    token.createdAtTimestamp = timestamp;
    token.save();
  }
}

export function handlePairCreated(event: PairCreated): void {
  let token0 = event.params.token0;
  let token1 = event.params.token1;
  let pairAddress = event.params.pair;

  createTokenIfMissing(token0, event.block.timestamp);
  createTokenIfMissing(token1, event.block.timestamp);

  let pair = Pair.load(pairAddress);
  if (pair == null) {
    pair = new Pair(pairAddress);
    pair.token0 = token0;
    pair.token1 = token1;
    pair.reserve0 = BigInt.zero();
    pair.reserve1 = BigInt.zero();
    pair.totalSupply = BigInt.zero();
    pair.txCount = BigInt.zero();
    pair.swapCount = BigInt.zero();
    pair.mintCount = BigInt.zero();
    pair.burnCount = BigInt.zero();
    pair.createdAtBlock = event.block.number;
    pair.createdAtTimestamp = event.block.timestamp;
    pair.createdAtTxHash = event.transaction.hash;
    pair.save();
  }

  FluxSwapPairTemplate.create(pairAddress);
}
