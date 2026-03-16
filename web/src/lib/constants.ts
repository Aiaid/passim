import { Shield, HardDrive, Globe, Monitor, Gauge, Lock, Zap, FolderOpen, type LucideIcon } from 'lucide-react';

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

// Category accent color CSS variable names
export const CATEGORY_COLORS: Record<string, string> = {
  vpn: 'var(--cat-vpn)',
  storage: 'var(--cat-storage)',
  proxy: 'var(--cat-proxy)',
  remote: 'var(--cat-remote)',
  tools: 'var(--cat-tools)',
};

// Category gradient strings for accent bars
export const CATEGORY_GRADIENTS: Record<string, string> = {
  vpn: 'linear-gradient(135deg, var(--cat-vpn), var(--cat-vpn-end))',
  storage: 'linear-gradient(135deg, var(--cat-storage), var(--cat-storage-end))',
  proxy: 'linear-gradient(135deg, var(--cat-proxy), var(--cat-proxy-end))',
  remote: 'linear-gradient(135deg, var(--cat-remote), var(--cat-remote-end))',
  tools: 'linear-gradient(135deg, var(--cat-tools), var(--cat-tools-end))',
};

// Template-specific icons (more specific than category icons)
export const APP_ICONS: Record<string, LucideIcon> = {
  wireguard: Shield,
  l2tp: Lock,
  hysteria: Zap,
  v2ray: Globe,
  webdav: FolderOpen,
  samba: HardDrive,
  rdesktop: Monitor,
};
