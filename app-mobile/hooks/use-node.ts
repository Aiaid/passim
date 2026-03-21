import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getNodeApi } from '@/lib/api';

export function useStatus() {
  return useQuery({
    queryKey: ['status'],
    queryFn: () => getNodeApi().getStatus(),
  });
}

export function useNodes() {
  return useQuery({
    queryKey: ['nodes'],
    queryFn: () => getNodeApi().getNodes(),
  });
}

export function useNodeStatus(id: string) {
  return useQuery({
    queryKey: ['nodes', id, 'status'],
    queryFn: () => getNodeApi().getNodeStatus(id),
    enabled: !!id,
    refetchInterval: 30000,
  });
}

export function useAddRemoteNode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { address: string; api_key: string; name?: string }) =>
      getNodeApi().addNode(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nodes'] });
    },
  });
}

export function useRemoveRemoteNode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getNodeApi().removeNode(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nodes'] });
    },
  });
}
