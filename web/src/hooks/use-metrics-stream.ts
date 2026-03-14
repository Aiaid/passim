import { useCallback, useRef, useState } from 'react';
import { useSSE } from './use-sse';

interface MetricsData {
  cpu_percent: number;
  memory_used: number;
  memory_total: number;
  disk_used: number;
  disk_total: number;
  net_rx: number;
  net_tx: number;
  timestamp: string;
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
    onMessage,
  });

  return { latest, history, isConnected };
}
