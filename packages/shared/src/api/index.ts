import type {
  StatusResponse,
  Container,
  TemplateSummary,
  TemplateDetail,
  AppResponse,
  ClientConfigResponse,
  ShareConfigResponse,
  Task,
  SSLStatus,
  VersionInfo,
  UpdateInfo,
  RemoteNode,
  ConnectionInfo,
  PublicKeyCredentialRequestOptionsJSON,
  PublicKeyCredentialCreationOptionsJSON,
} from '../types';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Platform-agnostic API endpoint definitions.
 * Each platform provides its own `request<T>(path, options)` implementation.
 */
export function createApi(request: <T>(path: string, options?: RequestInit) => Promise<T>) {
  return {
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

    // Remote node container operations
    nodeStartContainer: (nodeId: string, cid: string) =>
      request<void>(`/nodes/${nodeId}/containers/${cid}/start`, { method: 'POST' }),
    nodeStopContainer: (nodeId: string, cid: string) =>
      request<void>(`/nodes/${nodeId}/containers/${cid}/stop`, { method: 'POST' }),
    nodeRestartContainer: (nodeId: string, cid: string) =>
      request<void>(`/nodes/${nodeId}/containers/${cid}/restart`, { method: 'POST' }),
    nodeRemoveContainer: (nodeId: string, cid: string) =>
      request<void>(`/nodes/${nodeId}/containers/${cid}`, { method: 'DELETE' }),
    getNodeContainerLogs: (nodeId: string, cid: string) =>
      request<{ logs: string }>(`/nodes/${nodeId}/containers/${cid}/logs`),

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
      request<{ status: string; task_id?: string; settings?: Record<string, unknown> }>(`/apps/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ settings }),
      }),
    deleteApp: (id: string) => request<void>(`/apps/${id}`, { method: 'DELETE' }),
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

    // Tasks
    getTasks: () => request<Task[]>('/tasks'),
    getTask: (id: string) => request<Task>(`/tasks/${id}`),

    // Settings
    getSettings: () => request<{ node_name: string }>('/settings'),
    updateSettings: (data: { node_name?: string }) =>
      request<{ ok: boolean }>('/settings', { method: 'PATCH', body: JSON.stringify(data) }),

    // Version & Update
    getVersion: () => request<VersionInfo>('/version'),
    checkUpdate: (opts?: { force?: boolean; prerelease?: boolean }) => {
      const params = new URLSearchParams();
      if (opts?.force) params.set('force', 'true');
      if (opts?.prerelease) params.set('prerelease', 'true');
      const qs = params.toString();
      return request<UpdateInfo>(`/version/check${qs ? `?${qs}` : ''}`);
    },
    performUpdate: (version: string) =>
      request<{ status: string; message: string }>('/update', {
        method: 'POST',
        body: JSON.stringify({ version }),
      }),

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
    getNodeAppClientConfig: (nodeId: string, appId: string) =>
      request<ClientConfigResponse>(`/nodes/${nodeId}/apps/${appId}/client-config`),
    deployNodeApp: (nodeId: string, data: { template: string; settings: Record<string, unknown> }) =>
      request<AppResponse>(`/nodes/${nodeId}/apps`, { method: 'POST', body: JSON.stringify(data) }),
    batchDeploy: (data: { template: string; settings: Record<string, unknown>; targets: string[] }) =>
      request<{ task_id: string }>('/batch/deploy', { method: 'POST', body: JSON.stringify(data) }),
    runNodeSpeedTest: (nodeId: string) =>
      request<{ download: number; upload: number; latency: number; jitter: number; timestamp: string }>(
        `/nodes/${nodeId}/speedtest`, { method: 'POST' },
      ),

    // Node updates
    checkNodeUpdate: (nodeId: string, opts?: { force?: boolean; prerelease?: boolean }) => {
      const params = new URLSearchParams();
      if (opts?.force) params.set('force', 'true');
      if (opts?.prerelease) params.set('prerelease', 'true');
      const qs = params.toString();
      return request<UpdateInfo>(`/nodes/${nodeId}/version/check${qs ? `?${qs}` : ''}`);
    },
    performNodeUpdate: (nodeId: string, version: string) =>
      request<{ status: string; message: string }>(`/nodes/${nodeId}/update`, {
        method: 'POST',
        body: JSON.stringify({ version }),
      }),

    // Connections
    getConnections: () => request<ConnectionInfo[]>('/connections'),
    disconnect: (id: string) => request<void>(`/connections/${id}`, { method: 'DELETE' }),

    // Push notifications (mobile only, but defined here for type safety)
    registerPush: (token: string, device: string, platform: string) =>
      request<void>('/push/register', {
        method: 'POST',
        body: JSON.stringify({ token, device, platform }),
      }),
    unregisterPush: (token: string) =>
      request<void>('/push/unregister', {
        method: 'DELETE',
        body: JSON.stringify({ token }),
      }),
    getPushSettings: () =>
      request<Record<string, boolean>>('/push/settings'),
    updatePushSettings: (settings: Record<string, boolean>) =>
      request<void>('/push/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      }),
  };
}

export type PassimApi = ReturnType<typeof createApi>;
