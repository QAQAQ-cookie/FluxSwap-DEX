'use client';

import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ThemeToggle } from './ThemeToggle';
import { LanguageToggle } from './LanguageToggle';
import { useTranslation } from 'react-i18next';

export function Navbar() {
  const { t, i18n } = useTranslation();
  const earnLabel = i18n.language.startsWith('zh') ? '收益 (Earn)' : 'Earn';

  return (
    <nav className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md sticky top-0 z-50">
      <div className="flex items-center gap-8">
        <Link href="/" className="text-2xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-emerald-500 dark:from-blue-400 dark:to-emerald-400 text-transparent bg-clip-text">
          FluxSwap
        </Link>
        
        {/* 桌面端导航链接 */}
        <div className="hidden md:flex items-center gap-6 font-medium">
          <Link href="/swap" className="text-gray-600 hover:text-black dark:text-gray-300 dark:hover:text-white transition-colors">
            {t('nav.swap')}
          </Link>
          <Link href="/pool" className="text-gray-600 hover:text-black dark:text-gray-300 dark:hover:text-white transition-colors">
            {t('nav.pools')}
          </Link>
          <Link href="/earn" className="text-gray-600 hover:text-black dark:text-gray-300 dark:hover:text-white transition-colors">
            {earnLabel}
          </Link>
        </div>
      </div>
      
      {/* 右侧：连接钱包按钮 & 国际化 & 主题切换 */}
      <div className="flex items-center gap-4">
        <LanguageToggle />
        <ThemeToggle />
        <ConnectButton />
      </div>
    </nav>
  );
}
