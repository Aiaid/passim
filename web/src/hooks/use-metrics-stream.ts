import { useCallback, useRef, useState } from 'react';
import { useSSE } from './use-sse';

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

export function useMetricsStream() {
  const [history, setHistory] = useState<MetricsData[]>([]);
  const bufferRef = useRef<MetricsData[]>([]);

  const onMessage = useCallback((data: unknown) => {
    const metrics = data as MetricsData;
    bufferRef.current = [...bufferRef.current.slice(-(BUFFER_SIZE - 1)), metrics];
    setHistory([...bufferRef.current]);
  }, []);

  const { data: latest, isConnected } = useSSE<MetricsData>('/metrics/stream', {
    eventName: 'metrics',
    onMessage,
  });

  return { latest, history, isConnected };
}
