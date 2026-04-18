import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { X, Play, Square, RotateCcw, Trash2 } from 'lucide-react';
import { Terminal, useTerminal } from '@wterm/react';
import '@wterm/react/css';
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
import { useContainerAction, useRemoveContainer, useNodeContainerAction, useNodeRemoveContainer, useNodeContainerLogs } from './queries';
import { mapState } from './utils';
import { TerminalTab } from './terminal-tab';

// ANSI: erase screen + move cursor home. Used to clear the terminal on refresh.
const CLEAR_SCREEN = '\x1b[2J\x1b[H';

function decodeBase64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

interface ContainerDetailPanelProps {
  container: Container | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId?: string;
}

function displayName(container: Container): string {
  return container.Names[0]?.replace(/^\//, '') ?? container.Id.slice(0, 12);
}

export function ContainerDetailPanel({
  container,
  open,
  onOpenChange,
  nodeId,
}: ContainerDetailPanelProps) {
  const { t } = useTranslation();
  const [removeOpen, setRemoveOpen] = useState(false);
  const localContainerAction = useContainerAction();
  const nodeContainerAction = useNodeContainerAction(nodeId ?? '');
  const localRemoveContainer = useRemoveContainer();
  const nodeRemoveContainer = useNodeRemoveContainer(nodeId ?? '');
  const containerAction = nodeId ? nodeContainerAction : localContainerAction;
  const removeContainer = nodeId ? nodeRemoveContainer : localRemoveContainer;

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
                <TabsTrigger value="terminal" className="flex-1" disabled={!isRunning || !!nodeId}>
                  {t('container.terminal')}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="info" className="flex-1 overflow-auto mt-0 px-5 py-4">
              <InfoTab container={container} state={state} />
            </TabsContent>

            <TabsContent value="logs" className="flex-1 overflow-hidden mt-0">
              <LogsTab containerId={container.Id} containerName={name} nodeId={nodeId} />
            </TabsContent>

            <TabsContent value="terminal" className="flex-1 overflow-hidden mt-0">
              <TerminalTab containerId={container.Id} containerName={name} />
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
  nodeId,
}: {
  containerId: string;
  containerName: string;
  nodeId?: string;
}) {
  return nodeId ? (
    <NodeLogsView nodeId={nodeId} containerId={containerId} containerName={containerName} />
  ) : (
    <LocalLogsView containerId={containerId} containerName={containerName} />
  );
}

/**
 * Local container logs: open an SSE `?follow=1` stream, decode base64 chunks,
 * and pipe them into a readonly wterm terminal so ANSI colors, selection,
 * and browser find work out of the box.
 */
export function LocalLogsView({ containerId, containerName }: { containerId: string; containerName: string }) {
  const { ref, write } = useTerminal();
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    // Clear previous session visuals when reconnecting.
    write(CLEAR_SCREEN);

    const token = localStorage.getItem('auth-token') ?? '';
    const url = `/api/containers/${containerId}/logs?follow=1&lines=200&token=${encodeURIComponent(token)}`;
    const source = new EventSource(url);

    source.onopen = () => setStatus('connected');
    source.addEventListener('log', ((e: MessageEvent) => {
      try {
        write(decodeBase64ToBytes(e.data));
      } catch {
        /* ignore malformed frame */
      }
    }) as EventListener);
    source.onerror = () => setStatus('disconnected');

    return () => source.close();
  }, [containerId, reloadNonce, write]);

  const handleRefresh = () => {
    setStatus('connecting');
    setReloadNonce((n) => n + 1);
  };

  return (
    <LogsChrome
      containerName={containerName}
      onRefresh={handleRefresh}
      refreshDisabled={status === 'connecting'}
    >
      <Terminal ref={ref} autoResize className="h-full w-full" />
    </LogsChrome>
  );
}

/**
 * Remote node logs: the proxy layer is currently non-streaming, so we
 * one-shot the existing JSON endpoint and pipe the result into wterm so the
 * visual is consistent with local logs (ANSI colors, selection, find).
 */
function NodeLogsView({
  nodeId,
  containerId,
  containerName,
}: {
  nodeId: string;
  containerId: string;
  containerName: string;
}) {
  const { ref, write } = useTerminal();
  const { data, isLoading, refetch } = useNodeContainerLogs(nodeId, containerId);

  useEffect(() => {
    if (!data?.logs) return;
    write(CLEAR_SCREEN);
    write(data.logs);
  }, [data, write]);

  return (
    <LogsChrome
      containerName={containerName}
      onRefresh={() => refetch()}
      refreshDisabled={isLoading}
      refreshing={isLoading}
    >
      <Terminal ref={ref} autoResize className="h-full w-full" />
    </LogsChrome>
  );
}

function LogsChrome({
  containerName,
  onRefresh,
  refreshDisabled,
  refreshing,
  children,
}: {
  containerName: string;
  onRefresh: () => void;
  refreshDisabled?: boolean;
  refreshing?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
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
          onClick={onRefresh}
          disabled={refreshDisabled}
        >
          <RotateCcw className={`size-3 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      <div className="flex-1 min-h-0 bg-zinc-950">{children}</div>
    </div>
  );
}
