import * as THREE from "three";

export const shared = {
  uTime: { value: 0 },
  uSunDirection: { value: new THREE.Vector3(0.45, 0.82, 0.35).normalize() },
  uLightColor: { value: new THREE.Color("#fff4e2") },
  uLightIntensity: { value: 1.15 },
  uShadowColor: { value: new THREE.Color("#7c6cf0") },
  uFogColor: { value: new THREE.Color("#bde8ff") },
  uFogNear: { value: 90 },
  uFogFar: { value: 380 },
  uRevealCenter: { value: new THREE.Vector2() },
  uRevealRadius: { value: 0 },
  uRevealColor: { value: new THREE.Color("#ffd27a") },
  uNight: { value: 0 },
  uIndoor: { value: 0 },
  uTerrainData: { value: null },
  uWorldSize: { value: 1 },
  uGrid: { value: 2 },
  uSand: { value: new THREE.Color("#f6dca4") },
  uSandWet: { value: new THREE.Color("#d9b47c") },
  uGrassA: { value: new THREE.Color("#8fd14f") },
  uGrassB: { value: new THREE.Color("#5fb342") },
  uGrassDry: { value: new THREE.Color("#c9cf5a") },
  uRock: { value: new THREE.Color("#a3a3bd") },
  uRockDark: { value: new THREE.Color("#7d7d9c") },
  uDirt: { value: new THREE.Color("#d8a86e") },
  uWaterShallow: { value: new THREE.Color("#8ff0dd") },
  uWaterMid: { value: new THREE.Color("#2ab7d6") },
  uWaterDeep: { value: new THREE.Color("#1a63c4") },
};

const COMMON_GLSL = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDirection;
uniform vec3 uLightColor;
uniform float uLightIntensity;
uniform vec3 uShadowColor;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform vec2 uRevealCenter;
uniform float uRevealRadius;
uniform vec3 uRevealColor;
uniform float uNight;
uniform float uIndoor;
uniform sampler2D uTerrainData;
uniform float uWorldSize;
uniform float uGrid;
uniform vec3 uSand;
uniform vec3 uSandWet;
uniform vec3 uGrassA;
uniform vec3 uGrassB;
uniform vec3 uGrassDry;
uniform vec3 uRock;
uniform vec3 uRockDark;
uniform vec3 uDirt;
uniform vec3 uWaterShallow;
uniform vec3 uWaterMid;
uniform vec3 uWaterDeep;

