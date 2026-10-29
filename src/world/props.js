import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { BEACH_TOP } from "./terrain.js";
import {
  createEmissiveMaterial,
  createSolidMaterial,
  createTintedInstanceMaterial,
  flatten,
  setInstanceTints,
  shared,
} from "./shading.js";

function jitteredRock(random, detail) {
  const geometry = new THREE.IcosahedronGeometry(1, detail);
  const position = geometry.attributes.position;
  const vertex = new THREE.Vector3();
  const seen = new Map();
  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i);
    const key = `${vertex.x.toFixed(3)},${vertex.y.toFixed(3)},${vertex.z.toFixed(3)}`;
    if (!seen.has(key)) seen.set(key, 0.78 + random() * 0.4);
    vertex.multiplyScalar(seen.get(key));
    vertex.y *= 0.78;
    position.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }
  return flatten(geometry);
}

function createRocks({ terrain, random, colliders, avoid }) {
  const group = new THREE.Group();
  const rocks = [];
  const paths = terrain.features?.paths ?? [];
  const blocked = (x, z, pad = 0) => avoid.some((zone) => Math.hypot(x - zone.x, z - zone.z) < zone.radius + pad);
  const nearPath = (x, z, minDist) =>
    paths.some((path) =>
      path.some((pt) => Math.hypot(x - pt.x, z - pt.z) < minDist)
    );
  const tooClose = (x, z, scale) =>
    rocks.some((r) => Math.hypot(x - r.x, z - r.z) < (r.scale + scale) * 1.45 + 0.8);

  for (let attempt = 0; attempt < 30000 && rocks.length < 520; attempt++) {
    const x = (random() - 0.5) * 370;
    const z = (random() - 0.5) * 370;
    const h = terrain.heightAt(x, z);
    if (blocked(x, z, 2.0) || terrain.pathAt(x, z) > 0.02) continue;
    const slope = terrain.slopeAt(x, z);
    let scale = 0;
    if (h > -3.5 && h < -0.6 && random() < 0.06) scale = 1.6 + random() * 2.6;
    else if (h >= 0 && h < BEACH_TOP && random() < 0.08) scale = 0.35 + random() * 0.7;
    else if (h >= BEACH_TOP && slope > 0.32 && random() < 0.16) scale = 0.6 + random() * 1.1;
    else if (h >= BEACH_TOP && random() < 0.01) scale = 0.4 + random() * 0.6;
    if (!scale) continue;
    if (blocked(x, z, scale * 1.5 + 2.5) || nearPath(x, z, scale * 1.4 + 4.8) || tooClose(x, z, scale)) continue;
    rocks.push({ x, z, y: h, scale, rotation: random() * Math.PI * 2, tilt: (random() - 0.5) * 0.5 });
    if (scale > 0.7) colliders.push({ x, z, radius: scale * 0.85, height: h + scale * 1.1 });
  }

  const variants = [jitteredRock(random, 0), jitteredRock(random, 1)];
  const palette = ["#a5a3c2", "#9496b4", "#b3b0c9", "#8b8aa8"].map((c) => new THREE.Color(c));
  variants.forEach((geometry, variantIndex) => {
    const list = rocks.filter((_, index) => index % 2 === variantIndex);
    const mesh = new THREE.InstancedMesh(geometry, createTintedInstanceMaterial(), list.length);
    const dummy = new THREE.Object3D();
    const tints = [];
    list.forEach((rock, index) => {
      dummy.position.set(rock.x, rock.y + rock.scale * 0.25, rock.z);
      dummy.rotation.set(rock.tilt, rock.rotation, rock.tilt * 0.5);
      dummy.scale.set(rock.scale * (0.9 + random() * 0.4), rock.scale * (0.9 + random() * 0.5), rock.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      tints.push(palette[Math.floor(random() * palette.length)]);
    });
    setInstanceTints(geometry, tints);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  });
  return group;
}

function createLighthouse({ x, z, y }, colliders) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  const white = createSolidMaterial("#f6f1e7");
  const red = createSolidMaterial("#ec5a4f");
  const dark = createSolidMaterial("#3b3f5c");

  const base = new THREE.Mesh(flatten(new THREE.CylinderGeometry(3.2, 3.6, 1.2, 10)), createSolidMaterial("#b9b4c9"));
  base.position.y = 0.4;
  group.add(base);
  const stripes = 5;
  for (let i = 0; i < stripes; i++) {
    const bottom = 1.9 - i * 0.12;
    const top = 1.9 - (i + 1) * 0.12;
    const segment = new THREE.Mesh(flatten(new THREE.CylinderGeometry(top, bottom, 2, 12)), i % 2 === 0 ? white : red);
    segment.position.y = 2 + i * 2;
    group.add(segment);
  }
  const gallery = new THREE.Mesh(flatten(new THREE.CylinderGeometry(1.9, 1.9, 0.35, 12)), dark);
  gallery.position.y = 11.1;
  group.add(gallery);

  const lampMaterial = createEmissiveMaterial("#fff3b0");
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 1.5, 12), lampMaterial);
  lamp.position.y = 12;
  group.add(lamp);
  const roof = new THREE.Mesh(flatten(new THREE.ConeGeometry(1.5, 1.6, 12)), red);
  roof.position.y = 13.5;
  group.add(roof);

  const beamMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uNight: shared.uNight },
    vertexShader: /* glsl */ `
      varying float vAlong;
      void main() {
        vAlong = uv.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uNight;
      varying float vAlong;
      void main() {
        float alpha = pow(vAlong, 2.2) * uNight * 0.55;
        gl_FragColor = vec4(vec3(1.0, 0.92, 0.6) * alpha, 1.0);
      }
    `,
  });
  const beamGeometry = new THREE.ConeGeometry(4.5, 46, 24, 1, true);
  beamGeometry.translate(0, -23, 0);
  beamGeometry.rotateZ(Math.PI / 2);
  const beams = new THREE.Group();
  beams.position.y = 12;
  const beamA = new THREE.Mesh(beamGeometry, beamMaterial);
  const beamB = beamA.clone();
  beamB.rotation.y = Math.PI;
  beams.add(beamA, beamB);
  group.add(beams);

  group.traverse((child) => {
    if (child.isMesh && child.material !== beamMaterial && child !== lamp) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  colliders.push({ x, z, radius: 3.4 });

  return {
    group,
    lampPosition: new THREE.Vector3(x, y + 12, z),
    update(time, night) {
      beams.rotation.y = time * 0.6;
      lampMaterial.color.setRGB(1, 0.86 + night * 0.1, 0.5 + night * 0.25).multiplyScalar(0.75 + night * 0.6);
    },
  };
}

function createDock(dock, heightAt) {
  const group = new THREE.Group();
  const angle = Math.atan2(dock.dirX, dock.dirZ);
  group.position.set(dock.x, 0, dock.z);
  group.rotation.y = angle;
  const deckHeight = Math.max(0.95, heightAt(dock.x, dock.z) + 0.12);
  const approach = 3.2;
  const approachDrop = 0.9;
  const approachPlank = new THREE.Mesh(
    flatten(new THREE.BoxGeometry(dock.width, 0.16, Math.hypot(approach, approachDrop))),
    createSolidMaterial("#b98250")
  );
  approachPlank.rotation.x = -Math.atan2(approachDrop, approach);
  approachPlank.position.set(0, deckHeight - approachDrop / 2 - 0.08, -approach / 2);
  group.add(approachPlank);
  const plankGeometries = [];
  const plankCount = Math.round(dock.length / 0.6);
  for (let i = 0; i < plankCount; i++) {
    const plank = new THREE.BoxGeometry(dock.width + (i % 3) * 0.08, 0.16, 0.52);
    plank.translate((i % 2) * 0.05, deckHeight - 0.08, i * 0.6 + 0.3);
    plankGeometries.push(plank.toNonIndexed());
  }
  const planks = new THREE.Mesh(flatten(mergeGeometries(plankGeometries)), createSolidMaterial("#c98f5a"));
  group.add(planks);

  const postGeometries = [];
  for (let i = 2; i <= dock.length; i += 3.2) {
    for (const side of [-1, 1]) {
      const post = new THREE.CylinderGeometry(0.16, 0.18, 3.4, 6);
      post.translate(side * (dock.width / 2 + 0.1), deckHeight - 1.3, i);
      postGeometries.push(post.toNonIndexed());
    }
  }
  const posts = new THREE.Mesh(flatten(mergeGeometries(postGeometries)), createSolidMaterial("#8a5a3c"));
  group.add(posts);
  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const surface = (x, z) => {
    const dx = x - dock.x;
    const dz = z - dock.z;
    const lx = dx * cos + dz * sin;
    const lz = -dx * sin + dz * cos;
    if (Math.abs(lx) > dock.width / 2 + 0.3 || lz > dock.length) return -Infinity;
    if (lz >= 0) return deckHeight;
    if (lz >= -approach) return deckHeight - approachDrop * (-lz / approach);
    return -Infinity;
  };
  return { group, surface };
}

function createLanterns(paths, heightAt, colliders, keepOut) {
  const posts = [];
  for (const path of paths) {
    let travelled = 20;
    for (let p = 0; p < path.length - 1; p++) {
      const a = path[p];
      const b = path[p + 1];
      const segment = Math.hypot(b.x - a.x, b.z - a.z);
      while (travelled < segment) {
        const t = travelled / segment;
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        const side = posts.length % 2 === 0 ? 1 : -1;
        const nx = (-(b.z - a.z) / segment) * 3.1 * side;
        const nz = ((b.x - a.x) / segment) * 3.1 * side;
        const px = x + nx;
        const pz = z + nz;
        const py = heightAt(px, pz);
        const blocked = keepOut.some((zone) => Math.hypot(px - zone.x, pz - zone.z) < zone.radius);
        if (py > 0.8 && !blocked) posts.push(new THREE.Vector3(px, py, pz));
        travelled += 15;
      }
      travelled -= segment;
    }
  }

  const postGeometry = flatten(
    mergeGeometries([
      new THREE.CylinderGeometry(0.09, 0.12, 2.4, 6).translate(0, 1.2, 0).toNonIndexed(),
      new THREE.BoxGeometry(0.42, 0.5, 0.42).translate(0, 2.55, 0).toNonIndexed(),
      new THREE.ConeGeometry(0.36, 0.3, 4).rotateY(Math.PI / 4).translate(0, 2.95, 0).toNonIndexed(),
    ])
  );
  const material = createTintedInstanceMaterial();
  const mesh = new THREE.InstancedMesh(postGeometry, material, posts.length);
  const dummy = new THREE.Object3D();
  posts.forEach((post, index) => {
    dummy.position.copy(post);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    colliders.push({ x: post.x, z: post.z, radius: 0.35 });
  });
  setInstanceTints(postGeometry, posts.map(() => new THREE.Color("#3d3a55")));
  mesh.castShadow = true;
  return { mesh, glowPoints: posts.map((p) => p.clone().add(new THREE.Vector3(0, 2.55, 0))) };
}

export function createGlows(points, { color = "#ffc76b", size = 260, day = 0 } = {}) {
  const positions = new Float32Array(points.length * 3);
  points.forEach((point, index) => point.toArray(positions, index * 3));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uNight: shared.uNight,
      uTime: shared.uTime,
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uColor: { value: new THREE.Color(color).convertLinearToSRGB() },
      uSize: { value: size },
      uDay: { value: day },
    },
    vertexShader: /* glsl */ `
      uniform float uPixelRatio;
      uniform float uTime;
      uniform float uSize;
      varying float vFlicker;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        vFlicker = 0.85 + 0.15 * sin(uTime * 7.0 + position.x * 3.1);
        gl_PointSize = uSize * uPixelRatio / -mvPosition.z;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uNight;
      uniform float uDay;
      uniform vec3 uColor;
      varying float vFlicker;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float glow = pow(max(0.0, 1.0 - d * 2.0), 2.6);
        float core = smoothstep(0.12, 0.0, d);
        vec3 color = uColor * glow * 0.9 + mix(uColor, vec3(1.0), 0.75) * core;
        gl_FragColor = vec4(color * max(uNight, uDay) * vFlicker, 1.0);
      }
    `,
  });
  const glows = new THREE.Points(geometry, material);
  glows.frustumCulled = false;
  return glows;
}

