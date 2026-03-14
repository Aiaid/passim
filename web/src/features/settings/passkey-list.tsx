import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Fingerprint, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { TableSkeleton } from '@/components/shared/loading-skeleton';
import { usePasskeys, useDeletePasskey } from './queries';

function formatDate(dateStr: string): string {
  if (!dateStr || dateStr === '0001-01-01T00:00:00Z') return '';
  const date = new Date(dateStr);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PasskeyList() {
  const { t } = useTranslation();
  const { data: passkeys, isLoading } = usePasskeys();
  const deletePasskey = useDeletePasskey();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  function handleDelete() {
    if (!deleteTarget) return;
    deletePasskey.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(t('settings.passkey_deleted'));
        setDeleteTarget(null);
      },
    });
  }

  if (isLoading) {
    return <TableSkeleton rows={2} />;
  }

  if (!passkeys || passkeys.length === 0) {
    return (
      <EmptyState
        icon={Fingerprint}
        title={t('settings.passkey_empty')}
        description={t('settings.passkey_empty_desc')}
      />
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('settings.passkey_name')}</TableHead>
            <TableHead>{t('settings.passkey_created')}</TableHead>
            <TableHead>{t('settings.passkey_last_used')}</TableHead>
            <TableHead className="w-[80px]">{t('common.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {passkeys.map((passkey) => (
            <TableRow key={passkey.id}>
              <TableCell className="font-medium">{passkey.name}</TableCell>
              <TableCell>{formatDate(passkey.created_at)}</TableCell>
              <TableCell>
                {passkey.last_used_at && passkey.last_used_at !== '0001-01-01T00:00:00Z'
                  ? formatDate(passkey.last_used_at)
                  : t('settings.passkey_never_used')}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteTarget({ id: passkey.id, name: passkey.name })}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('settings.passkey_delete_title')}
        description={t('settings.passkey_delete_desc', { name: deleteTarget?.name })}
        confirmLabel={t('settings.passkey_delete')}
        onConfirm={handleDelete}
        destructive
      />
    </>
  );
}
