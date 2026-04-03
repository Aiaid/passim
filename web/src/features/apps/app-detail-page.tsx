import { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router';
import { Trash2, RotateCcw, Plus, Loader2, Server } from 'lucide-react';
import { useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CategoryIcon } from '@/components/shared/category-icon';
import { CredentialField } from '@/components/shared/credential-field';
import { PageSkeleton } from '@/components/shared/loading-skeleton';
import { StatusBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CATEGORY_COLORS } from '@/lib/constants';
import { cn, localized } from '@/lib/utils';
import { api } from '@/lib/api-client';
import type { AppResponse } from '@/lib/api-client';
import { useEventStream } from '@/hooks/use-event-stream';
import { useContainerLogs, useNodeContainerLogs } from '@/features/containers/queries';
import { useApp, useTemplateForApp, useTemplateDetail } from './queries';
import { ClientConfig } from './client-config';
import { AppSettingsForm } from './app-settings-form';
import { ConnectionGuide } from './connection-guide';
import { AppUsersTab } from './app-users-tab';
import { AppTrafficTab } from './app-traffic-tab';
import { UndeployDialog } from './undeploy-dialog';

function isSensitiveSetting(key: string): boolean {
  return /password|psk|secret|key|uuid|token/i.test(key);
}

export function AppDetailPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showUndeploy, setShowUndeploy] = useState(false);

  const { data: app, isLoading } = useApp(id!);
  const template = useTemplateForApp(app?.template);
  const { data: templateDetail } = useTemplateDetail(app?.template);
  const { nodes } = useEventStream();
  const hasRemoteNodes = nodes && nodes.length > 0;

  const parsedSettings = useMemo(() => {
    if (!app?.settings) return {};
    return app.settings as Record<string, unknown>;
  }, [app?.settings]);

  if (isLoading || !app) {
    return <PageSkeleton />;
  }

  const categoryColor = CATEGORY_COLORS[template?.category ?? 'vpn'] || 'var(--cat-vpn)';

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
          <span className="capitalize">{app.template}</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <CategoryIcon category={template?.category ?? ''} templateName={app.template} size="lg" />
            <div>
              <h1 className="text-2xl font-bold capitalize">{app.template}</h1>
              {template && (
                <p className="text-sm text-muted-foreground mt-1">
                  {localized(template.description, i18n.language)}
                </p>
              )}
              {templateDetail?.source && (
                <div className="flex items-center gap-2 mt-2">
                  {templateDetail.source.url && (
                    <a
                      href={templateDetail.source.url}
                      target="_blank"
                      rel="noopener"
                      className="text-xs text-primary hover:underline"
                    >
                      {t('app.source')}
                    </a>
                  )}
                  {templateDetail.source.license && (
                    <Badge variant="secondary" className="text-xs">
                      {templateDetail.source.license}
                    </Badge>
                  )}
                </div>
              )}
              <div className="mt-2">
                <StatusBadge status={app.status} />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="destructive" size="sm" onClick={() => setShowUndeploy(true)}>
              <Trash2 className="mr-1 size-4" />
              {t('app.undeploy')}
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t('app.overview')}</TabsTrigger>
          <TabsTrigger value="settings">{t('app.settings_tab')}</TabsTrigger>
          <TabsTrigger value="client-config">{t('app.client_config', 'Client Config')}</TabsTrigger>
          <TabsTrigger value="logs">{t('container.logs')}</TabsTrigger>
          {templateDetail?.users?.supported && <TabsTrigger value="users">{t('app.users')}</TabsTrigger>}
          {templateDetail?.metrics?.supported && <TabsTrigger value="traffic">{t('app.traffic')}</TabsTrigger>}
          {hasRemoteNodes && (
            <TabsTrigger value="nodes">
              <Server className="size-3 mr-1" />
              {t('node.title')}
            </TabsTrigger>
          )}
        </TabsList>

        {/* Overview tab */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Connection Details card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('app.connection_details')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
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

            {/* Credentials card */}
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
              </CardContent>
            </Card>
          </div>

          {/* Connection Guide */}
          {templateDetail && <ConnectionGuide template={templateDetail} />}

          {/* Limitations */}
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

        {/* Settings tab */}
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

        {/* Client Config tab */}
        <TabsContent value="client-config" className="mt-6">
          <ClientConfig appId={app.id} templateName={app.template} />
        </TabsContent>

        {/* Logs tab */}
        <TabsContent value="logs" className="mt-6">
          <AppLogsTab app={app} />
        </TabsContent>

        {/* Users tab */}
        {templateDetail?.users?.supported && (
          <TabsContent value="users" className="mt-6">
            <AppUsersTab appId={app.id} templateDetail={templateDetail} />
          </TabsContent>
        )}

        {/* Traffic tab */}
        {templateDetail?.metrics?.supported && (
          <TabsContent value="traffic" className="mt-6">
            <AppTrafficTab appId={app.id} />
          </TabsContent>
        )}

        {/* Nodes tab */}
        {hasRemoteNodes && (
          <TabsContent value="nodes" className="mt-6">
            <AppNodesTab app={app} />
          </TabsContent>
        )}
      </Tabs>

      <UndeployDialog
        appId={app.id}
        open={showUndeploy}
        onOpenChange={setShowUndeploy}
      />
    </div>
  );
}

