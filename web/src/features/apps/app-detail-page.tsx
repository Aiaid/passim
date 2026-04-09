import { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router';
import { AppWindow, RotateCcw, Server } from 'lucide-react';
import { useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CategoryIcon } from '@/components/shared/category-icon';
import { CredentialField } from '@/components/shared/credential-field';
import { EmptyState } from '@/components/shared/empty-state';
import { PageSkeleton } from '@/components/shared/loading-skeleton';
import { StatusBadge } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CATEGORY_COLORS } from '@/lib/constants';
import { cn, localized } from '@/lib/utils';
import { api } from '@/lib/api-client';
import type { AppResponse, RemoteNode } from '@/lib/api-client';
import { useEventStream } from '@/hooks/use-event-stream';
import { useContainerLogs, useNodeContainerLogs } from '@/features/containers/queries';
import { useTemplateForApp, useTemplateDetail } from './queries';
import { ClientConfig } from './client-config';
import { AppSettingsForm } from './app-settings-form';
import { ConnectionGuide } from './connection-guide';
import { AppUsersTab } from './app-users-tab';
import { AppTrafficTab } from './app-traffic-tab';

function isSensitiveSetting(key: string): boolean {
  return /password|psk|secret|key|uuid|token/i.test(key);
}

function countryFlag(code?: string): string {
  if (!code) return '';
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

// Compact metrics string shown in a switcher row
function formatRowMetrics(app: AppResponse): string {
  const parts: string[] = [];
  const settings = (app.settings ?? {}) as Record<string, unknown>;

  const port = settings.port ?? settings.PORT ?? settings.listen_port ?? settings.server_port;
  if (port !== undefined && port !== null && port !== '') parts.push(`Port ${String(port)}`);

  if (app.container_id) parts.push(app.container_id.slice(0, 8));

  return parts.length > 0 ? parts.join(' · ') : 'Deployed';
}

interface Instance {
  nodeId: string;        // 'local' or remote node UUID
  nodeName: string;
  country?: string;
  connected: boolean;
  status?: RemoteNode['status'];
  app: AppResponse | null;
}

export function AppDetailPage() {
  const { t, i18n } = useTranslation();
  const { template: templateName, nodeId: urlNodeId } = useParams<{ template: string; nodeId?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { apps: localApps, nodes, status } = useEventStream();
  const { data: templateDetail } = useTemplateDetail(templateName);
  const template = useTemplateForApp(templateName);

  // Fetch apps on every connected remote node
  const connectedNodes = useMemo(() => (nodes ?? []).filter(n => n.status === 'connected'), [nodes]);
  const nodeAppQueries = useQueries({
    queries: connectedNodes.map(node => ({
      queryKey: ['nodes', node.id, 'apps'] as const,
      queryFn: () => api.getNodeApps(node.id),
      refetchInterval: 30_000,
      staleTime: 10_000,
    })),
  });

  // Build per-node instance list (deployed or not)
  const instances = useMemo<Instance[]>(() => {
    if (!templateName) return [];
    const list: Instance[] = [];

    list.push({
      nodeId: 'local',
      nodeName: status?.node.name ?? 'Local',
      country: status?.node.country,
      connected: true,
      app: (localApps ?? []).find(a => a.template === templateName) ?? null,
    });

    (nodes ?? []).forEach((node) => {
      const idx = connectedNodes.findIndex(n => n.id === node.id);
      const remoteApps = idx >= 0 ? (nodeAppQueries[idx]?.data ?? []) : [];
      list.push({
        nodeId: node.id,
        nodeName: node.name || node.address,
        country: node.country,
        connected: node.status === 'connected',
        status: node.status,
        app: remoteApps.find((a: AppResponse) => a.template === templateName) ?? null,
      });
    });

    return list;
  }, [templateName, localApps, nodes, status, connectedNodes, nodeAppQueries]);

  // Determine selected instance
  const selected = useMemo<Instance | null>(() => {
    if (instances.length === 0) return null;
    if (urlNodeId) {
      return instances.find(i => i.nodeId === urlNodeId) ?? instances[0];
    }
    const localDeployed = instances.find(i => i.nodeId === 'local' && i.app);
    if (localDeployed) return localDeployed;
    const anyDeployed = instances.find(i => i.app);
    if (anyDeployed) return anyDeployed;
    return instances[0];
  }, [urlNodeId, instances]);

  const selectInstance = (nodeId: string) => {
    navigate(`/apps/${templateName}/${nodeId}`);
  };

  // Deploy / undeploy mutations
  const deployMutation = useMutation({
    mutationFn: async (nodeId: string) => {
      // Copy settings from any deployed instance as a seed
      const seed = (instances.find(i => i.app)?.app?.settings ?? {}) as Record<string, unknown>;
      if (nodeId === 'local') {
        return api.deployApp(templateName!, seed);
      }
      return api.deployNodeApp(nodeId, { template: templateName!, settings: seed });
    },
    onSuccess: (_data, nodeId) => {
      if (nodeId === 'local') {
        queryClient.invalidateQueries({ queryKey: ['apps'] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['nodes', nodeId, 'apps'] });
      }
      toast.success(t('marketplace.deploy_success'));
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t('marketplace.deploy_failed'));
    },
  });

  const undeployMutation = useMutation({
    mutationFn: async ({ nodeId, appId }: { nodeId: string; appId: string }) => {
      if (nodeId === 'local') return api.deleteApp(appId);
      return api.deleteNodeApp(nodeId, appId);
    },
    onSuccess: (_data, { nodeId }) => {
      if (nodeId === 'local') {
        queryClient.invalidateQueries({ queryKey: ['apps'] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['nodes', nodeId, 'apps'] });
      }
      toast.success(t('app.undeployed'));
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t('app.undeploy_failed'));
    },
  });

  const [pendingUndeploy, setPendingUndeploy] = useState<{ nodeId: string; nodeName: string; appId: string } | null>(null);

  const handleToggle = (instance: Instance, checked: boolean) => {
    if (checked) {
      // Deploying: if no instance anywhere has settings, go through the wizard
      const hasSeed = instances.some(i => i.app);
      if (!hasSeed) {
        navigate(`/apps/new/${templateName}`);
        return;
      }
      deployMutation.mutate(instance.nodeId);
    } else {
      if (!instance.app) return;
      setPendingUndeploy({
        nodeId: instance.nodeId,
        nodeName: instance.nodeName,
        appId: instance.app.id,
      });
    }
  };

  const isLoading = !templateName || localApps === null;

  if (isLoading) return <PageSkeleton />;

  // Template does not exist anywhere locally nor remotely
  if (!template && instances.every(i => !i.app)) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <button onClick={() => navigate('/apps')} className="hover:text-foreground transition-colors">
            {t('app.title')}
          </button>
          <span>/</span>
          <span className="capitalize">{templateName}</span>
        </div>
        <EmptyState
          icon={AppWindow}
          title={t('app.template_not_found', 'Template not found')}
          description={t('app.template_not_found_desc', { template: templateName, defaultValue: `No template named "${templateName}" is available.` })}
          actionLabel={t('app.back_to_apps', 'Back to apps')}
          onAction={() => navigate('/apps')}
        />
      </div>
    );
  }

  const categoryColor = CATEGORY_COLORS[template?.category ?? 'vpn'] || 'var(--cat-vpn)';
  const deployedCount = instances.filter(i => i.app).length;
  const selectedApp = selected?.app ?? null;

  const deployingNodeId = deployMutation.isPending ? (deployMutation.variables as string | undefined) : undefined;
  const undeployingNodeId = undeployMutation.isPending ? undeployMutation.variables?.nodeId : undefined;

  return (
    <div className="space-y-6">
      {/* Hero header */}
      <div
        className="rounded-xl border p-6"
        style={{ background: `linear-gradient(135deg, color-mix(in oklch, ${categoryColor} 5%, transparent), transparent)` }}
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <button onClick={() => navigate('/apps')} className="hover:text-foreground transition-colors">
            {t('app.title')}
          </button>
          <span>/</span>
          <span className="capitalize">{templateName}</span>
        </div>
        <div className="flex items-start gap-4">
          <CategoryIcon category={template?.category ?? ''} templateName={templateName ?? ''} size="lg" />
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold capitalize">{templateName}</h1>
            {template && (
              <p className="text-sm text-muted-foreground mt-1">
                {localized(template.description, i18n.language)}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="text-xs">
                <Server className="size-3 mr-1" />
                {t('app.deployed_on_nodes', { count: deployedCount, total: instances.length, defaultValue: `${deployedCount}/${instances.length} deployed` })}
              </Badge>
              {templateDetail?.source?.license && (
                <Badge variant="secondary" className="text-xs">{templateDetail.source.license}</Badge>
              )}
              {templateDetail?.source?.url && (
                <a
                  href={templateDetail.source.url}
                  target="_blank"
                  rel="noopener"
                  className="text-xs text-primary hover:underline"
                >
                  {t('app.source')}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Instance switcher */}
      <InstanceSwitcher
        instances={instances}
        selectedNodeId={selected?.nodeId ?? 'local'}
        onSelect={selectInstance}
        onToggle={handleToggle}
        deployingNodeId={deployingNodeId}
        undeployingNodeId={undeployingNodeId}
      />

      {/* Tabs content scoped to selected instance */}
      {!selected ? null : !selectedApp ? (
        <NotDeployedState
          templateName={templateName ?? ''}
          nodeName={selected.nodeName}
          connected={selected.connected}
          onDeploy={() => handleToggle(selected, true)}
          pending={deployingNodeId === selected.nodeId}
        />
      ) : selected.nodeId === 'local' ? (
        <LocalInstanceTabs
          app={selectedApp}
          template={template}
          templateDetail={templateDetail}
        />
      ) : (
        <RemoteInstanceTabs
          app={selectedApp}
          nodeId={selected.nodeId}
          template={template}
          templateDetail={templateDetail}
        />
      )}

      {/* Undeploy confirm */}
      <ConfirmDialog
        open={!!pendingUndeploy}
        onOpenChange={(open) => { if (!open) setPendingUndeploy(null); }}
        title={t('app.undeploy_title')}
        description={
          pendingUndeploy
            ? t('app.undeploy_node_desc', {
                node: pendingUndeploy.nodeName,
                template: templateName,
                defaultValue: `Undeploy ${templateName} from ${pendingUndeploy.nodeName}? This cannot be undone.`,
              })
            : ''
        }
        confirmLabel={t('app.undeploy')}
        onConfirm={() => {
          if (pendingUndeploy) {
            undeployMutation.mutate({ nodeId: pendingUndeploy.nodeId, appId: pendingUndeploy.appId });
            setPendingUndeploy(null);
          }
        }}
        destructive
      />
    </div>
  );
}

/* ── Instance Switcher ─────────────────────────────────────── */

interface InstanceSwitcherProps {
  instances: Instance[];
  selectedNodeId: string;
  onSelect: (nodeId: string) => void;
  onToggle: (instance: Instance, checked: boolean) => void;
  deployingNodeId?: string;
  undeployingNodeId?: string;
}

function InstanceSwitcher({
  instances,
  selectedNodeId,
  onSelect,
  onToggle,
  deployingNodeId,
  undeployingNodeId,
}: InstanceSwitcherProps) {
  const { t } = useTranslation();

  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-2">
        {t('app.instances', 'Instances')}
      </div>
      <div className="space-y-1.5">
        {instances.map(instance => {
          const isSelected = instance.nodeId === selectedNodeId;
          const isDeployed = !!instance.app;
          const isRunning = instance.app?.status === 'running';
          const isDeploying = deployingNodeId === instance.nodeId;
          const isUndeploying = undeployingNodeId === instance.nodeId;
          const isPending = isDeploying || isUndeploying;
          const isOffline = !instance.connected;

          const subText = isOffline
            ? t('node.offline', 'Offline')
            : !isDeployed
              ? t('app.not_deployed', 'Not deployed')
              : formatRowMetrics(instance.app!);

          return (
            <div
              key={instance.nodeId}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(instance.nodeId)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(instance.nodeId); } }}
              className={cn(
                'rounded-lg border px-4 py-3 transition-all cursor-pointer select-none',
                isSelected
                  ? 'bg-primary/5 ring-1 ring-primary/40 border-primary/40'
                  : 'hover:bg-foreground/[0.02]',
                !isDeployed && 'opacity-70',
                isOffline && 'opacity-50',
              )}
            >
              <div className="flex items-center gap-3">
                {/* Flag */}
                <span className="text-lg shrink-0 w-6 text-center leading-none">
                  {countryFlag(instance.country) || '•'}
                </span>

                {/* Name + sub text */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{instance.nodeName}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{subText}</div>
                </div>

                {/* Status dot */}
                {isDeployed && (
                  <span className="relative flex size-2 shrink-0" aria-hidden>
                    {isRunning && (
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-status-running opacity-75" />
                    )}
                    <span className={cn(
                      'inline-flex size-2 rounded-full',
                      isRunning ? 'bg-status-running' : 'bg-status-warning',
                    )} />
                  </span>
                )}

                {/* Switch (stop propagation so clicks don't select the row) */}
                <div
                  className="shrink-0"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <Switch
                    size="default"
                    checked={isDeployed}
                    loading={isPending}
                    disabled={isOffline}
                    onCheckedChange={(checked) => onToggle(instance, checked)}
                    aria-label={isDeployed ? t('app.undeploy') : t('marketplace.deploy')}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Not-deployed empty state ────────────────────────────── */

function NotDeployedState({
  templateName,
  nodeName,
  connected,
  onDeploy,
  pending,
}: {
  templateName: string;
  nodeName: string;
  connected: boolean;
  onDeploy: () => void;
  pending: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-3">
        <AppWindow className="size-10 text-muted-foreground/40" />
        <div>
          <p className="text-base font-medium">
            {t('app.not_deployed_on_node', { node: nodeName, defaultValue: `Not deployed on ${nodeName}` })}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {connected
              ? t('app.not_deployed_desc', { template: templateName, node: nodeName, defaultValue: `${templateName} is not running on ${nodeName} yet. Toggle the switch above or click below to deploy.` })
              : t('app.node_offline_desc', { node: nodeName, defaultValue: `${nodeName} is currently offline. Reconnect the node to manage apps on it.` })}
          </p>
        </div>
        {connected && (
          <Button onClick={onDeploy} disabled={pending} className="mt-2">
            {t('marketplace.deploy')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Local instance tabs (full features) ─────────────────── */

interface TabCommonProps {
  app: AppResponse;
  template: ReturnType<typeof useTemplateForApp>;
  templateDetail: ReturnType<typeof useTemplateDetail>['data'];
}

function LocalInstanceTabs({ app, template, templateDetail }: TabCommonProps) {
  const { t } = useTranslation();

  const parsedSettings = useMemo<Record<string, unknown>>(() => {
    if (!app?.settings) return {};
    return app.settings as Record<string, unknown>;
  }, [app?.settings]);

  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">{t('app.overview')}</TabsTrigger>
        <TabsTrigger value="settings">{t('app.settings_tab')}</TabsTrigger>
        <TabsTrigger value="client-config">{t('app.client_config', 'Client Config')}</TabsTrigger>
        <TabsTrigger value="logs">{t('container.logs')}</TabsTrigger>
        {templateDetail?.users?.supported && <TabsTrigger value="users">{t('app.users')}</TabsTrigger>}
        {templateDetail?.metrics?.supported && <TabsTrigger value="traffic">{t('app.traffic')}</TabsTrigger>}
      </TabsList>

      <TabsContent value="overview" className="mt-6 space-y-6">
        <OverviewCards app={app} parsedSettings={parsedSettings} />
        {templateDetail && <ConnectionGuide template={templateDetail} />}
        {templateDetail?.limitations && templateDetail.limitations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('app.limitations')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                {templateDetail.limitations.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="settings" className="mt-6">
        <Card>
          <CardContent className="pt-6">
            <AppSettingsForm
              appId={app.id}
              currentSettings={parsedSettings}
              settingsSchema={template?.settings ?? []}
            />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="client-config" className="mt-6">
        <ClientConfig appId={app.id} templateName={app.template} />
      </TabsContent>

      <TabsContent value="logs" className="mt-6">
        <LogTerminal containerId={app.container_id ?? null} label={app.template} />
      </TabsContent>

      {templateDetail?.users?.supported && (
        <TabsContent value="users" className="mt-6">
          <AppUsersTab appId={app.id} templateDetail={templateDetail} />
        </TabsContent>
      )}

      {templateDetail?.metrics?.supported && (
        <TabsContent value="traffic" className="mt-6">
          <AppTrafficTab appId={app.id} />
        </TabsContent>
      )}
    </Tabs>
  );
}

/* ── Remote instance tabs (reduced features) ─────────────── */

function RemoteInstanceTabs({
  app,
  nodeId,
  templateDetail,
}: TabCommonProps & { nodeId: string }) {
  const { t } = useTranslation();

  const parsedSettings = useMemo<Record<string, unknown>>(() => {
    if (!app?.settings) return {};
    return app.settings as Record<string, unknown>;
  }, [app?.settings]);

  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">{t('app.overview')}</TabsTrigger>
        <TabsTrigger value="logs">{t('container.logs')}</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-6 space-y-6">
        <OverviewCards app={app} parsedSettings={parsedSettings} />
        {templateDetail && <ConnectionGuide template={templateDetail} />}
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">
              {t('app.remote_limited_desc', 'Advanced management (settings, users, traffic, client config) for remote instances is not yet available. Open the node directly to access these features.')}
            </p>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="logs" className="mt-6">
        <LogTerminal
          containerId={app.container_id ?? null}
          nodeId={nodeId}
          label={app.template}
        />
      </TabsContent>
    </Tabs>
  );
}

/* ── Shared: Overview cards ──────────────────────────────── */

function OverviewCards({
  app,
  parsedSettings,
}: {
  app: AppResponse;
  parsedSettings: Record<string, unknown>;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('app.connection_details')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('app.status', 'Status')}</span>
            <StatusBadge status={app.status} />
          </div>
          <CredentialField
            label={t('app.container')}
            value={app.container_id?.slice(0, 12) ?? '-'}
            sensitive={false}
          />
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('app.deployed_at')}</span>
            <span>{new Date(app.deployed_at).toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('app.updated_at')}</span>
            <span>{new Date(app.updated_at).toLocaleString()}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('app.credentials')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Object.entries(parsedSettings).map(([key, value]) => (
            <CredentialField
              key={key}
              label={key}
              value={String(value ?? '-')}
              sensitive={isSensitiveSetting(key)}
            />
          ))}
          {Object.keys(parsedSettings).length === 0 && (
            <p className="text-xs text-muted-foreground italic">{t('common.no_data', '—')}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Shared: Log terminal ────────────────────────────────── */

function LogTerminal({
  containerId,
  nodeId,
  label,
}: {
  containerId: string | null;
  nodeId?: string;
  label: string;
}) {
  const { t } = useTranslation();
  const localLogs = useContainerLogs(nodeId ? null : containerId);
  const nodeLogs = useNodeContainerLogs(nodeId ?? '', nodeId ? containerId : null);
  const { data, isLoading, refetch } = nodeId ? nodeLogs : localLogs;

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const logs = data?.logs;
  const lines = useMemo(() => {
    if (!logs) return [];
    const raw = logs.split('\n');
    while (raw.length > 0 && raw[raw.length - 1] === '') raw.pop();
    return raw;
  }, [logs]);

  useEffect(() => {
    if (lines.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [lines]);

  if (!containerId) {
    return (
      <div className="flex items-center justify-center h-32 rounded-lg border">
        <p className="text-sm text-muted-foreground">{t('common.no_data')}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-muted dark:bg-zinc-900 border-b border-border dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-[oklch(0.577_0.245_27)]" />
            <span className="size-2.5 rounded-full bg-[oklch(0.75_0.18_80)]" />
            <span className="size-2.5 rounded-full bg-[oklch(0.65_0.2_145)]" />
          </div>
          <span className="text-[11px] text-muted-foreground dark:text-zinc-500 font-mono ml-1">
            {label}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          <RotateCcw className={`size-3 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="max-h-[500px] bg-muted/30 dark:bg-zinc-950 overflow-y-auto" ref={scrollRef}>
        <div className="p-3">
          {isLoading ? (
            <p className="text-xs font-mono text-muted-foreground p-2">{t('common.loading')}</p>
          ) : lines.length === 0 ? (
            <p className="text-xs font-mono text-muted-foreground p-2">{t('common.no_data')}</p>
          ) : (
            <div className="font-mono text-xs leading-5">
              {lines.map((line, i) => (
                <div key={i} className="flex hover:bg-muted dark:hover:bg-zinc-900/60 rounded-sm group">
                  <span className="select-none text-right text-muted-foreground/50 dark:text-zinc-600 w-8 shrink-0 pr-3 group-hover:text-zinc-500">
                    {i + 1}
                  </span>
                  <span className="text-foreground dark:text-zinc-300 whitespace-pre-wrap break-all flex-1">
                    {line}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
