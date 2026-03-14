import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/layout/page-header';
import { SystemMetrics } from './system-metrics';
import { MetricsChart } from './metrics-chart';
import { AppOverview } from './app-overview';
import { SpeedTest } from '@/features/speedtest/speed-test';

export function DashboardPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <PageHeader title={t('dashboard.title')} />
      <SystemMetrics />
      <MetricsChart />
      <div className="grid gap-6 lg:grid-cols-2">
        <SpeedTest />
        <AppOverview />
      </div>
    </div>
  );
}
