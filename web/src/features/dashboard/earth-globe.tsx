import { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { useQuery } from '@tanstack/react-query';
import * as THREE from 'three';
import { api, type StatusResponse } from '@/lib/api-client';
import { usePreferencesStore } from '@/stores/preferences-store';
import { formatUptime } from '@/lib/utils';

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
  uniform float uMinBrightness;
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

    // Light-mode: lift dark areas so the globe doesn't look like a black hole
    color = max(color, vec3(uMinBrightness));

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
  uniform float uGlowStrength;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float rim = 1.0 - max(dot(N, V), 0.0);
    float glow = pow(rim, 3.0);
    float sunSide = max(dot(N, uSunDir), 0.0);
    vec3 color = mix(vec3(0.1, 0.2, 0.5), vec3(0.3, 0.55, 1.0), sunSide);
    gl_FragColor = vec4(color, glow * uGlowStrength * (0.3 + 0.7 * sunSide));
  }
`;

// ── Country code → flag emoji ─────────────────────────────────────────
function countryFlag(code: string): string {
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

// ── Billboard info card (HTML overlay above marker) ──────────────────
function MarkerBillboard({
  status,
  onClick,
  visible,
}: {
  status: StatusResponse;
  onClick?: () => void;
  visible: boolean;
}) {
  const { node, system, containers } = status;

  return (
    <Html
      position={[0, 0, 0]}
      center
      distanceFactor={3}
      style={{
        pointerEvents: visible ? 'auto' : 'none',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.3s ease',
      }}
      zIndexRange={[50, 0]}
    >
      <div
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        onMouseEnter={() => { if (onClick) document.body.style.cursor = 'pointer'; }}
        onMouseLeave={() => { document.body.style.cursor = 'default'; }}
        className="node-billboard"
      >
        {/* Card */}
        <div className="node-billboard-card">
          {/* Header row */}
          <div className="node-billboard-header">
            <span className="node-billboard-ping">
              <span className="node-billboard-ping-ring" />
              <span className="node-billboard-ping-dot" />
            </span>
            <span className="node-billboard-name">{node.name}</span>
            {node.country && (
              <span className="node-billboard-flag">{countryFlag(node.country)}</span>
            )}
          </div>

          {/* Stats row */}
          <div className="node-billboard-stats">
            <div className="node-billboard-stat">
              <span className="node-billboard-stat-value">
                {system.cpu.usage_percent.toFixed(0)}%
              </span>
              <span className="node-billboard-stat-label">CPU</span>
            </div>
            <div className="node-billboard-divider" />
            <div className="node-billboard-stat">
              <span className="node-billboard-stat-value">
                {system.memory.usage_percent.toFixed(0)}%
              </span>
              <span className="node-billboard-stat-label">MEM</span>
            </div>
            <div className="node-billboard-divider" />
            <div className="node-billboard-stat">
              <span className="node-billboard-stat-value">{containers.running}</span>
              <span className="node-billboard-stat-label">
                {containers.running === 1 ? 'CTR' : 'CTRs'}
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="node-billboard-footer">
            <span>{node.public_ip ?? '—'}</span>
            <span>up {formatUptime(node.uptime)}</span>
          </div>

          {/* Triangle pointer */}
          <div className="node-billboard-arrow" />
        </div>
      </div>
    </Html>
  );
}

// ── Green pulsing location dot ───────────────────────────────────────
function LocationMarker({
  lat,
  lon,
  radius,
  onClick,
  status,
}: {
  lat: number;
  lon: number;
  radius: number;
  onClick?: () => void;
  status?: StatusResponse;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const pos = useMemo(() => latLonToVec3(lat, lon, radius), [lat, lon, radius]);
  const [visible, setVisible] = useState(true);

  const setCursor = useCallback(
    (cursor: string) => () => {
      if (onClick) document.body.style.cursor = cursor;
    },
    [onClick],
  );

  // Temp vectors to avoid allocations in useFrame
  const _worldPos = useMemo(() => new THREE.Vector3(), []);
  const _camDir = useMemo(() => new THREE.Vector3(), []);
  const _normal = useMemo(() => new THREE.Vector3(), []);
  const _center = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock, camera }) => {
    const t = clock.getElapsedTime();
    if (ref.current) ref.current.scale.setScalar(1 + Math.sin(t * 3) * 0.2);
    if (glowRef.current) {
      const pulse = (t * 0.8) % 1;
      glowRef.current.scale.setScalar(1 + pulse * 4);
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity = (1 - pulse) * 0.35;
    }

    // Occlusion: hide when marker faces away from camera
    if (groupRef.current) {
      groupRef.current.getWorldPosition(_worldPos);
      // Earth center = parent group's world position
      groupRef.current.parent?.getWorldPosition(_center);
      _normal.subVectors(_worldPos, _center).normalize();
      _camDir.subVectors(camera.position, _worldPos).normalize();
      const facing = _normal.dot(_camDir) > 0.05;
      if (facing !== visible) setVisible(facing);
    }
  });

  return (
    <group ref={groupRef} position={pos}>
      {/* Billboard info card */}
      {status && <MarkerBillboard status={status} onClick={onClick} visible={visible} />}
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
function Stars({ isDark }: { isDark: boolean }) {
  const geo = useMemo(() => {
    const count = isDark ? 3000 : 1500;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    // Light mode: dark enough to contrast on near-white bg
    const palette = [
      [0.20, 0.30, 0.55],  // dark blue
      [0.50, 0.40, 0.18],  // dark gold
      [0.32, 0.33, 0.38],  // dark gray
      [0.35, 0.25, 0.50],  // dark purple
    ];

    for (let i = 0; i < count; i++) {
      const r = 10 + Math.random() * 18;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      if (isDark) {
        colors[i * 3] = 1;
        colors[i * 3 + 1] = 1;
        colors[i * 3 + 2] = 1;
      } else {
        const c = palette[Math.floor(Math.random() * palette.length)];
        colors[i * 3] = c[0];
        colors[i * 3 + 1] = c[1];
        colors[i * 3 + 2] = c[2];
      }
    }
    return { positions, colors };
  }, [isDark]);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[geo.positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[geo.colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        vertexColors
        size={isDark ? 0.04 : 0.18}
        sizeAttenuation
        transparent
        opacity={isDark ? 0.7 : 0.8}
      />
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
  isDark,
  status,
}: {
  lat?: number;
  lon?: number;
  offsetX?: number;
  scaleFactor?: number;
  onMarkerClick?: () => void;
  isDark: boolean;
  status?: StatusResponse;
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
      uMinBrightness: { value: isDark ? 0.0 : 0.15 },
    };
  }, [textures, sunDir, isDark]);

  const atmosUniforms = useMemo(
    () => ({
      uSunDir: { value: sunDir },
      uGlowStrength: { value: isDark ? 0.08 : 0.12 },
    }),
    [sunDir, isDark],
  );

  if (!earthUniforms) return <Stars isDark={isDark} />;

  return (
    <>
      <Stars isDark={isDark} />
      {/* Directional light for cloud layer */}
      <directionalLight position={sunDir.clone().multiplyScalar(10)} intensity={isDark ? 1.5 : 2.0} />
      <ambientLight intensity={isDark ? 0.1 : 0.5} />
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
        {/* Atmosphere — larger halo in light mode */}
        <mesh>
          <sphereGeometry args={[RADIUS * (isDark ? 1.012 : 1.03), 64, 64]} />
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
            status={status}
          />
        )}
      </group>
    </>
  );
}

// ── Resolve effective dark mode ───────────────────────────────────────
function useIsDark() {
  const { theme } = usePreferencesStore();
  const [isDark, setIsDark] = useState(() => {
    if (theme === 'dark') return true;
    if (theme === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    if (theme !== 'system') {
      setIsDark(theme === 'dark');
      return;
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  return isDark;
}

// ── Exported component ───────────────────────────────────────────────
export function EarthGlobe({
  globeOffsetX = 0,
  scaleFactor = 0.28,
  onMarkerClick,
}: {
  globeOffsetX?: number;
  scaleFactor?: number;
  onMarkerClick?: () => void;
}) {
  const isDark = useIsDark();
  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: () => api.getStatus(),
    refetchInterval: 30_000,
  });

  return (
    <div className="w-full h-full">
      <Canvas
        camera={{ position: [0, 0, 4.5], fov: 45 }}
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 2]}
      >
        <color attach="background" args={[isDark ? '#000000' : '#f4f5f8']} />
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
          isDark={isDark}
          status={status}
        />
      </Canvas>
    </div>
  );
}
