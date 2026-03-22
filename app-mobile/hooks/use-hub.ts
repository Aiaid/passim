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
 * Query the Hub node's registered remote nodes.
 */
export function useHubNodes() {
  const hubNodeId = useNodeStore((s) => s.hubNodeId);

  return useQuery({
    queryKey: qk.hubNodes(hubNodeId ?? ''),
    queryFn: () => getNodeApi(hubNodeId!).getNodes(),
    enabled: !!hubNodeId,
    staleTime: 30_000,
  });
}

/**
 * Migrate local nodes to Hub + discover Hub nodes not in App.
 * Called after setting a Hub node.
 */
export function useMigrateNodesToHub() {
  return useMutation({
    mutationFn: async (): Promise<MigrateResult> => {
      const store = useNodeStore.getState();
      const { nodes, hubNodeId, updateNodeHubRemoteId, addNode } = store;

      if (!hubNodeId) throw new Error('No Hub node set');

      const hubApi = getNodeApi(hubNodeId);
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
        if (node.id === hubNodeId) continue; // Skip Hub itself

        const existing = hubAddressMap.get(node.host);
        if (existing) {
          // Already on Hub — just record the mapping
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
        if (localHosts.has(remote.address)) continue; // Already local
        if (!remote.api_key) continue; // Can't direct-connect without key

        try {
          // Login directly to the discovered node
          const loginRes = await fetch(`https://${remote.address}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: remote.api_key }),
          });
          if (!loginRes.ok) throw new Error('login failed');
          const loginData = await loginRes.json();

          // Get node name from status
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
            // ignore status fetch failure
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
    },
  });
}

/**
 * Fetch remote node client configs via the Hub, aggregating URL and file_per_user configs.
 */
export function useHubRemoteConfigs(templateName: string) {
  const hubNodeId = useNodeStore((s) => s.hubNodeId);
  const { data: remoteNodes } = useHubNodes();

  const connectedNodes = (remoteNodes ?? []).filter((n) => n.status === 'connected');

  // Step 1: Fetch apps from each connected remote node (via Hub proxy)
  const nodeAppQueries = useQueries({
    queries: connectedNodes.map((node) => ({
      queryKey: qk.hubNodeApps(hubNodeId!, node.id),
      queryFn: () => getNodeApi(hubNodeId!).getNodeApps(node.id),
      staleTime: 30_000,
      enabled: !!hubNodeId && !!templateName,
    })),
  });

  // Step 2: Find matching apps per node
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

  // Step 3: Fetch client configs for matching apps
  const configQueries = useQueries({
    queries: matchingApps.map(({ nodeId, appId }) => ({
      queryKey: ['hub-nodes', hubNodeId, nodeId, appId, 'client-config'] as const,
      queryFn: () => getNodeApi(hubNodeId!).getNodeAppClientConfig(nodeId, appId),
      staleTime: 60_000,
      enabled: !!hubNodeId,
    })),
  });

  // Build remote groups
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
