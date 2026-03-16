import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import type { StatusResponse, Container, AppResponse } from '@/lib/api-client';

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

      source.onopen = () => setIsConnected(true);

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
    <EventStreamContext value={{ metrics, metricsHistory, status, containers, apps, isConnected, sourceRef }}>
      {children}
    </EventStreamContext>
  );
}

/**
 * Consume the global event stream data.
 */
export function useEventStream() {
  const ctx = useContext(EventStreamContext);
  if (!ctx) throw new Error('useEventStream must be used within <EventStreamProvider>');
  const { sourceRef: _, ...rest } = ctx;
  return rest;
}

/**
 * Subscribe to a specific SSE event name on the shared connection.
 * Used for dynamic per-resource events (e.g., "task:abc-123", "app:xyz-789").
 */
export function useResourceEvents(topic: string, handler: (data: unknown) => void) {
  const ctx = useContext(EventStreamContext);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

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
