import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Circle, Wifi, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';
import { useEventStream, useResourceEvents } from '@/hooks/use-event-stream';

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

  const { isConnected } = useEventStream();

  useResourceEvents(`app:${appId}`, (raw) => {
    const wrapper = raw as { type: string; data: string };
    const event: AppEvent = {
      type: wrapper.type,
      data: typeof wrapper.data === 'string' ? wrapper.data : JSON.stringify(wrapper.data),
      timestamp: new Date().toISOString(),
    };
    setEvents((prev) => [event, ...prev]);
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
