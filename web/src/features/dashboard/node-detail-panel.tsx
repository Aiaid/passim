import { useTranslation } from 'react-i18next';
import { X, Server, Globe, Cpu, Container, Gauge, AppWindow } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusIndicator } from '@/components/shared/status-indicator';
import { CategoryIcon } from '@/components/shared/category-icon';
import { formatBytes, formatUptime } from '@/lib/utils';
import { useEventStream } from '@/hooks/use-event-stream';
import { api, type StatusResponse, type AppResponse, type TemplateSummary } from '@/lib/api-client';

interface NodeDetailPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId?: string | null;
  onAppClick?: (app: AppResponse, template?: TemplateSummary) => void;
}

function countryFlag(code: string): string {
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

export function NodeDetailPanel({ open, onOpenChange, nodeId, onAppClick }: NodeDetailPanelProps) {
  const { t } = useTranslation();
  const { status: localStatus, nodes, apps: localApps, containers: localContainers } = useEventStream();

  const isRemote = !!nodeId && nodeId !== 'local';

  const { data: remoteStatus, isLoading } = useQuery({
    queryKey: ['nodes', nodeId, 'status'],
    queryFn: () => api.getNodeStatus(nodeId!),
    enabled: isRemote && open,
    refetchInterval: 10_000,
  });

  const { data: remoteApps } = useQuery({
    queryKey: ['nodes', nodeId, 'apps'],
    queryFn: () => api.getNodeApps(nodeId!),
    enabled: isRemote && open,
    refetchInterval: 15_000,
  });

  const { data: remoteContainers } = useQuery({
    queryKey: ['nodes', nodeId, 'containers'],
    queryFn: () => api.getNodeContainers(nodeId!),
    enabled: isRemote && open,
    refetchInterval: 15_000,
  });

  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.getTemplates(),
  });

  const status: StatusResponse | null | undefined = isRemote ? remoteStatus : localStatus;
  const remoteNode = isRemote ? nodes?.find(n => n.id === nodeId) : null;
  const appsList = isRemote ? remoteApps : localApps;
  const containersList = isRemote ? remoteContainers : localContainers;

  if (isRemote && isLoading && !status) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent showCloseButton={false} className="sm:max-w-md w-full flex flex-col p-0 gap-0">
          <SheetHeader className="px-5 py-4 border-b space-y-0">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-base">
                {remoteNode?.name || remoteNode?.address || t('common.loading')}
              </SheetTitle>
              <Button variant="ghost" size="icon" className="size-8" onClick={() => onOpenChange(false)}>
                <X className="size-3.5" />
              </Button>
            </div>
          </SheetHeader>
          <div className="flex-1 px-5 py-4 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  if (!status) return null;

  const { node, system, containers } = status;

  const statusColor = isRemote
    ? remoteNode?.status === 'connected' ? 'bg-status-running' : 'bg-status-stopped'
    : 'bg-status-running';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        showCloseButton={false}
        className="sm:max-w-md w-full flex flex-col p-0 gap-0"
      >
        {/* Header */}
        <SheetHeader className="px-5 py-4 border-b space-y-0">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="relative flex size-2 shrink-0">
                  <span className={`absolute inline-flex size-full animate-ping rounded-full ${statusColor} opacity-75`} />
                  <span className={`inline-flex size-2 rounded-full ${statusColor}`} />
                </span>
                <SheetTitle className="text-base truncate">{node.name}</SheetTitle>
                {node.country && <span className="text-sm">{countryFlag(node.country)}</span>}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                v{node.version} &middot; {formatUptime(node.uptime)}
              </p>
            </div>
            <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => onOpenChange(false)}>
              <X className="size-3.5" />
            </Button>
          </div>
        </SheetHeader>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden">
          <div className="px-5 pt-3">
            <TabsList className="w-full">
              <TabsTrigger value="overview" className="flex-1">{t('node.overview')}</TabsTrigger>
              <TabsTrigger value="apps" className="flex-1">
                {t('node.apps')}
                {appsList && appsList.length > 0 && (
                  <span className="ml-1.5 text-[10px] text-muted-foreground">{appsList.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="containers" className="flex-1">
                {t('node.containers')}
                {containersList && containersList.length > 0 && (
                  <span className="ml-1.5 text-[10px] text-muted-foreground">{containersList.length}</span>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Overview */}
          <TabsContent value="overview" className="flex-1 overflow-auto mt-0 px-5 py-4">
            <OverviewTab node={node} system={system} containers={containers} isRemote={isRemote} remoteAddress={remoteNode?.address} />
          </TabsContent>

          {/* Apps */}
          <TabsContent value="apps" className="flex-1 overflow-auto mt-0 px-5 py-4">
            <AppsTab apps={appsList ?? []} templates={templates ?? []} onAppClick={onAppClick} />
          </TabsContent>

          {/* Containers */}
          <TabsContent value="containers" className="flex-1 overflow-auto mt-0 px-5 py-4">
            <ContainersTab containers={containersList ?? []} />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

/* ── Overview tab ──────────────────────────────────────── */
function OverviewTab({ node, system, containers, isRemote, remoteAddress }: {
  node: StatusResponse['node'];
  system: StatusResponse['system'];
  containers: StatusResponse['containers'];
  isRemote: boolean;
  remoteAddress?: string;
}) {
  const { t } = useTranslation();

  const sections = [
    {
      title: t('dashboard.node_info'), icon: Server,
      fields: [
        { label: t('dashboard.node_name'), value: node.name },
        { label: t('dashboard.version'), value: `v${node.version}` },
        { label: t('dashboard.uptime'), value: formatUptime(node.uptime) },
        ...(isRemote && remoteAddress ? [{ label: t('node.address'), value: remoteAddress, mono: true }] : []),
      ],
    },
    {
      title: t('dashboard.network'), icon: Globe,
      fields: [
        ...(node.public_ip ? [{ label: 'IPv4', value: `${node.public_ip}${node.country ? ' ' + countryFlag(node.country) : ''}` }] : []),
        ...(node.public_ip6 ? [{ label: 'IPv6', value: node.public_ip6, mono: true }] : []),
      ],
    },
    {
      title: t('dashboard.system'), icon: Cpu,
      fields: [
        { label: t('dashboard.cpu_model'), value: system.cpu.model },
        { label: t('dashboard.cores'), value: `${system.cpu.cores}` },
        { label: t('dashboard.memory'), value: formatBytes(system.memory.total_bytes) },
        { label: t('dashboard.disk'), value: formatBytes(system.disk.total_bytes) },
        { label: t('dashboard.os'), value: system.os },
        { label: t('dashboard.kernel'), value: system.kernel, mono: true },
      ],
    },
    {
      title: t('dashboard.load'), icon: Gauge,
      fields: [
        { label: t('dashboard.load_1m'), value: system.load.load1.toFixed(2) },
        { label: t('dashboard.load_5m'), value: system.load.load5.toFixed(2) },
        { label: t('dashboard.load_15m'), value: system.load.load15.toFixed(2) },
      ],
    },
    {
      title: t('dashboard.containers'), icon: Container,
      fields: [
        { label: t('dashboard.running'), value: `${containers.running}` },
        { label: t('dashboard.total'), value: `${containers.total}` },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {sections.map((section) => {
        const SIcon = section.icon;
        return (
          <div key={section.title}>
            <div className="flex items-center gap-2 mb-3">
              <SIcon className="size-3.5 text-muted-foreground" />
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{section.title}</h3>
            </div>
            <div className="space-y-3">
              {section.fields.map((f) => (
                <div key={f.label} className="flex items-start justify-between gap-4">
                  <span className="text-sm text-muted-foreground shrink-0">{f.label}</span>
                  <span className={`text-sm text-right truncate max-w-[65%] ${'mono' in f && f.mono ? 'font-mono text-xs' : ''}`}>
                    {f.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Apps tab ──────────────────────────────────────────── */
function AppsTab({ apps, templates, onAppClick }: {
  apps: AppResponse[];
  templates: TemplateSummary[];
  onAppClick?: (app: AppResponse, template?: TemplateSummary) => void;
}) {
  const { t } = useTranslation();

  if (apps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <AppWindow className="size-8 mb-2 opacity-30" />
        <p className="text-sm">{t('dashboard.no_apps')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {apps.map((app) => {
        const tpl = templates.find(t => t.name === app.template);
        return (
          <div
            key={app.id}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => onAppClick?.(app, tpl)}
          >
            <CategoryIcon category={tpl?.category ?? 'vpn'} templateName={app.template} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium capitalize truncate">{app.template}</p>
              <p className="text-xs text-muted-foreground truncate">{app.container_id?.slice(0, 12) ?? '—'}</p>
            </div>
            <StatusIndicator status={app.status} size="sm" />
          </div>
        );
      })}
    </div>
  );
}

/* ── Containers tab ───────────────────────────────────── */
function ContainersTab({ containers }: { containers: Array<{ Id: string; Names: string[]; Image: string; State: string; Status: string }> }) {
  const { t } = useTranslation();

  if (containers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Container className="size-8 mb-2 opacity-30" />
        <p className="text-sm">{t('container.no_containers')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {containers.map((ctr) => {
        const name = ctr.Names?.[0]?.replace(/^\//, '') ?? ctr.Id.slice(0, 12);
        return (
          <div key={ctr.Id} className="flex items-center gap-3 rounded-lg px-3 py-2.5">
            <Container className="size-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{name}</p>
              <p className="text-xs text-muted-foreground truncate">{ctr.Image}</p>
            </div>
            <StatusIndicator status={ctr.State} size="sm" />
          </div>
        );
      })}
    </div>
  );
}
