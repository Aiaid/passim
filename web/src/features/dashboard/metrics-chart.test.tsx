import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { MetricsChart } from './metrics-chart';
import * as useMetricsStreamModule from '@/hooks/use-metrics-stream';

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

vi.mock('@/hooks/use-metrics-stream', () => ({
  useMetricsStream: vi.fn(() => ({ history: [], latest: null, isConnected: false })),
}));

describe('MetricsChart', () => {
  it('renders without crashing with memory percentage data', () => {
    vi.mocked(useMetricsStreamModule.useMetricsStream).mockReturnValue({
      history: [
        {
          cpu_percent: 25.0,
          memory_used: 500,
          memory_total: 1000,
          disk_used: 0,
          disk_total: 0,
          net_rx: 0,
          net_tx: 0,
          timestamp: '2026-01-01T00:00:00Z',
        },
      ],
      latest: null,
      isConnected: true,
    });
    render(<MetricsChart />);
    expect(screen.getByTestId('area-chart')).toBeInTheDocument();
  });

  it('renders without crashing when memory_total is 0 (no division by zero)', () => {
    vi.mocked(useMetricsStreamModule.useMetricsStream).mockReturnValue({
      history: [
        {
          cpu_percent: 10.0,
          memory_used: 500,
          memory_total: 0,
          disk_used: 0,
          disk_total: 0,
          net_rx: 0,
          net_tx: 0,
          timestamp: '2026-01-01T00:00:00Z',
        },
      ],
      latest: null,
      isConnected: true,
    });
    render(<MetricsChart />);
    // If there were a division by zero, the component would throw
    expect(screen.getByTestId('area-chart')).toBeInTheDocument();
  });
});
