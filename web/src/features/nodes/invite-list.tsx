import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useListInvites, useRevokeInvite } from './queries';

function formatExpiresIn(expiresAt: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = expiresAt - now;
  if (diff <= 0) return '0s';
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${diff}s`;
}

export function InviteList() {
  const { t } = useTranslation();
  const { data: invites, isLoading } = useListInvites();
  const revoke = useRevokeInvite();

  const active = (invites ?? []).filter(
    (i) => !i.revoked_at || i.revoked_at === 0,
  );

  if (isLoading || active.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="mb-3 text-sm font-medium">
        {t('node.invite.active_count', { count: active.length })}
      </h3>
      <ul className="divide-y">
        {active.map((inv) => {
          const tokenPreview =
            inv.token.length > 20
              ? `${inv.token.slice(0, 16)}…${inv.token.slice(-4)}`
              : inv.token;
          return (
            <li
              key={inv.token}
              className="flex items-center justify-between gap-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-xs">{tokenPreview}</div>
                <div className="text-xs text-muted-foreground">
                  {inv.note ? `${inv.note} · ` : ''}
                  {t('node.invite.expires_in', { time: formatExpiresIn(inv.expires_at) })}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => revoke.mutate(inv.token)}
                disabled={revoke.isPending}
                aria-label={t('node.invite.revoke')}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
