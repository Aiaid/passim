import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getNodeApi } from '@/lib/api';

export function useApps() {
  return useQuery({
    queryKey: ['apps'],
    queryFn: () => getNodeApi().getApps(),
  });
}

export function useApp(id: string) {
  return useQuery({
    queryKey: ['apps', id],
    queryFn: () => getNodeApi().getApp(id),
    enabled: !!id,
  });
}

export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: () => getNodeApi().getTemplates(),
  });
}

export function useTemplate(name: string) {
  return useQuery({
    queryKey: ['templates', name],
    queryFn: () => getNodeApi().getTemplate(name),
    enabled: !!name,
  });
}

export function useDeployApp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { template: string; settings: Record<string, unknown> }) =>
      getNodeApi().deployApp(data.template, data.settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apps'] });
    },
  });
}

export function useDeleteApp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getNodeApi().deleteApp(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apps'] });
    },
  });
}

export function useAppClientConfig(id: string) {
  return useQuery({
    queryKey: ['apps', id, 'client-config'],
    queryFn: () => getNodeApi().getAppClientConfig(id),
    enabled: !!id,
  });
}
