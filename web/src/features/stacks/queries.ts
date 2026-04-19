import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export function useStacks() {
  return useQuery({
    queryKey: ['stacks'],
    queryFn: () => api.getStacks(),
    // Polling keeps the list's status fresh while stacks are deploying or
    // tearing down. Phase 2 will replace this with SSE.
    refetchInterval: (query) => {
      const stacks = query.state.data?.stacks ?? [];
      const hasWork = stacks.some((s) => s.status === 'deploying' || s.status === 'tearing_down');
      return hasWork ? 2_000 : false;
    },
  });
}

export function useStack(id: string | null) {
  return useQuery({
    queryKey: ['stacks', id],
    queryFn: () => api.getStack(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      const s = query.state.data;
      if (!s) return false;
      return s.status === 'deploying' || s.status === 'tearing_down' ? 2_000 : false;
    },
  });
}

export function useValidateStack() {
  return useMutation({
    mutationFn: (data: { name: string; yaml_text: string; env_text?: string; profiles?: string[] }) =>
      api.validateStack(data),
  });
}

export function useCreateStack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; yaml_text: string; env_text?: string; profiles?: string[] }) =>
      api.createStack(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stacks'] });
    },
  });
}

export function useDeleteStack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, keepVolumes }: { id: string; keepVolumes?: boolean }) =>
      api.deleteStack(id, keepVolumes ?? false),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stacks'] });
    },
  });
}

export function useStackAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'up' | 'down' | 'restart' }) => {
      switch (action) {
        case 'up':      return api.stackUp(id);
        case 'down':    return api.stackDown(id);
        case 'restart': return api.stackRestart(id);
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['stacks'] });
      qc.invalidateQueries({ queryKey: ['stacks', vars.id] });
    },
  });
}
