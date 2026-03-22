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
  /** The first node (nodes[0]) is always the Hub. */
  hubNode: NodeInfo | null;
  addNode: (node: Omit<NodeInfo, 'id'>) => Promise<string>;
  removeNode: (id: string) => Promise<void>;
  setActiveNode: (id: string) => void;
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
  hubNode: null,

  addNode: async (node) => {
    const id = generateId();
    const newNode = { ...node, id };
    const nodes = [...get().nodes, newNode];
    await persistNodes(nodes);
    set({
      nodes,
      activeNodeId: id,
      activeNode: newNode,
      hubNode: nodes[0],
    });
    return id;
  },

  removeNode: async (id) => {
    const node = get().nodes.find((n) => n.id === id);
    const hubNode = get().hubNode;

    // Best-effort: delete from Hub if this node is registered there
    if (hubNode && hubNode.id !== id && node?.hubRemoteId) {
      try {
        await getNodeApi(hubNode.id).removeNode(node.hubRemoteId);
      } catch {
        // Hub unreachable or already deleted — ignore
      }
    }

    let nodes = get().nodes.filter((n) => n.id !== id);

    // If deleting the Hub (nodes[0]), clear all hubRemoteIds
    if (hubNode && id === hubNode.id) {
      nodes = nodes.map((n) => ({ ...n, hubRemoteId: undefined }));
    }

    await persistNodes(nodes);
    const activeNodeId = get().activeNodeId === id ? (nodes[0]?.id ?? null) : get().activeNodeId;
    set({
      nodes,
      activeNodeId,
      activeNode: nodes.find((n) => n.id === activeNodeId) ?? null,
      hubNode: nodes[0] ?? null,
    });
  },

  setActiveNode: (id) => {
    const node = get().nodes.find((n) => n.id === id);
    if (node) set({ activeNodeId: id, activeNode: node });
  },

  updateNodeName: async (id, name) => {
    const nodes = get().nodes.map((n) => n.id === id ? { ...n, name } : n);
    await persistNodes(nodes);
    const activeNode = get().activeNodeId === id
      ? nodes.find((n) => n.id === id) ?? get().activeNode
      : get().activeNode;
    set({ nodes, activeNode, hubNode: nodes[0] ?? null });
  },

  updateNodeHubRemoteId: async (nodeId, hubRemoteId) => {
    const nodes = get().nodes.map((n) =>
      n.id === nodeId ? { ...n, hubRemoteId } : n,
    );
    await persistNodes(nodes);
    const activeNode = get().activeNodeId === nodeId
      ? nodes.find((n) => n.id === nodeId) ?? get().activeNode
      : get().activeNode;
    set({ nodes, activeNode, hubNode: nodes[0] ?? null });
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
        hubNode: nodes[0] ?? null,
      });
    } catch {
      // corrupted storage, ignore
    }
  },
}));
