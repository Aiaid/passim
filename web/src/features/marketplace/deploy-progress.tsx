import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTaskStatus } from './queries';

interface DeployProgressProps {
  appId: string;
  taskId?: string;
  onRetry: () => void;
}

interface Step {
  key: string;
  label: string;
  failed?: boolean;
}

function statusToStepIndex(status: string): number {
  switch (status) {
    case 'queued':
      return 0;
    case 'pulling':
      return 1;
    case 'deploying':
      return 2;
    case 'completed':
      return 4; // past all steps
    case 'failed':
      return 3; // on step 4 (failed)
    default:
      return 0;
  }
}

export function DeployProgress({ appId, taskId, onRetry }: DeployProgressProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { data: task } = useTaskStatus(taskId);
  const status = task?.status ?? 'pending';

  const isFailed = status === 'failed';
  const isDone = status === 'completed';
  const stepIndex = statusToStepIndex(status);

  const steps: Step[] = [
    { key: 'pending', label: t('marketplace.step_pending') },
    { key: 'pulling', label: t('marketplace.step_pulling') },
    { key: 'deploying', label: t('marketplace.step_deploying') },
    { key: 'running', label: isFailed ? t('marketplace.step_failed') : t('marketplace.step_running'), failed: isFailed },
  ];

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Horizontal step indicators */}
      <div className="flex w-full items-center justify-between py-8">
        {steps.map((step, i) => (
          <React.Fragment key={step.key}>
            {i > 0 && (
              <div
                className={cn(
                  'mx-2 h-0.5 flex-1 transition-colors duration-300',
                  stepIndex > i ? 'bg-green-500' : 'bg-muted',
                )}
              />
            )}
            <div className="flex flex-col items-center gap-2">
              <div
                className={cn(
                  'flex size-10 items-center justify-center rounded-full border-2 transition-all duration-300',
                  stepIndex > i
                    ? 'border-green-500 bg-green-500 text-white'
                    : stepIndex === i && step.failed
                      ? 'border-destructive bg-destructive text-white'
                      : stepIndex === i
                        ? 'border-primary text-primary'
                        : 'border-muted text-muted-foreground',
                )}
              >
                {stepIndex > i ? (
                  <Check
                    className="size-5"
                    style={{ animation: 'step-check 0.4s ease-out forwards' }}
                  />
                ) : step.failed && stepIndex === i ? (
                  <X className="size-5" />
                ) : stepIndex === i ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <span className="text-sm">{i + 1}</span>
                )}
              </div>
              <span
                className={cn(
                  'text-xs',
                  stepIndex === i && step.failed
                    ? 'font-medium text-destructive'
                    : stepIndex === i
                      ? 'font-medium text-foreground'
                      : 'text-muted-foreground',
                )}
              >
                {step.label}
              </span>
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* Success state */}
      {isDone && (
        <div className="flex flex-col items-center gap-3 pb-4 text-center">
          <p className="text-lg font-medium">{t('marketplace.deploy_success')}</p>
          <p className="text-sm text-muted-foreground">
            {t('marketplace.connection_info_available')}
          </p>
          <Button onClick={() => navigate(`/apps/${appId}`)} className="mt-2">
            {t('marketplace.view_app')}
          </Button>
        </div>
      )}

      {/* Failure state */}
      {isFailed && (
        <div className="flex flex-col items-center gap-3 pb-4 text-center">
          <p className="text-lg font-medium">{t('marketplace.deploy_failed')}</p>
          {task?.result && (
            <p className="max-w-md text-sm text-muted-foreground">{task.result}</p>
          )}
          <Button variant="outline" onClick={onRetry} className="mt-2">
            {t('marketplace.retry')}
          </Button>
        </div>
      )}
    </div>
  );
}
