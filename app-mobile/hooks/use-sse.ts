import { useEffect, useRef, useState, useCallback } from 'react';
import EventSource from 'react-native-sse';
import { useQueryClient } from '@tanstack/react-query';
import { useNodeStore } from '@/stores/node-store';
import type {
  MetricsData,
  StatusResponse,
  Container,
  AppResponse,
  RemoteNode,
} from '@passim/shared/types';

const MAX_HISTORY = 60;
const RECONNECT_DELAY = 3000;

interface SSEState {
  metrics: MetricsData | null;
  metricsHistory: MetricsData[];
  status: StatusResponse | null;
  containers: Container[] | null;
  apps: AppResponse[] | null;
  nodes: RemoteNode[] | null;
  isConnected: boolean;
}

export function useSSE(): SSEState {
  const activeNode = useNodeStore((s) => s.activeNode);
  const queryClient = useQueryClient();

  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [metricsHistory, setMetricsHistory] = useState<MetricsData[]>([]);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [containers, setContainers] = useState<Container[] | null>(null);
  const [apps, setApps] = useState<AppResponse[] | null>(null);
  const [nodes, setNodes] = useState<RemoteNode[] | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const pushMetrics = useCallback((data: MetricsData) => {
    setMetrics(data);
    setMetricsHistory((prev) => {
      const next = [...prev, data];
      return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
    });
    queryClient.setQueryData(['metrics'], data);
  }, [queryClient]);

  const handleStatus = useCallback((data: StatusResponse) => {
    setStatus(data);
    queryClient.setQueryData(['status'], data);
  }, [queryClient]);

  const handleContainers = useCallback((data: Container[]) => {
    setContainers(data);
    queryClient.setQueryData(['containers'], data);
  }, [queryClient]);

  const handleApps = useCallback((data: AppResponse[]) => {
    setApps(data);
    queryClient.setQueryData(['apps'], data);
  }, [queryClient]);

  const handleNodes = useCallback((data: RemoteNode[]) => {
    setNodes(data);
    queryClient.setQueryData(['nodes'], data);
  }, [queryClient]);

  useEffect(() => {
    if (!activeNode) return;

    const connect = () => {
      const url = `https://${activeNode.host}/api/stream?token=${activeNode.token}`;
      const es = new EventSource(url);
      esRef.current = es;

      es.addEventListener('open', () => {
        setIsConnected(true);
      });

      // @ts-expect-error react-native-sse custom event types
      es.addEventListener('metrics', (e: { data?: string }) => {
        if (e.data) try { pushMetrics(JSON.parse(e.data)); } catch { /* ignore */ }
      });

      // @ts-expect-error react-native-sse custom event types
      es.addEventListener('status', (e: { data?: string }) => {
        if (e.data) try { handleStatus(JSON.parse(e.data)); } catch { /* ignore */ }
      });

      // @ts-expect-error react-native-sse custom event types
      es.addEventListener('containers', (e: { data?: string }) => {
        if (e.data) try { handleContainers(JSON.parse(e.data)); } catch { /* ignore */ }
      });

      // @ts-expect-error react-native-sse custom event types
      es.addEventListener('apps', (e: { data?: string }) => {
        if (e.data) try { handleApps(JSON.parse(e.data)); } catch { /* ignore */ }
      });

      // @ts-expect-error react-native-sse custom event types
      es.addEventListener('nodes', (e: { data?: string }) => {
        if (e.data) try { handleNodes(JSON.parse(e.data)); } catch { /* ignore */ }
      });

      es.addEventListener('error', () => {
        setIsConnected(false);
        es.close();
        esRef.current = null;
        reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY);
      });
    };

    connect();

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      setIsConnected(false);
    };
  }, [activeNode, pushMetrics, handleStatus, handleContainers, handleApps, handleNodes]);

  return { metrics, metricsHistory, status, containers, apps, nodes, isConnected };
}
