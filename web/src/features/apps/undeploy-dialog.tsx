import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useDeleteApp } from './queries';

interface UndeployDialogProps {
  appId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UndeployDialog({ appId, open, onOpenChange }: UndeployDialogProps) {
  const { t } = useTranslation();
  const deleteApp = useDeleteApp();

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('app.undeploy_title')}
      description={t('app.undeploy_desc')}
      confirmLabel={t('app.undeploy')}
      onConfirm={() => deleteApp.mutate(appId)}
      destructive
    />
  );
}
