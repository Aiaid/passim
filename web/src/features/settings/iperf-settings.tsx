import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Gauge, Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { api } from '@/lib/api-client';

export function IperfSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['iperf-status'],
    queryFn: () => api.getIperfStatus(),
    refetchInterval: 10_000,
  });

  const toggle = useMutation({
    mutationFn: (enable: boolean) => (enable ? api.startIperf() : api.stopIperf()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['iperf-status'] }),
  });

  const isRunning = data?.status === 'ready';
  const isUnavailable = data?.status === 'unavailable';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Gauge className="size-5" />
          <CardTitle>{t('settings.iperf_title')}</CardTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="size-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-64">
                <p>{t('settings.iperf_tooltip')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <CardDescription>{t('settings.iperf_desc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-base">{t('settings.iperf_server')}</Label>
            <p className="text-sm text-muted-foreground">
              {isUnavailable
                ? t('settings.iperf_unavailable')
                : isRunning
                  ? t('settings.iperf_running')
                  : t('settings.iperf_stopped')}
            </p>
          </div>
          <Switch
            checked={isRunning}
            onCheckedChange={(checked) => toggle.mutate(checked)}
            disabled={isUnavailable || toggle.isPending}
          />
        </div>
      </CardContent>
    </Card>
  );
}
