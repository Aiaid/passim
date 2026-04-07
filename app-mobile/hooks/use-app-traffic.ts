import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getNodeApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';

export function useAppTraffic(nodeId: string, appId: string, period: string) {
  return useQuery({
    queryKey: qk.appTraffic(nodeId, appId, period),
    queryFn: () => getNodeApi(nodeId).getAppTraffic(appId, period),
    enabled: !!nodeId && !!appId,
    refetchInterval: 60_000,
  });
}

export function useResetAppTraffic(nodeId: string, appId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => getNodeApi(nodeId).resetAppTraffic(appId),
    onSuccess: () => {
      // Invalidate every cached period for this app
      queryClient.invalidateQueries({ queryKey: ['app-traffic', nodeId, appId] });
    },
  });
}
