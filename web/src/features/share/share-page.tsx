import { useState } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Download, QrCode, Copy, Check, FileText, ShieldCheck, Globe,
  ExternalLink, Smartphone, Monitor, AlertTriangle, X,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '@/lib/api-client';
import type { ShareConfigResponse, GuidePlatform } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CredentialField } from '@/components/shared/credential-field';

// ─── Page ────────────────────────────────────────────────

export function SharePage() {
  const { token } = useParams<{ token: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['share', token],
    queryFn: () => api.getShareConfig(token!),
    enabled: !!token,
    retry: false,
  });

  if (isLoading) {
    return (
      <Shell>
        <div className="space-y-4 w-full max-w-md">
          <div className="cfg-skeleton h-8 w-40 mx-auto" />
          <div className="cfg-skeleton h-52" />
          <div className="cfg-skeleton h-28" />
        </div>
      </Shell>
    );
  }

  if (error || !data) {
    return (
      <Shell>
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center size-14 rounded-full bg-destructive/10">
            <AlertTriangle className="size-7 text-destructive" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">Link unavailable</h1>
          <p className="text-sm text-muted-foreground max-w-xs">
            This share link has expired or been revoked. Ask the sender for a new link.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="w-full max-w-lg space-y-6 share-stagger">
        {/* Header */}
        <header className="text-center space-y-2">
          <TypeBadge type={data.type} />
          <h1 className="text-lg font-semibold text-foreground tracking-tight">
            Your Connection
          </h1>
        </header>

        {/* Content by type */}
        {data.type === 'file_per_user' && <ShareFiles token={token!} config={data} />}
        {data.type === 'credentials' && <ShareCredentials config={data} />}
        {data.type === 'url' && <ShareURLs token={token!} config={data} />}

        {/* Guide */}
        {data.guide?.platforms && data.guide.platforms.length > 0 && (
          <ShareGuide platforms={data.guide.platforms} />
        )}

        {/* Limitations */}
        {data.limitations && data.limitations.length > 0 && (
          <div className="share-card">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Limitations
            </h3>
            <ul className="text-xs text-muted-foreground space-y-1">
              {data.limitations.map((l, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-muted-foreground/50 mt-px">-</span>
                  {l}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Footer */}
        <footer className="text-center pt-4 pb-8">
          <p className="text-[10px] text-muted-foreground/50 uppercase tracking-widest">
            Powered by Passim
          </p>
        </footer>
      </div>
    </Shell>
  );
}

// ─── Shell ───────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="share-shell">
      <div className="share-noise" />
      <div className="relative z-10 flex items-start justify-center min-h-svh px-4 py-12">
        {children}
      </div>
    </div>
  );
}

// ─── Type Badge ──────────────────────────────────────────

const TYPE_ICONS = {
  file_per_user: FileText,
  credentials: ShieldCheck,
  url: Globe,
} as const;

function TypeBadge({ type }: { type: ShareConfigResponse['type'] }) {
  const Icon = TYPE_ICONS[type];
  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-primary/10 text-primary">
      <Icon className="size-3.5" />
      {type === 'file_per_user' ? 'Config Files' : type === 'credentials' ? 'Credentials' : 'Connection'}
    </div>
  );
}

// ─── File Per User ───────────────────────────────────────

function ShareFiles({ token, config }: { token: string; config: ShareConfigResponse }) {
  const [qrIndex, setQrIndex] = useState<number | null>(null);
  const [qrContent, setQrContent] = useState<string | null>(null);
  const files = config.files ?? [];
  const remoteFileGroups = (config.remote_groups ?? []).filter((g) => g.files && g.files.length > 0);
  const hasMultipleNodes = remoteFileGroups.length > 0;

  const showQR = async (url: string, index: number) => {
    try {
      const resp = await fetch(url);
      setQrContent(await resp.text());
      setQrIndex(index);
    } catch {
      // ignore
    }
  };

  return (
    <>
      {/* Local node files */}
      {files.length > 0 && (
        <div className="share-card">
          {hasMultipleNodes && (
            <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-border/30">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Local</span>
            </div>
          )}
          <div className="space-y-1">
            {files.map((file) => (
              <FileRow
                key={file.index}
                file={file}
                qr={config.qr}
                onDownload={() => {
                  const a = document.createElement('a');
                  a.href = api.getShareFileURL(token, file.index);
                  a.download = file.name;
                  a.click();
                }}
                onQR={() => showQR(api.getShareFileURL(token, file.index), file.index)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Remote node files */}
      {remoteFileGroups.map((group) => (
        <div key={group.node_name} className="share-card">
          <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-border/30">
            {group.node_country && <span className="text-xs">{countryFlag(group.node_country)}</span>}
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              {group.node_name}
            </span>
          </div>
          <div className="space-y-1">
            {group.files!.map((file) => (
              <FileRow
                key={file.index}
                file={file}
                qr={group.qr}
                onDownload={() => {
                  const a = document.createElement('a');
                  a.href = api.getShareRemoteFileURL(token, file.index, group.node_id!, group.app_id!);
                  a.download = file.name;
                  a.click();
                }}
                onQR={() => showQR(
                  api.getShareRemoteFileURL(token, file.index, group.node_id!, group.app_id!),
                  file.index,
                )}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Download All ZIP */}
      {hasMultipleNodes && (
        <Button
          variant="outline" className="w-full gap-2"
          onClick={() => { window.location.href = api.getShareZIPURL(token); }}
        >
          <Download className="size-4" />
          Download All (ZIP)
        </Button>
      )}

      <QRSpotlight
        open={qrIndex !== null}
        onClose={() => { setQrIndex(null); setQrContent(null); }}
        title={`peer${qrIndex}.conf`}
        value={qrContent}
      />
    </>
  );
}

function FileRow({ file, qr, onDownload, onQR }: {
  file: { index: number; name: string };
  qr?: boolean;
  onDownload: () => void;
  onQR: () => void;
}) {
  return (
    <div className="share-file-row">
      <div className="share-file-idx">{file.index}</div>
      <span className="flex-1 text-sm font-medium font-mono truncate">{file.name}</span>
      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="icon" className="size-8" onClick={onDownload}>
          <Download className="size-4" />
        </Button>
        {qr && (
          <Button variant="ghost" size="icon" className="size-8" onClick={onQR}>
            <QrCode className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Credentials ─────────────────────────────────────────

function ShareCredentials({ config }: { config: ShareConfigResponse }) {
  return (
    <div className="share-card space-y-2.5">
      {config.fields?.map((field) => (
        <CredentialField
          key={field.key}
          label={field.label?.['en-US'] ?? field.key}
          value={field.value}
          sensitive={field.secret ?? false}
        />
      ))}
    </div>
  );
}

// ─── URLs ────────────────────────────────────────────────

function countryFlag(code: string): string {
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

function ShareURLs({ token, config }: { token: string; config: ShareConfigResponse }) {
  const [qrURI, setQrURI] = useState<string | null>(null);
  const subscribeURL = `${window.location.origin}/api/s/${token}/subscribe`;
  const totalNodes = 1 + (config.remote_groups?.length ?? 0);

  return (
    <>
      {/* URIs */}
      <div className="share-card space-y-4">
        {/* Local node URIs */}
        {config.urls?.map((url) => (
          <ShareURIEntry key={url.scheme} url={url} onQR={setQrURI} />
        ))}

        {/* Remote node URIs */}
        {config.remote_groups?.map((group) => (
          <div key={group.node_name}>
            <div className="flex items-center gap-1.5 mb-2 pt-2 border-t border-border/30">
              {group.node_country && <span className="text-xs">{countryFlag(group.node_country)}</span>}
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                {group.node_name}
              </span>
            </div>
            {group.urls?.map((url) => (
              <ShareURIEntry key={url.scheme} url={url} onQR={setQrURI} />
            ))}
          </div>
        ))}

        {/* Subscription */}
        <div className="pt-3 border-t border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Subscription
              </span>
              {totalNodes > 1 && (
                <span className="text-[10px] font-semibold text-muted-foreground/60">
                  {totalNodes} nodes
                </span>
              )}
            </div>
            <CopyButton text={subscribeURL} />
          </div>
          <p className="text-xs font-mono text-foreground/70 break-all mt-1.5">{subscribeURL}</p>
        </div>
      </div>

      {/* Import buttons */}
      {config.import_urls && Object.keys(config.import_urls).length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center">
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

      <QRSpotlight
        open={!!qrURI}
        onClose={() => setQrURI(null)}
        title="Connection QR"
        value={qrURI}
      />
    </>
  );
}

function ShareURIEntry({ url, onQR }: { url: { name: string; scheme: string; qr?: boolean }; onQR: (uri: string) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {url.name}
        </span>
        <div className="flex items-center gap-0.5">
          <CopyButton text={url.scheme} />
          {url.qr && (
            <Button variant="ghost" size="icon" className="size-7" onClick={() => onQR(url.scheme)}>
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
  );
}

// ─── Guide ───────────────────────────────────────────────

const platformIcons: Record<string, typeof Smartphone> = {
  iOS: Smartphone,
  Android: Smartphone,
  Windows: Monitor,
  macOS: Monitor,
  Linux: Monitor,
};

function ShareGuide({ platforms }: { platforms: GuidePlatform[] }) {
  return (
    <div className="share-card">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        How to connect
      </h3>
      <div className="space-y-3">
        {platforms.map((platform) => {
          const Icon = platformIcons[platform.name] || Monitor;
          const storeLink = platform.store_url || platform.download_url;
          return (
            <div key={platform.name} className="flex items-start gap-3 rounded-lg border-l-2 border-primary/30 pl-3 py-2">
              <Icon className="size-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{platform.name}</p>
                  {storeLink && (
                    <a href={storeLink} target="_blank" rel="noopener"
                      className="text-xs text-primary hover:underline inline-flex items-center gap-0.5">
                      <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
                <ol className="list-decimal list-inside text-xs text-muted-foreground space-y-0.5">
                  {platform.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── QR Spotlight ────────────────────────────────────────

function QRSpotlight({
  open, onClose, title, value,
}: {
  open: boolean; onClose: () => void; title: string; value: string | null;
}) {
  if (!open) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="cfg-qr-spotlight border-0 bg-transparent shadow-none max-w-md p-0 [&>button]:hidden">
        <div className="flex flex-col items-center gap-6 py-8">
          <DialogHeader className="text-center">
            <DialogTitle className="text-white/90 text-base font-semibold">{title}</DialogTitle>
          </DialogHeader>
          <div className="cfg-qr-reveal rounded-2xl bg-white p-5">
            {value ? (
              <QRCodeSVG value={value} size={240} bgColor="white" fgColor="#0a0e14" level="M" />
            ) : (
              <div className="size-60 cfg-skeleton" />
            )}
          </div>
          {value && (
            <p className="text-white/40 text-xs font-mono max-w-xs text-center truncate px-4">
              {value.length > 60 ? value.slice(0, 60) + '...' : value}
            </p>
          )}
          <Button
            variant="ghost" size="icon"
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
    <Button variant="ghost" size="icon" className="size-7" onClick={handleCopy}>
      {copied ? <Check className="size-3.5 text-green-500 cfg-copy-pop" /> : <Copy className="size-3.5" />}
    </Button>
  );
}
