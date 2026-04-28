import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import { PairCreated } from "../generated/FluxSwapFactory/FluxSwapFactory";
import { IERC20 } from "../generated/FluxSwapFactory/IERC20";
import { FluxSwapPair as FluxSwapPairTemplate } from "../generated/templates";
import { Pair, Token } from "../generated/schema";

function createTokenIfMissing(address: Address, timestamp: BigInt): void {
  let token = Token.load(address);

  if (token == null) {
    let contract = IERC20.bind(address);
    let symbolResult = contract.try_symbol();
    let nameResult = contract.try_name();
    let decimalsResult = contract.try_decimals();

    token = new Token(address);
    token.symbol = symbolResult.reverted ? address.toHexString() : symbolResult.value;
    token.name = nameResult.reverted ? address.toHexString() : nameResult.value;
    token.decimals = decimalsResult.reverted ? 18 : decimalsResult.value;
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
