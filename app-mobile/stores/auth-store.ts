import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

interface AuthState {
  biometricEnabled: boolean;
  lastBackgroundTime: number | null;
  setBiometricEnabled: (enabled: boolean) => Promise<void>;
  setLastBackgroundTime: (time: number) => void;
  loadAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  biometricEnabled: false,
  lastBackgroundTime: null,

  setBiometricEnabled: async (enabled) => {
    await SecureStore.setItemAsync('biometric-enabled', JSON.stringify(enabled));
    set({ biometricEnabled: enabled });
  },

  setLastBackgroundTime: (time) => set({ lastBackgroundTime: time }),

  loadAuth: async () => {
    const raw = await SecureStore.getItemAsync('biometric-enabled');
    if (raw) {
      set({ biometricEnabled: JSON.parse(raw) });
    }
  },
}));
