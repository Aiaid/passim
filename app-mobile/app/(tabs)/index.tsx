import { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMultiNodeSSE } from '@/hooks/use-sse';
import { useStatus } from '@/hooks/use-node';
import { useApps } from '@/hooks/use-apps';
import { useSpeedTest } from '@/hooks/use-speedtest';
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

  // Collect all node statuses for the globe
  const globeNodeStatuses = useMemo(() =>
    nodes.map((n) => {
      const nodeSSE = getNodeSSE(n.id);
      return {
        nodeId: n.id,
        status: nodeSSE.status!,
        isConnected: nodeSSE.isConnected,
      };
    }).filter((n) => n.status != null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, status], // re-derive when any SSE status updates
  );
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

  const speedTest = useSpeedTest(nodeId);

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
        nodeStatuses={globeNodeStatuses}
        activeNodeId={activeNodeId}
        hubNodeId={nodes[0]?.id}
        onNodeSelect={setActiveNode}
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

            {/* Node picker pills — Hub | Remote */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mb-2"
            >
              <View className="flex-row gap-2 items-center">
                {/* Hub node (nodes[0]) */}
                {nodes[0] && (
                  <TouchableOpacity
                    onPress={() => setActiveNode(nodes[0].id)}
                    className={`px-4 py-2 rounded-full ${
                      nodes[0].id === activeNodeId
                        ? 'bg-green-600'
                        : 'bg-gray-800/70'
                    }`}
                  >
                    <Text
                      className={`text-sm font-medium ${
                        nodes[0].id === activeNodeId ? 'text-white' : 'text-gray-400'
                      }`}
                    >
                      {nodes[0].name}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Separator */}
                {nodes.length > 1 && (
                  <View className="w-px h-5 bg-gray-700 mx-1" />
                )}

                {/* Remote nodes */}
                {nodes.slice(1).map((node) => (
                  <TouchableOpacity
                    key={node.id}
                    onPress={() => setActiveNode(node.id)}
                    className={`px-4 py-2 rounded-full ${
                      node.id === activeNodeId
                        ? 'bg-purple-600'
                        : 'bg-gray-800/70'
                    }`}
                  >
                    <Text
                      className={`text-sm font-medium ${
                        node.id === activeNodeId ? 'text-white' : 'text-gray-400'
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
            {/* Node info bar */}
            {status ? (
              <View className="bg-gray-900/80 rounded-xl px-3 py-2 mb-2">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-1.5 flex-1">
                    <Ionicons name="globe-outline" size={12} color="#888" />
                    <Text className="text-gray-300 text-xs font-medium" numberOfLines={1}>
                      {activeNode?.host?.replace(/:.*/, '') ?? '--'}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    <Ionicons name="time-outline" size={11} color="#888" />
                    <Text className="text-gray-400 text-xs">{nodeInfo.uptime}</Text>
                  </View>
                  <View className="flex-row items-center gap-1.5 ml-3">
                    <Text className="text-gray-500 text-xs">{nodeInfo.version}</Text>
                  </View>
                </View>
                <View className="flex-row items-center mt-1 gap-3">
                  {status.node.public_ip ? (
                    <Text className="text-gray-500 text-xs font-mono">{status.node.public_ip}</Text>
                  ) : null}
                  {status.node.public_ip6 ? (
                    <Text className="text-gray-500 text-xs font-mono" numberOfLines={1} style={{ flex: 1 }}>
                      {status.node.public_ip6}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            {/* CPU / MEM / Disk / Net — one row */}
            <View className="flex-row justify-between mb-3">
              <MetricRing label={t('dashboard.cpu')} value={Math.round(cpuPercent)} color="#30d158" size={68} />
              <MetricRing label={t('dashboard.memory')} value={memPercent} color="#5e5ce6" size={68} />
              <MetricRing label={t('dashboard.disk')} value={diskPercent} color="#ff9f0a" size={68} />
              <View className="items-center" style={{ width: 68 }}>
                <View className="bg-gray-900/80 rounded-xl w-full items-center justify-center" style={{ height: 68 }}>
                  <View className="flex-row items-center gap-0.5">
                    <Ionicons name="arrow-up" size={10} color="#30d158" />
                    <Text className="text-white text-xs font-bold">{formatNetworkRate(netSent)}</Text>
                  </View>
                  <View className="flex-row items-center gap-0.5 mt-1">
                    <Ionicons name="arrow-down" size={10} color="#5e5ce6" />
                    <Text className="text-white text-xs font-bold">{formatNetworkRate(netRecv)}</Text>
                  </View>
                </View>
                <Text className="text-gray-400 text-xs mt-1">Net</Text>
              </View>
            </View>

            {/* Speed Test + Summary row */}
            <View className="flex-row gap-3 mb-20">
              {/* Speed test */}
              <TouchableOpacity
                className="flex-1 bg-gray-900/80 rounded-xl p-3"
                onPress={speedTest.isRunning ? speedTest.cancel : speedTest.run}
                activeOpacity={0.7}
              >
                {speedTest.phase === 'idle' ? (
                  <View className="flex-row items-center justify-center gap-2">
                    <Ionicons name="speedometer-outline" size={16} color="#30d158" />
                    <Text className="text-white text-sm font-semibold">{t('speedtest.start')}</Text>
                  </View>
                ) : speedTest.phase === 'done' && speedTest.result ? (
                  <View>
                    <View className="flex-row justify-between">
                      <View className="items-center flex-1">
                        <Text className="text-white text-sm font-bold">{speedTest.result.download}</Text>
                        <Text className="text-gray-500 text-xs">↓ Mbps</Text>
                      </View>
                      <View className="items-center flex-1">
                        <Text className="text-white text-sm font-bold">{speedTest.result.upload}</Text>
                        <Text className="text-gray-500 text-xs">↑ Mbps</Text>
                      </View>
                      <View className="items-center flex-1">
                        <Text className="text-white text-sm font-bold">{speedTest.result.latency}</Text>
                        <Text className="text-gray-500 text-xs">ms</Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View className="flex-row items-center justify-center gap-2">
                    <ActivityIndicator size="small" color="#30d158" />
                    <Text className="text-gray-400 text-sm">
                      {speedTest.phase === 'latency' ? 'Ping...' : speedTest.phase === 'download' ? '↓ ...' : '↑ ...'}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Containers + Apps summary */}
              <View className="flex-1 bg-gray-900/80 rounded-xl p-3 flex-row justify-around">
                <View className="items-center">
                  <Text className="text-white text-sm font-bold">
                    <Text className="text-green-500">{containersRunning}</Text>
                    <Text className="text-gray-500">/{containersTotal}</Text>
                  </Text>
                  <Text className="text-gray-500 text-xs">{t('dashboard.containers')}</Text>
                </View>
                <View className="items-center">
                  <Text className="text-white text-sm font-bold">
                    <Text className="text-green-500">{appsRunning}</Text>
                    <Text className="text-gray-500">/{appsCount}</Text>
                  </Text>
                  <Text className="text-gray-500 text-xs">{t('nav.apps')}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
