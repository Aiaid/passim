import { Package } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { CATEGORY_ICONS } from '@/lib/constants';
import type { AppResponse, TemplateSummary } from '@/lib/api-client';

interface AppCardProps {
  app: AppResponse;
  template?: TemplateSummary;
  onClick?: () => void;
}

export function AppCard({ app, template, onClick }: AppCardProps) {
  const Icon = template
    ? CATEGORY_ICONS[template.category] || Package
    : Package;
  const deployedDate = new Date(app.deployed_at).toLocaleDateString();

  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-accent/50"
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon className="size-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <CardTitle className="text-base">{app.template}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{deployedDate}</p>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <StatusBadge status={app.status} />
      </CardContent>
    </Card>
  );
}
