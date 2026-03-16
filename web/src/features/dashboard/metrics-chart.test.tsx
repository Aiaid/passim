import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { MetricsChart } from './metrics-chart';
import * as useEventStreamModule from '@/hooks/use-event-stream';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

vi.mock('recharts', () => ({
  AreaChart: ({ children }: { children: React.ReactNode }) => <div data-testid="area-chart">{children}</div>,
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/hooks/use-event-stream', () => ({
  useEventStream: vi.fn(() => ({ metricsHistory: [], metrics: null, status: null, containers: null, apps: null, isConnected: false })),
}));

describe('MetricsChart', () => {
  it('renders without crashing with memory percentage data', () => {
    vi.mocked(useEventStreamModule.useEventStream).mockReturnValue({
      metricsHistory: [
        {
          cpu_percent: 25.0,
          mem_used: 500,
          mem_total: 1000,
          disk_used: 0,
          disk_total: 0,
          net_bytes_recv: 0,
          net_bytes_sent: 0,
        },
      ],
      metrics: null,
      status: null,
      containers: null,
      apps: null,
      isConnected: true,
    });
    render(<MetricsChart />);
    expect(screen.getByTestId('area-chart')).toBeInTheDocument();
  });

  it('renders without crashing when mem_total is 0 (no division by zero)', () => {
    vi.mocked(useEventStreamModule.useEventStream).mockReturnValue({
      metricsHistory: [
        {
          cpu_percent: 10.0,
          mem_used: 500,
          mem_total: 0,
          disk_used: 0,
          disk_total: 0,
          net_bytes_recv: 0,
          net_bytes_sent: 0,
        },
      ],
      metrics: null,
      status: null,
      containers: null,
      apps: null,
      isConnected: true,
    });
    render(<MetricsChart />);
    expect(screen.getByTestId('area-chart')).toBeInTheDocument();
  });
});
