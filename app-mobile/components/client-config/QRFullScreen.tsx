import { useEffect, useRef } from 'react';
import { View, Text, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import * as Brightness from 'expo-brightness';

interface QRFullScreenProps {
  visible: boolean;
  value: string | null;
  title: string;
  onClose: () => void;
}

export function QRFullScreen({ visible, value, title, onClose }: QRFullScreenProps) {
  const prevBrightness = useRef<number | null>(null);

  useEffect(() => {
    if (visible) {
      Brightness.getBrightnessAsync().then((b) => {
        prevBrightness.current = b;
        Brightness.setBrightnessAsync(1.0);
      });
    } else if (prevBrightness.current !== null) {
      Brightness.setBrightnessAsync(prevBrightness.current);
      prevBrightness.current = null;
    }
  }, [visible]);

  if (!visible || !value) return null;

  return (
    <Modal
      visible
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black items-center justify-center">
        {/* Title */}
        <Text className="text-white/80 text-base font-semibold mb-8">
          {title}
        </Text>

        {/* QR Code */}
        <View className="bg-white rounded-2xl p-5">
          <QRCode value={value} size={260} backgroundColor="white" color="#0a0e14" />
        </View>

        {/* Value preview */}
        <Text className="text-white/30 text-xs font-mono mt-6 px-8 text-center" numberOfLines={2}>
          {value.length > 80 ? value.slice(0, 80) + '...' : value}
        </Text>

        {/* Close */}
        <Pressable
          onPress={onClose}
          className="mt-10 w-12 h-12 rounded-full bg-white/10 items-center justify-center active:opacity-70"
        >
          <Ionicons name="close" size={24} color="rgba(255,255,255,0.6)" />
        </Pressable>
      </View>
    </Modal>
  );
}
