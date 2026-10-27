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
vec3 stylize(vec3 base, vec3 normal, vec3 worldPosition, float extraShadow, float shadowMask) {
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
