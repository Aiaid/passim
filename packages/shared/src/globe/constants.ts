export const COUNTRY_COORDS: Record<string, [number, number]> = {
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

export const TEX_DAY = 'https://unpkg.com/three-globe@2.41.2/example/img/earth-blue-marble.jpg';
export const TEX_NIGHT = 'https://unpkg.com/three-globe@2.41.2/example/img/earth-night.jpg';
export const TEX_SPEC = 'https://unpkg.com/three-globe@2.41.2/example/img/earth-water.png';
export const TEX_CLOUDS = 'https://raw.githubusercontent.com/turban/webgl-earth/master/images/fair_clouds_4k.png';

export const EARTH_RADIUS = 1.5;

export function countryFlag(code: string): string {
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

export function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}
