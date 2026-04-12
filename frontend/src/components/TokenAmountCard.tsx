'use client'

import { DECIMAL_INPUT_REGEX } from '@/lib/amounts'

export function TokenAmountCard({
  label,
  value,
  onChange,
  symbol,
  balanceLabel = 'Balance',
  balance,
  onMax,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  symbol: string
  balanceLabel?: string
  balance: string
  onMax: () => void
}) {
  return (
    <div className="rounded-3xl border border-transparent bg-gray-100 p-4 transition-colors hover:border-gray-300 dark:bg-gray-900 dark:hover:border-gray-700">
      <div className="mb-2 text-sm text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <input
          type="text"
          inputMode="decimal"
          placeholder="0.0"
          value={value}
          onChange={(event) => {
            if (DECIMAL_INPUT_REGEX.test(event.target.value)) {
              onChange(event.target.value)
            }
          }}
          className="w-full bg-transparent text-3xl font-bold text-gray-900 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-gray-600"
        />
        <div className="rounded-full border border-gray-200 bg-white px-4 py-2 font-bold text-gray-900 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white">
          {symbol}
        </div>
      </div>
      <div className="flex justify-end text-sm text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-2">
          {balanceLabel}: {balance}
          <button
            onClick={onMax}
            className="font-semibold text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            MAX
          </button>
        </span>
      </div>
    </div>
  )
}
