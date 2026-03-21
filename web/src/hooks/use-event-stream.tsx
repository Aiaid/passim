import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import i18next from 'i18next';
import { useAuthStore } from '@/stores/auth-store';
import type { StatusResponse, Container, AppResponse, RemoteNode } from '@/lib/api-client';

export interface MetricsData {
  cpu_percent: number;
  mem_used: number;
  mem_total: number;
  disk_used: number;
  disk_total: number;
  net_bytes_sent: number;
  net_bytes_recv: number;
}

const BUFFER_SIZE = 60; // 5 minutes at 5s intervals

interface EventStreamValue {
  metrics: MetricsData | null;
  metricsHistory: MetricsData[];
  status: StatusResponse | null;
  containers: Container[] | null;
  apps: AppResponse[] | null;
  nodes: RemoteNode[] | null;
  isConnected: boolean;
  /** Ref to the live EventSource — used by useResourceEvents */
  sourceRef: React.RefObject<EventSource | null>;
}

const EventStreamContext = createContext<EventStreamValue | null>(null);

/**
 * Global SSE provider — opens a single `/api/stream` connection.
 * Place inside AuthGuard so the connection only exists when logged in.
 */
export function EventStreamProvider({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();

  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [metricsHistory, setMetricsHistory] = useState<MetricsData[]>([]);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [containers, setContainers] = useState<Container[] | null>(null);
  const [apps, setApps] = useState<AppResponse[] | null>(null);
  const [nodes, setNodes] = useState<RemoteNode[] | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const bufferRef = useRef<MetricsData[]>([]);
  const sourceRef = useRef<EventSource | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!token) return;

    function connect() {
      const url = `/api/stream?token=${token}`;
      const source = new EventSource(url);
      sourceRef.current = source;

      source.onopen = () => {
        setIsConnected(true);

        // After an update, detect whether it succeeded or rolled back.
        const pendingStr = sessionStorage.getItem('passim-update-pending');
        if (!pendingStr) return;

        try {
          const pending = JSON.parse(pendingStr);
          const elapsed = Date.now() - pending.ts;

          // Stale flag (> 10 min), clean up
          if (elapsed >= 10 * 60_000) {
            sessionStorage.removeItem('passim-update-pending');
            return;
          }
          // Too early (< 5s) — initial connection, not a reconnect after update
          if (elapsed < 5_000) return;

          // Fetch current version to determine outcome
          fetch('/api/version')
            .then(r => r.ok ? r.json() : null)
            .then(data => {
              sessionStorage.removeItem('passim-update-pending');
              if (!data) return;

              const changed = data.version !== pending.fromVersion
                || data.commit !== pending.fromCommit;

              if (changed) {
                // Update succeeded — reload to pick up new frontend assets
                sessionStorage.setItem('passim-update-result', 'success');
                window.location.reload();
              } else {
                // Version unchanged — rollback happened
                toast.error(i18next.t('settings.update_rollback'));
                window.dispatchEvent(new Event('passim-update-rollback'));
              }
            })
            .catch(() => {
              sessionStorage.removeItem('passim-update-pending');
            });
        } catch {
          sessionStorage.removeItem('passim-update-pending');
        }
      };

      source.addEventListener('metrics', ((e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as MetricsData;
          setMetrics(data);
          bufferRef.current = [...bufferRef.current.slice(-(BUFFER_SIZE - 1)), data];
          setMetricsHistory([...bufferRef.current]);
        } catch { /* ignore */ }
      }) as EventListener);

      source.addEventListener('status', ((e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as StatusResponse;
          setStatus(data);
          queryClient.setQueryData(['status'], data);
        } catch { /* ignore */ }
      }) as EventListener);

      source.addEventListener('containers', ((e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as Container[];
          setContainers(data);
          queryClient.setQueryData(['containers'], data);
        } catch { /* ignore */ }
      }) as EventListener);

      source.addEventListener('apps', ((e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as AppResponse[];
          setApps(data);
          queryClient.setQueryData(['apps'], data);
        } catch { /* ignore */ }
      }) as EventListener);

      source.addEventListener('nodes', ((e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as RemoteNode[];
          setNodes(data);
          queryClient.setQueryData(['nodes'], data);
        } catch { /* ignore */ }
      }) as EventListener);

      source.onerror = () => {
        source.close();
        sourceRef.current = null;
        setIsConnected(false);
        const currentToken = useAuthStore.getState().token;
        if (currentToken) {
          reconnectRef.current = setTimeout(connect, 3000);
        }
      };
    }

    connect();

    return () => {
      sourceRef.current?.close();
      sourceRef.current = null;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, [token, queryClient]);

  return (
    <EventStreamContext value={{ metrics, metricsHistory, status, containers, apps, nodes, isConnected, sourceRef }}>
      {children}
    </EventStreamContext>
  );
}

/**
 * Consume the global event stream data.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useEventStream() {
  const ctx = useContext(EventStreamContext);
  if (!ctx) throw new Error('useEventStream must be used within <EventStreamProvider>');
  const { sourceRef: _sourceRef, ...rest } = ctx;
  void _sourceRef; // Intentionally unused in this hook
  return rest;
}

/**
 * Subscribe to a specific SSE event name on the shared connection.
 * Used for dynamic per-resource events (e.g., "task:abc-123", "app:xyz-789").
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useResourceEvents(topic: string, handler: (data: unknown) => void) {
  const ctx = useContext(EventStreamContext);
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  });

  // Re-run when isConnected changes (ensures sourceRef is populated)
  const isConnected = ctx?.isConnected ?? false;

  useEffect(() => {
    if (!ctx) return;

    const source = ctx.sourceRef.current;
    if (!source || source.readyState === EventSource.CLOSED) return;

    const listener = (e: MessageEvent) => {
      try {
        handlerRef.current(JSON.parse(e.data));
      } catch { /* ignore */ }
    };

    source.addEventListener(topic, listener as EventListener);
    return () => source.removeEventListener(topic, listener as EventListener);
  }, [topic, ctx, isConnected]);
}
