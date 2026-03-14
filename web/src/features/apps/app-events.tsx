import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Circle, Wifi, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';
import { useSSE } from '@/hooks/use-sse';

interface AppEvent {
  type: string;
  data: string;
  timestamp: string;
}

interface AppEventsProps {
  appId: string;
}

export function AppEvents({ appId }: AppEventsProps) {
  const { t } = useTranslation();
  const [events, setEvents] = useState<AppEvent[]>([]);

  const { isConnected } = useSSE<AppEvent>(`/apps/${appId}/events`, {
    onMessage: (raw) => {
      const event = raw as AppEvent;
      setEvents((prev) => [event, ...prev]);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {isConnected ? (
          <>
            <Wifi className="size-4 text-green-500" />
            <span className="text-sm text-muted-foreground">{t('app.events_connected')}</span>
          </>
        ) : (
          <>
            <WifiOff className="size-4 text-destructive" />
            <span className="text-sm text-muted-foreground">{t('app.events_disconnected')}</span>
          </>
        )}
      </div>

      {events.length === 0 ? (
        <EmptyState
          icon={Circle}
          title={t('app.no_events')}
        />
      ) : (
        <div className="space-y-2">
          {events.map((event, i) => (
            <Card key={`${event.timestamp}-${i}`}>
              <CardContent className="flex items-start gap-3 py-3">
                <Badge variant="outline" className="mt-0.5 shrink-0">
                  {event.type}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{event.data}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(event.timestamp).toLocaleString()}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
