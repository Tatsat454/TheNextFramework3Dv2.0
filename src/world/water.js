import * as THREE from "three";
import { createStylizedMaterial } from "./shading.js";

export function createWater() {
  const geometry = new THREE.PlaneGeometry(1600, 1600, 1, 1);
  geometry.rotateX(-Math.PI / 2);

  const material = createStylizedMaterial({
    fragmentMain: /* glsl */ `
      vec2 xz = vWorldPosition.xz;
      float ground = terrainData(xz).r;
      float depth = max(0.0, -ground);
      vec3 color = mix(uWaterShallow, uWaterMid, smoothstep(0.0, 1.7, depth));
      color = mix(color, uWaterDeep, smoothstep(1.5, 7.5, depth));

      float wobble = snoise(xz * 0.12 + uTime * 0.05);
      float bands = fract(depth * 0.7 - uTime * 0.3 + wobble * 0.3);
      float shoreZone = 1.0 - smoothstep(0.3, 2.6, depth);
      float foam = smoothstep(0.84, 0.88, bands) * shoreZone;
      foam = max(foam, 1.0 - smoothstep(0.04, 0.3, depth + wobble * 0.06));

      float ripple = snoise(xz * vec2(0.55, 1.1) + vec2(uTime * 0.45, -uTime * 0.3));
      float sparkle = smoothstep(0.8, 0.93, ripple) * smoothstep(1.2, 5.0, depth);
      color *= 0.96 + 0.06 * snoise(xz * 0.04 - uTime * 0.02);
      color = mix(color, vec3(1.0), foam * 0.88);

      outColor = stylize(color, vec3(0.0, 1.0, 0.0), vWorldPosition, 0.0, mix(1.0, shadowMask, 0.45));
      outColor += sparkle * uLightColor * uLightIntensity * 0.32;
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}
