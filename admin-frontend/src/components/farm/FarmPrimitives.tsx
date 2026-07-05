'use client';

import { AlertCircle, CheckCircle2, LoaderCircle, X } from 'lucide-react';

import type { ResultModalState } from '@/components/farm/FarmTypes';

export function Card({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </section>
  );
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{children}</label>;
}

export function TextInput({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-500 disabled:bg-slate-100 disabled:text-slate-400"
    />
  );
}

export function SelectInput({
  value,
  onChange,
  disabled,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-500 disabled:bg-slate-100 disabled:text-slate-400"
    >
      {children}
    </select>
  );
}

export function PrimaryButton({
  children,
  disabled,
  loading,
  onClick,
  className = '',
}: {
  children: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onClick}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-500 ${className}`}
    >
      {loading ? <LoaderCircle size={16} className="animate-spin" /> : null}
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  disabled,
  loading,
  onClick,
  className = '',
}: {
  children: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onClick}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400 ${className}`}
    >
      {loading ? <LoaderCircle size={15} className="animate-spin" /> : null}
      {children}
    </button>
  );
}

export function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex h-7 items-center rounded-full px-2.5 text-xs font-semibold ${
        active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
      }`}
    >
      {active ? '启用' : '停用'}
    </span>
  );
}

export function ResultModal({
  state,
  onClose,
}: {
  state: ResultModalState;
  onClose: () => void;
}) {
  if (!state) {
    return null;
  }

  const Icon = state.kind === 'success' ? CheckCircle2 : AlertCircle;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <span
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
              state.kind === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
            }`}
          >
            <Icon size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-slate-950">{state.title}</h2>
            <p className="mt-2 break-words text-sm leading-6 text-slate-600">{state.message}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
