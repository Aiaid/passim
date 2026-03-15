import { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useQuery } from '@tanstack/react-query';
import * as THREE from 'three';
import { api } from '@/lib/api-client';

// ── Texture URLs ─────────────────────────────────────────────────────
const TEX_DAY = 'https://unpkg.com/three-globe@2.41.2/example/img/earth-blue-marble.jpg';
const TEX_NIGHT = 'https://unpkg.com/three-globe@2.41.2/example/img/earth-night.jpg';
const TEX_SPEC = 'https://unpkg.com/three-globe@2.41.2/example/img/earth-water.png';
const TEX_CLOUDS = 'https://raw.githubusercontent.com/turban/webgl-earth/master/images/fair_clouds_4k.png';

// ── Load textures ────────────────────────────────────────────────────
function useManualTextures(urls: string[]) {
  const [textures, setTextures] = useState<THREE.Texture[] | null>(null);
  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    Promise.all(urls.map((url) => loader.loadAsync(url))).then(setTextures).catch(() => {});
  }, []);
  return textures;
}

// ── Sun position ─────────────────────────────────────────────────────
function getSunDirection(date: Date): THREE.Vector3 {
  const dayOfYear =
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
      Date.UTC(date.getFullYear(), 0, 0)) /
    86400000;
  const declination = -23.44 * Math.cos((2 * Math.PI * (dayOfYear + 10)) / 365);
  const decRad = (declination * Math.PI) / 180;
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60;
  const solarLon = ((12 - hours) * 15 * Math.PI) / 180;
  return new THREE.Vector3(
    Math.cos(decRad) * Math.cos(solarLon),
    Math.sin(decRad),
    -Math.cos(decRad) * Math.sin(solarLon),
  ).normalize();
}

// ── Lat/Lon → 3D ─────────────────────────────────────────────────────
function latLonToVec3(lat: number, lon: number, r: number): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
}

// ── Earth shader (day/night, no clouds in shader) ────────────────────
const earthVert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const earthFrag = /* glsl */ `
  uniform sampler2D uDayMap;
  uniform sampler2D uNightMap;
  uniform sampler2D uSpecMap;
  uniform vec3 uSunDir;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3 N = normalize(vNormal);
    float NdotL = dot(N, uSunDir);
    float dayMix = smoothstep(-0.05, 0.15, NdotL);

    vec3 dayColor = texture2D(uDayMap, vUv).rgb;
    vec3 nightRaw = texture2D(uNightMap, vUv).rgb;

    // Natural day lighting — no color tint, just diffuse shading
    float diffuse = max(NdotL, 0.0);
    dayColor *= (0.45 + 0.55 * diffuse) * 1.35;

    // Night: high-pass keeps only bright city lights, crushes dim land to black
    float nightLum = dot(nightRaw, vec3(0.299, 0.587, 0.114));
    float cityMask = smoothstep(0.05, 0.2, nightLum);
    // Keep original texture color but slightly desaturate green channel
    vec3 nightColor = nightRaw * vec3(1.1, 0.85, 0.95) * 3.0 * cityMask;

    // Ocean specular
    float specMask = texture2D(uSpecMap, vUv).r;
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 H = normalize(uSunDir + V);
    float spec = pow(max(dot(N, H), 0.0), 120.0) * specMask * 0.3 * step(0.0, NdotL);

    vec3 color = mix(nightColor, dayColor, dayMix) + vec3(spec);

    // Thin rim glow on day side only (Apple-like)
    float rim = 1.0 - max(dot(N, V), 0.0);
    color += vec3(0.3, 0.6, 1.0) * pow(rim, 5.0) * 0.08 * dayMix;

    gl_FragColor = vec4(color, 1.0);
  }
`;

// ── Atmosphere ───────────────────────────────────────────────────────
const atmosVert = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const atmosFrag = /* glsl */ `
  uniform vec3 uSunDir;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float rim = 1.0 - max(dot(N, V), 0.0);
    float glow = pow(rim, 5.0);
    float sunSide = max(dot(N, uSunDir), 0.0);
    vec3 color = mix(vec3(0.005, 0.015, 0.06), vec3(0.2, 0.5, 1.0), sunSide);
    gl_FragColor = vec4(color, glow * 0.08 * (0.3 + 0.7 * sunSide));
  }
`;

// ── Green pulsing location dot ───────────────────────────────────────
function LocationMarker({
  lat,
  lon,
  radius,
  onClick,
}: {
  lat: number;
  lon: number;
  radius: number;
  onClick?: () => void;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const pos = useMemo(() => latLonToVec3(lat, lon, radius), [lat, lon, radius]);

  const setCursor = useCallback(
    (cursor: string) => () => {
      if (onClick) document.body.style.cursor = cursor;
    },
    [onClick],
  );

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ref.current) ref.current.scale.setScalar(1 + Math.sin(t * 3) * 0.2);
    if (glowRef.current) {
      const pulse = (t * 0.8) % 1;
      glowRef.current.scale.setScalar(1 + pulse * 4);
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity = (1 - pulse) * 0.35;
    }
  });

  return (
    <group position={pos}>
      {/* Invisible larger hit area for easier clicking */}
      {onClick && (
        <mesh
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          onPointerOver={setCursor('pointer')}
          onPointerOut={setCursor('default')}
        >
          <sphereGeometry args={[0.07, 16, 16]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      )}
      <mesh ref={ref}>
        <sphereGeometry args={[0.02, 16, 16]} />
        <meshBasicMaterial color="#30d158" />
      </mesh>
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.013, 16, 16]} />
        <meshBasicMaterial color="#30d158" transparent />
      </mesh>
    </group>
  );
}

