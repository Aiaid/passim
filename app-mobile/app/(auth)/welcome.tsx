import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from '@/lib/i18n';

export default function WelcomeScreen() {
  const { t } = useTranslation();
  return (
    <View className="flex-1 items-center justify-center bg-black px-8">
      <Text className="text-5xl font-bold text-white mb-4">Passim</Text>
      <Text className="text-lg text-gray-400 text-center mb-12">
        {t('mobile.welcome_subtitle')}
      </Text>

      <Pressable
        testID="btn-scan-qr"
        className="w-full bg-primary rounded-2xl py-4 mb-4"
        onPress={() => router.push('/(auth)/scan')}
      >
        <Text className="text-black text-center text-lg font-semibold">
          {t('mobile.scan_qr')}
        </Text>
      </Pressable>

      <Pressable
        testID="btn-manual-entry"
        className="w-full border border-gray-700 rounded-2xl py-4"
        onPress={() => router.push('/(auth)/add-node')}
      >
        <Text className="text-white text-center text-lg">
          {t('mobile.enter_manually')}
        </Text>
      </Pressable>
    </View>
  );
}
