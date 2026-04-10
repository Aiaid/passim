import { Fragment, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer, loadTextureAsync } from 'expo-three';
import { Asset } from 'expo-asset';
import * as THREE from 'three';
import { earthVert, earthFrag, atmosVert, atmosFrag } from '@passim/shared/globe/shaders';
import { EARTH_RADIUS, COUNTRY_COORDS } from '@passim/shared/globe/constants';
import { buildClusters, type NodeEntry } from '@passim/shared/globe/clustering';
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

// One node's display payload inside a cluster column.
interface MemberData {
  nodeId: string;
  name: string;
  flag: string;
  cpu: string;
  mem: string;
  containers: number;
  ip: string;
  version: string;
  color: number;   // marker colour in webgl (0xRRGGBB)
  dotColor: string; // matching CSS-like string for the billboard header dot
  isActive: boolean;
  isHub: boolean;
  isConnected: boolean;
}

// Per-cluster HTML overlay data. Multiple members render as multiple columns.
interface BillboardData {
  x: number;
  y: number;
  visible: boolean;
  hasActive: boolean;
  members: MemberData[];
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

    // One WebGL mesh per cluster centroid (not per node): nodes sharing a
    // coordinate collapse into a single dot with a combined billboard.
    interface ClusterMarker {
      pos: Vec3Tuple;
      members: MemberData[];
      hasActive: boolean;
      meshColor: number;  // dominant colour for the centroid dot
    }

    let lastMarkersKey = '';
    let clusterMarkers: ClusterMarker[] = [];

    function toFlag(country: string): string {
      return [...country.toUpperCase()]
        .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
        .join('');
    }

