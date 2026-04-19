import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Trash2, Play, Square, RotateCcw } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import { ApiError, type Stack, type StackStatus, type StackService } from '@/lib/api-client';
import { useDeleteStack, useStack, useStackAction } from './queries';
import { useState } from 'react';

interface StackDetailPanelProps {
  stack: Stack | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function badgeStatus(s: StackStatus): string {
  switch (s) {
    case 'running': return 'running';
    case 'deploying': return 'deploying';
    case 'tearing_down': return 'deploying';
    case 'error': return 'failed';
    case 'stopped': return 'stopped';
  }
}

// Service container state → StatusBadge vocabulary.
function serviceBadgeStatus(state?: string): string {
  switch (state) {
    case 'running': return 'running';
    case 'exited': return 'stopped';
    case 'dead': return 'failed';
    case 'created': return 'deploying';
    case 'restarting': return 'deploying';
    default: return 'stopped';
  }
}

export function StackDetailPanel({ stack, open, onOpenChange }: StackDetailPanelProps) {
  const { t } = useTranslation();

  // Prefer live data from the detail query so status flips in real time;
  // fall back to the list row until the detail request lands.
  const { data: live } = useStack(stack?.id ?? null);
  const s = live ?? stack;

  const deleteStack = useDeleteStack();
  const action = useStackAction();
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!s) return null;

  const handleDelete = () => {
    deleteStack.mutate(
      { id: s.id },
      {
        onSuccess: () => {
          toast.success(t('stacks.delete_queued'));
          onOpenChange(false);
        },
        onError: (err) => {
          const apiErr = err as ApiError;
          toast.error(apiErr.message || t('common.error'));
        },
      },
    );
    setConfirmDelete(false);
  };

  const handleAction = (kind: 'up' | 'down' | 'restart') => {
    action.mutate(
      { id: s.id, action: kind },
      {
        onSuccess: () => toast.success(t(`stacks.${kind}_queued`)),
        onError: (err) => {
          const apiErr = err as ApiError;
          const translated =
            apiErr.code && t(`stacks.error.${apiErr.code}`, { defaultValue: '' });
          toast.error(translated || apiErr.message || t('common.error'));
        },
      },
    );
  };

  const busy =
    s.status === 'deploying' ||
    s.status === 'tearing_down' ||
    action.isPending ||
    deleteStack.isPending;
  const canUp = !busy && (s.status === 'stopped' || s.status === 'error');
  const canDown = !busy && s.status === 'running';
  const canRestart = !busy && (s.status === 'running' || s.status === 'error');
  const canDelete = !busy;
  const services = s.services ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-3">
            <SheetTitle>{s.name}</SheetTitle>
            <StatusBadge status={badgeStatus(s.status)} />
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-6 px-4 pb-6">
          {s.last_error && s.status === 'error' && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <p className="font-medium text-destructive">{t('stacks.last_error')}</p>
              <p className="mt-1 text-xs text-muted-foreground font-mono whitespace-pre-wrap">
                {s.last_error}
              </p>
            </div>
          )}

          {/* Lifecycle actions */}
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={!canUp} onClick={() => handleAction('up')}>
              <Play className="size-4" />
              {t('stacks.action_up')}
            </Button>
            <Button size="sm" variant="outline" disabled={!canDown} onClick={() => handleAction('down')}>
              <Square className="size-4" />
              {t('stacks.action_down')}
            </Button>
            <Button size="sm" variant="outline" disabled={!canRestart} onClick={() => handleAction('restart')}>
              <RotateCcw className="size-4" />
              {t('stacks.action_restart')}
            </Button>
          </div>

          {/* Services */}
          {services.length > 0 && (
            <section>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                {t('stacks.services')}
              </h3>
              <div className="rounded-md border divide-y">
                {services.map((svc) => (
                  <ServiceRow key={svc.name} service={svc} />
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t('stacks.yaml')}
            </h3>
            <pre className="mt-2 max-h-96 overflow-auto rounded-md border bg-muted/30 p-3 text-xs font-mono whitespace-pre-wrap">
              {s.yaml_text}
            </pre>
          </section>

          {s.env_text && (
            <section>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t('stacks.env')}
              </h3>
              <pre className="mt-2 max-h-48 overflow-auto rounded-md border bg-muted/30 p-3 text-xs font-mono whitespace-pre-wrap">
                {s.env_text}
              </pre>
            </section>
          )}

          <section className="flex items-center justify-between border-t pt-4">
            <span className="text-xs text-muted-foreground">
              {t('stacks.updated_at', { time: new Date(s.updated_at).toLocaleString() })}
            </span>
            <Button
              variant="destructive"
              size="sm"
              disabled={!canDelete}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4" />
              {t('stacks.delete')}
            </Button>
          </section>
        </div>

        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={t('stacks.delete_confirm_title')}
          description={t('stacks.delete_confirm_desc', { name: s.name })}
          confirmLabel={t('stacks.delete')}
          onConfirm={handleDelete}
          destructive
        />
      </SheetContent>
    </Sheet>
  );
}

function ServiceRow({ service }: { service: StackService }) {
  return (
    <div className="flex items-center gap-3 p-3 text-sm">
      <StatusBadge status={serviceBadgeStatus(service.state)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{service.name}</span>
          {service.health && <HealthDot health={service.health} />}
        </div>
        {service.image && (
          <div className="text-xs text-muted-foreground truncate">{service.image}</div>
        )}
        {service.status && (
          <div className="text-xs text-muted-foreground truncate">{service.status}</div>
        )}
      </div>
      {service.ports && service.ports.length > 0 && (
        <div className="text-xs font-mono text-muted-foreground text-right shrink-0">
          {service.ports.map((p) => (
            <div key={p}>{p}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function HealthDot({ health }: { health: string }) {
  const color =
    health === 'healthy' ? 'bg-status-running'
    : health === 'unhealthy' ? 'bg-status-failed'
    : 'bg-status-deploying';
  return (
    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
      <span className={`size-1.5 rounded-full ${color}`} />
      {health}
    </span>
  );
}
