import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, QrCode, FileText, Link2, Copy, Check, Share2, Archive, ExternalLink } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CredentialField } from '@/components/shared/credential-field';
import { EmptyState } from '@/components/shared/empty-state';
import { useAppClientConfig, useCreateShare, useRevokeShare } from './queries';
import type { ClientConfigResponse } from '@/lib/api-client';

interface ClientConfigProps {
  appId: string;
}

export function ClientConfig({ appId }: ClientConfigProps) {
  const { data: config, isLoading } = useAppClientConfig(appId);

  if (isLoading) {
    return <div className="h-32 animate-pulse rounded-lg bg-muted" />;
  }

  if (!config) {
    return (
      <EmptyState
        icon={FileText}
        title="No client config"
        description="This template does not define client configuration."
      />
    );
  }

  return (
    <div className="space-y-6">
      {config.type === 'file_per_user' && <FilePerUserConfig appId={appId} config={config} />}
      {config.type === 'credentials' && <CredentialsConfig config={config} />}
      {config.type === 'url' && <URLConfig appId={appId} config={config} />}

      {config.share_supported && (
        <ShareSection appId={appId} shareToken={config.share_token} />
      )}
    </div>
  );
}

function FilePerUserConfig({ appId, config }: { appId: string; config: ClientConfigResponse }) {
  const { t } = useTranslation();
  const [qrIndex, setQrIndex] = useState<number | null>(null);
  const [qrContent, setQrContent] = useState<string | null>(null);

  const handleDownload = (index: number, name: string) => {
    const token = localStorage.getItem('auth-token');
    const url = `/api/apps/${appId}/client-config/file/${index}`;
    const a = document.createElement('a');
    a.href = url + (token ? `?token=${token}` : '');
    a.download = name;
    a.click();
  };

  const handleQR = async (index: number) => {
    try {
      const token = localStorage.getItem('auth-token');
      const resp = await fetch(`/api/apps/${appId}/client-config/file/${index}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const text = await resp.text();
      setQrContent(text);
      setQrIndex(index);
    } catch {
      // ignore
    }
  };

  const handleZIP = () => {
    const token = localStorage.getItem('auth-token');
    const url = `/api/apps/${appId}/client-config/zip`;
    const a = document.createElement('a');
    a.href = url + (token ? `?token=${token}` : '');
    a.download = 'configs.zip';
    a.click();
  };

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-muted-foreground">{t('app.config_files', 'Config Files')}</h3>
        {(config.files?.length ?? 0) > 1 && (
          <Button variant="outline" size="sm" onClick={handleZIP}>
            <Archive className="mr-1 size-4" />
            {t('app.download_zip', 'Download ZIP')}
          </Button>
        )}
      </div>
      <div className="space-y-2">
        {config.files?.map((file) => (
          <Card key={file.index}>
            <CardContent className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <FileText className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">{file.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => handleDownload(file.index, file.name)}>
                  <Download className="mr-1 size-4" />
                  {t('app.download')}
                </Button>
                {config.qr && (
                  <Button variant="ghost" size="sm" onClick={() => handleQR(file.index)}>
                    <QrCode className="mr-1 size-4" />
                    {t('app.qr_code', 'QR')}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={qrIndex !== null} onOpenChange={(open) => !open && setQrIndex(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {config.files?.find((f) => f.index === qrIndex)?.name ?? 'QR Code'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center p-6">
            {qrContent ? (
              <QRCodeSVG value={qrContent} size={256} />
            ) : (
              <div className="size-64 animate-pulse rounded bg-muted" />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CredentialsConfig({ config }: { config: ClientConfigResponse }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Connection Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {config.fields?.map((field) => (
          <CredentialField
            key={field.key}
            label={field.label?.['en-US'] ?? field.key}
            value={field.value}
            sensitive={field.secret ?? false}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function URLConfig({ appId, config }: { appId: string; config: ClientConfigResponse }) {
  const [qrURI, setQrURI] = useState<string | null>(null);

  const subscribeURL = `${window.location.origin}/api/apps/${appId}/subscribe`;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {config.urls?.map((url) => (
            <div key={url.name} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{url.name}</span>
                <div className="flex items-center gap-1">
                  <CopyButton text={url.scheme} />
                  {url.qr && (
                    <Button variant="ghost" size="sm" onClick={() => setQrURI(url.scheme)}>
                      <QrCode className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
              <code className="block rounded bg-muted px-3 py-2 text-xs break-all font-mono">
                {url.scheme}
              </code>
            </div>
          ))}

          {/* Subscription URL */}
          <div className="border-t pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium flex items-center gap-1">
                <Link2 className="size-4" />
                Subscription URL
              </span>
              <CopyButton text={subscribeURL} />
            </div>
            <code className="block rounded bg-muted px-3 py-2 text-xs break-all font-mono">
              {subscribeURL}
            </code>
          </div>

          {/* Import buttons */}
          {config.import_urls && Object.keys(config.import_urls).length > 0 && (
            <div className="border-t pt-4 flex flex-wrap gap-2">
              {Object.entries(config.import_urls).map(([client, url]) => (
                <Button key={client} variant="outline" size="sm" asChild>
                  <a href={url}>
                    <ExternalLink className="mr-1 size-4" />
                    Open in {client.charAt(0).toUpperCase() + client.slice(1)}
                  </a>
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!qrURI} onOpenChange={(open) => !open && setQrURI(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>QR Code</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center p-6">
            {qrURI && <QRCodeSVG value={qrURI} size={256} />}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ShareSection({ appId, shareToken }: { appId: string; shareToken?: string }) {
  const createShare = useCreateShare();
  const revokeShare = useRevokeShare();
  const [showQR, setShowQR] = useState(false);

  const shareURL = shareToken
    ? `${window.location.origin}/api/s/${shareToken}`
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Share2 className="size-4" />
          Share
        </CardTitle>
      </CardHeader>
      <CardContent>
        {shareURL ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-muted px-3 py-2 text-xs break-all font-mono">
                {shareURL}
              </code>
              <CopyButton text={shareURL} />
              <Button variant="ghost" size="sm" onClick={() => setShowQR(true)}>
                <QrCode className="size-4" />
              </Button>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => revokeShare.mutate(appId)}
              disabled={revokeShare.isPending}
            >
              Revoke Share Link
            </Button>

            <Dialog open={showQR} onOpenChange={setShowQR}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Share QR Code</DialogTitle>
                </DialogHeader>
                <div className="flex items-center justify-center p-6">
                  <QRCodeSVG value={shareURL} size={256} />
                </div>
              </DialogContent>
            </Dialog>
          </div>
        ) : (
          <Button
            variant="outline"
            onClick={() => createShare.mutate({ id: appId })}
            disabled={createShare.isPending}
          >
            <Share2 className="mr-1 size-4" />
            Create Share Link
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleCopy}>
      {copied ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" />}
    </Button>
  );
}
