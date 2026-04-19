import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getNodeApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';

export function useStacks(nodeId: string) {
  return useQuery({
    queryKey: qk.stacks(nodeId),
    queryFn: () => getNodeApi(nodeId).getStacks(),
    enabled: !!nodeId,
    // Keep status fresh while something is mid-flight; idle otherwise.
    // Phase 2 will swap this for SSE.
    refetchInterval: (query) => {
      const stacks = query.state.data?.stacks ?? [];
      const busy = stacks.some((s) => s.status === 'deploying' || s.status === 'tearing_down');
      return busy ? 2_000 : false;
    },
  });
}

export function useStack(nodeId: string, id: string) {
  return useQuery({
    queryKey: qk.stack(nodeId, id),
    queryFn: () => getNodeApi(nodeId).getStack(id),
    enabled: !!nodeId && !!id,
    refetchInterval: (query) => {
      const s = query.state.data;
      if (!s) return false;
      return s.status === 'deploying' || s.status === 'tearing_down' ? 2_000 : false;
    },
  });
}

export function useValidateStack(nodeId: string) {
  return useMutation({
    mutationFn: (data: { name: string; yaml_text: string; env_text?: string; profiles?: string[] }) =>
      getNodeApi(nodeId).validateStack(data),
  });
}

export function useCreateStack(nodeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; yaml_text: string; env_text?: string; profiles?: string[] }) =>
      getNodeApi(nodeId).createStack(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.stacks(nodeId) });
    },
  });
}

export function useDeleteStack(nodeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, keepVolumes }: { id: string; keepVolumes?: boolean }) =>
      getNodeApi(nodeId).deleteStack(id, keepVolumes ?? false),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.stacks(nodeId) });
    },
  });
}

export function useStackAction(nodeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'up' | 'down' | 'restart' }) => {
      const api = getNodeApi(nodeId);
      switch (action) {
        case 'up':      return api.stackUp(id);
        case 'down':    return api.stackDown(id);
        case 'restart': return api.stackRestart(id);
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: qk.stacks(nodeId) });
      qc.invalidateQueries({ queryKey: qk.stack(nodeId, vars.id) });
    },
  });
}
