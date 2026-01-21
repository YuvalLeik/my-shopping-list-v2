'use client';

import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/useLanguage';
import { Languages } from 'lucide-react';

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'he' : 'en');
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggleLanguage}
      className="gap-2"
    >
      <Languages className="h-4 w-4" />
      <span>{language === 'en' ? 'עברית' : 'English'}</span>
    </Button>
  );
}
