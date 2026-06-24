import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import { BurnEvent, MintEvent, Pair, SwapEvent, SyncEvent } from "../generated/schema";
import {
  Burn,
  Mint,
  Swap,
  Sync,
  Transfer,
} from "../generated/templates/FluxSwapPair/FluxSwapPair";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function buildEventId(txHash: Bytes, logIndex: BigInt): Bytes {
  return txHash.concat(Bytes.fromByteArray(Bytes.fromBigInt(logIndex)));
}

export function handleMint(event: Mint): void {
  let pair = Pair.load(event.address);

  if (pair == null) {
    return;
  }

  let mintEvent = new MintEvent(buildEventId(event.transaction.hash, event.logIndex));
  mintEvent.pair = pair.id;
  mintEvent.sender = event.params.sender;
  mintEvent.amount0 = event.params.amount0;
  mintEvent.amount1 = event.params.amount1;
  mintEvent.timestamp = event.block.timestamp;
  mintEvent.blockNumber = event.block.number;
  mintEvent.txHash = event.transaction.hash;
  mintEvent.logIndex = event.logIndex;
  mintEvent.save();

  pair.mintCount = pair.mintCount.plus(BigInt.fromI32(1));
  pair.txCount = pair.txCount.plus(BigInt.fromI32(1));
  pair.save();
}

export function handleBurn(event: Burn): void {
  let pair = Pair.load(event.address);

  if (pair == null) {
    return;
  }

  let burnEvent = new BurnEvent(buildEventId(event.transaction.hash, event.logIndex));
  burnEvent.pair = pair.id;
  burnEvent.sender = event.params.sender;
  burnEvent.to = event.params.to;
  burnEvent.amount0 = event.params.amount0;
  burnEvent.amount1 = event.params.amount1;
  burnEvent.timestamp = event.block.timestamp;
  burnEvent.blockNumber = event.block.number;
  burnEvent.txHash = event.transaction.hash;
  burnEvent.logIndex = event.logIndex;
  burnEvent.save();

  pair.burnCount = pair.burnCount.plus(BigInt.fromI32(1));
  pair.txCount = pair.txCount.plus(BigInt.fromI32(1));
  pair.save();
}

export function handleSwap(event: Swap): void {
  let pair = Pair.load(event.address);

  if (pair == null) {
    return;
  }

  let swapEvent = new SwapEvent(buildEventId(event.transaction.hash, event.logIndex));
  swapEvent.pair = pair.id;
  swapEvent.sender = event.params.sender;
  swapEvent.to = event.params.to;
  swapEvent.amount0In = event.params.amount0In;
  swapEvent.amount1In = event.params.amount1In;
  swapEvent.amount0Out = event.params.amount0Out;
  swapEvent.amount1Out = event.params.amount1Out;
  swapEvent.timestamp = event.block.timestamp;
  swapEvent.blockNumber = event.block.number;
  swapEvent.txHash = event.transaction.hash;
  swapEvent.logIndex = event.logIndex;
  swapEvent.save();

  pair.swapCount = pair.swapCount.plus(BigInt.fromI32(1));
  pair.txCount = pair.txCount.plus(BigInt.fromI32(1));
  pair.save();
}

export function handleSync(event: Sync): void {
  let pair = Pair.load(event.address);

  if (pair == null) {
    return;
  }

  let syncEvent = new SyncEvent(buildEventId(event.transaction.hash, event.logIndex));
  syncEvent.pair = pair.id;
  syncEvent.reserve0 = event.params.reserve0;
  syncEvent.reserve1 = event.params.reserve1;
  syncEvent.timestamp = event.block.timestamp;
  syncEvent.blockNumber = event.block.number;
  syncEvent.txHash = event.transaction.hash;
  syncEvent.logIndex = event.logIndex;
  syncEvent.save();

  pair.reserve0 = event.params.reserve0;
  pair.reserve1 = event.params.reserve1;
  pair.save();
}

export function handleTransfer(event: Transfer): void {
  let pair = Pair.load(event.address);

  if (pair == null) {
    return;
  }

  if (event.params.from.toHexString() == ZERO_ADDRESS) {
    pair.totalSupply = pair.totalSupply.plus(event.params.value);
  } else if (event.params.to.toHexString() == ZERO_ADDRESS) {
    pair.totalSupply = pair.totalSupply.minus(event.params.value);
  }

  pair.save();
}
