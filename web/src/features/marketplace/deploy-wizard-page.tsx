import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Package } from 'lucide-react';
import { toast } from 'sonner';
import { PageSkeleton } from '@/components/shared/loading-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { CATEGORY_ICONS } from '@/lib/constants';
import { localized } from '@/lib/utils';
import { DynamicForm } from './dynamic-form';
import { DeployProgress } from './deploy-progress';
import { useTemplates, useDeployApp } from './queries';

export function DeployWizardPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { template: templateName } = useParams<{ template: string }>();

  const { data: templates, isLoading } = useTemplates();
  const deployMutation = useDeployApp();

  const [deployResult, setDeployResult] = useState<{ appId: string; taskId?: string } | null>(null);

  const template = templates?.find((tpl) => tpl.name === templateName);
  const Icon = template ? (CATEGORY_ICONS[template.category] || Package) : Package;

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

      <Card>
        <CardHeader className="flex flex-row items-start gap-4 space-y-0">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Icon className="size-6 text-muted-foreground" />
          </div>
          <div>
            <CardTitle>{template.name}</CardTitle>
            <CardDescription className="mt-1">
              {localized(template.description, i18n.language)}
            </CardDescription>
          </div>
        </CardHeader>

        <Separator />

        <CardContent className="pt-6">
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
      </Card>
    </div>
  );
}
