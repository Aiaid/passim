export interface StatusResponse {
  node: {
    id: string;
    name: string;
    version: string;
    uptime: number;
    public_ip?: string;
    public_ip6?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
  };
  system: {
    cpu: { usage_percent: number; cores: number; model: string };
    memory: { total_bytes: number; used_bytes: number; usage_percent: number };
    disk: { total_bytes: number; used_bytes: number; usage_percent: number };
    network: { rx_bytes: number; tx_bytes: number };
    load: { load1: number; load5: number; load15: number };
    os: string;
    kernel: string;
  };
  containers: {
    running: number;
    stopped: number;
    total: number;
  };
}

export interface Container {
  Id: string;
  Names: string[];
  Image: string;
  State: string;
  Status: string;
  Created: number;
}

export interface TemplateSummary {
  name: string;
  category: string;
  icon: string;
  description: Record<string, string>;
  settings: SettingInfo[];
}

export interface TemplateClients {
  type: 'file_per_user' | 'credentials' | 'url';
  source?: string;
  format?: string;
  qr?: boolean;
  fields?: { key: string; label: Record<string, string>; value: string; secret?: boolean }[];
  urls?: { name: string; scheme: string; qr?: boolean }[];
  import_urls?: Record<string, string>;
}

export interface GuidePlatform {
  name: string;
  store_url?: string;
  download_url?: string;
  steps: string[];
}

export interface TemplateGuide {
  setup?: Record<string, string>;
  usage?: Record<string, string>;
  platforms?: GuidePlatform[];
}

export interface TemplateShare {
  supports: boolean;
  per_user?: boolean;
  share_content?: string[];
}

export interface TemplateDetail extends TemplateSummary {
  version: string;
  guide?: TemplateGuide;
  clients?: TemplateClients;
  share?: TemplateShare;
  source?: { url?: string; license?: string };
  limitations?: string[];
}

export interface ClientConfigResponse {
  type: 'file_per_user' | 'credentials' | 'url';
  qr?: boolean;
  files?: { index: number; name: string }[];
  fields?: { key: string; label: Record<string, string>; value: string; secret?: boolean }[];
  urls?: { name: string; scheme: string; qr?: boolean }[];
  import_urls?: Record<string, string>;
  share_supported: boolean;
  share_token?: string;
}

export interface ShareConfigResponse {
  type: 'file_per_user' | 'credentials' | 'url';
  qr?: boolean;
  files?: { index: number; name: string }[];
  fields?: { key: string; label: Record<string, string>; value: string; secret?: boolean }[];
  urls?: { name: string; scheme: string; qr?: boolean }[];
  import_urls?: Record<string, string>;
  remote_groups?: {
    node_name: string;
    node_id?: string;
    node_country?: string;
    app_id?: string;
    urls?: { name: string; scheme: string; qr?: boolean }[];
    files?: { index: number; name: string }[];
    qr?: boolean;
  }[];
  guide?: TemplateGuide;
  limitations?: string[];
}

export interface SettingOptionInfo {
  value: unknown;
  label: Record<string, string>;
}

export interface SettingInfo {
  key: string;
  type: string;
  label: Record<string, string>;
  default?: unknown;
  min?: number;
  max?: number;
  options?: SettingOptionInfo[];
  advanced?: boolean;
}

export interface AppResponse {
  id: string;
  template: string;
  settings: Record<string, unknown>;
  status: string;
  container_id: string;
  deployed_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  type: string;
  target: string;
  payload: string;
  status: string;
  result: string;
  retries: number;
  max_retries: number;
  created_at: string;
  finished_at: string;
}

export interface SSLStatus {
  mode: string;
  valid: boolean;
  domain: string;
  expires_at: string;
  issuer?: string;
}

export interface VersionInfo {
  version: string;
  commit: string;
  build_time: string;
}

export interface UpdateInfo {
  current: string;
  latest: string;
  available: boolean;
  changelog?: string;
  published_at?: string;
  prerelease?: boolean;
}

export interface PublicKeyCredentialRequestOptionsJSON {
  challenge: string;
  timeout?: number;
  rpId?: string;
  allowCredentials?: { id: string; type: string }[];
  userVerification?: string;
}

export interface RemoteNode {
  id: string;
  name: string;
  address: string;
  status: 'connecting' | 'connected' | 'disconnected';
  version?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  last_seen?: string;
  created_at: string;
  metrics?: {
    cpu_percent: number;
    memory_percent: number;
    disk_percent: number;
    containers: { running: number; total: number };
  };
  containers?: Array<{ name: string; state: string; image: string }>;
}

export interface ConnectionInfo {
  id: string;
  remote_ip: string;
  connected_at: string;
}

export interface PublicKeyCredentialCreationOptionsJSON {
  rp: { name: string; id: string };
  user: { id: string; name: string; displayName: string };
  challenge: string;
  pubKeyCredParams: { type: string; alg: number }[];
  timeout?: number;
  excludeCredentials?: { id: string; type: string }[];
  authenticatorSelection?: {
    authenticatorAttachment?: string;
    requireResidentKey?: boolean;
    residentKey?: string;
    userVerification?: string;
  };
  attestation?: string;
}

// From use-event-stream.tsx
export interface MetricsData {
  cpu_percent: number;
  mem_used: number;
  mem_total: number;
  disk_used: number;
  disk_total: number;
  net_bytes_sent: number;
  net_bytes_recv: number;
}

// Common type aliases
export type Theme = 'light' | 'dark' | 'system';
export type Language = 'zh-CN' | 'en-US';
