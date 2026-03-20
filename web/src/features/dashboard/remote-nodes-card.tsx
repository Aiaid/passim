import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Globe, Zap, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { useEventStream } from '@/hooks/use-event-stream';
import { cn } from '@/lib/utils';
import { api, type RemoteNode } from '@/lib/api-client';

function countryFlag(code: string): string {
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

interface SpeedResult {
  download: number;
  upload: number;
  latency: number;
  jitter: number;
}

function MetricBar({ value, color }: { value: number; color: string }) {
  const clamped = Math.min(Math.max(value, 0), 100);
  return (
    <div className="h-1 w-full rounded-full bg-muted/50 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{
          width: `${clamped}%`,
          backgroundColor: clamped >= 90 ? 'oklch(0.577 0.245 27)' : clamped >= 75 ? 'oklch(0.75 0.18 60)' : color,
        }}
      />
    </div>
  );
}

function NodeRow({ node, onClick }: { node: RemoteNode; onClick?: () => void }) {
  const isConnected = node.status === 'connected';
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<SpeedResult | null>(() => {
    try {
      const raw = localStorage.getItem(`node-speedtest-${node.id}`);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });

  const runTest = async () => {
    setTesting(true);
    try {
      const res = await api.runNodeSpeedTest(node.id);
      setResult(res);
      localStorage.setItem(`node-speedtest-${node.id}`, JSON.stringify(res));
    } catch {
      // silently fail
    } finally {
      setTesting(false);
    }
  };

  const m = node.metrics;

  return (
    <div className="rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50">
      <div
        className={cn('flex items-center gap-2.5', onClick && 'cursor-pointer')}
        onClick={onClick}
      >
        <span
          className={cn(
            'inline-flex size-2 rounded-full shrink-0',
            isConnected ? 'bg-status-running' :
            node.status === 'connecting' ? 'bg-status-deploying' : 'bg-status-stopped',
          )}
        />
        <span className="text-sm font-medium truncate flex-1 min-w-0">
          {node.name || node.address}
        </span>
        {node.country && <span className="text-sm">{countryFlag(node.country)}</span>}
        {isConnected && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 shrink-0"
            disabled={testing}
            onClick={(e) => { e.stopPropagation(); runTest(); }}
          >
            {testing ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Zap className="size-3" />
            )}
          </Button>
        )}
      </div>
      {/* Metrics bars */}
      {isConnected && m && (
        <div className="mt-1.5 pl-[18px] space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-6 shrink-0">CPU</span>
            <MetricBar value={m.cpu_percent} color="var(--color-chart-1)" />
            <span className="text-[10px] text-muted-foreground tabular-nums w-7 text-right">{m.cpu_percent.toFixed(0)}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-6 shrink-0">MEM</span>
            <MetricBar value={m.memory_percent} color="var(--color-chart-2)" />
            <span className="text-[10px] text-muted-foreground tabular-nums w-7 text-right">{m.memory_percent.toFixed(0)}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-6 shrink-0">DISK</span>
            <MetricBar value={m.disk_percent} color="var(--color-chart-4)" />
            <span className="text-[10px] text-muted-foreground tabular-nums w-7 text-right">{m.disk_percent.toFixed(0)}%</span>
          </div>
        </div>
      )}
      {result && (
        <div className="flex items-center gap-3 mt-1 pl-[18px] text-[10px] text-muted-foreground tabular-nums">
          <span>↓ {result.download.toFixed(0)} Mbps</span>
          <span>↑ {result.upload.toFixed(0)} Mbps</span>
          <span>{result.latency.toFixed(1)} ms</span>
          <span>±{result.jitter.toFixed(1)} ms</span>
        </div>
      )}
    </div>
  );
}

export function RemoteNodesCard({ className, onNodeClick }: {
  className?: string;
  onNodeClick?: (nodeId: string) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { nodes } = useEventStream();
  const isLoading = nodes === null;

  return (
    <Card className={cn('flex flex-col overflow-hidden', className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-2 shrink-0">
        <CardTitle className="text-base font-medium">
          {t('node.title')}
        </CardTitle>
        <span className="text-sm text-muted-foreground">
          {nodes?.length ?? 0}
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
          ) : !nodes || nodes.length === 0 ? (
            <EmptyState
              icon={Globe}
              title={t('node.no_nodes')}
              description={t('node.no_nodes_desc')}
              actionLabel={t('node.add')}
              onAction={() => navigate('/nodes')}
            />
          ) : (
            <div className="space-y-0.5">
              {nodes.map((node) => (
                <NodeRow
                  key={node.id}
                  node={node}
                  onClick={() => onNodeClick?.(node.id)}
                />
              ))}
            </div>
          )}
        </div>
        <div className="mt-2 pt-2 border-t shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => navigate('/nodes')}
          >
            {t('node.add')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
