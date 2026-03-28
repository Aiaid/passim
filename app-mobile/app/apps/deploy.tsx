import { useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { TemplateSummary, SettingInfo } from '@passim/shared/types';
import {
  useTemplates,
  useTemplate,
  useDeployApp,
  useDeployNodeApp,
} from '@/hooks/use-apps';
import { useNodeStore, type NodeInfo } from '@/stores/node-store';
import { useMultiNodeSSE } from '@/hooks/use-sse';
import { localized } from '@/lib/utils';
import { StatusDot } from '@/components/StatusDot';
import { useTranslation } from '@/lib/i18n';

const CATEGORY_COLORS: Record<string, string> = {
  vpn: '#30d158',
  media: '#5e5ce6',
  storage: '#0a84ff',
  network: '#ff9f0a',
  remote: '#bf5af2',
};

// --- Reusable sub-components ---

function TemplateCard({
  template,
  selected,
  onPress,
}: {
  template: TemplateSummary;
  selected: boolean;
  onPress: () => void;
}) {
  const borderColor = selected ? '#30d158' : 'transparent';
  const categoryColor = CATEGORY_COLORS[template.category] ?? '#666';
  const letter = template.name.charAt(0).toUpperCase();

  return (
    <Pressable
      testID={`template-${template.name}`}
      className="bg-gray-900 rounded-xl p-4 flex-row items-center gap-3 active:opacity-70"
      style={{ borderWidth: 2, borderColor }}
      onPress={onPress}
    >
      <View
        style={{ borderColor: categoryColor, borderWidth: 2 }}
        className="w-11 h-11 rounded-full items-center justify-center"
      >
        <Text className="text-white font-bold text-lg">{letter}</Text>
      </View>
      <View className="flex-1">
        <Text className="text-white font-semibold text-base">
          {template.name.charAt(0).toUpperCase() + template.name.slice(1)}
        </Text>
        <Text className="text-gray-400 text-sm mt-0.5" numberOfLines={2}>
          {localized(template.description, 'en-US')}
        </Text>
      </View>
      {selected ? (
        <Ionicons name="checkmark-circle" size={22} color="#30d158" />
      ) : null}
    </Pressable>
  );
}

function SettingField({
  setting,
  value,
  onChange,
}: {
  setting: SettingInfo;
  value: unknown;
  onChange: (val: unknown) => void;
}) {
  const label = localized(setting.label, 'en-US');

  if (setting.type === 'boolean') {
    return (
      <View className="flex-row items-center justify-between py-3">
        <Text className="text-white text-sm flex-1">{label}</Text>
        <Switch
          value={!!value}
          onValueChange={(val) => onChange(val)}
          trackColor={{ false: '#333', true: '#30d158' }}
          thumbColor="#fff"
        />
      </View>
    );
  }

  if (setting.type === 'select' && setting.options?.length) {
    return (
      <View className="py-3">
        <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
          {label}
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {setting.options.map((opt) => {
            const isSelected = value === opt.value;
            return (
              <Pressable
                key={String(opt.value)}
                className={`px-4 py-2 rounded-lg ${isSelected ? 'bg-primary' : 'bg-gray-800'}`}
                onPress={() => onChange(opt.value)}
              >
                <Text className={`text-sm font-medium ${isSelected ? 'text-black' : 'text-white'}`}>
                  {localized(opt.label, 'en-US')}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  if (setting.type === 'number') {
    return (
      <View className="py-3">
        <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
          {label}
        </Text>
        <TextInput
          className="bg-gray-800 rounded-xl px-4 py-3 text-white text-base"
          value={value != null ? String(value) : ''}
          onChangeText={(text) => {
            const num = Number(text);
            onChange(isNaN(num) ? text : num);
          }}
          keyboardType="numeric"
          placeholderTextColor="#555"
          placeholder={setting.default != null ? String(setting.default) : undefined}
        />
        {(setting.min != null || setting.max != null) ? (
          <Text className="text-gray-500 text-xs mt-1">
            {setting.min != null ? `Min: ${setting.min}` : ''}
            {setting.min != null && setting.max != null ? ' / ' : ''}
            {setting.max != null ? `Max: ${setting.max}` : ''}
          </Text>
        ) : null}
      </View>
    );
  }

  // Default: string input
  return (
    <View className="py-3">
      <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
        {label}
      </Text>
      <TextInput
        className="bg-gray-800 rounded-xl px-4 py-3 text-white text-base"
        value={value != null ? String(value) : ''}
        onChangeText={(text) => onChange(text)}
        placeholderTextColor="#555"
        placeholder={setting.default != null ? String(setting.default) : undefined}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

// --- Target selection card ---

function TargetNodeCard({
  node,
  isConnected,
  selected,
  onToggle,
  isLocal,
  t,
}: {
  node: NodeInfo;
  isConnected: boolean;
  selected: boolean;
  onToggle: () => void;
  isLocal: boolean;
  t: (key: string, params?: Record<string, string>) => string;
}) {
  return (
    <Pressable
      testID={`target-${node.id}`}
      className="bg-gray-900 rounded-xl p-4 flex-row items-center gap-3 active:opacity-70"
      style={{
        borderWidth: 2,
        borderColor: selected ? '#30d158' : 'transparent',
        opacity: isConnected ? 1 : 0.5,
      }}
      onPress={isConnected ? onToggle : undefined}
    >
      <View
        className={`w-6 h-6 rounded-md items-center justify-center ${selected ? 'bg-primary' : 'bg-gray-800 border border-gray-600'}`}
      >
        {selected ? (
          <Ionicons name="checkmark" size={16} color="#000" />
        ) : null}
      </View>
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-white font-semibold text-base" numberOfLines={1}>
            {isLocal ? t('mobile.local_server') : node.name}
          </Text>
          {isLocal ? (
            <View className="bg-primary/20 px-2 py-0.5 rounded">
              <Text className="text-primary text-[10px] font-semibold">LOCAL</Text>
            </View>
          ) : null}
        </View>
        <Text className="text-gray-400 text-xs mt-0.5" numberOfLines={1}>
          {node.host}
        </Text>
      </View>
      {isConnected ? (
        <StatusDot status="connected" />
      ) : (
        <Text className="text-gray-500 text-xs">{t('mobile.node_offline')}</Text>
      )}
    </Pressable>
  );
}

// --- Per-node deploy status for batch progress ---

type NodeDeployStatus = 'pending' | 'deploying' | 'success' | 'failed';

interface NodeDeployState {
  nodeId: string;
  nodeName: string;
  isLocal: boolean;
  status: NodeDeployStatus;
  error?: string;
}

function DeployProgressRow({ state, t }: { state: NodeDeployState; t: (key: string) => string }) {
  const statusColors: Record<NodeDeployStatus, string> = {
    pending: '#666',
    deploying: '#5e5ce6',
    success: '#30d158',
    failed: '#ff453a',
  };

  const statusLabels: Record<NodeDeployStatus, string> = {
    pending: t('mobile.deploy_pending'),
    deploying: t('mobile.deploy_in_progress'),
    success: t('mobile.deploy_succeeded'),
    failed: t('mobile.deploy_node_failed'),
  };

  return (
    <View className="bg-gray-900 rounded-xl p-4 flex-row items-center gap-3">
      {/* Status icon */}
      <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: `${statusColors[state.status]}20` }}>
        {state.status === 'pending' && (
          <Ionicons name="time-outline" size={18} color={statusColors.pending} />
        )}
        {state.status === 'deploying' && (
          <ActivityIndicator size="small" color={statusColors.deploying} />
        )}
        {state.status === 'success' && (
          <Ionicons name="checkmark" size={18} color={statusColors.success} />
        )}
        {state.status === 'failed' && (
          <Ionicons name="close" size={18} color={statusColors.failed} />
        )}
      </View>

      {/* Node info */}
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-white font-semibold text-sm" numberOfLines={1}>
            {state.nodeName}
          </Text>
          {state.isLocal ? (
            <View className="bg-primary/20 px-1.5 py-0.5 rounded">
              <Text className="text-primary text-[10px] font-semibold">LOCAL</Text>
            </View>
          ) : null}
        </View>
        {state.error ? (
          <Text className="text-red-400 text-xs mt-0.5" numberOfLines={2}>
            {state.error}
          </Text>
        ) : null}
      </View>

      {/* Status label */}
      <Text className="text-xs font-medium" style={{ color: statusColors[state.status] }}>
        {statusLabels[state.status]}
      </Text>
    </View>
  );
}

// --- Main screen ---

export default function DeployScreen() {
  const { t } = useTranslation();
  const [step, setStep] = useState<1 | 2 | 3 | 'progress'>(1);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedTargets, setSelectedTargets] = useState<Set<string>>(new Set());

  const activeNodeId = useNodeStore((s) => s.activeNodeId) ?? '';
  const allNodes = useNodeStore((s) => s.nodes);
  const hubNode = useNodeStore((s) => s.hubNode);

  const { data: templates, isLoading: templatesLoading } = useTemplates(activeNodeId);
  const { data: templateDetail, isLoading: detailLoading } = useTemplate(activeNodeId, selectedTemplate);
  const deployApp = useDeployApp(activeNodeId);
  const { getNodeSSE } = useMultiNodeSSE();

  // Hub node is the first node, used for remote deploys
  const hubNodeId = hubNode?.id ?? '';
  const deployNodeApp = useDeployNodeApp(hubNodeId);

  // Determine if we have remote nodes (beyond the single local node)
  const hasRemoteNodes = allNodes.length > 1;

  // Track batch deployment state
  const [deployStates, setDeployStates] = useState<NodeDeployState[]>([]);
  const deployStatesRef = useRef<NodeDeployState[]>([]);

  // Total steps: 2 if single node, 3 if we have remote nodes
  const totalSteps = hasRemoteNodes ? 3 : 2;

  // Initialize settings from template defaults when moving to step 2
  const initSettings = useCallback(
    (detail: { settings: SettingInfo[] }) => {
      const defaults: Record<string, unknown> = {};
      for (const s of detail.settings) {
        if (s.default != null) {
          defaults[s.key] = s.default;
        }
      }
      setSettings(defaults);
    },
    [],
  );

  const basicSettings = useMemo(
    () => templateDetail?.settings.filter((s: SettingInfo) => !s.advanced) ?? [],
    [templateDetail],
  );

  const advancedSettings = useMemo(
    () => templateDetail?.settings.filter((s: SettingInfo) => s.advanced) ?? [],
    [templateDetail],
  );

  const handleSelectTemplate = (name: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedTemplate(name);
  };

  const handleNext = () => {
    if (!selectedTemplate) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (step === 1) {
      setStep(2);
      // Wait for template detail to load, then init settings
      if (templateDetail) {
        initSettings(templateDetail);
      }
    } else if (step === 2) {
      if (hasRemoteNodes) {
        // Initialize target selection: default to active/local node selected
        setSelectedTargets(new Set([activeNodeId]));
        setStep(3);
      } else {
        // No remote nodes, deploy directly to local
        handleSingleDeploy();
      }
    }
  };

  // Re-init settings when templateDetail loads
  if (step === 2 && templateDetail && Object.keys(settings).length === 0) {
    initSettings(templateDetail);
  }

  const toggleTarget = (nodeId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedTargets((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const toggleAllTargets = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const connectedIds = allNodes
      .filter((n) => getNodeSSE(n.id).isConnected)
      .map((n) => n.id);
    if (selectedTargets.size === connectedIds.length) {
      setSelectedTargets(new Set());
    } else {
      setSelectedTargets(new Set(connectedIds));
    }
  };

  // Single node deploy (original behavior)
  const handleSingleDeploy = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    deployApp.mutate(
      { template: selectedTemplate, settings },
      {
        onSuccess: (data: unknown) => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          const appId = (data as { id: string })?.id;
          if (appId) {
            router.replace(`/apps/${appId}`);
          } else {
            router.back();
          }
        },
        onError: (error: Error) => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          Alert.alert(t('marketplace.deploy_failed'), error.message || t('mobile.deploy_failed_msg'));
        },
      },
    );
  };

  // Batch deploy to multiple targets
  const handleBatchDeploy = async () => {
    const targets = Array.from(selectedTargets);
    if (targets.length === 0) return;

    // If only one target selected and it's the active node, use the simple deploy flow
    if (targets.length === 1 && targets[0] === activeNodeId) {
      handleSingleDeploy();
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setStep('progress');

    // Build initial deploy states
    const initialStates: NodeDeployState[] = targets.map((nodeId) => {
      const node = allNodes.find((n) => n.id === nodeId);
      return {
        nodeId,
        nodeName: node?.name ?? nodeId,
        isLocal: nodeId === activeNodeId,
        status: 'pending',
      };
    });
    setDeployStates(initialStates);
    deployStatesRef.current = initialStates;

    // Deploy to each target in parallel
    const promises = targets.map(async (nodeId) => {
      // Update status to deploying
      updateDeployState(nodeId, 'deploying');

      try {
        if (nodeId === activeNodeId) {
          // Deploy locally using direct API
          await deployApp.mutateAsync({ template: selectedTemplate, settings });
        } else {
          // Deploy to remote node via Hub
          const node = allNodes.find((n) => n.id === nodeId);
          const hubRemoteId = node?.hubRemoteId;
          if (!hubRemoteId) {
            throw new Error('Node not registered with Hub');
          }
          await deployNodeApp.mutateAsync({
            nodeId: hubRemoteId,
            template: selectedTemplate,
            settings,
          });
        }
        updateDeployState(nodeId, 'success');
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        updateDeployState(nodeId, 'failed', errMsg);
      }
    });

    await Promise.allSettled(promises);

    // Final haptic
    const finalStates = deployStatesRef.current;
    const hasFailed = finalStates.some((s) => s.status === 'failed');
    if (hasFailed) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const updateDeployState = (nodeId: string, status: NodeDeployStatus, error?: string) => {
    const updated = deployStatesRef.current.map((s) =>
      s.nodeId === nodeId ? { ...s, status, error } : s,
    );
    deployStatesRef.current = updated;
    setDeployStates([...updated]);
  };

  const handleRetryFailed = async () => {
    const failedStates = deployStatesRef.current.filter((s) => s.status === 'failed');
    if (failedStates.length === 0) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    const promises = failedStates.map(async (state) => {
      updateDeployState(state.nodeId, 'deploying');

      try {
        if (state.nodeId === activeNodeId) {
          await deployApp.mutateAsync({ template: selectedTemplate, settings });
        } else {
          const node = allNodes.find((n) => n.id === state.nodeId);
          const hubRemoteId = node?.hubRemoteId;
          if (!hubRemoteId) {
            throw new Error('Node not registered with Hub');
          }
          await deployNodeApp.mutateAsync({
            nodeId: hubRemoteId,
            template: selectedTemplate,
            settings,
          });
        }
        updateDeployState(state.nodeId, 'success');
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        updateDeployState(state.nodeId, 'failed', errMsg);
      }
    });

    await Promise.allSettled(promises);

    const finalStates = deployStatesRef.current;
    const hasFailed = finalStates.some((s) => s.status === 'failed');
    if (hasFailed) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const updateSetting = (key: string, value: unknown) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  // Computed progress values
  const doneCount = deployStates.filter((s) => s.status === 'success' || s.status === 'failed').length;
  const failedCount = deployStates.filter((s) => s.status === 'failed').length;
  const allDone = doneCount === deployStates.length && deployStates.length > 0;
  const isDeployingBatch = deployStates.some((s) => s.status === 'deploying' || s.status === 'pending');

  const getStepTitle = () => {
    switch (step) {
      case 1: return t('mobile.choose_template');
      case 2: return t('mobile.configure');
      case 3: return t('mobile.select_targets');
      case 'progress': return t('mobile.deploy_progress');
    }
  };

  const handleBack = () => {
    if (step === 'progress') {
      if (allDone) {
        router.back();
      }
      // Don't allow going back during deployment
      return;
    }
    if (step === 3) {
      setStep(2);
    } else if (step === 2) {
      setStep(1);
      setSettings({});
      setShowAdvanced(false);
    } else {
      router.back();
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-black">
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 gap-3">
        <Pressable
          testID="btn-deploy-back"
          onPress={handleBack}
          className="w-10 h-10 items-center justify-center rounded-full bg-gray-900 active:opacity-70"
        >
          <Ionicons
            name={step === 'progress' && !allDone ? 'close' : 'chevron-back'}
            size={20}
            color="#fff"
          />
        </Pressable>
        <Text className="text-white text-lg font-semibold flex-1">
          {getStepTitle()}
        </Text>
        {/* Step indicator */}
        {step !== 'progress' ? (
          <View className="flex-row gap-1.5">
            {Array.from({ length: totalSteps }, (_, i) => (
              <View
                key={i}
                className={`w-2 h-2 rounded-full ${
                  step === i + 1 ? 'bg-primary' : 'bg-gray-700'
                }`}
              />
            ))}
          </View>
        ) : null}
      </View>

      {/* Step 1: Template Selection */}
      {step === 1 ? (
        <>
          <ScrollView testID="template-list" className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 100 }}>
            {templatesLoading ? (
              <ActivityIndicator size="large" color="#30d158" className="mt-12" />
            ) : templates?.length ? (
              <View className="gap-3 mt-2">
                {templates.map((tmpl: TemplateSummary) => (
                  <TemplateCard
                    key={tmpl.name}
                    template={tmpl}
                    selected={selectedTemplate === tmpl.name}
                    onPress={() => handleSelectTemplate(tmpl.name)}
                  />
                ))}
              </View>
            ) : (
              <View className="items-center mt-12">
                <Text className="text-gray-500">{t('mobile.no_templates')}</Text>
              </View>
            )}
          </ScrollView>

          {/* Next Button */}
          {selectedTemplate ? (
            <View className="px-4 pb-6 pt-3 bg-black border-t border-gray-900">
              <Pressable
                className="bg-primary rounded-xl py-4 items-center active:opacity-70"
                onPress={handleNext}
              >
                <Text className="text-black font-semibold text-base">{t('mobile.next')}</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      ) : null}

      {/* Step 2: Configuration */}
      {step === 2 ? (
        <>
          <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 100 }}>
            {detailLoading ? (
              <ActivityIndicator size="large" color="#30d158" className="mt-12" />
            ) : (
              <>
                {/* Basic Settings */}
                {basicSettings.length > 0 ? (
                  <View className="bg-gray-900 rounded-xl p-4 mt-2">
                    {basicSettings.map((s: SettingInfo) => (
                      <SettingField
                        key={s.key}
                        setting={s}
                        value={settings[s.key]}
                        onChange={(val) => updateSetting(s.key, val)}
                      />
                    ))}
                  </View>
                ) : (
                  <View className="bg-gray-900 rounded-xl p-6 mt-2 items-center">
                    <Text className="text-gray-400 text-sm">
                      {t('mobile.no_config_needed')}
                    </Text>
                  </View>
                )}

                {/* Advanced Settings Toggle */}
                {advancedSettings.length > 0 ? (
                  <>
                    <Pressable
                      className="flex-row items-center justify-center gap-2 py-4 active:opacity-70"
                      onPress={() => setShowAdvanced(!showAdvanced)}
                    >
                      <Ionicons
                        name={showAdvanced ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color="#666"
                      />
                      <Text className="text-gray-400 text-sm">
                        {showAdvanced ? t('mobile.hide_advanced') : t('mobile.show_advanced')}
                      </Text>
                    </Pressable>

                    {showAdvanced ? (
                      <View className="bg-gray-900 rounded-xl p-4">
                        {advancedSettings.map((s: SettingInfo) => (
                          <SettingField
                            key={s.key}
                            setting={s}
                            value={settings[s.key]}
                            onChange={(val) => updateSetting(s.key, val)}
                          />
                        ))}
                      </View>
                    ) : null}
                  </>
                ) : null}

                {/* Error */}
                {deployApp.isError ? (
                  <View className="bg-red-500/10 rounded-xl px-4 py-3 mt-4">
                    <Text className="text-red-400 text-sm">
                      {deployApp.error?.message || t('marketplace.deploy_failed')}
                    </Text>
                  </View>
                ) : null}
              </>
            )}
          </ScrollView>

          {/* Next / Deploy Button */}
          <View className="px-4 pb-6 pt-3 bg-black border-t border-gray-900">
            {hasRemoteNodes ? (
              // Has remote nodes: go to target selection
              <Pressable
                className="bg-primary rounded-xl py-4 items-center active:opacity-70"
                onPress={handleNext}
              >
                <Text className="text-black font-semibold text-base">{t('mobile.next')}</Text>
              </Pressable>
            ) : (
              // No remote nodes: deploy directly (original behavior)
              <Pressable
                testID="btn-deploy-confirm"
                className={`rounded-xl py-4 items-center ${deployApp.isPending ? 'bg-gray-800' : 'bg-primary active:opacity-70'}`}
                onPress={handleSingleDeploy}
                disabled={deployApp.isPending}
              >
                {deployApp.isPending ? (
                  <View className="flex-row items-center gap-2">
                    <ActivityIndicator size="small" color="#30d158" />
                    <Text className="text-gray-300 font-semibold text-base">{t('mobile.deploying')}</Text>
                  </View>
                ) : (
                  <Text className="text-black font-semibold text-base">{t('mobile.deploy')}</Text>
                )}
              </Pressable>
            )}
          </View>
        </>
      ) : null}

      {/* Step 3: Target Selection */}
      {step === 3 ? (
        <>
          <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 100 }}>
            {/* Select All / Deselect All */}
            <Pressable
              className="flex-row items-center justify-end py-2 active:opacity-70"
              onPress={toggleAllTargets}
            >
              <Text className="text-primary text-sm font-medium">
                {selectedTargets.size === allNodes.filter((n) => getNodeSSE(n.id).isConnected).length
                  ? t('mobile.deselect_all')
                  : t('mobile.select_all')}
              </Text>
            </Pressable>

            {/* Node list */}
            <View className="gap-3">
              {allNodes.map((node, index) => {
                const sse = getNodeSSE(node.id);
                const isConnected = sse.isConnected;
                const isLocal = index === 0 || node.id === activeNodeId;

                return (
                  <TargetNodeCard
                    key={node.id}
                    node={node}
                    isConnected={isConnected}
                    selected={selectedTargets.has(node.id)}
                    onToggle={() => toggleTarget(node.id)}
                    isLocal={isLocal && index === 0}
                    t={t}
                  />
                );
              })}
            </View>

            {/* Info text */}
            {selectedTargets.size > 1 ? (
              <View className="bg-blue-500/10 rounded-xl px-4 py-3 mt-4 flex-row items-center gap-2">
                <Ionicons name="information-circle" size={18} color="#0a84ff" />
                <Text className="text-blue-400 text-sm flex-1">
                  {t('mobile.deploy_to_nodes')}
                </Text>
              </View>
            ) : null}
          </ScrollView>

          {/* Deploy Button */}
          <View className="px-4 pb-6 pt-3 bg-black border-t border-gray-900">
            <Pressable
              testID="btn-deploy-confirm"
              className={`rounded-xl py-4 items-center ${selectedTargets.size === 0 ? 'bg-gray-800' : 'bg-primary active:opacity-70'}`}
              onPress={handleBatchDeploy}
              disabled={selectedTargets.size === 0}
            >
              <Text className={`font-semibold text-base ${selectedTargets.size === 0 ? 'text-gray-500' : 'text-black'}`}>
                {selectedTargets.size > 1
                  ? `${t('mobile.deploy')} (${selectedTargets.size})`
                  : t('mobile.deploy')}
              </Text>
            </Pressable>
            {selectedTargets.size === 0 ? (
              <Text className="text-gray-500 text-xs text-center mt-2">
                {t('mobile.no_targets_selected')}
              </Text>
            ) : null}
          </View>
        </>
      ) : null}

      {/* Deploy Progress */}
      {step === 'progress' ? (
        <>
          <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 100 }}>
            {/* Overall progress */}
            <View className="bg-gray-900 rounded-xl p-4 mt-2 mb-4">
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wider">
                  {t('mobile.overall_progress', {
                    done: String(doneCount),
                    total: String(deployStates.length),
                  })}
                </Text>
                {isDeployingBatch ? (
                  <ActivityIndicator size="small" color="#5e5ce6" />
                ) : null}
              </View>
              {/* Progress bar */}
              <View className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <View
                  style={{
                    width: `${deployStates.length > 0 ? (doneCount / deployStates.length) * 100 : 0}%`,
                    backgroundColor: failedCount > 0 ? '#ff9f0a' : '#30d158',
                  }}
                  className="h-full rounded-full"
                />
              </View>
            </View>

            {/* Per-node status */}
            <View className="gap-3">
              {deployStates.map((state) => (
                <DeployProgressRow key={state.nodeId} state={state} t={t} />
              ))}
            </View>

            {/* Result summary */}
            {allDone ? (
              <View className={`rounded-xl px-4 py-3 mt-4 ${failedCount > 0 ? 'bg-red-500/10' : 'bg-green-500/10'}`}>
                <Text className={`text-sm font-medium ${failedCount > 0 ? 'text-red-400' : 'text-green-400'}`}>
                  {failedCount > 0
                    ? t('mobile.some_failed', {
                        failed: String(failedCount),
                        total: String(deployStates.length),
                      })
                    : t('mobile.all_succeeded')}
                </Text>
              </View>
            ) : null}
          </ScrollView>

          {/* Bottom actions */}
          <View className="px-4 pb-6 pt-3 bg-black border-t border-gray-900">
            {allDone && failedCount > 0 ? (
              <View className="gap-3">
                <Pressable
                  className="bg-red-500/20 rounded-xl py-4 items-center active:opacity-70"
                  onPress={handleRetryFailed}
                >
                  <Text className="text-red-400 font-semibold text-base">{t('mobile.retry_failed')}</Text>
                </Pressable>
                <Pressable
                  className="bg-primary rounded-xl py-4 items-center active:opacity-70"
                  onPress={() => router.back()}
                >
                  <Text className="text-black font-semibold text-base">{t('mobile.done')}</Text>
                </Pressable>
              </View>
            ) : allDone ? (
              <Pressable
                className="bg-primary rounded-xl py-4 items-center active:opacity-70"
                onPress={() => router.back()}
              >
                <Text className="text-black font-semibold text-base">{t('mobile.view_apps')}</Text>
              </Pressable>
            ) : (
              <View className="rounded-xl py-4 items-center bg-gray-800">
                <View className="flex-row items-center gap-2">
                  <ActivityIndicator size="small" color="#5e5ce6" />
                  <Text className="text-gray-300 font-semibold text-base">
                    {t('mobile.deploying_to_nodes', { count: String(deployStates.length) })}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </>
      ) : null}
    </SafeAreaView>
  );
}
