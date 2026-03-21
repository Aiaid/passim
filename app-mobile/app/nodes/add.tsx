import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNodeStore } from '@/stores/node-store';
import { useTranslation } from '@/lib/i18n';

type Mode = 'choose' | 'manual';

export default function AddNodeScreen() {
  const { t } = useTranslation();
  const addNode = useNodeStore((s) => s.addNode);
  const [mode, setMode] = useState<Mode>('choose');
  const [host, setHost] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = host.trim().length > 0 && apiKey.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || loading) return;
    setError(null);
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Login directly to the node
      const trimmedHost = host.trim();
      const res = await fetch(`https://${trimmedHost}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey.trim() }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Connection failed' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const token = data.token ?? apiKey.trim();

      // Fetch node name from status
      const statusRes = await fetch(`https://${trimmedHost}/api/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const status = statusRes.ok ? await statusRes.json() : null;
      const name = status?.node?.name || trimmedHost;

      await addNode({ host: trimmedHost, token, name });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('mobile.connection_failed');
      setError(msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-black">
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 gap-3">
        <Pressable
          onPress={() => {
            if (mode === 'manual') {
              setMode('choose');
              setError(null);
            } else {
              router.back();
            }
          }}
          className="w-10 h-10 items-center justify-center rounded-full bg-gray-900 active:opacity-70"
        >
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </Pressable>
        <Text className="text-white text-lg font-semibold flex-1">{t('mobile.add_node')}</Text>
      </View>

      {mode === 'choose' ? (
        <View className="flex-1 px-4 pt-8">
          {/* Scan QR Code */}
          <Pressable
            testID="btn-scan-qr"
            className="bg-gray-900 rounded-xl p-5 flex-row items-center gap-4 mb-4 active:opacity-70"
            onPress={() => router.push('/(auth)/scan')}
          >
            <View className="w-12 h-12 rounded-full bg-gray-800 items-center justify-center">
              <Ionicons name="qr-code" size={24} color="#30d158" />
            </View>
            <View className="flex-1">
              <Text className="text-white font-semibold text-base">{t('mobile.scan_qr')}</Text>
              <Text className="text-gray-400 text-sm mt-0.5">
                {t('mobile.scan_qr_desc')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#666" />
          </Pressable>

          {/* Enter Manually */}
          <Pressable
            testID="btn-manual-entry"
            className="bg-gray-900 rounded-xl p-5 flex-row items-center gap-4 active:opacity-70"
            onPress={() => setMode('manual')}
          >
            <View className="w-12 h-12 rounded-full bg-gray-800 items-center justify-center">
              <Ionicons name="create-outline" size={24} color="#5e5ce6" />
            </View>
            <View className="flex-1">
              <Text className="text-white font-semibold text-base">{t('mobile.enter_manually')}</Text>
              <Text className="text-gray-400 text-sm mt-0.5">
                {t('mobile.enter_manually_desc')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#666" />
          </Pressable>
        </View>
      ) : (
        <KeyboardAvoidingView
          className="flex-1 px-4 pt-6"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Host Input */}
          <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
            {t('mobile.host_address')}
          </Text>
          <TextInput
            testID="input-remote-host"
            className="bg-gray-900 rounded-xl px-4 py-3.5 text-white text-base mb-4"
            placeholder="e.g. 192.168.1.100:8443"
            placeholderTextColor="#555"
            value={host}
            onChangeText={setHost}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="next"
          />

          {/* API Key Input */}
          <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
            {t('settings.api_key')}
          </Text>
          <TextInput
            testID="input-remote-key"
            className="bg-gray-900 rounded-xl px-4 py-3.5 text-white text-base mb-6"
            placeholder="Paste your API key"
            placeholderTextColor="#555"
            value={apiKey}
            onChangeText={setApiKey}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />

          {/* Error */}
          {error ? (
            <View className="bg-red-500/10 rounded-xl px-4 py-3 mb-4">
              <Text className="text-red-400 text-sm">{error}</Text>
            </View>
          ) : null}

          {/* Submit */}
          <Pressable
            testID="btn-add-remote"
            className={`rounded-xl py-4 items-center ${canSubmit ? 'bg-primary active:opacity-70' : 'bg-gray-800'}`}
            onPress={handleSubmit}
            disabled={!canSubmit || loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text className={`font-semibold text-base ${canSubmit ? 'text-black' : 'text-gray-500'}`}>
                {t('mobile.connect')}
              </Text>
            )}
          </Pressable>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}