    function syncMarkers() {
      const { nodeStatuses: ns, activeNodeId: activeId, hubNodeId: hubId } = propsRef.current;
      const entries: NodeEntry<MemberData>[] = [];

      for (const { nodeId, status: s, isConnected } of ns) {
        if (!s?.node?.country) continue;
        const cc = COUNTRY_COORDS[s.node.country.toUpperCase()];
        if (!cc) continue;

        // Hub = green, Remote = purple, disconnected = gray
        const isHub = nodeId === hubId;
        const connectedColor = isHub ? 0x30d158 : 0x5e5ce6;
        const connectedDot = isHub ? '#30d158' : '#5e5ce6';

        entries.push({
          id: nodeId,
          lat: cc[0],
          lon: cc[1],
          data: {
            nodeId,
            name: s.node.name ?? nodeId,
            flag: toFlag(s.node.country),
            cpu: `${s.system.cpu.usage_percent.toFixed(0)}%`,
            mem: `${s.system.memory.usage_percent.toFixed(0)}%`,
            containers: s.containers.running,
            ip: s.node.public_ip ?? '--',
            version: s.node.version ?? '',
            color: isConnected ? connectedColor : 0x666666,
            dotColor: isConnected ? connectedDot : '#888',
            isActive: nodeId === activeId,
            isHub,
            isConnected,
          },
        });
      }

      // Collapse nearby nodes into clusters (threshold in angular degrees).
      const clusters = buildClusters(entries, 15);
      const next: ClusterMarker[] = clusters.map((c) => {
        const members = c.members.map((m) => m.data);
        // Prefer hub colour if any hub is in the cluster, otherwise pick the
        // first member's colour so the dot stays meaningful.
        const hub = members.find((m) => m.isHub && m.isConnected);
        const meshColor = hub?.color ?? members[0].color;
        return {
          pos: latLonToPos(c.centroid[0], c.centroid[1], EARTH_RADIUS * 1.01),
          members,
          hasActive: members.some((m) => m.isActive),
          meshColor,
        };
      });

      // Cheap identity key so we skip re-uploading geometry every frame.
      const key = next
        .map((c) => `${c.pos.join(',')}|${c.hasActive}|${c.members.map((m) => m.nodeId).join('+')}`)
        .join(';');
      if (key === lastMarkersKey) return;
      lastMarkersKey = key;
      clusterMarkers = next;

      while (markerGroup.children.length) {
        const c = markerGroup.children[0] as THREE.Mesh;
        markerGroup.remove(c);
        c.geometry.dispose();
        (c.material as THREE.Material).dispose();
      }
      for (const cm of clusterMarkers) {
        const m = new THREE.Mesh(
          new THREE.SphereGeometry(cm.hasActive ? 0.04 : 0.03, 8, 8),
          new THREE.MeshBasicMaterial({ color: cm.meshColor }),
        );
        m.position.set(...cm.pos);
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

        for (const cluster of clusterMarkers) {
          projVec.set(...cluster.pos);
          projVec.project(camera);

          const isBehind = projVec.z > 1;

          // Ray-sphere occlusion: cast ray from camera toward marker, test intersection with earth sphere
          dirVec.set(cluster.pos[0] - cx, cluster.pos[1] - cy, cluster.pos[2] - cz);
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
            hasActive: cluster.hasActive,
            members: cluster.members,
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
      {/* Billboard overlays — one card per cluster, multi-node = multi-column */}
      {billboards.map((b, i) => (
        <View
          key={i}
          pointerEvents={b.visible ? 'box-none' : 'none'}
          style={[
            styles.billboard,
            {
              left: `${b.x}%` as unknown as number,
              top: `${b.y}%` as unknown as number,
              opacity: b.visible ? 1 : 0,
            },
          ]}
        >
          <View style={[styles.billboardCard, b.hasActive && styles.billboardCardActive]}>
            {b.members.map((m, mi) => (
              <Fragment key={m.nodeId}>
                {mi > 0 && <View style={styles.billboardColSep} />}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => onNodeSelect?.(m.nodeId)}
                  style={styles.billboardCol}
                >
                  {/* Header */}
                  <View style={styles.billboardHeader}>
                    <View style={[styles.pingDot, { backgroundColor: m.dotColor }]} />
                    <Text style={styles.billboardName} numberOfLines={1}>{m.name}</Text>
                    {m.flag ? <Text style={styles.billboardFlag}>{m.flag}</Text> : null}
                  </View>
                  {m.isConnected ? (
                    <>
                      {/* Stats */}
                      <View style={styles.billboardStats}>
                        <View style={styles.billboardStat}>
                          <Text style={styles.billboardValue} numberOfLines={1}>{m.cpu}</Text>
                          <Text style={styles.billboardLabel}>CPU</Text>
                        </View>
                        <View style={styles.billboardDivider} />
                        <View style={styles.billboardStat}>
                          <Text style={styles.billboardValue} numberOfLines={1}>{m.mem}</Text>
                          <Text style={styles.billboardLabel}>MEM</Text>
                        </View>
                        <View style={styles.billboardDivider} />
                        <View style={styles.billboardStat}>
                          <Text style={styles.billboardValue} numberOfLines={1}>{m.containers}</Text>
                          <Text style={styles.billboardLabel}>CTR</Text>
                        </View>
                      </View>
                      {/* Footer: version + address */}
                      {(m.version || m.ip !== '--') ? (
                        <View style={styles.billboardFooter}>
                          {m.version ? <Text style={styles.billboardMeta}>{m.version}</Text> : null}
                          {m.ip !== '--' ? <Text style={styles.billboardMeta} numberOfLines={1}>{m.ip}</Text> : null}
                        </View>
                      ) : null}
                    </>
                  ) : (
                    <View style={styles.billboardOfflineRow}>
                      <Text style={styles.billboardOfflineText}>offline</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </Fragment>
            ))}
            {/* Arrow */}
            <View style={styles.billboardArrow} />
          </View>
        </View>
      ))}
    </View>
  );
}

const BILLBOARD_COL_WIDTH = 108;

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
    // Anchor the arrow tip roughly at the marker. translateX centred in
    // onLayout would be more accurate but costs extra renders — half the
    // single-column width is a good-enough default for 1–3 nodes.
    transform: [{ translateX: -BILLBOARD_COL_WIDTH / 2 }, { translateY: -75 }],
  },
  billboardCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(10, 14, 20, 0.92)',
    borderRadius: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'stretch',
  },
  billboardCardActive: {
    borderColor: 'rgba(48, 209, 88, 0.5)',
  },
  billboardCol: {
    paddingHorizontal: 10,
    width: BILLBOARD_COL_WIDTH,
    alignItems: 'center',
  },
  billboardColSep: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  billboardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
    width: '100%',
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
    paddingVertical: 3,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    alignSelf: 'stretch',
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
  billboardOfflineRow: {
    paddingTop: 6,
    alignItems: 'center',
  },
  billboardOfflineText: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: 9,
  },
  billboardArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 5,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'rgba(10, 14, 20, 0.92)',
    marginTop: -1,
    position: 'absolute',
    bottom: -5,
    left: '50%',
    marginLeft: -5,
  },
});
