'use client';

import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useIsClient } from '@/hooks/useIsClient';

export function LanguageToggle() {
  const { i18n } = useTranslation();
  const mounted = useIsClient();

  if (!mounted) {
    return <div className="h-10 w-10" />;
  }

  const isZh = i18n.language.startsWith('zh');

  return (
    <button
      onClick={() => i18n.changeLanguage(isZh ? 'en' : 'zh')}
      className="inline-flex h-10 items-center justify-center gap-1 rounded-full border border-black/5 bg-white px-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-black/[0.03] dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.08]"
      aria-label="Toggle language"
      title="Switch language"
    >
      <Globe size={16} />
      <span>{isZh ? '中' : 'EN'}</span>
    </button>
  );
}
