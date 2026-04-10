import type { RemoteNode } from '../types';
import { COUNTRY_COORDS } from './constants';

/**
 * Generic node entry for clustering.
 *
 * The `data` payload is untyped by the clustering algorithm — consumers on web
 * and mobile use different node shapes (StatusResponse vs. a normalized view),
 * so we make the payload a free-form generic parameter.
 */
export interface NodeEntry<T = unknown> {
  id: string;
  lat: number;
  lon: number;
  data: T;
}

export interface NodeCluster<T = unknown> {
  centroid: [number, number];
  members: NodeEntry<T>[];
}

function angularDist(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

/**
 * Greedy clustering: for each ungrouped entry, pull in every other ungrouped
 * entry within `threshold` angular degrees of any existing cluster member.
 * Returns clusters whose `centroid` is the arithmetic mean of the members.
 */
export function buildClusters<T>(entries: NodeEntry<T>[], threshold = 15): NodeCluster<T>[] {
  const used = new Set<number>();
  const clusters: NodeCluster<T>[] = [];

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