function createClouds(random) {
  const group = new THREE.Group();
  const material = createSolidMaterial("#ffffff");
  const clouds = [];
  for (let c = 0; c < 26; c++) {
    const puffs = [];
    const puffCount = 4 + Math.floor(random() * 4);
    for (let p = 0; p < puffCount; p++) {
      const radius = 2.4 + random() * 2.6;
      const puff = new THREE.IcosahedronGeometry(radius, 1);
      puff.scale(1, 0.72, 1);
      puff.translate((p - puffCount / 2) * 3.1 + random() * 1.5, random() * 1.6, (random() - 0.5) * 3.5);
      puffs.push(puff.toNonIndexed());
    }
    const mesh = new THREE.Mesh(flatten(mergeGeometries(puffs)), material);
    const angle = random() * Math.PI * 2;
    const distance = 40 + random() * 260;
    mesh.position.set(Math.cos(angle) * distance, 78 + random() * 26, Math.sin(angle) * distance);
    mesh.rotation.y = random() * Math.PI;
    mesh.scale.setScalar(1.2 + random() * 1.1);
    clouds.push({ mesh, speed: 1.2 + random() * 1.8 });
    group.add(mesh);
  }
  return {
    group,
    update(dt) {
      for (const cloud of clouds) {
        cloud.mesh.position.x += cloud.speed * dt;
        cloud.mesh.position.z += cloud.speed * 0.35 * dt;
        if (cloud.mesh.position.x > 320) cloud.mesh.position.x = -320;
        if (cloud.mesh.position.z > 320) cloud.mesh.position.z = -320;
      }
    },
  };
}

