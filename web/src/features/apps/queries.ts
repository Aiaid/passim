import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api-client';

export function useApps() {
  return useQuery({
    queryKey: ['apps'],
    queryFn: () => api.getApps(),
  });
}

export function useAppConfigs(appId: string) {
  return useQuery({
    queryKey: ['app-configs', appId],
    queryFn: () => api.getAppConfigs(appId),
    enabled: !!appId,
  });
}

export function useAppConfigFile(appId: string, filename: string | null) {
  return useQuery({
    queryKey: ['app-config-file', appId, filename],
    queryFn: () => api.getAppConfigFile(appId, filename!),
    enabled: !!appId && !!filename,
  });
}

export function useApp(id: string) {
  return useQuery({
    queryKey: ['app', id],
    queryFn: () => api.getApp(id),
    enabled: !!id,
  });
}

export function useUpdateApp() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({ id, settings }: { id: string; settings: Record<string, unknown> }) =>
      api.updateApp(id, settings),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['app', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['apps'] });
      toast.success(t('app.settings_updated'));
    },
  });
}

export function useDeleteApp() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (id: string) => api.deleteApp(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apps'] });
      toast.success(t('app.undeployed'));
      navigate('/apps');
    },
  });
}

export function useAppClientConfig(id: string) {
  return useQuery({
    queryKey: ['app-client-config', id],
    queryFn: () => api.getAppClientConfig(id),
    enabled: !!id,
  });
}

export function useCreateShare() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, userIndex }: { id: string; userIndex?: number }) =>
      api.createShare(id, userIndex),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['app-client-config', variables.id] });
      toast.success('Share link created');
    },
  });
}

export function useRevokeShare() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, userIndex }: { id: string; userIndex?: number }) =>
      api.revokeShare(id, userIndex),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['app-client-config', variables.id] });
      toast.success('Share link revoked');
    },
  });
}

export function useTemplateForApp(templateName: string | undefined) {
  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.getTemplates(),
  });

  return templates?.find((t) => t.name === templateName);
}

export function useTemplateDetail(templateName: string | undefined) {
  return useQuery({
    queryKey: ['template-detail', templateName],
    queryFn: () => api.getTemplate(templateName!),
    enabled: !!templateName,
    staleTime: Infinity,
  });
}

export function useAppUsers(appId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['app-users', appId],
    queryFn: () => api.getAppUsers(appId),
    enabled: !!appId && enabled,
    refetchInterval: 10_000,
  });
}

export function useAppTraffic(appId: string, period: string, enabled: boolean) {
  return useQuery({
    queryKey: ['app-traffic', appId, period],
    queryFn: () => api.getAppTraffic(appId, period),
    enabled: !!appId && enabled,
    refetchInterval: 60_000,
  });
}

export function useResetAppTraffic() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (appId: string) => api.resetAppTraffic(appId),
    onSuccess: (_data, appId) => {
      queryClient.invalidateQueries({ queryKey: ['app-traffic', appId] });
      toast.success(t('traffic.reset_success'));
    },
    onError: () => {
      toast.error(t('traffic.reset_failed'));
    },
  });
}

export function useCreateAppUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ appId, data }: { appId: string; data: { username: string; password?: string; quota_bytes?: number } }) =>
      api.createAppUser(appId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['app-users', variables.appId] });
    },
  });
}

export function useUpdateAppUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ appId, uid, data }: { appId: string; uid: string; data: { enabled?: boolean; quota_bytes?: number; password?: string } }) =>
      api.updateAppUser(appId, uid, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['app-users', variables.appId] });
    },
  });
}

export function useDeleteAppUser() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({ appId, uid }: { appId: string; uid: string }) =>
      api.deleteAppUser(appId, uid),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['app-users', variables.appId] });
      toast.success(t('users.deleted'));
    },
  });
}

export function useKickAppUser() {
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({ appId, uid }: { appId: string; uid: string }) =>
      api.kickAppUser(appId, uid),
    onSuccess: () => {
      toast.success(t('users.kicked'));
    },
  });
}
