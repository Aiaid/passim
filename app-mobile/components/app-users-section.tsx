import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Alert,
  ActivityIndicator,
  Switch,
  TextInput,
  Share,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { TemplateDetail } from '@passim/shared/types';
import { StatusDot } from '@/components/StatusDot';
import { useTranslation } from '@/lib/i18n';
import {
  useAppUsers,
  useCreateAppUser,
  useUpdateAppUser,
  useDeleteAppUser,
  useKickAppUser,
} from '@/hooks/use-app-users';

interface Props {
  nodeId: string;
  appId: string;
  templateDetail: TemplateDetail;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

export function AppUsersSection({ nodeId, appId, templateDetail }: Props) {
  const { t } = useTranslation();
  const { data, isLoading } = useAppUsers(nodeId, appId);
  const createUser = useCreateAppUser(nodeId, appId);
  const updateUser = useUpdateAppUser(nodeId, appId);
  const deleteUser = useDeleteAppUser(nodeId, appId);
  const kickUser = useKickAppUser(nodeId, appId);

  const users = data?.users ?? [];
  const kickSupported = templateDetail.users?.kick_supported ?? false;

  const handleAddUser = () => {
    let username = '';
    let password = '';

    Alert.prompt(
      t('app.add_user'),
      t('app.username'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          onPress: (name: string | undefined) => {
            username = name?.trim() ?? '';
            if (!username) return;
            // Second prompt for password
            Alert.prompt(
              t('app.add_user'),
              t('app.password'),
              [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('common.confirm'),
                  onPress: (pwd: string | undefined) => {
                    password = pwd?.trim() ?? '';
                    createUser.mutate(
                      { username, password: password || undefined },
                    );
                  },
                },
              ],
              'plain-text',
            );
          },
        },
      ],
      'plain-text',
    );
  };

  const handleDelete = (uid: string, username: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      t('app.delete_user_title'),
      t('app.delete_user_desc', { name: username }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => deleteUser.mutate(uid),
        },
      ],
    );
  };

  const handleKick = (uid: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    kickUser.mutate(uid);
  };

  const handleToggle = (uid: string, enabled: boolean) => {
    updateUser.mutate({ uid, data: { enabled } });
  };

  if (isLoading) {
    return (
      <View className="bg-gray-900 rounded-xl p-4 mb-4 items-center">
        <ActivityIndicator size="small" color="#fff" />
      </View>
    );
  }

  return (
    <View className="mb-4">
      {users.length === 0 ? (
        <View className="bg-gray-900 rounded-xl p-4 items-center">
          <Text className="text-gray-500 text-sm">{t('app.no_users_desc')}</Text>
        </View>
      ) : (
        <View className="gap-2">
          {users.map((user) => {
            const isOnline = (user.online_connections ?? 0) > 0;
            return (
              <Pressable
                key={user.id}
                className="bg-gray-900 rounded-xl px-4 py-3 active:opacity-70"
                onLongPress={() => handleDelete(user.id, user.username)}
              >
                <View className="flex-row items-center gap-3">
                  <StatusDot status={isOnline ? 'running' : 'stopped'} size={8} />
                  <View className="flex-1 min-w-0">
                    <Text className="text-white text-sm font-medium" numberOfLines={1}>
                      {user.username}
                    </Text>
                    <View className="flex-row items-center gap-2 mt-0.5">
                      {isOnline ? (
                        <Text className="text-green-500 text-xs">
                          {t('app.connections', { count: String(user.online_connections ?? 0) })}
                        </Text>
                      ) : (
                        <Text className="text-gray-500 text-xs">{t('app.offline')}</Text>
                      )}
                      {user.used_bytes != null && user.quota_bytes > 0 && (
                        <Text className="text-gray-500 text-xs">
                          {formatBytes(user.used_bytes)} / {formatBytes(user.quota_bytes)}
                        </Text>
                      )}
                    </View>
                  </View>
                  <View className="flex-row items-center gap-2">
                    {kickSupported && isOnline && (
                      <Pressable
                        className="px-2 py-1 rounded-lg bg-orange-900/40 active:opacity-70"
                        onPress={() => handleKick(user.id)}
                      >
                        <Text className="text-orange-400 text-xs font-medium">{t('app.kick_user')}</Text>
                      </Pressable>
                    )}
                    <Switch
                      value={user.enabled}
                      onValueChange={(val) => handleToggle(user.id, val)}
                      trackColor={{ false: '#333', true: '#30d158' }}
                      thumbColor="#fff"
                      style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                    />
                  </View>
                </View>
                {/* Per-user URI actions */}
                {(user.connection_uri || user.share_url) && (
                  <View className="flex-row gap-2 mt-2 pt-2 border-t border-gray-800">
                    {user.connection_uri && (
                      <Pressable
                        className="flex-1 flex-row items-center justify-center gap-1 py-1.5 rounded-lg bg-gray-800 active:opacity-70"
                        onPress={() => {
                          Clipboard.setStringAsync(user.connection_uri!);
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        }}
                      >
                        <Ionicons name="copy-outline" size={14} color="#9ca3af" />
                        <Text className="text-gray-400 text-xs">{t('app.copy_uri')}</Text>
                      </Pressable>
                    )}
                    {user.share_url && (
                      <Pressable
                        className="flex-1 flex-row items-center justify-center gap-1 py-1.5 rounded-lg bg-gray-800 active:opacity-70"
                        onPress={() => {
                          Share.share({ url: user.share_url!, message: user.share_url! });
                        }}
                      >
                        <Ionicons name="share-outline" size={14} color="#9ca3af" />
                        <Text className="text-gray-400 text-xs">{t('app.share')}</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Add User Button */}
      <Pressable
        className="bg-gray-900 rounded-xl py-3 items-center mt-2 active:opacity-70"
        onPress={handleAddUser}
        disabled={createUser.isPending}
      >
        {createUser.isPending ? (
          <ActivityIndicator size="small" color="#0a84ff" />
        ) : (
          <View className="flex-row items-center gap-1.5">
            <Ionicons name="add-circle-outline" size={18} color="#0a84ff" />
            <Text className="text-blue-500 font-medium text-sm">{t('app.add_user')}</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}
