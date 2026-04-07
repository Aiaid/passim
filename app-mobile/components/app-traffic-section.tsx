import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '@/lib/i18n';
import { useAppTraffic, useResetAppTraffic } from '@/hooks/use-app-traffic';
import type { TrafficUserSummary } from '@passim/shared/types';

interface Props {
  nodeId: string;
  appId: string;
}

const PERIODS = ['1h', '24h', '7d', '30d'] as const;
const PERIOD_KEYS: Record<string, string> = {
  '1h': 'app.period_1h',
  '24h': 'app.period_24h',
  '7d': 'app.period_7d',
  '30d': 'app.period_30d',
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function UserTrafficCard({ user }: { user: TrafficUserSummary }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const hasNodes = (user.nodes?.length ?? 0) > 1;

  return (
    <Pressable
      className="bg-gray-900 rounded-xl px-4 py-3"
      onPress={hasNodes ? () => setExpanded(!expanded) : undefined}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-1.5">
            {hasNodes && (
              <Ionicons
                name={expanded ? 'chevron-down' : 'chevron-forward'}
                size={12}
                color="#9ca3af"
              />
            )}
            <Text className="text-white text-sm font-medium" numberOfLines={1}>
              {user.username}
            </Text>
          </View>
          {user.online_connections > 0 && (
            <Text className="text-green-500 text-xs mt-0.5">
              {t('app.connections', { count: String(user.online_connections) })}
            </Text>
          )}
        </View>
        <View className="items-end">
          <Text className="text-gray-300 text-xs">
            {'\u2191'} {formatBytes(user.tx_bytes)}
          </Text>
          <Text className="text-gray-300 text-xs">
            {'\u2193'} {formatBytes(user.rx_bytes)}
          </Text>
        </View>
      </View>

      {/* Node breakdown */}
      {expanded && user.nodes?.map((nd) => (
        <View key={nd.node} className="flex-row items-center justify-between mt-2 pt-2 border-t border-gray-800">
          <Text className="text-gray-500 text-xs flex-1">{nd.node}</Text>
          <View className="items-end">
            <Text className="text-gray-500 text-xs">
              {'\u2191'}{formatBytes(nd.tx_bytes)}  {'\u2193'}{formatBytes(nd.rx_bytes)}
            </Text>
          </View>
        </View>
      ))}
    </Pressable>
  );
}

export function AppTrafficSection({ nodeId, appId }: Props) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<string>('24h');
  const { data, isLoading } = useAppTraffic(nodeId, appId, period);
  const resetMutation = useResetAppTraffic(nodeId, appId);

  const confirmReset = () => {
    Alert.alert(
      t('app.traffic_reset_title'),
      t('app.traffic_reset_desc'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('app.traffic_reset'),
          style: 'destructive',
          onPress: () => {
            resetMutation.mutate(undefined, {
              onError: () => Alert.alert(t('app.traffic_reset_failed')),
            });
          },
        },
      ],
    );
  };

  return (
    <View className="mb-4">
      {/* Period Selector + Reset */}
      <View className="flex-row items-center gap-2 mb-3">
        <View className="flex-row flex-1 gap-2">
          {PERIODS.map((p) => (
            <Pressable
              key={p}
              className={`flex-1 py-2 rounded-lg items-center ${
                period === p ? 'bg-blue-600' : 'bg-gray-900'
              }`}
              onPress={() => setPeriod(p)}
            >
              <Text
                className={`text-xs font-medium ${
                  period === p ? 'text-white' : 'text-gray-400'
                }`}
              >
                {t(PERIOD_KEYS[p])}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          className="px-3 py-2 rounded-lg bg-gray-900 items-center justify-center"
          onPress={confirmReset}
          disabled={resetMutation.isPending}
        >
          {resetMutation.isPending ? (
            <ActivityIndicator size="small" color="#9ca3af" />
          ) : (
            <Ionicons name="refresh" size={16} color="#9ca3af" />
          )}
        </Pressable>
      </View>

      {isLoading ? (
        <View className="bg-gray-900 rounded-xl p-4 items-center">
          <ActivityIndicator size="small" color="#fff" />
        </View>
      ) : !data ? (
        <View className="bg-gray-900 rounded-xl p-4 items-center">
          <Text className="text-gray-500 text-sm">{t('app.no_traffic')}</Text>
        </View>
      ) : (
        <>
          {/* Summary Card */}
          <View className="bg-gray-900 rounded-xl p-4 mb-2">
            <View className="flex-row justify-between">
              <View className="flex-1 items-center">
                <Text className="text-gray-400 text-xs mb-1">{t('app.total_upload')}</Text>
                <Text className="text-white text-base font-semibold">
                  {formatBytes(data.total.tx_bytes)}
                </Text>
              </View>
              <View className="w-px bg-gray-800" />
              <View className="flex-1 items-center">
                <Text className="text-gray-400 text-xs mb-1">{t('app.total_download')}</Text>
                <Text className="text-white text-base font-semibold">
                  {formatBytes(data.total.rx_bytes)}
                </Text>
              </View>
              <View className="w-px bg-gray-800" />
              <View className="flex-1 items-center">
                <Text className="text-gray-400 text-xs mb-1">{t('app.total_traffic')}</Text>
                <Text className="text-white text-base font-semibold">
                  {formatBytes(data.total.tx_bytes + data.total.rx_bytes)}
                </Text>
              </View>
            </View>
          </View>

          {/* Per-User List */}
          {data.users.length > 0 && (
            <View className="gap-2">
              {data.users.map((user) => (
                <UserTrafficCard key={user.username} user={user} />
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}
