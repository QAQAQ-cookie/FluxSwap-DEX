'use client';

import { AlertCircle, CheckCircle2, X } from 'lucide-react';

import type { EarnResultModalState } from '@/components/earn/EarnTypes';

type EarnResultModalProps = {
  state: EarnResultModalState;
  isZh: boolean;
  onClose: () => void;
};

export function EarnResultModal({ state, isZh, onClose }: EarnResultModalProps) {
  if (!state) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[460px] rounded-[1.7rem] bg-white px-5 py-5 shadow-2xl dark:bg-gray-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            aria-label={isZh ? '关闭' : 'Close'}
          >
            <X size={22} />
          </button>
        </div>

        <div className="flex flex-col items-center px-3 pb-1 pt-1 text-center">
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-[1rem] ${
              state.kind === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
            }`}
          >
            {state.kind === 'success' ? <CheckCircle2 size={26} /> : <AlertCircle size={26} />}
          </div>

          <h3 className="mt-5 text-[1.65rem] font-semibold tracking-tight text-gray-950 dark:text-white">
            {state.title}
          </h3>

          <p className="mt-2.5 text-base leading-7 text-gray-500 dark:text-gray-300">{state.message}</p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-[1rem] bg-[#232323] text-base font-medium text-white transition-colors hover:bg-black dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
        >
          {isZh ? '知道了' : 'Got it'}
        </button>
      </div>
    </div>
  );
}
