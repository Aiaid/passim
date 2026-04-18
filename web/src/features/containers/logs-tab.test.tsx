import { render, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const writeMock = vi.fn();

vi.mock('@wterm/react', () => ({
  Terminal: vi.fn(() => <div data-testid="wterm" />),
  useTerminal: () => ({
    ref: { current: null },
    write: writeMock,
    resize: vi.fn(),
    focus: vi.fn(),
  }),
}));
vi.mock('@wterm/react/css', () => ({}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import { LocalLogsView } from './container-detail-panel';

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

describe('LocalLogsView', () => {
  beforeEach(() => {
    writeMock.mockClear();
    (window.EventSource as unknown as MockESCtor).reset?.();
    localStorage.setItem('auth-token', 'test-token');
  });

  it('opens an SSE stream with follow=1 and token in query', () => {
    render(<LocalLogsView containerId="abc123" containerName="nginx" />);

    const source = getInstances().find((s) => s.url.includes('/logs?follow=1'));
    expect(source).toBeDefined();
    expect(source!.url).toContain('token=test-token');
    expect(source!.url).toContain('lines=200');
    expect(source!.url).toContain('/api/containers/abc123/logs');
  });

  it('decodes base64-encoded log events and writes raw bytes to wterm', () => {
    render(<LocalLogsView containerId="abc123" containerName="nginx" />);

    const source = getInstances().find((s) => s.url.includes('/logs?follow=1'))!;
    const payload = 'hello\n\x1b[31mred\x1b[0m';
    const b64 = btoa(payload);

    act(() => {
      const ev = new MessageEvent('log', { data: b64 });
      source.dispatchEvent(ev);
    });

    const bytesCall = writeMock.mock.calls.find((c) => c[0] instanceof Uint8Array);
    expect(bytesCall).toBeDefined();
    expect(new TextDecoder().decode(bytesCall![0] as Uint8Array)).toBe(payload);
  });
});
