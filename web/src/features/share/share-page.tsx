import { useState } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Download, QrCode, Copy, Check, FileText, ShieldCheck, Globe,
  ExternalLink, Smartphone, Monitor, AlertTriangle, X,
  Zap, Lock, Shield, HardDrive, Folder, Terminal,
  HelpCircle, Sparkles, AppWindow, Star, Lightbulb, BadgeDollarSign, BadgeCheck,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '@/lib/api-client';
import type { ShareConfigResponse, GuidePlatform, GuideClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CredentialField } from '@/components/shared/credential-field';

// ─── Locale + plain-language strings ────────────────────
// Share page is viewed by recipients whose locale we don't know — pick by browser.

type Lang = 'en-US' | 'zh-CN';
function pickLang(): Lang {
  if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('zh')) {
    return 'zh-CN';
  }
  return 'en-US';
}
function pickLocalized(map: Record<string, string> | undefined, lang: Lang): string | undefined {
  if (!map) return undefined;
  return map[lang] ?? map['en-US'] ?? Object.values(map)[0];
}

const STR = {
  'en-US': {
    your_connection: 'Your Connection',
    what_is_this: 'What is this?',
    what_you_need: 'What you need',
    what_you_can_do: 'What you can do',
    install_app_below: 'A small app on your phone or computer — see install steps below.',
    how_to_connect: 'How to connect',
    limitations: 'Good to know',
    link_unavailable: 'Link unavailable',
    link_unavailable_desc: 'This share link has expired or been revoked. Ask the sender for a new link.',
    recommended: 'Recommended',
    free: 'Free',
    paid: 'Paid',
    builtin: 'Built-in',
    app_store: 'App Store',
    play_store: 'Play Store',
    download: 'Download',
    homepage: 'Homepage',
    note: 'Tip',
    no_steps: 'See the app\'s own help for setup steps.',
  },
  'zh-CN': {
    your_connection: '你的连接',
    what_is_this: '这是什么？',
    what_you_need: '需要安装什么',
    what_you_can_do: '可以用来做什么',
    install_app_below: '在手机或电脑上装一个小 App — 安装步骤见下方。',
    how_to_connect: '如何连接',
    limitations: '注意事项',
    link_unavailable: '链接不可用',
    link_unavailable_desc: '该分享链接已过期或被撤销，请向发送者索取新链接。',
    recommended: '推荐',
    free: '免费',
    paid: '付费',
    builtin: '系统自带',
    app_store: 'App Store',
    play_store: 'Play 商店',
    download: '下载',
    homepage: '官网',
    note: '提示',
    no_steps: '请查看 App 自带的帮助文档了解配置方法。',
  },
} satisfies Record<Lang, Record<string, string>>;

// "What you can do" blurbs by template category — written for non-technical readers.
const CATEGORY_PURPOSE: Record<string, Record<Lang, string>> = {
  vpn: {
    'en-US': 'Encrypt your internet traffic, hide your real location, and reach websites or services that may be blocked on your current network.',
    'zh-CN': '加密你的网络流量，隐藏真实位置，访问当前网络下被封锁的网站或服务（俗称"翻墙 / 科学上网"）。',
  },
  storage: {
    'en-US': 'Open and save files stored on a remote computer, as if they were on your own device.',
    'zh-CN': '像访问本地文件一样，打开和保存远程电脑上的文件。',
  },
  tools: {
    'en-US': 'Connect to a remote machine — view its desktop, transfer files, or run apps from anywhere.',
    'zh-CN': '连接到一台远程电脑 — 查看桌面、传输文件，或在任何地方使用上面的应用。',
  },
};

// Friendly fallback descriptions per template name (used when the template's
// own description is too jargon-heavy — kept short, no protocol acronyms).
const TEMPLATE_PLAIN: Record<string, Record<Lang, string>> = {
  hysteria: {
    'en-US': 'Hysteria 2 — a fast, hard-to-block VPN designed for poor or restricted networks.',
    'zh-CN': 'Hysteria 2 — 一种快速、难以封锁的 VPN，专为网络质量差或受限的环境设计。',
  },
  wireguard: {
    'en-US': 'WireGuard — a modern, lightweight VPN that connects your device to a private network.',
    'zh-CN': 'WireGuard — 一种现代、轻量的 VPN，把你的设备接入一个专属的私有网络。',
  },
  v2ray: {
    'en-US': 'V2Ray — a flexible proxy that helps you bypass network restrictions.',
    'zh-CN': 'V2Ray — 一种灵活的代理工具，可帮助你绕过网络限制。',
  },
  l2tp: {
    'en-US': 'L2TP/IPSec — a classic VPN supported out-of-the-box on most phones and computers.',
    'zh-CN': 'L2TP/IPSec — 一种经典 VPN，绝大多数手机和电脑系统自带支持，无需额外安装。',
  },
  samba: {
    'en-US': 'Samba — share folders over your local network so other devices can read and write files.',
    'zh-CN': 'Samba — 在局域网内共享文件夹，让其他设备可以读写文件。',
  },
  webdav: {
    'en-US': 'WebDAV — access remote folders from a file manager, just like a local drive.',
    'zh-CN': 'WebDAV — 在文件管理器里访问远程文件夹，像本地磁盘一样使用。',
  },
  rdesktop: {
    'en-US': 'Remote Desktop — see and control a computer\'s screen from another device.',
    'zh-CN': '远程桌面 — 在另一台设备上查看并操控这台电脑的屏幕。',
  },
};

