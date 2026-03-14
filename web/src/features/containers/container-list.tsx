import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { cn } from '@/lib/utils';
import type { Container } from '@/lib/api-client';
import { ContainerActions } from './container-actions';
import { ContainerDetailPanel } from './container-detail-panel';

interface ContainerListProps {
  containers: Container[];
}

function mapState(state: string): string {
  if (state === 'exited') return 'stopped';
  return state;
}

function displayName(container: Container): string {
  return container.Names[0]?.replace(/^\//, '') ?? container.Id.slice(0, 12);
}

const borderColor: Record<string, string> = {
  running: 'border-l-status-running',
  stopped: 'border-l-status-stopped',
  failed: 'border-l-status-failed',
  deploying: 'border-l-status-deploying',
};

export function ContainerList({ containers }: ContainerListProps) {
  const [selected, setSelected] = useState<Container | null>(null);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {containers.map((container) => {
          const name = displayName(container);
          const state = mapState(container.State);

          return (
            <Card
              key={container.Id}
              className={cn(
                'overflow-hidden transition-all hover:shadow-md border-l-[3px] cursor-pointer',
                borderColor[state] || 'border-l-status-stopped',
              )}
              onClick={() => setSelected(container)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {state === 'running' && (
                        <span className="relative flex size-2 shrink-0">
                          <span className="absolute inline-flex size-full animate-ping rounded-full bg-status-running opacity-75" />
                          <span className="inline-flex size-2 rounded-full bg-status-running" />
                        </span>
                      )}
                      <h3 className="text-sm font-medium truncate">{name}</h3>
                    </div>
                    <p
                      className="mt-1 text-xs text-muted-foreground truncate"
                      title={container.Image}
                    >
                      {container.Image}
                    </p>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <ContainerActions container={container} />
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <StatusBadge status={state} />
                  <span className="text-xs text-muted-foreground">
                    {container.Status}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <ContainerDetailPanel
        container={selected}
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </>
  );
}
