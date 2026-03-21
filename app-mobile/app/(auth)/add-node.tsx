import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useNodeStore } from '@/stores/node-store';
import { useTranslation } from '@/lib/i18n';

export default function AddNodeScreen() {
  const { t } = useTranslation();
  const [host, setHost] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const addNode = useNodeStore((s) => s.addNode);

  const handleConnect = async () => {
    if (!host || !apiKey) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`https://${host}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey }),
      });
      if (!res.ok) {
        setError(res.status === 401 ? 'Invalid API Key' : 'Connection failed');
        return;
      }
      const { token } = await res.json();
      // Fetch node name from status API
      let name = host.split(':')[0];
      try {
        const statusRes = await fetch(`https://${host}/api/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (statusRes.ok) {
          const status = await statusRes.json();
          if (status?.node?.name) name = status.node.name;
        }
      } catch { /* use host as fallback */ }
      await addNode({ host, token, name });
      router.replace('/(tabs)');
    } catch {
      setError('Could not connect. Check the address.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-black px-8 pt-20">
      <Text className="text-3xl font-bold text-white mb-8">{t('mobile.add_server')}</Text>

      <Text className="text-gray-400 mb-2">{t('mobile.host_address')}</Text>
      <TextInput
        testID="input-host"
        className="bg-gray-900 text-white rounded-xl px-4 py-3 mb-4 text-base"
        placeholder="host:8443"
        placeholderTextColor="#666"
        value={host}
        onChangeText={setHost}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text className="text-gray-400 mb-2">{t('settings.api_key')}</Text>
      <TextInput
        testID="input-api-key"
        className="bg-gray-900 text-white rounded-xl px-4 py-3 mb-6 text-base"
        placeholder="ak_..."
        placeholderTextColor="#666"
        value={apiKey}
        onChangeText={setApiKey}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />

      {error ? (
        <Text testID="error-message" className="text-red-400 mb-4 text-center">{error}</Text>
      ) : null}

      <Pressable
        testID="btn-connect"
        className="bg-primary rounded-2xl py-4"
        onPress={handleConnect}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="black" />
        ) : (
          <Text className="text-black text-center text-lg font-semibold">
            {t('mobile.connect')}
          </Text>
        )}
      </Pressable>
    </View>
  );
}
