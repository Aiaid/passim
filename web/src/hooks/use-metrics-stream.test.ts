import { renderHook, act } from '@testing-library/react';
import { useMetricsStream } from './use-metrics-stream';
import { useSSE } from './use-sse';

vi.mock('./use-sse', () => ({
  useSSE: vi.fn(() => ({ data: null, isConnected: false })),
}));

const mockUseSSE = useSSE as ReturnType<typeof vi.fn>;

function captureOnMessage(): (data: unknown) => void {
  const lastCall = mockUseSSE.mock.calls[mockUseSSE.mock.calls.length - 1];
  return lastCall[1].onMessage;
}

function makeMetrics(overrides?: Partial<{
  cpu_percent: number;
  mem_used: number;
  mem_total: number;
  disk_used: number;
  disk_total: number;
  net_bytes_sent: number;
  net_bytes_recv: number;
}>) {
  return {
    cpu_percent: 50,
    mem_used: 1024,
    mem_total: 4096,
    disk_used: 10000,
    disk_total: 50000,
    net_bytes_sent: 200,
    net_bytes_recv: 100,
    ...overrides,
  };
}

beforeEach(() => {
  mockUseSSE.mockClear();
  mockUseSSE.mockImplementation((_path: string, _options?: { eventName?: string; onMessage?: (data: unknown) => void }) => {
    return { data: null, isConnected: false };
  });
});

describe('useMetricsStream', () => {
  it('returns empty history and null latest initially', () => {
    const { result } = renderHook(() => useMetricsStream());

    expect(result.current.history).toEqual([]);
    expect(result.current.latest).toBeNull();
    expect(result.current.isConnected).toBe(false);
  });

  it('passes eventName "metrics" to useSSE', () => {
    renderHook(() => useMetricsStream());
    const lastCall = mockUseSSE.mock.calls[mockUseSSE.mock.calls.length - 1];
    expect(lastCall[1].eventName).toBe('metrics');
  });

  it('adds a single data point to history via onMessage', () => {
    const metrics = makeMetrics({ cpu_percent: 75 });

    mockUseSSE.mockImplementation((_path: string, _options?: { eventName?: string; onMessage?: (data: unknown) => void }) => {
      return { data: metrics, isConnected: true };
    });

    const { result } = renderHook(() => useMetricsStream());
    const onMessage = captureOnMessage();

    act(() => {
      onMessage(metrics);
    });

    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0]).toEqual(metrics);
  });

  it('limits buffer to 60 entries', () => {
    const { result } = renderHook(() => useMetricsStream());
    const onMessage = captureOnMessage();

    act(() => {
      for (let i = 0; i < 61; i++) {
        onMessage(makeMetrics({ cpu_percent: i }));
      }
    });

    expect(result.current.history).toHaveLength(60);
    expect(result.current.history[0].cpu_percent).toBe(1);
    expect(result.current.history[59].cpu_percent).toBe(60);
  });

  it('returns the most recent value as latest', () => {
    const latestMetrics = makeMetrics({ cpu_percent: 99 });

    mockUseSSE.mockImplementation((_path: string, _options?: { eventName?: string; onMessage?: (data: unknown) => void }) => {
      return { data: latestMetrics, isConnected: true };
    });

    const { result } = renderHook(() => useMetricsStream());

    expect(result.current.latest).toEqual(latestMetrics);
  });
});
