import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getNodeApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';

export function usePasskeys(nodeId: string) {
  return useQuery({
    queryKey: qk.passkeys(nodeId),
    queryFn: () => getNodeApi(nodeId).listPasskeys(),
    enabled: !!nodeId,
  });
}

export function useDeletePasskey(nodeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getNodeApi(nodeId).deletePasskey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.passkeys(nodeId) });
    },
  });
}
