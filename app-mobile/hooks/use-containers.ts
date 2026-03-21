import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getNodeApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';

export function useContainers(nodeId: string) {
  return useQuery({
    queryKey: qk.containers(nodeId),
    queryFn: () => getNodeApi(nodeId).getContainers(),
    enabled: !!nodeId,
  });
}

export function useStartContainer(nodeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getNodeApi(nodeId).startContainer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.containers(nodeId) });
    },
  });
}

export function useStopContainer(nodeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getNodeApi(nodeId).stopContainer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.containers(nodeId) });
    },
  });
}

export function useRestartContainer(nodeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getNodeApi(nodeId).restartContainer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.containers(nodeId) });
    },
  });
}

export function useRemoveContainer(nodeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getNodeApi(nodeId).removeContainer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.containers(nodeId) });
    },
  });
}

export function useContainerLogs(nodeId: string, id: string) {
  return useQuery({
    queryKey: qk.containerLogs(nodeId, id),
    queryFn: () => getNodeApi(nodeId).getContainerLogs(id),
    enabled: !!nodeId && !!id,
  });
}
