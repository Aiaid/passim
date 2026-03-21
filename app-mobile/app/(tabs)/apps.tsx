import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppResponse } from '@passim/shared/types';
import { useApps } from '@/hooks/use-apps';
import { useNodeStore } from '@/stores/node-store';
import { AppCard } from '@/components/AppCard';
import { EmptyState } from '@/components/EmptyState';
import { useTranslation } from '@/lib/i18n';

export default function AppsScreen() {
  const { t } = useTranslation();
  const { top } = useSafeAreaInsets();
  const nodeId = useNodeStore((s) => s.activeNodeId) ?? '';
  const { data: apps, isLoading, refetch } = useApps(nodeId);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const renderApp = useCallback(
    ({ item }: { item: AppResponse }) => (
      <View className="mb-3">
        <AppCard app={item} onPress={() => router.push(`/apps/${item.id}`)} />
      </View>
    ),
    [],
  );

  return (
    <View className="flex-1 bg-black">
      <FlatList
        testID="app-list"
        className="flex-1 px-4"
        data={apps ?? []}
        keyExtractor={(item) => item.id}
        renderItem={renderApp}
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
              <Text className="text-2xl font-bold text-white">{t('nav.apps')}</Text>
              <Pressable
                testID="btn-deploy"
                className="bg-primary rounded-lg px-4 py-2"
                onPress={() => router.push('/apps/deploy')}
              >
                <Text className="text-black font-semibold">{t('marketplace.deploy')}</Text>
              </Pressable>
            </View>

            {isLoading ? (
              <ActivityIndicator size="small" color="#666" className="my-8" />
            ) : !apps?.length ? (
              <EmptyState
                testID="apps-empty"
                icon="rocket-outline"
                title={t('app.no_apps')}
                subtitle={t('app.no_apps_desc')}
                actionLabel={t('marketplace.deploy')}
                onAction={() => router.push('/apps/deploy')}
              />
            ) : null}
          </>
        }
        contentContainerStyle={{ paddingTop: top, paddingBottom: 32 }}
      />
    </View>
  );
}
