import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Package } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CATEGORY_ICONS } from '@/lib/constants';
import { localized } from '@/lib/utils';
import type { TemplateSummary } from '@/lib/api-client';

interface TemplateCardProps {
  template: TemplateSummary;
}

export function TemplateCard({ template }: TemplateCardProps) {
  const { i18n } = useTranslation();
  const navigate = useNavigate();

  const Icon = CATEGORY_ICONS[template.category] || Package;
  const description = localized(template.description, i18n.language);

  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-accent/50"
      onClick={() => navigate(`/apps/new/${template.name}`)}
    >
      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon className="size-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <CardTitle className="text-base">{template.name}</CardTitle>
          <CardDescription className="mt-1 line-clamp-2">{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <Badge variant="secondary">{template.category}</Badge>
      </CardContent>
    </Card>
  );
}
