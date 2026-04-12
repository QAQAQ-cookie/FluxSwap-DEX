import { formatUnits, parseUnits } from 'viem'

export const DECIMAL_INPUT_REGEX = /^\d*(\.\d*)?$/

export function formatDisplayAmount(
  value?: string,
  fractionDigits = 6,
): string {
  if (!value) {
    return '0.00'
  }

  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return '0.00'
  }

  return numeric.toLocaleString(undefined, {
    maximumFractionDigits: fractionDigits,
  })
}

export function formatBigIntAmount(
  value: bigint | undefined,
  decimals: number,
  fractionDigits = 6,
): string {
  if (value === undefined) {
    return '0.00'
  }

  return formatDisplayAmount(formatUnits(value, decimals), fractionDigits)
}

export function parseAmount(
  value: string,
  decimals = 18,
): bigint | undefined {
  if (!value || !DECIMAL_INPUT_REGEX.test(value)) {
    return undefined
  }

  try {
    return parseUnits(value, decimals)
  } catch {
    return undefined
  }
}

export function parsePercentToBps(value: string): bigint {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) {
    return BigInt(50)
  }

  return BigInt(Math.min(Math.max(Math.round(numeric * 100), 0), 5000))
}
