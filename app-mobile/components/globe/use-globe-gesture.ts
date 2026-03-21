import { useRef, useCallback } from 'react';
import { Gesture } from 'react-native-gesture-handler';

export interface GlobeRotation {
  x: number;
  y: number;
}

export function useGlobeGesture() {
  const rotation = useRef<GlobeRotation>({ x: 0.3, y: 0 });
  const velocity = useRef<GlobeRotation>({ x: 0, y: 0 });
  const savedRotation = useRef<GlobeRotation>({ x: 0.3, y: 0 });

  const panGesture = Gesture.Pan()
    .onStart(() => {
      savedRotation.current = { ...rotation.current };
      velocity.current = { x: 0, y: 0 };
    })
    .onUpdate((e) => {
      const sensitivity = 0.005;
      rotation.current = {
        x: savedRotation.current.x + e.translationY * sensitivity,
        y: savedRotation.current.y + e.translationX * sensitivity,
      };
      // Clamp vertical rotation
      rotation.current.x = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, rotation.current.x));
    })
    .onEnd((e) => {
      velocity.current = {
        x: e.velocityY * 0.00001,
        y: e.velocityX * 0.00001,
      };
    });

  const getRotation = useCallback(() => rotation.current, []);
  const getVelocity = useCallback(() => velocity.current, []);

  return { panGesture, getRotation, getVelocity };
}
