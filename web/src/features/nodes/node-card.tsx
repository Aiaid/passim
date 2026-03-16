import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { RemoteNode } from '@/lib/api-client';

const NODE_GRADIENT = 'linear-gradient(135deg, oklch(0.55 0.2 270), oklch(0.55 0.15 230))';

const statusConfig: Record<string, { dot: string; label: string; animate: boolean }> = {
  connected: {
    dot: 'bg-[oklch(0.65_0.2_145)]',
    label: 'node.connected',
    animate: true,
  },
  disconnected: {
    dot: 'bg-zinc-400 dark:bg-zinc-600',
    label: 'node.disconnected',
    animate: false,
  },
  connecting: {
    dot: 'bg-[oklch(0.65_0.2_250)]',
    label: 'node.connecting',
    animate: true,
  },
};

function MiniBar({ percent, className }: { percent: number; className?: string }) {
  return (
    <div className={cn('h-1.5 w-full rounded-full bg-muted', className)}>
      <div
        className="h-full rounded-full bg-foreground/40 transition-all duration-300"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

interface NodeCardProps {
  node: RemoteNode;
}

export function NodeCard({ node }: NodeCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const config = statusConfig[node.status] || statusConfig.disconnected;

  return (
    <Card
      className="cursor-pointer overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
      onClick={() => navigate(`/nodes/${node.id}`)}
    >
      <div
        className="h-[3px] w-full"
        style={{ background: NODE_GRADIENT }}
      />
      <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-semibold truncate">
              {node.name || node.address}
            </CardTitle>
            {node.country && (
              <span className="text-sm shrink-0">
                {countryFlag(node.country)}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground truncate">
            {node.address}
          </p>
        </div>
        {/* Status indicator */}
        <span className="inline-flex items-center gap-1.5 shrink-0">
          <span className="relative inline-flex">
            <span className={cn('size-2 rounded-full', config.dot)} />
            {config.animate && (
              <span
                className={cn('absolute inset-0 rounded-full', config.dot, 'opacity-60')}
                style={{ animation: 'status-pulse 2s ease-in-out infinite' }}
              />
            )}
          </span>
          <span className="text-xs text-muted-foreground">{t(config.label)}</span>
        </span>
      </CardHeader>
      <CardContent className="pt-0">
        {node.metrics ? (
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="flex-1">
                <div className="flex justify-between mb-0.5">
                  <span>CPU</span>
                  <span>{node.metrics.cpu_percent.toFixed(0)}%</span>
                </div>
                <MiniBar percent={node.metrics.cpu_percent} />
              </div>
              <div className="flex-1">
                <div className="flex justify-between mb-0.5">
                  <span>MEM</span>
                  <span>{node.metrics.memory_percent.toFixed(0)}%</span>
                </div>
                <MiniBar percent={node.metrics.memory_percent} />
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {node.metrics.containers.running}/{node.metrics.containers.total} containers
              </span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">--</p>
        )}
      </CardContent>
    </Card>
  );
}

function countryFlag(code: string): string {
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}
