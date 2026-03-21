import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { RemoteNode } from '@passim/shared/types';
import { useStatus, useNodes } from '@/hooks/use-node';
import { useNodeStore } from '@/stores/node-store';
import { countryFlag } from '@/lib/utils';
import { StatusDot } from '@/components/StatusDot';
import { NodeCard } from '@/components/NodeCard';
import { EmptyState } from '@/components/EmptyState';
import { useTranslation } from '@/lib/i18n';

function BarGauge({ label, value }: { label: string; value: number }) {
  const clamped = Math.min(100, Math.max(0, value));
  const color = clamped >= 90 ? '#ff453a' : clamped >= 75 ? '#ffd60a' : '#30d158';

  return (
    <View className="flex-row items-center gap-2 mt-1">
      <Text className="text-gray-400 text-xs w-8">{label}</Text>
      <View className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
        <View
          style={{ width: `${clamped}%`, backgroundColor: color }}
          className="h-full rounded-full"
        />
      </View>
      <Text className="text-gray-400 text-xs w-9 text-right">{Math.round(clamped)}%</Text>
    </View>
  );
}

function LocalNodeCard() {
  const { t } = useTranslation();
  const activeNode = useNodeStore((s) => s.activeNode);
  const { data: status, isLoading } = useStatus();

  if (!activeNode) return null;

  const flag = status?.node.country ? countryFlag(status.node.country) : '';
  const nodeName = status?.node.name ?? activeNode.name;

  return (
    <Pressable
      testID="local-node-card"
      className="bg-gray-900 rounded-xl p-4 active:opacity-70"
      onPress={() => router.push('/nodes/local')}
    >
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center gap-2 flex-1">
          {flag ? <Text className="text-base">{flag}</Text> : null}
          <Text className="text-white font-semibold text-base" numberOfLines={1}>
            {nodeName}
          </Text>
        </View>
        <StatusDot status={status ? 'connected' : 'disconnected'} />
      </View>

      {isLoading ? (
        <ActivityIndicator size="small" color="#666" />
      ) : status ? (
        <>
          <BarGauge label="CPU" value={status.system.cpu.usage_percent} />
          <BarGauge label="MEM" value={status.system.memory.usage_percent} />
          <Text className="text-gray-500 text-xs mt-2">
            {t('mobile.containers_summary', { running: String(status.containers.running), total: String(status.containers.total) })}
          </Text>
        </>
      ) : null}
    </Pressable>
  );
}

export default function NodesScreen() {
  const { t } = useTranslation();
  const { data: remoteNodes, isLoading, refetch } = useNodes();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const renderRemoteNode = useCallback(
    ({ item }: { item: RemoteNode }) => (
      <View className="mb-3">
        <NodeCard
          node={item}
          onPress={() => router.push(`/nodes/${item.id}`)}
        />
      </View>
    ),
    [],
  );

  return (
    <SafeAreaView className="flex-1 bg-black">
      <FlatList
        className="flex-1 px-4"
        data={remoteNodes ?? []}
        keyExtractor={(item) => item.id}
        renderItem={renderRemoteNode}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#666"
          />
        }
        ListHeaderComponent={
          <>
            {/* Header */}
            <View className="flex-row items-center justify-between mt-4 mb-6">
              <Text className="text-2xl font-bold text-white">{t('nav.nodes')}</Text>
              <Pressable
                testID="btn-add-node"
                className="bg-primary rounded-lg px-4 py-2"
                onPress={() => router.push('/nodes/add')}
              >
                <Text className="text-black font-semibold">{t('node.add')}</Text>
              </Pressable>
            </View>

            {/* Local Node */}
            <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
              {t('mobile.local_node')}
            </Text>
            <View className="mb-6">
              <LocalNodeCard />
            </View>

            {/* Remote Nodes Header */}
            <Text testID="remote-nodes" className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
              {t('mobile.remote_nodes')}
            </Text>

            {isLoading ? (
              <ActivityIndicator size="small" color="#666" className="my-8" />
            ) : !remoteNodes?.length ? (
              <EmptyState
                icon="globe-outline"
                title={t('mobile.no_remote_nodes')}
                subtitle={t('mobile.no_remote_nodes_desc')}
                actionLabel={t('node.add')}
                onAction={() => router.push('/nodes/add')}
              />
            ) : null}
          </>
        }
        contentContainerStyle={{ paddingBottom: 32 }}
      />
    </SafeAreaView>
  );
}
