'use client'

import { LoaderCircle } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

export function ActionButton({
  label,
  disabled,
  loading = false,
  onClick,
  variant = 'primary',
  className = '',
}: {
  label: string
  disabled: boolean
  loading?: boolean
  onClick: () => void
  variant?: Variant
  className?: string
}) {
  const variantClass =
    variant === 'primary'
      ? disabled
        ? 'bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
        : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/25'
      : variant === 'secondary'
        ? disabled
          ? 'bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
          : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-500/20'
        : variant === 'danger'
          ? disabled
            ? 'bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
            : 'bg-rose-600 text-white hover:bg-rose-700 shadow-lg shadow-rose-500/25'
          : disabled
            ? 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
            : 'border border-gray-200 bg-white text-gray-900 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:hover:bg-gray-800'

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center justify-center gap-2 rounded-2xl py-4 font-bold transition-colors ${variantClass} ${className}`.trim()}
    >
      {loading && <LoaderCircle size={18} className="animate-spin" />}
      <span>{label}</span>
    </button>
  )
}
