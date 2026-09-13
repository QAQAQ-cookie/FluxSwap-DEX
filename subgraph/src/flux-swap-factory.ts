import { Address, BigInt, DataSourceTemplate, ethereum } from "@graphprotocol/graph-ts";
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

  if (normalized == "0xf881723bef047da1cd494795a797835241d3be29") {
    return new TokenMetadata("WETH", "Wrapped Ether", 18);
  }

  if (normalized == "0x5171c0fec2f9c4413a9aae39f3d3739aa30b1110") {
    return new TokenMetadata("FLUX", "Flux Token", 18);
  }

  if (normalized == "0xf4fc2de27781b6401609732e0aa7f7c354bde388") {
    return new TokenMetadata("USDT", "Tether USD", 6);
  }

  if (normalized == "0xa4049489d8689a55154c35f9809b1382b0972a79") {
    return new TokenMetadata("USDC", "USD Coin", 6);
  }

  if (normalized == "0xc97de7b464a4db1910c16ce7835b918b4440c42c") {
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

export function handlePairCreated(event: ethereum.Event): void {
  let token0 = event.parameters[0].value.toAddress();
  let token1 = event.parameters[1].value.toAddress();
  let pairAddress = event.parameters[2].value.toAddress();

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

  DataSourceTemplate.create("FluxSwapPair", [pairAddress.toHexString()]);
}
