import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Globe, AppWindow, Plus, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CategoryIcon } from '@/components/shared/category-icon';
import { useEventStream } from '@/hooks/use-event-stream';
import { api, type RemoteNode, type AppResponse, type TemplateSummary } from '@/lib/api-client';
import { cn, formatUptime } from '@/lib/utils';

export interface MultiNodePanelProps {
  onNodeClick?: (nodeId: string) => void;
  onAppClick?: (app: AppResponse, template?: TemplateSummary) => void;
}

function countryFlag(code: string): string {
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

/* ── Metric bar ─────────────────────────────────────────── */
function MetricBar({ label, percent, color }: {
  label: string;
  percent: number;
  color: string;
}) {
  const clamped = Math.min(Math.max(percent, 0), 100);
  const barColor =
    clamped >= 90 ? 'oklch(0.65 0.22 25)' :
    clamped >= 75 ? 'oklch(0.75 0.18 60)' :
    color;

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50 w-7 shrink-0 font-medium">
        {label}
      </span>
      <div className="flex-1 h-1 rounded-full bg-foreground/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${clamped}%`, backgroundColor: barColor }}
        />
      </div>
      <span className="text-[10px] font-semibold tabular-nums text-foreground/50 w-7 text-right">
        {Math.round(clamped)}%
      </span>
    </div>
  );
}

/* ── Local node card ────────────────────────────────────── */
function LocalNodeCard({ onClick }: { onClick?: () => void }) {
  const { t } = useTranslation();
  const { status, metrics } = useEventStream();

  if (!status || !metrics) {
    return <div className="mn-card"><div className="h-24 rounded-lg bg-foreground/5 animate-pulse" /></div>;
  }

  const { node, containers } = status;
  const cpuPercent = metrics.cpu_percent ?? 0;
  const memPercent = (metrics.mem_total ?? 0) > 0
    ? ((metrics.mem_used ?? 0) / metrics.mem_total) * 100 : 0;
  const diskPercent = (metrics.disk_total ?? 0) > 0
    ? ((metrics.disk_used ?? 0) / metrics.disk_total) * 100 : 0;

  return (
    <div className={cn('mn-card', onClick && 'cursor-pointer mn-card-clickable')} onClick={onClick}>
      <div className="flex items-center gap-2 mb-3">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-status-running opacity-75" />
          <span className="inline-flex size-2 rounded-full bg-status-running" />
        </span>
        <span className="text-sm font-semibold truncate">{node.name}</span>
        {node.country && <span className="text-sm">{countryFlag(node.country)}</span>}
        <span className="ml-auto text-[9px] text-muted-foreground/40 uppercase tracking-widest font-medium">
          {t('node.this_server')}
        </span>
      </div>

      <div className="space-y-1.5 mb-3">
        <MetricBar label="CPU" percent={cpuPercent} color="var(--color-chart-1)" />
        <MetricBar label="MEM" percent={memPercent} color="var(--color-chart-2)" />
        <MetricBar label="DSK" percent={diskPercent} color="var(--color-chart-4)" />
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground/40 font-mono">
        <span>{node.public_ip ?? '—'}</span>
        <span>up {formatUptime(node.uptime)}</span>
        <span>{containers.running}/{containers.total} ctrs</span>
      </div>
    </div>
  );
}

