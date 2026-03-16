import { useTranslation } from 'react-i18next';
import { X, Server, Globe, Cpu, Container, Gauge } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { formatBytes, formatUptime } from '@/lib/utils';
import { useEventStream } from '@/hooks/use-event-stream';

interface NodeDetailPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function countryFlag(code: string): string {
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

export function NodeDetailPanel({ open, onOpenChange }: NodeDetailPanelProps) {
  const { t } = useTranslation();
  const { status } = useEventStream();

  if (!status) return null;

  const { node, system, containers } = status;

  const sections = [
    {
      title: t('dashboard.node_info'),
      icon: Server,
      fields: [
        { label: t('dashboard.node_name'), value: node.name },
        { label: t('dashboard.version'), value: `v${node.version}` },
        { label: t('dashboard.uptime'), value: formatUptime(node.uptime) },
      ],
    },
    {
      title: t('dashboard.network'),
      icon: Globe,
      fields: [
        ...(node.public_ip
          ? [
              {
                label: 'IPv4',
                value: `${node.public_ip}${node.country ? ' ' + countryFlag(node.country) : ''}`,
              },
            ]
          : []),
        ...(node.public_ip6 ? [{ label: 'IPv6', value: node.public_ip6, mono: true }] : []),
        ...(node.latitude && node.longitude
          ? [
              {
                label: t('dashboard.coordinates'),
                value: `${node.latitude.toFixed(2)}, ${node.longitude.toFixed(2)}`,
                mono: true,
              },
            ]
          : []),
      ],
    },
    {
      title: t('dashboard.system'),
      icon: Cpu,
      fields: [
        { label: t('dashboard.cpu_model'), value: system.cpu.model },
        { label: t('dashboard.cores'), value: `${system.cpu.cores}` },
        {
          label: t('dashboard.memory'),
          value: formatBytes(system.memory.total_bytes),
        },
        {
          label: t('dashboard.disk'),
          value: formatBytes(system.disk.total_bytes),
        },
        { label: t('dashboard.os'), value: system.os },
        { label: t('dashboard.kernel'), value: system.kernel, mono: true },
      ],
    },
    {
      title: t('dashboard.load'),
      icon: Gauge,
      fields: [
        { label: t('dashboard.load_1m'), value: system.load.load1.toFixed(2) },
        { label: t('dashboard.load_5m'), value: system.load.load5.toFixed(2) },
        { label: t('dashboard.load_15m'), value: system.load.load15.toFixed(2) },
      ],
    },
    {
      title: t('dashboard.containers'),
      icon: Container,
      fields: [
        {
          label: t('dashboard.running'),
          value: `${containers.running}`,
        },
        {
          label: t('dashboard.total'),
          value: `${containers.total}`,
        },
      ],
    },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        showCloseButton={false}
        className="sm:max-w-md w-full flex flex-col p-0 gap-0"
      >
        {/* Header */}
        <SheetHeader className="px-5 py-4 border-b space-y-0">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="relative flex size-2 shrink-0">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-status-running opacity-75" />
                  <span className="inline-flex size-2 rounded-full bg-status-running" />
                </span>
                <SheetTitle className="text-base truncate">
                  {node.name}
                </SheetTitle>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                v{node.version} &middot; {formatUptime(node.uptime)}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              onClick={() => onOpenChange(false)}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </SheetHeader>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {sections.map((section) => {
            const SIcon = section.icon;
            return (
              <div key={section.title}>
                <div className="flex items-center gap-2 mb-3">
                  <SIcon className="size-3.5 text-muted-foreground" />
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {section.title}
                  </h3>
                </div>
                <div className="space-y-3">
                  {section.fields.map((f) => (
                    <div
                      key={f.label}
                      className="flex items-start justify-between gap-4"
                    >
                      <span className="text-sm text-muted-foreground shrink-0">
                        {f.label}
                      </span>
                      <span
                        className={`text-sm text-right truncate max-w-[65%] ${
                          'mono' in f && f.mono ? 'font-mono text-xs' : ''
                        }`}
                      >
                        {f.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
