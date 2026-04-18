import { useLocalSearchParams, router, Stack as NavStack } from 'expo-router';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStack, useDeleteStack } from '@/hooks/use-stacks';
import { useNodeStore } from '@/stores/node-store';
import { StatusDot } from '@/components/StatusDot';
import { useTranslation } from '@/lib/i18n';
import type { StackStatus } from '@passim/shared/types';
import { ApiError } from '@/lib/api';

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

export default function StackDetailScreen() {
  const { t } = useTranslation();
  const { top, bottom } = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const nodeId = useNodeStore((s) => s.activeNodeId) ?? '';

  const { data: stack, isLoading } = useStack(nodeId, id);
  const deleteStack = useDeleteStack(nodeId);

  const handleDelete = () => {
    if (!stack) return;
    Alert.alert(
      t('stacks.delete_confirm_title'),
      t('stacks.delete_confirm_desc', { name: stack.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('stacks.delete'),
          style: 'destructive',
          onPress: () => {
            deleteStack.mutate(stack.id, {
              onSuccess: () => {
                Alert.alert(t('stacks.delete_queued'));
                router.back();
              },
              onError: (err) => {
                const message = err instanceof ApiError ? err.message : String(err);
                Alert.alert(t('common.error'), message);
              },
            });
          },
        },
      ],
    );
  };

  if (isLoading || !stack) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  const canDelete = stack.status !== 'deploying' && stack.status !== 'tearing_down';

  return (
    <View className="flex-1 bg-black" style={{ paddingTop: top }}>
      <NavStack.Screen options={{ headerShown: false }} />
      <View className="flex-row items-center px-4 py-3 gap-3">
        <Pressable onPress={() => router.back()} className="p-1 active:opacity-70">
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </Pressable>
        <Text className="text-white text-xl font-bold flex-1" numberOfLines={1}>
          {stack.name}
        </Text>
        <StatusDot status={statusToDot(stack.status)} size={10} />
        <Text className="text-gray-400 text-xs ml-1">{stack.status}</Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: bottom + 32 }}
      >
        {stack.last_error && stack.status === 'error' && (
          <View className="bg-red-900/20 border border-red-800 rounded-lg p-3 mb-4">
            <Text className="text-red-400 font-semibold text-sm">
              {t('stacks.last_error')}
            </Text>
            <Text className="text-gray-300 text-xs mt-1 font-mono">{stack.last_error}</Text>
          </View>
        )}

        <Text className="text-gray-400 uppercase text-xs font-semibold mb-2">
          {t('stacks.yaml')}
        </Text>
        <View className="bg-gray-900 rounded-lg p-3 mb-4">
          <Text
            className="text-gray-200 text-xs"
            style={{ fontFamily: 'Menlo' }}
            selectable
          >
            {stack.yaml_text}
          </Text>
        </View>

        {stack.env_text ? (
          <>
            <Text className="text-gray-400 uppercase text-xs font-semibold mb-2">
              {t('stacks.env')}
            </Text>
            <View className="bg-gray-900 rounded-lg p-3 mb-4">
              <Text
                className="text-gray-200 text-xs"
                style={{ fontFamily: 'Menlo' }}
                selectable
              >
                {stack.env_text}
              </Text>
            </View>
          </>
        ) : null}

        <Text className="text-gray-500 text-xs mt-2">
          {t('stacks.updated_at', { time: new Date(stack.updated_at).toLocaleString() })}
        </Text>

        <Pressable
          onPress={handleDelete}
          disabled={!canDelete || deleteStack.isPending}
          className={`mt-6 rounded-lg py-3 flex-row items-center justify-center gap-2 ${
            canDelete ? 'bg-red-900/40 border border-red-800' : 'bg-gray-800'
          }`}
          testID="delete-button"
        >
          <Ionicons name="trash-outline" size={18} color={canDelete ? '#f87171' : '#4b5563'} />
          <Text className={`font-semibold text-sm ${canDelete ? 'text-red-400' : 'text-gray-500'}`}>
            {t('stacks.delete')}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
