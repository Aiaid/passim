import { useState } from 'react';
import { View, Text, Pressable, Linking, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import type { ClientConfigResponse } from '@passim/shared/types';
import { useNodeStore } from '@/stores/node-store';
import { useHubRemoteConfigs } from '@/hooks/use-hub';
import { QRFullScreen } from './QRFullScreen';
import { CopyableField } from './CopyableField';

interface Props {
  appId: string;
  nodeId: string;
  config: ClientConfigResponse;
  templateName: string;
}

interface NodeURLGroup {
  nodeName: string;
  nodeCountry?: string;
  urls: { name: string; scheme: string; qr?: boolean }[];
}

function countryFlag(code: string): string {
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

export function URLConfig({ appId, nodeId, config, templateName }: Props) {
  const [qrValue, setQrValue] = useState<string | null>(null);
  const [qrTitle, setQrTitle] = useState('QR');
  const [copied, setCopied] = useState<string | null>(null);

  const activeNode = useNodeStore((s) => s.activeNode);
  const { remoteGroups, totalNodes } = useHubRemoteConfigs(templateName);

  // Build subscription URL
  const nodeHost = activeNode?.host ?? '';
  const subscribeURL = config.share_token
    ? `https://${nodeHost}/api/s/${config.share_token}/subscribe`
    : `https://${nodeHost}/api/apps/${appId}/subscribe?token=${activeNode?.token ?? ''}`;

  const handleCopy = async (text: string, key: string) => {
    await Clipboard.setStringAsync(text);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleQR = (value: string, title: string) => {
    setQrValue(value);
    setQrTitle(title);
  };

  const handleShare = (text: string) => {
    Share.share({ message: text });
  };

  return (
    <>
      {/* Import URIs */}
      <View className="bg-gray-900 rounded-xl p-4">
        <Text className="text-white text-sm font-semibold mb-3">Import URI</Text>

        {/* Local node URIs */}
        {config.urls && config.urls.length > 0 && (
          <URIGroup
            label="Local"
            urls={config.urls}
            onCopy={handleCopy}
            onQR={handleQR}
            copiedKey={copied}
          />
        )}

        {/* Remote node URIs (via Hub) */}
        {remoteGroups.map((group) => (
          <URIGroup
            key={group.nodeName}
            label={group.nodeName}
            country={group.nodeCountry}
            urls={group.urls}
            onCopy={handleCopy}
            onQR={handleQR}
            copiedKey={copied}
          />
        ))}
      </View>

      {/* Subscription URL */}
      <View className="bg-gray-900 rounded-xl p-4">
        <View className="flex-row items-center gap-2 mb-2">
          <Ionicons name="link-outline" size={16} color="#999" />
          <Text className="text-gray-400 text-[10px] font-semibold uppercase tracking-widest">
            Subscription URL
          </Text>
          {totalNodes > 1 && (
            <View className="bg-gray-800 px-1.5 py-0.5 rounded">
              <Text className="text-gray-400 text-[10px] font-semibold">
                {totalNodes} nodes
              </Text>
            </View>
          )}
        </View>
        <Text className="text-white text-xs font-mono mb-3" numberOfLines={2} selectable>
          {subscribeURL}
        </Text>
        <View className="flex-row gap-2">
          <SmallButton
            icon={copied === 'sub' ? 'checkmark' : 'copy-outline'}
            label="Copy"
            color={copied === 'sub' ? '#30d158' : '#999'}
            onPress={() => handleCopy(subscribeURL, 'sub')}
          />
          <SmallButton
            icon="qr-code-outline"
            label="QR"
            onPress={() => handleQR(subscribeURL, 'Subscription')}
          />
          <SmallButton
            icon="share-outline"
            label="Share"
            onPress={() => handleShare(subscribeURL)}
          />
        </View>
      </View>

      {/* Import buttons (Stash, Shadowrocket, etc.) */}
      {config.import_urls && Object.keys(config.import_urls).length > 0 && (
        <View className="flex-row flex-wrap gap-2">
          {Object.entries(config.import_urls).map(([client, url]) => (
            <Pressable
              key={client}
              className="flex-row items-center gap-1.5 bg-gray-900 rounded-lg px-3 py-2.5 active:opacity-70"
              onPress={() => Linking.openURL(url)}
            >
              <Ionicons name="open-outline" size={14} color="#5e5ce6" />
              <Text className="text-white text-xs font-medium">
                {client.charAt(0).toUpperCase() + client.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* No Hub prompt */}
      {totalNodes <= 1 && useNodeStore.getState().nodes.length <= 1 && (
        <View className="bg-gray-900/50 rounded-xl p-4 flex-row items-center gap-3">
          <Ionicons name="git-network-outline" size={20} color="#5e5ce6" />
          <View className="flex-1">
            <Text className="text-gray-400 text-xs">
              Add remote nodes to aggregate configs from multiple nodes
            </Text>
          </View>
        </View>
      )}

      <QRFullScreen
        visible={!!qrValue}
        value={qrValue}
        title={qrTitle}
        onClose={() => setQrValue(null)}
      />
    </>
  );
}

function URIGroup({
  label,
  country,
  urls,
  onCopy,
  onQR,
  copiedKey,
}: {
  label: string;
  country?: string;
  urls: { name: string; scheme: string; qr?: boolean }[];
  onCopy: (text: string, key: string) => void;
  onQR: (value: string, title: string) => void;
  copiedKey: string | null;
}) {
  return (
    <View className="mb-4 last:mb-0">
      <View className="flex-row items-center gap-1.5 mb-2">
        {country && <Text className="text-xs">{countryFlag(country)}</Text>}
        <Text className="text-gray-500 text-[10px] font-semibold uppercase tracking-widest">
          {label}
        </Text>
      </View>
      {urls.map((url) => (
        <View key={url.scheme} className="mb-3 last:mb-0">
          <Text className="text-gray-400 text-xs mb-1">{url.name}</Text>
          <View className="bg-black/40 rounded-lg px-3 py-2.5 mb-2">
            <Text className="text-green-400 text-xs font-mono" selectable>
              {url.scheme}
            </Text>
          </View>
          <View className="flex-row gap-2">
            <SmallButton
              icon={copiedKey === url.scheme ? 'checkmark' : 'copy-outline'}
              label="Copy"
              color={copiedKey === url.scheme ? '#30d158' : '#999'}
              onPress={() => onCopy(url.scheme, url.scheme)}
            />
            {url.qr && (
              <SmallButton
                icon="qr-code-outline"
                label="QR"
                onPress={() => onQR(url.scheme, url.name)}
              />
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

function SmallButton({
  icon,
  label,
  color = '#999',
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-1 bg-gray-800 rounded-lg px-2.5 py-1.5 active:opacity-70"
    >
      <Ionicons name={icon} size={14} color={color} />
      <Text style={{ color }} className="text-xs font-medium">
        {label}
      </Text>
    </Pressable>
  );
}
