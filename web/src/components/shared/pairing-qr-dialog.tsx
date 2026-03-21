import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { api } from '@/lib/api-client';

export function PairingQRDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
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
  const isActive = expiresIn > 0;
  useEffect(() => {
    if (!open || !isActive) return;
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
  }, [open, isActive]);

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
