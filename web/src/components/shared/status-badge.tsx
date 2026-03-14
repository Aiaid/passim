import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const statusStyles: Record<string, string> = {
  running: 'bg-[oklch(0.65_0.2_145)] text-white hover:bg-[oklch(0.60_0.2_145)]',
  connected: 'bg-[oklch(0.65_0.2_145)] text-white hover:bg-[oklch(0.60_0.2_145)]',
  stopped: 'bg-[oklch(0.65_0_0)] text-white hover:bg-[oklch(0.60_0_0)]',
  failed: 'bg-[oklch(0.577_0.245_27)] text-white hover:bg-[oklch(0.53_0.245_27)]',
  offline: 'bg-[oklch(0.577_0.245_27)] text-white hover:bg-[oklch(0.53_0.245_27)]',
  deploying: 'bg-[oklch(0.65_0.2_250)] text-white hover:bg-[oklch(0.60_0.2_250)]',
  warning: 'bg-[oklch(0.75_0.18_80)] text-black hover:bg-[oklch(0.70_0.18_80)]',
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <Badge className={cn(statusStyles[status] || statusStyles.stopped, className)}>
      {status}
    </Badge>
  );
}
