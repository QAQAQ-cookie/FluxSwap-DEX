'use client';

import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';

import { useIsClient } from '@/hooks/useIsClient';

export function LanguageToggle() {
  const { i18n } = useTranslation();
  const mounted = useIsClient();

  if (!mounted) {
    return <div className="w-10 h-10" />; // placeholder
  }

  const toggleLanguage = () => {
    const newLang = i18n.language.startsWith('zh') ? 'en' : 'zh';
    i18n.changeLanguage(newLang);
  };

  return (
    <button
      onClick={toggleLanguage}
      className="p-2 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
      aria-label="Toggle language"
      title="Switch Language"
    >
      <Globe size={20} />
      <span className="ml-1 text-xs font-bold uppercase">
        {i18n.language.startsWith('zh') ? '中' : 'EN'}
      </span>
    </button>
  );
}