function createBirds(center, random) {
  const group = new THREE.Group();
  const material = createSolidMaterial("#f7f4ee", { side: THREE.DoubleSide });
  const wingGeometry = new THREE.BufferGeometry();
  wingGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array([0, 0, 0.35, 0, 0, -0.35, 1.3, 0.05, -0.1]), 3)
  );
  wingGeometry.computeVertexNormals();
  const birds = [];
  for (let i = 0; i < 7; i++) {
    const bird = new THREE.Group();
    const left = new THREE.Mesh(wingGeometry, material);
    const right = new THREE.Mesh(wingGeometry, material);
    right.scale.x = -1;
    bird.add(left, right);
    group.add(bird);
    birds.push({
      bird,
      left,
      right,
      radius: 18 + random() * 22,
      height: 30 + random() * 10,
      speed: 0.18 + random() * 0.12,
      phase: random() * Math.PI * 2,
    });
  }
  return {
    group,
    update(time) {
      for (const b of birds) {
        const angle = time * b.speed + b.phase;
        b.bird.position.set(center.x + Math.cos(angle) * b.radius, b.height + Math.sin(time * 0.7 + b.phase) * 2, center.z + Math.sin(angle) * b.radius);
        b.bird.rotation.y = -angle;
        const flap = Math.sin(time * 9 + b.phase) * 0.6;
        b.left.rotation.z = flap;
        b.right.rotation.z = -flap;
      }
    },
  };
}

