import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueries } from '@tanstack/react-query';
import {
  Download, QrCode, FileText, Link2, Copy, Check, Share2,
  Archive, ExternalLink, ShieldCheck, Globe, X, Unlink, Server,
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
import { useEventStream } from '@/hooks/use-event-stream';
import { api } from '@/lib/api-client';
import type { ClientConfigResponse, AppResponse, RemoteNode } from '@/lib/api-client';

interface ClientConfigProps {
  appId: string;
  templateName?: string;
}

// ─── Main Component ──────────────────────────────────────

export function ClientConfig({ appId, templateName }: ClientConfigProps) {
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
      {config.type === 'url' && <URLConfig appId={appId} config={config} templateName={templateName} />}

      {/* Share */}
      {config.share_supported && (
        <ShareSection appId={appId} config={config} />
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

interface NodeURLGroup {
  nodeName: string;
  nodeCountry?: string;
  urls: { name: string; scheme: string; qr?: boolean }[];
}

function useRemoteNodeConfigs(templateName?: string) {
  const { nodes } = useEventStream();
  const connectedNodes = (nodes ?? []).filter((n: RemoteNode) => n.status === 'connected');

  // Fetch apps from each connected node
  const nodeAppQueries = useQueries({
    queries: connectedNodes.map(node => ({
      queryKey: ['nodes', node.id, 'apps'] as const,
      queryFn: () => api.getNodeApps(node.id),
      staleTime: 30_000,
      enabled: !!templateName,
    })),
  });

  // For each node that has a matching app, fetch its client config
  const matchingApps: { nodeId: string; nodeName: string; nodeCountry?: string; appId: string }[] = [];
  connectedNodes.forEach((node, i) => {
    const apps = nodeAppQueries[i]?.data;
    if (!apps || !templateName) return;
    const match = apps.find((a: AppResponse) => a.template === templateName);
    if (match) {
      matchingApps.push({
        nodeId: node.id,
        nodeName: node.name || node.address,
        nodeCountry: node.country,
        appId: match.id,
      });
    }
  });

  const configQueries = useQueries({
    queries: matchingApps.map(({ nodeId, appId }) => ({
      queryKey: ['nodes', nodeId, 'apps', appId, 'client-config'] as const,
      queryFn: () => api.getNodeAppClientConfig(nodeId, appId),
      staleTime: 60_000,
    })),
  });

  const groups: NodeURLGroup[] = [];
  matchingApps.forEach((app, i) => {
    const cfg = configQueries[i]?.data;
    if (cfg?.type === 'url' && cfg.urls && cfg.urls.length > 0) {
      groups.push({
        nodeName: app.nodeName,
        nodeCountry: app.nodeCountry,
        urls: cfg.urls,
      });
    }
  });

  return { remoteGroups: groups, totalNodes: 1 + groups.length };
}

function URLConfig({ appId, config, templateName }: { appId: string; config: ClientConfigResponse; templateName?: string }) {
  const [qrURI, setQrURI] = useState<string | null>(null);
  const { remoteGroups, totalNodes } = useRemoteNodeConfigs(templateName);

  const subscribeURL = config.share_token
    ? `${window.location.origin}/api/s/${config.share_token}/subscribe`
    : (() => {
        const token = localStorage.getItem('auth-token');
        return `${window.location.origin}/api/apps/${appId}/subscribe${token ? `?token=${token}` : ''}`;
      })();

  return (
    <>
      {/* URI entries — local node */}
      <div className="cfg-panel">
        <div className="cfg-stripe cfg-accent-url" />
        <h3 className="text-sm font-semibold text-foreground tracking-tight mb-3">
          Import URI
        </h3>
        <div className="space-y-4">
          {/* Local node URIs */}
          {(config.urls && config.urls.length > 0) && (
            <URIGroup
              label="Local"
              urls={config.urls}
              onQR={setQrURI}
            />
          )}

          {/* Remote node URIs */}
          {remoteGroups.map((group) => (
            <URIGroup
              key={group.nodeName}
              label={group.nodeName}
              country={group.nodeCountry}
              urls={group.urls}
              onQR={setQrURI}
            />
          ))}
        </div>
      </div>

      {/* Subscription */}
      <div className="cfg-sub-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Link2 className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Subscription URL</p>
                {totalNodes > 1 && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-muted text-muted-foreground">
                    <Server className="size-2.5" />
                    {totalNodes}
                  </span>
                )}
              </div>
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

function URIGroup({
  label,
  country,
  urls,
  onQR,
}: {
  label: string;
  country?: string;
  urls: { name: string; scheme: string; qr?: boolean }[];
  onQR: (uri: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        {country && <span className="text-xs">{countryFlag(country)}</span>}
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
          {label}
        </span>
      </div>
      {urls.map((url) => (
        <div key={url.scheme} className="mb-2 last:mb-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground">
              {url.name}
            </span>
            <div className="flex items-center gap-0.5">
              <CopyButton text={url.scheme} />
              {url.qr && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => onQR(url.scheme)}
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
  );
}

function countryFlag(code: string): string {
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

// ─── Share Section ────────────────────────────────────────

function ShareSection({ appId, config }: { appId: string; config: ClientConfigResponse }) {
  const createShare = useCreateShare();
  const revokeShare = useRevokeShare();
  const [qrValue, setQrValue] = useState<string | null>(null);
  const shareTokens = config.share_tokens ?? {};

  // For file_per_user, show per-peer share links
  if (config.type === 'file_per_user' && config.files && config.files.length > 0) {
    const activeCount = config.files.filter((f) => shareTokens[f.index]).length;

    return (
      <div className="cfg-share-panel">
        <div className="flex items-center gap-2 mb-3">
          <Share2 className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground tracking-tight">Share</h3>
          {activeCount > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {activeCount}/{config.files.length} active
            </span>
          )}
        </div>

        <div className="space-y-2">
          {config.files.map((file) => {
            const token = shareTokens[file.index];
            const url = token ? `${window.location.origin}/s/${token}` : null;

            return (
              <div key={file.index} className="flex items-center gap-2 py-1">
                <div className="cfg-idx cfg-accent-file-bg shrink-0">{file.index}</div>
                <span className="text-xs font-medium font-mono text-muted-foreground w-20 truncate shrink-0">
                  {file.name}
                </span>

                {url ? (
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <code className="flex-1 rounded bg-muted/60 px-2 py-1 text-[10px] break-all font-mono border border-border/50 truncate">
                      {url}
                    </code>
                    <CopyButton text={url} />
                    <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => setQrValue(url)}>
                      <QrCode className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="size-7 shrink-0 text-destructive hover:text-destructive"
                      onClick={() => revokeShare.mutate({ id: appId, userIndex: file.index })}
                      disabled={revokeShare.isPending}
                      title="Revoke"
                    >
                      <Unlink className="size-3.5" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline" size="sm"
                    className="h-7 text-xs gap-1.5"
                    onClick={() => createShare.mutate({ id: appId, userIndex: file.index })}
                    disabled={createShare.isPending}
                  >
                    <Share2 className="size-3" />
                    Share
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <QRSpotlight
          open={!!qrValue}
          onClose={() => setQrValue(null)}
          title="Share Link"
          value={qrValue}
        />
      </div>
    );
  }

  // For other types, keep single share link behavior
  const shareToken = config.share_token;
  const shareURL = shareToken ? `${window.location.origin}/s/${shareToken}` : null;

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
            <Button variant="ghost" size="icon" className="size-8" onClick={() => setQrValue(shareURL)}>
              <QrCode className="size-4" />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive"
            onClick={() => revokeShare.mutate({ id: appId })}
            disabled={revokeShare.isPending}
          >
            <Unlink className="size-3.5" />
            Revoke
          </Button>

          <QRSpotlight
            open={!!qrValue}
            onClose={() => setQrValue(null)}
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
