import { View, Text, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import type { Container } from '@passim/shared/types';
import { StatusDot, type StatusDotProps } from '@/components/StatusDot';

export interface ContainerCardProps {
  container: Container;
  onPress?: () => void;
  onStart?: () => void;
  onStop?: () => void;
  onRestart?: () => void;
  onViewLogs?: () => void;
  onRemove?: () => void;
}

function mapState(state: string): StatusDotProps['status'] {
  switch (state) {
    case 'running': return 'running';
    case 'exited':
    case 'dead':
    case 'created': return 'stopped';
    case 'restarting': return 'deploying';
    default: return 'stopped';
  }
}

function containerName(names: string[]): string {
  const raw = names[0] ?? 'unknown';
  return raw.startsWith('/') ? raw.slice(1) : raw;
}

function ActionButton({
  icon,
  label,
  color,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress?: () => void;
}) {
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress?.();
  };

  return (
    <Pressable
      className="flex-row items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-800 active:opacity-70"
      onPress={handlePress}
    >
      <Ionicons name={icon} size={14} color={color} />
      <Text style={{ color }} className="text-xs font-medium">
        {label}
      </Text>
    </Pressable>
  );
}

export function ContainerCard({
  container,
  onPress,
  onStart,
  onStop,
  onRestart,
  onViewLogs,
  onRemove,
}: ContainerCardProps) {
  const name = containerName(container.Names);
  const isRunning = container.State === 'running';
  const dotStatus = mapState(container.State);

  return (
    <Pressable
      className="bg-gray-900 rounded-xl p-4 active:opacity-70"
      onPress={onPress}
    >
      <View className="flex-row items-center gap-2 mb-2">
        <StatusDot status={dotStatus} />
        <Text className="text-white font-semibold text-base flex-1" numberOfLines={1}>
          {name}
        </Text>
      </View>

      <Text className="text-gray-400 text-xs mb-1" numberOfLines={1}>
        {container.Image}
      </Text>
      <Text className="text-gray-500 text-xs mb-3">{container.Status}</Text>

      <View className="flex-row gap-2 flex-wrap">
        {!isRunning ? (
          <ActionButton icon="play" label="Start" color="#30d158" onPress={onStart} />
        ) : (
          <ActionButton icon="stop" label="Stop" color="#ff453a" onPress={onStop} />
        )}
        <ActionButton icon="refresh" label="Restart" color="#ffd60a" onPress={onRestart} />
        {onViewLogs && (
          <ActionButton icon="document-text" label="Logs" color="#0a84ff" onPress={onViewLogs} />
        )}
        {onRemove && !isRunning && (
          <ActionButton icon="trash" label="Remove" color="#ff6961" onPress={onRemove} />
        )}
      </View>
    </Pressable>
  );
}
