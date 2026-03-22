import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

interface CopyableFieldProps {
  label: string;
  value: string;
  secret?: boolean;
  mono?: boolean;
}

export function CopyableField({ label, value, secret, mono }: CopyableFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const displayValue = secret && !revealed ? '••••••••••••' : value;

  const handleCopy = async () => {
    await Clipboard.setStringAsync(value);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View className="flex-row items-center justify-between py-2.5 border-b border-gray-800">
      <View className="flex-1 mr-3">
        <Text className="text-gray-400 text-xs">{label}</Text>
        <Text
          className={`text-white text-sm mt-0.5 ${mono ? 'font-mono' : ''}`}
          numberOfLines={secret && !revealed ? 1 : 3}
          selectable
        >
          {displayValue}
        </Text>
      </View>
      <View className="flex-row items-center gap-1">
        {secret && (
          <Pressable
            onPress={() => setRevealed(!revealed)}
            className="w-9 h-9 rounded-lg bg-gray-800 items-center justify-center active:opacity-70"
          >
            <Ionicons
              name={revealed ? 'eye-off-outline' : 'eye-outline'}
              size={16}
              color="#999"
            />
          </Pressable>
        )}
        <Pressable
          onPress={handleCopy}
          className="w-9 h-9 rounded-lg bg-gray-800 items-center justify-center active:opacity-70"
        >
          <Ionicons
            name={copied ? 'checkmark' : 'copy-outline'}
            size={16}
            color={copied ? '#30d158' : '#999'}
          />
        </Pressable>
      </View>
    </View>
  );
}
