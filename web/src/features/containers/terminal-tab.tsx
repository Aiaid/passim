import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';

interface TerminalTabProps {
  containerId: string;
  containerName: string;
}

type Status = 'connecting' | 'connected' | 'disconnected';

export function TerminalTab({ containerId, containerName }: TerminalTabProps) {
  const { t } = useTranslation();
  const termRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [status, setStatus] = useState<Status>('connecting');

  function connect() {
    if (!termRef.current) return;

    // Clean up previous
    xtermRef.current?.dispose();
    wsRef.current?.close();

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
      theme: {
        background: '#09090b', // zinc-950
        foreground: '#d4d4d8', // zinc-300
        cursor: '#d4d4d8',
        selectionBackground: '#3f3f46', // zinc-700
      },
    });
    const fit = new FitAddon();
    const links = new WebLinksAddon();

    term.loadAddon(fit);
    term.loadAddon(links);
    term.open(termRef.current);
    fit.fit();

    xtermRef.current = term;
    fitRef.current = fit;

    // Build WebSocket URL
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = localStorage.getItem('auth-token') ?? '';
    const url = `${proto}//${location.host}/api/containers/${containerId}/terminal?token=${encodeURIComponent(token)}`;

    setStatus('connecting');
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      // Send initial resize
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    };

    ws.onmessage = (ev) => {
      if (ev.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(ev.data));
      } else {
        term.write(ev.data);
      }
    };

    ws.onclose = () => {
      setStatus('disconnected');
    };

    ws.onerror = () => {
      setStatus('disconnected');
    };

    // Terminal input → WebSocket
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        const encoder = new TextEncoder();
        ws.send(encoder.encode(data));
      }
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        // ignore fit errors during disposal
      }
    });
    resizeObserver.observe(termRef.current);

    term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });

    // Cleanup on disposal
    return () => {
      resizeObserver.disconnect();
      ws.close();
      term.dispose();
    };
  }

  useEffect(() => {
    const cleanup = connect();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Terminal chrome */}
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
            onClick={() => connect()}
          >
            <RotateCcw className="size-3" />
          </Button>
        )}
      </div>

      {/* Terminal body */}
      <div ref={termRef} className="flex-1 min-h-0 bg-zinc-950" />
    </div>
  );
}
