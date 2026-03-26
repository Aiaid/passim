import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EventStreamProvider, useEventStream, useResourceEvents } from './use-event-stream';
import { useAuthStore } from '@/stores/auth-store';

// MockEventSource from test/setup.ts is available globally
type MockES = {
  url: string;
  readyState: number;
  onopen: ((ev: Event) => void) | null;
  onerror: ((ev: Event) => void) | null;
  close: ReturnType<typeof vi.fn>;
  addEventListener: (type: string, listener: EventListener) => void;
  removeEventListener: (type: string, listener: EventListener) => void;
  dispatchEvent: (event: Event) => boolean;
};

function getMockEventSource(): MockES {
  const instances = (window.EventSource as unknown as { instances: MockES[] }).instances;
  return instances[instances.length - 1];
}

function resetMockEventSource() {
  (window.EventSource as unknown as { reset: () => void }).reset();
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <EventStreamProvider>{children}</EventStreamProvider>
    </QueryClientProvider>
  );
}

function fireSSEEvent(source: MockES, eventType: string, data: string) {
  const event = new MessageEvent(eventType, { data });
  source.dispatchEvent(event);
}

beforeEach(() => {
  resetMockEventSource();
  vi.clearAllMocks();
  // Set token directly on zustand store
  useAuthStore.setState({ token: 'test-token', expiresAt: '2099-01-01', isAuthenticated: true });
});

describe('EventStreamProvider', () => {
  it('creates a single EventSource with correct URL', () => {
    const wrapper = createWrapper();
    renderHook(() => useEventStream(), { wrapper });

    const instances = (window.EventSource as unknown as { instances: MockES[] }).instances;
    expect(instances.length).toBe(1);
    expect(instances[0].url).toContain('/api/stream?token=test-token');
  });

  it('throws when used outside provider', () => {
    expect(() => {
      renderHook(() => useEventStream());
    }).toThrow('useEventStream must be used within <EventStreamProvider>');
  });

  it('updates metrics on metrics event', () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useEventStream(), { wrapper });

    const source = getMockEventSource();
    act(() => {
      source.onopen?.(new Event('open'));
    });

    act(() => {
      fireSSEEvent(source, 'metrics', JSON.stringify({
        cpu_percent: 42,
        mem_used: 1024,
        mem_total: 4096,
        disk_used: 0,
        disk_total: 0,
        net_bytes_sent: 0,
        net_bytes_recv: 0,
      }));
    });

    expect(result.current.metrics?.cpu_percent).toBe(42);
    expect(result.current.metricsHistory).toHaveLength(1);
    expect(result.current.isConnected).toBe(true);
  });

  it('limits metrics history to 60 entries', () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useEventStream(), { wrapper });

    const source = getMockEventSource();

    act(() => {
      for (let i = 0; i < 65; i++) {
        fireSSEEvent(source, 'metrics', JSON.stringify({
          cpu_percent: i,
          mem_used: 0,
          mem_total: 0,
          disk_used: 0,
          disk_total: 0,
          net_bytes_sent: 0,
          net_bytes_recv: 0,
        }));
      }
    });

    expect(result.current.metricsHistory).toHaveLength(60);
    expect(result.current.metricsHistory[0].cpu_percent).toBe(5);
    expect(result.current.metricsHistory[59].cpu_percent).toBe(64);
  });

  it('updates status on status event', () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useEventStream(), { wrapper });

    const source = getMockEventSource();

    act(() => {
      fireSSEEvent(source, 'status', JSON.stringify({
        node: { id: '1', name: 'test', version: '0.1.0', uptime: 100 },
        system: {
          cpu: { usage_percent: 10, cores: 4, model: 'test' },
          memory: { total_bytes: 8000, used_bytes: 4000, usage_percent: 50 },
          disk: { total_bytes: 100, used_bytes: 50, usage_percent: 50 },
          network: { rx_rate: 0, tx_rate: 0 },
          load: { load1: 1, load5: 1, load15: 1 },
          os: 'linux',
          kernel: '5.0',
        },
        containers: { running: 2, stopped: 1, total: 3 },
      }));
    });

    expect(result.current.status?.node.name).toBe('test');
    expect(result.current.status?.containers.running).toBe(2);
  });

  it('updates containers on containers event', () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useEventStream(), { wrapper });

    const source = getMockEventSource();

    act(() => {
      fireSSEEvent(source, 'containers', JSON.stringify([
        { Id: '1', Names: ['/nginx'], Image: 'nginx', State: 'running', Status: 'Up', Created: 0 },
      ]));
    });

    expect(result.current.containers).toHaveLength(1);
    expect(result.current.containers?.[0].Id).toBe('1');
  });

  it('updates apps on apps event', () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useEventStream(), { wrapper });

    const source = getMockEventSource();

    act(() => {
      fireSSEEvent(source, 'apps', JSON.stringify([
        { id: 'a1', template: 'wireguard', settings: {}, status: 'running', container_id: 'c1', deployed_at: '', updated_at: '' },
      ]));
    });

    expect(result.current.apps).toHaveLength(1);
    expect(result.current.apps?.[0].template).toBe('wireguard');
  });

  it('closes EventSource on unmount', () => {
    const wrapper = createWrapper();
    const { unmount } = renderHook(() => useEventStream(), { wrapper });

    const source = getMockEventSource();
    unmount();

    expect(source.close).toHaveBeenCalled();
  });
});

describe('useResourceEvents', () => {
  it('registers listener on the EventSource for the given topic', () => {
    const handler = vi.fn();
    const wrapper = createWrapper();

    renderHook(() => {
      useEventStream();
      useResourceEvents('app:test-123', handler);
    }, { wrapper });

    const source = getMockEventSource();

    // Trigger connection so isConnected flips and useResourceEvents re-runs
    act(() => {
      source.onopen?.(new Event('open'));
    });

    act(() => {
      fireSSEEvent(source, 'app:test-123', JSON.stringify({ type: 'deploy', data: { status: 'running' } }));
    });

    expect(handler).toHaveBeenCalledWith({ type: 'deploy', data: { status: 'running' } });
  });
});
