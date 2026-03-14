import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { createElement } from 'react';
import { useSSE } from './use-sse';
import { useAuthStore } from '@/stores/auth-store';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(
    QueryClientProvider,
    { client: qc },
    createElement(MemoryRouter, null, children),
  );
}

// Access MockEventSource via window.EventSource
const getMockES = () => window.EventSource as any;

beforeEach(() => {
  vi.useFakeTimers();
  getMockES().reset?.();
  getMockES().instances = [];
  useAuthStore.setState({
    token: 'test-token',
    isAuthenticated: true,
    expiresAt: null,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useSSE', () => {
  it('constructs URL with token query parameter', () => {
    renderHook(() => useSSE('/metrics/stream'), { wrapper });

    const instances = getMockES().instances;
    expect(instances).toHaveLength(1);
    expect(instances[0].url).toBe('/api/metrics/stream?token=test-token');
  });

  it('appends token with & when path already has query params', () => {
    renderHook(() => useSSE('/foo?bar=1'), { wrapper });

    const instances = getMockES().instances;
    expect(instances).toHaveLength(1);
    expect(instances[0].url).toBe('/api/foo?bar=1&token=test-token');
  });

  it('sets isConnected to true on open', () => {
    const { result } = renderHook(() => useSSE('/metrics/stream'), {
      wrapper,
    });

    expect(result.current.isConnected).toBe(false);

    const instance = getMockES().instances[0];
    act(() => {
      instance.onopen?.({} as Event);
    });

    expect(result.current.isConnected).toBe(true);
  });

  it('parses JSON message and updates data', () => {
    const { result } = renderHook(() => useSSE<{ value: number }>('/test'), {
      wrapper,
    });

    const instance = getMockES().instances[0];
    act(() => {
      instance.onmessage?.({ data: '{"value":42}' } as MessageEvent);
    });

    expect(result.current.data).toEqual({ value: 42 });
  });

  it('calls onMessage callback with parsed data', () => {
    const onMessage = vi.fn();
    renderHook(() => useSSE('/test', { onMessage }), { wrapper });

    const instance = getMockES().instances[0];
    act(() => {
      instance.onmessage?.({ data: '{"hello":"world"}' } as MessageEvent);
    });

    expect(onMessage).toHaveBeenCalledWith({ hello: 'world' });
  });

  it('closes connection and schedules reconnect on error', () => {
    const { result } = renderHook(() => useSSE('/test'), { wrapper });

    const instance = getMockES().instances[0];

    // First set connected
    act(() => {
      instance.onopen?.({} as Event);
    });
    expect(result.current.isConnected).toBe(true);

    // Trigger error
    act(() => {
      instance.onerror?.({} as Event);
    });

    expect(instance.close).toHaveBeenCalled();
    expect(result.current.isConnected).toBe(false);

    // Reconnect timer should create a new EventSource after 3s
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(getMockES().instances).toHaveLength(2);
  });

  it('does not create EventSource when enabled is false', () => {
    renderHook(() => useSSE('/test', { enabled: false }), { wrapper });

    expect(getMockES().instances).toHaveLength(0);
  });

  it('does not create EventSource when token is null', () => {
    useAuthStore.setState({
      token: null,
      isAuthenticated: false,
      expiresAt: null,
    });

    renderHook(() => useSSE('/test'), { wrapper });

    expect(getMockES().instances).toHaveLength(0);
  });

  it('closes EventSource on unmount', () => {
    const { unmount } = renderHook(() => useSSE('/test'), { wrapper });

    const instance = getMockES().instances[0];
    expect(instance).toBeDefined();

    unmount();

    expect(instance.close).toHaveBeenCalled();
  });

  it('uses addEventListener for named events when eventName is set', () => {
    const onMessage = vi.fn();
    const { result } = renderHook(
      () => useSSE<{ value: number }>('/metrics/stream', { eventName: 'metrics', onMessage }),
      { wrapper },
    );

    const instance = getMockES().instances[0];

    // onmessage should NOT be set — named events go through addEventListener
    expect(instance.onmessage).toBeNull();

    // Simulate a named SSE event dispatched by the browser
    act(() => {
      instance.dispatchEvent(
        new MessageEvent('metrics', { data: '{"value":99}' }),
      );
    });

    expect(result.current.data).toEqual({ value: 99 });
    expect(onMessage).toHaveBeenCalledWith({ value: 99 });
  });

  it('does NOT receive named events via onmessage (regression guard)', () => {
    const { result } = renderHook(
      () => useSSE<{ value: number }>('/test'),
      { wrapper },
    );

    const instance = getMockES().instances[0];

    // Without eventName, only onmessage is used — named events should not update data
    act(() => {
      instance.dispatchEvent(
        new MessageEvent('metrics', { data: '{"value":42}' }),
      );
    });

    expect(result.current.data).toBeNull();
  });
});
