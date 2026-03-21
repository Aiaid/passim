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
import type { Container, AppResponse } from '@passim/shared/types';
import { useStatus, useNodeStatus, useRemoveRemoteNode } from '@/hooks/use-node';
import { useContainers } from '@/hooks/use-containers';
import { useApps } from '@/hooks/use-apps';
import { useNodeStore } from '@/stores/node-store';
import { countryFlag, formatUptime, formatBytes } from '@/lib/utils';
import { StatusDot } from '@/components/StatusDot';
import { MetricRing } from '@/components/MetricRing';
import { ContainerCard } from '@/components/ContainerCard';
import { AppCard } from '@/components/AppCard';
import { useTranslation } from '@/lib/i18n';

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <View className="flex-row items-center justify-between py-2.5 border-b border-gray-800">
      <Text className="text-gray-400 text-sm">{label}</Text>
      <Text className="text-white text-sm font-medium" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export default function NodeDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isLocal = id === 'local';

  const activeNode = useNodeStore((s: { activeNode: unknown }) => s.activeNode) as { name: string; host: string } | null;
  const { data: localStatus, isLoading: localLoading } = useStatus();
  const { data: remoteStatus, isLoading: remoteLoading } = useNodeStatus(isLocal ? '' : id);
  const { data: containers } = useContainers();
  const { data: apps } = useApps();
  const removeMutation = useRemoveRemoteNode();

  const status = isLocal ? localStatus : remoteStatus;
  const isLoading = isLocal ? localLoading : remoteLoading;

  const nodeName = status?.node.name ?? (isLocal ? activeNode?.name : id) ?? t('nav.nodes');
  const flag = status?.node.country ? countryFlag(status.node.country) : '';

  const handleRemove = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      t('mobile.remove_node_title'),
      t('mobile.remove_node_confirm', { name: nodeName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            removeMutation.mutate(id, {
              onSuccess: () => router.back(),
            });
          },
        },
      ],
    );
  }, [id, nodeName, removeMutation]);

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
        <Text testID="node-detail-name" className="text-white text-lg font-semibold flex-1" numberOfLines={1}>
          {flag ? `${flag} ` : ''}{nodeName}
        </Text>
        <StatusDot status={status ? 'connected' : 'disconnected'} />
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#30d158" />
        </View>
      ) : (
        <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Node Info */}
          <View className="bg-gray-900 rounded-xl p-4 mb-4">
            {status ? (
              <>
                <InfoRow label={t('dashboard.version')} value={status.node.version} />
                {!isLocal && <InfoRow label={t('node.address')} value={activeNode?.host} />}
                <InfoRow label={t('dashboard.uptime')} value={formatUptime(status.node.uptime)} />
                <InfoRow label="IP" value={status.node.public_ip} />
                <InfoRow label={t('dashboard.os')} value={status.system.os} />
                <InfoRow label={t('dashboard.kernel')} value={status.system.kernel} />
                <InfoRow label={t('dashboard.cores')} value={String(status.system.cpu.cores)} />
                <InfoRow
                  label={t('dashboard.memory')}
                  value={`${formatBytes(status.system.memory.used_bytes)} / ${formatBytes(status.system.memory.total_bytes)}`}
                />
              </>
            ) : (
              <Text className="text-gray-500 text-sm text-center py-4">
                {t('mobile.unable_fetch_status')}
              </Text>
            )}
          </View>

          {/* Metric Rings */}
          {status ? (
            <View className="flex-row justify-around mb-6">
              <MetricRing
                label="CPU"
                value={status.system.cpu.usage_percent}
                color="#30d158"
              />
              <MetricRing
                label="Memory"
                value={status.system.memory.usage_percent}
                color="#5e5ce6"
              />
              <MetricRing
                label="Disk"
                value={status.system.disk.usage_percent}
                color="#0a84ff"
              />
            </View>
          ) : null}

          {/* Containers */}
          {containers && containers.length > 0 ? (
            <>
              <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
                {t('dashboard.containers')}
              </Text>
              <View className="gap-3 mb-6">
                {containers.map((container: Container) => (
                  <ContainerCard key={container.Id} container={container} />
                ))}
              </View>
            </>
          ) : null}

          {/* Apps */}
          {apps && apps.length > 0 ? (
            <>
              <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
                {t('nav.apps')}
              </Text>
              <View className="gap-3 mb-6">
                {apps.map((app: AppResponse) => (
                  <AppCard
                    key={app.id}
                    app={app}
                    onPress={() => router.push(`/apps/${app.id}`)}
                  />
                ))}
              </View>
            </>
          ) : null}

          {/* Remove Button (remote nodes only) */}
          {!isLocal ? (
            <Pressable
              testID="btn-remove-node"
              className="bg-gray-900 rounded-xl py-4 items-center active:opacity-70 mt-4"
              onPress={handleRemove}
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending ? (
                <ActivityIndicator size="small" color="#ff453a" />
              ) : (
                <Text className="text-red-500 font-semibold">{t('node.remove')}</Text>
              )}
            </Pressable>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
