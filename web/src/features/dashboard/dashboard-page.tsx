import { useState } from 'react';
import { SystemMetrics } from './system-metrics';
import { MetricsChart } from './metrics-chart';
import { AppOverview } from './app-overview';
import { RemoteNodesCard } from './remote-nodes-card';
import { SpeedTest } from '@/features/speedtest/speed-test';
import { CompactSpeedTest } from '@/features/speedtest/compact-speed-test';
import { EarthGlobe } from './earth-globe';
import { NodeDetailPanel } from './node-detail-panel';
import { useEventStream } from '@/hooks/use-event-stream';

export function DashboardPage() {
  const { nodes } = useEventStream();
  const hasRemoteNodes = nodes && nodes.length > 0;

  if (hasRemoteNodes) {
    return <MultiNodeDashboard />;
  }

  return <SingleNodeDashboard />;
}

/* ── Original single-node layout (unchanged) ─────────────── */
function SingleNodeDashboard() {
  const [nodePanel, setNodePanel] = useState(false);

  return (
    <div className="relative h-[calc(100vh-6.5rem)] overflow-hidden dashboard-glass">
      <div className="absolute inset-0 dash-globe-enter dash-globe-position">
        <EarthGlobe onMarkerClick={() => setNodePanel(true)} />
      </div>

      <div className="relative z-10 flex h-full pointer-events-none">
        <div className="w-[54%] shrink-0 flex flex-col gap-3 pointer-events-auto dash-row-stagger">
          <SystemMetrics />
          <MetricsChart className="flex-1 min-h-0" />
          <div className="grid grid-cols-2 gap-3">
            <SpeedTest />
            <AppOverview />
          </div>
        </div>
      </div>

      <NodeDetailPanel open={nodePanel} onOpenChange={setNodePanel} />
    </div>
  );
}

/* ── Multi-node layout: same structure, different cards ──── */
function MultiNodeDashboard() {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  return (
    <div className="relative h-[calc(100vh-6.5rem)] overflow-hidden dashboard-glass">
      <div className="absolute inset-0 dash-globe-enter dash-globe-position">
        <EarthGlobe onMarkerClick={(nodeId) => setSelectedNodeId(nodeId)} />
      </div>

      <div className="relative z-10 flex h-full pointer-events-none">
        <div className="w-[54%] shrink-0 flex flex-col gap-3 pointer-events-auto dash-row-stagger">
          <SystemMetrics />
          <CompactSpeedTest />
          <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
            <RemoteNodesCard onNodeClick={(nodeId) => setSelectedNodeId(nodeId)} />
            <AppOverview />
          </div>
        </div>
      </div>

      <NodeDetailPanel
        nodeId={selectedNodeId}
        open={!!selectedNodeId}
        onOpenChange={(open) => { if (!open) setSelectedNodeId(null); }}
      />
    </div>
  );
}
