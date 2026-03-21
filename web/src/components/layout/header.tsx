import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Moon, Sun, Languages, Smartphone, Server, Clock, Shield, Globe, Container } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useTheme } from '@/hooks/use-theme';
import { usePreferencesStore } from '@/stores/preferences-store';
import { api } from '@/lib/api-client';
import { PairingQRDialog } from '@/components/shared/pairing-qr-dialog';

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Show last 4 groups of an IPv6 address, e.g. "::abcd:1234:5678:9abc" */
function shortenIPv6(ip: string): string {
  const parts = ip.split(':');
  if (parts.length <= 4) return ip;
  return '::' + parts.slice(-4).join(':');
}

export function Header() {
  const { theme, setTheme } = useTheme();
  const { setLanguage } = usePreferencesStore();
  const { t, i18n } = useTranslation();
  const [qrOpen, setQrOpen] = useState(false);

  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: () => api.getStatus(),
    refetchInterval: 30_000,
  });

  const { data: ssl } = useQuery({
    queryKey: ['ssl-status'],
    queryFn: () => api.getSSLStatus(),
    refetchInterval: 60_000,
  });

  const handleLanguageChange = (lang: 'zh-CN' | 'en-US') => {
    setLanguage(lang);
    i18n.changeLanguage(lang);
  };

  const countryFlag = status?.node.country
    ? ' ' + [...status.node.country.toUpperCase()].map(c =>
        String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)
      ).join('')
    : '';

  return (
    <header className="flex h-14 items-center gap-2 border-b px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-6" />

      {/* Node info */}
      {status && (
        <TooltipProvider delayDuration={300}>
          <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground ml-1">
            <div className="flex items-center gap-1.5">
              <Server className="size-3" />
              <span>{status.node.name} {status.node.version}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="size-3" />
              <span>{formatUptime(status.node.uptime)}</span>
            </div>
            {(status.node.public_ip || status.node.public_ip6) && (
              <div className="flex items-center gap-1.5">
                <Globe className="size-3" />
                <span>
                  {status.node.public_ip && (
                    <>{status.node.public_ip}{countryFlag}</>
                  )}
                  {status.node.public_ip && status.node.public_ip6 && ' / '}
                  {status.node.public_ip6 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-default border-b border-dotted border-muted-foreground/50">
                          {shortenIPv6(status.node.public_ip6)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-mono text-xs">{status.node.public_ip6}</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {!status.node.public_ip && status.node.public_ip6 && countryFlag}
                </span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Shield className="size-3" />
              <span>
                SSL {ssl?.mode ?? '—'}
                {ssl?.domain && ` · ${ssl.domain}`}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Container className="size-3" />
              <span>
                {t('dashboard.running_of_total', {
                  running: status.containers.running,
                  total: status.containers.total,
                })}
              </span>
            </div>
            {status.system.os && (
              <span className="hidden xl:inline">{status.system.os}</span>
            )}
          </div>
        </TooltipProvider>
      )}

      <div className="flex-1" />
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={() => setQrOpen(true)}>
              <Smartphone className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('settings.mobile_qr')}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PairingQRDialog open={qrOpen} onOpenChange={setQrOpen} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <Languages className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => handleLanguageChange('zh-CN')}>
            中文
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleLanguageChange('en-US')}>
            English
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            {theme === 'dark' ? <Moon className="size-4" /> : <Sun className="size-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setTheme('light')}>
            {t('settings.theme_light', 'Light')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme('dark')}>
            {t('settings.theme_dark', 'Dark')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme('system')}>
            {t('settings.theme_system', 'System')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
