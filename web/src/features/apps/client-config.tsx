import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Download, QrCode, FileText, Link2, Copy, Check, Share2,
  Archive, ExternalLink, ShieldCheck, Globe, X, Unlink,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
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

// ─── Main Component ──────────────────────────────────────

export function ClientConfig({ appId }: ClientConfigProps) {
  const { data: config, isLoading } = useAppClientConfig(appId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="cfg-skeleton h-10 w-48" />
        <div className="cfg-skeleton h-44" />
        <div className="cfg-skeleton h-32" />
      </div>
    );
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

  const typeLabel = TYPE_META[config.type];

  return (
    <div className="cfg-stagger space-y-5">
      {/* Type header */}
      <div className="flex items-center gap-3">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold tracking-wide uppercase ${typeLabel.badgeCls}`}>
          <typeLabel.icon className="size-3.5" />
          {typeLabel.label}
        </span>
        <span className="text-xs text-muted-foreground">{typeLabel.desc}</span>
      </div>

      {/* Content by type */}
      {config.type === 'file_per_user' && <FilePerUserConfig appId={appId} config={config} />}
      {config.type === 'credentials' && <CredentialsConfig config={config} />}
      {config.type === 'url' && <URLConfig appId={appId} config={config} />}

      {/* Share */}
      {config.share_supported && (
        <ShareSection appId={appId} shareToken={config.share_token} />
      )}
    </div>
  );
}

// ─── Type Meta ───────────────────────────────────────────

const TYPE_META = {
  file_per_user: {
    label: 'Files',
    desc: 'Download config files for each user',
    icon: FileText,
    accent: 'cfg-accent-file',
    badgeCls: 'cfg-accent-file-bg',
  },
  credentials: {
    label: 'Credentials',
    desc: 'Server address and login details',
    icon: ShieldCheck,
    accent: 'cfg-accent-cred',
    badgeCls: 'cfg-accent-cred-bg',
  },
  url: {
    label: 'Connection',
    desc: 'Import URIs and subscription',
    icon: Globe,
    accent: 'cfg-accent-url',
    badgeCls: 'cfg-accent-url-bg',
  },
} as const;

// ─── File Per User ───────────────────────────────────────

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

  const files = config.files ?? [];

  return (
    <>
      <div className="cfg-panel">
        <div className="cfg-stripe cfg-accent-file" />

        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground tracking-tight">
            {t('app.config_files', 'Config Files')}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {files.length} {files.length === 1 ? 'file' : 'files'}
            </span>
          </h3>
          {files.length > 1 && (
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={handleZIP}>
              <Archive className="size-3.5" />
              {t('app.download_zip', 'Download All')}
            </Button>
          )}
        </div>

        {/* File manifest */}
        <div className="cfg-stagger -mx-2">
          {files.map((file) => (
            <div key={file.index} className="cfg-file-row">
              <div className="cfg-idx cfg-accent-file-bg">
                {file.index}
              </div>
              <span className="flex-1 text-sm font-medium font-mono truncate">
                {file.name}
              </span>
              <div className="flex items-center gap-0.5 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => handleDownload(file.index, file.name)}
                  title={t('app.download')}
                >
                  <Download className="size-3.5" />
                </Button>
                {config.qr && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => handleQR(file.index)}
                    title={t('app.qr_code', 'QR')}
                  >
                    <QrCode className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* QR Spotlight Dialog */}
      <QRSpotlight
        open={qrIndex !== null}
        onClose={() => { setQrIndex(null); setQrContent(null); }}
        title={files.find((f) => f.index === qrIndex)?.name ?? 'QR Code'}
        value={qrContent}
      />
    </>
  );
}

// ─── Credentials ─────────────────────────────────────────

function CredentialsConfig({ config }: { config: ClientConfigResponse }) {
  return (
    <div className="cfg-panel">
      <div className="cfg-stripe cfg-accent-cred" />
      <h3 className="text-sm font-semibold text-foreground tracking-tight mb-3">
        Connection Details
      </h3>
      <div className="space-y-2.5">
        {config.fields?.map((field) => (
          <CredentialField
            key={field.key}
            label={field.label?.['en-US'] ?? field.key}
            value={field.value}
            sensitive={field.secret ?? false}
          />
        ))}
      </div>
    </div>
  );
}

// ─── URL Config ──────────────────────────────────────────

function URLConfig({ appId, config }: { appId: string; config: ClientConfigResponse }) {
  const [qrURI, setQrURI] = useState<string | null>(null);
  const subscribeURL = `${window.location.origin}/api/apps/${appId}/subscribe`;

  return (
    <>
      {/* URI entries */}
      <div className="cfg-panel">
        <div className="cfg-stripe cfg-accent-url" />
        <h3 className="text-sm font-semibold text-foreground tracking-tight mb-3">
          Import URI
        </h3>
        <div className="space-y-4">
          {config.urls?.map((url) => (
            <div key={url.name}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {url.name}
                </span>
                <div className="flex items-center gap-0.5">
                  <CopyButton text={url.scheme} />
                  {url.qr && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => setQrURI(url.scheme)}
                    >
                      <QrCode className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="cfg-terminal">
                <span className="cfg-terminal-prompt">$</span>
                {url.scheme}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Subscription */}
      <div className="cfg-sub-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Link2 className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Subscription URL</p>
              <p className="text-xs font-mono text-foreground truncate mt-0.5">{subscribeURL}</p>
            </div>
          </div>
          <CopyButton text={subscribeURL} />
        </div>
      </div>

      {/* Import buttons */}
      {config.import_urls && Object.keys(config.import_urls).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(config.import_urls).map(([client, url]) => (
            <Button key={client} variant="outline" size="sm" className="h-8 text-xs gap-1.5" asChild>
              <a href={url}>
                <ExternalLink className="size-3.5" />
                {client.charAt(0).toUpperCase() + client.slice(1)}
              </a>
            </Button>
          ))}
        </div>
      )}

      {/* QR Spotlight */}
      <QRSpotlight
        open={!!qrURI}
        onClose={() => setQrURI(null)}
        title="Connection QR"
        value={qrURI}
      />
    </>
  );
}

// ─── Share Section ────────────────────────────────────────

function ShareSection({ appId, shareToken }: { appId: string; shareToken?: string }) {
  const createShare = useCreateShare();
  const revokeShare = useRevokeShare();
  const [showQR, setShowQR] = useState(false);

  const shareURL = shareToken
    ? `${window.location.origin}/s/${shareToken}`
    : null;

  return (
    <div className="cfg-share-panel">
      <div className="flex items-center gap-2 mb-3">
        <Share2 className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground tracking-tight">Share</h3>
        {shareURL && <div className="cfg-live-dot" title="Link is active" />}
      </div>

      {shareURL ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg bg-muted/60 px-3 py-2 text-xs break-all font-mono border border-border/50">
              {shareURL}
            </code>
            <CopyButton text={shareURL} />
            <Button variant="ghost" size="icon" className="size-8" onClick={() => setShowQR(true)}>
              <QrCode className="size-4" />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive"
            onClick={() => revokeShare.mutate(appId)}
            disabled={revokeShare.isPending}
          >
            <Unlink className="size-3.5" />
            Revoke
          </Button>

          <QRSpotlight
            open={showQR}
            onClose={() => setShowQR(false)}
            title="Share Link"
            value={shareURL}
          />
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={() => createShare.mutate({ id: appId })}
          disabled={createShare.isPending}
        >
          <Share2 className="size-3.5" />
          Create Share Link
        </Button>
      )}
    </div>
  );
}

// ─── QR Spotlight Dialog ─────────────────────────────────

function QRSpotlight({
  open,
  onClose,
  title,
  value,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  value: string | null;
}) {
  if (!open) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="cfg-qr-spotlight border-0 bg-transparent shadow-none max-w-md p-0 [&>button]:hidden">
        <div className="flex flex-col items-center gap-6 py-8">
          {/* Title */}
          <DialogHeader className="text-center">
            <DialogTitle className="text-white/90 text-base font-semibold tracking-tight">
              {title}
            </DialogTitle>
          </DialogHeader>

          {/* QR Code */}
          <div className="cfg-qr-reveal rounded-2xl bg-white p-5">
            {value ? (
              <QRCodeSVG
                value={value}
                size={240}
                bgColor="white"
                fgColor="#0a0e14"
                level="M"
                includeMargin={false}
              />
            ) : (
              <div className="size-60 cfg-skeleton" />
            )}
          </div>

          {/* Subtitle */}
          {value && (
            <p className="text-white/40 text-xs font-mono max-w-xs text-center truncate px-4">
              {value.length > 60 ? value.slice(0, 60) + '...' : value}
            </p>
          )}

          {/* Close */}
          <Button
            variant="ghost"
            size="icon"
            className="size-10 rounded-full text-white/50 hover:text-white hover:bg-white/10"
            onClick={onClose}
          >
            <X className="size-5" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Copy Button ─────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button variant="ghost" size="icon" className="size-7" onClick={handleCopy} title={copied ? 'Copied' : 'Copy'}>
      {copied ? (
        <Check className="size-3.5 text-green-500 cfg-copy-pop" />
      ) : (
        <Copy className="size-3.5" />
      )}
    </Button>
  );
}
