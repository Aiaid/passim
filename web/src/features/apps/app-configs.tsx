import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, QrCode, FileText } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { useAppConfigs, useAppConfigFile } from './queries';

interface AppConfigsProps {
  appId: string;
}

export function AppConfigs({ appId }: AppConfigsProps) {
  const { t } = useTranslation();
  const { data: configs, isLoading } = useAppConfigs(appId);
  const [qrFile, setQrFile] = useState<string | null>(null);
  const [downloadFile, setDownloadFile] = useState<string | null>(null);

  const { data: qrContent } = useAppConfigFile(appId, qrFile);
  const { data: dlContent } = useAppConfigFile(appId, downloadFile);

  // Trigger download when content arrives
  if (dlContent && downloadFile) {
    const blob = new Blob([dlContent.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadFile;
    a.click();
    URL.revokeObjectURL(url);
    setDownloadFile(null);
  }

  if (isLoading) {
    return null;
  }

  if (!configs || configs.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title={t('app.no_configs')}
        description={t('app.no_configs_desc')}
      />
    );
  }

  return (
    <>
      <div className="space-y-3">
        {configs.map((file) => (
          <Card key={file}>
            <CardContent className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <FileText className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">{file}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDownloadFile(file)}
                >
                  <Download className="mr-1 size-4" />
                  {t('app.download')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setQrFile(file)}
                >
                  <QrCode className="mr-1 size-4" />
                  {t('app.qr_code')}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!qrFile} onOpenChange={(open) => !open && setQrFile(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{qrFile}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center p-6">
            {qrContent ? (
              <QRCodeSVG value={qrContent.content} size={256} />
            ) : (
              <div className="size-64 animate-pulse rounded bg-muted" />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
