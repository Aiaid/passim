import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mb-6">
      <Text className="text-gray-400 text-sm uppercase tracking-wider mb-2 px-1">{title}</Text>
      <View className="bg-gray-900 rounded-xl overflow-hidden">{children}</View>
    </View>
  );
}

function SettingsRow({ label, value }: { label: string; value?: string }) {
  return (
    <Pressable className="flex-row items-center justify-between px-4 py-3.5 border-b border-gray-800 last:border-b-0">
      <Text className="text-white text-base">{label}</Text>
      {value && <Text className="text-gray-400">{value}</Text>}
    </Pressable>
  );
}

export default function SettingsScreen() {
  return (
    <SafeAreaView className="flex-1 bg-black">
      <ScrollView className="flex-1 px-4">
        <Text className="text-2xl font-bold text-white mt-4 mb-6">Settings</Text>

        <SettingsSection title="General">
          <SettingsRow label="Node Name" value="--" />
          <SettingsRow label="Language" value="System" />
          <SettingsRow label="Theme" value="System" />
        </SettingsSection>

        <SettingsSection title="Security">
          <SettingsRow label="Passkeys" />
          <SettingsRow label="API Key" />
          <SettingsRow label="App Lock" value="Off" />
        </SettingsSection>

        <SettingsSection title="SSL">
          <SettingsRow label="Certificate Status" />
          <SettingsRow label="Renew Certificate" />
        </SettingsSection>

        <SettingsSection title="System">
          <SettingsRow label="Software Update" />
          <SettingsRow label="Push Notifications" />
          <SettingsRow label="About" />
        </SettingsSection>
      </ScrollView>
    </SafeAreaView>
  );
}
