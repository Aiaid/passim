import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useTaskStatus } from './queries';

interface DeployProgressProps {
  appId: string;
  taskId?: string;
  onRetry: () => void;
}

function statusToProgress(status: string): number {
  switch (status) {
    case 'pending':
      return 15;
    case 'running':
      return 60;
    case 'done':
      return 100;
    case 'failed':
      return 100;
    default:
      return 0;
  }
}

export function DeployProgress({ appId, taskId, onRetry }: DeployProgressProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { data: task } = useTaskStatus(taskId);
  const status = task?.status ?? 'pending';
  const progress = statusToProgress(status);

  if (status === 'done') {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <CheckCircle className="size-12 text-green-500" />
        <p className="text-lg font-medium">{t('marketplace.deploy_success')}</p>
        <Progress value={100} className="w-full" />
        <Button onClick={() => navigate(`/apps/${appId}`)}>
          {t('marketplace.view_app')}
        </Button>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <XCircle className="size-12 text-destructive" />
        <p className="text-lg font-medium">{t('marketplace.deploy_failed')}</p>
        {task?.result && (
          <p className="text-sm text-muted-foreground max-w-md">{task.result}</p>
        )}
        <Progress value={100} className="w-full" />
        <Button variant="outline" onClick={onRetry}>
          {t('marketplace.retry')}
        </Button>
      </div>
    );
  }

  // pending or running
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <Loader2 className="size-12 animate-spin text-muted-foreground" />
      <p className="text-lg font-medium">{t('marketplace.deploying')}</p>
      <Progress value={progress} className="w-full" />
    </div>
  );
}
