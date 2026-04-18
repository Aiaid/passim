import { render, screen, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Capture every wterm write so we can assert what flows into the terminal.
const writeMock = vi.fn();
const resizeMock = vi.fn();
const focusMock = vi.fn();

vi.mock('@wterm/react', () => ({
  Terminal: vi.fn(() => <div data-testid="wterm" />),
  useTerminal: () => ({
    ref: { current: null },
    write: writeMock,
    resize: resizeMock,
    focus: focusMock,
  }),
}));
vi.mock('@wterm/react/css', () => ({}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

// Mock the heavy parts of container-detail-panel that would otherwise pull in
// api-client / router / sonner. We only want to exercise LogsTab.
vi.mock('@/lib/api-client', () => ({
  api: {
    getNodeContainerLogs: vi.fn().mockResolvedValue({ logs: '' }),
  },
}));

import { ContainerDetailPanel } from './container-detail-panel';
import type { Container } from '@/lib/api-client';

// Access MockEventSource from the global setup.
interface MockES {
  url: string;
  onopen: ((ev: Event) => void) | null;
  onerror: ((ev: Event) => void) | null;
  close: () => void;
  dispatchEvent: (ev: Event) => boolean;
}
interface MockESCtor {
  instances: MockES[];
  reset(): void;
}
function getInstances(): MockES[] {
  return (window.EventSource as unknown as MockESCtor).instances;
}

function renderPanel(container: Container, nodeId?: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ContainerDetailPanel
        container={container}
        open
        onOpenChange={() => {}}
        nodeId={nodeId}
      />
    </QueryClientProvider>,
  );
}

const sampleContainer: Container = {
  Id: 'abc123',
  Names: ['/nginx'],
  Image: 'nginx:latest',
  ImageID: 'sha256:deadbeef',
  Command: 'nginx',
  Created: 1_700_000_000,
  State: 'running',
  Status: 'Up 5 minutes',
  Ports: [],
  Labels: {},
  NetworkSettings: { Networks: {} },
  Mounts: [],
  HostConfig: { NetworkMode: 'default' },
} as unknown as Container;

describe('LogsTab (local)', () => {
  beforeEach(() => {
    writeMock.mockClear();
    (window.EventSource as unknown as MockESCtor).reset?.();
    localStorage.setItem('auth-token', 'test-token');
  });

  it('opens an SSE stream with follow=1 for local containers', async () => {
    renderPanel(sampleContainer);

    // Tab defaults to info; click logs tab. We render Tabs mounted lazily so
    // the LogsTab component only mounts once activated.
    await act(async () => {
      screen.getByText('container.logs').click();
    });

    const sources = getInstances();
    const logsSource = sources.find((s) => s.url.includes('/logs?follow=1'));
    expect(logsSource).toBeDefined();
    expect(logsSource!.url).toContain('token=test-token');
    expect(logsSource!.url).toContain('lines=200');
  });

  it('decodes base64-encoded log events and writes raw bytes to wterm', async () => {
    renderPanel(sampleContainer);

    await act(async () => {
      screen.getByText('container.logs').click();
    });

    const source = getInstances().find((s) => s.url.includes('/logs?follow=1'))!;

    const payload = 'hello\n\x1b[31mred\x1b[0m';
    const b64 = btoa(payload);
    await act(async () => {
      const ev = new MessageEvent('log', { data: b64 });
      source.dispatchEvent(ev);
    });

    // First call is the screen-clear escape emitted on stream open.
    // The log event should produce a Uint8Array matching the raw payload.
    const calls = writeMock.mock.calls;
    const bytesCall = calls.find((c) => c[0] instanceof Uint8Array);
    expect(bytesCall).toBeDefined();
    const bytes = bytesCall![0] as Uint8Array;
    expect(new TextDecoder().decode(bytes)).toBe(payload);
  });
});
