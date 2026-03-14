import { useState, useCallback, useRef } from 'react';

export interface SpeedTestResult {
  download: number; // Mbps
  upload: number; // Mbps
  latency: number; // ms
  jitter: number; // ms
  timestamp: string; // ISO string
}

export type TestPhase = 'idle' | 'download' | 'upload' | 'latency';

const DOWNLOAD_SIZE = '25mb';
const UPLOAD_SIZE = 10 * 1024 * 1024; // 10MB
const PING_COUNT = 10;
const STORAGE_KEY_LAST = 'speedtest-last';
const STORAGE_KEY_HISTORY = 'speedtest-history';

function loadResult(): SpeedTestResult | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LAST);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function loadHistory(): SpeedTestResult[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HISTORY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function useSpeedTest() {
  const [phase, setPhase] = useState<TestPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<SpeedTestResult | null>(loadResult);
  const [partial, setPartial] = useState<Partial<SpeedTestResult>>({});
  const [history, setHistory] = useState<SpeedTestResult[]>(loadHistory);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runTest = useCallback(async () => {
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    setError(null);
    setPartial({});

    try {
      // Phase 1: Download
      setPhase('download');
      setProgress(0);
      const dlStart = performance.now();
      const dlRes = await fetch(`/api/speedtest/download?size=${DOWNLOAD_SIZE}`, { signal });
      const reader = dlRes.body!.getReader();
      const contentLength = parseInt(dlRes.headers.get('Content-Length') || '0');
      let dlBytes = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        dlBytes += value.length;
        if (contentLength > 0) {
          setProgress(Math.round((dlBytes / contentLength) * 100));
        }
      }
      const dlDuration = (performance.now() - dlStart) / 1000;
      const dlSpeed = Math.round(((dlBytes * 8) / (dlDuration * 1_000_000)) * 100) / 100;
      setPartial({ download: dlSpeed });

      // Phase 2: Upload
      setPhase('upload');
      setProgress(0);
      const uploadData = new ArrayBuffer(UPLOAD_SIZE);
      const ulRes = await fetch('/api/speedtest/upload', {
        method: 'POST',
        body: uploadData,
        signal,
      });
      const ulJson = await ulRes.json();
      const ulSpeed = Math.round(ulJson.speed_mbps * 100) / 100;
      setPartial((prev) => ({ ...prev, upload: ulSpeed }));
      setProgress(100);

      // Phase 3: Latency & Jitter
      setPhase('latency');
      setProgress(0);
      const pings: number[] = [];
      for (let i = 0; i < PING_COUNT; i++) {
        const t0 = performance.now();
        await fetch('/api/speedtest/ping', { signal });
        pings.push(performance.now() - t0);
        setProgress(Math.round(((i + 1) / PING_COUNT) * 100));
      }
      const avgLatency =
        Math.round((pings.reduce((a, b) => a + b, 0) / pings.length) * 10) / 10;
      const jitter =
        Math.round(
          Math.sqrt(pings.reduce((s, p) => s + (p - avgLatency) ** 2, 0) / pings.length) * 10
        ) / 10;

      const testResult: SpeedTestResult = {
        download: dlSpeed,
        upload: ulSpeed,
        latency: avgLatency,
        jitter,
        timestamp: new Date().toISOString(),
      };

      setResult(testResult);
      setPartial({});
      setPhase('idle');

      const newHistory = [testResult, ...loadHistory()].slice(0, 10);
      setHistory(newHistory);
      localStorage.setItem(STORAGE_KEY_LAST, JSON.stringify(testResult));
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(newHistory));
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError((err as Error).message);
      }
      setPhase('idle');
      setPartial({});
    } finally {
      abortRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setPhase('idle');
    setProgress(0);
    setPartial({});
  }, []);

  return { phase, progress, result, partial, history, error, runTest, cancel };
}
