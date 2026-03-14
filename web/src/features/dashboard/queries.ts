import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export function useStatus() {
  return useQuery({
    queryKey: ['status'],
    queryFn: () => api.getStatus(),
    refetchInterval: 30_000,
  });
}

export function useContainersSummary() {
  return useQuery({
    queryKey: ['containers'],
    queryFn: () => api.getContainers(),
  });
}

export function useAppsSummary() {
  return useQuery({
    queryKey: ['apps'],
    queryFn: () => api.getApps(),
  });
}
