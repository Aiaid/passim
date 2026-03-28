import { useQuery, useMutation, useQueryClient, useQueries } from '@tanstack/react-query';
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

export function useCreateShare(nodeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userIndex }: { id: string; userIndex?: number }) =>
      getNodeApi(nodeId).createShare(id, userIndex),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: qk.appClientConfig(nodeId, variables.id) });
    },
  });
}

export function useRevokeShare(nodeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userIndex }: { id: string; userIndex?: number }) =>
      getNodeApi(nodeId).revokeShare(id, userIndex),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: qk.appClientConfig(nodeId, variables.id) });
    },
  });
}

/**
 * Poll a task's status until it completes or fails.
 */
export function useTaskStatus(nodeId: string, taskId: string | undefined) {
  return useQuery({
    queryKey: ['task', nodeId, taskId],
    queryFn: () => getNodeApi(nodeId).getTask(taskId!),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'completed' || status === 'failed') return false;
      return 2000;
    },
    enabled: !!nodeId && !!taskId,
  });
}

/**
 * Deploy an app to a specific remote node via the Hub.
 */
export function useDeployNodeApp(hubNodeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { nodeId: string; template: string; settings: Record<string, unknown> }) =>
      getNodeApi(hubNodeId).deployNodeApp(data.nodeId, {
        template: data.template,
        settings: data.settings,
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: qk.apps(variables.nodeId) });
    },
  });
}

/**
 * Batch deploy an app to multiple targets via the Hub.
 */
export function useBatchDeploy(hubNodeId: string) {
  return useMutation({
    mutationFn: (data: { template: string; settings: Record<string, unknown>; targets: string[] }) =>
      getNodeApi(hubNodeId).batchDeploy(data),
  });
}
