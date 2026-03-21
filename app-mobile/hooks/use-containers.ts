import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getNodeApi } from '@/lib/api';

export function useContainers() {
  return useQuery({
    queryKey: ['containers'],
    queryFn: () => getNodeApi().getContainers(),
  });
}

export function useStartContainer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getNodeApi().startContainer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containers'] });
    },
  });
}

export function useStopContainer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getNodeApi().stopContainer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containers'] });
    },
  });
}

export function useRestartContainer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getNodeApi().restartContainer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containers'] });
    },
  });
}

export function useRemoveContainer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getNodeApi().removeContainer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containers'] });
    },
  });
}

export function useContainerLogs(id: string) {
  return useQuery({
    queryKey: ['containers', id, 'logs'],
    queryFn: () => getNodeApi().getContainerLogs(id),
    enabled: !!id,
  });
}
