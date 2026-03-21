import { useTranslation } from 'react-i18next';
import { Key, Fingerprint } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { PasskeyList } from './passkey-list';
import { PasskeyRegister } from './passkey-register';

export function SecuritySettings() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      {/* API Key Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="size-5" />
            <CardTitle>{t('settings.api_key')}</CardTitle>
          </div>
          <CardDescription>{t('settings.api_key_desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <code className="rounded bg-muted px-3 py-1.5 text-sm font-mono">
              psk_****
            </code>
            <Badge variant="secondary">{t('settings.api_key_configured')}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Passkeys Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Fingerprint className="size-5" />
                <CardTitle>{t('settings.passkeys')}</CardTitle>
              </div>
              <CardDescription className="mt-1.5">
                {t('settings.passkeys_desc')}
              </CardDescription>
            </div>
            <PasskeyRegister />
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="pt-6">
          <PasskeyList />
        </CardContent>
      </Card>
    </div>
  );
}
