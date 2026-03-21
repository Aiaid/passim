import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, Trash2, Cpu, HardDrive, MemoryStick, Server, AppWindow, AlertCircle, ExternalLink, RefreshCw, Download } from 'lucide-react';
import { PageSkeleton } from '@/components/shared/loading-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ContainerDetailPanel } from '@/features/containers/container-detail-panel';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useEventStream } from '@/hooks/use-event-stream';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  useNodes,
  useRemoveNode,
  useNodeStatus,
  useNodeContainers,
  useNodeApps,
  useNodeUpdate,
} from './queries';
import type { RemoteNode, Container, AppResponse, UpdateInfo } from '@/lib/api-client';
import { AppDetailPanel } from '@/features/apps/app-detail-panel';

function countryFlag(code: string): string {
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

function MetricGauge({ label, percent, icon: Icon }: { label: string; percent: number; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="size-5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex justify-between text-sm mb-1">
          <span>{label}</span>
          <span className="tabular-nums">{percent.toFixed(1)}%</span>
        </div>
        <div className="h-2 rounded-full bg-muted">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              percent > 80 ? 'bg-[oklch(0.577_0.245_27)]' : percent > 50 ? 'bg-[oklch(0.75_0.18_80)]' : 'bg-[oklch(0.65_0.2_145)]',
            )}
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function NodeUpdateCard({ nodeId, currentVersion }: { nodeId: string; currentVersion?: string }) {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const nodeUpdate = useNodeUpdate();

  const isDev = !currentVersion
    || currentVersion === 'dev'
    || currentVersion === 'unknown'
    || currentVersion.startsWith('dev-');

  const handleCheck = async () => {
    setChecking(true);
    try {
      const info = await api.checkNodeUpdate(nodeId, { force: true });
      setUpdateInfo(info);
    } catch {
      // ignore
    } finally {
      setChecking(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Version</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Current</span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs">{currentVersion || 'unknown'}</span>
            {isDev && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-semibold">DEV</span>
            )}
          </div>
        </div>

        {updateInfo?.available ? (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Latest</span>
              <span className="font-mono text-xs text-[oklch(0.65_0.2_145)]">{updateInfo.latest}</span>
            </div>
            <Button
              size="sm"
              className="w-full gap-1.5"
              onClick={() => nodeUpdate.mutate({ nodeId, version: updateInfo.latest })}
              disabled={nodeUpdate.isPending}
            >
              <Download className="size-3.5" />
              {nodeUpdate.isPending ? 'Updating...' : `Update to ${updateInfo.latest}`}
            </Button>
          </>
        ) : updateInfo ? (
          <p className="text-xs text-muted-foreground">Up to date</p>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5"
            onClick={handleCheck}
            disabled={checking}
          >
            <RefreshCw className={cn('size-3.5', checking && 'animate-spin')} />
            {checking ? 'Checking...' : 'Check for updates'}
          </Button>
        )}

        {/* Dev force update — pull latest dev image */}
        {isDev && (
          <div className="pt-2 border-t border-border/50">
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
              onClick={() => nodeUpdate.mutate({ nodeId, version: 'dev' })}
              disabled={nodeUpdate.isPending}
            >
              <RefreshCw className={cn('size-3.5', nodeUpdate.isPending && 'animate-spin')} />
              {nodeUpdate.isPending ? 'Updating...' : 'Force update (pull latest dev)'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OverviewTab({ node, statusData }: { node: RemoteNode; statusData?: import('@/lib/api-client').StatusResponse }) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Info card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('node.overview')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('node.address')}</span>
            <span className="font-mono text-xs">{node.address}</span>
          </div>
          {node.country && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Country</span>
              <span>{countryFlag(node.country)} {node.country}</span>
            </div>
          )}
          {node.version && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Version</span>
              <span className="font-mono text-xs">{node.version}</span>
            </div>
          )}
          {node.last_seen && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('node.last_seen')}</span>
              <span>{new Date(node.last_seen).toLocaleString()}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Created</span>
            <span>{new Date(node.created_at).toLocaleString()}</span>
          </div>
        </CardContent>
      </Card>

      {/* Metrics card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('dashboard.system')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {node.metrics ? (
            <>
              <MetricGauge label={t('dashboard.cpu')} percent={node.metrics.cpu_percent} icon={Cpu} />
              <MetricGauge label={t('dashboard.memory')} percent={node.metrics.memory_percent} icon={MemoryStick} />
              <MetricGauge label={t('dashboard.disk')} percent={node.metrics.disk_percent} icon={HardDrive} />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('dashboard.containers')}</span>
                <span>
                  {node.metrics.containers.running}/{node.metrics.containers.total}{' '}
                  {t('dashboard.running').toLowerCase()}
                </span>
              </div>
            </>
          ) : statusData ? (
            <>
              <MetricGauge label={t('dashboard.cpu')} percent={statusData.system.cpu.usage_percent} icon={Cpu} />
              <MetricGauge label={t('dashboard.memory')} percent={statusData.system.memory.usage_percent} icon={MemoryStick} />
              <MetricGauge label={t('dashboard.disk')} percent={statusData.system.disk.usage_percent} icon={HardDrive} />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('dashboard.containers')}</span>
                <span>
                  {statusData.containers.running}/{statusData.containers.total}{' '}
                  {t('dashboard.running').toLowerCase()}
                </span>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t('common.no_data')}</p>
          )}
        </CardContent>
      </Card>

      {/* Update card */}
      <NodeUpdateCard nodeId={node.id} currentVersion={node.version} />
    </div>
  );
}

function ContainersTab({ nodeId, containers, isLoading }: { nodeId: string; containers?: Container[]; isLoading: boolean }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Container | null>(null);

  if (isLoading) return <PageSkeleton />;

  if (!containers || containers.length === 0) {
    return (
      <EmptyState
        icon={Server}
        title={t('container.no_containers')}
      />
    );
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {containers.map((c) => {
          const name = c.Names[0]?.replace(/^\//, '') ?? c.Id.slice(0, 12);
          const state = c.State === 'exited' ? 'stopped' : c.State;
          return (
            <Card
              key={c.Id}
              className="border-l-[3px] border-l-muted cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md"
              onClick={() => setSelected(c)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium truncate">{name}</h3>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{c.Image}</p>
                  </div>
                  <StatusBadge status={state} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <ContainerDetailPanel
        nodeId={nodeId}
        container={selected}
        open={!!selected}
        onOpenChange={(open) => { if (!open) setSelected(null); }}
      />
    </>
  );
}

function AppsTab({ apps, isLoading }: { apps?: AppResponse[]; isLoading: boolean }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<AppResponse | null>(null);

  if (isLoading) return <PageSkeleton />;

  if (!apps || apps.length === 0) {
    return (
      <EmptyState
        icon={AppWindow}
        title={t('app.no_apps')}
      />
    );
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {apps.map((app) => (
          <Card
            key={app.id}
            className="cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md"
            onClick={() => setSelected(app)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-medium capitalize truncate">{app.template}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(app.deployed_at).toLocaleDateString()}
                  </p>
                </div>
                <StatusBadge status={app.status} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <AppDetailPanel
        app={selected}
        open={!!selected}
        onOpenChange={(open) => { if (!open) setSelected(null); }}
      />
    </>
  );
}

export function NodeDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showRemove, setShowRemove] = useState(false);

  const { nodes: sseNodes } = useEventStream();
  const { data: queryNodes, isLoading: nodesLoading } = useNodes();

  const nodes = sseNodes ?? queryNodes;
  const node = nodes?.find((n) => n.id === id);

  const { data: statusData } = useNodeStatus(id!);
  const { data: containers, isLoading: containersLoading } = useNodeContainers(id!);
  const { data: apps, isLoading: appsLoading } = useNodeApps(id!);

  const removeNode = useRemoveNode();

  if (nodesLoading && !nodes) {
    return <PageSkeleton />;
  }

  if (!node) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/nodes')}>
          <ArrowLeft className="mr-2 size-4" />
          {t('node.title')}
        </Button>
        <EmptyState
          icon={AlertCircle}
          title={t('common.no_data')}
        />
      </div>
    );
  }

  const statusMap: Record<string, string> = {
    connected: 'connected',
    disconnected: 'stopped',
    connecting: 'deploying',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border p-6" style={{ background: 'linear-gradient(135deg, color-mix(in oklch, oklch(0.55 0.2 270) 5%, transparent), transparent)' }}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <button onClick={() => navigate('/nodes')} className="hover:text-foreground transition-colors">
            {t('node.title')}
          </button>
          <span>/</span>
          <span>{node.name || node.address}</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex size-12 items-center justify-center rounded-xl bg-muted text-lg">
              {node.country ? countryFlag(node.country) : '🖥'}
            </div>
            <div>
              <h1 className="text-2xl font-bold">{node.name || node.address}</h1>
              <p className="text-sm text-muted-foreground mt-1 font-mono">{node.address}</p>
              <div className="mt-2">
                <StatusBadge status={statusMap[node.status] || 'stopped'} />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(node.address, '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink className="mr-1 size-4" />
              {t('node.open_ui')}
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setShowRemove(true)}>
              <Trash2 className="mr-1 size-4" />
              {t('node.remove')}
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t('node.overview')}</TabsTrigger>
          <TabsTrigger value="containers">{t('node.containers')}</TabsTrigger>
          <TabsTrigger value="apps">{t('node.apps')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <OverviewTab node={node} statusData={statusData} />
        </TabsContent>

        <TabsContent value="containers" className="mt-6">
          <ContainersTab nodeId={id!} containers={containers} isLoading={containersLoading} />
        </TabsContent>

        <TabsContent value="apps" className="mt-6">
          <AppsTab apps={apps} isLoading={appsLoading} />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={showRemove}
        onOpenChange={setShowRemove}
        title={t('node.remove')}
        description={t('node.remove_confirm')}
        confirmLabel={t('node.remove')}
        onConfirm={() => {
          removeNode.mutate(node.id, {
            onSuccess: () => navigate('/nodes'),
          });
        }}
        destructive
      />
    </div>
  );
}
