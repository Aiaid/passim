import { useNodeStore } from '@/stores/node-store';
import { createApi, ApiError } from '@passim/shared/api';

export { ApiError };

export function getNodeApi(nodeId?: string) {
  const store = useNodeStore.getState();
  const node = nodeId
    ? store.nodes.find((n) => n.id === nodeId)
    : store.activeNode;

  if (!node) throw new Error('No active node');

  return createApi(async <T>(path: string, options?: RequestInit): Promise<T> => {
    const res = await fetch(`https://${node.host}/api${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${node.token}`,
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
  });
}
