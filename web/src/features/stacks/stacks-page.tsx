import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Layers, Plus } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { CardGridSkeleton } from '@/components/shared/loading-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { cn } from '@/lib/utils';
import type { Stack, StackStatus } from '@/lib/api-client';
import { useStacks } from './queries';
import { StackCreateDialog } from './stack-create-dialog';
import { StackDetailPanel } from './stack-detail-panel';

// Map stack status to the existing StatusBadge vocabulary.
function badgeStatus(s: StackStatus): string {
  switch (s) {
    case 'running': return 'running';
    case 'deploying': return 'deploying';
    case 'tearing_down': return 'deploying';
    case 'error': return 'failed';
    case 'stopped': return 'stopped';
  }
}

const borderColor: Record<StackStatus, string> = {
  running: 'border-l-status-running',
  stopped: 'border-l-status-stopped',
  error: 'border-l-status-failed',
  deploying: 'border-l-status-deploying',
  tearing_down: 'border-l-status-deploying',
};

export function StacksPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useStacks();
  const stacks = data?.stacks ?? [];

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? stacks.find((s) => s.id === selectedId) ?? null : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('stacks.title')}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            {t('stacks.new')}
          </Button>
        }
      />

      {isLoading ? (
        <CardGridSkeleton />
      ) : stacks.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={t('stacks.empty_title')}
          description={t('stacks.empty_desc')}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stacks.map((stack) => (
            <StackCard
              key={stack.id}
              stack={stack}
              onClick={() => setSelectedId(stack.id)}
            />
          ))}
        </div>
      )}

      <StackCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      <StackDetailPanel
        stack={selected}
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />
    </div>
  );
}

interface StackCardProps {
  stack: Stack;
  onClick: () => void;
}

function StackCard({ stack, onClick }: StackCardProps) {
  const { t } = useTranslation();
  return (
    <Card
      className={cn(
        'overflow-hidden transition-all hover:shadow-md border-l-[3px] cursor-pointer',
        borderColor[stack.status],
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {stack.status === 'running' && (
                <span className="relative flex size-2 shrink-0">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-status-running opacity-75" />
                  <span className="inline-flex size-2 rounded-full bg-status-running" />
                </span>
              )}
              <h3 className="text-sm font-medium truncate">{stack.name}</h3>
            </div>
            {stack.last_error && stack.status === 'error' && (
              <p className="mt-1 text-xs text-destructive truncate" title={stack.last_error}>
                {stack.last_error}
              </p>
            )}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <StatusBadge status={badgeStatus(stack.status)} />
          <span className="text-xs text-muted-foreground">
            {t('stacks.updated_at', { time: new Date(stack.updated_at).toLocaleString() })}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
