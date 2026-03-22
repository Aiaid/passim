import { useQuery, useQueries, useMutation } from '@tanstack/react-query';
import { getNodeApi } from '@/lib/api';
import { useNodeStore } from '@/stores/node-store';
import { qk } from '@/lib/query-keys';
import type { AppResponse, RemoteNode } from '@passim/shared/types';

interface NodeURLGroup {
  nodeName: string;
  nodeCountry?: string;
  urls: { name: string; scheme: string; qr?: boolean }[];
}

export interface RemoteFileGroup {
  nodeName: string;
  nodeCountry?: string;
  nodeId: string;
  appId: string;
  files: { index: number; name: string }[];
  qr?: boolean;
}

export interface MigrateResult {
  synced: number;
  discovered: number;
  skipped: number;
  noKey: number;
  failed: number;
}

/**
 * Query the Hub node's (nodes[0]) registered remote nodes.
 */
export function useHubNodes() {
  const hubNode = useNodeStore((s) => s.hubNode);

  return useQuery({
    queryKey: qk.hubNodes(hubNode?.id ?? ''),
    queryFn: () => getNodeApi(hubNode!.id).getNodes(),
    enabled: !!hubNode,
    staleTime: 30_000,
  });
}

/**
 * Sync local nodes to Hub + discover Hub nodes not in App.
 * Pure function — can be called from hooks, components, or startup logic.
 */
export async function syncWithHub(): Promise<MigrateResult> {
  const store = useNodeStore.getState();
  const { nodes, hubNode, updateNodeHubRemoteId, addNode } = store;

  if (!hubNode) throw new Error('No Hub node');

  const hubApi = getNodeApi(hubNode.id);
  const result: MigrateResult = { synced: 0, discovered: 0, skipped: 0, noKey: 0, failed: 0 };

  // Step 1: Get Hub's existing remote nodes
  let hubRemotes: RemoteNode[];
  try {
    hubRemotes = await hubApi.getNodes();
  } catch {
    throw new Error('Hub unreachable');
  }

  const hubAddressMap = new Map<string, RemoteNode>();
  for (const r of hubRemotes) {
    hubAddressMap.set(r.address, r);
  }

  // Step 2: Register local nodes on Hub (with dedup)
  for (const node of nodes) {
    if (node.id === hubNode.id) continue;

    const existing = hubAddressMap.get(node.host);
    if (existing) {
      await updateNodeHubRemoteId(node.id, existing.id);
      result.skipped++;
      continue;
    }

    if (!node.apiKey) {
      result.noKey++;
      continue;
    }

    try {
      const remote = await hubApi.addNode({
        address: node.host,
        api_key: node.apiKey,
        name: node.name,
      });
      await updateNodeHubRemoteId(node.id, remote.id);
      result.synced++;
    } catch {
      result.failed++;
    }
  }

  // Step 3: Discover Hub nodes not in App
  const localHosts = new Set(nodes.map((n) => n.host));
  for (const remote of hubRemotes) {
    if (localHosts.has(remote.address)) continue;
    if (!remote.api_key) continue;

    try {
      const loginRes = await fetch(`https://${remote.address}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: remote.api_key }),
      });
      if (!loginRes.ok) throw new Error('login failed');
      const loginData = await loginRes.json();

      let name = remote.name || remote.address;
      try {
        const statusRes = await fetch(`https://${remote.address}/api/status`, {
          headers: { Authorization: `Bearer ${loginData.token}` },
        });
        if (statusRes.ok) {
          const status = await statusRes.json();
          name = status?.node?.name || name;
        }
      } catch {
        // ignore
      }

      await addNode({
        host: remote.address,
        token: loginData.token,
        apiKey: remote.api_key,
        name,
        hubRemoteId: remote.id,
      });
      result.discovered++;
    } catch {
      result.failed++;
    }
  }

  return result;
}

/**
 * React hook wrapper for syncWithHub.
 */
export function useSyncWithHub() {
  return useMutation({ mutationFn: syncWithHub });
}

/**
 * Fetch remote node client configs via the Hub, aggregating URL and file_per_user configs.
 */
export function useHubRemoteConfigs(templateName: string) {
  const hubNode = useNodeStore((s) => s.hubNode);
  const hubId = hubNode?.id;
  const { data: remoteNodes } = useHubNodes();

  const connectedNodes = (remoteNodes ?? []).filter((n) => n.status === 'connected');

  const nodeAppQueries = useQueries({
    queries: connectedNodes.map((node) => ({
      queryKey: qk.hubNodeApps(hubId!, node.id),
      queryFn: () => getNodeApi(hubId!).getNodeApps(node.id),
      staleTime: 30_000,
      enabled: !!hubId && !!templateName,
    })),
  });

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
      queryKey: ['hub-nodes', hubId, nodeId, appId, 'client-config'] as const,
      queryFn: () => getNodeApi(hubId!).getNodeAppClientConfig(nodeId, appId),
      staleTime: 60_000,
      enabled: !!hubId,
    })),
  });

  const remoteGroups: NodeURLGroup[] = [];
  const remoteFileGroups: RemoteFileGroup[] = [];

  matchingApps.forEach((app, i) => {
    const cfg = configQueries[i]?.data;
    if (cfg?.type === 'url' && cfg.urls && cfg.urls.length > 0) {
      remoteGroups.push({
        nodeName: app.nodeName,
        nodeCountry: app.nodeCountry,
        urls: cfg.urls,
      });
    }
    if (cfg?.type === 'file_per_user' && cfg.files && cfg.files.length > 0) {
      remoteFileGroups.push({
        nodeName: app.nodeName,
        nodeCountry: app.nodeCountry,
        nodeId: app.nodeId,
        appId: app.appId,
        files: cfg.files,
        qr: cfg.qr,
      });
    }
  });

  return {
    remoteGroups,
    remoteFileGroups,
    totalNodes: 1 + remoteGroups.length + remoteFileGroups.length,
  };
}
