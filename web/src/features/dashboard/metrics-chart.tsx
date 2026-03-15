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
  idx: number;
  cpu: number;
  memory: number;
}

interface TooltipPayloadEntry {
  dataKey?: string;
  value?: number;
  color?: string;
}

const SERIES = [
  { key: 'cpu', label: 'CPU', colorVar: '--color-chart-1' },
  { key: 'memory', label: 'Memory', colorVar: '--color-chart-2' },
] as const;

// Buffer = 60 points (5 min @ 5s intervals). Always show the full range.
const MAX = 59;
// Fixed ticks: always show 6 evenly-spaced labels — never change.
const TICKS = [0, 12, 24, 36, 48, MAX];

function getTimeForIdx(idx: number): Date {
  const secsAgo = (MAX - idx) * 5;
  return new Date(Date.now() - secsAgo * 1000);
}

function formatTick(idx: number): string {
  const d = getTimeForIdx(idx);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatTooltipLabel(idx: number): string {
  const d = getTimeForIdx(idx);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function CustomTooltip(props: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: number;
}) {
  const { active, payload, label } = props;
  if (!active || !payload?.length || label === undefined) return null;

  return (
    <div className="rounded-lg border bg-popover/80 backdrop-blur-xl px-3 py-2 shadow-lg">
      <p className="text-xs text-muted-foreground mb-1.5">
        {formatTooltipLabel(label)}
      </p>
      {payload.map((entry: TooltipPayloadEntry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 text-sm">
          <span
            className="size-2 rounded-full shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">
            {entry.dataKey === 'cpu' ? 'CPU' : 'Memory'}
          </span>
          <span className="ml-auto font-bold tabular-nums">
            {entry.value}%
          </span>
        </div>
      ))}
    </div>
  );
}

export function MetricsChart({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { history } = useMetricsStream();

  // Map data so the newest point is always at idx=59, oldest fills leftward.
  const chartData = useMemo<DataPoint[]>(
    () =>
      history.map((entry, i) => ({
        idx: MAX - history.length + 1 + i,
        cpu: Number((entry.cpu_percent ?? 0).toFixed(1)),
        memory:
          (entry.mem_total ?? 0) > 0
            ? Number((((entry.mem_used ?? 0) / entry.mem_total) * 100).toFixed(1))
            : 0,
      })),
    [history],
  );

  return (
    <Card className={className}>
      <CardContent className="p-5 h-full flex flex-col">
        <div className="flex items-center justify-between mb-3">
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

        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 4, right: 4, bottom: 0, left: -16 }}
            >
              <defs>
                {SERIES.map((s) => (
                  <linearGradient
                    key={s.key}
                    id={`${s.key}Fill`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={`var(${s.colorVar})`} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={`var(${s.colorVar})`} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                className="stroke-border/30"
              />
              <XAxis
                dataKey="idx"
                type="number"
                domain={[0, MAX]}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
                ticks={TICKS}
                tickFormatter={formatTick}
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
                  isAnimationActive={true}
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
