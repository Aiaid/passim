import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import { ApiError, type Stack, type StackStatus } from '@/lib/api-client';
import { useDeleteStack, useStack } from './queries';
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

export function StackDetailPanel({ stack, open, onOpenChange }: StackDetailPanelProps) {
  const { t } = useTranslation();

  // Prefer live data from the detail query so status flips in real time;
  // fall back to the list row until the detail request lands.
  const { data: live } = useStack(stack?.id ?? null);
  const s = live ?? stack;

  const deleteStack = useDeleteStack();
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!s) return null;

  const handleDelete = () => {
    deleteStack.mutate(s.id, {
      onSuccess: () => {
        toast.success(t('stacks.delete_queued'));
        onOpenChange(false);
      },
      onError: (err) => {
        const apiErr = err as ApiError;
        toast.error(apiErr.message || t('common.error'));
      },
    });
    setConfirmDelete(false);
  };

  const canDelete = s.status !== 'deploying' && s.status !== 'tearing_down';

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
              disabled={!canDelete || deleteStack.isPending}
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
