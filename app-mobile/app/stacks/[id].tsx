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
import { useStack, useDeleteStack, useStackAction } from '@/hooks/use-stacks';
import { useNodeStore } from '@/stores/node-store';
import { StatusDot } from '@/components/StatusDot';
import { useTranslation } from '@/lib/i18n';
import type { StackStatus, StackService } from '@passim/shared/types';
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

function serviceStateToDot(state?: string): 'running' | 'stopped' | 'deploying' | 'error' {
  switch (state) {
    case 'running': return 'running';
    case 'exited': return 'stopped';
    case 'dead': return 'error';
    case 'created':
    case 'restarting':
      return 'deploying';
    default: return 'stopped';
  }
}

export default function StackDetailScreen() {
  const { t } = useTranslation();
  const { top, bottom } = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const nodeId = useNodeStore((s) => s.activeNodeId) ?? '';

  const { data: stack, isLoading } = useStack(nodeId, id);
  const deleteStack = useDeleteStack(nodeId);
  const action = useStackAction(nodeId);

  const translateError = (err: unknown): string => {
    if (err instanceof ApiError) {
      if (err.code) {
        const msg = t(`stacks.error.${err.code}`);
        if (msg !== `stacks.error.${err.code}`) return msg;
      }
      return err.message;
    }
    return err instanceof Error ? err.message : String(err);
  };

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
            deleteStack.mutate(
              { id: stack.id },
              {
                onSuccess: () => {
                  Alert.alert(t('stacks.delete_queued'));
                  router.back();
                },
                onError: (err) => Alert.alert(t('common.error'), translateError(err)),
              },
            );
          },
        },
      ],
    );
  };

  const runAction = (kind: 'up' | 'down' | 'restart') => {
    if (!stack) return;
    action.mutate(
      { id: stack.id, action: kind },
      {
        onSuccess: () => Alert.alert(t(`stacks.${kind}_queued`)),
        onError: (err) => Alert.alert(t('common.error'), translateError(err)),
      },
    );
  };

  if (isLoading || !stack) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  const busy =
    stack.status === 'deploying' ||
    stack.status === 'tearing_down' ||
    action.isPending ||
    deleteStack.isPending;
  const canUp = !busy && (stack.status === 'stopped' || stack.status === 'error');
  const canDown = !busy && stack.status === 'running';
  const canRestart = !busy && (stack.status === 'running' || stack.status === 'error');
  const canDelete = !busy;
  const services = stack.services ?? [];

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
            <Text className="text-red-400 font-semibold text-sm">{t('stacks.last_error')}</Text>
            <Text className="text-gray-300 text-xs mt-1 font-mono">{stack.last_error}</Text>
          </View>
        )}

        {/* Lifecycle actions */}
        <View className="flex-row gap-2 mb-5">
          <ActionButton
            icon="play"
            label={t('stacks.action_up')}
            disabled={!canUp}
            onPress={() => runAction('up')}
          />
          <ActionButton
            icon="square"
            label={t('stacks.action_down')}
            disabled={!canDown}
            onPress={() => runAction('down')}
          />
          <ActionButton
            icon="refresh"
            label={t('stacks.action_restart')}
            disabled={!canRestart}
            onPress={() => runAction('restart')}
          />
        </View>

        {services.length > 0 && (
          <>
            <Text className="text-gray-400 uppercase text-xs font-semibold mb-2">
              {t('stacks.services')}
            </Text>
            <View className="bg-gray-900 rounded-lg mb-4 overflow-hidden">
              {services.map((svc, i) => (
                <ServiceRow
                  key={svc.name}
                  service={svc}
                  isLast={i === services.length - 1}
                />
              ))}
            </View>
          </>
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
          disabled={!canDelete}
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

function ActionButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: 'play' | 'square' | 'refresh';
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      className={`flex-1 rounded-lg py-2.5 flex-row items-center justify-center gap-1.5 ${
        disabled ? 'bg-gray-800' : 'bg-gray-700 active:opacity-70'
      }`}
    >
      <Ionicons
        name={icon}
        size={16}
        color={disabled ? '#4b5563' : '#fff'}
      />
      <Text className={`font-semibold text-xs ${disabled ? 'text-gray-500' : 'text-white'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

function ServiceRow({ service, isLast }: { service: StackService; isLast: boolean }) {
  const borderCls = isLast ? '' : 'border-b border-gray-800';
  return (
    <View className={`px-3 py-3 flex-row items-center gap-3 ${borderCls}`}>
      <StatusDot status={serviceStateToDot(service.state)} size={8} />
      <View className="flex-1 min-w-0">
        <View className="flex-row items-center gap-2">
          <Text className="text-white text-sm font-medium" numberOfLines={1}>
            {service.name}
          </Text>
          {service.health ? <HealthDot health={service.health} /> : null}
        </View>
        {service.image ? (
          <Text className="text-gray-500 text-xs" numberOfLines={1}>
            {service.image}
          </Text>
        ) : null}
        {service.status ? (
          <Text className="text-gray-500 text-xs" numberOfLines={1}>
            {service.status}
          </Text>
        ) : null}
      </View>
      {service.ports && service.ports.length > 0 ? (
        <View className="items-end">
          {service.ports.map((p) => (
            <Text
              key={p}
              className="text-gray-400 text-xs"
              style={{ fontFamily: 'Menlo' }}
            >
              {p}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function HealthDot({ health }: { health: string }) {
  const bg =
    health === 'healthy' ? 'bg-green-500'
    : health === 'unhealthy' ? 'bg-red-500'
    : 'bg-blue-500';
  return (
    <View className="flex-row items-center gap-1">
      <View className={`w-1.5 h-1.5 rounded-full ${bg}`} />
      <Text className="text-[10px] uppercase text-gray-500">{health}</Text>
    </View>
  );
}