vec3 permute289(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute289(permute289(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

vec4 terrainData(vec2 xz) {
  vec2 uv = (xz / uWorldSize + 0.5) * ((uGrid - 1.0) / uGrid) + 0.5 / uGrid;
  return texture2D(uTerrainData, uv);
}

vec3 grassColor(vec2 xz) {
  float n = snoise(xz * 0.045) * 0.5 + 0.5;
  float dry = snoise(xz * 0.018 + 17.0) * 0.5 + 0.5;
  vec3 color = mix(uGrassA, uGrassB, smoothstep(0.25, 0.75, n));
  return mix(color, uGrassDry, smoothstep(0.62, 0.86, dry) * 0.7);
}
`;

const FRAGMENT_GLSL = /* glsl */ `
vec3 indoorStylize(vec3 base, vec3 normal, vec3 wp, float shadowMask) {
  // 1. Sculptural Key Light from the Overhead Oculus + Statue/Human Shadows
  vec3 keyDir = normalize(vec3(0.28, 0.88, -0.34));
  float ndl = dot(normal, keyDir);
  float keyDiffuse = smoothstep(-0.38, 0.72, ndl);
  float castShadow = (1.0 - shadowMask) * 0.55;
  float directFactor = clamp(keyDiffuse * (1.0 - castShadow), 0.14, 1.0);

  // 2. Overhead Oculus Sunbeam Pool (x=0, z=-3.2) & North Altar Sanctuary Glow (x=0, z=15.0)
  float oculusDist = length(wp.xz - vec2(0.0, -3.2));
  float oculusPool = smoothstep(8.8, 1.6, oculusDist) * (max(normal.y, 0.0) * 0.7 + 0.3);
  vec3 altarPos = vec3(0.0, 4.2, 15.2);
  float altarDist = length(wp - altarPos);
  float altarPool = smoothstep(14.5, 1.5, altarDist) * (max(dot(normal, normalize(altarPos - wp)), 0.0) * 0.65 + 0.35);

  // 3. Per-Lamp Point-Light Illumination for ALL 40 Sanctuary Lamps:
  //    - 10 Column Twin Sconces (x=±6.23, y=4.46, z=cellZ)
  //    - 14 Wall Pilaster Sconces (x=±13.88, y=4.55, z=pilasterZ)
  //    - 10 Side-Aisle Alcove Braziers (x=±14.85, y=3.22, z=alcoveZ)
  //    - 6 North Altar Candelabra Braziers (x=±[2.0, 3.1, 4.2], y=2.53, z=15.8)
  float sideX = wp.x >= 0.0 ? 1.0 : -1.0;
  float cellZ = clamp(floor((wp.z + 1.4) / 5.8 + 0.5) * 5.8 - 1.4, -13.0, 10.2);
  float pilasterZ = wp.z < -14.9 ? -16.8 : (wp.z > 13.1 ? 16.0 : cellZ);
  float alcoveZ = clamp(floor((wp.z - 1.5) / 5.8 + 0.5) * 5.8 + 1.5, -10.1, 13.1);
  float altarX = sideX * clamp(floor((abs(wp.x) - 2.0) / 1.1 + 0.5) * 1.1 + 2.0, 2.0, 4.2);
  float flicker = 0.94 + 0.06 * sin(uTime * 6.5 + wp.z * 1.7 + sideX);

  vec3 colTorch = vec3(sideX * 6.23, 4.46, cellZ);
  vec3 toCol = colTorch - wp;
  float dCol = length(toCol);
  float colLight = pow(clamp(1.0 - dCol / 9.2, 0.0, 1.0), 1.8) * (max(dot(normal, toCol / max(dCol, 0.001)), 0.0) * 0.72 + 0.28)
                 + smoothstep(2.8, 0.25, dCol) * 0.65;

  vec3 pilTorch = vec3(sideX * 13.88, 4.55, pilasterZ);
  vec3 toPil = pilTorch - wp;
  float dPil = length(toPil);
  float pilLight = pow(clamp(1.0 - dPil / 7.5, 0.0, 1.0), 1.85) * (max(dot(normal, toPil / max(dPil, 0.001)), 0.0) * 0.72 + 0.28)
                 + smoothstep(2.6, 0.25, dPil) * 0.65;

  vec3 alcTorch = vec3(sideX * 14.85, 3.22, alcoveZ);
  vec3 toAlc = alcTorch - wp;
  float dAlc = length(toAlc);
  float alcLight = pow(clamp(1.0 - dAlc / 7.2, 0.0, 1.0), 1.85) * (max(dot(normal, toAlc / max(dAlc, 0.001)), 0.0) * 0.75 + 0.25)
                 + smoothstep(2.5, 0.22, dAlc) * 0.70;

  vec3 altTorch = vec3(altarX, 2.53, 15.8);
  vec3 toAlt = altTorch - wp;
  float dAlt = length(toAlt);
  float altLight = pow(clamp(1.0 - dAlt / 7.8, 0.0, 1.0), 1.8) * (max(dot(normal, toAlt / max(dAlt, 0.001)), 0.0) * 0.72 + 0.28)
                 + smoothstep(2.6, 0.25, dAlt) * 0.68;

  // 4. Column Base Contact AO, Wall/Floor Corner AO & Coffered Ceiling Depth
  float distToColBase = length(wp.xz - vec2(sideX * 7.0, cellZ));
  float colBaseAO = smoothstep(2.3, 0.85, distToColBase) * smoothstep(1.6, 0.0, wp.y) * 0.36;
  float wallProximity = smoothstep(11.5, 14.9, abs(wp.x)) + smoothstep(14.5, 17.9, abs(wp.z));
  float floorCornerAO = smoothstep(1.6, 0.0, wp.y) * clamp(wallProximity, 0.0, 1.0) * 0.30;
  float ceilingAO = smoothstep(10.2, 13.4, wp.y) * (1.0 - smoothstep(6.5, 2.5, oculusDist)) * 0.28;
  float ao = clamp(1.0 - colBaseAO - floorCornerAO - ceilingAO, 0.46, 1.0);

  // 5. Blend Cool Architectural Shadow + Warm Sunlit Marble + Per-Lamp Golden Torchlight
  vec3 shadowTone = base * vec3(0.48, 0.52, 0.68);
  vec3 sunlitTone = base * vec3(1.08, 1.02, 0.92);
  vec3 color = mix(shadowTone, sunlitTone, directFactor) * ao;

  vec3 torchColor = vec3(1.0, 0.64, 0.22) * flicker;
  vec3 oculusColor = vec3(1.0, 0.93, 0.75);
  float totalLampLight = colLight * 0.68 + pilLight * 0.58 + alcLight * 0.62 + altLight * 0.65 + altarPool * 0.38;
  color += base * torchColor * totalLampLight;
  color += base * oculusColor * (oculusPool * 0.52);

  // 6. Specular Highlights on Polished Marble Floor & Fluted Columns
  vec3 viewDir = normalize(cameraPosition - wp);
  vec3 halfCol = normalize(normalize(toCol) + viewDir);
  float isFloor = smoothstep(0.7, 0.95, normal.y) * (1.0 - smoothstep(0.1, 1.3, wp.y));
  float shininess = mix(22.0, 42.0, isFloor);
  float specStrength = mix(0.22, 0.52, isFloor);
  float torchSpec = pow(max(dot(normal, halfCol), 0.0), shininess) * colLight * specStrength;
  vec3 halfOculus = normalize(keyDir + viewDir);
  float oculusSpec = pow(max(dot(normal, halfOculus), 0.0), 36.0) * oculusPool * isFloor * 0.45;
  color += torchColor * torchSpec + oculusColor * oculusSpec;

  return color;
}

vec3 stylize(vec3 base, vec3 normal, vec3 worldPosition, float extraShadow, float shadowMask) {
  if (uIndoor > 0.5) {
    return indoorStylize(base, normal, worldPosition, shadowMask);
  }
  float ndl = dot(normal, uSunDirection);
  float core = smoothstep(0.62, -0.2, ndl);
  float drop = 1.0 - shadowMask;
  float shade = clamp(max(max(core, drop * 0.92), extraShadow), 0.0, 1.0);
  vec3 lit = base * uLightColor * uLightIntensity;
  vec3 shadowTint = mix(vec3(dot(uShadowColor, vec3(0.3333))), uShadowColor, 0.55) * 1.25;
  vec3 dark = base * shadowTint * mix(0.85, 1.05, normal.y * 0.5 + 0.5);
  return mix(lit, dark, shade);
}

vec3 applyAtmosphere(vec3 color, vec3 worldPosition) {
  float revealDistance = distance(worldPosition.xz, uRevealCenter);
  if (revealDistance > uRevealRadius) discard;
  float fog = smoothstep(uFogNear, uFogFar, distance(cameraPosition, worldPosition));
  color = mix(color, uFogColor, fog);
  float edge = smoothstep(uRevealRadius - 1.8, uRevealRadius, revealDistance);
  return mix(color, uRevealColor * 1.6, edge);
}
`;

export { COMMON_GLSL };

export function createStylizedMaterial({
  uniforms = {},
  vertexPars = "",
  vertexMain = "",
  fragmentPars = "",
  fragmentMain = "outColor = stylize(vec3(1.0), normal, vWorldPosition, 0.0, shadowMask);",
  side = THREE.FrontSide,
  defines = {},
} = {}) {
  return new THREE.ShaderMaterial({
    lights: true,
    side,
    defines,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.lights),
      ...shared,
      ...uniforms,
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <shadowmap_pars_vertex>
      ${COMMON_GLSL}
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      ${vertexPars}
      void main() {
        #include <beginnormal_vertex>
        #include <begin_vertex>
        ${vertexMain}
        #include <defaultnormal_vertex>
        #include <project_vertex>
        #include <worldpos_vertex>
        #include <shadowmap_vertex>
        vec4 surfaceWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          surfaceWorld = instanceMatrix * surfaceWorld;
        #endif
        surfaceWorld = modelMatrix * surfaceWorld;
        vWorldPosition = surfaceWorld.xyz;
        vWorldNormal = inverseTransformDirection(transformedNormal, viewMatrix);
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <packing>
      #include <bsdfs>
      #include <lights_pars_begin>
      #include <shadowmap_pars_fragment>
      #include <shadowmask_pars_fragment>
      ${COMMON_GLSL}
      ${FRAGMENT_GLSL}
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      ${fragmentPars}
      void main() {
        vec3 normal = normalize(vWorldNormal);
        #if defined(DOUBLE_SIDED) && !defined(KEEP_NORMAL)
          normal *= gl_FrontFacing ? 1.0 : -1.0;
        #endif
        float shadowMask = getShadowMask();
        vec3 outColor = vec3(1.0);
        ${fragmentMain}
        outColor = applyAtmosphere(outColor, vWorldPosition);
        gl_FragColor = vec4(outColor, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

export function createSolidMaterial(color, options = {}) {
  return createStylizedMaterial({
    side: options.side,
    uniforms: { uColor: { value: new THREE.Color(color) } },
    fragmentPars: "uniform vec3 uColor;",
    fragmentMain: "outColor = stylize(uColor, normal, vWorldPosition, 0.0, shadowMask);",
  });
}

export function createEmissiveMaterial(color) {
  const material = createStylizedMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) } },
    fragmentPars: "uniform vec3 uColor;",
    fragmentMain: "outColor = uColor;",
  });
  material.color = material.uniforms.uColor.value;
  return material;
}

export function createTintedInstanceMaterial(options = {}) {
  return createStylizedMaterial({
    side: options.side,
    vertexPars: "attribute vec3 aTint; varying vec3 vTint;",
    vertexMain: "vTint = aTint;",
    fragmentPars: "varying vec3 vTint;",
    fragmentMain: "outColor = stylize(vTint, normal, vWorldPosition, 0.0, shadowMask);",
  });
}

export function setInstanceTints(geometry, colors) {
  const data = new Float32Array(colors.length * 3);
  colors.forEach((color, index) => color.toArray(data, index * 3));
  geometry.setAttribute("aTint", new THREE.InstancedBufferAttribute(data, 3));
}

export function flatten(geometry) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  flat.computeVertexNormals();
  return flat;
}