/* ── Logs Tab ──────────────────────────────────────────────── */

function AppLogsTab({ app }: { app: AppResponse }) {
  const { t } = useTranslation();
  const { nodes } = useEventStream();
  const connectedNodes = (nodes ?? []).filter(n => n.status === 'connected');

  // Find remote apps with same template
  const nodeAppQueries = useQueries({
    queries: connectedNodes.map(node => ({
      queryKey: ['nodes', node.id, 'apps'] as const,
      queryFn: () => api.getNodeApps(node.id),
      staleTime: 30_000,
    })),
  });

  const remoteApps: { nodeId: string; nodeName: string; appId: string; containerId?: string }[] = [];
  connectedNodes.forEach((node, i) => {
    const apps = nodeAppQueries[i]?.data;
    if (!apps) return;
    const match = apps.find((a: AppResponse) => a.template === app.template);
    if (match) {
      remoteApps.push({
        nodeId: node.id,
        nodeName: node.name || node.address,
        appId: match.id,
        containerId: match.container_id,
      });
    }
  });

  const allNodes = [
    { id: 'local', name: 'Local', containerId: app.container_id },
    ...remoteApps.map(ra => ({ id: ra.nodeId, name: ra.nodeName, containerId: ra.containerId })),
  ];

  const [selectedNode, setSelectedNode] = useState('local');
  const selected = allNodes.find(n => n.id === selectedNode) ?? allNodes[0];

  return (
    <div className="space-y-3">
      {allNodes.length > 1 && (
        <div className="flex gap-1.5">
          {allNodes.map(node => (
            <Button
              key={node.id}
              variant={selectedNode === node.id ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setSelectedNode(node.id)}
            >
              {node.name}
            </Button>
          ))}
        </div>
      )}
      {selected.id === 'local' ? (
        <LogTerminal containerId={selected.containerId ?? null} label={app.template} />
      ) : (
        <LogTerminal
          containerId={selected.containerId ?? null}
          nodeId={selected.id}
          label={`${selected.name} / ${app.template}`}
        />
      )}
    </div>
  );
}

