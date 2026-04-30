import { Address, BigInt } from "@graphprotocol/graph-ts";
import { PairCreated } from "../generated/FluxSwapFactory/FluxSwapFactory";
import { FluxSwapPair as FluxSwapPairTemplate } from "../generated/templates";
import { Pair, Token } from "../generated/schema";

class TokenMetadata {
  symbol: string;
  name: string;
  decimals: i32;

  constructor(symbol: string, name: string, decimals: i32) {
    this.symbol = symbol;
    this.name = name;
    this.decimals = decimals;
  }
}

function getKnownTokenMetadata(address: Address): TokenMetadata | null {
  let normalized = address.toHexString().toLowerCase();

  if (normalized == "0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9") {
    return new TokenMetadata("WETH", "Wrapped Ether", 18);
  }

  if (normalized == "0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0") {
    return new TokenMetadata("FLUX", "Flux Token", 18);
  }

  if (normalized == "0x5fc8d32690cc91d4c39d9d3abcbd16989f875707") {
    return new TokenMetadata("USDT", "Tether USD", 6);
  }

  if (normalized == "0xdc64a140aa3e981100a9beca4e685f962f0cf6c9") {
    return new TokenMetadata("USDC", "USD Coin", 6);
  }

  if (normalized == "0x0165878a594ca255338adfa4d48449f69242eb8f") {
    return new TokenMetadata("WBTC", "Wrapped Bitcoin", 8);
  }

  return null;
}

function createTokenIfMissing(address: Address, timestamp: BigInt): void {
  let token = Token.load(address);

  if (token == null) {
    let metadata = getKnownTokenMetadata(address);
    token = new Token(address);
    token.symbol = metadata != null ? metadata.symbol : address.toHexString();
    token.name = metadata != null ? metadata.name : address.toHexString();
    token.decimals = metadata != null ? metadata.decimals : 18;
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
