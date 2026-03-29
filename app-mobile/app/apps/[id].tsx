import { useCallback, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AppResponse } from '@passim/shared/types';
import { useApp, useDeleteApp } from '@/hooks/use-apps';
import {
  useStartContainer,
  useStopContainer,
  useRestartContainer,
} from '@/hooks/use-containers';
import { useHubNodes } from '@/hooks/use-hub';
import { useNodeStore } from '@/stores/node-store';
import { getNodeApi } from '@/lib/api';
import { StatusDot } from '@/components/StatusDot';
import { ClientConfig } from '@/components/client-config';
import { useTranslation } from '@/lib/i18n';

function mapStatus(status: string): 'running' | 'stopped' | 'deploying' | 'error' {
  switch (status) {
    case 'running': return 'running';
    case 'stopped': return 'stopped';
    case 'deploying': return 'deploying';
    case 'error': return 'error';
    default: return 'stopped';
  }
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <View className="flex-row items-center justify-between py-2.5 border-b border-gray-800">
      <Text className="text-gray-400 text-sm">{label}</Text>
      <Text className="text-white text-sm font-medium flex-shrink" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function ActionButton({
  icon,
  label,
  color,
  onPress,
  loading,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
  loading?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      className="flex-1 bg-gray-900 rounded-xl py-3.5 items-center active:opacity-70"
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
      disabled={loading}
    >
      {loading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <>
          <Ionicons name={icon} size={20} color={color} />
          <Text style={{ color }} className="text-xs font-medium mt-1">
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/* -- Per-node row with start/stop control -- */
function NodeAppRow({
  nodeName,
  nodeRemoteId,
  hubNodeId,
  deployed,
  isLocal,
}: {
  nodeName: string;
  nodeRemoteId: string;
  hubNodeId: string;
  deployed: AppResponse | undefined;
  isLocal: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [actionPending, setActionPending] = useState<'start' | 'stop' | null>(null);

  const handleToggle = useCallback(async () => {
    if (!deployed?.container_id) return;
    const isRunning = deployed.status === 'running';
    const action = isRunning ? 'stop' : 'start';
    setActionPending(action);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const api = getNodeApi(isLocal ? hubNodeId : hubNodeId);
      if (isLocal) {
        if (isRunning) await api.stopContainer(deployed.container_id);
        else await api.startContainer(deployed.container_id);
      } else {
        if (isRunning) await api.nodeStopContainer(nodeRemoteId, deployed.container_id);
        else await api.nodeStartContainer(nodeRemoteId, deployed.container_id);
      }
      // Invalidate to refetch status
      if (isLocal) {
        queryClient.invalidateQueries({ queryKey: ['apps'] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['hub-nodes', hubNodeId, nodeRemoteId, 'apps'] });
      }
    } catch {
      // Silent fail — status will refresh
    } finally {
      setActionPending(null);
    }
  }, [deployed, isLocal, hubNodeId, nodeRemoteId, queryClient]);

  const isRunning = deployed?.status === 'running';

  return (
    <View className="flex-row items-center gap-3 bg-gray-900 rounded-xl px-4 py-3">
      <StatusDot status={deployed ? mapStatus(deployed.status) : 'stopped'} size={8} />
      <View className="flex-1 min-w-0">
        <Text className="text-white text-sm font-medium" numberOfLines={1}>
          {nodeName}
          {isLocal && (
            <Text className="text-gray-500 text-xs"> (Local)</Text>
          )}
        </Text>
        {deployed && (
          <Text className={`text-xs capitalize ${isRunning ? 'text-green-500' : 'text-gray-500'}`}>
            {deployed.status}
          </Text>
        )}
      </View>
      {deployed?.container_id ? (
        <Pressable
          className={`px-4 py-1.5 rounded-lg active:opacity-70 ${isRunning ? 'bg-red-900/40' : 'bg-green-900/40'}`}
          onPress={handleToggle}
          disabled={!!actionPending}
        >
          {actionPending ? (
            <ActivityIndicator size="small" color={isRunning ? '#ff453a' : '#30d158'} />
          ) : (
            <View className="flex-row items-center gap-1.5">
              <Ionicons
                name={isRunning ? 'stop' : 'play'}
                size={14}
                color={isRunning ? '#ff453a' : '#30d158'}
              />
              <Text
                className="text-xs font-medium"
                style={{ color: isRunning ? '#ff453a' : '#30d158' }}
              >
                {isRunning ? t('app.stop') : t('app.start')}
              </Text>
            </View>
          )}
        </Pressable>
      ) : !deployed ? (
        <Text className="text-gray-600 text-xs">{t('mobile.not_deployed')}</Text>
      ) : null}
    </View>
  );
}

export default function AppDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const nodeId = useNodeStore((s) => s.activeNodeId) ?? '';
  const hubNode = useNodeStore((s) => s.hubNode);
  const hubNodeId = hubNode?.id ?? '';
  const { data: app, isLoading: appLoading } = useApp(nodeId, id);
  const deleteApp = useDeleteApp(nodeId);
  const startContainer = useStartContainer(nodeId);
  const stopContainer = useStopContainer(nodeId);
  const restartContainer = useRestartContainer(nodeId);

  // Fetch remote nodes from Hub
  const { data: remoteNodes } = useHubNodes();
  const connectedRemotes = (remoteNodes ?? []).filter((n) => n.status === 'connected');
  const hasRemoteNodes = connectedRemotes.length > 0;

  // Fetch apps from each remote node to find same-template deployments
  const remoteAppQueries = useQueries({
    queries: connectedRemotes.map((node) => ({
      queryKey: ['hub-nodes', hubNodeId, node.id, 'apps'] as const,
      queryFn: () => getNodeApi(hubNodeId).getNodeApps(node.id),
      staleTime: 30_000,
      enabled: !!hubNodeId && !!app?.template,
    })),
  });

  const isRunning = app?.status === 'running';
  const containerId = app?.container_id;

  const handleDelete = useCallback(() => {
    if (!app) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      t('mobile.delete_app_title'),
      t('mobile.delete_app_desc', { name: app.template }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            deleteApp.mutate(app.id, {
              onSuccess: () => router.back(),
            });
          },
        },
      ],
    );
  }, [app, deleteApp]);

  const deployedDate = app?.deployed_at
    ? new Date(app.deployed_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : undefined;

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
          {app ? app.template.charAt(0).toUpperCase() + app.template.slice(1) : t('nav.apps')}
        </Text>
      </View>

      {appLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#30d158" />
        </View>
      ) : app ? (
        <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Status */}
          <View className="bg-gray-900 rounded-xl p-4 mb-4">
            <View className="flex-row items-center gap-2 mb-3">
              <StatusDot status={mapStatus(app.status)} />
              <Text className="text-white font-semibold text-base capitalize">
                {app.status}
              </Text>
            </View>
            <InfoRow label={t('app.overview')} value={app.template} />
            <InfoRow label={t('app.deployed_at')} value={deployedDate} />
            <InfoRow label={t('app.container')} value={containerId?.slice(0, 12)} />
          </View>

          {/* Per-node controls — only when remote nodes exist */}
          {hasRemoteNodes && (
            <>
              <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
                {t('node.title')}
              </Text>
              <View className="gap-2 mb-4">
                {/* Local (hub) node */}
                <NodeAppRow
                  nodeName={hubNode?.name ?? 'Local'}
                  nodeRemoteId=""
                  hubNodeId={hubNodeId}
                  deployed={app}
                  isLocal
                />
                {/* Remote nodes */}
                {connectedRemotes.map((node, i) => {
                  const remoteApps = remoteAppQueries[i]?.data;
                  const remoteApp = remoteApps?.find(
                    (a: AppResponse) => a.template === app.template,
                  );
                  return (
                    <NodeAppRow
                      key={node.id}
                      nodeName={node.name || node.address}
                      nodeRemoteId={node.id}
                      hubNodeId={hubNodeId}
                      deployed={remoteApp}
                      isLocal={false}
                    />
                  );
                })}
              </View>
            </>
          )}

          {/* Settings */}
          {Object.keys(app.settings).length > 0 ? (
            <>
              <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
                {t('app.settings')}
              </Text>
              <View className="bg-gray-900 rounded-xl p-4 mb-4">
                {Object.entries(app.settings).map(([key, value]) => (
                  <InfoRow key={key} label={key} value={String(value)} />
                ))}
              </View>
            </>
          ) : null}

          {/* Client Config */}
          <View testID="client-config" className="mb-4">
            <ClientConfig nodeId={nodeId} appId={id} templateName={app.template} />
          </View>

          {/* Container Tools */}
          {containerId ? (
            <>
              <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
                {t('app.container')}
              </Text>
              <View className="flex-row gap-3 mb-4">
                <ActionButton
                  testID="btn-app-logs"
                  icon="document-text"
                  label={t('container.view_logs')}
                  color="#0a84ff"
                  onPress={() => {
                    router.push({
                      pathname: '/containers/[id]/logs',
                      params: { id: containerId, name: app!.template },
                    });
                  }}
                />
              </View>
            </>
          ) : null}

          {/* Actions */}
          <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
            {t('common.actions')}
          </Text>
          <View className="flex-row gap-3 mb-4">
            <ActionButton
              testID="btn-app-restart"
              icon="refresh"
              label={t('app.restart')}
              color="#ffd60a"
              loading={restartContainer.isPending}
              onPress={() => {
                if (containerId) restartContainer.mutate(containerId);
              }}
            />
            {isRunning ? (
              <ActionButton
                testID="btn-app-stop"
                icon="stop"
                label={t('app.stop')}
                color="#ff453a"
                loading={stopContainer.isPending}
                onPress={() => {
                  if (containerId) stopContainer.mutate(containerId);
                }}
              />
            ) : (
              <ActionButton
                testID="btn-app-start"
                icon="play"
                label={t('app.start')}
                color="#30d158"
                loading={startContainer.isPending}
                onPress={() => {
                  if (containerId) startContainer.mutate(containerId);
                }}
              />
            )}
          </View>

          {/* Delete */}
          <Pressable
            testID="btn-app-delete"
            className="bg-gray-900 rounded-xl py-4 items-center active:opacity-70 mt-2"
            onPress={handleDelete}
            disabled={deleteApp.isPending}
          >
            {deleteApp.isPending ? (
              <ActivityIndicator size="small" color="#ff453a" />
            ) : (
              <Text className="text-red-500 font-semibold">{t('mobile.delete_app')}</Text>
            )}
          </Pressable>
        </ScrollView>
      ) : (
        <View className="flex-1 items-center justify-center">
          <Text className="text-gray-500">{t('common.no_data')}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}
