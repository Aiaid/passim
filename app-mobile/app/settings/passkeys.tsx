import { useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { usePasskeys, useDeletePasskey } from '@/hooks/use-passkeys';
import { useNodeStore } from '@/stores/node-store';
import { useTranslation } from '@/lib/i18n';

interface Passkey {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string;
}

function PasskeyCard({
  passkey,
  onDelete,
  deleting,
  t,
}: {
  passkey: Passkey;
  onDelete: () => void;
  deleting: boolean;
  t: (key: string, params?: Record<string, string>) => string;
}) {
  const createdDate = new Date(passkey.created_at).toLocaleDateString();
  const lastUsed = passkey.last_used_at
    ? new Date(passkey.last_used_at).toLocaleDateString()
    : t('settings.passkey_never_used');

  return (
    <View className="bg-gray-900 rounded-xl p-4 mb-3">
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center gap-2 flex-1">
          <Ionicons name="key-outline" size={18} color="#30d158" />
          <Text className="text-white font-semibold text-base" numberOfLines={1}>
            {passkey.name}
          </Text>
        </View>
        <Pressable
          onPress={onDelete}
          disabled={deleting}
          className="w-8 h-8 items-center justify-center rounded-lg active:opacity-70"
        >
          {deleting ? (
            <ActivityIndicator size="small" color="#ff453a" />
          ) : (
            <Ionicons name="trash-outline" size={18} color="#ff453a" />
          )}
        </Pressable>
      </View>
      <View className="flex-row gap-4">
        <Text className="text-gray-500 text-xs">
          {t('settings.passkey_created')}: {createdDate}
        </Text>
        <Text className="text-gray-500 text-xs">
          {t('settings.passkey_last_used')}: {lastUsed}
        </Text>
      </View>
    </View>
  );
}

export default function PasskeysScreen() {
  const { t } = useTranslation();
  const nodeId = useNodeStore((s) => s.activeNodeId) ?? '';
  const { data: passkeys, isLoading } = usePasskeys(nodeId);
  const deleteMutation = useDeletePasskey(nodeId);

  const handleDelete = useCallback(
    (passkey: Passkey) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(
        t('settings.passkey_delete_title'),
        t('settings.passkey_delete_desc', { name: passkey.name }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.delete'),
            style: 'destructive',
            onPress: () => deleteMutation.mutate(passkey.id),
          },
        ],
      );
    },
    [t, deleteMutation],
  );

  const handleRegister = useCallback(() => {
    Alert.alert(
      t('mobile.register_passkey'),
      t('mobile.passkey_register_web'),
    );
  }, [t]);

  const renderPasskey = useCallback(
    ({ item }: { item: Passkey }) => (
      <PasskeyCard
        passkey={item}
        onDelete={() => handleDelete(item)}
        deleting={deleteMutation.isPending && deleteMutation.variables === item.id}
        t={t}
      />
    ),
    [handleDelete, deleteMutation, t],
  );

  return (
    <SafeAreaView className="flex-1 bg-black">
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 gap-3">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 items-center justify-center rounded-full bg-gray-900 active:opacity-70"
        >
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </Pressable>
        <Text className="text-white text-lg font-semibold flex-1">
          {t('settings.passkeys')}
        </Text>
        <Pressable
          onPress={handleRegister}
          className="bg-primary rounded-lg px-4 py-2"
        >
          <Text className="text-black font-semibold">{t('settings.passkey_register')}</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#30d158" />
        </View>
      ) : !passkeys?.length ? (
        <View className="flex-1 items-center justify-center px-8">
          <View className="bg-gray-900 rounded-2xl p-8 items-center w-full">
            <Ionicons name="finger-print-outline" size={64} color="#666" />
            <Text className="text-white text-xl font-bold mt-4 mb-2 text-center">
              {t('settings.passkey_empty')}
            </Text>
            <Text className="text-gray-400 text-center leading-5">
              {t('settings.passkey_empty_desc')}
            </Text>
          </View>
        </View>
      ) : (
        <FlatList
          className="flex-1 px-4"
          data={passkeys}
          keyExtractor={(item) => item.id}
          renderItem={renderPasskey}
          contentContainerStyle={{ paddingBottom: 32, paddingTop: 8 }}
        />
      )}
    </SafeAreaView>
  );
}
