import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getNodeApi } from '@/lib/api';

export function usePasskeys() {
  return useQuery({
    queryKey: ['passkeys'],
    queryFn: () => getNodeApi().listPasskeys(),
  });
}

export function useDeletePasskey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getNodeApi().deletePasskey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['passkeys'] });
    },
  });
}
