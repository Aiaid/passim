import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useContainersSummary } from './queries';

const MAX_SHOWN = 5;

function containerName(names: string[]): string {
  const raw = names[0] ?? '';
  return raw.startsWith('/') ? raw.slice(1) : raw;
}

export function ContainerSummary() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: containers, isLoading } = useContainersSummary();

  const runningCount = containers?.filter((c) => c.State === 'running').length ?? 0;
  const totalCount = containers?.length ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-medium">
          {t('dashboard.containers')}
        </CardTitle>
        <span className="text-sm text-muted-foreground">
          {t('dashboard.running_of_total', { running: runningCount, total: totalCount })}
        </span>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : !containers || containers.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('common.no_data')}
          </p>
        ) : (
          <div className="space-y-2">
            {containers.slice(0, MAX_SHOWN).map((container) => (
              <div
                key={container.Id}
                className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors"
              >
                <span className="text-sm font-medium truncate max-w-[60%]">
                  {containerName(container.Names)}
                </span>
                <StatusBadge status={container.State} />
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 pt-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => navigate('/containers')}
          >
            {t('dashboard.view_all')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
