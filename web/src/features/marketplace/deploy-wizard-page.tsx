import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, BookOpen, ExternalLink, Package } from 'lucide-react';
import { toast } from 'sonner';
import { PageSkeleton } from '@/components/shared/loading-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { CategoryIcon } from '@/components/shared/category-icon';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { CATEGORY_GRADIENTS } from '@/lib/constants';
import { cn, localized } from '@/lib/utils';
import { DynamicForm } from './dynamic-form';
import { DeployProgress } from './deploy-progress';
import { useTemplates, useTemplate, useDeployApp } from './queries';

export function DeployWizardPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { template: templateName } = useParams<{ template: string }>();

  const { data: templates, isLoading } = useTemplates();
  const { data: templateDetailData } = useTemplate(templateName);
  const deployMutation = useDeployApp();

  const [deployResult, setDeployResult] = useState<{ appId: string; taskId?: string } | null>(null);

  const template = templates?.find((tpl) => tpl.name === templateName);

  if (isLoading) {
    return <PageSkeleton />;
  }

  if (!template) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/apps/new')}>
          <ArrowLeft className="mr-2 size-4" />
          {t('marketplace.back')}
        </Button>
        <EmptyState
          icon={Package}
          title={t('marketplace.no_templates')}
        />
      </div>
    );
  }

  const gradient = CATEGORY_GRADIENTS[template.category];
  const setupGuide = templateDetailData?.guide?.setup
    ? localized(templateDetailData.guide.setup, i18n.language)
    : null;

  function handleDeploy(settings: Record<string, unknown>) {
    deployMutation.mutate(
      { template: template!.name, settings },
      {
        onSuccess: (data) => {
          setDeployResult({ appId: data.id, taskId: data.task_id });
        },
        onError: (error) => {
          toast.error(error.message);
        },
      },
    );
  }

  function handleRetry() {
    setDeployResult(null);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate('/apps/new')}>
        <ArrowLeft className="mr-2 size-4" />
        {t('marketplace.back')}
      </Button>

      <Card
        className="overflow-hidden"
        style={gradient ? {
          backgroundImage: gradient,
          backgroundSize: '100% 100%',
          backgroundBlendMode: 'soft-light',
          backgroundColor: 'color-mix(in oklch, var(--card) 95%, transparent)',
        } : undefined}
      >
        {/* Hero header */}
        <div className="flex items-start gap-4 p-6 pb-0">
          <CategoryIcon
            category={template.category}
            templateName={template.name}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold tracking-tight">{template.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {localized(template.description, i18n.language)}
            </p>

            {/* Source link + license badge */}
            {templateDetailData?.source && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {templateDetailData.source.url && (
                  <a
                    href={templateDetailData.source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      'inline-flex items-center gap-1 text-xs text-muted-foreground',
                      'hover:text-foreground transition-colors',
                    )}
                  >
                    <ExternalLink className="size-3" />
                    {t('marketplace.source_code')}
                  </a>
                )}
                {templateDetailData.source.license && (
                  <Badge variant="secondary" className="text-[10px]">
                    {templateDetailData.source.license}
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Setup guide section */}
        {setupGuide && (
          <div className="mx-6 mt-4 rounded-lg border bg-muted/50 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <BookOpen className="size-4 text-muted-foreground" />
              {t('marketplace.setup_guide')}
            </div>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              {setupGuide}
            </p>
          </div>
        )}

        <div className="p-6 pt-4">
          <Separator className="mb-6" />

          <CardContent className="p-0">
            {deployResult ? (
              <DeployProgress
                appId={deployResult.appId}
                taskId={deployResult.taskId}
                onRetry={handleRetry}
              />
            ) : (
              <DynamicForm
                settings={template.settings}
                onSubmit={handleDeploy}
                isSubmitting={deployMutation.isPending}
              />
            )}
          </CardContent>
        </div>
      </Card>
    </div>
  );
}
