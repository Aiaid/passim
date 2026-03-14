import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  token: string | null;
  expiresAt: string | null;
  isAuthenticated: boolean;
  login: (token: string, expiresAt: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      expiresAt: null,
      isAuthenticated: false,
      login: (token, expiresAt) => {
        localStorage.setItem('auth-token', token);
        set({ token, expiresAt, isAuthenticated: true });
      },
      logout: () => {
        localStorage.removeItem('auth-token');
        set({ token: null, expiresAt: null, isAuthenticated: false });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        token: state.token,
        expiresAt: state.expiresAt,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
