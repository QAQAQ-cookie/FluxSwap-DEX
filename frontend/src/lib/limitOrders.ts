import {
  hashTypedData,
  zeroAddress,
  type Address,
  type Hex,
  type TypedDataDomain,
} from 'viem'

export const LIMIT_ORDER_EIP712_NAME = 'Flux Signed Order Settlement'
export const LIMIT_ORDER_EIP712_VERSION = '1'
export const LIMIT_ORDER_DEFAULT_MAX_EXECUTOR_REWARD_BPS = BigInt(3_000)
export const LIMIT_ORDER_PRICE_SCALE = BigInt(10) ** BigInt(18)

export type SignedLimitOrder = {
  maker: Address
  inputToken: Address
  outputToken: Address
  amountIn: bigint
  minAmountOut: bigint
  maxExecutorRewardBps: bigint
  triggerPriceX18: bigint
  expiry: bigint
  nonce: bigint
  recipient: Address
}

export const signedLimitOrderTypes = {
  SignedOrder: [
    { name: 'maker', type: 'address' },
    { name: 'inputToken', type: 'address' },
    { name: 'outputToken', type: 'address' },
    { name: 'amountIn', type: 'uint256' },
    { name: 'minAmountOut', type: 'uint256' },
    { name: 'maxExecutorRewardBps', type: 'uint256' },
    { name: 'triggerPriceX18', type: 'uint256' },
    { name: 'expiry', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'recipient', type: 'address' },
  ],
} as const

export function buildSignedLimitOrderDomain(
  chainId: number,
  settlementAddress: Address,
): TypedDataDomain {
  return {
    name: LIMIT_ORDER_EIP712_NAME,
    version: LIMIT_ORDER_EIP712_VERSION,
    chainId,
    verifyingContract: settlementAddress,
  }
}

export function calculateTriggerPriceX18(
  amountIn: bigint,
  minAmountOut: bigint,
  inputDecimals: number,
  outputDecimals: number,
): bigint {
  if (amountIn <= BigInt(0) || minAmountOut <= BigInt(0)) {
    return BigInt(0)
  }

  return (
    minAmountOut *
    (BigInt(10) ** BigInt(inputDecimals)) *
    LIMIT_ORDER_PRICE_SCALE
  ) / (
    amountIn *
    (BigInt(10) ** BigInt(outputDecimals))
  )
}

export function buildSignedLimitOrderTypedData(
  chainId: number,
  settlementAddress: Address,
  order: SignedLimitOrder,
) {
  return {
    domain: buildSignedLimitOrderDomain(chainId, settlementAddress),
    types: signedLimitOrderTypes,
    primaryType: 'SignedOrder',
    message: order,
  } as const
}

export function hashSignedLimitOrder(
  chainId: number,
  settlementAddress: Address,
  order: SignedLimitOrder,
): Hex {
  return hashTypedData(buildSignedLimitOrderTypedData(chainId, settlementAddress, order))
}

export function toSignedLimitOrderTokenAddress(
  tokenAddress: Address | undefined,
  useNativeOutputSemantic = false,
): Address {
  return useNativeOutputSemantic ? zeroAddress : tokenAddress ?? zeroAddress
}
