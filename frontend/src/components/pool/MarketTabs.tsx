'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';

type MarketTabsProps = {
  active: 'pool' | 'trade';
};

export function MarketTabs({ active }: MarketTabsProps) {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');

  const tabs = [
    {
      key: 'pool' as const,
      href: '/pool',
      label: isZh ? '资金池' : 'Pools',
    },
    {
      key: 'trade' as const,
      href: '/pool/trade',
      label: isZh ? '交易' : 'Trades',
    },
  ];

  return (
    <div className="inline-flex items-center gap-2">
      {tabs.map((tab) => {
        const isActive = tab.key === active;

        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              isActive
                ? 'bg-white text-gray-900 shadow-sm dark:bg-white/[0.08] dark:text-white'
                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
