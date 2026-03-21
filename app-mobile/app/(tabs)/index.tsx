import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DashboardScreen() {
  return (
    <SafeAreaView className="flex-1 bg-black">
      <ScrollView className="flex-1 px-4">
        <Text className="text-2xl font-bold text-white mt-4 mb-6">Dashboard</Text>

        {/* Globe placeholder — will be replaced with R3F Native Canvas */}
        <View className="h-72 bg-gray-900 rounded-2xl items-center justify-center mb-6">
          <Text className="text-gray-500">3D Globe</Text>
        </View>

        {/* Metrics placeholder */}
        <View className="flex-row gap-3 mb-6">
          <View className="flex-1 bg-gray-900 rounded-xl p-4">
            <Text className="text-gray-400 text-sm">CPU</Text>
            <Text className="text-white text-2xl font-bold">--%</Text>
          </View>
          <View className="flex-1 bg-gray-900 rounded-xl p-4">
            <Text className="text-gray-400 text-sm">Memory</Text>
            <Text className="text-white text-2xl font-bold">--%</Text>
          </View>
          <View className="flex-1 bg-gray-900 rounded-xl p-4">
            <Text className="text-gray-400 text-sm">Disk</Text>
            <Text className="text-white text-2xl font-bold">--%</Text>
          </View>
        </View>

        {/* Apps overview placeholder */}
        <Text className="text-lg font-semibold text-white mb-3">Apps</Text>
        <View className="bg-gray-900 rounded-xl p-6 items-center mb-6">
          <Text className="text-gray-500">No apps deployed</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
