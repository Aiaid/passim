import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CategoryIcon } from '@/components/shared/category-icon';
import { CATEGORY_GRADIENTS } from '@/lib/constants';
import { localized } from '@/lib/utils';
import type { TemplateSummary } from '@/lib/api-client';

interface TemplateCardProps {
  template: TemplateSummary;
}

export function TemplateCard({ template }: TemplateCardProps) {
  const { i18n } = useTranslation();
  const navigate = useNavigate();

  const description = localized(template.description, i18n.language);

  return (
    <Card
      className="cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg overflow-hidden"
      onClick={() => navigate(`/apps/new/${template.name}`)}
    >
      <div
        className="h-0.5 rounded-t-lg"
        style={{ background: CATEGORY_GRADIENTS[template.category] || '' }}
      />
      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
        <CategoryIcon
          category={template.category}
          templateName={template.name}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <CardTitle className="text-base font-semibold">{template.name}</CardTitle>
          <CardDescription className="mt-1 line-clamp-2">{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <Badge variant="secondary">{template.category}</Badge>
      </CardContent>
    </Card>
  );
}
