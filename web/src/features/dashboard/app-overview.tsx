import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { AppWindow } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppsSummary } from './queries';

export function AppOverview() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: apps, isLoading } = useAppsSummary();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-medium">
          {t('dashboard.apps')}
        </CardTitle>
        <span className="text-sm text-muted-foreground">
          {apps?.length ?? 0}
        </span>
      </CardHeader>
      <CardContent>
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
          <div className="space-y-2">
            {apps.map((app) => (
              <div
                key={app.id}
                className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors"
              >
                <span className="text-sm font-medium capitalize truncate max-w-[60%]">
                  {app.template}
                </span>
                <StatusBadge status={app.status} />
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 pt-2 border-t">
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
    </Card>
  );
}
