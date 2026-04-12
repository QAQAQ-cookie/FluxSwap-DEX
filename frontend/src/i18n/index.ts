'use client';

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import zh from './locales/zh.json';

// Initialize i18next
i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      zh: { translation: zh }
    },
    lng: 'zh', // Default language
    fallbackLng: 'zh',
    interpolation: {
      escapeValue: false // React already does escaping
    }
  });

// Handle language persistence to localStorage
i18n.on('languageChanged', (lng) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('app-lang', lng);
  }
});

// Hydrate from localStorage on client load
if (typeof window !== 'undefined') {
  const savedLang = localStorage.getItem('app-lang');
  if (savedLang) {
    i18n.changeLanguage(savedLang);
  }
}

export default i18n;
