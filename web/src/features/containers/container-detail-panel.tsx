import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { X, Play, Square, RotateCcw, Trash2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import type { Container } from '@/lib/api-client';
import { useContainerAction, useRemoveContainer, useContainerLogs } from './queries';
import { mapState } from './container-list';

interface ContainerDetailPanelProps {
  container: Container | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function displayName(container: Container): string {
  return container.Names[0]?.replace(/^\//, '') ?? container.Id.slice(0, 12);
}

export function ContainerDetailPanel({
  container,
  open,
  onOpenChange,
}: ContainerDetailPanelProps) {
  const { t } = useTranslation();
  const [removeOpen, setRemoveOpen] = useState(false);
  const containerAction = useContainerAction();
  const removeContainer = useRemoveContainer();

  if (!container) return null;

  const name = displayName(container);
  const state = mapState(container.State);
  const isRunning = state === 'running';
  const isPending = containerAction.isPending || removeContainer.isPending;

  function handleAction(action: 'start' | 'stop' | 'restart') {
    containerAction.mutate(
      { id: container!.Id, action },
      {
        onSuccess: () => toast.success(t(`container.${action}`) + ': ' + name),
        onError: (error) => toast.error(error.message),
      },
    );
  }

  function handleRemove() {
    removeContainer.mutate(container!.Id, {
      onSuccess: () => {
        toast.success(t('container.remove') + ': ' + name);
        setRemoveOpen(false);
        onOpenChange(false);
      },
      onError: (error) => toast.error(error.message),
    });
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          showCloseButton={false}
          className="sm:max-w-lg w-full flex flex-col p-0 gap-0"
        >
          {/* Header */}
          <SheetHeader className="px-5 py-4 border-b space-y-0">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {isRunning && (
                    <span className="relative flex size-2 shrink-0">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-status-running opacity-75" />
                      <span className="inline-flex size-2 rounded-full bg-status-running" />
                    </span>
                  )}
                  <SheetTitle className="text-base truncate">{name}</SheetTitle>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {container.Image}
                </p>
              </div>
              <div className="flex items-center gap-0.5 shrink-0 ml-3">
                {isRunning ? (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      disabled={isPending}
                      onClick={() => handleAction('stop')}
                      title={t('container.stop')}
                    >
                      <Square className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      disabled={isPending}
                      onClick={() => handleAction('restart')}
                      title={t('container.restart')}
                    >
                      <RotateCcw className="size-3.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      disabled={isPending}
                      onClick={() => handleAction('start')}
                      title={t('container.start')}
                    >
                      <Play className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive hover:text-destructive"
                      disabled={isPending}
                      onClick={() => setRemoveOpen(true)}
                      title={t('container.remove')}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => onOpenChange(false)}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            </div>
          </SheetHeader>

          {/* Tabs */}
          <Tabs defaultValue="info" className="flex-1 flex flex-col overflow-hidden">
            <div className="px-5 pt-3">
              <TabsList className="w-full">
                <TabsTrigger value="info" className="flex-1">
                  {t('container.info')}
                </TabsTrigger>
                <TabsTrigger value="logs" className="flex-1">
                  {t('container.logs')}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="info" className="flex-1 overflow-auto mt-0 px-5 py-4">
              <InfoTab container={container} state={state} />
            </TabsContent>

            <TabsContent value="logs" className="flex-1 overflow-hidden mt-0">
              <LogsTab containerId={container.Id} containerName={name} />
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={t('container.confirm_remove_title')}
        description={t('container.confirm_remove', { name })}
        confirmLabel={t('container.remove')}
        onConfirm={handleRemove}
        destructive
      />
    </>
  );
}

/* ── Info Tab ────────────────────────────────────── */

function InfoTab({ container, state }: { container: Container; state: string }) {
  const { t } = useTranslation();
  const created = new Date(container.Created * 1000);

  const fields = [
    { label: t('container.state'), value: <StatusBadge status={state} /> },
    { label: t('container.status'), value: container.Status },
    { label: t('container.image'), value: container.Image, mono: true },
    { label: t('container.id'), value: container.Id.slice(0, 12), mono: true },
    { label: t('container.created_at'), value: created.toLocaleString() },
  ];

  return (
    <div className="space-y-4">
      {fields.map((f) => (
        <div key={f.label} className="flex items-start justify-between gap-4">
          <span className="text-sm text-muted-foreground shrink-0">{f.label}</span>
          {typeof f.value === 'string' ? (
            <span
              className={`text-sm text-right truncate max-w-[60%] ${f.mono ? 'font-mono' : ''}`}
            >
              {f.value}
            </span>
          ) : (
            f.value
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Logs Tab ────────────────────────────────────── */

function LogsTab({
  containerId,
  containerName,
}: {
  containerId: string;
  containerName: string;
}) {
  const { t } = useTranslation();
  const { data, isLoading, refetch } = useContainerLogs(containerId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const lines = useMemo(() => {
    if (!data?.logs) return [];
    const raw = data.logs.split('\n');
    while (raw.length > 0 && raw[raw.length - 1] === '') raw.pop();
    return raw;
  }, [data?.logs]);

  useEffect(() => {
    if (lines.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [lines]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Terminal chrome */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-[oklch(0.577_0.245_27)]" />
            <span className="size-2.5 rounded-full bg-[oklch(0.75_0.18_80)]" />
            <span className="size-2.5 rounded-full bg-[oklch(0.65_0.2_145)]" />
          </div>
          <span className="text-[11px] text-zinc-500 font-mono ml-1">
            {containerName}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-zinc-400 hover:text-zinc-200"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          <RotateCcw className={`size-3 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Terminal body */}
      <div className="flex-1 min-h-0 bg-zinc-950 overflow-y-auto" ref={scrollRef}>
        <div className="p-3">
          {isLoading ? (
            <p className="text-xs font-mono text-zinc-500 p-2">
              {t('common.loading')}
            </p>
          ) : lines.length === 0 ? (
            <p className="text-xs font-mono text-zinc-500 p-2">
              {t('common.no_data')}
            </p>
          ) : (
            <div className="font-mono text-xs leading-5">
              {lines.map((line, i) => (
                <div
                  key={i}
                  className="flex hover:bg-zinc-900/60 rounded-sm group"
                >
                  <span className="select-none text-right text-zinc-600 w-8 shrink-0 pr-3 group-hover:text-zinc-500">
                    {i + 1}
                  </span>
                  <span className="text-zinc-300 whitespace-pre-wrap break-all flex-1">
                    {line}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
