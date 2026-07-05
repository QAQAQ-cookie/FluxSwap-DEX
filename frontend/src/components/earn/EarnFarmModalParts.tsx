import type { ReactNode } from 'react';

import { LoaderCircle } from 'lucide-react';

type EarnFarmMetricCardProps = {
  label: string;
  value: string;
};

export function EarnFarmMetricCard({ label, value }: EarnFarmMetricCardProps) {
  return (
    <div className="rounded-[1.2rem] bg-gray-50 p-4 dark:bg-white/[0.04]">
      <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-2 text-lg font-black tabular-nums text-gray-950 dark:text-white">{value}</div>
    </div>
  );
}

type EarnFarmAmountCardProps = {
  title: string;
  symbol: string;
  amount: string;
  inputDisabled: boolean;
  onAmountChange: (value: string) => void;
  onMax: () => void;
  buttonLabel: string;
  buttonDisabled: boolean;
  buttonLoading: boolean;
  buttonVariant?: 'primary' | 'accent';
  onSubmit: () => void;
};

export function EarnFarmAmountCard({
  title,
  symbol,
  amount,
  inputDisabled,
  onAmountChange,
  onMax,
  buttonLabel,
  buttonDisabled,
  buttonLoading,
  buttonVariant = 'primary',
  onSubmit,
}: EarnFarmAmountCardProps) {
  const buttonClassName = buttonDisabled
    ? 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-white/[0.06] dark:text-gray-500'
    : buttonVariant === 'accent'
      ? 'bg-sky-600 text-white hover:bg-sky-700'
      : 'bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200';

  return (
    <div className="rounded-[1.35rem] border border-black/5 p-4 dark:border-white/10">
      <div className="text-base font-black text-gray-950 dark:text-white">{title}</div>
      <div className="mt-3 rounded-[1rem] bg-gray-50 p-3 dark:bg-white/[0.04]">
        <div className="flex items-center justify-between text-xs font-semibold text-gray-500 dark:text-gray-400">
          <span>{symbol}</span>
          <button
            type="button"
            onClick={onMax}
            disabled={inputDisabled}
            className="text-emerald-600 transition-colors hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-emerald-300"
          >
            MAX
          </button>
        </div>
        <input
          value={amount}
          onChange={(event) => onAmountChange(event.target.value)}
          inputMode="decimal"
          placeholder="0"
          disabled={inputDisabled}
          className="mt-2 w-full bg-transparent text-3xl font-black tabular-nums text-gray-950 outline-none placeholder:text-gray-300 disabled:cursor-not-allowed dark:text-white dark:placeholder:text-gray-700"
        />
      </div>
      <button
        type="button"
        onClick={onSubmit}
        disabled={buttonDisabled}
        className={`mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[1rem] text-sm font-bold transition-colors ${buttonClassName}`}
      >
        {buttonLoading ? <LoaderCircle size={17} className="animate-spin" /> : null}
        <span>{buttonLabel}</span>
      </button>
    </div>
  );
}

type EarnFarmDetailRowProps = {
  label: string;
  value: string;
};

export function EarnFarmDetailRow({ label, value }: EarnFarmDetailRowProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="font-semibold tabular-nums text-gray-950 dark:text-white">{value}</span>
    </div>
  );
}

type EarnFarmActionButtonProps = {
  label: string;
  disabled: boolean;
  loading: boolean;
  icon: ReactNode;
  variant?: 'success' | 'danger';
  onClick: () => void;
};

export function EarnFarmActionButton({
  label,
  disabled,
  loading,
  icon,
  variant = 'success',
  onClick,
}: EarnFarmActionButtonProps) {
  const buttonClassName = disabled
    ? 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-white/[0.06] dark:text-gray-500'
    : variant === 'danger'
      ? 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-400/25 dark:bg-rose-400/10 dark:text-rose-300 dark:hover:bg-rose-400/15'
      : 'bg-emerald-600 text-white hover:bg-emerald-700';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-[1rem] text-sm font-bold transition-colors ${buttonClassName}`}
    >
      {loading ? <LoaderCircle size={17} className="animate-spin" /> : icon}
      <span>{label}</span>
    </button>
  );
}
