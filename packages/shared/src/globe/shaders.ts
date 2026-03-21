export const earthVert = /* glsl */ `
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

export const earthFrag = /* glsl */ `
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

    float diffuse = max(NdotL, 0.0);
    dayColor *= (0.45 + 0.55 * diffuse) * 1.35;

    float nightLum = dot(nightRaw, vec3(0.299, 0.587, 0.114));
    float cityMask = smoothstep(0.05, 0.2, nightLum);
    vec3 nightColor = nightRaw * vec3(1.1, 0.85, 0.95) * 3.0 * cityMask;

    float specMask = texture2D(uSpecMap, vUv).r;
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 H = normalize(uSunDir + V);
    float spec = pow(max(dot(N, H), 0.0), 120.0) * specMask * 0.3 * step(0.0, NdotL);

    vec3 color = mix(nightColor, dayColor, dayMix) + vec3(spec);

    float rim = 1.0 - max(dot(N, V), 0.0);
    color += vec3(0.3, 0.6, 1.0) * pow(rim, 5.0) * 0.08 * dayMix;

    color = max(color, vec3(uMinBrightness));

    gl_FragColor = vec4(color, 1.0);
  }
`;

export const atmosVert = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const atmosFrag = /* glsl */ `
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
