import { useTranslation } from 'react-i18next';
import { Unplug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';
import { useConnections, useDisconnect } from './queries';

export function NodeConnectionList() {
  const { t } = useTranslation();
  const { data: connections, isLoading } = useConnections();
  const disconnectMutation = useDisconnect();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('connection.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!connections || connections.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('connection.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Unplug}
            title={t('connection.no_connections')}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('connection.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {connections.map((conn) => (
            <div
              key={conn.id}
              className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-mono">{conn.remote_ip}</p>
                <p className="text-xs text-muted-foreground">
                  {t('connection.connected_at')}: {new Date(conn.connected_at).toLocaleString()}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => disconnectMutation.mutate(conn.id)}
                disabled={disconnectMutation.isPending}
              >
                {t('connection.disconnect')}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