function LogTerminal({ containerId, nodeId, label }: { containerId: string | null; nodeId?: string; label: string }) {
  const { t } = useTranslation();
  const localLogs = useContainerLogs(nodeId ? null : containerId);
  const nodeLogs = useNodeContainerLogs(nodeId ?? '', nodeId ? containerId : null);
  const { data, isLoading, refetch } = nodeId ? nodeLogs : localLogs;

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const lines = useMemo(() => {
    if (!data?.logs) return [];
    const raw = data.logs.split('\n');
    while (raw.length > 0 && raw[raw.length - 1] === '') raw.pop();
    return raw;
  }, [data?.logs]);

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
      {/* Terminal chrome */}
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

      {/* Terminal body */}
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

/* ── Nodes Tab ─────────────────────────────────────────────── */

function AppNodesTab({ app }: { app: AppResponse }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { apps: localApps, nodes, status } = useEventStream();

  const connectedNodes = (nodes ?? []).filter(n => n.status === 'connected');
  const nodeAppQueries = useQueries({
    queries: connectedNodes.map(node => ({
      queryKey: ['nodes', node.id, 'apps'] as const,
      queryFn: () => api.getNodeApps(node.id),
      refetchInterval: 30_000,
      staleTime: 10_000,
    })),
  });

  const allNodes = [
    { id: 'local', name: status?.node.name ?? 'Local', connected: true },
    ...(nodes ?? []).map(n => ({ id: n.id, name: n.name || n.address, connected: n.status === 'connected' })),
  ];

  const deploymentMap = new Map<string, AppResponse>();
  (localApps ?? []).forEach(a => {
    if (a.template === app.template) deploymentMap.set('local', a);
  });
  connectedNodes.forEach((node, i) => {
    const apps = nodeAppQueries[i]?.data;
    apps?.forEach((a: AppResponse) => {
      if (a.template === app.template) deploymentMap.set(node.id, a);
    });
  });

  const deployMutation = useMutation({
    mutationFn: async (nodeId: string) => {
      const settings = (app.settings ?? {}) as Record<string, unknown>;
      if (nodeId === 'local') {
        return api.deployApp(app.template, settings);
      }
      return api.deployNodeApp(nodeId, { template: app.template, settings });
    },
    onSuccess: (_data, nodeId) => {
      if (nodeId === 'local') {
        queryClient.invalidateQueries({ queryKey: ['apps'] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['nodes', nodeId, 'apps'] });
      }
      toast.success(t('marketplace.deploy_success'));
    },
    onError: () => toast.error(t('marketplace.deploy_failed')),
  });

  const undeployMutation = useMutation({
    mutationFn: async ({ nodeId, appId }: { nodeId: string; appId: string }) => {
      if (nodeId === 'local') {
        return api.deleteApp(appId);
      }
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
  });

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground mb-3">
        {t('node.select_targets')}
      </p>
      {allNodes.map(node => {
        const deployed = deploymentMap.get(node.id);
        const isDeployed = !!deployed;
        const isRunning = deployed?.status === 'running';
        const isDeploying = deployMutation.isPending && deployMutation.variables === node.id;
        const isUndeploying = undeployMutation.isPending && undeployMutation.variables?.nodeId === node.id;

        return (
          <div
            key={node.id}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 border transition-colors"
          >
            <span className={cn(
              'size-2 rounded-full shrink-0',
              isDeployed
                ? isRunning ? 'bg-status-running' : 'bg-status-warning'
                : 'bg-muted-foreground/20'
            )} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{node.name}</p>
              {isDeployed && (
                <p className={cn(
                  'text-[10px] font-medium uppercase tracking-wider',
                  isRunning ? 'text-status-running' : 'text-muted-foreground'
                )}>
                  {deployed!.status}
                </p>
              )}
            </div>
            {node.connected ? (
              isDeployed ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-destructive hover:text-destructive"
                  onClick={() => undeployMutation.mutate({ nodeId: node.id, appId: deployed!.id })}
                  disabled={isUndeploying}
                >
                  {isUndeploying ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3 mr-1" />}
                  {t('app.undeploy')}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => deployMutation.mutate(node.id)}
                  disabled={isDeploying}
                >
                  {isDeploying ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3 mr-1" />}
                  {t('marketplace.deploy')}
                </Button>
              )
            ) : (
              <span className="text-xs text-muted-foreground/40">offline</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
