import * as THREE from 'three';
import { EARTH_RADIUS } from '@passim/shared/globe/constants';

export function latLonToVec3(lat: number, lon: number, radius = EARTH_RADIUS): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

export function getSunDirection(): THREE.Vector3 {
  const now = new Date();
  const hours = now.getUTCHours() + now.getUTCMinutes() / 60;
  const angle = ((hours - 12) / 24) * Math.PI * 2;
  return new THREE.Vector3(Math.cos(angle), 0.2, Math.sin(angle)).normalize();
}
