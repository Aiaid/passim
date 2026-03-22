import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Alert,
  Share,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import type { ClientConfigResponse } from '@passim/shared/types';
import { useNodeStore } from '@/stores/node-store';
import { useCreateShare, useRevokeShare } from '@/hooks/use-apps';
import { QRFullScreen } from './QRFullScreen';

interface Props {
  appId: string;
  nodeId: string;
  config: ClientConfigResponse;
}

export function ShareSection({ appId, nodeId, config }: Props) {
  const [qrValue, setQrValue] = useState<string | null>(null);
  const createShare = useCreateShare(nodeId);
  const revokeShare = useRevokeShare(nodeId);
  const activeNode = useNodeStore((s) => s.activeNode);
  const host = activeNode?.host ?? '';

  const handleCopy = async (text: string) => {
    await Clipboard.setStringAsync(text);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleRevoke = (userIndex?: number) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert('Revoke Share', 'This will invalidate the share link. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: () => revokeShare.mutate({ id: appId, userIndex }),
      },
    ]);
  };

  // Per-user sharing for file_per_user
  if (config.type === 'file_per_user' && config.files && config.files.length > 0) {
    const shareTokens = config.share_tokens ?? {};

    return (
      <View className="bg-gray-900 rounded-xl p-4">
        <View className="flex-row items-center gap-2 mb-3">
          <Ionicons name="share-social-outline" size={16} color="#999" />
          <Text className="text-white text-sm font-semibold">Share</Text>
        </View>

        {config.files.map((file) => {
          const token = shareTokens[file.index];
          const url = token ? `https://${host}/s/${token}` : null;

          return (
            <View key={file.index} className="flex-row items-center py-2 border-b border-gray-800 last:border-b-0">
              <View className="w-6 h-6 rounded bg-blue-500/20 items-center justify-center mr-2">
                <Text className="text-blue-400 text-[10px] font-semibold">{file.index}</Text>
              </View>
              <Text className="text-gray-400 text-xs font-mono w-20" numberOfLines={1}>
                {file.name}
              </Text>

              {url ? (
                <View className="flex-1 flex-row items-center gap-1 ml-2">
                  <Text className="flex-1 text-gray-500 text-[10px] font-mono" numberOfLines={1}>
                    {url}
                  </Text>
                  <Pressable
                    onPress={() => handleCopy(url)}
                    className="w-7 h-7 items-center justify-center active:opacity-70"
                  >
                    <Ionicons name="copy-outline" size={13} color="#999" />
                  </Pressable>
                  <Pressable
                    onPress={() => setQrValue(url)}
                    className="w-7 h-7 items-center justify-center active:opacity-70"
                  >
                    <Ionicons name="qr-code-outline" size={13} color="#999" />
                  </Pressable>
                  <Pressable
                    onPress={() => handleRevoke(file.index)}
                    disabled={revokeShare.isPending}
                    className="w-7 h-7 items-center justify-center active:opacity-70"
                  >
                    <Ionicons name="unlink-outline" size={13} color="#ff453a" />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={() => createShare.mutate({ id: appId, userIndex: file.index })}
                  disabled={createShare.isPending}
                  className="ml-auto flex-row items-center gap-1 bg-gray-800 rounded-lg px-2.5 py-1.5 active:opacity-70"
                >
                  {createShare.isPending ? (
                    <ActivityIndicator size="small" color="#999" />
                  ) : (
                    <>
                      <Ionicons name="share-outline" size={12} color="#999" />
                      <Text className="text-gray-400 text-xs">Share</Text>
                    </>
                  )}
                </Pressable>
              )}
            </View>
          );
        })}

        <QRFullScreen
          visible={!!qrValue}
          value={qrValue}
          title="Share Link"
          onClose={() => setQrValue(null)}
        />
      </View>
    );
  }

  // Single share link for url/credentials types
  const shareToken = config.share_token;
  const shareURL = shareToken ? `https://${host}/s/${shareToken}` : null;

  return (
    <View className="bg-gray-900 rounded-xl p-4">
      <View className="flex-row items-center gap-2 mb-3">
        <Ionicons name="share-social-outline" size={16} color="#999" />
        <Text className="text-white text-sm font-semibold">Share</Text>
        {shareURL && (
          <View className="w-2 h-2 rounded-full bg-green-500" />
        )}
      </View>

      {shareURL ? (
        <>
          <View className="bg-black/40 rounded-lg px-3 py-2.5 mb-3">
            <Text className="text-white text-xs font-mono" selectable>
              {shareURL}
            </Text>
          </View>
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => handleCopy(shareURL)}
              className="flex-row items-center gap-1 bg-gray-800 rounded-lg px-2.5 py-1.5 active:opacity-70"
            >
              <Ionicons name="copy-outline" size={14} color="#999" />
              <Text className="text-gray-400 text-xs">Copy</Text>
            </Pressable>
            <Pressable
              onPress={() => setQrValue(shareURL)}
              className="flex-row items-center gap-1 bg-gray-800 rounded-lg px-2.5 py-1.5 active:opacity-70"
            >
              <Ionicons name="qr-code-outline" size={14} color="#999" />
              <Text className="text-gray-400 text-xs">QR</Text>
            </Pressable>
            <Pressable
              onPress={() => Share.share({ message: shareURL })}
              className="flex-row items-center gap-1 bg-gray-800 rounded-lg px-2.5 py-1.5 active:opacity-70"
            >
              <Ionicons name="share-outline" size={14} color="#999" />
              <Text className="text-gray-400 text-xs">Share</Text>
            </Pressable>
            <Pressable
              onPress={() => handleRevoke()}
              disabled={revokeShare.isPending}
              className="flex-row items-center gap-1 bg-gray-800 rounded-lg px-2.5 py-1.5 active:opacity-70"
            >
              <Ionicons name="unlink-outline" size={14} color="#ff453a" />
              <Text className="text-red-500 text-xs">Revoke</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <Pressable
          onPress={() => createShare.mutate({ id: appId })}
          disabled={createShare.isPending}
          className="flex-row items-center justify-center gap-1.5 bg-gray-800 rounded-lg py-2.5 active:opacity-70"
        >
          {createShare.isPending ? (
            <ActivityIndicator size="small" color="#999" />
          ) : (
            <>
              <Ionicons name="share-outline" size={16} color="#999" />
              <Text className="text-gray-400 text-sm font-medium">Create Share Link</Text>
            </>
          )}
        </Pressable>
      )}

      <QRFullScreen
        visible={!!qrValue}
        value={qrValue}
        title="Share Link"
        onClose={() => setQrValue(null)}
      />
    </View>
  );
}
