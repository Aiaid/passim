import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Stack, StackStatus } from '@passim/shared/types';
import { useStacks } from '@/hooks/use-stacks';
import { useNodeStore } from '@/stores/node-store';
import { EmptyState } from '@/components/EmptyState';
import { StatusDot } from '@/components/StatusDot';
import { useTranslation } from '@/lib/i18n';

function statusToDot(s: StackStatus): 'running' | 'stopped' | 'deploying' | 'error' {
  switch (s) {
    case 'running': return 'running';
    case 'deploying':
    case 'tearing_down':
      return 'deploying';
    case 'error': return 'error';
    case 'stopped': return 'stopped';
  }
}

export default function StacksScreen() {
  const { t } = useTranslation();
  const { top } = useSafeAreaInsets();
  const nodeId = useNodeStore((s) => s.activeNodeId) ?? '';
  const { data, isLoading, refetch } = useStacks(nodeId);
  const stacks = data?.stacks ?? [];
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const renderStack = useCallback(
    ({ item }: { item: Stack }) => (
      <Pressable
        className="bg-gray-900 rounded-xl p-4 mb-3 active:opacity-70"
        onPress={() => router.push(`/stacks/${item.id}`)}
      >
        <View className="flex-row items-center gap-2">
          <StatusDot status={statusToDot(item.status)} size={8} />
          <Text className="text-white font-semibold text-base flex-1" numberOfLines={1}>
            {item.name}
          </Text>
          <Text className="text-gray-500 text-xs">{item.status}</Text>
        </View>
        {item.last_error && item.status === 'error' && (
          <Text className="text-red-400 text-xs mt-2" numberOfLines={2}>
            {item.last_error}
          </Text>
        )}
        <Text className="text-gray-500 text-xs mt-2">
          {t('stacks.updated_at', { time: new Date(item.updated_at).toLocaleString() })}
        </Text>
      </Pressable>
    ),
    [t],
  );

  return (
    <View className="flex-1 bg-black">
      <View style={{ paddingTop: top + 12 }} className="px-4 pb-3 flex-row items-center justify-between">
        <Text className="text-white text-2xl font-bold">{t('stacks.title')}</Text>
        <Pressable
          onPress={() => router.push('/stacks/new')}
          className="flex-row items-center gap-1 bg-white rounded-full px-3 py-1.5 active:opacity-70"
          testID="new-stack-button"
        >
          <Ionicons name="add" size={18} color="#000" />
          <Text className="text-black font-semibold text-sm">{t('stacks.new')}</Text>
        </Pressable>
      </View>

      {!isLoading && stacks.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <EmptyState
            icon="layers-outline"
            title={t('stacks.empty_title')}
            subtitle={t('stacks.empty_desc')}
          />
        </View>
      ) : (
        <FlatList
          className="flex-1 px-4"
          contentContainerStyle={{ paddingBottom: 120 }}
          data={stacks}
          keyExtractor={(s) => s.id}
          renderItem={renderStack}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#fff"
            />
          }
        />
      )}
    </View>
  );
}
