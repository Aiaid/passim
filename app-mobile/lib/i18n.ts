import React, { createContext, useContext, useMemo } from 'react';
import type { Language } from '@passim/shared/types';
import { usePreferencesStore } from '@/stores/preferences-store';
import zhCN from '../../packages/shared/src/i18n/zh-CN.json';
import enUS from '../../packages/shared/src/i18n/en-US.json';

type Translations = Record<string, unknown>;

const translations: Record<Language, Translations> = {
  'zh-CN': zhCN as Translations,
  'en-US': enUS as Translations,
};

interface I18nContextValue {
  t: (key: string, params?: Record<string, string>) => string;
  language: Language;
}

const I18nContext = createContext<I18nContextValue>({
  t: (key: string) => key,
  language: 'zh-CN',
});

/**
 * Resolve a dot-notation key from a nested object.
 */
function resolve(obj: Translations, key: string): string | undefined {
  const parts = key.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : undefined;
}

/**
 * Create a translation function for the given language.
 */
function createT(language: Language): I18nContextValue['t'] {
  const primary = translations[language];
  const fallback = language === 'zh-CN' ? translations['en-US'] : translations['zh-CN'];

  return (key: string, params?: Record<string, string>): string => {
    let text = resolve(primary, key) ?? resolve(fallback, key) ?? key;

    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
      }
    }

    return text;
  };
}

/**
 * Provider component that supplies i18n context to the app.
 * Reads language from the preferences store.
 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const language = usePreferencesStore((s) => s.language);

  const value = useMemo<I18nContextValue>(
    () => ({ t: createT(language), language }),
    [language],
  );

  return React.createElement(I18nContext.Provider, { value }, children);
}

/**
 * Hook to access translation function and current language.
 */
export function useTranslation(): I18nContextValue {
  return useContext(I18nContext);
}
