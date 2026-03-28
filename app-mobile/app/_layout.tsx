import { useEffect, useState, useCallback, useRef } from 'react';
import { View, ActivityIndicator, AppState, type AppStateStatus } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Linking from 'expo-linking';
import * as LocalAuthentication from 'expo-local-authentication';
import { Ionicons } from '@expo/vector-icons';
import { I18nProvider } from '@/lib/i18n';
import { useNodeStore } from '@/stores/node-store';
import { syncWithHub } from '@/hooks/use-hub';
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
  const [locked, setLocked] = useState(false);
  const authenticatingRef = useRef(false);

  useEffect(() => {
    async function loadStores() {
      await Promise.all([
        useNodeStore.getState().loadNodes(),
        useAuthStore.getState().loadAuth(),
        usePreferencesStore.getState().loadPreferences(),
      ]);
      setIsReady(true);

      // Sync with Hub in background (discover remote nodes)
      if (useNodeStore.getState().hubNode) {
        syncWithHub().catch(() => {});
      }
    }
    loadStores();
  }, []);

  const authenticate = useCallback(async () => {
    if (authenticatingRef.current) return;
    authenticatingRef.current = true;
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Passim',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });
      if (result.success) setLocked(false);
    } finally {
      authenticatingRef.current = false;
    }
  }, []);

  // Auto-trigger Face ID when locked
  useEffect(() => {
    if (locked) authenticate();
  }, [locked, authenticate]);

  // Track app state changes for lock screen
  useEffect(() => {
    // Only track real background→active transitions.
    // Face ID itself causes inactive→active which we must ignore.
    let wasBackground = false;
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      const biometricEnabled = useAuthStore.getState().biometricEnabled;
      if (!biometricEnabled) return;

      if (state === 'background') {
        wasBackground = true;
      } else if (state === 'active' && wasBackground && !authenticatingRef.current) {
        wasBackground = false;
        setLocked(true);
      }
    });
    return () => sub.remove();
  }, []);

  // Handle deep links for share URLs (https://host/s/{token})
  useEffect(() => {
    function handleURL(event: { url: string }) {
      try {
        const parsed = new URL(event.url);
        // Match /s/{token} path pattern
        const match = parsed.pathname.match(/^\/s\/([^/]+)$/);
        if (match) {
          const token = match[1];
          const host = parsed.host;
          router.push({ pathname: '/share/[token]', params: { token, host } });
        }
      } catch {
        // Not a valid URL, ignore
      }
    }

    // Handle URL that launched the app
    Linking.getInitialURL().then((url) => {
      if (url) handleURL({ url });
    });

    // Handle URLs while app is running
    const sub = Linking.addEventListener('url', handleURL);
    return () => sub.remove();
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
        <Stack.Screen name="share/[token]" />
      </Stack>
      {/* Lock overlay — keeps Stack mounted to preserve navigation state */}
      {locked && (
        <View className="absolute inset-0 bg-black items-center justify-center" style={{ zIndex: 999 }}>
          <Ionicons name="lock-closed" size={48} color="#666" />
          <View className="mt-6">
            <View
              className="bg-gray-900 rounded-xl px-8 py-3"
              onTouchEnd={authenticate}
            >
              <Ionicons name="finger-print-outline" size={32} color="#30d158" style={{ alignSelf: 'center' }} />
            </View>
          </View>
        </View>
      )}
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
