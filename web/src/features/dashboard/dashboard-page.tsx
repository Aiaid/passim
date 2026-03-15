import { useTranslation } from 'react-i18next';
import { SystemMetrics } from './system-metrics';
import { MetricsChart } from './metrics-chart';
import { AppOverview } from './app-overview';
import { SpeedTest } from '@/features/speedtest/speed-test';
import { EarthGlobe } from './earth-globe';

export function DashboardPage() {
  const { t } = useTranslation();

  return (
    <div className="relative h-[calc(100vh-6.5rem)] overflow-hidden">
      {/* Globe — right-aligned, only left half visible */}
      <div
        className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
        style={{ right: '-28%', width: '70%', height: '120%' }}
      >
        <div className="w-full h-full pointer-events-auto">
          <EarthGlobe transparent />
        </div>
      </div>

      {/* Dashboard content */}
      <div className="relative z-10 flex flex-col gap-4 h-full">
        {/* Row 1: title */}
        <h1 className="text-lg font-semibold">{t('dashboard.title')}</h1>

        {/* Row 2: gauge cards */}
        <SystemMetrics />

        {/* Row 3: chart + side panels (fills remaining height) */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-4 min-h-0">
          <div className="lg:col-span-3 min-h-0">
            <MetricsChart className="h-full" />
          </div>
          <div className="lg:col-span-2 flex flex-col gap-4 min-h-0">
            <SpeedTest />
            <AppOverview className="flex-1 min-h-0" />
          </div>
        </div>
      </div>
    </div>
  );
}
