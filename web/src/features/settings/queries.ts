import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export function useSSLStatus() {
  return useQuery({
    queryKey: ['ssl-status'],
    queryFn: () => api.getSSLStatus(),
    staleTime: 60_000,
    retry: false,
  });
}

export function usePasskeys() {
  return useQuery({
    queryKey: ['passkeys'],
    queryFn: () => api.listPasskeys(),
  });
}

export function useRegisterPasskey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ name, credential }: { name: string; credential: unknown }) => {
      return api.passkeyRegisterFinish({ name, response: credential });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['passkeys'] });
      queryClient.invalidateQueries({ queryKey: ['passkey-exists'] });
    },
  });
}

export function useRenewSSL() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.renewSSL(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ssl-status'] });
    },
  });
}

export function useDeletePasskey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.deletePasskey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['passkeys'] });
      queryClient.invalidateQueries({ queryKey: ['passkey-exists'] });
    },
  });
}
