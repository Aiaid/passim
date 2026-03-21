import { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMultiNodeSSE } from '@/hooks/use-sse';
import { useStatus } from '@/hooks/use-node';
import { useApps } from '@/hooks/use-apps';
import { useNodeStore } from '@/stores/node-store';
import { MetricRing } from '@/components/MetricRing';
import { StatusDot } from '@/components/StatusDot';
import { GlobeView } from '@/components/globe/GlobeView';
import { formatUptime, formatNetworkRate, countryFlag } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';

export default function DashboardScreen() {
  const { t } = useTranslation();
  const { nodes, activeNodeId, setActiveNode, activeNode } = useNodeStore();
  const nodeId = activeNodeId ?? '';
  const { getNodeSSE } = useMultiNodeSSE();
  const sse = getNodeSSE(nodeId);
  const statusQuery = useStatus(nodeId);
  const appsQuery = useApps(nodeId);

  const status = sse.status ?? statusQuery.data;
  const metrics = sse.metrics;
  const isConnected = sse.isConnected;
  const appsCount = appsQuery.data?.length ?? 0;
  const appsRunning = appsQuery.data?.filter((a) => a.status === 'running').length ?? 0;

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

  const nodeInfo = useMemo(() => ({
    name: status?.node?.name ?? activeNode?.name ?? '--',
    flag: status?.node?.country ? countryFlag(status.node.country) : '',
    version: status?.node?.version ?? '--',
    uptime: status?.node?.uptime != null ? formatUptime(status.node.uptime) : '--',
    ip: status?.node?.public_ip ?? '--',
  }), [status, activeNode]);

  return (
    <View className="flex-1 bg-black">
      {/* Full-screen 3D globe background */}
      <GlobeView
        localStatus={status}
        fullscreen
      />

      {/* UI overlay */}
      <SafeAreaView className="flex-1" pointerEvents="box-none">
        <View className="flex-1 px-4 justify-between" pointerEvents="box-none">
          {/* Top: Header + Node picker */}
          <View pointerEvents="auto">
            <View className="flex-row items-center justify-between mt-4 mb-2">
              <Text testID="dashboard-title" className="text-2xl font-bold text-white">{t('dashboard.title')}</Text>
              <StatusDot status={isConnected ? 'connected' : 'disconnected'} size={10} />
            </View>

            {/* Node picker pills */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mb-2"
            >
              <View className="flex-row gap-2">
                {nodes.map((node) => (
                  <TouchableOpacity
                    key={node.id}
                    onPress={() => setActiveNode(node.id)}
                    className={`px-4 py-2 rounded-full ${
                      node.id === activeNodeId
                        ? 'bg-green-600'
                        : 'bg-gray-800/70'
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
          </View>

          {/* Center spacer — let touch pass through to globe */}
          <View className="flex-1" pointerEvents="none" />

          {/* Bottom: Stats */}
          <View pointerEvents="auto">
            {/* Metric Rings */}
            <View className="flex-row justify-between mb-3">
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

            {/* Network row */}
            <View className="flex-row gap-3 mb-3">
              <View className="flex-1 bg-gray-900/80 rounded-xl p-3">
                <View className="flex-row items-center gap-1.5 mb-1">
                  <Ionicons name="arrow-up-outline" size={14} color="#30d158" />
                  <Text className="text-gray-400 text-xs">{t('speedtest.upload')}</Text>
                </View>
                <Text testID="net-upload" className="text-white text-base font-bold">
                  {formatNetworkRate(netSent)}
                </Text>
              </View>
              <View className="flex-1 bg-gray-900/80 rounded-xl p-3">
                <View className="flex-row items-center gap-1.5 mb-1">
                  <Ionicons name="arrow-down-outline" size={14} color="#5e5ce6" />
                  <Text className="text-gray-400 text-xs">{t('speedtest.download')}</Text>
                </View>
                <Text testID="net-download" className="text-white text-base font-bold">
                  {formatNetworkRate(netRecv)}
                </Text>
              </View>
            </View>

            {/* Apps + Containers row */}
            <View className="flex-row gap-3 mb-20">
              <View testID="container-summary" className="flex-1 bg-gray-900/80 rounded-xl p-3">
                <View className="flex-row items-center gap-1.5 mb-1">
                  <Ionicons name="cube-outline" size={14} color="#ff9f0a" />
                  <Text className="text-gray-400 text-xs">{t('dashboard.containers')}</Text>
                </View>
                <Text className="text-white text-base font-bold">
                  <Text className="text-green-500">{containersRunning}</Text>
                  <Text className="text-gray-500"> / {containersTotal}</Text>
                </Text>
              </View>
              <View className="flex-1 bg-gray-900/80 rounded-xl p-3">
                <View className="flex-row items-center gap-1.5 mb-1">
                  <Ionicons name="grid-outline" size={14} color="#bf5af2" />
                  <Text className="text-gray-400 text-xs">{t('nav.apps')}</Text>
                </View>
                <Text className="text-white text-base font-bold">
                  <Text className="text-green-500">{appsRunning}</Text>
                  <Text className="text-gray-500"> / {appsCount}</Text>
                </Text>
              </View>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
