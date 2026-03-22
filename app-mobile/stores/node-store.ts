import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

interface NodeInfo {
  id: string;
  host: string;
  token: string;
  apiKey?: string;
  name: string;
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
  addNode: (node: Omit<NodeInfo, 'id'>) => Promise<void>;
  removeNode: (id: string) => Promise<void>;
  setActiveNode: (id: string) => void;
  setHubNode: (id: string | null) => Promise<void>;
  updateNodeName: (id: string, name: string) => Promise<void>;
  loadNodes: () => Promise<void>;
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
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
    await SecureStore.setItemAsync('passim-nodes', JSON.stringify(nodes));
    set({
      nodes,
      activeNodeId: id,
      activeNode: newNode,
    });
  },

  removeNode: async (id) => {
    const nodes = get().nodes.filter((n) => n.id !== id);
    await SecureStore.setItemAsync('passim-nodes', JSON.stringify(nodes));
    const activeNodeId = get().activeNodeId === id ? (nodes[0]?.id ?? null) : get().activeNodeId;
    const hubNodeId = get().hubNodeId === id ? null : get().hubNodeId;
    if (get().hubNodeId === id) {
      await SecureStore.deleteItemAsync('passim-hub-id');
    }
    set({
      nodes,
      activeNodeId,
      activeNode: nodes.find((n) => n.id === activeNodeId) ?? null,
      hubNodeId,
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
    set({ hubNodeId: id });
  },

  updateNodeName: async (id, name) => {
    const nodes = get().nodes.map((n) => n.id === id ? { ...n, name } : n);
    await SecureStore.setItemAsync('passim-nodes', JSON.stringify(nodes));
    const activeNode = get().activeNodeId === id
      ? nodes.find((n) => n.id === id) ?? get().activeNode
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
      // Only restore hubNodeId if the node still exists
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
