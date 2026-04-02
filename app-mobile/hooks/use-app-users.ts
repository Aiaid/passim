import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getNodeApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';

export function useAppUsers(nodeId: string, appId: string) {
  return useQuery({
    queryKey: qk.appUsers(nodeId, appId),
    queryFn: () => getNodeApi(nodeId).getAppUsers(appId),
    enabled: !!nodeId && !!appId,
  });
}

export function useCreateAppUser(nodeId: string, appId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { username: string; password?: string; quota_bytes?: number }) =>
      getNodeApi(nodeId).createAppUser(appId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.appUsers(nodeId, appId) });
    },
  });
}

export function useUpdateAppUser(nodeId: string, appId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ uid, data }: { uid: string; data: { enabled?: boolean; password?: string; quota_bytes?: number } }) =>
      getNodeApi(nodeId).updateAppUser(appId, uid, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.appUsers(nodeId, appId) });
    },
  });
}

export function useDeleteAppUser(nodeId: string, appId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (uid: string) => getNodeApi(nodeId).deleteAppUser(appId, uid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.appUsers(nodeId, appId) });
    },
  });
}

export function useKickAppUser(nodeId: string, appId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (uid: string) => getNodeApi(nodeId).kickAppUser(appId, uid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.appUsers(nodeId, appId) });
    },
  });
}
