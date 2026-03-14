import { Shield, HardDrive, Globe, Monitor, Gauge, type LucideIcon } from 'lucide-react';

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  vpn: Shield,
  storage: HardDrive,
  proxy: Globe,
  remote: Monitor,
  tools: Gauge,
};

export const STATUS_COLORS: Record<string, string> = {
  running: 'bg-status-running text-white',
  connected: 'bg-status-running text-white',
  stopped: 'bg-status-stopped text-white',
  failed: 'bg-status-failed text-white',
  offline: 'bg-status-failed text-white',
  deploying: 'bg-status-deploying text-white',
  warning: 'bg-status-warning text-black',
};
