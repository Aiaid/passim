import { useTranslation } from 'react-i18next';
import { Package } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { TemplateCard } from './template-card';
import type { TemplateSummary } from '@/lib/api-client';

interface TemplateGridProps {
  templates: TemplateSummary[];
  hasFilter?: boolean;
}

export function TemplateGrid({ templates, hasFilter }: TemplateGridProps) {
  const { t } = useTranslation();

  if (templates.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title={hasFilter ? t('marketplace.no_match') : t('marketplace.no_templates')}
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {templates.map((template) => (
        <TemplateCard key={template.name} template={template} />
      ))}
    </div>
  );
}
