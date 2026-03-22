import { View, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppClientConfig } from '@/hooks/use-apps';
import { URLConfig } from './URLConfig';
import { FilePerUserConfig } from './FilePerUserConfig';
import { CredentialsConfig } from './CredentialsConfig';
import { ShareSection } from './ShareSection';

interface Props {
  nodeId: string;
  appId: string;
  templateName: string;
}

const TYPE_META = {
  file_per_user: { label: 'Files', icon: 'document-text-outline' as const, color: '#0a84ff' },
  credentials: { label: 'Credentials', icon: 'shield-checkmark-outline' as const, color: '#30d158' },
  url: { label: 'Connection', icon: 'globe-outline' as const, color: '#5e5ce6' },
} as const;

export function ClientConfig({ nodeId, appId, templateName }: Props) {
  const { data: config, isLoading } = useAppClientConfig(nodeId, appId);

  if (isLoading) {
    return (
      <View className="py-8 items-center">
        <ActivityIndicator size="small" color="#30d158" />
      </View>
    );
  }

  if (!config) return null;

  const meta = TYPE_META[config.type];

  return (
    <View className="gap-3">
      {/* Section header */}
      <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wider">
        Client Config
      </Text>

      {/* Type badge */}
      <View className="flex-row items-center gap-2">
        <View
          className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-md"
          style={{ backgroundColor: meta.color + '20' }}
        >
          <Ionicons name={meta.icon} size={14} color={meta.color} />
          <Text style={{ color: meta.color }} className="text-xs font-semibold uppercase">
            {meta.label}
          </Text>
        </View>
      </View>

      {/* Content by type */}
      {config.type === 'credentials' && <CredentialsConfig config={config} />}
      {config.type === 'url' && (
        <URLConfig appId={appId} nodeId={nodeId} config={config} templateName={templateName} />
      )}
      {config.type === 'file_per_user' && (
        <FilePerUserConfig appId={appId} nodeId={nodeId} config={config} templateName={templateName} />
      )}

      {/* Share */}
      {config.share_supported && (
        <ShareSection appId={appId} nodeId={nodeId} config={config} />
      )}
    </View>
  );
}
