import { View, Text, Pressable } from 'react-native';
import type { RemoteNode } from '@passim/shared/types';
import { countryFlag, formatNetworkRate } from '@/lib/utils';
import { StatusDot } from '@/components/StatusDot';

export interface NodeCardProps {
  node: RemoteNode;
  onPress?: () => void;
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

export function NodeCard({ node, onPress }: NodeCardProps) {
  const flag = node.country ? countryFlag(node.country) : '';
  const dotStatus = node.status === 'connected' ? 'connected' : node.status === 'connecting' ? 'deploying' : 'disconnected';

  return (
    <Pressable
      className="bg-gray-900 rounded-xl p-4 active:opacity-70"
      onPress={onPress}
    >
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center gap-2 flex-1">
          {flag ? <Text className="text-base">{flag}</Text> : null}
          <Text className="text-white font-semibold text-base" numberOfLines={1}>
            {node.name}
          </Text>
        </View>
        <StatusDot status={dotStatus} />
      </View>

      {node.metrics ? (
        <View className="mb-2">
          <BarGauge label="CPU" value={node.metrics.cpu_percent} />
          <BarGauge label="MEM" value={node.metrics.memory_percent} />
          <View className="flex-row items-center gap-3 mt-1.5">
            <Text className="text-gray-400 text-xs">↓ {formatNetworkRate(node.metrics.net_bytes_recv)}</Text>
            <Text className="text-gray-400 text-xs">↑ {formatNetworkRate(node.metrics.net_bytes_sent)}</Text>
          </View>
        </View>
      ) : null}

      {node.metrics?.containers ? (
        <Text className="text-gray-500 text-xs mt-1">
          {node.metrics.containers.running}/{node.metrics.containers.total} containers
        </Text>
      ) : null}
    </Pressable>
  );
}
