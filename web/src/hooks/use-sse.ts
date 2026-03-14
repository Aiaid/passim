import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';

interface UseSSEOptions {
  enabled?: boolean;
  eventName?: string;
  onMessage?: (data: unknown) => void;
}

export function useSSE<T>(path: string, options?: UseSSEOptions) {
  const [data, setData] = useState<T | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const token = useAuthStore((s) => s.token);

  const connect = useCallback(() => {
    if (!token) return;

    const url = `/api${path}${path.includes('?') ? '&' : '?'}token=${token}`;
    const source = new EventSource(url);
    sourceRef.current = source;

    source.onopen = () => setIsConnected(true);

    const handler = (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data) as T;
        setData(parsed);
        options?.onMessage?.(parsed);
      } catch {
        // ignore parse errors
      }
    };

    if (options?.eventName) {
      source.addEventListener(options.eventName, handler as EventListener);
    } else {
      source.onmessage = handler;
    }

    source.onerror = () => {
      source.close();
      setIsConnected(false);
      // Only reconnect if still authenticated
      const currentToken = useAuthStore.getState().token;
      if (currentToken) {
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      }
    };
  }, [path, token, options]);

  useEffect(() => {
    if (options?.enabled === false) return;
    connect();
    return () => {
      sourceRef.current?.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [connect, options?.enabled]);

  return { data, isConnected };
}
