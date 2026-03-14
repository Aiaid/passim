import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  MoreHorizontal,
  Play,
  Square,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import type { Container } from '@/lib/api-client';
import { useContainerAction, useRemoveContainer } from './queries';

interface ContainerActionsProps {
  container: Container;
}

export function ContainerActions({ container }: ContainerActionsProps) {
  const { t } = useTranslation();
  const [removeOpen, setRemoveOpen] = useState(false);
  const containerAction = useContainerAction();
  const removeContainer = useRemoveContainer();

  const isRunning = container.State === 'running';
  const name = container.Names[0]?.replace(/^\//, '') ?? container.Id.slice(0, 12);
  const isPending = containerAction.isPending || removeContainer.isPending;

  function handleAction(action: 'start' | 'stop' | 'restart') {
    containerAction.mutate(
      { id: container.Id, action },
      {
        onSuccess: () => {
          toast.success(t(`container.${action}`) + ': ' + name);
        },
        onError: (error) => {
          toast.error(error.message);
        },
      },
    );
  }

  function handleRemove() {
    removeContainer.mutate(container.Id, {
      onSuccess: () => {
        toast.success(t('container.remove') + ': ' + name);
        setRemoveOpen(false);
      },
      onError: (error) => {
        toast.error(error.message);
      },
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" disabled={isPending}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {isRunning ? (
            <>
              <DropdownMenuItem onClick={() => handleAction('stop')}>
                <Square className="size-4 mr-2" />
                {t('container.stop')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAction('restart')}>
                <RotateCcw className="size-4 mr-2" />
                {t('container.restart')}
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuItem onClick={() => handleAction('start')}>
                <Play className="size-4 mr-2" />
                {t('container.start')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setRemoveOpen(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="size-4 mr-2" />
                {t('container.remove')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={t('container.confirm_remove_title')}
        description={t('container.confirm_remove', { name })}
        confirmLabel={t('container.remove')}
        onConfirm={handleRemove}
        destructive
      />
    </>
  );
}
