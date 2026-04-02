import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useTranslation } from '@/lib/i18n';
import { useAppTraffic } from '@/hooks/use-app-traffic';

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

export function AppTrafficSection({ nodeId, appId }: Props) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<string>('24h');
  const { data, isLoading } = useAppTraffic(nodeId, appId, period);

  return (
    <View className="mb-4">
      {/* Period Selector */}
      <View className="flex-row gap-2 mb-3">
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
                <View key={user.username} className="bg-gray-900 rounded-xl px-4 py-3">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 min-w-0">
                      <Text className="text-white text-sm font-medium" numberOfLines={1}>
                        {user.username}
                      </Text>
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
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}
