import * as THREE from "three";
import { createNoise2D, fbm, mulberry32, smoothstep, lerp } from "./noise.js";
import { createStylizedMaterial, shared } from "./shading.js";
import { AREAS } from "./layout.js";

export const WORLD_SIZE = 400;
export const GRID = 501;
export const SEA_FLOOR = -9;
export const BEACH_TOP = 1.9;
const TERRACE = 2.7;

function gauss(x, z, cx, cz, sigma) {
  const dx = x - cx;
  const dz = z - cz;
  return Math.exp(-(dx * dx + dz * dz) / (2 * sigma * sigma));
}

function terrace(h) {
  if (h < BEACH_TOP) return h;
  const t = (h - BEACH_TOP) / TERRACE;
  const level = Math.floor(t);
  const frac = t - level;
  return BEACH_TOP + (level + smoothstep(0.66, 0.9, frac)) * TERRACE;
}

function distanceToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lengthSq));
  const cx = ax + dx * t;
  const cz = az + dz * t;
  return Math.hypot(px - cx, pz - cz);
}

export function createTerrain() {
  const random = mulberry32(20261026);
  const warpNoise = createNoise2D(random);
  const hillNoise = createNoise2D(random);
  const pathNoise = createNoise2D(random);
  const half = WORLD_SIZE / 2;
  const cell = WORLD_SIZE / (GRID - 1);
  const count = GRID * GRID;

  const rawHeight = (x, z) => {
    const wx = x + fbm(warpNoise, x * 0.008 + 11, z * 0.008, 3) * 28;
    const wz = z + fbm(warpNoise, x * 0.008, z * 0.008 - 7, 3) * 28;
    const d = Math.hypot(wx * 0.95, wz * 1.12) / 122;
    let continent = 1 - smoothstep(0.22, 1.0, d);
    const lx = x + (wx - x) * 0.35;
    const lz = z + (wz - z) * 0.35;
    for (const area of AREAS) {
      const from = area.land.from ?? area;
      const distance = distanceToSegment(lx, lz, from.x, from.z, area.x, area.z) / area.land.width;
      continent = Math.max(continent, (1 - smoothstep(0.25, 1.0, distance)) * (area.land.strength ?? 1));
    }
    let h = SEA_FLOOR + continent * 15.5;
    const hills = fbm(hillNoise, x * 0.02, z * 0.02, 4) * 0.5 + 0.5;
    h += Math.pow(continent, 1.4) * hills * 2.4;
    const inland = smoothstep(0.2, 0.7, continent);
    h += gauss(x, z, -26, -30, 24) * 17 * inland;
    for (const area of AREAS) {
      if (!area.hill) continue;
      h += gauss(x, z, area.x, area.z, area.hill.sigma ?? 16) * area.hill.height * inland;
    }
    return h;
  };

  const raw = new Float32Array(count);
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      raw[j * GRID + i] = rawHeight(-half + i * cell, -half + j * cell);
    }
  }

  const findCoast = (fromX, fromZ, dirX, dirZ, level = 0) => {
    const length = Math.hypot(dirX, dirZ);
    const ux = dirX / length;
    const uz = dirZ / length;
    let lastLand = { x: fromX, z: fromZ };
    for (let s = 0; s < 260; s += 0.5) {
      const x = fromX + ux * s;
      const z = fromZ + uz * s;
      if (rawHeight(x, z) < level) return { x, z, ux, uz, inland: lastLand };
      lastLand = { x, z };
    }
    return { x: fromX, z: fromZ, ux, uz, inland: lastLand };
  };

  const spawn = { x: 6, z: 16 };
  const dockCoast = findCoast(spawn.x, spawn.z, 0.12, 1);
  const lighthouseCoast = findCoast(spawn.x, spawn.z, 0.75, 0.85);
  const lighthouse = {
    x: lighthouseCoast.x - lighthouseCoast.ux * 5,
    z: lighthouseCoast.z - lighthouseCoast.uz * 5,
  };
  const mountain = { x: -26, z: -30 };
  const dock = {
    x: dockCoast.x - dockCoast.ux * 3,
    z: dockCoast.z - dockCoast.uz * 3,
    dirX: dockCoast.ux,
    dirZ: dockCoast.uz,
    length: 26,
    width: 3.6,
  };

  const makePath = (a, b, seed, wobbleScale = 7) => {
    const points = [];
    const steps = 14;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    const px = -dz / length;
    const pz = dx / length;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const wobble = pathNoise(t * 2.4, seed) * wobbleScale * Math.sin(Math.PI * t);
      points.push({ x: a.x + dx * t + px * wobble, z: a.z + dz * t + pz * wobble });
    }
    return points;
  };

  const northRoadEnd = { x: spawn.x, z: spawn.z - 52 };
  const paths = [
    makePath({ x: spawn.x, z: spawn.z + 18 }, northRoadEnd, 0, 0),
    makePath(spawn, { x: dockCoast.x - dockCoast.ux * 5, z: dockCoast.z - dockCoast.uz * 5 }, 1.3),
    makePath(spawn, lighthouse, 4.7),
  ];

  const dockRoad = { x: dockCoast.x - dockCoast.ux * 5, z: dockCoast.z - dockCoast.uz * 5 };
  const roadStarts = { spawn, lighthouse, mountain: northRoadEnd, west: spawn, dock: dockRoad };
  let bridge = null;
  const areas = AREAS.map((definition, index) => {
    const start = roadStarts[definition.road.from];
    const area = { ...definition, entrance: null };
    let roadFrom = start;
    if (definition.road.bridge) {
      const out = findCoast(start.x, start.z, area.x - start.x, area.z - start.z, 1.1);
      const back = findCoast(area.x, area.z, start.x - area.x, start.z - area.z, 1.1);
      bridge = { a: out.inland, b: back.inland };
      paths.push(makePath(start, bridge.a, 20.3));
      roadFrom = bridge.b;
    }
    const dx = area.x - roadFrom.x;
    const dz = area.z - roadFrom.z;
    const length = Math.hypot(dx, dz);
    area.entrance = { x: area.x - (dx / length) * (area.radius + 1), z: area.z - (dz / length) * (area.radius + 1) };
    area.direction = { x: dx / length, z: dz / length };
    paths.push(
      makePath(
        roadFrom,
        { x: area.x - (dx / length) * (area.radius - 2), z: area.z - (dz / length) * (area.radius - 2) },
        30.7 + index * 6.1,
        definition.road.wobble ?? 7
      )
    );
    return area;
  });

  const zones = [
    { x: spawn.x, z: spawn.z, radius: 15, fade: 9 },
    { x: lighthouse.x, z: lighthouse.z, radius: 5, fade: 4, height: 1.55 },
    ...areas.map((area) => ({
      x: area.x,
      z: area.z,
      radius: area.radius + 2,
      fade: 9,
      minHeight: area.minHeight ?? 2.6,
      height: area.height,
    })),
  ];
  for (const zone of zones) {
    if (zone.height !== undefined) continue;
    const base = terrace(rawHeight(zone.x, zone.z));
    zone.height = Math.max(base, zone.minHeight ?? -Infinity);
  }
  for (const area of areas) {
    area.y = zones.find((zone) => zone.x === area.x && zone.z === area.z).height;
  }
  const pathBounds = paths.map((path) => {
    const xs = path.map((p) => p.x);
    const zs = path.map((p) => p.z);
    return { minX: Math.min(...xs) - 8, maxX: Math.max(...xs) + 8, minZ: Math.min(...zs) - 8, maxZ: Math.max(...zs) + 8 };
  });

  const heights = new Float32Array(count);
  const pathMask = new Float32Array(count);
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const index = j * GRID + i;
      const x = -half + i * cell;
      const z = -half + j * cell;
      const r = raw[index];
      let distance = Infinity;
      for (let n = 0; n < paths.length; n++) {
        const bounds = pathBounds[n];
        if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) continue;
        const path = paths[n];
        for (let p = 0; p < path.length - 1; p++) {
          distance = Math.min(distance, distanceToSegment(x, z, path[p].x, path[p].z, path[p + 1].x, path[p + 1].z));
        }
      }
      const onPath = r > 0.4 ? 1 - smoothstep(1.6, 3.4, distance) : 0;
      const roadBlend = 1 - smoothstep(2.5, 6.5, distance);
      let h = lerp(terrace(r), r, r > 0.4 ? roadBlend : 0);
      for (const zone of zones) {
        const d = Math.hypot(x - zone.x, z - zone.z);
        const w = 1 - smoothstep(zone.radius, zone.radius + zone.fade, d);
        h = lerp(h, zone.height, w);
      }
      heights[index] = h;
      pathMask[index] = onPath;
    }
  }

  const heightAtIndex = (i, j) => heights[Math.min(GRID - 1, Math.max(0, j)) * GRID + Math.min(GRID - 1, Math.max(0, i))];
  const grass = new Float32Array(count);
  const slope = new Float32Array(count);
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const index = j * GRID + i;
      const nx = (heightAtIndex(i - 1, j) - heightAtIndex(i + 1, j)) / (2 * cell);
      const nz = (heightAtIndex(i, j - 1) - heightAtIndex(i, j + 1)) / (2 * cell);
      const ny = 1 / Math.hypot(nx, 1, nz);
      slope[index] = 1 - ny;
      const x = -half + i * cell;
      const z = -half + j * cell;
      const h = heights[index];
      const patch = 0.82 + 0.18 * hillNoise(x * 0.07 + 40, z * 0.07);
      let pad = 0;
      for (const area of areas) {
        pad = Math.max(pad, 1 - smoothstep(area.radius - 0.5, area.radius + 0.6, Math.hypot(x - area.x, z - area.z)));
      }
      grass[index] = Math.min(1, smoothstep(BEACH_TOP - 0.1, BEACH_TOP + 0.7, h) * (1 - smoothstep(0.18, 0.32, slope[index])) * (1 - pathMask[index]) * (1 - pad) * patch);
    }
  }

  const sample = (array, x, z) => {
    const fx = (x + half) / cell;
    const fz = (z + half) / cell;
    if (fx < 0 || fz < 0 || fx >= GRID - 1 || fz >= GRID - 1) return array === heights ? SEA_FLOOR : 0;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const a = array[j * GRID + i];
    const b = array[j * GRID + i + 1];
    const c = array[(j + 1) * GRID + i];
    const d = array[(j + 1) * GRID + i + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  };

  const heightAt = (x, z) => sample(heights, x, z);
  const grassAt = (x, z) => sample(grass, x, z);
  const pathAt = (x, z) => sample(pathMask, x, z);
  const slopeAt = (x, z) => sample(slope, x, z);
  const gradientAt = (x, z, out = new THREE.Vector2()) => {
    const e = 0.6;
    out.set((heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e), (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e));
    return out;
  };

  const data = new Uint16Array(count * 4);
  for (let index = 0; index < count; index++) {
    data[index * 4] = THREE.DataUtils.toHalfFloat(heights[index]);
    data[index * 4 + 1] = THREE.DataUtils.toHalfFloat(grass[index]);
    data[index * 4 + 2] = THREE.DataUtils.toHalfFloat(pathMask[index]);
    data[index * 4 + 3] = THREE.DataUtils.toHalfFloat(slope[index]);
  }
  const texture = new THREE.DataTexture(data, GRID, GRID, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  shared.uTerrainData.value = texture;
  shared.uWorldSize.value = WORLD_SIZE;
  shared.uGrid.value = GRID;

  const positions = new Float32Array(count * 3);
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const index = j * GRID + i;
      positions[index * 3] = -half + i * cell;
      positions[index * 3 + 1] = heights[index];
      positions[index * 3 + 2] = -half + j * cell;
    }
  }
  const indices = new Uint32Array((GRID - 1) * (GRID - 1) * 6);
  let k = 0;
  for (let j = 0; j < GRID - 1; j++) {
    for (let i = 0; i < GRID - 1; i++) {
      const a = j * GRID + i;
      const b = a + 1;
      const c = a + GRID;
      const d = c + 1;
      indices[k++] = a;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = d;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const material = createStylizedMaterial({
    fragmentMain: /* glsl */ `
      vec4 data = terrainData(vWorldPosition.xz);
      float h = vWorldPosition.y;
      vec2 xz = vWorldPosition.xz;
      float edgeNoise = snoise(xz * 0.35) * 0.08;
      vec3 sand = mix(uSandWet, uSand, smoothstep(0.1, 1.0, h));
      sand *= 0.97 + 0.05 * snoise(xz * vec2(0.5, 1.3));
      float strata = smoothstep(0.46, 0.54, fract(h * 0.55 + snoise(xz * 0.05) * 0.3));
      vec3 rock = mix(uRockDark, uRock, strata);
      float highland = smoothstep(1.9, 2.6, h + edgeNoise * 4.0);
      vec3 base = mix(sand, mix(uDirt, rock, 0.55), highland);
      base = mix(base, grassColor(xz) * 0.84, smoothstep(0.4, 0.48, data.g + edgeNoise));
      float dirt = smoothstep(0.4, 0.5, data.b + edgeNoise);
      base = mix(base, uDirt * (0.95 + 0.07 * snoise(xz * 0.45)), dirt);
      float rockMix = (1.0 - smoothstep(0.72, 0.78, normal.y + edgeNoise)) * highland;
      base = mix(base, rock, rockMix);
      outColor = stylize(base, normal, vWorldPosition, 0.0, shadowMask);
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = true;

  return {
    mesh,
    texture,
    heightAt,
    grassAt,
    pathAt,
    slopeAt,
    gradientAt,
    features: { spawn, lighthouse, dock, mountain, paths, areas, bridge },
  };
}
