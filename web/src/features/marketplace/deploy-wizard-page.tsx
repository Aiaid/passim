import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, BookOpen, ExternalLink, Package } from 'lucide-react';
import { toast } from 'sonner';
import { useMutation } from '@tanstack/react-query';
import { PageSkeleton } from '@/components/shared/loading-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { CategoryIcon } from '@/components/shared/category-icon';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { CATEGORY_GRADIENTS } from '@/lib/constants';
import { cn, localized } from '@/lib/utils';
import { api } from '@/lib/api-client';
import { useEventStream } from '@/hooks/use-event-stream';
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
  const { nodes } = useEventStream();

  const [deployResult, setDeployResult] = useState<{ appId: string; taskId?: string } | null>(null);
  const [selectedTargets, setSelectedTargets] = useState<Set<string>>(new Set(['local']));

  const connectedNodes = nodes?.filter((n) => n.status === 'connected') ?? [];
  const hasRemoteNodes = connectedNodes.length > 0;

  const batchDeployMutation = useMutation({
    mutationFn: (data: { template: string; settings: Record<string, unknown>; targets: string[] }) =>
      api.batchDeploy(data),
  });

  const nodeDeployMutation = useMutation({
    mutationFn: (data: { nodeId: string; template: string; settings: Record<string, unknown> }) =>
      api.deployNodeApp(data.nodeId, { template: data.template, settings: data.settings }),
  });

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

  function toggleTarget(id: string) {
    setSelectedTargets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleDeploy(settings: Record<string, unknown>) {
    const targets = Array.from(selectedTargets);
    const hasLocal = targets.includes('local');
    const remoteTargets = targets.filter((t) => t !== 'local');

    // Multiple targets (including local + remotes) -> batch deploy
    if (targets.length > 1) {
      batchDeployMutation.mutate(
        { template: template!.name, settings, targets },
        {
          onSuccess: (data) => {
            toast.success(t('marketplace.deploy_success'));
            if (data.task_id) {
              setDeployResult({ appId: '', taskId: data.task_id });
            } else {
              navigate('/apps');
            }
          },
          onError: (error) => {
            toast.error(error.message);
          },
        },
      );
      return;
    }

    // Single remote target
    if (!hasLocal && remoteTargets.length === 1) {
      nodeDeployMutation.mutate(
        { nodeId: remoteTargets[0], template: template!.name, settings },
        {
          onSuccess: () => {
            toast.success(t('marketplace.deploy_success'));
            navigate(`/nodes/${remoteTargets[0]}`);
          },
          onError: (error) => {
            toast.error(error.message);
          },
        },
      );
      return;
    }

    // Local only (default behavior)
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

  const isDeploying = deployMutation.isPending || batchDeployMutation.isPending || nodeDeployMutation.isPending;

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
              <>
                <DynamicForm
                  settings={template.settings}
                  onSubmit={handleDeploy}
                  isSubmitting={isDeploying}
                  submitLabel={selectedTargets.size > 1 ? t('node.batch_deploy') : undefined}
                >
                  {/* Deploy targets section — only shown when remote nodes exist */}
                  {hasRemoteNodes && (
                    <div className="space-y-3">
                      <Separator />
                      <div>
                        <h3 className="text-sm font-medium mb-3">{t('node.deploy_to')}</h3>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="target-local"
                              checked={selectedTargets.has('local')}
                              onCheckedChange={() => toggleTarget('local')}
                            />
                            <Label htmlFor="target-local" className="text-sm cursor-pointer">
                              {t('node.this_server')}
                            </Label>
                          </div>
                          {connectedNodes.map((node) => (
                            <div key={node.id} className="flex items-center gap-2">
                              <Checkbox
                                id={`target-${node.id}`}
                                checked={selectedTargets.has(node.id)}
                                onCheckedChange={() => toggleTarget(node.id)}
                              />
                              <Label htmlFor={`target-${node.id}`} className="text-sm cursor-pointer">
                                {node.name || node.address}
                                {node.country && (
                                  <span className="ml-1 text-xs text-muted-foreground">
                                    ({node.country})
                                  </span>
                                )}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </DynamicForm>
              </>
            )}
          </CardContent>
        </div>
      </Card>
    </div>
  );
}
