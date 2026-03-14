import { useTranslation } from 'react-i18next';
import { Cpu, MemoryStick, HardDrive, Network } from 'lucide-react';
import { MetricCard } from '@/components/shared/metric-card';
import { useMetricsStream } from '@/hooks/use-metrics-stream';
import { formatBytes } from '@/lib/utils';
import { useStatus } from './queries';

export function SystemMetrics() {
  const { t } = useTranslation();
  const { latest, isConnected } = useMetricsStream();
  const { data: status } = useStatus();

  // Prefer real-time SSE data, fall back to polling status
  const metrics = isConnected && latest ? latest : status;

  if (!metrics) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <MetricCard key={i} label="--" value="--" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        label={t('dashboard.cpu')}
        value={(metrics.cpu_percent ?? 0).toFixed(1)}
        unit="%"
        icon={Cpu}
      />
      <MetricCard
        label={t('dashboard.memory')}
        value={formatBytes(metrics.memory_used ?? 0)}
        unit={`/ ${formatBytes(metrics.memory_total ?? 0)}`}
        icon={MemoryStick}
      />
      <MetricCard
        label={t('dashboard.disk')}
        value={formatBytes(metrics.disk_used ?? 0)}
        unit={`/ ${formatBytes(metrics.disk_total ?? 0)}`}
        icon={HardDrive}
      />
      <MetricCard
        label={t('dashboard.network')}
        value={`↓${formatBytes(metrics.net_rx ?? 0)}/s`}
        unit={`↑${formatBytes(metrics.net_tx ?? 0)}/s`}
        icon={Network}
      />
    </div>
  );
}
