'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';

export default function Home() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-[calc(100vh-80px)] flex-col items-center justify-center bg-gray-50 px-4 text-center transition-colors duration-300 dark:bg-gray-900">
      <h1 className="mb-6 text-6xl font-extrabold tracking-tight text-gray-900 dark:text-white md:text-8xl">
        {t('home.title1')} <br />
        <span className="bg-gradient-to-r from-blue-600 to-emerald-500 bg-clip-text text-transparent dark:from-blue-400 dark:to-emerald-400">
          {t('home.title2')}
        </span>
      </h1>

      <p className="mb-12 mt-4 max-w-2xl text-xl text-gray-600 dark:text-gray-400">
        {t('home.desc')}
      </p>

      <div className="flex flex-wrap justify-center gap-6">
        <Link
          href="/swap"
          className="rounded-2xl bg-blue-600 px-8 py-4 text-lg font-bold text-white shadow-lg shadow-blue-500/20 transition-all hover:scale-105 hover:bg-blue-700"
        >
          {t('home.launch')}
        </Link>
        <Link
          href="/pool"
          className="rounded-2xl bg-emerald-600 px-8 py-4 text-lg font-bold text-white shadow-lg shadow-emerald-500/20 transition-all hover:scale-105 hover:bg-emerald-700"
        >
          {t('nav.pools', 'Pools')}
        </Link>
        <Link
          href="/earn"
          className="rounded-2xl bg-amber-500 px-8 py-4 text-lg font-bold text-white shadow-lg shadow-amber-500/20 transition-all hover:scale-105 hover:bg-amber-600"
        >
          {t('nav.earn', 'Earn')}
        </Link>
        <a
          href="#"
          className="rounded-2xl border border-gray-200 bg-white px-8 py-4 text-lg font-bold text-gray-900 transition-all hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700"
        >
          {t('home.docs')}
        </a>
      </div>

      {/* 首页统计区当前仍是展示占位，后续可替换为真实链上数据。 */}
      <div className="mt-24 grid w-full max-w-4xl grid-cols-1 gap-8 border-t border-gray-200 pt-12 dark:border-gray-800 md:grid-cols-3">
        <div>
          <div className="mb-2 text-4xl font-bold text-gray-900 dark:text-white">$2.4B+</div>
          <div className="text-gray-500 dark:text-gray-400">{t('home.vol')}</div>
        </div>
        <div>
          <div className="mb-2 text-4xl font-bold text-gray-900 dark:text-white">100k+</div>
          <div className="text-gray-500 dark:text-gray-400">{t('home.users')}</div>
        </div>
        <div>
          <div className="mb-2 text-4xl font-bold text-gray-900 dark:text-white">$500M+</div>
          <div className="text-gray-500 dark:text-gray-400">{t('home.tvl')}</div>
        </div>
      </div>
    </div>
  );
}
