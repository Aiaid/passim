import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DeployScreen() {
  return (
    <SafeAreaView className="flex-1 bg-black">
      <View className="flex-1 items-center justify-center">
        <Text className="text-white text-lg">Deploy New App</Text>
        <Text className="text-gray-500 mt-2">Marketplace coming soon</Text>
      </View>
    </SafeAreaView>
  );
}
