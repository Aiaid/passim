import { View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

export interface MetricRingProps {
  label: string;
  value: number;
  size?: number;
  color?: string;
}

function resolveColor(value: number, fallback: string): string {
  if (value >= 90) return '#ff453a';
  if (value >= 75) return '#ffd60a';
  return fallback;
}

export function MetricRing({ label, value, size = 90, color = '#30d158' }: MetricRingProps) {
  const strokeWidth = 5;
  const radius = Math.round(size * 0.38);
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, value));
  const strokeDashoffset = circumference * (1 - clamped / 100);
  const center = size / 2;
  const ringColor = resolveColor(clamped, color);

  return (
    <View style={{ alignItems: 'center', width: size }}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke="#333"
            strokeWidth={strokeWidth}
            fill="none"
          />
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={ringColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circumference}`}
            strokeDashoffset={strokeDashoffset}
            rotation={-90}
            origin={`${center}, ${center}`}
          />
        </Svg>
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text className="text-white font-bold text-base">{Math.round(clamped)}%</Text>
        </View>
      </View>
      <Text className="text-gray-400 text-xs mt-1">{label}</Text>
    </View>
  );
}
