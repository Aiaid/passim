import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Key, Fingerprint, Smartphone, Loader2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { PasskeyList } from './passkey-list';
import { PasskeyRegister } from './passkey-register';
import { api } from '@/lib/api-client';

export function SecuritySettings() {
  const { t } = useTranslation();
  const [qrOpen, setQrOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* API Key Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Key className="size-5" />
                <CardTitle>{t('settings.api_key')}</CardTitle>
              </div>
              <CardDescription className="mt-1.5">{t('settings.api_key_desc')}</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => setQrOpen(true)}>
              <Smartphone className="size-4 mr-1.5" />
              {t('settings.mobile_qr')}
            </Button>
          </div>
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

      <PairingQRDialog open={qrOpen} onOpenChange={setQrOpen} />
    </div>
  );
}

function PairingQRDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const [qrValue, setQrValue] = useState<string | null>(null);
  const [expiresIn, setExpiresIn] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.createPairing();
      const host = window.location.host;
      const payload = JSON.stringify({
        host,
        key: res.token,
        name: res.name || host,
      });
      setQrValue(payload);
      setExpiresIn(res.expires_in);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      generate();
    } else {
      setQrValue(null);
      setExpiresIn(0);
      setError(null);
    }
  }, [open, generate]);

  // Countdown timer
  useEffect(() => {
    if (!open || expiresIn <= 0) return;
    const timer = setInterval(() => {
      setExpiresIn((prev) => {
        if (prev <= 1) {
          setQrValue(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [open, expiresIn > 0]);

  const minutes = Math.floor(expiresIn / 60);
  const seconds = expiresIn % 60;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('settings.mobile_qr')}</DialogTitle>
          <DialogDescription>{t('settings.mobile_qr_desc')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          {loading && <Loader2 className="size-8 animate-spin text-muted-foreground" />}
          {error && (
            <div className="text-center space-y-2">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" onClick={generate}>
                {t('common.retry')}
              </Button>
            </div>
          )}
          {qrValue && (
            <>
              <div className="rounded-xl bg-white p-4">
                <QRCodeSVG value={qrValue} size={220} bgColor="white" fgColor="#0a0e14" level="M" />
              </div>
              <p className="text-sm text-muted-foreground">
                {t('settings.mobile_qr_expires', {
                  time: `${minutes}:${seconds.toString().padStart(2, '0')}`,
                })}
              </p>
            </>
          )}
          {!loading && !error && !qrValue && expiresIn <= 0 && (
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">{t('settings.mobile_qr_expired')}</p>
              <Button variant="outline" size="sm" onClick={generate}>
                {t('settings.mobile_qr_regenerate')}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
