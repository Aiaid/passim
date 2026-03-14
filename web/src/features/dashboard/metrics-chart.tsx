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
import { Card, CardContent } from '@/components/ui/card';
import { useMetricsStream } from '@/hooks/use-metrics-stream';

interface DataPoint {
  time: string;
  cpu: number;
  memory: number;
}

interface TooltipPayloadEntry {
  dataKey?: string;
  value?: number;
  color?: string;
}

function CustomTooltip(props: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}) {
  const { active, payload, label } = props;
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border bg-popover px-3 py-2 shadow-lg">
      <p className="text-xs text-muted-foreground mb-1.5">{label}</p>
      {payload.map((entry: TooltipPayloadEntry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 text-sm">
          <span
            className="size-2 rounded-full shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">
            {entry.dataKey === 'cpu' ? 'CPU' : 'Memory'}
          </span>
          <span className="ml-auto font-bold tabular-nums">{entry.value}%</span>
        </div>
      ))}
    </div>
  );
}

const SERIES = [
  { key: 'cpu', label: 'CPU', colorVar: '--color-chart-1' },
  { key: 'memory', label: 'Memory', colorVar: '--color-chart-2' },
] as const;

export function MetricsChart() {
  const { t } = useTranslation();
  const { history } = useMetricsStream();

  const chartData = useMemo<DataPoint[]>(
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
      <CardContent className="p-5">
        {/* Header with inline legend */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-foreground">
            {t('dashboard.metrics_chart')}
          </h3>
          <div className="flex items-center gap-4">
            {SERIES.map((s) => (
              <div key={s.key} className="flex items-center gap-1.5">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: `var(${s.colorVar})` }}
                />
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Chart */}
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
              <defs>
                {SERIES.map((s) => (
                  <linearGradient key={s.key} id={`${s.key}Fill`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={`var(${s.colorVar})`} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={`var(${s.colorVar})`} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                className="stroke-border/50"
              />
              <XAxis
                dataKey="time"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                domain={[0, 100]}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `${v}%`}
                className="fill-muted-foreground"
                width={48}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{
                  stroke: 'var(--color-muted-foreground)',
                  strokeWidth: 1,
                  strokeDasharray: '4 4',
                }}
              />
              {SERIES.map((s) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  stroke={`var(${s.colorVar})`}
                  fill={`url(#${s.key}Fill)`}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{
                    r: 4,
                    strokeWidth: 2,
                    fill: 'var(--color-card)',
                  }}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
