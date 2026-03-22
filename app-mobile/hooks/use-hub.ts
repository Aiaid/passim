import { useQuery, useQueries } from '@tanstack/react-query';
import { getNodeApi } from '@/lib/api';
import { useNodeStore } from '@/stores/node-store';
import { qk } from '@/lib/query-keys';
import type { AppResponse } from '@passim/shared/types';

interface NodeURLGroup {
  nodeName: string;
  nodeCountry?: string;
  urls: { name: string; scheme: string; qr?: boolean }[];
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
 * Fetch remote node client configs via the Hub, aggregating URL-type configs.
 * Mirrors the web's useRemoteNodeConfigs pattern.
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
  matchingApps.forEach((app, i) => {
    const cfg = configQueries[i]?.data;
    if (cfg?.type === 'url' && cfg.urls && cfg.urls.length > 0) {
      remoteGroups.push({
        nodeName: app.nodeName,
        nodeCountry: app.nodeCountry,
        urls: cfg.urls,
      });
    }
  });

  return { remoteGroups, totalNodes: 1 + remoteGroups.length };
}