export function createProps({ terrain, random, colliders, avoid }) {
  const group = new THREE.Group();
  const surfaces = [];
  const { features, heightAt } = terrain;

  group.add(createRocks({ terrain, random, colliders, avoid }));

  const lighthouse = createLighthouse({ ...features.lighthouse, y: heightAt(features.lighthouse.x, features.lighthouse.z) }, colliders);
  group.add(lighthouse.group);

  const dock = createDock(features.dock, heightAt);
  group.add(dock.group);
  surfaces.push(dock.surface);

  const keepOut = [
    { x: features.spawn.x, z: features.spawn.z - 18, radius: 22 },
    { x: features.lighthouse.x, z: features.lighthouse.z, radius: 8 },
    ...features.areas.map((area) => ({ x: area.x, z: area.z, radius: area.radius + 3 })),
  ];
  if (features.bridge) {
    keepOut.push({ x: features.bridge.a.x, z: features.bridge.a.z, radius: 5 }, { x: features.bridge.b.x, z: features.bridge.b.z, radius: 5 });
  }
  const lanterns = createLanterns(features.paths, heightAt, colliders, keepOut);
  group.add(lanterns.mesh);
  const glows = createGlows([...lanterns.glowPoints, lighthouse.lampPosition]);
  group.add(glows);

  const clouds = createClouds(random);
  group.add(clouds.group);

  const birds = createBirds(features.mountain, random);
  group.add(birds.group);

  return {
    group,
    surfaces,
    update(dt, time, night) {
      lighthouse.update(time, night);
      clouds.update(dt);
      birds.update(time);
    },
  };
}
