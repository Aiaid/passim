import { useCallback, useMemo } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import { useAuthStore } from '@/stores/auth-store';

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

interface BiometricResult {
  isAvailable: boolean | null;
  authenticate: () => Promise<boolean>;
  checkAndAuthenticate: () => Promise<boolean>;
}

export function useBiometric(): BiometricResult {
  const biometricEnabled = useAuthStore((s) => s.biometricEnabled);
  const lastBackgroundTime = useAuthStore((s) => s.lastBackgroundTime);

  const checkAvailability = useCallback(async (): Promise<boolean> => {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) return false;
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return enrolled;
  }, []);

  const authenticate = useCallback(async (): Promise<boolean> => {
    const available = await checkAvailability();
    if (!available) return false;

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Authenticate to continue',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });

    return result.success;
  }, [checkAvailability]);

  const checkAndAuthenticate = useCallback(async (): Promise<boolean> => {
    if (!biometricEnabled) return true;

    if (lastBackgroundTime !== null) {
      const elapsed = Date.now() - lastBackgroundTime;
      if (elapsed < TIMEOUT_MS) return true;
    }

    return authenticate();
  }, [biometricEnabled, lastBackgroundTime, authenticate]);

  return useMemo(
    () => ({
      isAvailable: null, // Resolved lazily via checkAvailability
      authenticate,
      checkAndAuthenticate,
    }),
    [authenticate, checkAndAuthenticate],
  );
}
