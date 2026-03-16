import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Timer, Activity, Loader2, Zap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useSpeedTest } from './use-speedtest';

function fmt(v: number, decimals = 1): string {
  if (v >= 100) return Math.round(v).toString();
  return v.toFixed(decimals);
}

function MetricItem({ icon: Icon, value, format, unit, active }: {
  icon: React.ComponentType<{ className?: string }>;
  value: number | undefined;
  format: (v: number) => string;
  unit: string;
  active?: boolean;
}) {
  return (
    <div className={cn(
      'flex items-center gap-1 min-w-0',
      active && 'text-primary',
    )}>
      <Icon className={cn('size-3 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
      <span className="text-sm font-bold tabular-nums">
        {value != null ? format(value) : '--'}
      </span>
      <span className="text-[10px] text-muted-foreground">{unit}</span>
    </div>
  );
}

export function CompactSpeedTest() {
  const { t } = useTranslation();
  const { phase, result, partial, error, runTest, cancel } = useSpeedTest();
  const isRunning = phase !== 'idle';
  const display = isRunning ? partial : (result ?? undefined);

  return (
    <Card>
      <CardContent className="px-4 py-2.5">
        <div className="flex items-center gap-4">
          <Zap className="size-3.5 text-muted-foreground shrink-0" />
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <MetricItem
              icon={ArrowDown}
              value={display?.download}
              format={(v) => fmt(v)}
              unit="Mbps"
              active={phase === 'download'}
            />
            <MetricItem
              icon={ArrowUp}
              value={display?.upload}
              format={(v) => fmt(v)}
              unit="Mbps"
              active={phase === 'upload'}
            />
            <MetricItem
              icon={Timer}
              value={display?.latency}
              format={(v) => fmt(v)}
              unit="ms"
              active={phase === 'latency'}
            />
            <MetricItem
              icon={Activity}
              value={display?.jitter}
              format={(v) => fmt(v)}
              unit="ms"
              active={phase === 'latency'}
            />
          </div>
          <Button
            onClick={isRunning ? cancel : runTest}
            variant={isRunning ? 'outline' : 'default'}
            size="sm"
            className="shrink-0 h-7 text-xs px-3"
          >
            {isRunning ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              t('speedtest.start')
            )}
          </Button>
        </div>
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
      </CardContent>
    </Card>
  );
}
