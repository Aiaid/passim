import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';

export interface StatusDotProps {
  status: 'running' | 'connected' | 'stopped' | 'disconnected' | 'deploying' | 'error';
  size?: number;
}

const STATUS_COLORS: Record<StatusDotProps['status'], string> = {
  running: '#30d158',
  connected: '#30d158',
  stopped: '#666',
  disconnected: '#666',
  deploying: '#5e5ce6',
  error: '#ff453a',
};

export function StatusDot({ status, size = 8 }: StatusDotProps) {
  const opacity = useSharedValue(1);
  const shouldPulse = status === 'running' || status === 'connected' || status === 'deploying';
  const duration = status === 'deploying' ? 500 : 1000;

  useEffect(() => {
    if (shouldPulse) {
      opacity.value = withRepeat(
        withSequence(
          withTiming(0.4, { duration }),
          withTiming(1, { duration }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(opacity);
      opacity.value = 1;
    }
    return () => cancelAnimation(opacity);
  }, [shouldPulse, duration, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={animatedStyle}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: STATUS_COLORS[status],
        }}
      />
    </Animated.View>
  );
}
