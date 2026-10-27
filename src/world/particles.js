import * as THREE from "three";
import { shared } from "./shading.js";

export function createParticles(capacity = 1400) {
  const positions = new Float32Array(capacity * 3);
  const colors = new Float32Array(capacity * 3);
  const sizes = new Float32Array(capacity);
  const alphas = new Float32Array(capacity);
  const velocities = new Float32Array(capacity * 3);
  const ages = new Float32Array(capacity).fill(1);
  const lifetimes = new Float32Array(capacity).fill(1);
  const baseSizes = new Float32Array(capacity);
  const gravities = new Float32Array(capacity);
  let cursor = 0;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    uniforms: {
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uLightColor: shared.uLightColor,
      uShadowColor: shared.uShadowColor,
    },
    vertexShader: /* glsl */ `
      uniform float uPixelRatio;
      attribute float aSize;
      attribute float aAlpha;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = aSize * 220.0 * uPixelRatio / -mvPosition.z;
        vColor = color;
        vAlpha = aAlpha;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uLightColor;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float d = length(p);
        if (d > 0.5) discard;
        float shade = smoothstep(0.5, -0.2, p.x - p.y);
        vec3 color = vColor * mix(0.78, 1.08, shade) * mix(vec3(1.0), uLightColor, 0.4);
        gl_FragColor = vec4(color, vAlpha * smoothstep(0.5, 0.38, d));
        #include <colorspace_fragment>
      }
    `,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 2;

  const scratch = new THREE.Color();

  return {
    points,
    emit({ position, velocity, color, size = 0.6, life = 0.8, gravity = -2, spread = 0.4, count = 1 }) {
      scratch.set(color);
      for (let n = 0; n < count; n++) {
        const i = cursor;
        cursor = (cursor + 1) % capacity;
        positions[i * 3] = position.x + (Math.random() - 0.5) * spread;
        positions[i * 3 + 1] = position.y + Math.random() * spread * 0.5;
        positions[i * 3 + 2] = position.z + (Math.random() - 0.5) * spread;
        velocities[i * 3] = velocity.x + (Math.random() - 0.5) * 1.5;
        velocities[i * 3 + 1] = velocity.y + Math.random() * 1.2;
        velocities[i * 3 + 2] = velocity.z + (Math.random() - 0.5) * 1.5;
        const tint = 0.92 + Math.random() * 0.16;
        colors[i * 3] = scratch.r * tint;
        colors[i * 3 + 1] = scratch.g * tint;
        colors[i * 3 + 2] = scratch.b * tint;
        baseSizes[i] = size * (0.7 + Math.random() * 0.6);
        lifetimes[i] = life * (0.7 + Math.random() * 0.6);
        gravities[i] = gravity;
        ages[i] = 0;
      }
    },
    update(dt) {
      for (let i = 0; i < capacity; i++) {
        if (ages[i] >= lifetimes[i]) {
          if (alphas[i] !== 0) {
            alphas[i] = 0;
            sizes[i] = 0;
          }
          continue;
        }
        ages[i] += dt;
        const t = Math.min(1, ages[i] / lifetimes[i]);
        const drag = Math.exp(-2.2 * dt);
        velocities[i * 3] *= drag;
        velocities[i * 3 + 1] = velocities[i * 3 + 1] * drag + gravities[i] * dt;
        velocities[i * 3 + 2] *= drag;
        positions[i * 3] += velocities[i * 3] * dt;
        positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
        positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
        sizes[i] = baseSizes[i] * (0.6 + Math.sin(Math.min(1, t * 1.4) * Math.PI * 0.5) * 0.8) * (1 - t * 0.5);
        alphas[i] = 1 - t * t;
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
      geometry.attributes.aSize.needsUpdate = true;
      geometry.attributes.aAlpha.needsUpdate = true;
    },
  };
}

export function createFireflies({ terrain, random, count = 640 }) {
  const positions = [];
  const phases = [];
  for (let attempt = 0; attempt < count * 40 && positions.length / 3 < count; attempt++) {
    const x = (random() - 0.5) * 360;
    const z = (random() - 0.5) * 360;
    if (terrain.grassAt(x, z) < 0.5) continue;
    positions.push(x, terrain.heightAt(x, z) + 0.6 + random() * 2.2, z);
    phases.push(random() * Math.PI * 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aPhase", new THREE.Float32BufferAttribute(phases, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: shared.uTime, uNight: shared.uNight, uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uPixelRatio;
      attribute float aPhase;
      varying float vBlink;
      void main() {
        vec3 p = position;
        p.x += sin(uTime * 0.6 + aPhase * 3.0) * 1.2;
        p.y += sin(uTime * 0.9 + aPhase) * 0.5;
        p.z += cos(uTime * 0.5 + aPhase * 2.0) * 1.2;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        vBlink = smoothstep(0.2, 1.0, sin(uTime * 2.3 + aPhase * 5.0) * 0.5 + 0.5);
        gl_PointSize = 34.0 * uPixelRatio / -mvPosition.z;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uNight;
      varying float vBlink;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float glow = pow(max(0.0, 1.0 - d * 2.0), 2.0);
        gl_FragColor = vec4(vec3(0.85, 1.0, 0.45) * glow * vBlink * uNight * 1.4, 1.0);
      }
    `,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}
