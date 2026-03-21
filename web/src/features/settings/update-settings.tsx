import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Download, CheckCircle, Info, GitBranch } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { TableSkeleton } from '@/components/shared/loading-skeleton';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';

export function UpdateSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [updating, setUpdating] = useState(false);
  const [prerelease, setPrerelease] = useState(false);

  const { data: versionInfo, isLoading: versionLoading } = useQuery({
    queryKey: ['version'],
    queryFn: () => api.getVersion(),
    staleTime: Infinity,
  });

  const {
    data: updateInfo,
    isLoading: checkLoading,
    isFetching: checking,
  } = useQuery({
    queryKey: ['update-check', prerelease],
    queryFn: () => api.checkUpdate({ prerelease }),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const performUpdate = useMutation({
    mutationFn: (version: string) => api.performUpdate(version),
    onMutate: () => setUpdating(true),
    onSuccess: () => {
      toast.success(t('settings.update_started'));
      // Signal SSE reconnect handler to reload the page when the new container is ready
      sessionStorage.setItem('passim-update-pending', String(Date.now()));
    },
    onError: (err) => {
      setUpdating(false);
      toast.error(err.message);
    },
  });

  function handleCheckUpdate() {
    queryClient.invalidateQueries({ queryKey: ['update-check', prerelease] });
  }

  function handlePrereleaseToggle(checked: boolean) {
    setPrerelease(checked);
    // queryKey changes will trigger refetch automatically
  }

  const isDev = !versionInfo?.version
    || versionInfo.version === 'dev'
    || versionInfo.version === 'unknown'
    || versionInfo.version.startsWith('dev-');

  if (versionLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.system')}</CardTitle>
        </CardHeader>
        <CardContent>
          <TableSkeleton rows={3} />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Version Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Info className="size-5" />
            <CardTitle>{t('settings.version_info')}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-base">{t('settings.current_version')}</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono">{versionInfo?.version ?? '-'}</span>
              {isDev && (
                <Badge variant="secondary">{t('settings.dev_build')}</Badge>
              )}
            </div>
          </div>

          {versionInfo?.commit && versionInfo.commit !== 'unknown' && (
            <div className="flex items-center justify-between">
              <Label className="text-base">{t('settings.commit')}</Label>
              <span className="text-sm font-mono text-muted-foreground">
                {versionInfo.commit}
              </span>
            </div>
          )}

          {versionInfo?.build_time && versionInfo.build_time !== 'unknown' && (
            <div className="flex items-center justify-between">
              <Label className="text-base">{t('settings.build_time')}</Label>
              <span className="text-sm text-muted-foreground">
                {formatBuildTime(versionInfo.build_time)}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Update Check */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Download className="size-5" />
            <CardTitle>{t('settings.software_update')}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Prerelease toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">{t('settings.include_prerelease')}</Label>
              <p className="text-sm text-muted-foreground">{t('settings.include_prerelease_desc')}</p>
            </div>
            <Switch
              checked={prerelease}
              onCheckedChange={handlePrereleaseToggle}
            />
          </div>

          <div className="border-t pt-4">
            {checkLoading ? (
              <TableSkeleton rows={1} />
            ) : updateInfo?.available ? (
              <>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {isDev
                          ? t('settings.latest_release')
                          : t('settings.update_available')}
                      </span>
                      <Badge>{updateInfo.latest}</Badge>
                      {updateInfo.prerelease && (
                        <Badge variant="outline">{t('settings.prerelease')}</Badge>
                      )}
                    </div>
                    {updateInfo.published_at && (
                      <p className="text-xs text-muted-foreground">
                        {t('settings.published_at', { date: formatBuildTime(updateInfo.published_at) })}
                      </p>
                    )}
                  </div>
                  <Button
                    onClick={() => performUpdate.mutate(updateInfo.latest)}
                    disabled={updating}
                  >
                    {updating ? (
                      <RefreshCw className="size-4 animate-spin" />
                    ) : (
                      <Download className="size-4" />
                    )}
                    {updating
                      ? t('settings.updating')
                      : isDev
                        ? t('settings.switch_to_release')
                        : t('settings.install_update')}
                  </Button>
                </div>

                {isDev && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {t('settings.dev_switch_notice')}
                  </p>
                )}

                {updateInfo.changelog && (
                  <div className="space-y-2 mt-4">
                    <Label className="text-sm text-muted-foreground">
                      {t('settings.changelog')}
                    </Label>
                    <div className="rounded-md border bg-muted/50 p-3 text-sm whitespace-pre-wrap max-h-48 overflow-y-auto">
                      {updateInfo.changelog}
                    </div>
                  </div>
                )}

                {updating && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-4">
                    <RefreshCw className="size-4 animate-spin" />
                    {t('settings.update_in_progress')}
                  </div>
                )}
              </>
            ) : updateInfo ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="size-4" />
                  <span className="text-sm">{t('settings.up_to_date')}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCheckUpdate}
                  disabled={checking}
                >
                  <RefreshCw className={`size-4 ${checking ? 'animate-spin' : ''}`} />
                  {t('settings.check_update')}
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {t('settings.update_not_checked')}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCheckUpdate}
                  disabled={checking}
                >
                  <RefreshCw className={`size-4 ${checking ? 'animate-spin' : ''}`} />
                  {t('settings.check_update')}
                </Button>
              </div>
            )}
          </div>

          {/* Dev channel — force pull latest main build */}
          {prerelease && (
            <div className="border-t pt-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <GitBranch className="size-4" />
                    <Label className="text-base">{t('settings.dev_channel')}</Label>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.dev_channel_desc')}
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => performUpdate.mutate('dev')}
                  disabled={updating}
                >
                  {updating ? (
                    <RefreshCw className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  {updating ? t('settings.updating') : t('settings.pull_latest_dev')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatBuildTime(dateStr: string): string {
  if (!dateStr || dateStr === 'unknown') return '-';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
