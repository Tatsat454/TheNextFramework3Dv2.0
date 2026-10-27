import * as THREE from "three";
import { createStylizedMaterial } from "./shading.js";

export function createGrass() {
  const subdivisions = 330;
  const size = 88;
  const count = subdivisions * subdivisions;
  const fragment = size / subdivisions;
  const positions = new Float32Array(count * 9);
  const randomness = new Float32Array(count * 3);
  const corners = new Float32Array(count * 3);

  let blade = 0;
  for (let ix = 0; ix < subdivisions; ix++) {
    for (let iz = 0; iz < subdivisions; iz++) {
      const x = (ix / subdivisions - 0.5) * size + fragment * 0.5 + (Math.random() - 0.5) * fragment;
      const z = (iz / subdivisions - 0.5) * size + fragment * 0.5 + (Math.random() - 0.5) * fragment;
      const r = Math.random();
      for (let corner = 0; corner < 3; corner++) {
        const v = blade * 3 + corner;
        positions[v * 3] = x;
        positions[v * 3 + 2] = z;
        randomness[v] = r;
        corners[v] = corner;
      }
      blade++;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aRand", new THREE.BufferAttribute(randomness, 1));
  geometry.setAttribute("aCorner", new THREE.BufferAttribute(corners, 1));

  const uniforms = {
    uCenter: { value: new THREE.Vector2() },
    uSize: { value: size },
    uCar: { value: new THREE.Vector3(9999, 0, 9999) },
    uBladeHeight: { value: 0.8 },
    uBladeWidth: { value: 0.085 },
  };

  const material = createStylizedMaterial({
    side: THREE.DoubleSide,
    defines: { KEEP_NORMAL: "" },
    uniforms,
    vertexPars: /* glsl */ `
      attribute float aRand;
      attribute float aCorner;
      uniform vec2 uCenter;
      uniform float uSize;
      uniform vec3 uCar;
      uniform float uBladeHeight;
      uniform float uBladeWidth;
      varying float vTip;
      varying vec2 vRoot;
    `,
    vertexMain: /* glsl */ `
      float halfSize = uSize * 0.5;
      vec2 offset = position.xz - uCenter;
      offset = mod(offset + halfSize, uSize) - halfSize;
      vec2 root = offset + uCenter;
      vec4 data = terrainData(root);
      float grassAmount = smoothstep(0.44, 0.62, data.g);
      float edgeFade = 1.0 - smoothstep(0.62, 1.0, length(offset) / halfSize);
      float patchy = snoise(root * 0.05) * 0.5 + 0.5;
      float height = uBladeHeight * (0.5 + aRand * 0.6) * (0.6 + patchy * 0.75) * grassAmount * edgeFade;

      vec2 toCamera = normalize(cameraPosition.xz - root + vec2(0.0001));
      vec2 side = vec2(-toCamera.y, toCamera.x);
      float tip = step(aCorner, 0.5);
      float sideSign = aCorner < 0.5 ? 0.0 : (aCorner < 1.5 ? 1.0 : -1.0);

      vec3 p = vec3(root.x, data.r - 0.02, root.y);
      p.xz += side * sideSign * uBladeWidth * grassAmount * edgeFade;

      float gust = snoise(root * 0.03 + vec2(uTime * 0.5, uTime * 0.22)) * 0.5 + 0.5;
      vec2 wind = normalize(vec2(1.0, 0.35)) * (0.2 + gust * 0.95);
      wind += vec2(sin(uTime * 2.4 + aRand * 6.28), cos(uTime * 1.9 + aRand * 6.28)) * 0.1;

      vec2 away = root - uCar.xz;
      float carDistance = length(away);
      float push = (1.0 - smoothstep(0.4, 2.8, carDistance)) * (1.0 - step(2.5, abs(uCar.y - data.r)));
      wind += normalize(away + vec2(0.0001)) * push * 2.2;

      p.xz += wind * height * tip * 0.55;
      p.y += height * tip * (1.0 - push * 0.55);

      vTip = tip;
      vRoot = root;
      transformed = p;
      objectNormal = vec3(0.0, 1.0, 0.0);
    `,
    fragmentPars: /* glsl */ `
      varying float vTip;
      varying vec2 vRoot;
    `,
    fragmentMain: /* glsl */ `
      vec3 base = grassColor(vRoot) * mix(0.74, 1.18, vTip);
      outColor = stylize(base, vec3(0.0, 1.0, 0.0), vWorldPosition, (1.0 - vTip) * 0.32, shadowMask);
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;

  return {
    mesh,
    update(center, car) {
      uniforms.uCenter.value.set(center.x, center.z);
      uniforms.uCar.value.copy(car);
    },
  };
}
