import { formatUnits, parseUnits } from 'viem';

const DECIMAL_INPUT_REGEX = /^\d*(\.\d*)?$/;

function addThousandsSeparators(value: string): string {
  const negative = value.startsWith('-');
  const digits = negative ? value.slice(1) : value;
  const formatted = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return negative ? `-${formatted}` : formatted;
}

export function formatDisplayAmountDown(value?: string, fractionDigits = 6): string {
  if (!value) {
    return '0';
  }

  const normalized = value.replace(/,/g, '').trim();
  if (!/^[-]?\d*(\.\d*)?$/.test(normalized)) {
    return '0';
  }

  const negative = normalized.startsWith('-');
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [rawInteger = '0', rawFraction = ''] = unsigned.split('.');
  const integerPart = rawInteger === '' ? '0' : rawInteger;
  const fractionPart = rawFraction.slice(0, fractionDigits).replace(/0+$/, '');
  const formattedInteger = addThousandsSeparators(integerPart);
  const signedInteger = negative ? `-${formattedInteger}` : formattedInteger;

  if (fractionDigits === 0 || fractionPart === '') {
    return signedInteger;
  }

  return `${signedInteger}.${fractionPart}`;
}

export function formatBigIntAmountDown(
  value: bigint | undefined,
  decimals: number,
  fractionDigits = 6,
): string {
  if (value === undefined) {
    return '0';
  }

  return formatDisplayAmountDown(formatUnits(value, decimals), fractionDigits);
}

export function parseAmount(value: string, decimals = 18): bigint | undefined {
  const normalized = value.replace(/,/g, '').trim();

  if (!normalized || !DECIMAL_INPUT_REGEX.test(normalized)) {
    return undefined;
  }

  try {
    return parseUnits(normalized, decimals);
  } catch {
    return undefined;
  }
}

export function formatWeight(allocPoint: bigint, totalAllocPoint: bigint): string {
  if (allocPoint <= BigInt(0) || totalAllocPoint <= BigInt(0)) {
    return '0%';
  }

  const value = Number((allocPoint * BigInt(1_000_000)) / totalAllocPoint) / 10_000;

  return `${value.toLocaleString('zh-CN', {
    minimumFractionDigits: value >= 10 ? 1 : 2,
    maximumFractionDigits: 2,
  })}%`;
}