/* ── Remote node row ────────────────────────────────────── */
function RemoteNodeRow({ node, expanded, onToggle, onDetail }: {
  node: RemoteNode;
  expanded: boolean;
  onToggle: () => void;
  onDetail?: () => void;
}) {
  const { t } = useTranslation();
  const isConnected = node.status === 'connected';

  return (
    <div className={cn('mn-node-row', expanded && 'mn-node-row-expanded')}>
      <button className="mn-node-row-header" onClick={onToggle} type="button">
        <span className={cn(
          'inline-flex size-1.5 rounded-full shrink-0',
          isConnected ? 'bg-status-running' :
          node.status === 'connecting' ? 'bg-status-deploying' : 'bg-status-stopped'
        )} />
        <span className="text-xs font-medium truncate flex-1 text-left">
          {node.name || node.address}
        </span>
        {node.country && <span className="text-[11px]">{countryFlag(node.country)}</span>}
        {isConnected && node.metrics && (
          <span className="text-[10px] tabular-nums text-muted-foreground/40 font-mono">
            {node.metrics.cpu_percent.toFixed(0)}%
          </span>
        )}
        <ChevronRight className={cn(
          'size-3 text-muted-foreground/25 transition-transform duration-200 shrink-0',
          expanded && 'rotate-90'
        )} />
      </button>

      {expanded && (
        <div className="px-3 pb-2.5 pt-0.5">
          {isConnected && node.metrics ? (
            <div className="space-y-1.5">
              <MetricBar label="CPU" percent={node.metrics.cpu_percent} color="var(--color-chart-1)" />
              <MetricBar label="MEM" percent={node.metrics.memory_percent} color="var(--color-chart-2)" />
              <MetricBar label="DSK" percent={node.metrics.disk_percent} color="var(--color-chart-4)" />
              <div className="flex items-center justify-between text-[10px] text-muted-foreground/35 mt-1.5 pt-1.5 border-t border-border/20">
                <span className="font-mono">{node.address}</span>
                {onDetail && (
                  <button
                    type="button"
                    className="text-[10px] text-primary/60 hover:text-primary transition-colors"
                    onClick={(e) => { e.stopPropagation(); onDetail(); }}
                  >
                    {t('app.view_detail')} →
                  </button>
                )}
                <span>{node.metrics.containers.running}/{node.metrics.containers.total} ctrs</span>
              </div>
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground/25 italic py-1">
              {node.status === 'connecting' ? t('node.connecting') : t('node.disconnected')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Apps deployment matrix ─────────────────────────────── */
function AppsMatrix({ localApps, nodes, onAppClick }: {
  localApps: AppResponse[] | null;
  nodes: RemoteNode[] | null;
  onAppClick?: (app: AppResponse, template?: TemplateSummary) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { status } = useEventStream();

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

  const allNodes = [
    { id: 'local', name: status?.node.name ?? 'Local' },
    ...(nodes ?? []).map(n => ({ id: n.id, name: n.name || n.address })),
  ];

  // Build template → { nodeId → app } map
  const templateMap = new Map<string, Map<string, AppResponse>>();

  (localApps ?? []).forEach(app => {
    if (!templateMap.has(app.template)) templateMap.set(app.template, new Map());
    templateMap.get(app.template)!.set('local', app);
  });

  connectedNodes.forEach((node, i) => {
    const apps = nodeAppQueries[i]?.data;
    if (!apps) return;
    apps.forEach((app: AppResponse) => {
      if (!templateMap.has(app.template)) templateMap.set(app.template, new Map());
      templateMap.get(app.template)!.set(node.id, app);
    });
  });

  const entries = Array.from(templateMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  if (entries.length === 0) {
    return (
      <div className="text-center py-3">
        <AppWindow className="size-4 text-muted-foreground/15 mx-auto mb-1.5" />
        <p className="text-[10px] text-muted-foreground/25">{t('dashboard.no_apps')}</p>
        <Button
          variant="ghost"
          size="sm"
          className="mt-1.5 h-6 text-[10px] text-muted-foreground/35 hover:text-muted-foreground/60"
          onClick={() => navigate('/apps/new')}
        >
          <Plus className="size-2.5 mr-0.5" />
          {t('dashboard.deploy_new')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {entries.map(([templateName, deployments]) => {
        const tpl = templates?.find(t => t.name === templateName);
        // Pick the first deployed instance as the "primary" for the panel
        const primary = Array.from(deployments.values())[0];
        return (
          <div
            key={templateName}
            className={cn(
              'rounded-md px-2 py-1.5 transition-colors',
              onAppClick && primary && 'cursor-pointer hover:bg-foreground/[0.04]'
            )}
            onClick={onAppClick && primary ? () => onAppClick(primary, tpl) : undefined}
          >
            <div className="flex items-center gap-2 mb-1">
              <CategoryIcon category={tpl?.category ?? 'vpn'} templateName={templateName} size="sm" />
              <span className="text-[11px] font-medium capitalize truncate">{templateName}</span>
            </div>
            <div className="flex flex-wrap gap-1 pl-5">
              {allNodes.map(node => {
                const app = deployments.get(node.id);
                const isDeployed = !!app;
                const isRunning = app?.status === 'running';
                return (
                  <span
                    key={node.id}
                    className={cn(
                      'mn-deploy-badge',
                      isDeployed
                        ? isRunning ? 'mn-deploy-running' : 'mn-deploy-other'
                        : 'mn-deploy-none'
                    )}
                  >
                    <span className={cn(
                      'size-1 rounded-full shrink-0',
                      isDeployed
                        ? isRunning ? 'bg-status-running' : 'bg-status-warning'
                        : 'bg-muted-foreground/15'
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
  );
}

/* ── Main panel ─────────────────────────────────────────── */
export function MultiNodePanel({ onNodeClick, onAppClick }: MultiNodePanelProps) {
  const { t } = useTranslation();
  const { apps, nodes } = useEventStream();
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const toggleNode = (id: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="mn-panel">
      <div className="mn-panel-inner">
        {/* Local Node */}
        <LocalNodeCard onClick={onNodeClick ? () => onNodeClick('local') : undefined} />

        {/* Remote Nodes */}
        <div className="mn-section">
          <div className="mn-section-header">
            <Globe className="size-3 text-muted-foreground/35" />
            <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/35">
              {t('node.title')}
            </span>
            <span className="mn-count-badge">{nodes?.length ?? 0}</span>
          </div>
          <div className="space-y-px">
            {nodes?.map(node => (
              <RemoteNodeRow
                key={node.id}
                node={node}
                expanded={expandedNodes.has(node.id)}
                onToggle={() => toggleNode(node.id)}
                onDetail={onNodeClick ? () => onNodeClick(node.id) : undefined}
              />
            ))}
          </div>
        </div>

        {/* Apps Matrix */}
        <div className="mn-section">
          <div className="mn-section-header">
            <AppWindow className="size-3 text-muted-foreground/35" />
            <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/35">
              {t('dashboard.apps')}
            </span>
          </div>
          <AppsMatrix localApps={apps} nodes={nodes} onAppClick={onAppClick} />
        </div>
      </div>
    </div>
  );
}
