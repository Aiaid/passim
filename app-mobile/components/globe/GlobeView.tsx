import { useRef, useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer, loadTextureAsync } from 'expo-three';
import { Asset } from 'expo-asset';
import * as THREE from 'three';
import { earthVert, earthFrag, atmosVert, atmosFrag } from '@passim/shared/globe/shaders';
import { EARTH_RADIUS, COUNTRY_COORDS } from '@passim/shared/globe/constants';
import { resolveNodeCoords } from '@passim/shared/globe/clustering';
import { useGlobeGesture } from './use-globe-gesture';
import { getSunDirection } from './helpers';
import type { RemoteNode, StatusResponse } from '@passim/shared/types';

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
  type: 'local' | 'remote';
}

interface GlobeViewProps {
  localStatus?: StatusResponse | null;
  remoteNodes?: RemoteNode[];
  fullscreen?: boolean;
}

export function GlobeView({ localStatus, remoteNodes, fullscreen }: GlobeViewProps) {
  const { panResponder, getRotation, getVelocity } = useGlobeGesture();
  const propsRef = useRef({ localStatus, remoteNodes });
  propsRef.current = { localStatus, remoteNodes };

  const [billboards, setBillboards] = useState<BillboardData[]>([]);
  const billboardRef = useRef<BillboardData[]>([]);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });

  // Periodically sync projected billboard positions to React state
  useEffect(() => {
    const interval = setInterval(() => {
      setBillboards([...billboardRef.current]);
    }, 50); // 20fps for overlay updates
    return () => clearInterval(interval);
  }, []);

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
      type: 'local' | 'remote';
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

    function syncMarkers() {
      const { localStatus: ls, remoteNodes: rn } = propsRef.current;
      const entries: MarkerEntry[] = [];

      if (ls?.node?.country) {
        const cc = COUNTRY_COORDS[ls.node.country.toUpperCase()];
        if (cc) {
          const flag = [...ls.node.country.toUpperCase()]
            .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
            .join('');
          entries.push({
            pos: latLonToPos(cc[0], cc[1], EARTH_RADIUS * 1.01),
            color: 0x30d158,
            type: 'local',
            name: ls.node.name ?? 'Local',
            flag,
            cpu: `${ls.system.cpu.usage_percent.toFixed(0)}%`,
            mem: `${ls.system.memory.usage_percent.toFixed(0)}%`,
            containers: ls.containers.running,
            ip: ls.node.public_ip ?? '--',
            uptime: formatUptime(ls.node.uptime),
            version: ls.node.version ?? '',
          });
        }
      }

      if (rn) {
        for (const node of rn) {
          const coords = resolveNodeCoords(node);
          if (coords) {
            const flag = node.country
              ? [...node.country.toUpperCase()]
                  .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
                  .join('')
              : '';
            entries.push({
              pos: latLonToPos(coords[0], coords[1], EARTH_RADIUS * 1.01),
              color: 0xbf5af2,
              type: 'remote',
              name: node.name ?? node.id,
              flag,
              cpu: node.metrics ? `${node.metrics.cpu_percent.toFixed(0)}%` : '--',
              mem: node.metrics ? `${node.metrics.memory_percent.toFixed(0)}%` : '--',
              containers: node.metrics?.containers?.running ?? 0,
              ip: node.address ?? '--',
              uptime: '--',
              version: node.version ?? '',
            });
          }
        }
      }

      const key = entries.map(e => e.pos.join(',')).join(';');
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
          new THREE.SphereGeometry(0.03, 8, 8),
          new THREE.MeshBasicMaterial({ color: e.color }),
        );
        m.position.set(...e.pos);
        markerGroup.add(m);
      }
    }
    syncMarkers();

    scene.add(new THREE.AmbientLight(0xffffff, 0.15));

    const camRadius = 9.0;
    const projVec = new THREE.Vector3();

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

      // Project marker positions to screen coordinates for billboards
      const viewW = sizeRef.current.w;
      const viewH = sizeRef.current.h;
      // GLView pixel ratio: screen coords = projected * cssSize
      // We need CSS size, not drawingBuffer size
      const dpr = viewW > 0 ? viewW / (styles.canvas.flex * 1) : 1; // approximate

      camera.updateMatrixWorld();
      const newBillboards: BillboardData[] = [];
      for (const entry of markerEntries) {
        projVec.set(...entry.pos);
        projVec.project(camera);

        // Check if behind camera
        const isBehind = projVec.z > 1;
        // Check if occluded by earth (dot product between camera→marker and camera→origin)
        const markerVec = new THREE.Vector3(...entry.pos).sub(camera.position);
        const originVec = new THREE.Vector3(0, 0, 0).sub(camera.position);
        const markerDist = markerVec.length();
        const originDist = originVec.length();
        markerVec.normalize();
        originVec.normalize();
        const behindEarth = markerDist > originDist && markerVec.dot(originVec) > 0.85;

        newBillboards.push({
          // Map from NDC [-1,1] to container pixels [0, containerSize]
          // Container is 260px tall, width is full screen
          x: (projVec.x * 0.5 + 0.5) * 100, // percentage
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
          type: entry.type,
        });
      }
      billboardRef.current = newBillboards;

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
        <View
          key={i}
          pointerEvents="none"
          style={[
            styles.billboard,
            {
              left: `${b.x}%` as unknown as number,
              top: `${b.y}%` as unknown as number,
              opacity: b.visible ? 1 : 0,
            },
          ]}
        >
          <View style={styles.billboardCard}>
            {/* Header */}
            <View style={styles.billboardHeader}>
              <View style={[styles.pingDot, { backgroundColor: b.type === 'local' ? '#30d158' : '#bf5af2' }]} />
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
            {/* Arrow */}
            <View style={styles.billboardArrow} />
          </View>
        </View>
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
