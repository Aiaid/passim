import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface EmptyStateProps {
  icon?: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}

export function EmptyState({
  icon = 'cube-outline',
  title,
  subtitle,
  actionLabel,
  onAction,
  testID,
}: EmptyStateProps) {
  return (
    <View testID={testID} className="bg-gray-900 rounded-xl p-8 items-center">
      <Ionicons
        name={icon as keyof typeof Ionicons.glyphMap}
        size={48}
        color="#6b7280"
      />
      <Text className="text-white font-semibold text-base mt-4 text-center">
        {title}
      </Text>
      {subtitle ? (
        <Text className="text-gray-500 text-sm mt-2 text-center">{subtitle}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <Pressable
          className="bg-primary rounded-xl px-6 py-3 mt-5 active:opacity-70"
          onPress={onAction}
        >
          <Text className="text-black font-semibold text-sm">{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
