import { useState } from 'react';
import { SystemMetrics } from './system-metrics';
import { MetricsChart } from './metrics-chart';
import { AppOverview } from './app-overview';
import { SpeedTest } from '@/features/speedtest/speed-test';
import { EarthGlobe } from './earth-globe';
import { NodeDetailPanel } from './node-detail-panel';
import { MultiNodePanel } from './multi-node-panel';
import { AppDetailPanel } from '@/features/apps/app-detail-panel';
import { useEventStream } from '@/hooks/use-event-stream';
import type { AppResponse, TemplateSummary } from '@/lib/api-client';

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

/* ── Multi-node layout: globe hero + left panel ──────────── */
function MultiNodeDashboard() {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedApp, setSelectedApp] = useState<{ app: AppResponse; template?: TemplateSummary } | null>(null);

  return (
    <div className="relative h-[calc(100vh-6.5rem)] overflow-hidden dashboard-glass">
      {/* Globe — full background, centered */}
      <div className="absolute inset-0 dash-globe-enter">
        <EarthGlobe
          scaleFactor={0.32}
          onMarkerClick={(nodeId) => setSelectedNodeId(nodeId)}
        />
      </div>

      {/* Multi-node panel — left overlay */}
      <div className="relative z-10 flex h-full pointer-events-none">
        <div className="pointer-events-auto">
          <MultiNodePanel
            onNodeClick={(nodeId) => setSelectedNodeId(nodeId)}
            onAppClick={(app, template) => setSelectedApp({ app, template })}
          />
        </div>
      </div>

      {/* Node detail side panel */}
      <NodeDetailPanel
        nodeId={selectedNodeId}
        open={!!selectedNodeId}
        onOpenChange={(open) => { if (!open) setSelectedNodeId(null); }}
      />

      {/* App detail side panel */}
      <AppDetailPanel
        app={selectedApp?.app ?? null}
        template={selectedApp?.template}
        open={!!selectedApp}
        onOpenChange={(open) => { if (!open) setSelectedApp(null); }}
      />
    </div>
  );
}