// ── Clouds as separate transparent sphere ────────────────────────────
function CloudLayer({ radius }: { radius: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [cloudMap, setCloudMap] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.loadAsync(TEX_CLOUDS).then(setCloudMap).catch(() => {});
  }, []);

  // Very slow cloud drift
  useFrame(({ clock }) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = clock.getElapsedTime() * 0.003;
    }
  });

  if (!cloudMap) return null;

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[radius, 64, 64]} />
      <meshPhongMaterial map={cloudMap} transparent opacity={0.55} depthWrite={false} color="#ffffff" emissive="#222222" />
    </mesh>
  );
}

// ── Stars ────────────────────────────────────────────────────────────
function Stars() {
  const positions = useMemo(() => {
    const arr = new Float32Array(3000 * 3);
    for (let i = 0; i < 3000; i++) {
      const r = 12 + Math.random() * 15;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = r * Math.cos(phi);
    }
    return arr;
  }, []);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#ffffff" size={0.04} sizeAttenuation transparent opacity={0.7} />
    </points>
  );
}

// ── Earth scene ──────────────────────────────────────────────────────
function EarthScene({
  lat,
  lon,
  offsetX = 0,
  scaleFactor = 0.28,
  onMarkerClick,
}: {
  lat?: number;
  lon?: number;
  offsetX?: number;
  scaleFactor?: number;
  onMarkerClick?: () => void;
}) {
  const { viewport } = useThree();
  const textures = useManualTextures([TEX_DAY, TEX_NIGHT, TEX_SPEC]);

  const sunDir = useMemo(() => getSunDirection(new Date()), []);
  const scale = useMemo(
    () => Math.min(viewport.width, viewport.height) * scaleFactor,
    [viewport, scaleFactor],
  );
  const RADIUS = 1.5;

  const rotation = useMemo(() => {
    const tilt = (23.4 * Math.PI) / 180;
    if (lat !== undefined && lon !== undefined) {
      const lonRad = ((-lon - 90) * Math.PI) / 180;
      return new THREE.Euler(tilt, lonRad, 0);
    }
    return new THREE.Euler(tilt, 0, 0);
  }, [lat, lon]);

  const earthUniforms = useMemo(() => {
    if (!textures) return null;
    return {
      uDayMap: { value: textures[0] },
      uNightMap: { value: textures[1] },
      uSpecMap: { value: textures[2] },
      uSunDir: { value: sunDir },
    };
  }, [textures, sunDir]);

  const atmosUniforms = useMemo(() => ({ uSunDir: { value: sunDir } }), [sunDir]);

  if (!earthUniforms) return <Stars />;

  return (
    <>
      <Stars />
      {/* Directional light for cloud layer */}
      <directionalLight position={sunDir.clone().multiplyScalar(10)} intensity={1.5} />
      <ambientLight intensity={0.1} />
      <group position={[offsetX, 0, 0]} rotation={rotation} scale={scale}>
        {/* Earth */}
        <mesh>
          <sphereGeometry args={[RADIUS, 128, 128]} />
          <shaderMaterial
            vertexShader={earthVert}
            fragmentShader={earthFrag}
            uniforms={earthUniforms}
          />
        </mesh>
        {/* Cloud layer */}
        <CloudLayer radius={RADIUS * 1.008} />
        {/* Atmosphere */}
        <mesh>
          <sphereGeometry args={[RADIUS * 1.012, 64, 64]} />
          <shaderMaterial
            vertexShader={atmosVert}
            fragmentShader={atmosFrag}
            uniforms={atmosUniforms}
            transparent
            side={THREE.BackSide}
            depthWrite={false}
          />
        </mesh>
        {/* Location marker */}
        {lat !== undefined && lon !== undefined && (
          <LocationMarker
            lat={lat}
            lon={lon}
            radius={RADIUS * 1.005}
            onClick={onMarkerClick}
          />
        )}
      </group>
    </>
  );
}

// ── Exported component ───────────────────────────────────────────────
export function EarthGlobe({
  transparent = false,
  globeOffsetX = 0,
  scaleFactor = 0.28,
  onMarkerClick,
}: {
  transparent?: boolean;
  globeOffsetX?: number;
  scaleFactor?: number;
  onMarkerClick?: () => void;
}) {
  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: () => api.getStatus(),
    refetchInterval: 30_000,
  });

  return (
    <div className="w-full h-full">
      <Canvas
        camera={{ position: [0, 0, 4.5], fov: 45 }}
        gl={{ antialias: true, alpha: transparent }}
        dpr={[1, 2]}
        style={{ background: transparent ? 'transparent' : '#000' }}
      >
        <OrbitControls
          target={[0, 0, 0]}
          enableZoom={false}
          enablePan={false}
          rotateSpeed={0.5}
          dampingFactor={0.1}
          enableDamping
        />
        <EarthScene
          lat={status?.node.latitude}
          lon={status?.node.longitude}
          offsetX={globeOffsetX}
          scaleFactor={scaleFactor}
          onMarkerClick={onMarkerClick}
        />
      </Canvas>
    </div>
  );
}
