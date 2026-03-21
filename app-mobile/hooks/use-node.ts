import { useQuery } from '@tanstack/react-query';
import { getNodeApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';

export function useStatus(nodeId: string) {
  return useQuery({
    queryKey: qk.status(nodeId),
    queryFn: () => getNodeApi(nodeId).getStatus(),
    enabled: !!nodeId,
  });
}
