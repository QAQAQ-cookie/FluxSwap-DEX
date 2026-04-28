'use client';

import { useTranslation } from 'react-i18next';

import { MarketTabs } from '@/components/pool/MarketTabs';

export default function PoolTradePage() {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');

  return (
    <div className="px-4 py-8 lg:px-6 lg:py-10">
      <section className="lg:px-1">
        <MarketTabs active="trade" />

        <div className="mt-6 rounded-[2rem] border border-dashed border-black/10 bg-white/35 px-6 py-16 text-center backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.03]">
          <div className="text-base font-semibold text-gray-900 dark:text-white">
            {isZh ? '交易页面暂未开放' : 'Trade page coming soon'}
          </div>
          <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {isZh
              ? '这里先留空，后续再补市场交易内容。'
              : 'This page is intentionally empty for now.'}
          </div>
        </div>
      </section>
    </div>
  );
}
