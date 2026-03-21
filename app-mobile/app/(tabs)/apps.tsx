import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

export default function AppsScreen() {
  return (
    <SafeAreaView className="flex-1 bg-black">
      <ScrollView className="flex-1 px-4">
        <View className="flex-row items-center justify-between mt-4 mb-6">
          <Text className="text-2xl font-bold text-white">Apps</Text>
          <Pressable
            className="bg-primary rounded-lg px-4 py-2"
            onPress={() => router.push('/apps/deploy')}
          >
            <Text className="text-black font-semibold">Deploy</Text>
          </Pressable>
        </View>

        {/* App list placeholder */}
        <View className="bg-gray-900 rounded-xl p-6 items-center">
          <Text className="text-gray-500">No apps deployed yet</Text>
          <Text className="text-gray-600 text-sm mt-1">
            Deploy your first app from the marketplace
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
