import { useTranslation } from 'react-i18next';
import { Cpu, MemoryStick, HardDrive, Network } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useMetricsStream } from '@/hooks/use-metrics-stream';
import { formatBytes } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface GaugeCardProps {
  label: string;
  percent: number;
  detail: string;
  icon: LucideIcon;
  color: string;
}

function GaugeCard({ label, percent, detail, icon: Icon, color }: GaugeCardProps) {
  const r = 38;
  const circ = 2 * Math.PI * r;
  const clamped = Math.min(Math.max(percent, 0), 100);
  const offset = circ - (clamped / 100) * circ;
  const strokeColor =
    clamped >= 90
      ? 'oklch(0.577 0.245 27)'
      : clamped >= 75
        ? 'oklch(0.75 0.18 60)'
        : color;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <div className="relative size-16 shrink-0">
            {/* Colored glow behind gauge */}
            <div
              className="absolute inset-1 rounded-full blur-xl opacity-20"
              style={{ backgroundColor: strokeColor }}
            />
            <svg viewBox="0 0 100 100" className="size-full -rotate-90 relative">
              <circle
                cx="50"
                cy="50"
                r={r}
                fill="none"
                className="stroke-muted/30"
                strokeWidth="5"
              />
              <circle
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke={strokeColor}
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={circ}
                strokeDashoffset={offset}
                style={{
                  transition:
                    'stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1), stroke 0.3s',
                  filter: `drop-shadow(0 0 5px ${strokeColor})`,
                }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-bold tabular-nums">
                {Math.round(clamped)}
                <span className="text-[10px] text-muted-foreground">%</span>
              </span>
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Icon className="size-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {label}
              </span>
            </div>
            <p className="mt-1 text-sm font-medium">{detail}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function SystemMetrics() {
  const { t } = useTranslation();
  const { latest, isConnected } = useMetricsStream();

  if (!isConnected || !latest) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="size-16 rounded-full bg-muted animate-pulse" />
                <div className="space-y-2 flex-1">
                  <div className="h-3 w-12 bg-muted animate-pulse rounded" />
                  <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const cpuPercent = latest.cpu_percent ?? 0;
  const memPercent =
    (latest.mem_total ?? 0) > 0
      ? ((latest.mem_used ?? 0) / latest.mem_total) * 100
      : 0;
  const diskPercent =
    (latest.disk_total ?? 0) > 0
      ? ((latest.disk_used ?? 0) / latest.disk_total) * 100
      : 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 dash-stagger">
      <GaugeCard
        label={t('dashboard.cpu')}
        percent={cpuPercent}
        detail={`${cpuPercent.toFixed(1)}%`}
        icon={Cpu}
        color="var(--color-chart-1)"
      />
      <GaugeCard
        label={t('dashboard.memory')}
        percent={memPercent}
        detail={`${formatBytes(latest.mem_used ?? 0)} / ${formatBytes(latest.mem_total ?? 0)}`}
        icon={MemoryStick}
        color="var(--color-chart-2)"
      />
      <GaugeCard
        label={t('dashboard.disk')}
        percent={diskPercent}
        detail={`${formatBytes(latest.disk_used ?? 0)} / ${formatBytes(latest.disk_total ?? 0)}`}
        icon={HardDrive}
        color="var(--color-chart-4)"
      />
      <Card>
        <CardContent className="p-4 h-full flex flex-col justify-center">
          <div className="flex items-center gap-1.5 mb-3">
            <Network className="size-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t('dashboard.network')}
            </span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">↓ RX</span>
              <span className="text-sm font-bold tabular-nums">
                {formatBytes(latest.net_bytes_recv ?? 0)}/s
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">↑ TX</span>
              <span className="text-sm font-bold tabular-nums">
                {formatBytes(latest.net_bytes_sent ?? 0)}/s
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
