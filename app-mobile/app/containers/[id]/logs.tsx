import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useContainerLogs } from '@/hooks/use-containers';
import { useNodeStore } from '@/stores/node-store';
import { useTranslation } from '@/lib/i18n';

export default function ContainerLogsScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const nodeId = useNodeStore((s) => s.activeNodeId) ?? '';
  const { data, isLoading, refetch, isRefetching } = useContainerLogs(nodeId, id);

  const scrollRef = useRef<ScrollView>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const containerName = (useLocalSearchParams<{ name: string }>().name ?? id.slice(0, 12));

  const lines = useMemo(() => {
    if (!data?.logs) return [];
    const raw = data.logs.split('\n');
    while (raw.length > 0 && raw[raw.length - 1] === '') raw.pop();
    return raw;
  }, [data?.logs]);

  useEffect(() => {
    if (autoScroll && lines.length > 0) {
      // Small delay to allow layout to complete
      const timer = setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [lines, autoScroll]);

  const isLoadingState = isLoading || isRefetching;

  return (
    <SafeAreaView className="flex-1 bg-black">
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 gap-3">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 items-center justify-center rounded-full bg-gray-900 active:opacity-70"
        >
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </Pressable>
        <Text className="text-white text-lg font-semibold flex-1" numberOfLines={1}>
          {t('container.logs')}
        </Text>
      </View>

      {/* Terminal chrome bar */}
      <View className="flex-row items-center justify-between px-4 py-2 bg-neutral-900 border-b border-neutral-800">
        <View className="flex-row items-center gap-2">
          <View className="flex-row gap-1.5">
            <View className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <View className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
            <View className="w-2.5 h-2.5 rounded-full bg-green-500" />
          </View>
          <Text className="text-neutral-500 text-xs font-mono ml-1" numberOfLines={1}>
            {containerName}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          {/* Auto-scroll toggle */}
          <Pressable
            onPress={() => setAutoScroll((prev) => !prev)}
            className="px-2 py-1 rounded-md active:opacity-70"
            style={{ backgroundColor: autoScroll ? 'rgba(48,209,88,0.15)' : 'rgba(255,255,255,0.05)' }}
          >
            <Text
              className="text-xs font-medium"
              style={{ color: autoScroll ? '#30d158' : '#666' }}
            >
              {t('container.auto_scroll')}
            </Text>
          </Pressable>
          {/* Refresh */}
          <Pressable
            onPress={() => refetch()}
            disabled={isLoadingState}
            className="w-7 h-7 items-center justify-center rounded-md active:opacity-70"
          >
            <Ionicons
              name="refresh"
              size={14}
              color="#999"
            />
          </Pressable>
        </View>
      </View>

      {/* Log body */}
      <View className="flex-1 bg-neutral-950">
        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="small" color="#666" />
            <Text className="text-neutral-500 text-xs mt-2 font-mono">
              {t('common.loading')}
            </Text>
          </View>
        ) : lines.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <Ionicons name="document-text-outline" size={36} color="#444" />
            <Text className="text-neutral-500 text-xs mt-2 font-mono">
              {t('container.no_logs')}
            </Text>
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            className="flex-1 p-3"
            contentContainerStyle={{ paddingBottom: 20 }}
            onScrollBeginDrag={() => setAutoScroll(false)}
          >
            {lines.map((line, i) => (
              <View key={i} className="flex-row py-0.5">
                <Text className="text-neutral-600 text-xs font-mono w-8 text-right mr-3" selectable={false}>
                  {i + 1}
                </Text>
                <Text className="text-neutral-300 text-xs font-mono flex-1 flex-shrink" selectable>
                  {line}
                </Text>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}
