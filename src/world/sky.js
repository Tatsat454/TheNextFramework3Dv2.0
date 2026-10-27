import * as THREE from "three";
import { shared } from "./shading.js";

export function createSky() {
  const uniforms = {
    uZenith: { value: new THREE.Color("#3d8ff0") },
    uHorizon: { value: new THREE.Color("#bde8ff") },
    uSunColor: { value: new THREE.Color("#fff8dc") },
    uSunDirection: shared.uSunDirection,
    uNight: shared.uNight,
    uTime: shared.uTime,
  };

  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vDirection;
      void main() {
        vDirection = position;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uSunColor;
      uniform vec3 uSunDirection;
      uniform float uNight;
      uniform float uTime;
      varying vec3 vDirection;

      float hash(vec3 p) {
        return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
      }

      void main() {
        vec3 direction = normalize(vDirection);
        float t = smoothstep(-0.02, 0.6, direction.y);
        vec3 color = mix(uHorizon, uZenith, pow(t, 0.85));
        float sun = max(dot(direction, uSunDirection), 0.0);
        color += uSunColor * (pow(sun, 10.0) * 0.16 + pow(sun, 120.0) * 0.45);
        color = mix(color, uSunColor * 1.15, smoothstep(0.9988, 0.9993, sun));

        vec3 starSpace = direction * 140.0;
        vec3 cell = floor(starSpace);
        float starSeed = hash(cell);
        float star = step(0.982, starSeed) * smoothstep(0.32, 0.0, length(fract(starSpace) - 0.5));
        star *= 0.6 + 0.4 * sin(uTime * 3.0 + starSeed * 60.0);
        color += star * uNight * t * 1.4;

        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return { mesh, uniforms };
}
