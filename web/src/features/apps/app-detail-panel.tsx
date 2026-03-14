import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { X, ExternalLink, RotateCcw, Package } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/shared/status-badge';
import { CATEGORY_ICONS } from '@/lib/constants';
import type { AppResponse, TemplateSummary } from '@/lib/api-client';
import { useContainerLogs } from '@/features/containers/queries';

interface AppDetailPanelProps {
  app: AppResponse | null;
  template?: TemplateSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AppDetailPanel({
  app,
  template,
  open,
  onOpenChange,
}: AppDetailPanelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (!app) return null;

  const Icon = template
    ? CATEGORY_ICONS[template.category] || Package
    : Package;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        showCloseButton={false}
        className="sm:max-w-lg w-full flex flex-col p-0 gap-0"
      >
        {/* Header */}
        <SheetHeader className="px-5 py-4 border-b space-y-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Icon className="size-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <SheetTitle className="text-base truncate">
                  {app.template}
                </SheetTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  <StatusBadge status={app.status} />
                </p>
              </div>
            </div>
            <div className="flex items-center gap-0.5 shrink-0 ml-3">
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => {
                  onOpenChange(false);
                  navigate(`/apps/${app.id}`);
                }}
                title={t('app.detail')}
              >
                <ExternalLink className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => onOpenChange(false)}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        {/* Tabs */}
        <Tabs defaultValue="info" className="flex-1 flex flex-col overflow-hidden">
          <div className="px-5 pt-3">
            <TabsList className="w-full">
              <TabsTrigger value="info" className="flex-1">
                {t('app.info')}
              </TabsTrigger>
              <TabsTrigger value="logs" className="flex-1">
                {t('container.logs')}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="info" className="flex-1 overflow-auto mt-0 px-5 py-4">
            <AppInfoTab app={app} />
          </TabsContent>

          <TabsContent value="logs" className="flex-1 overflow-hidden mt-0">
            <AppLogsTab app={app} />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

/* ── Info Tab ────────────────────────────────────── */

function AppInfoTab({ app }: { app: AppResponse }) {
  const { t } = useTranslation();

  const fields = [
    { label: t('app.status'), value: <StatusBadge status={app.status} /> },
    {
      label: t('app.container'),
      value: app.container_id ? app.container_id.slice(0, 12) : '-',
      mono: true,
    },
    {
      label: t('app.deployed_at'),
      value: new Date(app.deployed_at).toLocaleString(),
    },
    {
      label: t('app.updated_at'),
      value: new Date(app.updated_at).toLocaleString(),
    },
  ];

  return (
    <div className="space-y-4">
      {fields.map((f) => (
        <div key={f.label} className="flex items-start justify-between gap-4">
          <span className="text-sm text-muted-foreground shrink-0">
            {f.label}
          </span>
          {typeof f.value === 'string' ? (
            <span
              className={`text-sm text-right truncate max-w-[60%] ${f.mono ? 'font-mono' : ''}`}
            >
              {f.value}
            </span>
          ) : (
            f.value
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Logs Tab ────────────────────────────────────── */

function AppLogsTab({ app }: { app: AppResponse }) {
  const { t } = useTranslation();
  const containerId = app.container_id || null;
  const { data, isLoading, refetch } = useContainerLogs(containerId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const lines = useMemo(() => {
    if (!data?.logs) return [];
    const raw = data.logs.split('\n');
    while (raw.length > 0 && raw[raw.length - 1] === '') raw.pop();
    return raw;
  }, [data?.logs]);

  useEffect(() => {
    if (lines.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [lines]);

  if (!containerId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">{t('common.no_data')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Terminal chrome */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-[oklch(0.577_0.245_27)]" />
            <span className="size-2.5 rounded-full bg-[oklch(0.75_0.18_80)]" />
            <span className="size-2.5 rounded-full bg-[oklch(0.65_0.2_145)]" />
          </div>
          <span className="text-[11px] text-zinc-500 font-mono ml-1">
            {app.template}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-zinc-400 hover:text-zinc-200"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          <RotateCcw className={`size-3 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Terminal body */}
      <div className="flex-1 min-h-0 bg-zinc-950 overflow-y-auto" ref={scrollRef}>
        <div className="p-3">
          {isLoading ? (
            <p className="text-xs font-mono text-zinc-500 p-2">
              {t('common.loading')}
            </p>
          ) : lines.length === 0 ? (
            <p className="text-xs font-mono text-zinc-500 p-2">
              {t('common.no_data')}
            </p>
          ) : (
            <div className="font-mono text-xs leading-5">
              {lines.map((line, i) => (
                <div
                  key={i}
                  className="flex hover:bg-zinc-900/60 rounded-sm group"
                >
                  <span className="select-none text-right text-zinc-600 w-8 shrink-0 pr-3 group-hover:text-zinc-500">
                    {i + 1}
                  </span>
                  <span className="text-zinc-300 whitespace-pre-wrap break-all flex-1">
                    {line}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
