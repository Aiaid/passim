import { useTranslation } from 'react-i18next';
import { Shield, CheckCircle, AlertTriangle, Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { TableSkeleton } from '@/components/shared/loading-skeleton';
import { useSSLStatus } from './queries';

function isExpiringSoon(expiresAt: string): boolean {
  if (!expiresAt) return false;
  const expires = new Date(expiresAt);
  const now = new Date();
  const daysUntilExpiry = (expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return daysUntilExpiry < 30;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SSLSettings() {
  const { t } = useTranslation();
  const { data: ssl, isLoading } = useSSLStatus();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.ssl')}</CardTitle>
        </CardHeader>
        <CardContent>
          <TableSkeleton rows={3} />
        </CardContent>
      </Card>
    );
  }

  if (!ssl) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="size-5" />
            <CardTitle>{t('settings.ssl')}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('settings.ssl_not_configured')}</p>
        </CardContent>
      </Card>
    );
  }

  const expiringSoon = isExpiringSoon(ssl.expires_at);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="size-5" />
          <CardTitle>{t('settings.ssl')}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Mode */}
        <div className="flex items-center justify-between">
          <Label className="text-base">{t('settings.ssl_mode')}</Label>
          <Badge variant="secondary">{ssl.mode}</Badge>
        </div>

        {/* Domain */}
        {ssl.domain && (
          <div className="flex items-center justify-between">
            <Label className="text-base">{t('settings.ssl_domain')}</Label>
            <span className="text-sm font-mono">{ssl.domain}</span>
          </div>
        )}

        {/* Status */}
        <div className="flex items-center justify-between">
          <Label className="text-base">
            {ssl.valid ? t('settings.ssl_valid') : t('settings.ssl_invalid')}
          </Label>
          {ssl.valid ? (
            <div className="flex items-center gap-1.5 text-green-600">
              <CheckCircle className="size-4" />
              <span className="text-sm font-medium">{t('settings.ssl_valid')}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-destructive">
              <AlertTriangle className="size-4" />
              <span className="text-sm font-medium">{t('settings.ssl_invalid')}</span>
            </div>
          )}
        </div>

        {/* Expiry */}
        {ssl.expires_at && (
          <div className="flex items-center justify-between">
            <Label className="text-base">{t('settings.ssl_expires')}</Label>
            <span className={`text-sm ${expiringSoon ? 'text-orange-500 font-medium' : ''}`}>
              {expiringSoon && <AlertTriangle className="inline size-3.5 mr-1" />}
              {formatDate(ssl.expires_at)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
