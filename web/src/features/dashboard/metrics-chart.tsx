import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMetricsStream } from '@/hooks/use-metrics-stream';

export function MetricsChart() {
  const { t } = useTranslation();
  const { history } = useMetricsStream();

  const chartData = useMemo(
    () =>
      history.map((entry, i) => ({
        time: new Date(Date.now() - (history.length - 1 - i) * 5000).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        cpu: Number((entry.cpu_percent ?? 0).toFixed(1)),
        memory:
          (entry.mem_total ?? 0) > 0
            ? Number((((entry.mem_used ?? 0) / entry.mem_total) * 100).toFixed(1))
            : 0,
      })),
    [history],
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">
          {t('dashboard.metrics_chart')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-chart-1)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="memoryGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-chart-2)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--color-chart-2)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 12 }}
                className="fill-muted-foreground"
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 12 }}
                tickFormatter={(v) => `${v}%`}
                className="fill-muted-foreground"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-popover)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                }}
                formatter={(value, name) => [
                  `${value}%`,
                  name === 'cpu' ? 'CPU' : 'Memory',
                ]}
              />
              <Area
                type="monotone"
                dataKey="cpu"
                stroke="var(--color-chart-1)"
                fill="url(#cpuGradient)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="memory"
                stroke="var(--color-chart-2)"
                fill="url(#memoryGradient)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
