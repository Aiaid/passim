import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: () => api.getTemplates(),
  });
}

export function useTemplate(name: string | undefined) {
  return useQuery({
    queryKey: ['template-detail', name],
    queryFn: () => api.getTemplate(name!),
    enabled: !!name,
    staleTime: Infinity,
  });
}

export function useDeployApp() {
  return useMutation({
    mutationFn: ({ template, settings }: { template: string; settings: Record<string, unknown> }) =>
      api.deployApp(template, settings),
  });
}

export function useTaskStatus(taskId: string | undefined) {
  return useQuery({
    queryKey: ['task', taskId],
    queryFn: () => api.getTask(taskId!),
    refetchInterval: 2000,
    enabled: !!taskId,
  });
}
