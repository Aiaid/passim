import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Switch as RNSwitch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQueries } from '@tanstack/react-query';
import type { AppResponse } from '@passim/shared/types';
import {
  useApps,
  useTemplate,
  useDeployApp,
  useDeleteApp,
  useDeployNodeApp,
  useDeleteNodeApp,
} from '@/hooks/use-apps';
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
import { AppUsersSection } from '@/components/app-users-section';
import { AppTrafficSection } from '@/components/app-traffic-section';
import { useTranslation } from '@/lib/i18n';

function mapStatus(status?: string): 'running' | 'stopped' | 'deploying' | 'error' {
  switch (status) {
    case 'running': return 'running';
    case 'stopped': return 'stopped';
    case 'deploying': return 'deploying';
    case 'error': return 'error';
    default: return 'stopped';
  }
}

function countryFlag(code?: string): string {
  if (!code) return '';
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

function formatRowMetrics(app: AppResponse): string {
  const parts: string[] = [];
  const settings = (app.settings ?? {}) as Record<string, unknown>;
  const port = settings.port ?? settings.PORT ?? settings.listen_port ?? settings.server_port;
  if (port !== undefined && port !== null && port !== '') parts.push(`Port ${String(port)}`);
  if (app.container_id) parts.push(app.container_id.slice(0, 8));
  return parts.length > 0 ? parts.join(' · ') : 'Deployed';
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

interface Instance {
  nodeId: string;              // 'local' or remote node UUID (from hub's perspective)
  nodeRef: 'local' | string;   // 'local' = active node, else hub's remote node UUID
  nodeName: string;
  country?: string;
  connected: boolean;
  app: AppResponse | null;
}

export default function AppDetailScreen() {
  const { t } = useTranslation();
  const { template: templateName } = useLocalSearchParams<{ template: string }>();
  const activeNodeId = useNodeStore((s) => s.activeNodeId) ?? '';
  const hubNode = useNodeStore((s) => s.hubNode);
  const hubNodeId = hubNode?.id ?? '';

  // Apps on the active (usually hub) node
  const appsQuery = useApps(activeNodeId);
  const localApps = appsQuery.data ?? [];
  const localApp = useMemo(
    () => (templateName ? localApps.find((a) => a.template === templateName) ?? null : null),
    [localApps, templateName],
  );

  // Template details (from active node's templates endpoint)
  const templateQuery = useTemplate(activeNodeId, templateName ?? '');
  const { data: templateDetail } = templateQuery;

  // Remote nodes via hub
  const { data: remoteNodes } = useHubNodes();
  const connectedRemotes = useMemo(
    () => (remoteNodes ?? []).filter((n) => n.status === 'connected'),
    [remoteNodes],
  );
  const hasRemoteNodes = (remoteNodes ?? []).length > 0;

  // Fetch apps from each remote node to match against template
  const remoteAppQueries = useQueries({
    queries: connectedRemotes.map((node) => ({
      queryKey: ['hub-nodes', hubNodeId, node.id, 'apps'] as const,
      queryFn: () => getNodeApi(hubNodeId).getNodeApps(node.id),
      staleTime: 30_000,
      enabled: !!hubNodeId && !!templateName,
    })),
  });

  // Build instances list (active/local + all remotes)
  const instances = useMemo<Instance[]>(() => {
    if (!templateName) return [];
    const list: Instance[] = [];

    list.push({
      nodeId: 'local',
      nodeRef: 'local',
      nodeName: hubNode?.name ?? 'Local',
      connected: true,
      app: localApp,
    });

    (remoteNodes ?? []).forEach((node) => {
      const idx = connectedRemotes.findIndex((n) => n.id === node.id);
      const remoteApps = idx >= 0 ? (remoteAppQueries[idx]?.data ?? []) : [];
      const matchingApp = remoteApps.find((a: AppResponse) => a.template === templateName) ?? null;
      list.push({
        nodeId: node.id,
        nodeRef: node.id,
        nodeName: node.name || node.address,
        country: node.country,
        connected: node.status === 'connected',
        app: matchingApp,
      });
    });

    return list;
  }, [templateName, localApp, hubNode, remoteNodes, connectedRemotes, remoteAppQueries]);

  // Selection: default to local if deployed, else first deployed, else local
  const defaultSelected = useMemo(() => {
    if (instances.length === 0) return 'local';
    const localDeployed = instances.find((i) => i.nodeId === 'local' && i.app);
    if (localDeployed) return localDeployed.nodeId;
    const anyDeployed = instances.find((i) => i.app);
    if (anyDeployed) return anyDeployed.nodeId;
    return instances[0]?.nodeId ?? 'local';
  }, [instances]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const effectiveSelected = selectedNodeId ?? defaultSelected;
  const selected = instances.find((i) => i.nodeId === effectiveSelected) ?? instances[0] ?? null;

  // Mutations
  const deployLocal = useDeployApp(activeNodeId);
  const deleteLocal = useDeleteApp(activeNodeId);
  const deployRemote = useDeployNodeApp(hubNodeId);
  const deleteRemote = useDeleteNodeApp(hubNodeId);

  const startContainer = useStartContainer(activeNodeId);
  const stopContainer = useStopContainer(activeNodeId);
  const restartContainer = useRestartContainer(activeNodeId);

  const [pendingNodeId, setPendingNodeId] = useState<string | null>(null);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        appsQuery.refetch(),
        templateQuery.refetch(),
        ...remoteAppQueries.map((q) => q.refetch()),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [appsQuery, templateQuery, remoteAppQueries]);

  const handleToggleInstance = useCallback(
    async (instance: Instance, nextValue: boolean) => {
      if (!templateName) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      if (nextValue) {
        // Deploy: seed from any existing instance's settings, else go to wizard
        const seed = (instances.find((i) => i.app)?.app?.settings ?? {}) as Record<string, unknown>;
        const hasSeed = instances.some((i) => i.app);
        if (!hasSeed) {
          router.push('/apps/deploy');
          return;
        }
        setPendingNodeId(instance.nodeId);
        try {
          if (instance.nodeRef === 'local') {
            await deployLocal.mutateAsync({ template: templateName, settings: seed });
          } else {
            await deployRemote.mutateAsync({
              nodeId: instance.nodeRef,
              template: templateName,
              settings: seed,
            });
          }
        } catch (err) {
          Alert.alert(t('marketplace.deploy_failed'), (err as Error).message);
        } finally {
          setPendingNodeId(null);
        }
      } else {
        // Undeploy: confirm
        if (!instance.app) return;
        Alert.alert(
          t('app.undeploy_title'),
          t('app.undeploy_node_desc', {
            node: instance.nodeName,
            template: templateName,
          }),
          [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('app.undeploy'),
              style: 'destructive',
              onPress: async () => {
                setPendingNodeId(instance.nodeId);
                try {
                  if (instance.nodeRef === 'local') {
                    await deleteLocal.mutateAsync(instance.app!.id);
                  } else {
                    await deleteRemote.mutateAsync({
                      nodeId: instance.nodeRef,
                      appId: instance.app!.id,
                    });
                  }
                } catch (err) {
                  Alert.alert(t('app.undeploy_failed'), (err as Error).message);
                } finally {
                  setPendingNodeId(null);
                }
              },
            },
          ],
        );
      }
    },
    [templateName, instances, deployLocal, deleteLocal, deployRemote, deleteRemote, t],
  );

  const selectedApp = selected?.app ?? null;
  const containerId = selectedApp?.container_id;
  const isRunning = selectedApp?.status === 'running';
  const deployedDate = selectedApp?.deployed_at
    ? new Date(selectedApp.deployed_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : undefined;

  const isLoading = !templateName || (appsQuery.isLoading && !appsQuery.data);

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
        <Text className="text-white text-lg font-semibold flex-1 capitalize" numberOfLines={1}>
          {templateName ?? t('nav.apps')}
        </Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#30d158" />
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-4"
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#666" />
          }
        >
          {/* Instance switcher */}
          <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
            {t('app.instances')}
          </Text>
          <View className="gap-1.5 mb-4">
            {instances.map((instance) => {
              const isSelected = instance.nodeId === effectiveSelected;
              const isDeployed = !!instance.app;
              const instanceRunning = instance.app?.status === 'running';
              const isPending = pendingNodeId === instance.nodeId;
              return (
                <Pressable
                  key={instance.nodeId}
                  onPress={() => setSelectedNodeId(instance.nodeId)}
                  className={`flex-row items-center gap-3 rounded-xl px-4 py-3 border ${
                    isSelected ? 'bg-green-900/10 border-green-500/30' : 'bg-gray-900 border-transparent'
                  } ${!isDeployed ? 'opacity-70' : ''} ${!instance.connected ? 'opacity-50' : ''}`}
                >
                  <Text className="text-base w-6 text-center">
                    {countryFlag(instance.country) || '•'}
                  </Text>
                  <View className="flex-1 min-w-0">
                    <Text className="text-white text-sm font-medium" numberOfLines={1}>
                      {instance.nodeName}
                    </Text>
                    <Text className="text-[11px] text-gray-500" numberOfLines={1}>
                      {!instance.connected
                        ? t('node.disconnected')
                        : isDeployed
                        ? formatRowMetrics(instance.app!)
                        : t('app.not_deployed')}
                    </Text>
                  </View>
                  {isDeployed && (
                    <StatusDot
                      status={instanceRunning ? 'running' : mapStatus(instance.app!.status)}
                      size={8}
                    />
                  )}
                  <View className="items-center justify-center min-w-[51px]">
                    {isPending ? (
                      <ActivityIndicator size="small" color="#30d158" />
                    ) : (
                      <RNSwitch
                        value={isDeployed}
                        onValueChange={(v) => handleToggleInstance(instance, v)}
                        trackColor={{ false: '#333', true: '#30d158' }}
                        thumbColor="#fff"
                        disabled={!instance.connected}
                      />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Selected instance content */}
          {!selected ? null : !selectedApp ? (
            <View className="bg-gray-900 rounded-xl p-8 items-center">
              <Ionicons name="cube-outline" size={32} color="#666" />
              <Text className="text-white text-base font-medium mt-3 text-center">
                {t('app.not_deployed_on_node', { node: selected.nodeName })}
              </Text>
              <Text className="text-gray-500 text-sm mt-1 text-center">
                {selected.connected
                  ? t('app.not_deployed_desc')
                  : t('app.node_offline_desc', { node: selected.nodeName })}
              </Text>
            </View>
          ) : (
            <>
              {/* Status card */}
              <View className="bg-gray-900 rounded-xl p-4 mb-4">
                <View className="flex-row items-center gap-2 mb-3">
                  <StatusDot status={mapStatus(selectedApp.status)} />
                  <Text className="text-white font-semibold text-base capitalize">
                    {selectedApp.status}
                  </Text>
                </View>
                <InfoRow label={t('app.overview')} value={selectedApp.template} />
                <InfoRow label={t('app.deployed_at')} value={deployedDate} />
                <InfoRow label={t('app.container')} value={containerId?.slice(0, 12)} />
              </View>

              {/* Settings */}
              {Object.keys(selectedApp.settings ?? {}).length > 0 ? (
                <>
                  <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
                    {t('app.settings')}
                  </Text>
                  <View className="bg-gray-900 rounded-xl p-4 mb-4">
                    {Object.entries(selectedApp.settings).map(([key, value]) => (
                      <InfoRow key={key} label={key} value={String(value)} />
                    ))}
                  </View>
                </>
              ) : null}

              {/* Users / Traffic / Client Config — only for local instance */}
              {selected.nodeRef === 'local' ? (
                <>
                  {templateDetail?.users?.supported && (
                    <>
                      <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
                        {t('app.users')}
                      </Text>
                      <AppUsersSection
                        nodeId={activeNodeId}
                        appId={selectedApp.id}
                        templateDetail={templateDetail}
                      />
                    </>
                  )}

                  {templateDetail?.metrics?.supported && (
                    <>
                      <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
                        {t('app.traffic')}
                      </Text>
                      <AppTrafficSection nodeId={activeNodeId} appId={selectedApp.id} />
                    </>
                  )}

                  <View testID="client-config" className="mb-4">
                    <ClientConfig
                      nodeId={activeNodeId}
                      appId={selectedApp.id}
                      templateName={selectedApp.template}
                    />
                  </View>
                </>
              ) : (
                <View className="bg-gray-900 rounded-xl p-4 mb-4">
                  <Text className="text-gray-500 text-xs">
                    {t('app.remote_limited_desc')}
                  </Text>
                </View>
              )}

              {/* Logs */}
              {containerId ? (
                <>
                  <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
                    {t('container.logs')}
                  </Text>
                  <View className="gap-2 mb-4">
                    <ActionButton
                      testID="btn-app-logs"
                      icon="document-text"
                      label={t('container.view_logs')}
                      color="#0a84ff"
                      onPress={() => {
                        router.push({
                          pathname: '/containers/[id]/logs',
                          params:
                            selected.nodeRef === 'local'
                              ? { id: containerId, name: selectedApp.template }
                              : {
                                  id: containerId,
                                  name: `${selected.nodeName} / ${selectedApp.template}`,
                                  remoteNodeId: selected.nodeRef,
                                },
                        });
                      }}
                    />
                  </View>
                </>
              ) : null}

              {/* Actions (only for local selected — start/stop/restart use active-node hooks) */}
              {selected.nodeRef === 'local' && containerId ? (
                <>
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
                        restartContainer.mutate(containerId);
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
                          stopContainer.mutate(containerId);
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
                          startContainer.mutate(containerId);
                        }}
                      />
                    )}
                  </View>
                </>
              ) : null}
            </>
          )}
        </ScrollView>
      )}

      {/* Node badge footer */}
      {!hasRemoteNodes && instances.length <= 1 && !isLoading && instances[0]?.app == null && (
        <View className="absolute bottom-8 left-0 right-0 items-center">
          <Text className="text-gray-600 text-xs">{t('common.no_data')}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}
