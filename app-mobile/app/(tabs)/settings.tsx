import { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Switch,
  Alert,
  Linking,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusDot } from '@/components/StatusDot';
import { getNodeApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { useNodeStore } from '@/stores/node-store';
import { useAuthStore } from '@/stores/auth-store';
import { usePreferencesStore } from '@/stores/preferences-store';
import { useTranslation } from '@/lib/i18n';
import type { Theme, Language } from '@passim/shared/types';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mb-6">
      <Text className="text-gray-400 text-xs uppercase tracking-wider mb-2 px-1">{title}</Text>
      <View className="bg-gray-900 rounded-xl overflow-hidden">{children}</View>
    </View>
  );
}

function SettingsRow({
  label,
  value,
  onPress,
  right,
  chevron,
  danger,
  testID,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  chevron?: boolean;
  danger?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      className="flex-row items-center justify-between px-4 py-3.5 border-b border-gray-800 last:border-b-0"
      onPress={onPress}
      disabled={!onPress && !right}
    >
      <Text className={`text-base ${danger ? 'text-red-500' : 'text-white'}`}>{label}</Text>
      <View className="flex-row items-center gap-2">
        {value != null && (
          <Text className={`text-base ${danger ? 'text-red-400' : 'text-gray-400'}`}>{value}</Text>
        )}
        {right}
        {chevron && <Ionicons name="chevron-forward" size={18} color="#666" />}
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LANGUAGE_LABELS: Record<Language, string> = { 'zh-CN': '中文', 'en-US': 'English' };
const LANGUAGE_ORDER: Language[] = ['zh-CN', 'en-US'];

const THEME_LABELS: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' };
const THEME_ORDER: Theme[] = ['system', 'light', 'dark'];

// ---------------------------------------------------------------------------
// Node-name edit modal (Android fallback for Alert.prompt which is iOS-only)
// ---------------------------------------------------------------------------

function NodeNameModal({
  visible,
  initialValue,
  onSave,
  onCancel,
}: {
  visible: boolean;
  initialValue: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initialValue);
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable className="flex-1 bg-black/60 items-center justify-center" onPress={onCancel}>
        <Pressable className="bg-gray-900 rounded-2xl w-72 p-5" onPress={() => {}}>
          <Text className="text-white text-lg font-semibold mb-3">{t('mobile.node_name_title')}</Text>
          <TextInput
            className="bg-gray-800 text-white rounded-lg px-3 py-2.5 text-base mb-4"
            value={text}
            onChangeText={setText}
            autoFocus
            selectTextOnFocus
            placeholderTextColor="#666"
            placeholder={t('mobile.node_name_prompt')}
          />
          <View className="flex-row justify-end gap-3">
            <Pressable onPress={onCancel}>
              <Text className="text-gray-400 text-base py-1 px-2">{t('common.cancel')}</Text>
            </Pressable>
            <Pressable onPress={() => onSave(text.trim())}>
              <Text className="text-[#30d158] text-base font-semibold py-1 px-2">{t('common.save')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { top } = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Stores
  const { nodes, activeNode, activeNodeId, removeNode, setActiveNode } = useNodeStore();
  const { biometricEnabled, setBiometricEnabled } = useAuthStore();
  const { theme, language, pushEnabled, setTheme, setLanguage, setPushEnabled } =
    usePreferencesStore();

  // Local state
  const [nameModalVisible, setNameModalVisible] = useState(false);
  const [updateResult, setUpdateResult] = useState<{
    available: boolean;
    latest: string;
    changelog?: string;
  } | null>(null);

  const nodeId = activeNodeId ?? '';

  // Queries
  const settingsQuery = useQuery({
    queryKey: qk.settings(nodeId),
    queryFn: () => getNodeApi(nodeId).getSettings(),
    enabled: !!nodeId,
  });

  const sslQuery = useQuery({
    queryKey: qk.ssl(nodeId),
    queryFn: () => getNodeApi(nodeId).getSSLStatus(),
    enabled: !!nodeId,
  });

  const versionQuery = useQuery({
    queryKey: qk.version(nodeId),
    queryFn: () => getNodeApi(nodeId).getVersion(),
    enabled: !!nodeId,
  });

  // Mutations
  const updateSettingsMut = useMutation({
    mutationFn: (data: { node_name?: string }) => getNodeApi(nodeId).updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.settings(nodeId) });
      queryClient.invalidateQueries({ queryKey: qk.status(nodeId) });
    },
  });

  const renewSSLMut = useMutation({
    mutationFn: () => getNodeApi(nodeId).renewSSL(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.ssl(nodeId) });
      Alert.alert(t('settings.ssl_renew'), t('settings.ssl_renew_success'));
    },
    onError: (err: Error) => {
      Alert.alert(t('common.error'), err.message);
    },
  });

  const checkUpdateMut = useMutation({
    mutationFn: () => getNodeApi(nodeId).checkUpdate({ force: true }),
    onSuccess: (data) => {
      setUpdateResult(data);
      if (!data.available) {
        Alert.alert(t('settings.up_to_date'), `${data.latest}`);
      }
    },
    onError: (err: Error) => {
      Alert.alert(t('common.error'), err.message);
    },
  });

  const performUpdateMut = useMutation({
    mutationFn: (version: string) => getNodeApi(nodeId).performUpdate(version),
    onSuccess: () => {
      Alert.alert(t('settings.install_update'), t('settings.update_started'));
    },
    onError: (err: Error) => {
      Alert.alert(t('common.error'), err.message);
    },
  });

  // Handlers
  const handleEditNodeName = () => {
    const currentName = settingsQuery.data?.node_name ?? '';
    if (Platform.OS === 'ios') {
      Alert.prompt(t('mobile.node_name_title'), t('mobile.node_name_prompt'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.save'),
          onPress: (value: string | undefined) => {
            const trimmed = (value ?? '').trim();
            if (trimmed && trimmed !== currentName) {
              updateSettingsMut.mutate({ node_name: trimmed });
            }
          },
        },
      ], 'plain-text', currentName);
    } else {
      setNameModalVisible(true);
    }
  };

  const handleSaveNodeName = (name: string) => {
    setNameModalVisible(false);
    if (name && name !== settingsQuery.data?.node_name) {
      updateSettingsMut.mutate({ node_name: name });
    }
  };

  const cycleLanguage = () => {
    const idx = LANGUAGE_ORDER.indexOf(language);
    const next = LANGUAGE_ORDER[(idx + 1) % LANGUAGE_ORDER.length];
    setLanguage(next);
  };

  const cycleTheme = () => {
    const idx = THEME_ORDER.indexOf(theme);
    const next = THEME_ORDER[(idx + 1) % THEME_ORDER.length];
    setTheme(next);
  };

  const handleCheckUpdate = () => {
    setUpdateResult(null);
    checkUpdateMut.mutate();
  };

  const handlePerformUpdate = (version: string) => {
    Alert.alert(t('settings.install_update'), `${version}`, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.install_update'),
        onPress: () => performUpdateMut.mutate(version),
      },
    ]);
  };

  const handleRenewSSL = () => {
    Alert.alert(t('settings.ssl_renew'), t('settings.ssl_renew_success'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.ssl_renew'), onPress: () => renewSSLMut.mutate() },
    ]);
  };

  const handleRemoveNode = () => {
    if (!activeNode) return;
    Alert.alert(
      t('mobile.remove_node_title'),
      t('mobile.remove_node_desc', { name: activeNode.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            const id = activeNode.id;
            await removeNode(id);
            const remaining = useNodeStore.getState().nodes;
            if (remaining.length === 0) {
              router.replace('/(auth)/welcome');
            }
          },
        },
      ],
    );
  };

  const [apiKeyRevealed, setApiKeyRevealed] = useState(false);

  const handleCopyApiKey = useCallback(async () => {
    if (activeNode?.token) {
      await Clipboard.setStringAsync(activeNode.token);
      Alert.alert(t('common.copied') ?? 'Copied');
    }
  }, [activeNode, t]);

  // Derived data
  const nodeName = settingsQuery.data?.node_name ?? '--';

  const ssl = sslQuery.data;
  const version = versionQuery.data;

  const updateValue = checkUpdateMut.isPending
    ? t('settings.check_update') + '...'
    : updateResult?.available
      ? `v${updateResult.latest} ${t('settings.update_available')}`
      : undefined;

  return (
    <View className="flex-1 bg-black">
      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingTop: top, paddingBottom: 48 }}>
        <Text className="text-2xl font-bold text-white mt-4 mb-6">{t('settings.title')}</Text>

        {/* ── Nodes ── top, visually separated */}
        <SettingsSection title={t('mobile.nodes')}>
          {nodes.map((node) => (
            <SettingsRow
              key={node.id}
              label={node.name}
              value={node.id === activeNodeId ? t('mobile.active') : undefined}
              onPress={() => setActiveNode(node.id)}
              right={
                node.id === activeNodeId ? (
                  <Ionicons name="checkmark-circle" size={20} color="#30d158" />
                ) : undefined
              }
            />
          ))}
          <SettingsRow
            label={t('mobile.add_node_btn')}
            onPress={() => router.push('/nodes/add')}
            chevron
          />
        </SettingsSection>

        {/* ── Node settings ── changes per active node */}
        <Text className="text-gray-500 text-xs uppercase tracking-wider mb-3 px-1">
          {activeNode?.name ?? '--'}
        </Text>

        <SettingsSection title={t('settings.general')}>
          <SettingsRow testID="setting-node-name" label={t('settings.node_name')} value={nodeName} onPress={handleEditNodeName} chevron />
          <SettingsRow
            label={t('settings.api_key')}
            value={apiKeyRevealed ? (activeNode?.apiKey ?? activeNode?.token ?? '--') : '••••••••'}
            onPress={handleCopyApiKey}
            right={
              <Pressable onPress={() => setApiKeyRevealed(!apiKeyRevealed)} hitSlop={8}>
                <Ionicons name={apiKeyRevealed ? 'eye-off-outline' : 'eye-outline'} size={18} color="#666" />
              </Pressable>
            }
          />
          <SettingsRow label={t('settings.passkeys')} onPress={() => router.push('/settings/passkeys')} chevron />
        </SettingsSection>

        <SettingsSection title={t('settings.ssl')}>
          <SettingsRow
            testID="setting-ssl"
            label={t('settings.ssl')}
            right={
              <View className="flex-row items-center gap-2">
                <StatusDot status={ssl?.valid ? 'running' : 'error'} size={8} />
                <Text className="text-gray-400 text-base">
                  {ssl?.valid ? t('settings.ssl_valid') : t('settings.ssl_invalid')}
                </Text>
              </View>
            }
          />
          <SettingsRow label={t('settings.ssl_domain')} value={ssl?.domain ?? '--'} />
          <SettingsRow
            label={t('settings.ssl_expires')}
            value={ssl?.expires_at ? new Date(ssl.expires_at).toLocaleDateString() : '--'}
          />
          <SettingsRow
            label={t('settings.ssl_renew')}
            onPress={handleRenewSSL}
            value={renewSSLMut.isPending ? t('settings.updating') : undefined}
            chevron
          />
        </SettingsSection>

        <SettingsSection title={t('settings.system')}>
          <SettingsRow testID="setting-version" label={t('settings.current_version')} value={version?.version ?? '--'} />
          <SettingsRow label={t('settings.commit')} value={version?.commit ?? '--'} />
          <SettingsRow
            testID="btn-check-updates"
            label={t('settings.check_update')}
            value={updateValue}
            onPress={
              updateResult?.available
                ? () => handlePerformUpdate(updateResult.latest)
                : handleCheckUpdate
            }
            chevron
          />
        </SettingsSection>

        <SettingsSection title={t('mobile.danger_zone')}>
          <SettingsRow
            testID="btn-remove-node"
            label={t('mobile.remove_current_node')}
            onPress={handleRemoveNode}
            danger
          />
        </SettingsSection>

        {/* ── App settings ── independent of node */}
        <View className="border-b border-gray-800 mb-6 mt-2" />

        <SettingsSection title={t('mobile.app_settings') ?? 'App'}>
          <SettingsRow
            testID="setting-language"
            label={t('settings.language')}
            value={LANGUAGE_LABELS[language]}
            onPress={cycleLanguage}
          />
          <SettingsRow testID="setting-theme" label={t('settings.theme')} value={THEME_LABELS[theme]} onPress={cycleTheme} />
          <SettingsRow
            testID="switch-push"
            label={t('mobile.push_notifications')}
            right={
              <Switch
                value={pushEnabled}
                onValueChange={setPushEnabled}
                trackColor={{ false: '#333', true: '#30d158' }}
                thumbColor="#fff"
              />
            }
          />
          <SettingsRow
            testID="switch-app-lock"
            label={t('mobile.app_lock')}
            right={
              <Switch
                value={biometricEnabled}
                onValueChange={setBiometricEnabled}
                trackColor={{ false: '#333', true: '#30d158' }}
                thumbColor="#fff"
              />
            }
          />
          <SettingsRow
            label="Passim"
            onPress={() => Linking.openURL('https://passim.io')}
            chevron
          />
        </SettingsSection>
      </ScrollView>

      {/* Android node-name edit modal */}
      {Platform.OS !== 'ios' && (
        <NodeNameModal
          visible={nameModalVisible}
          initialValue={settingsQuery.data?.node_name ?? ''}
          onSave={handleSaveNodeName}
          onCancel={() => setNameModalVisible(false)}
        />
      )}
    </View>
  );
}
