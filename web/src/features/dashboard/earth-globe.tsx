import { useRef, useMemo, useState, useEffect, useCallback, useSyncExternalStore, Fragment } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { useQuery } from '@tanstack/react-query';
import * as THREE from 'three';
import { api, type StatusResponse, type RemoteNode } from '@/lib/api-client';
import { usePreferencesStore } from '@/stores/preferences-store';
import { useEventStream } from '@/hooks/use-event-stream';

// ── Country code → approximate lat/lon ──────────────────────────────
const COUNTRY_COORDS: Record<string, [number, number]> = {
  US: [38, -97], GB: [54, -2], DE: [51, 10], FR: [46, 2], JP: [36, 138],
  CN: [35, 105], KR: [36, 128], SG: [1, 104], AU: [-25, 134], BR: [-14, -51],
  CA: [56, -106], IN: [20, 77], RU: [60, 100], NL: [52, 5], SE: [62, 15],
  FI: [64, 26], NO: [62, 10], DK: [56, 10], CH: [47, 8], AT: [47, 14],
  BE: [51, 4], IT: [43, 12], ES: [40, -4], PT: [39, -8], PL: [52, 20],
  CZ: [50, 15], IE: [53, -8], HK: [22, 114], TW: [24, 121], MY: [4, 102],
  ID: [-5, 120], TH: [15, 100], VN: [16, 108], PH: [13, 122], MX: [23, -102],
  AR: [-34, -64], CL: [-30, -71], CO: [4, -72], ZA: [-29, 24], EG: [27, 30],
  TR: [39, 35], IL: [31, 35], AE: [24, 54], SA: [24, 45], UA: [49, 32],
  RO: [46, 25], HU: [47, 20], GR: [39, 22], BG: [43, 25], HR: [45, 16],
  NZ: [-41, 174], KE: [-1, 38], NG: [10, 8], PK: [30, 69], BD: [24, 90],
};

// ── Texture URLs ─────────────────────────────────────────────────────
const TEX_DAY = 'https://unpkg.com/three-globe@2.41.2/example/img/earth-blue-marble.jpg';
const TEX_NIGHT = 'https://unpkg.com/three-globe@2.41.2/example/img/earth-night.jpg';
const TEX_SPEC = 'https://unpkg.com/three-globe@2.41.2/example/img/earth-water.png';
const TEX_CLOUDS = 'https://raw.githubusercontent.com/turban/webgl-earth/master/images/fair_clouds_4k.png';

// ── Load textures ────────────────────────────────────────────────────
function useManualTextures(urls: string[]) {
  const [textures, setTextures] = useState<THREE.Texture[] | null>(null);
  // urls is a stable module-level constant, but include it for exhaustive-deps correctness
  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    Promise.all(urls.map((url) => loader.loadAsync(url))).then(setTextures).catch(() => {});
  }, [urls]);
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
  uniform float uRimPower;
  uniform vec3 uAtmosDark;
  uniform vec3 uAtmosLight;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float rim = 1.0 - max(dot(N, V), 0.0);
    float glow = pow(rim, uRimPower);
    float sunSide = max(dot(N, uSunDir), 0.0);
    vec3 color = mix(uAtmosDark, uAtmosLight, sunSide);
    gl_FragColor = vec4(color, glow * uGlowStrength * (0.3 + 0.7 * sunSide));
  }
