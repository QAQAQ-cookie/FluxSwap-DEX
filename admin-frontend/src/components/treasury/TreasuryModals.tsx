'use client';

import { AlertCircle, CheckCircle2, ShieldCheck, X } from 'lucide-react';

export type ResultModalState =
  | {
      kind: 'success' | 'error';
      title: string;
      message: string;
    }
  | null;

export type ConfirmModalState =
  | {
      title: string;
      message: string;
      tone?: 'danger' | 'default';
      confirmLabel: string;
      action: () => void;
    }
  | null;

type ResultModalProps = {
  state: ResultModalState;
  onClose: () => void;
};

export function ResultModal({ state, onClose }: ResultModalProps) {
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

type ConfirmModalProps = {
  state: ConfirmModalState;
  onClose: () => void;
};

export function ConfirmModal({ state, onClose }: ConfirmModalProps) {
  if (!state) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <span
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
              state.tone === 'danger' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {state.tone === 'danger' ? <AlertCircle size={22} /> : <ShieldCheck size={22} />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-slate-950">{state.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{state.message}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => {
              state.action();
              onClose();
            }}
            className={`inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold text-white transition ${
              state.tone === 'danger' ? 'bg-rose-600 hover:bg-rose-500' : 'bg-slate-950 hover:bg-slate-800'
            }`}
          >
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
