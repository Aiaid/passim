import { Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CATEGORY_ICONS, CATEGORY_COLORS, APP_ICONS } from '@/lib/constants';

interface CategoryIconProps {
  category: string;
  templateName?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  sm: { box: 'size-7', icon: 'size-3.5' },
  md: { box: 'size-10', icon: 'size-5' },
  lg: { box: 'size-14', icon: 'size-7' },
};

export function CategoryIcon({ category, templateName, size = 'md', className }: CategoryIconProps) {
  const Icon = (templateName && APP_ICONS[templateName]) || CATEGORY_ICONS[category] || Package;
  const color = CATEGORY_COLORS[category] || 'var(--cat-vpn)';
  const s = sizeMap[size];

  return (
    <div
      className={cn(
        'relative flex shrink-0 items-center justify-center rounded-xl',
        s.box,
        className,
      )}
      style={{ backgroundColor: `color-mix(in oklch, ${color} 15%, transparent)` }}
    >
      <Icon className={s.icon} style={{ color }} />
    </div>
  );
}
