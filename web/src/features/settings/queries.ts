import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export function useSSLStatus() {
  return useQuery({
    queryKey: ['ssl-status'],
    queryFn: () => api.getSSLStatus(),
    staleTime: 60_000,
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
      return api.passkeyRegisterFinish({ ...credential as Record<string, unknown>, name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['passkeys'] });
      queryClient.invalidateQueries({ queryKey: ['passkey-exists'] });
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
