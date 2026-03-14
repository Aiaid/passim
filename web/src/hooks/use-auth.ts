import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api-client';
import { useMutation } from '@tanstack/react-query';

export function useAuth() {
  const { token, isAuthenticated, login, logout } = useAuthStore();

  const loginMutation = useMutation({
    mutationFn: (apiKey: string) => api.login(apiKey),
    onSuccess: (data) => {
      login(data.token, data.expires_at);
    },
  });

  return {
    token,
    isAuthenticated,
    login: loginMutation.mutate,
    loginAsync: loginMutation.mutateAsync,
    logout,
    isLoggingIn: loginMutation.isPending,
    loginError: loginMutation.error,
  };
}
