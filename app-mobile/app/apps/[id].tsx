import { useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import type { ClientConfigResponse } from '@passim/shared/types';
import { useApp, useAppClientConfig, useDeleteApp } from '@/hooks/use-apps';
import {
  useStartContainer,
  useStopContainer,
  useRestartContainer,
} from '@/hooks/use-containers';
import { StatusDot } from '@/components/StatusDot';
import { localized } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';

function mapStatus(status: string): 'running' | 'stopped' | 'deploying' | 'error' {
  switch (status) {
    case 'running': return 'running';
    case 'stopped': return 'stopped';
    case 'deploying': return 'deploying';
    case 'error': return 'error';
    default: return 'stopped';
  }
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <View className="flex-row items-center justify-between py-2.5 border-b border-gray-800">
      <Text className="text-gray-400 text-sm">{label}</Text>
      <Text className="text-white text-sm font-medium flex-shrink" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function ActionButton({
  icon,
  label,
  color,
  onPress,
  loading,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
  loading?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      className="flex-1 bg-gray-900 rounded-xl py-3.5 items-center active:opacity-70"
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
      disabled={loading}
    >
      {loading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <>
          <Ionicons name={icon} size={20} color={color} />
          <Text style={{ color }} className="text-xs font-medium mt-1">
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

function CopyableField({ label, value }: { label: string; value: string }) {
  const handleCopy = () => {
    Clipboard.setString(value);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <View className="flex-row items-center justify-between py-2.5 border-b border-gray-800">
      <View className="flex-1 mr-3">
        <Text className="text-gray-400 text-xs">{label}</Text>
        <Text className="text-white text-sm mt-0.5" numberOfLines={2}>
          {value}
        </Text>
      </View>
      <Pressable
        onPress={handleCopy}
        className="w-9 h-9 rounded-lg bg-gray-800 items-center justify-center active:opacity-70"
      >
        <Ionicons name="copy-outline" size={16} color="#999" />
      </Pressable>
    </View>
  );
}

export default function AppDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: app, isLoading: appLoading } = useApp(id);
  const { data: clientConfig } = useAppClientConfig(id);
  const deleteApp = useDeleteApp();
  const startContainer = useStartContainer();
  const stopContainer = useStopContainer();
  const restartContainer = useRestartContainer();

  const isRunning = app?.status === 'running';
  const containerId = app?.container_id;

  const handleDelete = useCallback(() => {
    if (!app) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      t('mobile.delete_app_title'),
      t('mobile.delete_app_desc', { name: app.template }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            deleteApp.mutate(app.id, {
              onSuccess: () => router.back(),
            });
          },
        },
      ],
    );
  }, [app, deleteApp]);

  const deployedDate = app?.deployed_at
    ? new Date(app.deployed_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : undefined;

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
        <Text className="text-white text-lg font-semibold flex-1" numberOfLines={1}>
          {app ? app.template.charAt(0).toUpperCase() + app.template.slice(1) : t('nav.apps')}
        </Text>
      </View>

      {appLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#30d158" />
        </View>
      ) : app ? (
        <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Status */}
          <View className="bg-gray-900 rounded-xl p-4 mb-4">
            <View className="flex-row items-center gap-2 mb-3">
              <StatusDot status={mapStatus(app.status)} />
              <Text className="text-white font-semibold text-base capitalize">
                {app.status}
              </Text>
            </View>
            <InfoRow label={t('app.overview')} value={app.template} />
            <InfoRow label={t('app.deployed_at')} value={deployedDate} />
            <InfoRow label={t('app.container')} value={containerId?.slice(0, 12)} />
          </View>

          {/* Settings */}
          {Object.keys(app.settings).length > 0 ? (
            <>
              <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
                {t('app.settings')}
              </Text>
              <View className="bg-gray-900 rounded-xl p-4 mb-4">
                {Object.entries(app.settings).map(([key, value]) => (
                  <InfoRow key={key} label={key} value={String(value)} />
                ))}
              </View>
            </>
          ) : null}

          {/* Client Config */}
          {clientConfig ? (
            <>
              <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
                {t('app.configs')}
              </Text>
              <View testID="client-config" className="bg-gray-900 rounded-xl p-4 mb-4">
                {/* Files */}
                {clientConfig.files?.map((file: { index: number; name: string }) => (
                  <CopyableField
                    key={file.index}
                    label={`File #${file.index + 1}`}
                    value={file.name}
                  />
                ))}

                {/* Fields */}
                {clientConfig.fields?.map((field: { key: string; label: Record<string, string>; value: string }) => (
                  <CopyableField
                    key={field.key}
                    label={localized(field.label, 'en-US')}
                    value={field.value}
                  />
                ))}

                {/* URLs */}
                {clientConfig.urls?.map((url: { name: string; scheme: string }) => (
                  <CopyableField
                    key={url.name}
                    label={url.name}
                    value={`${url.scheme}://...`}
                  />
                ))}
              </View>
            </>
          ) : null}

          {/* Actions */}
          <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
            {t('common.actions')}
          </Text>
          <View className="flex-row gap-3 mb-4">
            <ActionButton
              testID="btn-app-restart"
              icon="refresh"
              label={t('app.restart')}
              color="#ffd60a"
              loading={restartContainer.isPending}
              onPress={() => {
                if (containerId) restartContainer.mutate(containerId);
              }}
            />
            {isRunning ? (
              <ActionButton
                testID="btn-app-stop"
                icon="stop"
                label={t('app.stop')}
                color="#ff453a"
                loading={stopContainer.isPending}
                onPress={() => {
                  if (containerId) stopContainer.mutate(containerId);
                }}
              />
            ) : (
              <ActionButton
                testID="btn-app-start"
                icon="play"
                label={t('app.start')}
                color="#30d158"
                loading={startContainer.isPending}
                onPress={() => {
                  if (containerId) startContainer.mutate(containerId);
                }}
              />
            )}
          </View>

          {/* Delete */}
          <Pressable
            testID="btn-app-delete"
            className="bg-gray-900 rounded-xl py-4 items-center active:opacity-70 mt-2"
            onPress={handleDelete}
            disabled={deleteApp.isPending}
          >
            {deleteApp.isPending ? (
              <ActivityIndicator size="small" color="#ff453a" />
            ) : (
              <Text className="text-red-500 font-semibold">{t('mobile.delete_app')}</Text>
            )}
          </Pressable>
        </ScrollView>
      ) : (
        <View className="flex-1 items-center justify-center">
          <Text className="text-gray-500">{t('common.no_data')}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}
