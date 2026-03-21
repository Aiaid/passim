import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

interface NodeInfo {
  id: string;
  host: string;
  token: string;
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
  addNode: (node: Omit<NodeInfo, 'id'>) => Promise<void>;
  removeNode: (id: string) => Promise<void>;
  setActiveNode: (id: string) => void;
  loadNodes: () => Promise<void>;
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export const useNodeStore = create<NodeState>((set, get) => ({
  nodes: [],
  activeNodeId: null,
  activeNode: null,

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
    set({
      nodes,
      activeNodeId,
      activeNode: nodes.find((n) => n.id === activeNodeId) ?? null,
    });
  },

  setActiveNode: (id) => {
    const node = get().nodes.find((n) => n.id === id);
    if (node) set({ activeNodeId: id, activeNode: node });
  },

  loadNodes: async () => {
    const raw = await SecureStore.getItemAsync('passim-nodes');
if (!raw) return;
    try {
      const nodes: NodeInfo[] = JSON.parse(raw);
      const activeNodeId = nodes[0]?.id ?? null;
      set({
        nodes,
        activeNodeId,
        activeNode: nodes.find((n) => n.id === activeNodeId) ?? null,
      });
    } catch {
      // corrupted storage, ignore
    }
  },
}));
