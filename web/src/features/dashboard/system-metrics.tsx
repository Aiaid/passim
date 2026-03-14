import { useTranslation } from 'react-i18next';
import { Cpu, MemoryStick, HardDrive, Network } from 'lucide-react';
import { MetricCard } from '@/components/shared/metric-card';
import { useMetricsStream } from '@/hooks/use-metrics-stream';
import { formatBytes } from '@/lib/utils';

export function SystemMetrics() {
  const { t } = useTranslation();
  const { latest, isConnected } = useMetricsStream();

  if (!isConnected || !latest) {
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
        value={(latest.cpu_percent ?? 0).toFixed(1)}
        unit="%"
        icon={Cpu}
      />
      <MetricCard
        label={t('dashboard.memory')}
        value={formatBytes(latest.mem_used ?? 0)}
        unit={`/ ${formatBytes(latest.mem_total ?? 0)}`}
        icon={MemoryStick}
      />
      <MetricCard
        label={t('dashboard.disk')}
        value={formatBytes(latest.disk_used ?? 0)}
        unit={`/ ${formatBytes(latest.disk_total ?? 0)}`}
        icon={HardDrive}
      />
      <MetricCard
        label={t('dashboard.network')}
        value={`↓${formatBytes(latest.net_bytes_recv ?? 0)}/s`}
        unit={`↑${formatBytes(latest.net_bytes_sent ?? 0)}/s`}
        icon={Network}
      />
    </div>
  );
}
