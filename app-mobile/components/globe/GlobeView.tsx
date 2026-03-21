import { useRef, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer, loadTextureAsync } from 'expo-three';
import { Asset } from 'expo-asset';
import * as THREE from 'three';
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

interface GlobeViewProps {
  localStatus?: StatusResponse | null;
  remoteNodes?: RemoteNode[];
}

export function GlobeView({ localStatus, remoteNodes }: GlobeViewProps) {
  const { panResponder, getRotation, getVelocity } = useGlobeGesture();
  const propsRef = useRef({ localStatus, remoteNodes });
  propsRef.current = { localStatus, remoteNodes };

  const onContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    const renderer = new Renderer({ gl });
    renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
    renderer.setClearColor(0x000000, 1);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      45, gl.drawingBufferWidth / gl.drawingBufferHeight, 0.1, 100,
    );
    camera.position.set(0, 0, 4.2);

    const globe = new THREE.Group();
    scene.add(globe);

    // Earth
    const earthMesh = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS, 48, 48),
      new THREE.MeshBasicMaterial({ color: 0x1a3a5c }),
    );
    globe.add(earthMesh);

    // Load earth texture via expo-asset + expo-three
    Asset.fromURI('https://unpkg.com/three-globe@2.41.2/example/img/earth-blue-marble.jpg')
      .downloadAsync()
      .then((asset) => loadTextureAsync({ asset }))
      .then((tex: THREE.Texture) => {
        earthMesh.material.dispose();
        earthMesh.material = new THREE.MeshBasicMaterial({ map: tex });
      })
      .catch(() => { /* keep fallback color */ });

    // Atmosphere
    globe.add(new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS * 1.08, 48, 48),
      new THREE.MeshBasicMaterial({
        color: 0x4488ff, transparent: true, opacity: 0.08,
        side: THREE.BackSide, depthWrite: false,
      }),
    ));

    // Stars (InstancedMesh — expo-gl doesn't support GL_POINTS)
    const starGeo = new THREE.SphereGeometry(0.015, 4, 4);
    const starMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const starCount = 200;
    const stars = new THREE.InstancedMesh(starGeo, starMat, starCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < starCount; i++) {
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
    let lastMarkersKey = '';

    function syncMarkers() {
      const { localStatus: ls, remoteNodes: rn } = propsRef.current;
      const entries: { pos: Vec3Tuple; color: number }[] = [];
      if (ls?.node?.country) {
        const cc = COUNTRY_COORDS[ls.node.country.toUpperCase()];
        if (cc) entries.push({ pos: latLonToPos(cc[0], cc[1], EARTH_RADIUS * 1.01), color: 0x30d158 });
      }
      if (rn) {
        for (const node of rn) {
          const coords = resolveNodeCoords(node);
          if (coords) entries.push({ pos: latLonToPos(coords[0], coords[1], EARTH_RADIUS * 1.01), color: 0xbf5af2 });
        }
      }
      const key = entries.map(e => e.pos.join(',')).join(';');
      if (key === lastMarkersKey) return;
      lastMarkersKey = key;
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

    const animate = () => {
      requestAnimationFrame(animate);

      const vel = getVelocity();
      const rot = getRotation();
      rot.x += vel.x;
      rot.y += vel.y;
      rot.x = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, rot.x));
      vel.x *= 0.95;
      vel.y *= 0.95;
      globe.rotation.x = rot.x;
      globe.rotation.y = rot.y;

      // Pulse markers
      const t = Date.now() * 0.003;
      for (const m of markerGroup.children) m.scale.setScalar(1 + 0.3 * Math.sin(t));

      syncMarkers();
      renderer.render(scene, camera);
      gl.endFrameEXP();
    };
    animate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <GLView style={styles.canvas} onContextCreate={onContextCreate} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 260,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  canvas: { flex: 1 },
});