`;

// ── Country code → flag emoji ─────────────────────────────────────────
function countryFlag(code: string): string {
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

// ── Node clustering ──────────────────────────────────────────────────
interface NodeEntry {
  id: string;
  lat: number;
  lon: number;
  type: 'local' | 'remote';
  localData?: StatusResponse;
  remoteData?: RemoteNode;
}

interface NodeCluster {
  centroid: [number, number];
  members: NodeEntry[];
}

function angularDist(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

function buildClusters(entries: NodeEntry[], threshold = 15): NodeCluster[] {
  const used = new Set<number>();
  const clusters: NodeCluster[] = [];

  for (let i = 0; i < entries.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    const members = [entries[i]];

    for (let j = i + 1; j < entries.length; j++) {
      if (used.has(j)) continue;
      if (members.some(m => angularDist(m.lat, m.lon, entries[j].lat, entries[j].lon) < threshold)) {
        members.push(entries[j]);
        used.add(j);
      }
    }

    const avgLat = members.reduce((s, m) => s + m.lat, 0) / members.length;
    const avgLon = members.reduce((s, m) => s + m.lon, 0) / members.length;
    clusters.push({ centroid: [avgLat, avgLon], members });
  }

  return clusters;
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
                CTR
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="node-billboard-footer">
            {node.version && <span>{node.version}</span>}
            <span>{node.public_ip ?? '—'}</span>
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

// ── Deterministic PRNG (mulberry32) ──────────────────────────────────
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Stars ────────────────────────────────────────────────────────────
function Stars({ isDark }: { isDark: boolean }) {
  const geo = useMemo(() => {
    const rand = mulberry32(42);
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
      const r = 10 + rand() * 18;
      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(2 * rand() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      if (isDark) {
        colors[i * 3] = 1;
        colors[i * 3 + 1] = 1;
        colors[i * 3 + 2] = 1;
      } else {
        const c = palette[Math.floor(rand() * palette.length)];
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

// ── Remote node marker (blue/purple) ─────────────────────────────────
function RemoteNodeMarker({
  lat,
  lon,
  radius,
  node,
  showLabel = true,
  onClick,
}: {
  lat: number;
  lon: number;
  radius: number;
  node: RemoteNode;
  showLabel?: boolean;
  onClick?: () => void;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const pos = useMemo(() => latLonToVec3(lat, lon, radius), [lat, lon, radius]);
  const [visible, setVisible] = useState(true);

  const _worldPos = useMemo(() => new THREE.Vector3(), []);
  const _camDir = useMemo(() => new THREE.Vector3(), []);
  const _normal = useMemo(() => new THREE.Vector3(), []);
  const _center = useMemo(() => new THREE.Vector3(), []);

  const color = node.status === 'connected' ? '#5e5ce6' : '#888888';

  useFrame(({ clock, camera }) => {
    const t = clock.getElapsedTime();
    if (ref.current) ref.current.scale.setScalar(1 + Math.sin(t * 2.5) * 0.15);
    if (glowRef.current) {
      const pulse = (t * 0.6) % 1;
      glowRef.current.scale.setScalar(1 + pulse * 3);
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity = (1 - pulse) * 0.25;
    }

    if (groupRef.current) {
      groupRef.current.getWorldPosition(_worldPos);
      groupRef.current.parent?.getWorldPosition(_center);
      _normal.subVectors(_worldPos, _center).normalize();
      _camDir.subVectors(camera.position, _worldPos).normalize();
      const facing = _normal.dot(_camDir) > 0.05;
      if (facing !== visible) setVisible(facing);
    }
  });

  return (
    <group ref={groupRef} position={pos}>
      {visible && showLabel && (
        <Html
          position={[0, 0, 0]}
          center
          distanceFactor={3}
          style={{
            pointerEvents: visible ? 'auto' : 'none',
            opacity: visible ? 1 : 0,
            transition: 'opacity 0.3s ease',
          }}
          zIndexRange={[40, 0]}
        >
          <div
            className="node-billboard"
            onClick={onClick ? (e) => { e.stopPropagation(); onClick(); } : undefined}
            onMouseEnter={onClick ? () => { document.body.style.cursor = 'pointer'; } : undefined}
            onMouseLeave={onClick ? () => { document.body.style.cursor = 'default'; } : undefined}
          >
            <div className="node-billboard-card">
              <RemoteBillboardCol data={node} />
              <div className="node-billboard-arrow" />
            </div>
          </div>
        </Html>
      )}
      {onClick && (
        <mesh
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { document.body.style.cursor = 'default'; }}
        >
          <sphereGeometry args={[0.06, 16, 16]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      )}
      <mesh ref={ref}>
        <sphereGeometry args={[0.018, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.012, 16, 16]} />
        <meshBasicMaterial color={color} transparent />
      </mesh>
    </group>
  );
}

// ── Billboard column for local node in cluster ──────────────────────
function LocalBillboardCol({ data }: { data: StatusResponse }) {
  const { node, system, containers } = data;
  return (
    <>
      <div className="cluster-col-header">
        <span className="node-billboard-ping">
          <span className="node-billboard-ping-ring" />
          <span className="node-billboard-ping-dot" />
        </span>
        <span className="node-billboard-name">{node.name}</span>
        {node.country && <span className="node-billboard-flag">{countryFlag(node.country)}</span>}
      </div>
      <div className="node-billboard-stats">
        <div className="node-billboard-stat">
          <span className="node-billboard-stat-value">{system.cpu.usage_percent.toFixed(0)}%</span>
          <span className="node-billboard-stat-label">CPU</span>
        </div>
        <div className="node-billboard-divider" />
        <div className="node-billboard-stat">
          <span className="node-billboard-stat-value">{system.memory.usage_percent.toFixed(0)}%</span>
          <span className="node-billboard-stat-label">MEM</span>
        </div>
        <div className="node-billboard-divider" />
        <div className="node-billboard-stat">
          <span className="node-billboard-stat-value">{containers.running}</span>
          <span className="node-billboard-stat-label">CTR</span>
        </div>
      </div>
      <div className="node-billboard-footer">
        {node.version && <span>{node.version}</span>}
        <span>{node.public_ip ?? '—'}</span>
      </div>
    </>
  );
}

// ── Billboard column for remote node in cluster ─────────────────────
function RemoteBillboardCol({ data }: { data: RemoteNode }) {
  const isConnected = data.status === 'connected';
  const metrics = data.metrics;
  const dotColor = isConnected ? '#5e5ce6' : '#888888';

  return (
    <>
      <div className="cluster-col-header">
        <span className="node-billboard-ping">
          <span
            className="node-billboard-ping-ring"
            style={{ background: dotColor, animation: isConnected ? undefined : 'none' }}
          />
          <span className="node-billboard-ping-dot" style={{ background: dotColor }} />
        </span>
        <span className="node-billboard-name">{data.name || data.address}</span>
        {data.country && <span className="node-billboard-flag">{countryFlag(data.country)}</span>}
      </div>
      {isConnected && metrics ? (
        <>
          <div className="node-billboard-stats">
            <div className="node-billboard-stat">
              <span className="node-billboard-stat-value">{metrics.cpu_percent.toFixed(0)}%</span>
              <span className="node-billboard-stat-label">CPU</span>
            </div>
            <div className="node-billboard-divider" />
            <div className="node-billboard-stat">
              <span className="node-billboard-stat-value">{metrics.memory_percent.toFixed(0)}%</span>
              <span className="node-billboard-stat-label">MEM</span>
            </div>
            <div className="node-billboard-divider" />
            <div className="node-billboard-stat">
              <span className="node-billboard-stat-value">{metrics.containers.running}</span>
              <span className="node-billboard-stat-label">CTRs</span>
            </div>
          </div>
          <div className="node-billboard-footer">
            <span>{data.address}</span>
          </div>
        </>
      ) : (
        <div className="node-billboard-footer" style={{ justifyContent: 'center', paddingTop: 6 }}>
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9 }}>
            {data.status === 'connecting' ? 'connecting...' : 'offline'}
          </span>
        </div>
      )}
    </>
  );
}

// ── Cluster billboard (shared card for nearby nodes) ─────────────────
function ClusterBillboard({ cluster, radius, onMemberClick }: {
  cluster: NodeCluster;
  radius: number;
  onMemberClick?: (nodeId: string) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [visible, setVisible] = useState(true);
  const pos = useMemo(
    () => latLonToVec3(cluster.centroid[0], cluster.centroid[1], radius),
    [cluster.centroid, radius],
  );

  const _worldPos = useMemo(() => new THREE.Vector3(), []);
  const _camDir = useMemo(() => new THREE.Vector3(), []);
  const _normal = useMemo(() => new THREE.Vector3(), []);
  const _center = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera }) => {
    if (!groupRef.current) return;
    groupRef.current.getWorldPosition(_worldPos);
    groupRef.current.parent?.getWorldPosition(_center);
    _normal.subVectors(_worldPos, _center).normalize();
    _camDir.subVectors(camera.position, _worldPos).normalize();
    const facing = _normal.dot(_camDir) > 0.05;
    if (facing !== visible) setVisible(facing);
  });

  return (
    <group ref={groupRef} position={pos}>
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
        <div className="cluster-billboard">
          <div className="cluster-billboard-card">
            {cluster.members.map((member, i) => (
              <Fragment key={member.id}>
                {i > 0 && <div className="cluster-billboard-sep" />}
                <div
                  className="cluster-billboard-col"
                  style={{ cursor: onMemberClick ? 'pointer' : undefined }}
                  onClick={onMemberClick ? (e) => { e.stopPropagation(); onMemberClick(member.id); } : undefined}
                  onMouseEnter={onMemberClick ? () => { document.body.style.cursor = 'pointer'; } : undefined}
                  onMouseLeave={onMemberClick ? () => { document.body.style.cursor = 'default'; } : undefined}
                >
                  {member.type === 'local' && member.localData ? (
                    <LocalBillboardCol data={member.localData} />
                  ) : member.remoteData ? (
                    <RemoteBillboardCol data={member.remoteData} />
                  ) : null}
                </div>
              </Fragment>
            ))}
            <div className="node-billboard-arrow" />
          </div>
        </div>
      </Html>
    </group>
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
  remoteNodes,
}: {
  lat?: number;
  lon?: number;
  offsetX?: number;
  scaleFactor?: number;
  onMarkerClick?: (nodeId: string) => void;
  isDark: boolean;
  status?: StatusResponse;
  remoteNodes?: RemoteNode[];
}) {
  const { viewport } = useThree();
  const textures = useManualTextures([TEX_DAY, TEX_NIGHT, TEX_SPEC]);

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

  // Sun direction: compute in model space, then rotate to world space
  // so the day/night terminator matches the globe's visual rotation
  const sunDirModel = useMemo(() => getSunDirection(new Date()), []);
  const sunDir = useMemo(
    () => sunDirModel.clone().applyEuler(rotation).normalize(),
    [sunDirModel, rotation],
  );

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
      uRimPower: { value: isDark ? 5.0 : 3.0 },
      uAtmosDark: { value: isDark ? new THREE.Vector3(0.005, 0.015, 0.06) : new THREE.Vector3(0.1, 0.2, 0.5) },
      uAtmosLight: { value: isDark ? new THREE.Vector3(0.2, 0.5, 1.0) : new THREE.Vector3(0.3, 0.55, 1.0) },
    }),
    [sunDir, isDark],
  );

  // ── Resolve remote node positions ──────────────────────────────────
  // Use actual lat/lon from the hub (via status SSE), fall back to COUNTRY_COORDS.
  const resolveNodeCoords = (node: RemoteNode): [number, number] | null => {
    if (node.latitude != null && node.longitude != null) return [node.latitude, node.longitude];
    if (node.country) {
      const cc = COUNTRY_COORDS[node.country.toUpperCase()];
      if (cc) return cc;
    }
    return null;
  };

  // ── Node clustering ──────────────────────────────────────────────
  const clusters = useMemo(() => {
    if (!remoteNodes?.length) return [];

    const entries: NodeEntry[] = [];
    if (lat !== undefined && lon !== undefined && status) {
      entries.push({ id: 'local', lat, lon, type: 'local', localData: status });
    }
    remoteNodes?.forEach(node => {
      const coords = resolveNodeCoords(node);
      if (coords) {
        entries.push({ id: node.id, lat: coords[0], lon: coords[1], type: 'remote', remoteData: node });
      }
    });
    return buildClusters(entries, 15);
  }, [lat, lon, status, remoteNodes]);

  // IDs of nodes that are part of a multi-member cluster
  const clusteredIds = useMemo(() => {
    const ids = new Set<string>();
    clusters.filter(c => c.members.length > 1).forEach(c => {
      c.members.forEach(m => ids.add(m.id));
    });
    return ids;
  }, [clusters]);

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
        {/* Location marker — suppress billboard when in a cluster */}
        {lat !== undefined && lon !== undefined && (
          <LocationMarker
            lat={lat}
            lon={lon}
            radius={RADIUS * 1.005}
            onClick={onMarkerClick ? () => onMarkerClick('local') : undefined}
            status={clusteredIds.has('local') ? undefined : status}
          />
        )}
        {/* Remote node markers — suppress labels when in a cluster */}
        {remoteNodes?.map((node) => {
          const coords = resolveNodeCoords(node);
          if (!coords) return null;
          return (
            <RemoteNodeMarker
              key={node.id}
              lat={coords[0]}
              lon={coords[1]}
              radius={RADIUS * 1.005}
              node={node}
              showLabel={!clusteredIds.has(node.id)}
              onClick={onMarkerClick ? () => onMarkerClick(node.id) : undefined}
            />
          );
        })}
        {/* Cluster billboards — shared card for nearby nodes */}
        {clusters.filter(c => c.members.length > 1).map((cluster, i) => (
          <ClusterBillboard
            key={`cluster-${i}`}
            cluster={cluster}
            radius={RADIUS * 1.005}
            onMemberClick={onMarkerClick}
          />
        ))}
      </group>
    </>
  );
}

// ── Resolve effective dark mode ───────────────────────────────────────
function useIsDark() {
  const { theme } = usePreferencesStore();

  const subscribe = useCallback(
    (callback: () => void) => {
      if (theme !== 'system') return () => {};
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', callback);
      return () => mq.removeEventListener('change', callback);
    },
    [theme],
  );

  const getSnapshot = useCallback(() => {
    if (theme === 'dark') return true;
    if (theme === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }, [theme]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

// ── Exported component ───────────────────────────────────────────────
export function EarthGlobe({
  globeOffsetX = 0,
  scaleFactor = 0.28,
  onMarkerClick,
}: {
  globeOffsetX?: number;
  scaleFactor?: number;
  onMarkerClick?: (nodeId: string) => void;
}) {
  const isDark = useIsDark();
  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: () => api.getStatus(),
    refetchInterval: 30_000,
  });

  // Get remote nodes from SSE for globe markers
  let remoteNodes: RemoteNode[] | undefined;
  try {
    const stream = useEventStream();
    remoteNodes = stream.nodes ?? undefined;
  } catch {
    // useEventStream throws if not inside provider — ignore
  }

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
          remoteNodes={remoteNodes}
        />
      </Canvas>
    </div>
  );
}
