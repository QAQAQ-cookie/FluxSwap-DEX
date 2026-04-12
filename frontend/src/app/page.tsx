'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';

export default function Home() {
  const { t } = useTranslation();
  
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-80px)] text-center px-4 bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
      <h1 className="text-6xl md:text-8xl font-extrabold tracking-tight mb-6 text-gray-900 dark:text-white">
        {t('home.title1')} <br />
        <span className="bg-gradient-to-r from-blue-600 to-emerald-500 dark:from-blue-400 dark:to-emerald-400 text-transparent bg-clip-text">
          {t('home.title2')}
        </span>
      </h1>
      
      <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mb-12 mt-4">
        {t('home.desc')}
      </p>
      
      <div className="flex gap-6">
        <Link 
          href="/swap" 
          className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold text-lg transition-all hover:scale-105 shadow-lg shadow-blue-500/20"
        >
          {t('home.launch')}
        </Link>
        <a 
          href="#" 
          className="px-8 py-4 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-2xl font-bold text-lg transition-all"
        >
          {t('home.docs')}
        </a>
      </div>
      
      {/* 底部的数据展示（占位） */}
      <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-4xl border-t border-gray-200 dark:border-gray-800 pt-12">
        <div>
          <div className="text-4xl font-bold text-gray-900 dark:text-white mb-2">$2.4B+</div>
          <div className="text-gray-500 dark:text-gray-400">{t('home.vol')}</div>
        </div>
        <div>
          <div className="text-4xl font-bold text-gray-900 dark:text-white mb-2">100k+</div>
          <div className="text-gray-500 dark:text-gray-400">{t('home.users')}</div>
        </div>
        <div>
          <div className="text-4xl font-bold text-gray-900 dark:text-white mb-2">$500M+</div>
          <div className="text-gray-500 dark:text-gray-400">{t('home.tvl')}</div>
        </div>
      </div>
    </div>
  );
}