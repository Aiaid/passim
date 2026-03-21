import { useRef, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
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

    const sunDir = getSunDirection();

    // Earth — fallback color, then upgrade to shared day/night shader
    const earthMesh = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS, 48, 48),
      new THREE.MeshBasicMaterial({ color: 0x1a3a5c }),
    );
    globe.add(earthMesh);

    // Load 3 textures → shared earth shader (day/night + specular)
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

    // Atmosphere — shared atmos shader
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

    // Stars (InstancedMesh — expo-gl doesn't support GL_POINTS)
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

    // Camera orbits around the globe (like web version)
    const camRadius = 4.2;

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
