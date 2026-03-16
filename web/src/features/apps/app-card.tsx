import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CategoryIcon } from '@/components/shared/category-icon';
import { StatusIndicator } from '@/components/shared/status-indicator';
import { CATEGORY_GRADIENTS } from '@/lib/constants';
import { localized } from '@/lib/utils';
import type { AppResponse, TemplateSummary } from '@/lib/api-client';

interface AppCardProps {
  app: AppResponse;
  template?: TemplateSummary;
  onClick?: () => void;
}

export function AppCard({ app, template, onClick }: AppCardProps) {
  const { i18n } = useTranslation();

  return (
    <Card
      className="cursor-pointer overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
      onClick={onClick}
    >
      <div
        className="h-[3px] w-full"
        style={{
          background:
            CATEGORY_GRADIENTS[template?.category ?? ''] ||
            CATEGORY_GRADIENTS.vpn,
        }}
      />
      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
        <CategoryIcon
          category={template?.category ?? ''}
          templateName={app.template}
        />
        <div className="min-w-0 flex-1">
          <CardTitle className="text-base font-semibold capitalize">
            {app.template}
          </CardTitle>
          {template?.description && (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
              {localized(template.description, i18n.language)}
            </p>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <StatusIndicator status={app.status} showLabel />
      </CardContent>
    </Card>
  );
}