// Map template icon name → lucide component, for the page header.
const TEMPLATE_ICONS: Record<string, typeof Zap> = {
  zap: Zap,
  lock: Lock,
  shield: Shield,
  globe: Globe,
  monitor: Monitor,
  'hard-drive': HardDrive,
  folder: Folder,
};

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

  const lang = pickLang();
  const t = STR[lang];

  if (error || !data) {
    return (
      <Shell>
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center size-14 rounded-full bg-destructive/10">
            <AlertTriangle className="size-7 text-destructive" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">{t.link_unavailable}</h1>
          <p className="text-sm text-muted-foreground max-w-xs">
            {t.link_unavailable_desc}
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="w-full max-w-lg space-y-6 share-stagger">
        {/* Header — name + plain-language explainer */}
        <ShareHeader config={data} lang={lang} fallbackTitle={t.your_connection} />

        {/* Plain-language "What this is / What you need / What you can do" */}
        <ExplainerCard config={data} lang={lang} t={t} />

        {/* Content by type */}
        {data.type === 'file_per_user' && <ShareFiles token={token!} config={data} />}
        {data.type === 'credentials' && <ShareCredentials config={data} />}
        {data.type === 'url' && <ShareURLs token={token!} config={data} />}

        {/* Guide */}
        {data.guide?.platforms && data.guide.platforms.length > 0 && (
          <ShareGuide platforms={data.guide.platforms} title={t.how_to_connect} lang={lang} t={t} />
        )}

        {/* Limitations */}
        {data.limitations && data.limitations.length > 0 && (
          <div className="share-card">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              {t.limitations}
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

// ─── Header (template name + icon) ──────────────────────

const TYPE_ICONS = {
  file_per_user: FileText,
  credentials: ShieldCheck,
  url: Globe,
} as const;

function ShareHeader({
  config, lang, fallbackTitle,
}: {
  config: ShareConfigResponse; lang: Lang; fallbackTitle: string;
}) {
  const TemplateIcon = config.template_icon
    ? (TEMPLATE_ICONS[config.template_icon] ?? TYPE_ICONS[config.type])
    : TYPE_ICONS[config.type];
  // Capitalize template name (e.g. "hysteria" → "Hysteria")
  const title = config.template_name
    ? config.template_name.charAt(0).toUpperCase() + config.template_name.slice(1)
    : fallbackTitle;
  const subtitle = pickLocalized(config.template_description, lang);

  return (
    <header className="text-center space-y-3">
      <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-primary/10 text-primary">
        <TemplateIcon className="size-7" />
      </div>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground tracking-tight">{title}</h1>
        {subtitle && (
          <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
    </header>
  );
}

// ─── Explainer (what / what-you-need / what-you-can-do) ──

function ExplainerCard({
  config, lang, t,
}: {
  config: ShareConfigResponse;
  lang: Lang;
  t: (typeof STR)[Lang];
}) {
  // "What is this?" — prefer the friendly per-template blurb, fall back to template description.
  const whatIsThis = (config.template_name && TEMPLATE_PLAIN[config.template_name]?.[lang])
    ?? pickLocalized(config.template_description, lang);

  // "What you can do" — by category.
  const whatYouCanDo = config.template_category
    ? CATEGORY_PURPOSE[config.template_category]?.[lang]
    : undefined;

  // If we have nothing useful to say, hide the card entirely.
  if (!whatIsThis && !whatYouCanDo) return null;

  return (
    <div className="share-card space-y-3">
      {whatIsThis && (
        <ExplainerRow icon={HelpCircle} label={t.what_is_this} body={whatIsThis} />
      )}
      <ExplainerRow icon={AppWindow} label={t.what_you_need} body={t.install_app_below} />
      {whatYouCanDo && (
        <ExplainerRow icon={Sparkles} label={t.what_you_can_do} body={whatYouCanDo} />
      )}
    </div>
  );
}

function ExplainerRow({
  icon: Icon, label, body,
}: {
  icon: typeof HelpCircle; label: string; body: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="size-4 text-primary mt-0.5 shrink-0" />
      <div className="space-y-0.5">
        <p className="text-xs font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
      </div>
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
  iPadOS: Smartphone,
  Android: Smartphone,
  Windows: Monitor,
  macOS: Monitor,
  Linux: Terminal,
};

function ShareGuide({
  platforms, title, lang, t,
}: {
  platforms: GuidePlatform[];
  title: string;
  lang: Lang;
  t: (typeof STR)[Lang];
}) {
  // Default to the first platform's tab.
  const [active, setActive] = useState(platforms[0]?.name ?? '');
  const current = platforms.find((p) => p.name === active) ?? platforms[0];
  if (!current) return null;

  return (
    <div className="share-card">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        {title}
      </h3>

      {/* Platform tabs */}
      <div className="flex flex-wrap gap-1 mb-4 border-b border-border/50 -mx-1 px-1 overflow-x-auto">
        {platforms.map((p) => {
          const Icon = platformIcons[p.name] || Monitor;
          const selected = p.name === current.name;
          return (
            <button
              key={p.name}
              type="button"
              onClick={() => setActive(p.name)}
              className={
                'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ' +
                (selected
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground')
              }
            >
              <Icon className="size-3.5" />
              {p.name}
            </button>
          );
        })}
      </div>

      {/* Selected platform body */}
      <PlatformBody platform={current} lang={lang} t={t} />
    </div>
  );
}

function PlatformBody({
  platform, lang, t,
}: {
  platform: GuidePlatform;
  lang: Lang;
  t: (typeof STR)[Lang];
}) {
  const platformNote = pickLocalized(platform.notes, lang);

  // Rich path: clients[]
  if (platform.clients && platform.clients.length > 0) {
    return (
      <div className="space-y-3">
        {platform.clients.map((c) => (
          <ClientCard key={c.name} client={c} lang={lang} t={t} />
        ))}
        {platformNote && (
          <div className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2">
            <Lightbulb className="size-3.5 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">{platformNote}</p>
          </div>
        )}
      </div>
    );
  }

  // Legacy path: flat steps[] (single app per platform)
  const storeLink = platform.store_url || platform.download_url;
  return (
    <div className="space-y-2">
      {storeLink && (
        <a
          href={storeLink}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <ExternalLink className="size-3.5" />
          {t.download}
        </a>
      )}
      {platform.steps && platform.steps.length > 0 ? (
        <ol className="list-decimal list-inside text-xs text-muted-foreground space-y-1 leading-relaxed">
          {platform.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-muted-foreground italic">{t.no_steps}</p>
      )}
      {platformNote && (
        <div className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2">
          <Lightbulb className="size-3.5 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">{platformNote}</p>
        </div>
      )}
    </div>
  );
}

function ClientCard({
  client, lang, t,
}: {
  client: GuideClient;
  lang: Lang;
  t: (typeof STR)[Lang];
}) {
  const steps = client.steps?.[lang] ?? client.steps?.['en-US'] ?? [];
  const note = pickLocalized(client.note, lang);

  // Pick the best store link label by URL host.
  const storeLink = client.store_url || client.download_url;
  const storeLabel = (() => {
    if (!storeLink) return null;
    try {
      const u = new URL(storeLink);
      if (u.hostname.includes('apps.apple.com') || u.hostname.includes('itunes.apple.com')) return t.app_store;
      if (u.hostname.includes('play.google.com')) return t.play_store;
      return t.download;
    } catch {
      return t.download;
    }
  })();

  return (
    <div className="rounded-lg border border-border/60 p-3 space-y-2.5">
      {/* Header: name + badges */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-semibold">{client.name}</span>
          {client.recommended && (
            <Badge tone="primary" icon={Star}>
              {t.recommended}
            </Badge>
          )}
          {client.builtin && (
            <Badge tone="muted" icon={BadgeCheck}>
              {t.builtin}
            </Badge>
          )}
          {client.paid && (
            <Badge tone="muted" icon={BadgeDollarSign}>
              {t.paid}
            </Badge>
          )}
          {!client.paid && !client.builtin && (
            <Badge tone="muted">{t.free}</Badge>
          )}
        </div>
      </div>

      {/* Action links */}
      <div className="flex flex-wrap gap-1.5">
        {storeLink && storeLabel && (
          <a
            href={storeLink}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline rounded-md border border-primary/30 px-2 py-1"
          >
            <Download className="size-3" />
            {storeLabel}
          </a>
        )}
        {client.homepage_url && (
          <a
            href={client.homepage_url}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground rounded-md border border-border px-2 py-1"
          >
            <ExternalLink className="size-3" />
            {t.homepage}
          </a>
        )}
      </div>

      {/* Steps */}
      {steps.length > 0 ? (
        <ol className="list-decimal list-inside text-xs text-muted-foreground space-y-1 leading-relaxed pl-1">
          {steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-muted-foreground italic">{t.no_steps}</p>
      )}

      {/* Per-client note */}
      {note && (
        <div className="flex items-start gap-2 rounded-md bg-amber-500/5 border border-amber-500/20 px-2.5 py-1.5">
          <Lightbulb className="size-3 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground">{t.note}: </span>
            {note}
          </p>
        </div>
      )}
    </div>
  );
}

function Badge({
  children, tone, icon: Icon,
}: {
  children: React.ReactNode;
  tone: 'primary' | 'muted';
  icon?: typeof Star;
}) {
  const cls =
    tone === 'primary'
      ? 'bg-primary/15 text-primary'
      : 'bg-muted text-muted-foreground';
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {Icon && <Icon className="size-2.5" />}
      {children}
    </span>
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
