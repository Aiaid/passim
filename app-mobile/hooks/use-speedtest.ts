import { useState, useCallback, useRef, useEffect } from 'react';
import { useNodeStore } from '@/stores/node-store';

export interface SpeedTestResult {
  download: number; // Mbps
  upload: number;   // Mbps
  latency: number;  // ms
}

type Phase = 'idle' | 'latency' | 'download' | 'upload' | 'done';

export function useSpeedTest(nodeId: string) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<SpeedTestResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Reset when node changes
  useEffect(() => {
    abortRef.current?.abort();
    setPhase('idle');
    setResult(null);
  }, [nodeId]);

  const run = useCallback(async () => {
    const store = useNodeStore.getState();
    const node = store.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    const base = `https://${node.host}/api/speedtest`;

    try {
      // Phase 1: Latency (average of 3 pings)
      setPhase('latency');
      let totalLatency = 0;
      for (let i = 0; i < 3; i++) {
        const t0 = performance.now();
        await fetch(`${base}/ping`, { signal });
        totalLatency += performance.now() - t0;
      }
      const latency = Math.round(totalLatency / 3);

      // Phase 2: Download (5MB)
      setPhase('download');
      const dlStart = performance.now();
      const dlRes = await fetch(`${base}/download?size=5mb`, { signal });
      const dlBlob = await dlRes.blob();
      const dlDuration = (performance.now() - dlStart) / 1000;
      const download = (dlBlob.size * 8) / (dlDuration * 1_000_000);

      // Phase 3: Upload (2MB)
      setPhase('upload');
      const uploadData = new ArrayBuffer(2 * 1024 * 1024);
      const ulStart = performance.now();
      await fetch(`${base}/upload`, {
        method: 'POST',
        body: uploadData,
        signal,
      });
      const ulDuration = (performance.now() - ulStart) / 1000;
      const upload = (2 * 1024 * 1024 * 8) / (ulDuration * 1_000_000);

      const res: SpeedTestResult = {
        download: Math.round(download * 10) / 10,
        upload: Math.round(upload * 10) / 10,
        latency,
      };
      setResult(res);
      setPhase('done');
    } catch {
      setPhase('idle');
    }
  }, [nodeId]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setPhase('idle');
  }, []);

  return { phase, result, run, cancel, isRunning: phase !== 'idle' && phase !== 'done' };
}
