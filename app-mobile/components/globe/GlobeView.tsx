import { useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer, loadTextureAsync } from 'expo-three';
import { Asset } from 'expo-asset';
import * as THREE from 'three';
import { earthVert, earthFrag, atmosVert, atmosFrag } from '@passim/shared/globe/shaders';
import { EARTH_RADIUS, COUNTRY_COORDS } from '@passim/shared/globe/constants';
import { useGlobeGesture } from './use-globe-gesture';
import { getSunDirection } from './helpers';
import type { StatusResponse } from '@passim/shared/types';

type Vec3Tuple = [number, number, number];

function latLonToPos(lat: number, lon: number, radius = EARTH_RADIUS): Vec3Tuple {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return [
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
}

interface BillboardData {
  x: number;
  y: number;
  visible: boolean;
  name: string;
  flag: string;
  cpu: string;
  mem: string;
  containers: number;
  ip: string;
  uptime: string;
  version: string;
  isActive: boolean;
  nodeId: string;
}

export interface GlobeNodeStatus {
  nodeId: string;
  status: StatusResponse;
  isConnected: boolean;
}

interface GlobeViewProps {
  nodeStatuses: GlobeNodeStatus[];
  activeNodeId?: string | null;
  hubNodeId?: string | null;
  fullscreen?: boolean;
  onNodeSelect?: (nodeId: string) => void;
}

export function GlobeView({ nodeStatuses, activeNodeId, hubNodeId, fullscreen, onNodeSelect }: GlobeViewProps) {
  const { panResponder, getRotation, getVelocity } = useGlobeGesture();
  const propsRef = useRef({ nodeStatuses, activeNodeId, hubNodeId });
  propsRef.current = { nodeStatuses, activeNodeId, hubNodeId };

  const [billboards, setBillboards] = useState<BillboardData[]>([]);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });

  const onContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    const renderer = new Renderer({ gl });
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 1);
    sizeRef.current = { w, h };

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(0, 0, 9.0);
    // Shift viewport up so globe appears in upper portion — pure 2D offset, no effect on rotation
    camera.setViewOffset(w, h, 0, h * 0.12, w, h);
    cameraRef.current = camera;

    const globe = new THREE.Group();
    scene.add(globe);

    const sunDir = getSunDirection();

    // Earth
    const earthMesh = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS, 48, 48),
      new THREE.MeshBasicMaterial({ color: 0x1a3a5c }),
    );
    globe.add(earthMesh);

    Promise.all(
      [
        'https://unpkg.com/three-globe@2.41.2/example/img/earth-blue-marble.jpg',
        'https://unpkg.com/three-globe@2.41.2/example/img/earth-night.jpg',
        'https://unpkg.com/three-globe@2.41.2/example/img/earth-water.png',
      ].map((url) =>
        Asset.fromURI(url).downloadAsync().then((a) => loadTextureAsync({ asset: a })),
      ),
    ).then(([dayTex, nightTex, specTex]) => {
      earthMesh.material.dispose();
      // @ts-expect-error ShaderMaterial is compatible at runtime
      earthMesh.material = new THREE.ShaderMaterial({
        vertexShader: earthVert,
        fragmentShader: earthFrag,
        uniforms: {
          uDayMap: { value: dayTex },
          uNightMap: { value: nightTex },
          uSpecMap: { value: specTex },
          uSunDir: { value: sunDir },
          uMinBrightness: { value: 0.03 },
        },
      });
    }).catch(() => {});

    // Clouds
    const cloudMesh = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS * 1.01, 48, 48),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    globe.add(cloudMesh);
    Asset.fromURI('https://raw.githubusercontent.com/turban/webgl-earth/master/images/fair_clouds_4k.png')
      .downloadAsync()
      .then((a) => loadTextureAsync({ asset: a }))
      .then((tex: THREE.Texture) => {
        cloudMesh.material.dispose();
        cloudMesh.material = new THREE.MeshBasicMaterial({
          map: tex, transparent: true, opacity: 0.35, depthWrite: false,
        });
      })
      .catch(() => {});

    // Atmosphere
    globe.add(new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS * 1.04, 48, 48),
      new THREE.ShaderMaterial({
        vertexShader: atmosVert,
        fragmentShader: atmosFrag,
        uniforms: {
          uSunDir: { value: sunDir },
          uGlowStrength: { value: 0.5 },
          uRimPower: { value: 5.0 },
          uAtmosDark: { value: new THREE.Color(0.1, 0.15, 0.4) },
          uAtmosLight: { value: new THREE.Color(0.3, 0.6, 1.0) },
        },
        transparent: true,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    ));

    // Stars
    const starGeo = new THREE.SphereGeometry(0.015, 4, 4);
    const starMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const stars = new THREE.InstancedMesh(starGeo, starMat, 200);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 200; i++) {
      const r = 6 + Math.random() * 4;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      dummy.position.set(
        r * Math.sin(ph) * Math.cos(th),
        r * Math.sin(ph) * Math.sin(th),
        r * Math.cos(ph),
      );
      dummy.updateMatrix();
      stars.setMatrixAt(i, dummy.matrix);
    }
    scene.add(stars);

    // Node markers
    const markerGroup = new THREE.Group();
    globe.add(markerGroup);

    interface MarkerEntry {
      pos: Vec3Tuple;
      color: number;
      isActive: boolean;
      nodeId: string;
      name: string;
      flag: string;
      cpu: string;
      mem: string;
      containers: number;
      ip: string;
      uptime: string;
      version: string;
    }

    let lastMarkersKey = '';
    let markerEntries: MarkerEntry[] = [];

    function toFlag(country: string): string {
      return [...country.toUpperCase()]
        .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
        .join('');
    }

    function syncMarkers() {
      const { nodeStatuses: ns, activeNodeId: activeId, hubNodeId: hubId } = propsRef.current;
      const entries: MarkerEntry[] = [];

      for (const { nodeId, status: s, isConnected } of ns) {
        if (!s?.node?.country) continue;
        const cc = COUNTRY_COORDS[s.node.country.toUpperCase()];
        if (!cc) continue;

        // Hub = green, Remote = purple, disconnected = gray
        const isHub = nodeId === hubId;
        const connectedColor = isHub ? 0x30d158 : 0x5e5ce6;

        entries.push({
          pos: latLonToPos(cc[0], cc[1], EARTH_RADIUS * 1.01),
          color: isConnected ? connectedColor : 0x666666,
          isActive: nodeId === activeId,
          nodeId,
          name: s.node.name ?? nodeId,
          flag: toFlag(s.node.country),
          cpu: `${s.system.cpu.usage_percent.toFixed(0)}%`,
          mem: `${s.system.memory.usage_percent.toFixed(0)}%`,
          containers: s.containers.running,
          ip: s.node.public_ip ?? '--',
          uptime: formatUptime(s.node.uptime),
          version: s.node.version ?? '',
        });
      }

      const key = entries.map(e => `${e.pos.join(',')}_${e.isActive}`).join(';');
      if (key === lastMarkersKey) return;
      lastMarkersKey = key;
      markerEntries = entries;

      while (markerGroup.children.length) {
        const c = markerGroup.children[0] as THREE.Mesh;
        markerGroup.remove(c);
        c.geometry.dispose();
        (c.material as THREE.Material).dispose();
      }
      for (const e of entries) {
        const m = new THREE.Mesh(
          new THREE.SphereGeometry(e.isActive ? 0.04 : 0.03, 8, 8),
          new THREE.MeshBasicMaterial({ color: e.color }),
        );
        m.position.set(...e.pos);
        markerGroup.add(m);
      }
    }
    syncMarkers();

    scene.add(new THREE.AmbientLight(0xffffff, 0.15));

    const camRadius = 9.0;
    // Pre-allocate reusable vectors — avoid GC pressure in hot loop
    const projVec = new THREE.Vector3();
    const dirVec = new THREE.Vector3();
    const R2 = EARTH_RADIUS * EARTH_RADIUS;
    let frameCount = 0;

    const animate = () => {
      requestAnimationFrame(animate);

      const vel = getVelocity();
      const rot = getRotation();
      rot.x += vel.x;
      rot.y += vel.y;
      rot.x = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, rot.x));
      vel.x *= 0.95;
      vel.y *= 0.95;

      camera.position.x = camRadius * Math.sin(rot.y) * Math.cos(rot.x);
      camera.position.y = camRadius * Math.sin(rot.x);
      camera.position.z = camRadius * Math.cos(rot.y) * Math.cos(rot.x);
      camera.lookAt(0, 0, 0);

      const t = Date.now() * 0.003;
      for (const m of markerGroup.children) m.scale.setScalar(1 + 0.3 * Math.sin(t));

      syncMarkers();

      // Sync billboard positions every 3rd frame (~20fps at 60fps) — avoids excessive setState
      if (++frameCount % 3 === 0) {
        camera.updateMatrixWorld();
        const newBillboards: BillboardData[] = [];
        const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;

        for (const entry of markerEntries) {
          projVec.set(...entry.pos);
          projVec.project(camera);

          const isBehind = projVec.z > 1;

          // Ray-sphere occlusion: cast ray from camera toward marker, test intersection with earth sphere
          dirVec.set(entry.pos[0] - cx, entry.pos[1] - cy, entry.pos[2] - cz);
          const tMarker = dirVec.length();
          dirVec.multiplyScalar(1 / tMarker); // normalize without creating new vec
          // Solve |camera + t*dir|² = R² → t²(dir·dir) + 2t(cam·dir) + (cam·cam - R²) = 0
          const b = cx * dirVec.x + cy * dirVec.y + cz * dirVec.z;
          const c = cx * cx + cy * cy + cz * cz - R2;
          const disc = b * b - c;
          const behindEarth = disc > 0 && (-b - Math.sqrt(disc)) < tMarker * 0.98;

          newBillboards.push({
            x: (projVec.x * 0.5 + 0.5) * 100,
            y: (-projVec.y * 0.5 + 0.5) * 100,
            visible: !isBehind && !behindEarth,
            name: entry.name,
            flag: entry.flag,
            cpu: entry.cpu,
            mem: entry.mem,
            containers: entry.containers,
            ip: entry.ip,
            uptime: entry.uptime,
            version: entry.version,
            isActive: entry.isActive,
            nodeId: entry.nodeId,
          });
        }
        setBillboards(newBillboards);
      }

      renderer.render(scene, camera);
      gl.endFrameEXP();
    };
    animate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={fullscreen ? styles.fullscreen : styles.container} {...panResponder.panHandlers}>
      <GLView style={styles.canvas} onContextCreate={onContextCreate} />
      {/* Billboard overlays */}
      {billboards.map((b, i) => (
        <TouchableOpacity
          key={i}
          activeOpacity={0.7}
          onPress={() => onNodeSelect?.(b.nodeId)}
          style={[
            styles.billboard,
            {
              left: `${b.x}%` as unknown as number,
              top: `${b.y}%` as unknown as number,
              opacity: b.visible ? 1 : 0,
            },
          ]}
        >
          <View style={[styles.billboardCard, b.isActive && styles.billboardCardActive]}>
            {/* Header */}
            <View style={styles.billboardHeader}>
              <View style={[styles.pingDot, { backgroundColor: b.isActive ? '#30d158' : '#888' }]} />
              <Text style={styles.billboardName} numberOfLines={1}>{b.name}</Text>
              {b.flag ? <Text style={styles.billboardFlag}>{b.flag}</Text> : null}
            </View>
            {/* Stats */}
            <View style={styles.billboardStats}>
              <View style={styles.billboardStat}>
                <Text style={styles.billboardValue}>{b.cpu}</Text>
                <Text style={styles.billboardLabel}>CPU</Text>
              </View>
              <View style={styles.billboardDivider} />
              <View style={styles.billboardStat}>
                <Text style={styles.billboardValue}>{b.mem}</Text>
                <Text style={styles.billboardLabel}>MEM</Text>
              </View>
              <View style={styles.billboardDivider} />
              <View style={styles.billboardStat}>
                <Text style={styles.billboardValue}>{b.containers}</Text>
                <Text style={styles.billboardLabel}>CTR</Text>
              </View>
            </View>
            {/* Footer: version + DNS address */}
            {(b.version || b.ip !== '--') ? (
              <View style={styles.billboardFooter}>
                {b.version ? <Text style={styles.billboardMeta}>{b.version}</Text> : null}
                {b.ip !== '--' ? <Text style={styles.billboardMeta} numberOfLines={1}>{b.ip}</Text> : null}
              </View>
            ) : null}
            {/* Arrow */}
            <View style={styles.billboardArrow} />
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

const styles = StyleSheet.create({
  container: {
    height: 260,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    position: 'relative',
  },
  fullscreen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  canvas: { flex: 1 },
  billboard: {
    position: 'absolute',
    transform: [{ translateX: -60 }, { translateY: -75 }],
  },
  billboardCard: {
    backgroundColor: 'rgba(20, 20, 30, 0.92)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    width: 120,
    alignItems: 'center',
  },
  billboardCardActive: {
    borderColor: 'rgba(48, 209, 88, 0.5)',
  },
  billboardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  pingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  billboardName: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  billboardFlag: {
    fontSize: 12,
  },
  billboardStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  billboardStat: {
    alignItems: 'center',
    flex: 1,
  },
  billboardValue: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  billboardLabel: {
    color: '#888',
    fontSize: 8,
  },
  billboardDivider: {
    width: 1,
    height: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  billboardFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 3,
  },
  billboardMeta: {
    color: '#666',
    fontSize: 8,
    fontFamily: 'monospace',
  },
  billboardArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 5,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'rgba(20, 20, 30, 0.92)',
    marginTop: -1,
    position: 'absolute',
    bottom: -5,
  },
});
