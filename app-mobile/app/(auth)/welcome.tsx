import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';

export default function WelcomeScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-black px-8">
      <Text className="text-5xl font-bold text-white mb-4">Passim</Text>
      <Text className="text-lg text-gray-400 text-center mb-12">
        Your personal cloud, in your pocket.
      </Text>

      <Pressable
        testID="btn-scan-qr"
        className="w-full bg-primary rounded-2xl py-4 mb-4"
        onPress={() => router.push('/(auth)/scan')}
      >
        <Text className="text-black text-center text-lg font-semibold">
          Scan QR Code
        </Text>
      </Pressable>

      <Pressable
        testID="btn-manual-entry"
        className="w-full border border-gray-700 rounded-2xl py-4"
        onPress={() => router.push('/(auth)/add-node')}
      >
        <Text className="text-white text-center text-lg">
          Enter Manually
        </Text>
      </Pressable>
    </View>
  );
}
