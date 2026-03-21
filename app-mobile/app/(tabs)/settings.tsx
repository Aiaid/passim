import { useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusDot } from '@/components/StatusDot';
import { getNodeApi } from '@/lib/api';
import { useNodeStore } from '@/stores/node-store';
import { useAuthStore } from '@/stores/auth-store';
import { usePreferencesStore } from '@/stores/preferences-store';
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

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable className="flex-1 bg-black/60 items-center justify-center" onPress={onCancel}>
        <Pressable className="bg-gray-900 rounded-2xl w-72 p-5" onPress={() => {}}>
          <Text className="text-white text-lg font-semibold mb-3">Node Name</Text>
          <TextInput
            className="bg-gray-800 text-white rounded-lg px-3 py-2.5 text-base mb-4"
            value={text}
            onChangeText={setText}
            autoFocus
            selectTextOnFocus
            placeholderTextColor="#666"
            placeholder="Enter node name"
          />
          <View className="flex-row justify-end gap-3">
            <Pressable onPress={onCancel}>
              <Text className="text-gray-400 text-base py-1 px-2">Cancel</Text>
            </Pressable>
            <Pressable onPress={() => onSave(text.trim())}>
              <Text className="text-[#30d158] text-base font-semibold py-1 px-2">Save</Text>
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

  // Queries
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => getNodeApi().getSettings(),
  });

  const sslQuery = useQuery({
    queryKey: ['ssl'],
    queryFn: () => getNodeApi().getSSLStatus(),
  });

  const versionQuery = useQuery({
    queryKey: ['version'],
    queryFn: () => getNodeApi().getVersion(),
  });

  // Mutations
  const updateSettingsMut = useMutation({
    mutationFn: (data: { node_name?: string }) => getNodeApi().updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['status'] });
    },
  });

  const renewSSLMut = useMutation({
    mutationFn: () => getNodeApi().renewSSL(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ssl'] });
      Alert.alert('SSL Renewed', 'Certificate has been renewed successfully.');
    },
    onError: (err: Error) => {
      Alert.alert('Renew Failed', err.message);
    },
  });

  const checkUpdateMut = useMutation({
    mutationFn: () => getNodeApi().checkUpdate({ force: true }),
    onSuccess: (data) => {
      setUpdateResult(data);
      if (!data.available) {
        Alert.alert('Up to Date', `You are running the latest version (${data.latest}).`);
      }
    },
    onError: (err: Error) => {
      Alert.alert('Check Failed', err.message);
    },
  });

  const performUpdateMut = useMutation({
    mutationFn: (version: string) => getNodeApi().performUpdate(version),
    onSuccess: () => {
      Alert.alert('Update Started', 'The node is updating. It will restart shortly.');
    },
    onError: (err: Error) => {
      Alert.alert('Update Failed', err.message);
    },
  });

  // Handlers
  const handleEditNodeName = () => {
    const currentName = settingsQuery.data?.node_name ?? '';
    if (Platform.OS === 'ios') {
      Alert.prompt('Node Name', 'Enter a name for this node.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: (value) => {
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
    Alert.alert('Install Update', `Update to ${version}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Update',
        onPress: () => performUpdateMut.mutate(version),
      },
    ]);
  };

  const handleRenewSSL = () => {
    Alert.alert('Renew Certificate', 'This will request a new SSL certificate. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Renew', onPress: () => renewSSLMut.mutate() },
    ]);
  };

  const handleRemoveNode = () => {
    if (!activeNode) return;
    Alert.alert(
      'Remove Node',
      `Remove "${activeNode.name}" from this device? You can add it back later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
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

  // Derived data
  const nodeName = settingsQuery.data?.node_name ?? '--';
  const maskedToken = activeNode?.token
    ? `${activeNode.token.slice(0, 8)}...`
    : '--';

  const ssl = sslQuery.data;
  const version = versionQuery.data;

  const updateValue = checkUpdateMut.isPending
    ? 'Checking...'
    : updateResult?.available
      ? `v${updateResult.latest} available`
      : undefined;

  return (
    <SafeAreaView className="flex-1 bg-black">
      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 48 }}>
        <Text className="text-2xl font-bold text-white mt-4 mb-6">Settings</Text>

        {/* General */}
        <SettingsSection title="General">
          <SettingsRow testID="setting-node-name" label="Node Name" value={nodeName} onPress={handleEditNodeName} chevron />
          <SettingsRow
            testID="setting-language"
            label="Language"
            value={LANGUAGE_LABELS[language]}
            onPress={cycleLanguage}
          />
          <SettingsRow testID="setting-theme" label="Theme" value={THEME_LABELS[theme]} onPress={cycleTheme} />
        </SettingsSection>

        {/* Security */}
        <SettingsSection title="Security">
          <SettingsRow label="Passkeys" onPress={() => {}} chevron />
          <SettingsRow label="API Key" value={maskedToken} />
          <SettingsRow
            testID="switch-app-lock"
            label="App Lock"
            right={
              <Switch
                value={biometricEnabled}
                onValueChange={setBiometricEnabled}
                trackColor={{ false: '#333', true: '#30d158' }}
                thumbColor="#fff"
              />
            }
          />
        </SettingsSection>

        {/* SSL */}
        <SettingsSection title="SSL">
          <SettingsRow
            testID="setting-ssl"
            label="Certificate"
            right={
              <View className="flex-row items-center gap-2">
                <StatusDot status={ssl?.valid ? 'running' : 'error'} size={8} />
                <Text className="text-gray-400 text-base">
                  {ssl?.valid ? 'Valid' : 'Invalid'}
                </Text>
              </View>
            }
          />
          <SettingsRow label="Domain" value={ssl?.domain ?? '--'} />
          <SettingsRow
            label="Expires"
            value={ssl?.expires_at ? new Date(ssl.expires_at).toLocaleDateString() : '--'}
          />
          <SettingsRow
            label="Renew"
            onPress={handleRenewSSL}
            value={renewSSLMut.isPending ? 'Renewing...' : undefined}
            chevron
          />
        </SettingsSection>

        {/* System */}
        <SettingsSection title="System">
          <SettingsRow testID="setting-version" label="Version" value={version?.version ?? '--'} />
          <SettingsRow
            testID="btn-check-updates"
            label="Check Updates"
            value={updateValue}
            onPress={
              updateResult?.available
                ? () => handlePerformUpdate(updateResult.latest)
                : handleCheckUpdate
            }
            chevron
          />
          <SettingsRow
            testID="switch-push"
            label="Push Notifications"
            right={
              <Switch
                value={pushEnabled}
                onValueChange={setPushEnabled}
                trackColor={{ false: '#333', true: '#30d158' }}
                thumbColor="#fff"
              />
            }
          />
        </SettingsSection>

        {/* Nodes */}
        <SettingsSection title="Nodes">
          {nodes.map((node) => (
            <SettingsRow
              key={node.id}
              label={node.name}
              value={node.id === activeNodeId ? 'Active' : undefined}
              onPress={() => setActiveNode(node.id)}
              right={
                node.id === activeNodeId ? (
                  <Ionicons name="checkmark-circle" size={20} color="#30d158" />
                ) : undefined
              }
            />
          ))}
          <SettingsRow
            label="Add Node"
            onPress={() => router.push('/nodes/add')}
            chevron
          />
        </SettingsSection>

        {/* About */}
        <SettingsSection title="About">
          <SettingsRow label="Version" value={version?.version ?? '--'} />
          <SettingsRow label="Commit" value={version?.commit ?? '--'} />
          <SettingsRow
            label="Build Time"
            value={
              version?.build_time
                ? new Date(version.build_time).toLocaleDateString()
                : '--'
            }
          />
          <SettingsRow
            label="Passim"
            onPress={() => Linking.openURL('https://passim.io')}
            chevron
          />
        </SettingsSection>

        {/* Danger Zone */}
        <SettingsSection title="Danger Zone">
          <SettingsRow
            testID="btn-remove-node"
            label="Remove Current Node"
            onPress={handleRemoveNode}
            danger
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
    </SafeAreaView>
  );
}
