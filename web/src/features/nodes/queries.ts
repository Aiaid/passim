import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '@/lib/api-client';

export function useNodes() {
  return useQuery({
    queryKey: ['nodes'],
    queryFn: () => api.getNodes(),
  });
}

export function useAddNode() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (data: { address: string; api_key: string; name?: string; skip_tls_verify?: boolean }) =>
      api.addNode(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nodes'] });
      toast.success(t('node.added'));
    },
    onError: (error) => {
      // TLS errors are handled in the dialog, don't show generic toast
      if (error instanceof ApiError && error.tlsError) return;
      toast.error(error.message);
    },
  });
}

export function useRemoveNode() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (id: string) => api.removeNode(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nodes'] });
      toast.success(t('node.removed'));
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function useUpdateNode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name: string } }) =>
      api.updateNode(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nodes'] });
    },
  });
}

export function useNodeStatus(id: string) {
  return useQuery({
    queryKey: ['nodes', id, 'status'],
    queryFn: () => api.getNodeStatus(id),
    enabled: !!id,
    refetchInterval: 30_000,
  });
}

export function useNodeContainers(id: string) {
  return useQuery({
    queryKey: ['nodes', id, 'containers'],
    queryFn: () => api.getNodeContainers(id),
    enabled: !!id,
    refetchInterval: 10_000,
  });
}

export function useNodeApps(id: string) {
  return useQuery({
    queryKey: ['nodes', id, 'apps'],
    queryFn: () => api.getNodeApps(id),
    enabled: !!id,
    refetchInterval: 10_000,
  });
}

export function useNodeUpdateCheck(id: string) {
  return useQuery({
    queryKey: ['nodes', id, 'update-check'],
    queryFn: () => api.checkNodeUpdate(id),
    enabled: false, // manual trigger only
    retry: false,
  });
}

export function useNodeUpdate() {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ nodeId, version }: { nodeId: string; version: string }) =>
      api.performNodeUpdate(nodeId, version),
    onSuccess: () => {
      toast.success(t('settings.update_started', 'Update started. Node will restart shortly.'));
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function useConnections() {
  return useQuery({
    queryKey: ['connections'],
    queryFn: () => api.getConnections(),
  });
}

export function useDisconnect() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (id: string) => api.disconnect(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] });
      toast.success(t('connection.disconnected'));
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}
