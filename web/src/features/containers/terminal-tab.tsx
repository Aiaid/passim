import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Terminal, useTerminal } from '@wterm/react';
import '@wterm/react/css';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';

interface TerminalTabProps {
  containerId: string;
  containerName: string;
}

type Status = 'connecting' | 'connected' | 'disconnected';

export function TerminalTab({ containerId, containerName }: TerminalTabProps) {
  const { t } = useTranslation();
  const { ref, write } = useTerminal();
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<Status>('connecting');
  const [reconnectNonce, setReconnectNonce] = useState(0);

  useEffect(() => {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = localStorage.getItem('auth-token') ?? '';
    const url = `${proto}//${location.host}/api/containers/${containerId}/terminal?token=${encodeURIComponent(token)}`;

    setStatus('connecting');
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => setStatus('connected');
    ws.onclose = () => setStatus('disconnected');
    ws.onerror = () => setStatus('disconnected');
    ws.onmessage = (ev) => {
      if (ev.data instanceof ArrayBuffer) {
        write(new Uint8Array(ev.data));
      } else {
        write(ev.data);
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [containerId, reconnectNonce, write]);

  const handleData = (data: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(new TextEncoder().encode(data));
    }
  };

  // wterm's autoResize already updated its own internal size and fired this
  // callback. We only need to forward the new dimensions to the PTY — calling
  // resize() again here would recurse because wterm re-fires onResize.
  const handleResize = (cols: number, rows: number) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  };

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
            {containerName} — {t(`container.terminal_${status}`)}
          </span>
        </div>
        {status === 'disconnected' && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-zinc-400 hover:text-zinc-200"
            onClick={() => setReconnectNonce((n) => n + 1)}
          >
            <RotateCcw className="size-3" />
          </Button>
        )}
      </div>

      <div className="flex-1 min-h-0 bg-zinc-950">
        <Terminal
          ref={ref}
          autoResize
          cursorBlink
          onData={handleData}
          onResize={handleResize}
          className="h-full w-full"
        />
      </div>
    </div>
  );
}
