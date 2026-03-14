import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { AppWindow, Plus } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { PageSkeleton } from '@/components/shared/loading-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useApps } from './queries';
import { AppCard } from './app-card';

export function AppsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: apps, isLoading } = useApps();
  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.getTemplates(),
  });

  if (isLoading) {
    return <PageSkeleton />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('app.title')}
        actions={
          <Button onClick={() => navigate('/apps/new')}>
            <Plus className="mr-2 size-4" />
            {t('app.deploy_new')}
          </Button>
        }
      />

      {!apps || apps.length === 0 ? (
        <EmptyState
          icon={AppWindow}
          title={t('app.no_apps')}
          description={t('app.no_apps_desc')}
          actionLabel={t('app.deploy_new')}
          onAction={() => navigate('/apps/new')}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {apps.map((app) => (
            <AppCard
              key={app.id}
              app={app}
              template={templates?.find((tpl) => tpl.name === app.template)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
