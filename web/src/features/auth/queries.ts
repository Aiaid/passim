import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export function usePasskeyExists() {
  return useQuery({
    queryKey: ['passkey-exists'],
    queryFn: () => api.passkeyExists(),
    staleTime: 60_000,
    retry: false,
  });
}
