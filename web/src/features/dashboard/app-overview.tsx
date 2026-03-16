import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { AppWindow } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CategoryIcon } from '@/components/shared/category-icon';
import { StatusIndicator } from '@/components/shared/status-indicator';
import { EmptyState } from '@/components/shared/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { AppDetailPanel } from '@/features/apps/app-detail-panel';
import { cn } from '@/lib/utils';
import { api, type AppResponse } from '@/lib/api-client';
import { useEventStream } from '@/hooks/use-event-stream';

export function AppOverview({ className }: { className?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { apps } = useEventStream();
  const isLoading = apps === null;
  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.getTemplates(),
  });
  const [selected, setSelected] = useState<AppResponse | null>(null);

  return (
    <Card className={cn('flex flex-col overflow-hidden', className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-2 shrink-0">
        <CardTitle className="text-base font-medium">
          {t('dashboard.apps')}
        </CardTitle>
        <span className="text-sm text-muted-foreground">
          {apps?.length ?? 0}
        </span>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : !apps || apps.length === 0 ? (
            <EmptyState
              icon={AppWindow}
              title={t('dashboard.no_apps')}
              description={t('dashboard.no_apps_desc')}
              actionLabel={t('dashboard.deploy_new')}
              onAction={() => navigate('/apps/new')}
            />
          ) : (
            <div className="space-y-1">
              {apps.map((app) => {
                const tpl = templates?.find((t) => t.name === app.template);
                return (
                  <div
                    key={app.id}
                    className="flex items-center gap-2.5 rounded-md px-2 py-1.5 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setSelected(app)}
                  >
                    <CategoryIcon
                      category={tpl?.category ?? 'vpn'}
                      templateName={app.template}
                      size="sm"
                    />
                    <span className="text-sm font-medium capitalize truncate flex-1 min-w-0">
                      {app.template}
                    </span>
                    <StatusIndicator status={app.status} size="sm" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="mt-2 pt-2 border-t shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => navigate('/apps/new')}
          >
            {t('dashboard.deploy_new')}
          </Button>
        </div>
      </CardContent>

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
    </Card>
  );
}
