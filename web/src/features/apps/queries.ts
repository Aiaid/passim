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
    mutationFn: (id: string) => api.revokeShare(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['app-client-config', id] });
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
