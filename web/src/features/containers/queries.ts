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
