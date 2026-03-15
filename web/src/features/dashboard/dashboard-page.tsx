import { useState } from 'react';
import { SystemMetrics } from './system-metrics';
import { MetricsChart } from './metrics-chart';
import { AppOverview } from './app-overview';
import { SpeedTest } from '@/features/speedtest/speed-test';
import { EarthGlobe } from './earth-globe';
import { NodeDetailPanel } from './node-detail-panel';

export function DashboardPage() {
  const [nodePanel, setNodePanel] = useState(false);

  return (
    <div className="relative h-[calc(100vh-6.5rem)] overflow-hidden dashboard-glass">
      {/* Full-screen space background: stars + globe (always dark) */}
      <div className="absolute inset-y-0 right-0 dash-globe-enter dash-globe-position">
        <EarthGlobe
          onMarkerClick={() => setNodePanel(true)}
        />
      </div>

      {/* Light-mode veil: fades from solid background → transparent, revealing space on the right */}
      <div className="absolute inset-0 z-[1] pointer-events-none dash-space-veil" />

      {/* Panels on the left — glass over space background */}
      <div className="relative z-10 flex h-full pointer-events-none">
        <div className="w-[54%] shrink-0 flex flex-col gap-3 pointer-events-auto dash-row-stagger">
          {/* Row 1: gauge cards */}
          <SystemMetrics />

          {/* Row 2: chart */}
          <MetricsChart className="flex-1 min-h-0" />

          {/* Row 3: speed test + apps side by side */}
          <div className="grid grid-cols-2 gap-3">
            <SpeedTest />
            <AppOverview />
          </div>
        </div>
      </div>

      {/* Node detail side panel */}
      <NodeDetailPanel open={nodePanel} onOpenChange={setNodePanel} />
    </div>
  );
}
