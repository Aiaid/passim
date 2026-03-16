import { cn } from '@/lib/utils';

const dotColors: Record<string, string> = {
  running: 'bg-[oklch(0.65_0.2_145)]',
  connected: 'bg-[oklch(0.65_0.2_145)]',
  stopped: 'bg-zinc-400 dark:bg-zinc-600',
  exited: 'bg-zinc-400 dark:bg-zinc-600',
  failed: 'bg-[oklch(0.577_0.245_27)]',
  offline: 'bg-[oklch(0.577_0.245_27)]',
  deploying: 'bg-[oklch(0.65_0.2_250)]',
  undeploying: 'bg-[oklch(0.65_0.2_250)]',
};

interface StatusIndicatorProps {
  status: string;
  size?: 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
}

export function StatusIndicator({ status, size = 'sm', showLabel = false, className }: StatusIndicatorProps) {
  const dotSize = size === 'sm' ? 'size-1.5' : 'size-2.5';
  const color = dotColors[status] || dotColors.stopped;
  const isAnimated = status === 'running' || status === 'connected';
  const isOrbiting = status === 'deploying' || status === 'undeploying';

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className="relative inline-flex">
        <span className={cn('rounded-full', dotSize, color)} />
        {isAnimated && (
          <span
            className={cn('absolute inset-0 rounded-full', color, 'opacity-60')}
            style={{ animation: 'status-pulse 2s ease-in-out infinite' }}
          />
        )}
        {isOrbiting && (
          <span
            className="absolute -inset-0.5 rounded-full border border-current opacity-40"
            style={{
              borderColor: 'oklch(0.65 0.2 250)',
              borderTopColor: 'transparent',
              borderRightColor: 'transparent',
              animation: 'status-orbit 1.2s linear infinite',
            }}
          />
        )}
      </span>
      {showLabel && (
        <span className="text-xs text-muted-foreground capitalize">{status}</span>
      )}
    </span>
  );
}
