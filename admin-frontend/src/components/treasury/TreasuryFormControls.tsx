'use client';

import type { ReactNode } from 'react';

export function FieldLabel({ children }: { children: ReactNode }) {
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
  children: ReactNode;
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
