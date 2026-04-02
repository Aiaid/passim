import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Zap, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
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
import { formatBytes } from '@/lib/utils';
import type { TemplateDetail } from '@/lib/api-client';
import {
  useAppUsers,
  useCreateAppUser,
  useUpdateAppUser,
  useDeleteAppUser,
  useKickAppUser,
} from './queries';

interface AppUsersTabProps {
  appId: string;
  templateDetail: TemplateDetail;
}

export function AppUsersTab({ appId, templateDetail }: AppUsersTabProps) {
  const { t } = useTranslation();
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const { data } = useAppUsers(appId, true);
  const createUser = useCreateAppUser();
  const updateUser = useUpdateAppUser();
  const deleteUser = useDeleteAppUser();
  const kickUser = useKickAppUser();

  const users = data?.users ?? [];
  const kickSupported = templateDetail.users?.kick_supported ?? false;
  const hasQuotaField = templateDetail.users?.fields?.some((f) => f.key === 'quota_bytes');

  const handleCreate = (username: string, password: string, quotaBytes: number) => {
    createUser.mutate(
      {
        appId,
        data: {
          username,
          ...(password ? { password } : {}),
          ...(quotaBytes > 0 ? { quota_bytes: quotaBytes } : {}),
        },
      },
      { onSuccess: () => setShowAdd(false) },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          {users.length} {t('app.users').toLowerCase()}
        </h3>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="mr-1 size-4" />
          {t('users.add')}
        </Button>
      </div>

      {users.length === 0 ? (
        <EmptyState icon={Users} title={t('users.no_users')} description={t('users.no_users_desc')} />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('users.username')}</TableHead>
                <TableHead>{t('users.status')}</TableHead>
                {hasQuotaField && <TableHead>{t('users.quota')}</TableHead>}
                <TableHead>{t('users.online')}</TableHead>
                <TableHead className="text-right">{t('users.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const quotaPercent =
                  user.quota_bytes > 0 && user.used_bytes != null
                    ? Math.min(100, (user.used_bytes / user.quota_bytes) * 100)
                    : 0;

                return (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.username}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          size="sm"
                          checked={user.enabled}
                          onCheckedChange={(checked) =>
                            updateUser.mutate({ appId, uid: user.id, data: { enabled: checked } })
                          }
                        />
                        <Badge variant={user.enabled ? 'default' : 'secondary'}>
                          {user.enabled ? t('users.enabled') : t('users.disabled')}
                        </Badge>
                      </div>
                    </TableCell>
                    {hasQuotaField && (
                      <TableCell>
                        {user.quota_bytes > 0 ? (
                          <div className="flex items-center gap-2 min-w-[120px]">
                            <Progress value={quotaPercent} className="h-1.5 flex-1" />
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatBytes(user.used_bytes ?? 0)} / {formatBytes(user.quota_bytes)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">{t('users.unlimited')}</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      {(user.online_connections ?? 0) > 0 ? (
                        <Badge variant="outline" className="text-green-600">
                          {user.online_connections}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {kickSupported && (user.online_connections ?? 0) > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => kickUser.mutate({ appId, uid: user.id })}
                          >
                            <Zap className="size-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget({ id: user.id, name: user.username })}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <AddUserDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        hasQuota={!!hasQuotaField}
        onSubmit={handleCreate}
        isPending={createUser.isPending}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('users.delete_title')}
        description={t('users.delete_desc', { name: deleteTarget?.name })}
        confirmLabel={t('common.delete')}
        onConfirm={() => {
          if (deleteTarget) {
            deleteUser.mutate({ appId, uid: deleteTarget.id });
            setDeleteTarget(null);
          }
        }}
        destructive
      />
    </div>
  );
}

function AddUserDialog({
  open,
  onOpenChange,
  hasQuota,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasQuota: boolean;
  onSubmit: (username: string, password: string, quotaBytes: number) => void;
  isPending: boolean;
}) {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [quotaGB, setQuotaGB] = useState('');

  const reset = () => {
    setUsername('');
    setPassword('');
    setQuotaGB('');
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('users.add')}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const quota = quotaGB ? parseFloat(quotaGB) * 1024 * 1024 * 1024 : 0;
            onSubmit(username, password, quota);
          }}
        >
          <div className="space-y-2">
            <Label>{t('users.username')}</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
          </div>
          <div className="space-y-2">
            <Label>{t('users.password')}</Label>
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('users.password_placeholder')}
            />
          </div>
          {hasQuota && (
            <div className="space-y-2">
              <Label>{t('users.quota')} (GB)</Label>
              <Input
                type="number"
                min="0"
                step="0.1"
                value={quotaGB}
                onChange={(e) => setQuotaGB(e.target.value)}
                placeholder="0 = unlimited"
              />
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={!username.trim() || isPending}>
              {t('users.add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
