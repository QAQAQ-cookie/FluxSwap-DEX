import { formatUnits, parseUnits } from 'viem'

export const DECIMAL_INPUT_REGEX = /^\d*(\.\d*)?$/

function addThousandsSeparators(value: string): string {
  const negative = value.startsWith('-')
  const digits = negative ? value.slice(1) : value
  const formatted = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

  return negative ? `-${formatted}` : formatted
}

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

export function formatDisplayAmountDown(
  value?: string,
  fractionDigits = 6,
): string {
  if (!value) {
    return '0.00'
  }

  const normalized = value.replace(/,/g, '').trim()
  if (!/^[-]?\d*(\.\d*)?$/.test(normalized)) {
    return '0.00'
  }

  const negative = normalized.startsWith('-')
  const unsigned = negative ? normalized.slice(1) : normalized
  const [rawInteger = '0', rawFraction = ''] = unsigned.split('.')
  const integerPart = rawInteger === '' ? '0' : rawInteger
  const fractionPart = rawFraction.slice(0, fractionDigits).replace(/0+$/, '')
  const formattedInteger = addThousandsSeparators(integerPart)
  const signedInteger = negative ? `-${formattedInteger}` : formattedInteger

  if (fractionDigits === 0 || fractionPart === '') {
    return signedInteger
  }

  return `${signedInteger}.${fractionPart}`
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

export function formatBigIntAmountDown(
  value: bigint | undefined,
  decimals: number,
  fractionDigits = 6,
): string {
  if (value === undefined) {
    return '0.00'
  }

  return formatDisplayAmountDown(formatUnits(value, decimals), fractionDigits)
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
