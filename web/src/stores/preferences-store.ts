import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark' | 'system';
type Language = 'zh-CN' | 'en-US';

interface PreferencesState {
  theme: Theme;
  language: Language;
  sidebarCollapsed: boolean;
  setTheme: (theme: Theme) => void;
  setLanguage: (language: Language) => void;
  toggleSidebar: () => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: 'system',
      language: 'zh-CN',
      sidebarCollapsed: false,
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => {
        localStorage.setItem('language', language);
        set({ language });
      },
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    { name: 'preferences-storage' }
  )
);
