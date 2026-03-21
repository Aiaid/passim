import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { I18nProvider } from '@/lib/i18n';
import { useNodeStore } from '@/stores/node-store';
import { useAuthStore } from '@/stores/auth-store';
import { usePreferencesStore } from '@/stores/preferences-store';
import '../global.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 30_000 },
  },
});

function AppContent() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function loadStores() {
      await Promise.all([
        useNodeStore.getState().loadNodes(),
        useAuthStore.getState().loadAuth(),
        usePreferencesStore.getState().loadPreferences(),
      ]);
      setIsReady(true);
    }
    loadStores();
  }, []);

  if (!isReady) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator color="#30d158" size="large" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <AppContent />
        </I18nProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
