import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { AppWindow, Plus } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { PageSkeleton } from '@/components/shared/loading-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { AppResponse } from '@/lib/api-client';
import { useEventStream } from '@/hooks/use-event-stream';
import { AppCard } from './app-card';
import { AppDetailPanel } from './app-detail-panel';

export function AppsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { apps } = useEventStream();
  const isLoading = apps === null;
  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.getTemplates(),
  });
  const [selected, setSelected] = useState<AppResponse | null>(null);

  const runningCount = apps?.filter(a => a.status === 'running').length ?? 0;

  if (isLoading) {
    return <PageSkeleton />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={<>{t('app.title')}{runningCount > 0 && <Badge variant="secondary" className="ml-2">{t('app.running_count', { count: runningCount })}</Badge>}</>}
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 app-stagger">
          {apps.map((app) => (
            <AppCard
              key={app.id}
              app={app}
              template={templates?.find((tpl) => tpl.name === app.template)}
              onClick={() => setSelected(app)}
            />
          ))}
        </div>
      )}

      <AppDetailPanel
        app={selected}
        template={
          selected
            ? templates?.find((tpl) => tpl.name === selected.template)
            : undefined
        }
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </div>
  );
}
