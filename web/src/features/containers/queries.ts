import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export function useContainers() {
  return useQuery({
    queryKey: ['containers'],
    queryFn: () => api.getContainers(),
  });
}

export function useContainerAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'start' | 'stop' | 'restart' }) => {
      switch (action) {
        case 'start':
          return api.startContainer(id);
        case 'stop':
          return api.stopContainer(id);
        case 'restart':
          return api.restartContainer(id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containers'] });
    },
  });
}

export function useRemoveContainer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.removeContainer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containers'] });
    },
  });
}

export function useContainerLogs(id: string | null) {
  return useQuery({
    queryKey: ['container-logs', id],
    queryFn: () => api.getContainerLogs(id!),
    enabled: !!id,
  });
}

// Remote node container hooks

export function useNodeContainerAction(nodeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'start' | 'stop' | 'restart' }) => {
      switch (action) {
        case 'start':   return api.nodeStartContainer(nodeId, id);
        case 'stop':    return api.nodeStopContainer(nodeId, id);
        case 'restart': return api.nodeRestartContainer(nodeId, id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nodes', nodeId, 'containers'] });
    },
  });
}

export function useNodeRemoveContainer(nodeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.nodeRemoveContainer(nodeId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nodes', nodeId, 'containers'] });
    },
  });
}

export function useNodeContainerLogs(nodeId: string, id: string | null) {
  return useQuery({
    queryKey: ['node-container-logs', nodeId, id],
    queryFn: () => api.getNodeContainerLogs(nodeId, id!),
    enabled: !!nodeId && !!id,
  });
}
