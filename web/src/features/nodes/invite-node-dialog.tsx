import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { InviteCreateResponse } from '@/lib/api-client';
import { useCreateInvite, useListInvites, useRevokeInvite } from './queries';

interface InviteNodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Default TTL — backend also defaults to 24h, kept explicit for clarity.
const DEFAULT_TTL_SECONDS = 24 * 3600;

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

interface CommandBlockProps {
  command: string;
  testId?: string;
}

function CommandBlock({ command, testId }: CommandBlockProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      toast.success(t('node.invite.copied'));
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t('common.error'));
    }
  };

  return (
    <div className="relative">
      <pre
        data-testid={testId}
        className="overflow-x-auto rounded-md bg-muted p-3 pr-12 text-xs leading-relaxed whitespace-pre-wrap break-all"
      >
        <code>{command}</code>
      </pre>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="absolute right-1 top-1"
        onClick={onCopy}
        aria-label={t('node.invite.copy')}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </Button>
    </div>
  );
}

export function InviteNodeDialog({ open, onOpenChange }: InviteNodeDialogProps) {
  const { t } = useTranslation();
  const createInvite = useCreateInvite();
  const revokeInvite = useRevokeInvite();
  const { data: activeInvites } = useListInvites();
  const [invite, setInvite] = useState<InviteCreateResponse | null>(null);

  // Mint a fresh invite each time the dialog opens.
  useEffect(() => {
    if (open && !invite && !createInvite.isPending) {
      createInvite.mutate(
        { ttl_seconds: DEFAULT_TTL_SECONDS },
        { onSuccess: (data) => setInvite(data) },
      );
    }
    if (!open) {
      setInvite(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onRegenerate = () => {
    setInvite(null);
    createInvite.mutate(
      { ttl_seconds: DEFAULT_TTL_SECONDS },
      { onSuccess: (data) => setInvite(data) },
    );
  };

  const onRevokeCurrent = () => {
    if (!invite) return;
    revokeInvite.mutate(invite.token, {
      onSuccess: () => {
        setInvite(null);
        onOpenChange(false);
      },
    });
  };

  // Other active invites = list minus the one we just created.
  const otherCount = (activeInvites ?? []).filter(
    (i) => i.token !== invite?.token && (!i.revoked_at || i.revoked_at === 0),
  ).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('node.invite.title')}</DialogTitle>
          <DialogDescription>{t('node.invite.description')}</DialogDescription>
        </DialogHeader>

        {!invite ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            {t('node.invite.creating')}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Hub address + expiry */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                <span className="font-medium text-foreground">
                  {t('node.invite.hub_address')}:
                </span>{' '}
                {invite.hub_address}
              </span>
              <span data-testid="invite-expires">
                {t('node.invite.expires_in', { time: formatExpiresIn(invite.expires_at) })}
              </span>
            </div>

            <Tabs defaultValue="shell">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="shell">{t('node.invite.tab.shell')}</TabsTrigger>
                <TabsTrigger value="docker">{t('node.invite.tab.docker')}</TabsTrigger>
                <TabsTrigger value="mobile">{t('node.invite.tab.mobile')}</TabsTrigger>
              </TabsList>
              <TabsContent value="shell" className="mt-3">
                <CommandBlock command={invite.install_cmd} testId="invite-cmd-shell" />
              </TabsContent>
              <TabsContent value="docker" className="mt-3">
                <CommandBlock command={invite.docker_cmd} testId="invite-cmd-docker" />
              </TabsContent>
              <TabsContent value="mobile" className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">{t('node.invite.mobile_hint')}</p>
                <CommandBlock command={invite.docker_cmd} testId="invite-cmd-mobile" />
              </TabsContent>
            </Tabs>

            {otherCount > 0 && (
              <div className="text-xs text-muted-foreground">
                {t('node.invite.active_count', { count: otherCount + 1 })}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {invite && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRevokeCurrent}
              disabled={revokeInvite.isPending}
            >
              {t('node.invite.revoke')}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRegenerate}
            disabled={createInvite.isPending}
          >
            {createInvite.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 size-4" />
            )}
            {t('node.invite.regenerate')}
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t('common.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
