import { useAuthStore } from '@/stores/auth-store';

const BASE = '/api';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('auth-token');
  const headers: Record<string, string> = {
    ...((options?.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Only set Content-Type for non-GET requests with body
  if (options?.body) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    useAuthStore.getState().logout();
    throw new ApiError(401, 'Unauthorized');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(res.status, err.error || 'Unknown error');
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}

export const api = {
  // Auth - API Key
  login: (apiKey: string) =>
    request<{ token: string; expires_at: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ api_key: apiKey }),
    }),

  refresh: (token: string) =>
    request<{ token: string; expires_at: string }>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),

  // Auth - Passkey
  passkeyExists: () => request<{ exists: boolean }>('/auth/passkeys/exists'),
  passkeyBegin: () => request<PublicKeyCredentialRequestOptionsJSON>('/auth/passkey/begin', { method: 'POST' }),
  passkeyFinish: (credential: unknown) =>
    request<{ token: string; expires_at: string }>('/auth/passkey/finish', {
      method: 'POST',
      body: JSON.stringify(credential),
    }),
  passkeyRegister: () =>
    request<PublicKeyCredentialCreationOptionsJSON>('/auth/passkey/register', { method: 'POST' }),
  passkeyRegisterFinish: (credential: unknown) =>
    request<{ id: string; name: string }>('/auth/passkey/register/finish', {
      method: 'POST',
      body: JSON.stringify(credential),
    }),
  listPasskeys: () => request<{ id: string; name: string; created_at: string; last_used_at: string }[]>('/auth/passkeys'),
  deletePasskey: (id: string) => request<void>(`/auth/passkeys/${id}`, { method: 'DELETE' }),

  // Status
  getStatus: () => request<StatusResponse>('/status'),

  // Containers
  getContainers: () => request<Container[]>('/containers'),
  startContainer: (id: string) => request<void>(`/containers/${id}/start`, { method: 'POST' }),
  stopContainer: (id: string) => request<void>(`/containers/${id}/stop`, { method: 'POST' }),
  restartContainer: (id: string) => request<void>(`/containers/${id}/restart`, { method: 'POST' }),
  removeContainer: (id: string) => request<void>(`/containers/${id}`, { method: 'DELETE' }),
  getContainerLogs: (id: string) => request<{ logs: string }>(`/containers/${id}/logs`),

  // Templates
  getTemplates: () => request<TemplateSummary[]>('/templates'),
  getTemplate: (name: string) => request<TemplateDetail>(`/templates/${name}`),

  // Apps
  deployApp: (template: string, settings: Record<string, unknown>) =>
    request<{ id: string; task_id?: string }>('/apps', {
      method: 'POST',
      body: JSON.stringify({ template, settings }),
    }),
  getApps: () => request<AppResponse[]>('/apps'),
  getApp: (id: string) => request<AppResponse>(`/apps/${id}`),
  updateApp: (id: string, settings: Record<string, unknown>) =>
    request<{ status: string; task_id?: string; settings?: Record<string, unknown> }>(`/apps/${id}`, { method: 'PATCH', body: JSON.stringify({ settings }) }),
  deleteApp: (id: string) => request<void>(`/apps/${id}`, { method: 'DELETE' }),
  getAppConfigs: (id: string) => request<string[]>(`/apps/${id}/configs`),
  getAppConfigFile: (id: string, file: string) =>
    request<{ content: string }>(`/apps/${id}/configs/${file}`),
  getAppClientConfig: (id: string) => request<ClientConfigResponse>(`/apps/${id}/client-config`),
  createShare: (id: string, userIndex?: number) =>
    request<{ token: string; url: string }>(`/apps/${id}/share`, {
      method: 'POST',
      body: JSON.stringify({ user_index: userIndex ?? 0 }),
    }),
  revokeShare: (id: string) =>
    request<{ ok: boolean }>(`/apps/${id}/share`, { method: 'DELETE' }),

  // Public share (no auth)
  getShareConfig: (token: string) => request<ShareConfigResponse>(`/s/${token}`),
  getShareFileURL: (token: string, index: number) => `/api/s/${token}/file/${index}`,

  // Tasks
  getTasks: () => request<Task[]>('/tasks'),
  getTask: (id: string) => request<Task>(`/tasks/${id}`),

  // Settings
  getSettings: () => request<{ node_name: string }>('/settings'),
  updateSettings: (data: { node_name?: string }) =>
    request<{ ok: boolean }>('/settings', { method: 'PATCH', body: JSON.stringify(data) }),

  // SSL
  getSSLStatus: () => request<SSLStatus>('/ssl/status'),
  renewSSL: () => request<{ message: string }>('/ssl/renew', { method: 'POST' }),

  // Speedtest / iperf
  getIperfStatus: () => request<{ status: string }>('/speedtest/iperf/status'),
  startIperf: () => request<{ status: string }>('/speedtest/iperf/start', { method: 'POST' }),
  stopIperf: () => request<{ status: string }>('/speedtest/iperf/stop', { method: 'POST' }),

  // Nodes
  getNodes: () => request<RemoteNode[]>('/nodes'),
  addNode: (data: { address: string; api_key: string; name?: string }) =>
    request<RemoteNode>('/nodes', { method: 'POST', body: JSON.stringify(data) }),
  removeNode: (id: string) => request<void>(`/nodes/${id}`, { method: 'DELETE' }),
  updateNode: (id: string, data: { name: string }) =>
    request<void>(`/nodes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  getNodeStatus: (id: string) => request<StatusResponse>(`/nodes/${id}/status`),
  getNodeContainers: (id: string) => request<Container[]>(`/nodes/${id}/containers`),
  getNodeApps: (id: string) => request<AppResponse[]>(`/nodes/${id}/apps`),
  deployNodeApp: (nodeId: string, data: { template: string; settings: Record<string, unknown> }) =>
    request<AppResponse>(`/nodes/${nodeId}/apps`, { method: 'POST', body: JSON.stringify(data) }),
  batchDeploy: (data: { template: string; settings: Record<string, unknown>; targets: string[] }) =>
    request<{ task_id: string }>('/batch/deploy', { method: 'POST', body: JSON.stringify(data) }),
  runNodeSpeedTest: (nodeId: string) =>
    request<{ download: number; upload: number; latency: number; jitter: number; timestamp: string }>(
      `/nodes/${nodeId}/speedtest`, { method: 'POST' },
    ),

  // Connections
  getConnections: () => request<ConnectionInfo[]>('/connections'),
  disconnect: (id: string) => request<void>(`/connections/${id}`, { method: 'DELETE' }),
};

// Type definitions used by api client
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

// WebAuthn types for browsers that don't have full type definitions
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
