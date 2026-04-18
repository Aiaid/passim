import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router, Stack as NavStack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNodeStore } from '@/stores/node-store';
import { useCreateStack, useValidateStack } from '@/hooks/use-stacks';
import { useTranslation } from '@/lib/i18n';
import { ApiError } from '@/lib/api';

export default function NewStackScreen() {
  const { t } = useTranslation();
  const { top, bottom } = useSafeAreaInsets();
  const nodeId = useNodeStore((s) => s.activeNodeId) ?? '';

  const [name, setName] = useState('');
  const [yamlText, setYamlText] = useState('');
  const [envText, setEnvText] = useState('');

  const validate = useValidateStack(nodeId);
  const create = useCreateStack(nodeId);

  // Debounced live validation.
  useEffect(() => {
    if (!name.trim() || !yamlText.trim()) {
      validate.reset();
      return;
    }
    const handle = setTimeout(() => {
      validate.mutate({ name, yaml_text: yamlText, env_text: envText });
    }, 500);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, yamlText, envText]);

  const translateError = (err: unknown): string => {
    if (err instanceof ApiError && err.code) {
      const translated = t(`stacks.error.${err.code}`);
      // i18n.t returns the key unchanged on miss — fall back to the raw message.
      if (translated !== `stacks.error.${err.code}`) return translated;
      return err.message;
    }
    return err instanceof Error ? err.message : String(err);
  };

  const handleDeploy = () => {
    if (!name.trim() || !yamlText.trim()) return;
    create.mutate(
      { name, yaml_text: yamlText, env_text: envText },
      {
        onSuccess: () => {
          Alert.alert(t('stacks.create_queued'));
          router.back();
        },
        onError: (err) => {
          Alert.alert(t('common.error'), translateError(err));
        },
      },
    );
  };

  const canDeploy =
    !!name.trim() && !!yamlText.trim() && !create.isPending && !!validate.data;

  const validateError = validate.error instanceof ApiError ? validate.error : null;

  return (
    <View className="flex-1 bg-black" style={{ paddingTop: top }}>
      <NavStack.Screen options={{ headerShown: false }} />
      <View className="flex-row items-center px-4 py-3 gap-3">
        <Pressable onPress={() => router.back()} className="p-1 active:opacity-70">
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
        <Text className="text-white text-xl font-bold flex-1">{t('stacks.create_title')}</Text>
        <Pressable
          onPress={handleDeploy}
          disabled={!canDeploy}
          className={`rounded-full px-4 py-2 ${canDeploy ? 'bg-white' : 'bg-gray-700'}`}
          testID="deploy-button"
        >
          {create.isPending ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text className={`font-semibold text-sm ${canDeploy ? 'text-black' : 'text-gray-500'}`}>
              {t('stacks.create')}
            </Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: bottom + 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-gray-400 text-sm mb-4">{t('stacks.create_desc')}</Text>

        <Text className="text-white font-semibold mb-1">{t('stacks.name')}</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t('stacks.name_placeholder')}
          placeholderTextColor="#6b7280"
          autoCapitalize="none"
          autoCorrect={false}
          className="bg-gray-900 text-white rounded-lg px-3 py-3 mb-4"
          testID="stack-name-input"
        />

        <Text className="text-white font-semibold mb-1">{t('stacks.yaml')}</Text>
        <TextInput
          value={yamlText}
          onChangeText={setYamlText}
          placeholder={t('stacks.yaml_placeholder')}
          placeholderTextColor="#6b7280"
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          textAlignVertical="top"
          className="bg-gray-900 text-white rounded-lg px-3 py-3 mb-4 font-mono"
          style={{ minHeight: 180, fontFamily: 'Menlo' }}
          testID="stack-yaml-input"
        />

        <Text className="text-white font-semibold mb-1">{t('stacks.env_optional')}</Text>
        <TextInput
          value={envText}
          onChangeText={setEnvText}
          placeholder={t('stacks.env_placeholder')}
          placeholderTextColor="#6b7280"
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          textAlignVertical="top"
          className="bg-gray-900 text-white rounded-lg px-3 py-3 mb-4"
          style={{ minHeight: 60, fontFamily: 'Menlo' }}
          testID="stack-env-input"
        />

        {validate.isPending && (
          <Text className="text-gray-500 text-xs">{t('stacks.validating')}</Text>
        )}
        {validate.data && (() => {
          const services = validate.data.services ?? [];
          const warnings = validate.data.warnings ?? [];
          return (
            <View className="bg-green-900/20 border border-green-800 rounded-lg p-3">
              <Text className="text-green-400 text-sm">
                {t('stacks.validate_ok', {
                  count: String(services.length),
                  services: services.join(', '),
                })}
              </Text>
              {warnings.map((w, i) => (
                <Text key={i} className="text-gray-500 text-xs mt-1">• {w.message}</Text>
              ))}
            </View>
          );
        })()}
        {validateError && (
          <View className="bg-red-900/20 border border-red-800 rounded-lg p-3">
            <Text className="text-red-400 text-sm">{translateError(validateError)}</Text>
            {validateError.code && (
              <Text className="text-gray-500 text-xs mt-1 font-mono">{validateError.code}</Text>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
