import { View, Text, Pressable } from 'react-native';
import type { AppResponse } from '@passim/shared/types';
import { StatusDot, type StatusDotProps } from '@/components/StatusDot';

export interface AppCardProps {
  app: AppResponse;
  onPress?: () => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  vpn: '#30d158',
  media: '#5e5ce6',
  storage: '#0a84ff',
  network: '#ff9f0a',
  remote: '#bf5af2',
};

function getCategoryFromTemplate(template: string): string {
  const t = template.toLowerCase();
  if (t.includes('wireguard') || t.includes('vpn') || t.includes('outline')) return 'vpn';
  if (t.includes('plex') || t.includes('jellyfin') || t.includes('media')) return 'media';
  if (t.includes('nextcloud') || t.includes('storage') || t.includes('file')) return 'storage';
  if (t.includes('remote') || t.includes('desktop') || t.includes('rdp')) return 'remote';
  return 'network';
}

function mapStatus(status: string): StatusDotProps['status'] {
  switch (status) {
    case 'running': return 'running';
    case 'stopped': return 'stopped';
    case 'deploying': return 'deploying';
    case 'error': return 'error';
    default: return 'stopped';
  }
}

export function AppCard({ app, onPress }: AppCardProps) {
  const category = getCategoryFromTemplate(app.template);
  const borderColor = CATEGORY_COLORS[category] ?? '#666';
  const displayName = app.template.charAt(0).toUpperCase() + app.template.slice(1);
  const letter = app.template.charAt(0).toUpperCase();

  return (
    <Pressable
      className="bg-gray-900 rounded-xl p-4 flex-row items-center gap-3 active:opacity-70"
      onPress={onPress}
    >
      <View
        style={{ borderColor, borderWidth: 2 }}
        className="w-11 h-11 rounded-full items-center justify-center"
      >
        <Text className="text-white font-bold text-lg">{letter}</Text>
      </View>

      <View className="flex-1">
        <Text className="text-white font-semibold text-base" numberOfLines={1}>
          {displayName}
        </Text>
        <View className="flex-row items-center gap-2 mt-1">
          <StatusDot status={mapStatus(app.status)} size={6} />
          <Text className="text-gray-400 text-xs capitalize">{app.status}</Text>
        </View>
      </View>
    </Pressable>
  );
}
