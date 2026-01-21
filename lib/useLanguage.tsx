'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Language, getStoredLanguage, setStoredLanguage, translations } from './i18n';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: typeof translations.en;
  mounted: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Always start with 'en' to match server render
  const [language, setLanguageState] = useState<Language>('en');
  const [mounted, setMounted] = useState(false);

  // Load language from localStorage after mount (client-side only)
  useEffect(() => {
    const storedLang = getStoredLanguage();
    // Use setTimeout to avoid synchronous setState in effect
    setTimeout(() => {
      setLanguageState(storedLang);
      setMounted(true);
      // Set initial direction
      document.documentElement.dir = storedLang === 'he' ? 'rtl' : 'ltr';
      document.documentElement.lang = storedLang;
    }, 0);
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    setStoredLanguage(lang);
    // Update document direction for RTL support
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  };

  useEffect(() => {
    // Update direction when language changes (after mount)
    if (mounted) {
      document.documentElement.dir = language === 'he' ? 'rtl' : 'ltr';
      document.documentElement.lang = language;
    }
  }, [language, mounted]);

  const value: LanguageContextType = {
    language,
    setLanguage,
    t: translations[language],
    mounted,
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
