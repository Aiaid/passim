import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useStatus } from '@/hooks/use-node';
import { useNodeStore } from '@/stores/node-store';
import { useMultiNodeSSE } from '@/hooks/use-sse';
import { countryFlag } from '@/lib/utils';
import { StatusDot } from '@/components/StatusDot';
import { useTranslation } from '@/lib/i18n';

function NodeCard({ nodeId, onPress }: { nodeId: string; onPress: () => void }) {
  const { t } = useTranslation();
  const node = useNodeStore((s) => s.nodes.find((n) => n.id === nodeId));
  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const hubNodeId = useNodeStore((s) => s.hubNodeId);
  const setHubNode = useNodeStore((s) => s.setHubNode);
  const { data: status, isLoading } = useStatus(nodeId);
  const { getNodeSSE } = useMultiNodeSSE();
  const sse = getNodeSSE(nodeId);

  const isActive = nodeId === activeNodeId;
  const isHub = nodeId === hubNodeId;

  const handleLongPress = () => {
    Alert.alert(
      isHub ? 'Remove Hub' : 'Set as Hub',
      isHub
        ? 'Remove this node as the Hub?'
        : 'Use this node to aggregate configs from all nodes?',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: isHub ? 'Remove' : 'Set as Hub',
          style: isHub ? 'destructive' : 'default',
          onPress: () => setHubNode(isHub ? null : nodeId),
        },
      ],
    );
  };
  const connected = sse.isConnected;
  const nodeStatus = sse.status ?? status;
  const flag = nodeStatus?.node?.country ? countryFlag(nodeStatus.node.country) : '';
  const nodeName = nodeStatus?.node?.name ?? node?.name ?? nodeId;

  return (
    <Pressable
      className={`bg-gray-900 rounded-xl p-4 active:opacity-70 ${isActive ? 'border border-green-600' : ''}`}
      onPress={onPress}
      onLongPress={handleLongPress}
    >
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center gap-2 flex-1">
          {flag ? <Text className="text-base">{flag}</Text> : null}
          <Text className="text-white font-semibold text-base" numberOfLines={1}>
            {nodeName}
          </Text>
          {isHub && (
            <View className="bg-blue-500/20 px-1.5 py-0.5 rounded">
              <Text className="text-blue-400 text-[10px] font-semibold">HUB</Text>
            </View>
          )}
          {nodeStatus?.node?.version ? (
            <Text className="text-gray-600 text-[10px] font-mono">{nodeStatus.node.version}</Text>
          ) : null}
        </View>
        <StatusDot status={connected ? 'connected' : 'disconnected'} />
      </View>

      {isLoading ? (
        <ActivityIndicator size="small" color="#666" />
      ) : nodeStatus ? (
        <>
          <BarGauge label="CPU" value={nodeStatus.system.cpu.usage_percent} />
          <BarGauge label="MEM" value={nodeStatus.system.memory.usage_percent} />
          <Text className="text-gray-500 text-xs mt-2">
            {t('mobile.containers_summary', {
              running: String(nodeStatus.containers.running),
              total: String(nodeStatus.containers.total),
            })}
          </Text>
        </>
      ) : null}
    </Pressable>
  );
}

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

export default function NodesScreen() {
  const { t } = useTranslation();
  const { top } = useSafeAreaInsets();
  const nodes = useNodeStore((s) => s.nodes);
  const setActiveNode = useNodeStore((s) => s.setActiveNode);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // SSE handles real-time updates; pull-to-refresh is just a visual affordance
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  const renderNode = useCallback(
    ({ item }: { item: { id: string } }) => (
      <View className="mb-3">
        <NodeCard
          nodeId={item.id}
          onPress={() => {
            setActiveNode(item.id);
            router.push(`/nodes/${item.id}`);
          }}
        />
      </View>
    ),
    [setActiveNode],
  );

  return (
    <View className="flex-1 bg-black">
      <FlatList
        className="flex-1 px-4"
        data={nodes}
        keyExtractor={(item) => item.id}
        renderItem={renderNode}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#666"
          />
        }
        ListHeaderComponent={
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
        }
        ListEmptyComponent={
          <View className="items-center mt-12">
            <Ionicons name="server-outline" size={48} color="#444" />
            <Text className="text-gray-500 mt-3">{t('mobile.no_remote_nodes')}</Text>
          </View>
        }
        contentContainerStyle={{ paddingTop: top, paddingBottom: 32 }}
      />
    </View>
  );
}
