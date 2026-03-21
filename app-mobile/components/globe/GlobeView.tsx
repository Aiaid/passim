import { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import { GestureDetector } from 'react-native-gesture-handler';
import * as THREE from 'three';
import { earthVert, earthFrag, atmosVert, atmosFrag } from '@passim/shared/globe/shaders';
import { TEX_DAY, TEX_NIGHT, TEX_SPEC, EARTH_RADIUS, COUNTRY_COORDS } from '@passim/shared/globe/constants';
import { resolveNodeCoords } from '@passim/shared/globe/clustering';
import { useGlobeGesture } from './use-globe-gesture';
import { latLonToVec3, getSunDirection } from './helpers';
import type { RemoteNode, StatusResponse } from '@passim/shared/types';

// ── Texture loader hook ──────────────────────────────────────────────
function useTextures(urls: string[]) {
  const [textures, setTextures] = useState<THREE.Texture[] | null>(null);
  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    Promise.all(urls.map((url) => loader.loadAsync(url)))
      .then(setTextures)
      .catch(() => {});
  }, [urls]);
  return textures;
}

const TEX_URLS = [TEX_DAY, TEX_NIGHT, TEX_SPEC];

// ── Earth Sphere ────────────────────────────────────────────────────
function EarthSphere() {
  const meshRef = useRef<THREE.Mesh>(null);
  const textures = useTextures(TEX_URLS);

  const uniforms = useMemo(
    () => ({
      uDayMap: { value: null as THREE.Texture | null },
      uNightMap: { value: null as THREE.Texture | null },
      uSpecMap: { value: null as THREE.Texture | null },
      uSunDir: { value: getSunDirection() },
      uMinBrightness: { value: 0.03 },
    }),
    [],
  );

  useEffect(() => {
    if (textures) {
      uniforms.uDayMap.value = textures[0];
      uniforms.uNightMap.value = textures[1];
      uniforms.uSpecMap.value = textures[2];
    }
  }, [textures, uniforms]);

  if (!textures) return null;

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[EARTH_RADIUS, 64, 64]} />
      <shaderMaterial
        vertexShader={earthVert}
        fragmentShader={earthFrag}
        uniforms={uniforms}
      />
    </mesh>
  );
}

// ── Atmosphere Halo ──────────────────────────────────────────────────
function AtmosphereHalo() {
  const uniforms = useMemo(
    () => ({
      uSunDir: { value: getSunDirection() },
      uGlowStrength: { value: 0.7 },
      uRimPower: { value: 4.0 },
      uAtmosDark: { value: new THREE.Color(0.1, 0.15, 0.4) },
      uAtmosLight: { value: new THREE.Color(0.3, 0.6, 1.0) },
    }),
    [],
  );

  return (
    <mesh>
      <sphereGeometry args={[EARTH_RADIUS * 1.08, 64, 64]} />
      <shaderMaterial
        vertexShader={atmosVert}
        fragmentShader={atmosFrag}
        uniforms={uniforms}
        transparent
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  );
}

// ── Stars ────────────────────────────────────────────────────────────
function Stars({ count = 600 }: { count?: number }) {
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 8 + Math.random() * 4;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [count]);

  return (
    <points geometry={geometry}>
      <pointsMaterial color="#ffffff" size={0.03} sizeAttenuation />
    </points>
  );
}

// ── Node Marker ──────────────────────────────────────────────────────
function NodeMarker({
  lat,
  lon,
  type,
}: {
  lat: number;
  lon: number;
  type: 'local' | 'remote';
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const pos = useMemo(() => latLonToVec3(lat, lon, EARTH_RADIUS * 1.01), [lat, lon]);
  const color = type === 'local' ? '#30d158' : '#bf5af2';

  useFrame(({ clock }) => {
    if (meshRef.current) {
      const scale = 1 + 0.2 * Math.sin(clock.getElapsedTime() * 3);
      meshRef.current.scale.setScalar(scale);
    }
  });

  return (
    <mesh ref={meshRef} position={pos}>
      <sphereGeometry args={[0.025, 12, 12]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
}

// ── Scene Controller (rotation + camera) ─────────────────────────────
function SceneController({
  getRotation,
  getVelocity,
}: {
  getRotation: () => { x: number; y: number };
  getVelocity: () => { x: number; y: number };
}) {
  const groupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(0, 0, 4.2);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  useFrame(() => {
    if (!groupRef.current) return;

    // Apply momentum decay
    const vel = getVelocity();
    const rot = getRotation();
    rot.x += vel.x;
    rot.y += vel.y;
    rot.x = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, rot.x));
    vel.x *= 0.95;
    vel.y *= 0.95;

    groupRef.current.rotation.x = rot.x;
    groupRef.current.rotation.y = rot.y;
  });

  return <group ref={groupRef} />;
}

// ── Main Globe Scene ─────────────────────────────────────────────────
function GlobeScene({
  getRotation,
  getVelocity,
  localStatus,
  remoteNodes,
}: {
  getRotation: () => { x: number; y: number };
  getVelocity: () => { x: number; y: number };
  localStatus?: StatusResponse | null;
  remoteNodes?: RemoteNode[];
}) {
  const groupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(0, 0, 4.2);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  useFrame(() => {
    if (!groupRef.current) return;

    const vel = getVelocity();
    const rot = getRotation();
    rot.x += vel.x;
    rot.y += vel.y;
    rot.x = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, rot.x));
    vel.x *= 0.95;
    vel.y *= 0.95;

    groupRef.current.rotation.x = rot.x;
    groupRef.current.rotation.y = rot.y;
  });

  // Build node markers
  const markers = useMemo(() => {
    const result: { lat: number; lon: number; type: 'local' | 'remote' }[] = [];

    // Local node
    if (localStatus?.node?.country) {
      const cc = COUNTRY_COORDS[localStatus.node.country.toUpperCase()];
      if (cc) result.push({ lat: cc[0], lon: cc[1], type: 'local' });
    }

    // Remote nodes
    if (remoteNodes) {
      for (const node of remoteNodes) {
        const coords = resolveNodeCoords(node);
        if (coords) result.push({ lat: coords[0], lon: coords[1], type: 'remote' });
      }
    }

    return result;
  }, [localStatus, remoteNodes]);

  return (
    <>
      <ambientLight intensity={0.1} />
      <group ref={groupRef}>
        <EarthSphere />
        <AtmosphereHalo />
        {markers.map((m, i) => (
          <NodeMarker key={i} lat={m.lat} lon={m.lon} type={m.type} />
        ))}
      </group>
      <Stars count={600} />
    </>
  );
}

// ── Exported Component ───────────────────────────────────────────────
interface GlobeViewProps {
  localStatus?: StatusResponse | null;
  remoteNodes?: RemoteNode[];
}

export function GlobeView({ localStatus, remoteNodes }: GlobeViewProps) {
  const { panGesture, getRotation, getVelocity } = useGlobeGesture();

  return (
    <GestureDetector gesture={panGesture}>
      <View style={styles.container}>
        <Canvas
          gl={{ antialias: false }}
          camera={{ position: [0, 0, 4.2], fov: 45 }}
          style={styles.canvas}
        >
          <GlobeScene
            getRotation={getRotation}
            getVelocity={getVelocity}
            localStatus={localStatus}
            remoteNodes={remoteNodes}
          />
        </Canvas>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 260,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  canvas: {
    flex: 1,
  },
});
