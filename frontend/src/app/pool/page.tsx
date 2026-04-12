'use client';

import { useTranslation } from 'react-i18next';

export default function PoolPage() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 bg-gray-50 dark:bg-gray-900 min-h-[calc(100vh-80px)] transition-colors duration-300">
      <div className="w-full max-w-3xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-3xl p-6 shadow-2xl">
        <div className="flex items-center justify-between px-2 mb-4">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">{t('pool.title')}</h2>
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-bold transition-colors">
            {t('pool.newPosition')}
          </button>
        </div>
        
        <p className="text-gray-500 dark:text-gray-400 mb-6 px-2">{t('pool.subtitle')}</p>
        
        {/* 头寸列表区 */}
        <div className="bg-gray-100 dark:bg-gray-900 rounded-2xl p-8 border border-transparent flex flex-col items-center justify-center min-h-[200px]">
          <div className="text-gray-500 dark:text-gray-400 mb-2">{t('pool.noPositions')}</div>
        </div>
      </div>
    </div>
  );
}
