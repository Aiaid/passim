import { useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cacheDirectory, writeAsStringAsync } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import type { ClientConfigResponse } from '@passim/shared/types';
import { useNodeStore } from '@/stores/node-store';
import { useHubRemoteConfigs, type RemoteFileGroup } from '@/hooks/use-hub';
import { QRFullScreen } from './QRFullScreen';

interface Props {
  appId: string;
  nodeId: string;
  config: ClientConfigResponse;
  templateName: string;
}

function countryFlag(code: string): string {
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

export function FilePerUserConfig({ appId, nodeId, config, templateName }: Props) {
  const [qrValue, setQrValue] = useState<string | null>(null);
  const [qrTitle, setQrTitle] = useState('');
  const [loadingIndex, setLoadingIndex] = useState<number | null>(null);

  const activeNode = useNodeStore((s) => s.activeNode);
  const { remoteFileGroups } = useHubRemoteConfigs(templateName);
  const files = config.files ?? [];

  const fetchFileContent = async (index: number): Promise<string> => {
    if (!activeNode) throw new Error('No active node');
    const res = await fetch(
      `https://${activeNode.host}/api/apps/${appId}/client-config/file/${index}`,
      { headers: { Authorization: `Bearer ${activeNode.token}` } },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  };

  const handleQR = async (index: number, name: string) => {
    try {
      setLoadingIndex(index);
      const content = await fetchFileContent(index);
      setQrValue(content);
      setQrTitle(name);
    } catch {
      Alert.alert('Error', 'Failed to load config file');
    } finally {
      setLoadingIndex(null);
    }
  };

  const handleExport = async (index: number, name: string) => {
    try {
      setLoadingIndex(index);
      const content = await fetchFileContent(index);
      const tempUri = (cacheDirectory ?? '') + name;
      await writeAsStringAsync(tempUri, content);
      await Sharing.shareAsync(tempUri, {
        mimeType: 'application/octet-stream',
        dialogTitle: `Import ${name}`,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Error', 'Failed to export config file');
    } finally {
      setLoadingIndex(null);
    }
  };

  return (
    <>
      <View className="bg-gray-900 rounded-xl p-4">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-white text-sm font-semibold">
            Config Files
            <Text className="text-gray-500 text-xs font-normal">  {files.length}</Text>
          </Text>
        </View>

        {files.map((file) => (
          <View
            key={file.index}
            className="flex-row items-center py-2.5 border-b border-gray-800 last:border-b-0"
          >
            {/* Index badge */}
            <View className="w-7 h-7 rounded-md bg-blue-500/20 items-center justify-center mr-3">
              <Text className="text-blue-400 text-xs font-semibold">{file.index}</Text>
            </View>

            {/* File name */}
            <Text className="flex-1 text-white text-sm font-mono" numberOfLines={1}>
              {file.name}
            </Text>

            {/* Actions */}
            <View className="flex-row items-center gap-1">
              {/* Export / Import */}
              <Pressable
                onPress={() => handleExport(file.index, file.name)}
                disabled={loadingIndex === file.index}
                className="w-8 h-8 rounded-lg bg-gray-800 items-center justify-center active:opacity-70"
              >
                <Ionicons name="share-outline" size={15} color="#5e5ce6" />
              </Pressable>

              {/* QR */}
              {config.qr && (
                <Pressable
                  onPress={() => handleQR(file.index, file.name)}
                  disabled={loadingIndex === file.index}
                  className="w-8 h-8 rounded-lg bg-gray-800 items-center justify-center active:opacity-70"
                >
                  <Ionicons name="qr-code-outline" size={15} color="#999" />
                </Pressable>
              )}
            </View>
          </View>
        ))}
      </View>

      {/* Remote node files (via Hub) */}
      {remoteFileGroups.map((group) => (
        <View key={group.nodeId} className="bg-gray-900 rounded-xl p-4">
          <View className="flex-row items-center gap-1.5 mb-3">
            {group.nodeCountry && <Text className="text-xs">{countryFlag(group.nodeCountry)}</Text>}
            <Text className="text-gray-500 text-[10px] font-semibold uppercase tracking-widest">
              {group.nodeName}
            </Text>
          </View>
          {group.files.map((file) => (
            <View
              key={file.index}
              className="flex-row items-center py-2 border-b border-gray-800 last:border-b-0"
            >
              <View className="w-6 h-6 rounded bg-purple-500/20 items-center justify-center mr-3">
                <Text className="text-purple-400 text-[10px] font-semibold">{file.index}</Text>
              </View>
              <Text className="flex-1 text-gray-300 text-sm font-mono" numberOfLines={1}>
                {file.name}
              </Text>
            </View>
          ))}
        </View>
      ))}

      <QRFullScreen
        visible={!!qrValue}
        value={qrValue}
        title={qrTitle}
        onClose={() => {
          setQrValue(null);
          setQrTitle('');
        }}
      />
    </>
  );
}
