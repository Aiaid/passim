import { createApi, ApiError } from '@passim/shared/api';

export { ApiError };

// Per-node refresh mutex: dedupe concurrent refreshes when many requests
// race after a token expires.
const refreshLocks = new Map<string, Promise<string | null>>();

function isAuthPath(path: string): boolean {
  return path.startsWith('/auth/login') || path.startsWith('/auth/refresh');
}

async function refreshNodeToken(nodeId: string): Promise<string | null> {
  const existing = refreshLocks.get(nodeId);
  if (existing) return existing;

  const promise = (async () => {
    const { useNodeStore } = require('@/stores/node-store');
    const store = useNodeStore.getState();
    const node = store.nodes.find((n: { id: string }) => n.id === nodeId);
    if (!node || !node.apiKey) return null;
    try {
      const res = await fetch(`https://${node.host}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: node.apiKey }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data?.token) return null;
      await store.updateNodeToken(nodeId, data.token);
      return data.token as string;
    } catch {
      return null;
    }
  })();

  refreshLocks.set(nodeId, promise);
  try {
    return await promise;
  } finally {
    refreshLocks.delete(nodeId);
  }
}

export function getNodeApi(nodeId: string) {
  // Lazy import to break require cycle: node-store → api → node-store
  const { useNodeStore } = require('@/stores/node-store');
  const node = useNodeStore
    .getState()
    .nodes.find((n: { id: string }) => n.id === nodeId);

  if (!node) throw new Error(`Node ${nodeId} not found`);

  const doFetch = async <T>(
    token: string,
    path: string,
    options?: RequestInit,
  ): Promise<T> => {
    const res = await fetch(`https://${node.host}/api${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (res.status === 401) {
      throw new ApiError(401, 'Unauthorized');
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new ApiError(res.status, err.error || 'Unknown error');
    }

    if (res.status === 204) return undefined as T;
    return res.json();
  };

  return createApi(async <T>(path: string, options?: RequestInit): Promise<T> => {
    // Read latest token from store at request time so concurrent refreshes
    // are picked up by in-flight callers.
    const current = useNodeStore
      .getState()
      .nodes.find((n: { id: string }) => n.id === nodeId);
    if (!current) throw new Error(`Node ${nodeId} not found`);

    try {
      return await doFetch<T>(current.token, path, options);
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 401 &&
        current.apiKey &&
        !isAuthPath(path)
      ) {
        const fresh = await refreshNodeToken(nodeId);
        if (fresh) {
          return await doFetch<T>(fresh, path, options);
        }
      }
      throw err;
    }
  });
}
