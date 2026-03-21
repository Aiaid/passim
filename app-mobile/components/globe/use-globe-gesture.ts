import { useRef, useCallback } from 'react';
import { PanResponder, type GestureResponderEvent, type PanResponderGestureState } from 'react-native';

export interface GlobeRotation {
  x: number;
  y: number;
}

export function useGlobeGesture() {
  const rotation = useRef<GlobeRotation>({ x: 0.3, y: 0 });
  const velocity = useRef<GlobeRotation>({ x: 0, y: 0 });
  const savedRotation = useRef<GlobeRotation>({ x: 0.3, y: 0 });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        savedRotation.current = { ...rotation.current };
        velocity.current = { x: 0, y: 0 };
      },
      onPanResponderMove: (_e: GestureResponderEvent, gs: PanResponderGestureState) => {
        const sensitivity = 0.005;
        rotation.current = {
          x: Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5,
            savedRotation.current.x + gs.dy * sensitivity)),
          y: savedRotation.current.y + gs.dx * sensitivity,
        };
      },
      onPanResponderRelease: (_e: GestureResponderEvent, gs: PanResponderGestureState) => {
        velocity.current = {
          x: gs.vy * 0.003,
          y: gs.vx * 0.003,
        };
      },
    }),
  ).current;

  const getRotation = useCallback(() => rotation.current, []);
  const getVelocity = useCallback(() => velocity.current, []);

  return { panResponder, getRotation, getVelocity };
}
