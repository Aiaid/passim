import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Timer, Activity, Loader2, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useSpeedTest } from './use-speedtest';

type RatingResult = { key: string; color: string };

function getSpeedRating(mbps: number): RatingResult {
  if (mbps > 500) return { key: 'very_fast', color: 'text-green-600 dark:text-green-400' };
  if (mbps > 100) return { key: 'fast', color: 'text-blue-600 dark:text-blue-400' };
  if (mbps > 10) return { key: 'average', color: 'text-yellow-600 dark:text-yellow-400' };
  return { key: 'slow', color: 'text-red-600 dark:text-red-400' };
}

function getLatencyRating(ms: number): RatingResult {
  if (ms < 10) return { key: 'very_low', color: 'text-green-600 dark:text-green-400' };
  if (ms < 50) return { key: 'low', color: 'text-blue-600 dark:text-blue-400' };
  if (ms < 100) return { key: 'latency_average', color: 'text-yellow-600 dark:text-yellow-400' };
  return { key: 'high', color: 'text-red-600 dark:text-red-400' };
}

function getJitterRating(ms: number): RatingResult {
  if (ms < 2) return { key: 'very_stable', color: 'text-green-600 dark:text-green-400' };
  if (ms < 10) return { key: 'stable', color: 'text-blue-600 dark:text-blue-400' };
  if (ms < 30) return { key: 'jitter_average', color: 'text-yellow-600 dark:text-yellow-400' };
  return { key: 'unstable', color: 'text-red-600 dark:text-red-400' };
}

function formatSpeed(mbps: number): string {
  if (mbps >= 100) return Math.round(mbps).toString();
  if (mbps >= 10) return mbps.toFixed(1);
  return mbps.toFixed(2);
}

function formatMs(ms: number): string {
  return ms.toFixed(1);
}

export function SpeedTest() {
  const { t } = useTranslation();
  const { phase, progress, result, partial, error, runTest, cancel } = useSpeedTest();
  const isRunning = phase !== 'idle';

  // Show partial results during test, full result otherwise
  const display = isRunning ? partial : (result ?? undefined);

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{t('speedtest.title')}</CardTitle>
            <CardDescription className="text-xs">{t('speedtest.desc')}</CardDescription>
          </div>
          <Button
            onClick={isRunning ? cancel : runTest}
            variant={isRunning ? 'outline' : 'default'}
            size="sm"
          >
            {isRunning ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t('speedtest.cancel')}
              </>
            ) : (
              t('speedtest.start')
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isRunning && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t(`speedtest.phase_${phase}`)}</span>
              {phase !== 'upload' && <span>{progress}%</span>}
            </div>
            <Progress
              value={phase === 'upload' ? 100 : progress}
              className={cn('h-1.5', phase === 'upload' && 'animate-pulse')}
            />
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <ResultBox
            icon={ArrowDown}
            label={t('speedtest.download')}
            value={display?.download}
            formatValue={formatSpeed}
            unit="Mbps"
            ratingFn={getSpeedRating}
            active={phase === 'download'}
          />
          <ResultBox
            icon={ArrowUp}
            label={t('speedtest.upload')}
            value={display?.upload}
            formatValue={formatSpeed}
            unit="Mbps"
            ratingFn={getSpeedRating}
            active={phase === 'upload'}
          />
          <ResultBox
            icon={Timer}
            label={t('speedtest.latency')}
            value={display?.latency}
            formatValue={formatMs}
            unit="ms"
            ratingFn={getLatencyRating}
            active={phase === 'latency'}
            tooltip={t('speedtest.latency_tooltip')}
          />
          <ResultBox
            icon={Activity}
            label={t('speedtest.jitter')}
            value={display?.jitter}
            formatValue={formatMs}
            unit="ms"
            ratingFn={getJitterRating}
            active={phase === 'latency'}
            tooltip={t('speedtest.jitter_tooltip')}
          />
        </div>

        {result && !isRunning && (
          <p className="text-xs text-muted-foreground">
            {t('speedtest.last_tested', {
              time: new Date(result.timestamp).toLocaleString(),
            })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

interface ResultBoxProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | undefined;
  formatValue: (v: number) => string;
  unit: string;
  ratingFn: (v: number) => RatingResult;
  active?: boolean;
  tooltip?: string;
}

function ResultBox({
  icon: Icon,
  label,
  value,
  formatValue,
  unit,
  ratingFn,
  active,
  tooltip,
}: ResultBoxProps) {
  const { t } = useTranslation();
  const rating = value !== undefined ? ratingFn(value) : undefined;

  return (
    <div
      className={cn(
        'rounded-lg border p-4 transition-colors',
        active && 'border-primary/50 bg-primary/5'
      )}
    >
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Icon className="size-3.5" />
        <span>{label}</span>
        {tooltip && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="size-3 cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-52">
                <p className="text-xs">{tooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      {active && value === undefined ? (
        <div className="flex items-center gap-2 mt-3 mb-1">
          <Loader2 className="size-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">{t('speedtest.testing')}</span>
        </div>
      ) : (
        <>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-bold tabular-nums">
              {value !== undefined ? formatValue(value) : '--'}
            </span>
            {value !== undefined && (
              <span className="text-sm text-muted-foreground">{unit}</span>
            )}
          </div>
          {rating && (
            <p className={cn('text-xs font-medium mt-0.5', rating.color)}>
              {t(`speedtest.${rating.key}`)}
            </p>
          )}
        </>
      )}
    </div>
  );
}
