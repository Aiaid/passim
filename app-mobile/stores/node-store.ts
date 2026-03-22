import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { getNodeApi } from '@/lib/api';

export interface NodeInfo {
  id: string;
  host: string;
  token: string;
  apiKey?: string;
  name: string;
  hubRemoteId?: string;
  cloud?: {
    provider: string;
    accountId: string;
    instanceId: string;
    region: string;
    plan: string;
    monthlyPrice: number;
    createdAt: string;
  };
}

interface NodeState {
  nodes: NodeInfo[];
  activeNodeId: string | null;
  activeNode: NodeInfo | null;
  hubNodeId: string | null;
  addNode: (node: Omit<NodeInfo, 'id'>) => Promise<string>;
  removeNode: (id: string) => Promise<void>;
  setActiveNode: (id: string) => void;
  setHubNode: (id: string | null) => Promise<void>;
  updateNodeName: (id: string, name: string) => Promise<void>;
  updateNodeHubRemoteId: (nodeId: string, hubRemoteId: string) => Promise<void>;
  loadNodes: () => Promise<void>;
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

async function persistNodes(nodes: NodeInfo[]) {
  await SecureStore.setItemAsync('passim-nodes', JSON.stringify(nodes));
}

export const useNodeStore = create<NodeState>((set, get) => ({
  nodes: [],
  activeNodeId: null,
  activeNode: null,
  hubNodeId: null,

  addNode: async (node) => {
    const id = generateId();
    const newNode = { ...node, id };
    const nodes = [...get().nodes, newNode];
    await persistNodes(nodes);
    set({
      nodes,
      activeNodeId: id,
      activeNode: newNode,
    });
    return id;
  },

  removeNode: async (id) => {
    const node = get().nodes.find((n) => n.id === id);
    const hubNodeId = get().hubNodeId;

    // Best-effort: delete from Hub if this node is registered there
    if (hubNodeId && hubNodeId !== id && node?.hubRemoteId) {
      try {
        await getNodeApi(hubNodeId).removeNode(node.hubRemoteId);
      } catch {
        // Hub unreachable or already deleted — ignore
      }
    }

    const nodes = get().nodes.filter((n) => n.id !== id);
    await persistNodes(nodes);

    // If deleting the Hub itself, clear hub state + all hubRemoteIds
    let newHubNodeId = hubNodeId;
    if (id === hubNodeId) {
      newHubNodeId = null;
      await SecureStore.deleteItemAsync('passim-hub-id');
      // Clear all hubRemoteIds since they belong to the old Hub
      for (const n of nodes) {
        n.hubRemoteId = undefined;
      }
      await persistNodes(nodes);
    }

    const activeNodeId = get().activeNodeId === id ? (nodes[0]?.id ?? null) : get().activeNodeId;
    set({
      nodes,
      activeNodeId,
      activeNode: nodes.find((n) => n.id === activeNodeId) ?? null,
      hubNodeId: newHubNodeId,
    });
  },

  setActiveNode: (id) => {
    const node = get().nodes.find((n) => n.id === id);
    if (node) set({ activeNodeId: id, activeNode: node });
  },

  setHubNode: async (id) => {
    if (id) {
      await SecureStore.setItemAsync('passim-hub-id', id);
    } else {
      await SecureStore.deleteItemAsync('passim-hub-id');
    }

    // Clear all hubRemoteIds — new Hub has different mapping
    const nodes = get().nodes.map((n) => ({ ...n, hubRemoteId: undefined }));
    await persistNodes(nodes);

    const activeNode = get().activeNode;
    set({
      hubNodeId: id,
      nodes,
      activeNode: activeNode ? nodes.find((n) => n.id === activeNode.id) ?? null : null,
    });
  },

  updateNodeName: async (id, name) => {
    const nodes = get().nodes.map((n) => n.id === id ? { ...n, name } : n);
    await persistNodes(nodes);
    const activeNode = get().activeNodeId === id
      ? nodes.find((n) => n.id === id) ?? get().activeNode
      : get().activeNode;
    set({ nodes, activeNode });
  },

  updateNodeHubRemoteId: async (nodeId, hubRemoteId) => {
    const nodes = get().nodes.map((n) =>
      n.id === nodeId ? { ...n, hubRemoteId } : n,
    );
    await persistNodes(nodes);
    const activeNode = get().activeNodeId === nodeId
      ? nodes.find((n) => n.id === nodeId) ?? get().activeNode
      : get().activeNode;
    set({ nodes, activeNode });
  },

  loadNodes: async () => {
    const [raw, hubId] = await Promise.all([
      SecureStore.getItemAsync('passim-nodes'),
      SecureStore.getItemAsync('passim-hub-id'),
    ]);
    if (!raw) return;
    try {
      const nodes: NodeInfo[] = JSON.parse(raw);
      const activeNodeId = nodes[0]?.id ?? null;
      const validHubId = hubId && nodes.some((n) => n.id === hubId) ? hubId : null;
      set({
        nodes,
        activeNodeId,
        activeNode: nodes.find((n) => n.id === activeNodeId) ?? null,
        hubNodeId: validHubId,
      });
    } catch {
      // corrupted storage, ignore
    }
  },
}));
