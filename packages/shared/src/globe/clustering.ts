import type { RemoteNode, StatusResponse } from '../types';
import { COUNTRY_COORDS } from './constants';

export interface NodeEntry {
  id: string;
  lat: number;
  lon: number;
  type: 'local' | 'remote';
  localData?: StatusResponse;
  remoteData?: RemoteNode;
}

export interface NodeCluster {
  centroid: [number, number];
  members: NodeEntry[];
}

function angularDist(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

export function buildClusters(entries: NodeEntry[], threshold = 15): NodeCluster[] {
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

export function resolveNodeCoords(node: RemoteNode): [number, number] | null {
  if (node.latitude != null && node.longitude != null) return [node.latitude, node.longitude];
  if (node.country) {
    const cc = COUNTRY_COORDS[node.country.toUpperCase()];
    if (cc) return cc;
  }
  return null;
}
