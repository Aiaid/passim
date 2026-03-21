import { useEffect, useRef } from 'react';
import { View, Animated } from 'react-native';

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
  const opacity = useRef(new Animated.Value(1)).current;
  const shouldPulse = status === 'running' || status === 'connected' || status === 'deploying';
  const duration = status === 'deploying' ? 500 : 1000;

  useEffect(() => {
    if (shouldPulse) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.4, duration, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration, useNativeDriver: true }),
        ]),
      );
      animation.start();
      return () => animation.stop();
    } else {
      opacity.setValue(1);
    }
  }, [shouldPulse, duration, opacity]);

  return (
    <Animated.View style={{ opacity }}>
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
