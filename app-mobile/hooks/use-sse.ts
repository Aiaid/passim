import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { AppState } from 'react-native';
import EventSource from 'react-native-sse';
import { useQueryClient } from '@tanstack/react-query';
import { useNodeStore } from '@/stores/node-store';
import { qk } from '@/lib/query-keys';
import type {
  MetricsData,
  StatusResponse,
  Container,
  AppResponse,
} from '@passim/shared/types';

const MAX_HISTORY = 60;
const RECONNECT_DELAY = 3000;
const MAX_CONCURRENT_SSE = 5;

export interface SSENodeState {
  metrics: MetricsData | null;
  metricsHistory: MetricsData[];
  status: StatusResponse | null;
  containers: Container[] | null;
  apps: AppResponse[] | null;
  isConnected: boolean;
}

const EMPTY_STATE: SSENodeState = {
  metrics: null,
  metricsHistory: [],
  status: null,
  containers: null,
  apps: null,
  isConnected: false,
};

interface Connection {
  es: EventSource;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
}

export function useMultiNodeSSE() {
  const nodes = useNodeStore((s) => s.nodes);
  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const updateNodeName = useNodeStore((s) => s.updateNodeName);
  const queryClient = useQueryClient();

  const connectionsRef = useRef<Map<string, Connection>>(new Map());
  const statesRef = useRef<Map<string, SSENodeState>>(new Map());
  const [, forceUpdate] = useState(0);
  const tick = useCallback(() => forceUpdate((n) => n + 1), []);

  // Determine which nodes should have SSE connections
  const connectedNodeIds = useMemo(() => {
    const ids = nodes.slice(0, MAX_CONCURRENT_SSE).map((n) => n.id);
    // Always include active node even if beyond the limit
    if (activeNodeId && !ids.includes(activeNodeId)) {
      ids.push(activeNodeId);
    }
    return ids;
  }, [nodes, activeNodeId]);

  const updateNodeState = useCallback(
    (nodeId: string, updater: (prev: SSENodeState) => SSENodeState) => {
      const prev = statesRef.current.get(nodeId) ?? { ...EMPTY_STATE };
      statesRef.current.set(nodeId, updater(prev));
      tick();
    },
    [tick],
  );

  useEffect(() => {
    const conns = connectionsRef.current;

    // Close connections for nodes no longer in the list
    for (const [id, conn] of conns) {
      if (!connectedNodeIds.includes(id)) {
        if (conn.reconnectTimer) clearTimeout(conn.reconnectTimer);
        conn.es.close();
        conns.delete(id);
        statesRef.current.delete(id);
      }
    }

    // Open connections for new nodes
    for (const nodeId of connectedNodeIds) {
      if (conns.has(nodeId)) continue;

      const node = nodes.find((n) => n.id === nodeId);
      if (!node) continue;

      const connect = () => {
        const url = `https://${node.host}/api/stream?token=${node.token}`;
        const es = new EventSource(url);
        const entry: Connection = { es, reconnectTimer: null };
        conns.set(nodeId, entry);

        es.addEventListener('open', () => {
          updateNodeState(nodeId, (s) => ({ ...s, isConnected: true }));
        });

        // @ts-expect-error react-native-sse custom event types
        es.addEventListener('metrics', (e: { data?: string }) => {
          if (!e.data) return;
          try {
            const data: MetricsData = JSON.parse(e.data);
            queryClient.setQueryData(qk.metrics(nodeId), data);
            updateNodeState(nodeId, (s) => {
              const history = [...s.metricsHistory, data];
              return {
                ...s,
                metrics: data,
                metricsHistory: history.length > MAX_HISTORY ? history.slice(-MAX_HISTORY) : history,
              };
            });
          } catch { /* ignore */ }
        });

        // @ts-expect-error react-native-sse custom event types
        es.addEventListener('status', (e: { data?: string }) => {
          if (!e.data) return;
          try {
            const data: StatusResponse = JSON.parse(e.data);
            queryClient.setQueryData(qk.status(nodeId), data);
            updateNodeState(nodeId, (s) => ({ ...s, status: data }));
            // Sync node name from server if it differs from stored name
            const serverName = data.node?.name;
            if (serverName) {
              const stored = nodes.find((n) => n.id === nodeId);
              if (stored && stored.name !== serverName) updateNodeName(nodeId, serverName);
            }
          } catch { /* ignore */ }
        });

        // @ts-expect-error react-native-sse custom event types
        es.addEventListener('containers', (e: { data?: string }) => {
          if (!e.data) return;
          try {
            const data: Container[] = JSON.parse(e.data);
            queryClient.setQueryData(qk.containers(nodeId), data);
            updateNodeState(nodeId, (s) => ({ ...s, containers: data }));
          } catch { /* ignore */ }
        });

        // @ts-expect-error react-native-sse custom event types
        es.addEventListener('apps', (e: { data?: string }) => {
          if (!e.data) return;
          try {
            const data: AppResponse[] = JSON.parse(e.data);
            queryClient.setQueryData(qk.apps(nodeId), data);
            updateNodeState(nodeId, (s) => ({ ...s, apps: data }));
          } catch { /* ignore */ }
        });

        es.addEventListener('error', () => {
          updateNodeState(nodeId, (s) => ({ ...s, isConnected: false }));
          es.close();
          conns.delete(nodeId);
          entry.reconnectTimer = setTimeout(connect, RECONNECT_DELAY);
        });
      };

      connect();
    }

    return () => {
      for (const [, conn] of conns) {
        if (conn.reconnectTimer) clearTimeout(conn.reconnectTimer);
        conn.es.close();
      }
      conns.clear();
      statesRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedNodeIds.join(',')]);

  // Pause/resume on app state changes
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const conns = connectionsRef.current;
      if (state === 'background') {
        for (const [, conn] of conns) {
          if (conn.reconnectTimer) clearTimeout(conn.reconnectTimer);
          conn.es.close();
        }
        conns.clear();
      }
      // Reconnect handled by the main effect re-running when app returns
    });
    return () => sub.remove();
  }, []);

  const getNodeSSE = useCallback(
    (nodeId: string): SSENodeState => statesRef.current.get(nodeId) ?? EMPTY_STATE,
    [],
  );

  return { getNodeSSE };
}
