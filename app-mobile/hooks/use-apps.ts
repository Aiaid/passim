import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getNodeApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';

export function useApps(nodeId: string) {
  return useQuery({
    queryKey: qk.apps(nodeId),
    queryFn: () => getNodeApi(nodeId).getApps(),
    enabled: !!nodeId,
  });
}

export function useApp(nodeId: string, id: string) {
  return useQuery({
    queryKey: qk.app(nodeId, id),
    queryFn: () => getNodeApi(nodeId).getApp(id),
    enabled: !!nodeId && !!id,
  });
}

export function useTemplates(nodeId: string) {
  return useQuery({
    queryKey: qk.templates(nodeId),
    queryFn: () => getNodeApi(nodeId).getTemplates(),
    enabled: !!nodeId,
  });
}

export function useTemplate(nodeId: string, name: string) {
  return useQuery({
    queryKey: qk.template(nodeId, name),
    queryFn: () => getNodeApi(nodeId).getTemplate(name),
    enabled: !!nodeId && !!name,
  });
}

export function useDeployApp(nodeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { template: string; settings: Record<string, unknown> }) =>
      getNodeApi(nodeId).deployApp(data.template, data.settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.apps(nodeId) });
    },
  });
}

export function useDeleteApp(nodeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getNodeApi(nodeId).deleteApp(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.apps(nodeId) });
    },
  });
}

export function useAppClientConfig(nodeId: string, id: string) {
  return useQuery({
    queryKey: qk.appClientConfig(nodeId, id),
    queryFn: () => getNodeApi(nodeId).getAppClientConfig(id),
    enabled: !!nodeId && !!id,
  });
}
