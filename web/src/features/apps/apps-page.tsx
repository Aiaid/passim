import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { AppWindow, Plus, Server } from 'lucide-react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/page-header';
import { PageSkeleton } from '@/components/shared/loading-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CategoryIcon } from '@/components/shared/category-icon';
import { CATEGORY_GRADIENTS } from '@/lib/constants';
import { api } from '@/lib/api-client';
import type { AppResponse } from '@/lib/api-client';
import { useEventStream } from '@/hooks/use-event-stream';
import { cn, localized } from '@/lib/utils';
import { AppCard } from './app-card';
import { AppDetailPanel } from './app-detail-panel';

export function AppsPage() {
  const { nodes } = useEventStream();
  const hasRemoteNodes = nodes && nodes.length > 0;

  if (hasRemoteNodes) {
    return <MultiNodeAppsPage />;
  }

  return <SingleNodeAppsPage />;
}

/* ── Original single-node layout ─────────────────────────── */
function SingleNodeAppsPage() {
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

  if (isLoading) return <PageSkeleton />;

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
        template={selected ? templates?.find((tpl) => tpl.name === selected.template) : undefined}
        open={!!selected}
        onOpenChange={(open) => { if (!open) setSelected(null); }}
      />
    </div>
  );
}

/* ── Multi-node apps page ────────────────────────────────── */

function MultiNodeAppsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { apps: localApps, nodes, status } = useEventStream();
  const isLoading = localApps === null;

  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.getTemplates(),
  });

  const connectedNodes = (nodes ?? []).filter(n => n.status === 'connected');
  const nodeAppQueries = useQueries({
    queries: connectedNodes.map(node => ({
      queryKey: ['nodes', node.id, 'apps'] as const,
      queryFn: () => api.getNodeApps(node.id),
      refetchInterval: 30_000,
      staleTime: 10_000,
    })),
  });

  const [selected, setSelected] = useState<AppResponse | null>(null);

  // All nodes
  const allNodes = [
    { id: 'local', name: status?.node.name ?? 'Local', connected: true },
    ...(nodes ?? []).map(n => ({ id: n.id, name: n.name || n.address, connected: n.status === 'connected' })),
  ];

  // Group by template → pick the "primary" deployment (first found) for the panel
  const templateMap = new Map<string, { primary: AppResponse; deployedNodes: Set<string> }>();
  (localApps ?? []).forEach(app => {
    if (!templateMap.has(app.template)) {
      templateMap.set(app.template, { primary: app, deployedNodes: new Set(['local']) });
    } else {
      templateMap.get(app.template)!.deployedNodes.add('local');
    }
  });
  connectedNodes.forEach((node, i) => {
    const apps = nodeAppQueries[i]?.data;
    if (!apps) return;
    apps.forEach((app: AppResponse) => {
      if (!templateMap.has(app.template)) {
        templateMap.set(app.template, { primary: app, deployedNodes: new Set([node.id]) });
      } else {
        templateMap.get(app.template)!.deployedNodes.add(node.id);
      }
    });
  });

  const groups = Array.from(templateMap.entries())
    .map(([name, { primary, deployedNodes }]) => ({
      templateName: name,
      template: templates?.find(t => t.name === name),
      primary,
      deployedNodes,
    }))
    .sort((a, b) => a.templateName.localeCompare(b.templateName));

  const totalRunning = groups.reduce((sum, g) => {
    // Count from primary status - simplified
    if (g.primary.status === 'running') sum++;
    return sum;
  }, 0);

  if (isLoading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <>
            {t('app.title')}
            {totalRunning > 0 && <Badge variant="secondary" className="ml-2">{t('app.running_count', { count: totalRunning })}</Badge>}
            <Badge variant="outline" className="ml-2"><Server className="size-3 mr-1" />{allNodes.length}</Badge>
          </>
        }
        actions={
          <Button onClick={() => navigate('/apps/new')}>
            <Plus className="mr-2 size-4" />
            {t('app.deploy_new')}
          </Button>
        }
      />

      {groups.length === 0 ? (
        <EmptyState
          icon={AppWindow}
          title={t('app.no_apps')}
          description={t('app.no_apps_desc')}
          actionLabel={t('app.deploy_new')}
          onAction={() => navigate('/apps/new')}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 app-stagger">
          {groups.map(({ templateName, template, primary, deployedNodes }) => (
            <Card
              key={templateName}
              className="cursor-pointer overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
              onClick={() => setSelected(primary)}
            >
              <div
                className="h-[3px] w-full"
                style={{ background: CATEGORY_GRADIENTS[template?.category ?? ''] || CATEGORY_GRADIENTS.vpn }}
              />
              <CardHeader className="flex flex-row items-start gap-3 space-y-0">
                <CategoryIcon category={template?.category ?? ''} templateName={templateName} />
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-base font-semibold capitalize">{templateName}</CardTitle>
                  {template?.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                      {localized(template.description, i18n.language)}
                    </p>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {/* Mini node badges */}
                <div className="flex flex-wrap gap-1">
                  {allNodes.map(node => {
                    const isDeployed = deployedNodes.has(node.id);
                    return (
                      <span
                        key={node.id}
                        className={cn(
                          'mn-deploy-badge',
                          isDeployed ? 'mn-deploy-running' : 'mn-deploy-none'
                        )}
                      >
                        <span className={cn(
                          'size-1 rounded-full shrink-0',
                          isDeployed ? 'bg-status-running' : 'bg-muted-foreground/15'
                        )} />
                        {node.name}
                      </span>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AppDetailPanel
        app={selected}
        template={selected ? templates?.find((tpl) => tpl.name === selected.template) : undefined}
        open={!!selected}
        onOpenChange={(open) => { if (!open) setSelected(null); }}
      />
    </div>
  );
}
