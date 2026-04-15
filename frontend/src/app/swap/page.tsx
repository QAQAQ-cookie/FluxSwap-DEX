'use client';

import dynamic from 'next/dynamic';

const SwapWidget = dynamic(
  () => import('@/components/SwapWidget').then((mod) => mod.SwapWidget),
  {
    ssr: false,
    loading: () => (
      <div className="w-full rounded-[2rem] border border-gray-200 bg-white p-4 shadow-2xl dark:border-gray-700 dark:bg-gray-800">
        <div className="animate-pulse space-y-4">
          <div className="h-7 w-32 rounded-xl bg-gray-200 dark:bg-gray-700" />
          <div className="h-36 rounded-3xl bg-gray-100 dark:bg-gray-900" />
          <div className="mx-auto h-5 w-12 rounded-xl bg-gray-200 dark:bg-gray-700" />
          <div className="h-36 rounded-3xl bg-gray-100 dark:bg-gray-900" />
          <div className="h-28 rounded-2xl bg-gray-50 dark:bg-gray-900/60" />
          <div className="h-12 rounded-xl bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>
    ),
  },
);

export default function SwapPage() {
  return (
    <div className="min-h-[calc(100vh-80px)] px-4 py-20 transition-colors duration-300">
      <div className="mx-auto flex w-full max-w-6xl flex-col">
        <SwapWidget enableModeSwitch />
      </div>
    </div>
  );
}
