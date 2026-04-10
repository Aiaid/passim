import { useState } from 'react';
import { Monitor, Globe } from 'lucide-react';
import { SystemMetrics } from './system-metrics';
import { MetricsChart } from './metrics-chart';
import { AppOverview } from './app-overview';
import { RemoteNodesCard } from './remote-nodes-card';
import { SpeedTest } from '@/features/speedtest/speed-test';
import { CompactSpeedTest } from '@/features/speedtest/compact-speed-test';
import { EarthGlobe } from './earth-globe';
import { NodeDetailPanel } from './node-detail-panel';
import { useEventStream } from '@/hooks/use-event-stream';

type DashMode = 'single' | 'multi';

function DashToggle({ mode, onChange }: { mode: DashMode; onChange: (m: DashMode) => void }) {
  return (
    <div className="absolute top-3 right-3 z-20 flex items-center bg-background/60 backdrop-blur-sm rounded-lg border p-0.5 gap-0.5">
      <button
        type="button"
        className={`p-1.5 rounded-md transition-colors ${mode === 'single' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        onClick={() => onChange('single')}
      >
        <Monitor className="size-3.5" />
      </button>
      <button
        type="button"
        className={`p-1.5 rounded-md transition-colors ${mode === 'multi' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        onClick={() => onChange('multi')}
      >
        <Globe className="size-3.5" />
      </button>
    </div>
  );
}

export function DashboardPage() {
  const { nodes } = useEventStream();
  const hasRemoteNodes = nodes && nodes.length > 0;
  const [mode, setMode] = useState<DashMode>(hasRemoteNodes ? 'multi' : 'single');

  if (mode === 'multi' && hasRemoteNodes) {
    return <MultiNodeDashboard toggle={<DashToggle mode={mode} onChange={setMode} />} />;
  }
  return <SingleNodeDashboard toggle={hasRemoteNodes ? <DashToggle mode={mode} onChange={setMode} /> : null} />;
}

/* ── Original single-node layout ───────────────────────────── */
function SingleNodeDashboard({ toggle }: { toggle?: React.ReactNode }) {
  const [nodePanel, setNodePanel] = useState(false);

  return (
    <div className="relative h-[calc(100vh-6.5rem)] overflow-hidden dashboard-glass">
      {toggle}
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

/* ── Multi-node layout ─────────────────────────────────────── */
function MultiNodeDashboard({ toggle }: { toggle?: React.ReactNode }) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  return (
    <div className="relative h-[calc(100vh-6.5rem)] overflow-hidden dashboard-glass">
      {toggle}
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
