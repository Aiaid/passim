import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Theme, Language } from '@passim/shared/types';

interface PreferencesState {
  theme: Theme;
  language: Language;
  pushEnabled: boolean;
  setTheme: (theme: Theme) => Promise<void>;
  setLanguage: (language: Language) => Promise<void>;
  setPushEnabled: (enabled: boolean) => Promise<void>;
  loadPreferences: () => Promise<void>;
}

export const usePreferencesStore = create<PreferencesState>((set) => ({
  theme: 'system',
  language: 'zh-CN',
  pushEnabled: true,

  setTheme: async (theme) => {
    await AsyncStorage.setItem('theme', theme);
    set({ theme });
  },

  setLanguage: async (language) => {
    await AsyncStorage.setItem('language', language);
    set({ language });
  },

  setPushEnabled: async (enabled) => {
    await AsyncStorage.setItem('push-enabled', JSON.stringify(enabled));
    set({ pushEnabled: enabled });
  },

  loadPreferences: async () => {
    const [theme, language, push] = await Promise.all([
      AsyncStorage.getItem('theme'),
      AsyncStorage.getItem('language'),
      AsyncStorage.getItem('push-enabled'),
    ]);
    set({
      theme: (theme as Theme) || 'system',
      language: (language as Language) || 'zh-CN',
      pushEnabled: push ? JSON.parse(push) : true,
    });
  },
}));
