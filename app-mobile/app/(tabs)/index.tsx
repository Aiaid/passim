import { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSSE } from '@/hooks/use-sse';
import { useStatus, useNodes } from '@/hooks/use-node';
import { useApps } from '@/hooks/use-apps';
import { useNodeStore } from '@/stores/node-store';
import { MetricRing } from '@/components/MetricRing';
import { AppCard } from '@/components/AppCard';
import { EmptyState } from '@/components/EmptyState';
import { StatusDot } from '@/components/StatusDot';
import { GlobeView } from '@/components/globe/GlobeView';
import { formatBytes, formatUptime, formatNetworkRate, countryFlag } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';
import { router } from 'expo-router';
import type { AppResponse } from '@passim/shared/types';

export default function DashboardScreen() {
  const { t } = useTranslation();
  const { nodes, activeNodeId, setActiveNode, activeNode } = useNodeStore();
  const { metrics, isConnected } = useSSE();
  const statusQuery = useStatus();
  const appsQuery = useApps();
  const nodesQuery = useNodes();

  const status = statusQuery.data;
  const apps = appsQuery.data;

  // Compute metric values from SSE (primary) or status query (fallback)
  const cpuPercent = metrics?.cpu_percent ?? status?.system?.cpu?.usage_percent ?? 0;
  const memUsed = metrics?.mem_used ?? 0;
  const memTotal = metrics?.mem_total ?? 0;
  const memPercent = memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : 0;
  const diskUsed = metrics?.disk_used ?? 0;
  const diskTotal = metrics?.disk_total ?? 0;
  const diskPercent = diskTotal > 0 ? Math.round((diskUsed / diskTotal) * 100) : 0;
  const netSent = metrics?.net_bytes_sent ?? 0;
  const netRecv = metrics?.net_bytes_recv ?? 0;

  const containersRunning = status?.containers?.running ?? 0;
  const containersTotal = status?.containers?.total ?? 0;

  const isRefreshing = statusQuery.isRefetching || appsQuery.isRefetching;

  const onRefresh = useCallback(() => {
    statusQuery.refetch();
    appsQuery.refetch();
  }, [statusQuery, appsQuery]);

  const handleAppPress = useCallback((app: AppResponse) => {
    router.push(`/(tabs)/apps?appId=${app.id}`);
  }, []);

  const hasMultipleNodes = nodes.length > 1;

  const nodeInfo = useMemo(() => ({
    name: status?.node?.name ?? activeNode?.name ?? '--',
    flag: status?.node?.country ? countryFlag(status.node.country) : '',
    version: status?.node?.version ?? '--',
    uptime: status?.node?.uptime != null ? formatUptime(status.node.uptime) : '--',
    ip: status?.node?.public_ip ?? '--',
  }), [status, activeNode]);

  return (
    <SafeAreaView className="flex-1 bg-black">
      <ScrollView
        className="flex-1 px-4"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor="#30d158"
          />
        }
      >
        {/* Header */}
        <View className="flex-row items-center justify-between mt-4 mb-4">
          <Text testID="dashboard-title" className="text-2xl font-bold text-white">{t('dashboard.title')}</Text>
          <StatusDot status={isConnected ? 'connected' : 'disconnected'} size={10} />
        </View>

        {/* Node picker pills */}
        {hasMultipleNodes && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mb-4"
          >
            <View className="flex-row gap-2">
              {nodes.map((node) => (
                <TouchableOpacity
                  key={node.id}
                  onPress={() => setActiveNode(node.id)}
                  className={`px-4 py-2 rounded-full ${
                    node.id === activeNodeId
                      ? 'bg-green-600'
                      : 'bg-gray-800'
                  }`}
                >
                  <Text
                    className={`text-sm font-medium ${
                      node.id === activeNodeId
                        ? 'text-white'
                        : 'text-gray-400'
                    }`}
                  >
                    {node.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}

        {/* 3D Globe */}
        <View testID="node-info-card" className="mb-6">
          <GlobeView
            localStatus={status}
            remoteNodes={nodesQuery.data ?? undefined}
          />
          {/* Node info overlay */}
          <View className="flex-row items-center justify-between mt-2 px-1">
            <View className="flex-row items-center gap-2">
              {nodeInfo.flag ? (
                <Text className="text-lg">{nodeInfo.flag}</Text>
              ) : null}
              <Text className="text-white font-semibold">{nodeInfo.name}</Text>
              <Text className="text-gray-500 text-xs">v{nodeInfo.version}</Text>
            </View>
            <Text className="text-gray-400 text-xs">{nodeInfo.ip} · {nodeInfo.uptime}</Text>
          </View>
        </View>

        {/* Metric Rings */}
        <View className="flex-row justify-between mb-6">
          <View testID="metric-cpu">
            <MetricRing
              label={t('dashboard.cpu')}
              value={Math.round(cpuPercent)}
              color="#30d158"
            />
          </View>
          <View testID="metric-memory">
            <MetricRing
              label={t('dashboard.memory')}
              value={memPercent}
              color="#5e5ce6"
            />
          </View>
          <View testID="metric-disk">
            <MetricRing
              label={t('dashboard.disk')}
              value={diskPercent}
              color="#ff9f0a"
            />
          </View>
        </View>

        {/* Network section */}
        <View className="flex-row gap-3 mb-6">
          <View className="flex-1 bg-gray-900 rounded-xl p-4">
            <View className="flex-row items-center gap-2 mb-2">
              <Ionicons name="arrow-up-outline" size={16} color="#30d158" />
              <Text className="text-gray-400 text-sm">{t('speedtest.upload')}</Text>
            </View>
            <Text testID="net-upload" className="text-white text-lg font-bold">
              {formatNetworkRate(netSent)}
            </Text>
          </View>
          <View className="flex-1 bg-gray-900 rounded-xl p-4">
            <View className="flex-row items-center gap-2 mb-2">
              <Ionicons name="arrow-down-outline" size={16} color="#5e5ce6" />
              <Text className="text-gray-400 text-sm">{t('speedtest.download')}</Text>
            </View>
            <Text testID="net-download" className="text-white text-lg font-bold">
              {formatNetworkRate(netRecv)}
            </Text>
          </View>
        </View>

        {/* Container summary */}
        <View testID="container-summary" className="bg-gray-900 rounded-xl p-4 mb-6">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Ionicons name="cube-outline" size={20} color="#9ca3af" />
              <Text className="text-white font-semibold">{t('dashboard.containers')}</Text>
            </View>
            <Text className="text-gray-400">
              {t('mobile.containers_summary', { running: String(containersRunning), total: String(containersTotal) })}
            </Text>
          </View>
        </View>

        {/* Apps section */}
        <Text testID="apps-section" className="text-lg font-semibold text-white mb-3">{t('nav.apps')}</Text>
        {apps && apps.length > 0 ? (
          <View className="gap-3 mb-8">
            {apps.map((app) => (
              <AppCard
                key={app.id}
                app={app}
                onPress={() => handleAppPress(app)}
              />
            ))}
          </View>
        ) : (
          <View className="mb-8">
            <EmptyState
              icon="apps-outline"
              title={t('app.no_apps')}
              subtitle={t('app.no_apps_desc')}
              actionLabel={t('nav.apps')}
              onAction={() => router.push('/(tabs)/apps')}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
