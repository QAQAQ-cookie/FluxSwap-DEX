import {
  encodeAbiParameters,
  keccak256,
  stringToHex,
  zeroAddress,
  type Address,
  type Hex,
  type TypedDataDomain,
} from 'viem'

export const LIMIT_ORDER_EIP712_NAME = 'Flux Signed Order Settlement'
export const LIMIT_ORDER_EIP712_VERSION = '1'
export const LIMIT_ORDER_DEFAULT_MAX_EXECUTOR_REWARD_BPS = BigInt(3_000)
export const LIMIT_ORDER_PRICE_SCALE = BigInt(10) ** BigInt(18)
const SIGNED_LIMIT_ORDER_TYPE =
  'SignedOrder(address maker,address inputToken,address outputToken,uint256 amountIn,uint256 minAmountOut,uint256 maxExecutorRewardBps,uint256 triggerPriceX18,uint256 expiry,uint256 nonce,address recipient)'
const SIGNED_LIMIT_ORDER_TYPE_HASH = keccak256(
  stringToHex(SIGNED_LIMIT_ORDER_TYPE),
)

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

export const invalidateNoncesTypes = {
  InvalidateNonces: [
    { name: 'maker', type: 'address' },
    { name: 'noncesHash', type: 'bytes32' },
    { name: 'deadline', type: 'uint256' },
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

export function hashInvalidateNonces(nonces: readonly bigint[]): Hex {
  if (nonces.length === 0) {
    return keccak256('0x')
  }

  const packed = nonces
    .map((nonce) => nonce.toString(16).padStart(64, '0'))
    .join('')

  return keccak256(`0x${packed}`)
}

export function buildInvalidateNoncesTypedData(
  chainId: number,
  settlementAddress: Address,
  maker: Address,
  nonces: readonly bigint[],
  deadline: bigint,
) {
  return {
    domain: buildSignedLimitOrderDomain(chainId, settlementAddress),
    types: invalidateNoncesTypes,
    primaryType: 'InvalidateNonces',
    message: {
      maker,
      noncesHash: hashInvalidateNonces(nonces),
      deadline,
    },
  } as const
}

export function hashSignedLimitOrder(
  _chainId: number,
  _settlementAddress: Address,
  order: SignedLimitOrder,
): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { name: 'typeHash', type: 'bytes32' },
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
      [
        SIGNED_LIMIT_ORDER_TYPE_HASH,
        order.maker,
        order.inputToken,
        order.outputToken,
        order.amountIn,
        order.minAmountOut,
        order.maxExecutorRewardBps,
        order.triggerPriceX18,
        order.expiry,
        order.nonce,
        order.recipient,
      ],
    ),
  )
}

export function toSignedLimitOrderTokenAddress(
  tokenAddress: Address | undefined,
  useNativeOutputSemantic = false,
): Address {
  return useNativeOutputSemantic ? zeroAddress : tokenAddress ?? zeroAddress
}
