'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { BarChart3, Droplets, Repeat2, Sparkles, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { ThemeToggle } from './ThemeToggle';
import { LanguageToggle } from './LanguageToggle';

type NavItem = {
  href: string;
  label: string;
  icon: typeof Repeat2;
};

export function Navbar() {
  const pathname = usePathname();
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');

  const items: NavItem[] = [
    { href: '/swap', label: isZh ? '交易' : 'Trade', icon: Repeat2 },
    { href: '/pool', label: isZh ? '市场' : 'Markets', icon: Droplets },
    { href: '/earn', label: isZh ? '农场' : 'Farm', icon: Sparkles },
    { href: '/portfolio', label: isZh ? '资产' : 'Portfolio', icon: Wallet },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-black/5 bg-white/75 backdrop-blur-xl dark:border-white/10 dark:bg-[#08111f]/75">
      <div className="mx-auto flex w-full max-w-[1500px] flex-wrap items-center justify-between gap-4 px-4 py-4 lg:flex-nowrap lg:px-6 xl:px-8">
        <Link
          href="/"
          className="inline-flex shrink-0 items-center gap-3 rounded-full border border-black/5 bg-white px-3 py-2 shadow-sm transition-transform hover:scale-[1.01] dark:border-white/10 dark:bg-white/5"
        >
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-emerald-400 text-white shadow-lg shadow-sky-500/20">
            <BarChart3 size={18} />
          </span>
          <span className="block text-sm font-semibold tracking-[0.2em] text-sky-600 dark:text-sky-300">
            FLUXSWAP
          </span>
        </Link>

        <nav className="order-3 flex w-full flex-wrap gap-2 lg:order-2 lg:w-auto lg:flex-1 lg:justify-start">
          {items.map((item) => {
            const active =
              item.href === '/'
                ? pathname === item.href
                : pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-sky-600 text-white shadow-lg shadow-sky-500/20'
                    : 'border border-black/5 bg-white text-gray-700 hover:bg-black/[0.03] dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.08]'
                }`}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="order-2 flex shrink-0 items-center gap-3 lg:order-3">
          <LanguageToggle />
          <ThemeToggle />
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
