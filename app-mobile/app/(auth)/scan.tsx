import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useNodeStore } from '@/stores/node-store';
import { getNodeApi } from '@/lib/api';
import { useTranslation } from '@/lib/i18n';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCAN_SIZE = SCREEN_WIDTH * 0.65;

interface QRPayload {
  host: string;
  key: string;
  name?: string;
}

function parseQRData(data: string): QRPayload | null {
  try {
    const parsed = JSON.parse(data);
    if (parsed && typeof parsed.host === 'string' && typeof parsed.key === 'string') {
      return parsed as QRPayload;
    }
    return null;
  } catch {
    return null;
  }
}

async function loginToNode(host: string, key: string): Promise<{ token: string; name: string }> {
  const res = await fetch(`https://${host}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: key }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Connection failed' }));
    throw new Error(err.error || `Login failed (${res.status})`);
  }

  const data = await res.json();
  return { token: data.token, name: data.name || host };
}

export default function ScanScreen() {
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const scannedRef = useRef(false);
  const addNode = useNodeStore((s) => s.addNode);

  const handleBarCodeScanned = useCallback(
    async ({ data }: { data: string }) => {
      // Prevent double-scan
      if (scannedRef.current || isProcessing) return;
      scannedRef.current = true;
      setIsProcessing(true);
      setError(null);

      const payload = parseQRData(data);
      if (!payload) {
        setError(t('mobile.scan_invalid'));
        setIsProcessing(false);
        // Allow re-scan after a short delay
        setTimeout(() => {
          scannedRef.current = false;
        }, 2000);
        return;
      }

      try {
        const { token, name } = await loginToNode(payload.host, payload.key);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const newNodeId = await addNode({
          host: payload.host,
          token,
          name: payload.name || name,
          apiKey: payload.key,
        });

        // Register on Hub (best effort)
        const hubNode = useNodeStore.getState().hubNode;
        if (hubNode && hubNode.id !== newNodeId) {
          try {
            const result = await getNodeApi(hubNode.id).addNode({
              address: payload.host,
              api_key: payload.key,
              name: payload.name || name,
            });
            await useNodeStore.getState().updateNodeHubRemoteId(newNodeId, result.id);
          } catch {
            // Hub unreachable — will sync later
          }
        }

        router.replace('/(tabs)');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to connect';
        setError(message);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        // Allow re-scan after error
        setTimeout(() => {
          scannedRef.current = false;
        }, 2000);
      } finally {
        setIsProcessing(false);
      }
    },
    [isProcessing, addNode],
  );

  const handleGoBack = useCallback(() => {
    router.back();
  }, []);

  const handleRetry = useCallback(() => {
    setError(null);
    scannedRef.current = false;
  }, []);

  // Permission not yet determined
  if (!permission) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator color="#30d158" size="large" />
      </View>
    );
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <SafeAreaView className="flex-1 bg-black">
        <View className="flex-1 items-center justify-center px-8">
          <View className="bg-gray-900 rounded-2xl p-8 items-center w-full">
            <Ionicons name="camera-outline" size={64} color="#666" />
            <Text className="text-white text-xl font-bold mt-4 mb-2 text-center">
              {t('mobile.camera_required')}
            </Text>
            <Text className="text-gray-400 text-center mb-6 leading-5">
              {t('mobile.camera_required_desc')}
            </Text>
            <TouchableOpacity
              testID="btn-allow-camera"
              onPress={requestPermission}
              className="bg-green-600 rounded-xl px-8 py-3 w-full items-center"
            >
              <Text className="text-white font-semibold text-base">
                {t('mobile.allow_camera')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleGoBack} className="mt-4 py-2">
              <Text className="text-gray-400 text-base">{t('mobile.go_back')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Camera permission granted — show scanner
  return (
    <View className="flex-1 bg-black">
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        onBarcodeScanned={handleBarCodeScanned}
      />

      {/* Overlay */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
        {/* Top overlay */}
        <View style={styles.overlayTop} />

        {/* Middle row with side overlays and clear center */}
        <View style={styles.middleRow}>
          <View style={styles.overlaySide} />
          <View style={styles.scanWindow}>
            {/* Corner markers */}
            <View style={[styles.corner, styles.cornerTopLeft]} />
            <View style={[styles.corner, styles.cornerTopRight]} />
            <View style={[styles.corner, styles.cornerBottomLeft]} />
            <View style={[styles.corner, styles.cornerBottomRight]} />
          </View>
          <View style={styles.overlaySide} />
        </View>

        {/* Bottom overlay */}
        <View style={styles.overlayBottom}>
          <Text className="text-white text-base text-center mt-8 font-medium">
            {t('mobile.scan_title')}
          </Text>
          <Text className="text-gray-400 text-sm text-center mt-2">
            {t('mobile.scan_desc')}
          </Text>

          {/* Error message */}
          {error && (
            <View testID="scan-error" className="bg-red-900/80 rounded-xl mx-8 mt-4 p-4">
              <Text className="text-red-300 text-center text-sm">{error}</Text>
              <TouchableOpacity onPress={handleRetry} className="mt-2">
                <Text className="text-white text-center text-sm font-medium">
                  {t('mobile.scan_retry')}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Processing indicator */}
          {isProcessing && (
            <View className="items-center mt-4">
              <ActivityIndicator color="#30d158" size="small" />
              <Text className="text-gray-400 text-sm mt-2">{t('mobile.scan_connecting')}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Back button */}
      <SafeAreaView
        style={StyleSheet.absoluteFill}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          testID="btn-scan-back"
          onPress={handleGoBack}
          className="ml-4 mt-2 w-10 h-10 rounded-full bg-black/50 items-center justify-center"
        >
          <Ionicons name="chevron-back" size={24} color="white" />
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayTop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  middleRow: {
    flexDirection: 'row',
    height: SCAN_SIZE,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  scanWindow: {
    width: SCAN_SIZE,
    height: SCAN_SIZE,
    position: 'relative',
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#30d158',
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 8,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 8,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 8,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 8,
  },
});
