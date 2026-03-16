import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { AppWindow } from 'lucide-react';
import { useQueries, useQuery } from '@tanstack/react-query';
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
  const { apps, nodes, status } = useEventStream();
  const isLoading = apps === null;
  const hasRemoteNodes = nodes && nodes.length > 0;
  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.getTemplates(),
  });
  const [selected, setSelected] = useState<AppResponse | null>(null);

  // Fetch apps from connected remote nodes
  const connectedNodes = (nodes ?? []).filter(n => n.status === 'connected');
  const nodeAppQueries = useQueries({
    queries: connectedNodes.map(node => ({
      queryKey: ['nodes', node.id, 'apps'] as const,
      queryFn: () => api.getNodeApps(node.id),
      refetchInterval: 30_000,
      staleTime: 10_000,
      enabled: !!hasRemoteNodes,
    })),
  });

  // Build template → { nodeName → status } map for multi-node view
  const allNodes = hasRemoteNodes ? [
    { id: 'local', name: status?.node.name ?? 'Local' },
    ...(nodes ?? []).map(n => ({ id: n.id, name: n.name || n.address })),
  ] : [];

  const templateDeployments = new Map<string, Map<string, AppResponse>>();
  if (hasRemoteNodes) {
    (apps ?? []).forEach(app => {
      if (!templateDeployments.has(app.template)) templateDeployments.set(app.template, new Map());
      templateDeployments.get(app.template)!.set('local', app);
    });
    connectedNodes.forEach((node, i) => {
      const nodeApps = nodeAppQueries[i]?.data;
      if (!nodeApps) return;
      nodeApps.forEach((app: AppResponse) => {
        if (!templateDeployments.has(app.template)) templateDeployments.set(app.template, new Map());
        templateDeployments.get(app.template)!.set(node.id, app);
      });
    });
  }

  const entries = hasRemoteNodes
    ? Array.from(templateDeployments.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    : null;

  const totalApps = hasRemoteNodes
    ? templateDeployments.size
    : (apps?.length ?? 0);

  return (
    <Card className={cn('flex flex-col overflow-hidden', className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-2 shrink-0">
        <CardTitle className="text-base font-medium">
          {t('dashboard.apps')}
        </CardTitle>
        <span className="text-sm text-muted-foreground">
          {totalApps}
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
          ) : totalApps === 0 ? (
            <EmptyState
              icon={AppWindow}
              title={t('dashboard.no_apps')}
              description={t('dashboard.no_apps_desc')}
              actionLabel={t('dashboard.deploy_new')}
              onAction={() => navigate('/apps/new')}
            />
          ) : hasRemoteNodes && entries ? (
            /* Multi-node: show per-node deployment badges */
            <div className="space-y-1">
              {entries.map(([templateName, deployments]) => {
                const tpl = templates?.find(t => t.name === templateName);
                const primary = Array.from(deployments.values())[0];
                return (
                  <div
                    key={templateName}
                    className="rounded-md px-2 py-1.5 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setSelected(primary)}
                  >
                    <div className="flex items-center gap-2.5">
                      <CategoryIcon
                        category={tpl?.category ?? 'vpn'}
                        templateName={templateName}
                        size="sm"
                      />
                      <span className="text-sm font-medium capitalize truncate flex-1 min-w-0">
                        {templateName}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1 pl-[26px]">
                      {allNodes.map(node => {
                        const app = deployments.get(node.id);
                        const isDeployed = !!app;
                        const isRunning = app?.status === 'running';
                        return (
                          <span
                            key={node.id}
                            className={cn(
                              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]',
                              isDeployed
                                ? isRunning
                                  ? 'bg-status-running/10 text-status-running'
                                  : 'bg-status-warning/10 text-status-warning'
                                : 'bg-muted text-muted-foreground/60',
                            )}
                          >
                            <span className={cn(
                              'size-1 rounded-full',
                              isDeployed
                                ? isRunning ? 'bg-status-running' : 'bg-status-warning'
                                : 'bg-muted-foreground/30',
                            )} />
                            {node.name}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Single-node: simple list */
            <div className="space-y-1">
              {apps!.map((app) => {
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
