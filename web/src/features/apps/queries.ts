import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api-client';

export function useApps() {
  return useQuery({
    queryKey: ['apps'],
    queryFn: () => api.getApps(),
    refetchInterval: 15_000,
  });
}

export function useApp(id: string) {
  return useQuery({
    queryKey: ['app', id],
    queryFn: () => api.getApp(id),
    enabled: !!id,
  });
}

export function useAppConfigs(id: string) {
  return useQuery({
    queryKey: ['app-configs', id],
    queryFn: () => api.getAppConfigs(id),
    enabled: !!id,
  });
}

export function useAppConfigFile(id: string, file: string | null) {
  return useQuery({
    queryKey: ['app-config-file', id, file],
    queryFn: () => api.getAppConfigFile(id, file!),
    enabled: !!id && !!file,
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

export function useTemplateForApp(templateName: string | undefined) {
  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.getTemplates(),
  });

  return templates?.find((t) => t.name === templateName);
}
