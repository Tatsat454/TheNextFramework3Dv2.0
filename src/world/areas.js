import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { createGlows } from "./props.js";
import { createSocialLogos, loadSocialTemplate } from "./socials.js";
import { createStoneGolem, loadGolemTemplate } from "./golem.js";
import { createTempleOfTribulations, loadTempleTemplate } from "./temple.js";
import { createEmissiveMaterial, createSolidMaterial, createStylizedMaterial, flatten, shared } from "./shading.js";

let cachedLotusGarden = null;
async function loadLotusGardenTemplate() {
  if (cachedLotusGarden) return cachedLotusGarden;
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync("/lotus-garden.glb");
  cachedLotusGarden = gltf.scene;
  return cachedLotusGarden;
}

const TAU = Math.PI * 2;
const dummy = new THREE.Object3D();

function placed(geometry, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  dummy.position.set(x, y, z);
  dummy.rotation.set(rx, ry, rz);
  dummy.scale.set(sx, sy, sz);
  dummy.updateMatrix();
  const result = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  result.applyMatrix4(dummy.matrix);
  return result;
}

function mergedMesh(parts, material, { cast = true, receive = true } = {}) {
  const mesh = new THREE.Mesh(flatten(mergeGeometries(parts)), material);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

function angleDistance(a, b) {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

function createPad(area) {
  const accent = new THREE.Color(area.color);
  const palette = {
    stones: ["#f3d0b0", "#e3b68a"],
    isle: ["#3b4a86", "#33407a"],
    market: ["#f0d2c0", "#e4bfaa"],
    garden: ["#e4f0c4", "#d0e4a6"],
  }[area.id] ?? ["#e6e0d4", "#d6cfc1"];
  const material = createStylizedMaterial({
    uniforms: {
      uCenter: { value: new THREE.Vector2(area.x, area.z) },
      uRadius: { value: area.radius },
      uTileA: { value: new THREE.Color(palette[0]) },
      uTileB: { value: new THREE.Color(palette[1]) },
      uAccent: { value: accent },
    },
    fragmentPars: /* glsl */ `
      uniform vec2 uCenter;
      uniform float uRadius;
      uniform vec3 uTileA;
      uniform vec3 uTileB;
      uniform vec3 uAccent;
      float hash21(vec2 p) {
        return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453);
      }
    `,
    fragmentMain: /* glsl */ `
      vec2 d = vWorldPosition.xz - uCenter;
      float r = length(d);
      float ringWidth = 2.4;
      float ring = floor(r / ringWidth);
      float ringFrac = fract(r / ringWidth);
      float segments = max(6.0, floor(ring * 6.3 + 6.0));
      float around = (atan(d.y, d.x) / 6.28318 + 0.5) * segments + ring * 0.37;
      float tileLength = 6.28318 * max(r, 0.5) / segments;
      float groutAround = step(fract(around), 0.12 / tileLength) + step(1.0 - 0.12 / tileLength, fract(around));
      float groutRing = step(ringFrac, 0.05) + step(0.95, ringFrac);
      float grout = clamp(groutAround + groutRing, 0.0, 1.0) * step(ringWidth, r);
      float variation = hash21(vec2(ring, floor(around)));
      vec3 tile = mix(uTileA, uTileB, step(0.5, variation)) * (0.95 + variation * 0.08);
      vec3 base = mix(tile, tile * 0.72, grout);
      float band = smoothstep(uRadius - 1.7, uRadius - 1.6, r) * (1.0 - smoothstep(uRadius - 0.5, uRadius - 0.4, r));
      float centerMark = smoothstep(2.0, 2.1, r) * (1.0 - smoothstep(2.4, 2.5, r));
      base = mix(base, uAccent, max(band, centerMark));
      float rim = smoothstep(uRadius - 0.4, uRadius - 0.3, r);
      base = mix(base, tile * 0.6, rim);
      outColor = stylize(base, normal, vWorldPosition, 0.0, shadowMask);
      outColor += uAccent * max(band, centerMark) * uNight * 0.9;
    `,
  });
  const geometry = new THREE.CircleGeometry(area.radius, 96);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(area.x, area.y + 0.035, area.z);
  mesh.receiveShadow = true;
  return mesh;
}

function createBeacon(area) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(area.color).convertLinearToSRGB() },
      uNight: shared.uNight,
      uTime: shared.uTime,
      uFade: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying float vHeight;
      varying float vFacing;
      void main() {
        vHeight = uv.y;
        vec3 viewNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vFacing = abs(dot(viewNormal, normalize(-mvPosition.xyz)));
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uNight;
      uniform float uTime;
      uniform float uFade;
      varying float vHeight;
      varying float vFacing;
      void main() {
        float fade = pow(1.0 - vHeight, 1.4);
        float pulse = 0.85 + 0.15 * sin(uTime * 2.0 - vHeight * 18.0);
        float alpha = fade * pow(vFacing, 1.5) * pulse * (0.22 + uNight * 0.5) * uFade;
        gl_FragColor = vec4(uColor * alpha, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.2, 90, 20, 1, true), material);
  mesh.position.set(area.x, area.y + 45, area.z);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  return { mesh, material };
}

function createStonesDecor(area, heightAt, colliders, particles, assets) {
  const group = new THREE.Group();
  const entranceAngle = Math.atan2(-area.direction.z, -area.direction.x);
  const ringRadius = area.radius + 2.2;
  const stoneParts = [];
  const lintelParts = [];
  const crystals = [];
  const crystalMaterial = createEmissiveMaterial(area.color);
  const crystalGeometry = flatten(new THREE.OctahedronGeometry(0.55, 0));
  const glowPoints = [];
  const count = 8;
  for (let i = 0; i < count; i++) {
    const angle = entranceAngle + ((i + 0.5) / count) * TAU;
    if (angleDistance(angle, entranceAngle) < 0.3) continue;
    const tangent = { x: -Math.sin(angle), z: Math.cos(angle) };
    const cx = area.x + Math.cos(angle) * ringRadius;
    const cz = area.z + Math.sin(angle) * ringRadius;
    const height = 4.2 + (i % 3) * 0.5;
    for (const s of [-1, 1]) {
      const x = cx + tangent.x * s * 1.55;
      const z = cz + tangent.z * s * 1.55;
      const y = heightAt(x, z);
      stoneParts.push(
        placed(new THREE.BoxGeometry(1.25, height, 0.95, 1, 2, 1), {
          x,
          y: y + height / 2 - 0.2,
          z,
          ry: -angle + Math.PI / 2 + (Math.sin(i * 7.1 + s) * 0.12),
          rz: Math.sin(i * 3.3 + s) * 0.04,
        })
      );
      colliders.push({ x, z, radius: 0.85 });
    }
    const top = heightAt(cx, cz) + height - 0.1;
    lintelParts.push(placed(new THREE.BoxGeometry(4.4, 0.8, 1.05), { x: cx, y: top, z: cz, ry: -angle + Math.PI / 2 }));
    const crystal = new THREE.Mesh(crystalGeometry, crystalMaterial);
    crystal.position.set(cx, top + 1.6, cz);
    crystal.castShadow = true;
    group.add(crystal);
    crystals.push({ crystal, baseY: top + 1.6, phase: i * 1.3 });
    glowPoints.push(new THREE.Vector3(cx, top + 1.6, cz));
  }
  group.add(mergedMesh(stoneParts, createSolidMaterial("#d4a078")));
  group.add(mergedMesh(lintelParts, createSolidMaterial("#c08a5c")));
  group.add(createGlows(glowPoints, { color: area.color, size: 520, day: 0.35 }));
  const socials = createSocialLogos(area, heightAt, colliders, assets.socials);
  group.add(socials.group);
  const golem = createStoneGolem(area, heightAt, colliders, particles, assets.golem);
  group.add(golem.group);

  return {
    group,
    takeOpened: () => socials.takeOpened(),
    openPrompt: () => socials.openPrompt(),
    socialState: () => socials.socialState(),
    talk: () => golem.talk(),
    talkState: () => golem.talkState(),
    update(time, dt, _near, car, camera) {
      for (const { crystal, baseY, phase } of crystals) {
        crystal.position.y = baseY + Math.sin(time * 1.6 + phase) * 0.3;
        crystal.rotation.y = time * 0.9 + phase;
      }
      socials.update(time, camera);
      if (car) socials.probe(car, dt);
      golem.update(time, dt, car, camera);
    },
  };
}

function createIsleDecor(area, heightAt, colliders, _particles, assets) {
  const group = new THREE.Group();
  let pendingTransition = null;
  const temple = createTempleOfTribulations(area, heightAt, colliders, assets.temple, (stateEvent) => {
    pendingTransition = stateEvent;
  });
  group.add(temple.group);

  const stars = [];
  const starMaterial = createEmissiveMaterial("#fff2a8");
  const starGeometry = flatten(new THREE.OctahedronGeometry(0.4, 0));
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * TAU + 0.4;
    const star = new THREE.Mesh(starGeometry, starMaterial);
    star.scale.set(1, 1.6, 1);
    group.add(star);
    stars.push({ star, angle, radius: 19 + (i % 3) * 2.5, height: area.y + 14 + (i % 2) * 2.5 });
  }

  return {
    group,
    dungeonGroup: temple.dungeonGroup,
    surface: temple.surface,
    isInsideDungeon: () => temple.isInsideDungeon(),
    updateDungeonPlayer: (dt, input, cameraHeading) => temple.updateDungeonPlayer(dt, input, cameraHeading),
    takeOpened: () => temple.takeOpened(),
    openPrompt: () => temple.openPrompt(),
    socialState: () => temple.socialState(),
    talk: () => temple.talk(),
    talkState: () => temple.talkState(),
    exitHall: () => temple.exitHall(),
    takeTeleport() {
      const val = pendingTransition;
      pendingTransition = null;
      return val;
    },
    update(time, dt, _near, car, camera) {
      temple.update(time, dt, car, camera);
      for (const s of stars) {
        const a = s.angle + time * 0.15;
        s.star.position.set(area.x + Math.cos(a) * s.radius, s.height + Math.sin(time * 1.2 + s.angle * 3) * 0.6, area.z + Math.sin(a) * s.radius);
        s.star.rotation.y = time * 1.4 + s.angle;
      }
    },
  };
}

const STALL_THEMES = [
  {
    id: "robots",
    name: "Flo the Robot",
    bio: "I designed and 3D-printed Flo, a home robot that picks up clothes and carries them to a basket. The result is a low-cost helper for family members who can't bend down easily, and it goes back to charge itself.",
    url: "https://github.com/Tatsat454/FLO-Mini-v0.3",
    color: "#14e4ff",
    cloth: "#14e4ff",
    stripe: "#141a28",
    accent: "#ff3d8a",
    glow: "#7af6ff",
    look: "future",
  },
  {
    id: "power",
    name: "AI Power Demand",
    bio: "I analyzed PJM's power forecast and extended a Solow growth model to explain AI-driven demand. I found Northern Virginia's demand nearly triples by 2045, driven by data centers clustering in one place.",
    url: "https://docs.google.com/document/d/1RdxttWFKVUh-v5Mpnh5NdulgkWqoU-2Z/edit?usp=sharing&ouid=107914389794548838716&rtpof=true&sd=true",
    color: "#ffd23f",
    cloth: "#ffd23f",
    stripe: "#1c1c24",
    accent: "#4fc3f7",
    glow: "#fff38a",
    look: "power",
  },
  {
    id: "taxis",
    name: "Taxi Choice",
    bio: "I built a dataset from 83K+ NYC taxi trips and modeled how drivers choose where to go next. I found drivers stick to nearby, lower-fare zones instead of chasing bigger fares, and they avoid the airport.",
    url: "https://drive.google.com/file/d/12_YDLHcJTAI3FRRCVqYile0xuvCYIPNO/view",
    color: "#ff4a3a",
    cloth: "#ffd23f",
    stripe: "#2b2b33",
    accent: "#ff4a3a",
    glow: "#ffe27a",
    look: "taxi",
  },
  {
    id: "stocks",
    name: "Startup Success",
    bio: "I analyzed 923 startups to test what predicts getting acquired versus shutting down. I found VC-backed startups weren't acquired any more often than the rest, and funding grew with rounds and milestones.",
    url: "https://docs.google.com/document/d/1p5DEkt8RaFbv2ApwcXwB4Nx1NX4POlWb5OOID0KcHL4/edit?tab=t.0",
    color: "#3ddc84",
    cloth: "#3ddc84",
    stripe: "#fff6d6",
    accent: "#1a8f4c",
    glow: "#b8ffd0",
    look: "market",
  },
];

function stallMesh(geometry, material, x, y, z, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(flatten(geometry), material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createStall(theme, materials, bobbers, lanterns, phase) {
  const group = new THREE.Group();
  const future = theme.look === "future";
  const wood = future ? materials.solid("#3a4258") : materials.wood;
  const pale = future ? materials.solid("#8b93a8") : materials.pale;
  const dark = future ? materials.solid("#1b2130") : materials.dark;
  const cloth = materials.solid(theme.cloth);
  const stripe = materials.solid(theme.stripe);
  const accent = materials.solid(theme.accent);
  const glow = materials.glow(theme.glow);

  for (const [lx, lz] of [
    [-1.48, 0.72],
    [1.48, 0.72],
    [-1.48, -0.72],
    [1.48, -0.72],
  ]) {
    group.add(stallMesh(new RoundedBoxGeometry(0.22, 0.94, 0.22, 1, 0.05), wood, lx, 0.47, lz));
  }
  group.add(stallMesh(new RoundedBoxGeometry(3.55, 0.22, 1.95, 2, 0.08), pale, 0, 1.04, 0.02));
  group.add(stallMesh(new RoundedBoxGeometry(3.45, 0.58, 0.12, 1, 0.04), accent, 0, 0.7, 0.92));
  group.add(stallMesh(new RoundedBoxGeometry(2.15, 0.12, 0.08, 1, 0.03), stripe, 0, 0.72, 0.98));
  group.add(stallMesh(new RoundedBoxGeometry(3.55, 1.55, 0.16, 2, 0.05), cloth, 0, 1.82, -0.92));
  group.add(stallMesh(new RoundedBoxGeometry(1.15, 0.7, 0.08, 2, 0.06), stripe, 0, 1.95, -1.0));
  group.add(stallMesh(new RoundedBoxGeometry(3.25, 0.1, 0.46, 1, 0.04), pale, 0, 1.58, -0.62));
  group.add(stallMesh(new RoundedBoxGeometry(3.25, 0.1, 0.4, 1, 0.04), pale, 0, 2.2, -0.62));

  for (const [lx, lz] of [
    [-1.62, 0.86],
    [1.62, 0.86],
    [-1.62, -0.86],
    [1.62, -0.86],
  ]) {
    group.add(stallMesh(new THREE.CylinderGeometry(0.08, 0.11, 2.85, 7), dark, lx, 2.36, lz));
    group.add(stallMesh(new THREE.SphereGeometry(0.18, 8, 6), accent, lx, 3.82, lz));
  }

  const strips = 7;
  for (let s = 0; s < strips; s++) {
    const t = (s + 0.5) / strips - 0.5;
    const panel = s % 2 === 0 ? cloth : stripe;
    group.add(stallMesh(new RoundedBoxGeometry(3.85 / strips + 0.04, 0.1, 1.45, 1, 0.03), panel, t * 3.6, 3.58, -0.52, 0.52));
    group.add(stallMesh(new RoundedBoxGeometry(3.85 / strips + 0.04, 0.1, 1.45, 1, 0.03), panel, t * 3.6, 3.58, 0.52, -0.52));
  }
  group.add(stallMesh(new THREE.CylinderGeometry(0.07, 0.07, 3.7, 6), dark, 0, 3.98, 0, 0, 0, Math.PI / 2));
  for (let s = 0; s < 9; s++) {
    const scallop = stallMesh(new THREE.SphereGeometry(0.22, 8, 6), s % 2 === 0 ? cloth : stripe, ((s + 0.5) / 9 - 0.5) * 3.4, 3.08, 1.28);
    scallop.scale.set(1, 0.6, 0.85);
    group.add(scallop);
  }
  group.add(stallMesh(new RoundedBoxGeometry(0.1, 1.35, 1.55, 1, 0.03), cloth, -1.88, 2.55, 0.05, 0, 0, 0.08));
  group.add(stallMesh(new RoundedBoxGeometry(0.1, 1.35, 1.55, 1, 0.03), cloth, 1.88, 2.55, 0.05, 0, 0, -0.08));

  const sign = new THREE.Group();
  sign.add(stallMesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 6), dark, 0, 0.28, 0));
  sign.add(stallMesh(new RoundedBoxGeometry(0.72, 0.5, 0.1, 2, 0.05), pale, 0, -0.08, 0));
  if (theme.id === "robots") {
    sign.add(stallMesh(new RoundedBoxGeometry(0.18, 0.16, 0.12, 1, 0.03), stripe, 0, -0.1, 0.08));
    sign.add(stallMesh(new THREE.SphereGeometry(0.09, 8, 6), glow, 0, 0.04, 0.08));
  } else if (theme.id === "power") {
    sign.add(stallMesh(new THREE.OctahedronGeometry(0.16, 0), glow, 0, -0.08, 0.08));
  } else if (theme.id === "taxis") {
    sign.add(stallMesh(new RoundedBoxGeometry(0.32, 0.1, 0.16, 1, 0.03), accent, 0, -0.12, 0.08));
    sign.add(stallMesh(new RoundedBoxGeometry(0.18, 0.1, 0.14, 1, 0.03), stripe, 0, -0.02, 0.08));
  } else {
    sign.add(stallMesh(new THREE.ConeGeometry(0.12, 0.22, 3), materials.solid("#3ddc84"), 0, -0.06, 0.08));
  }
  sign.position.set(0, 2.92, 1.05);
  group.add(sign);
  bobbers.push({ mesh: sign, baseY: 2.92, phase: phase + 1.7, amount: 0.035 });

  for (const side of [-1.15, 1.15]) {
    const lantern = new THREE.Group();
    lantern.add(stallMesh(new THREE.CylinderGeometry(0.025, 0.025, 0.28, 6), dark, 0, 0.22, 0));
    lantern.add(stallMesh(new THREE.SphereGeometry(0.16, 9, 7), glow, 0, 0, 0));
    lantern.add(stallMesh(new THREE.ConeGeometry(0.12, 0.12, 7), accent, 0, 0.2, 0));
    lantern.position.set(side, 2.88, 0.88);
    group.add(lantern);
    lanterns.push({ mesh: lantern, baseY: 2.88, phase: phase + side });
  }

  stockStall(group, theme, materials, bobbers, phase);
  return group;
}

function addRobot(group, materials, x, y, z, scale = 1, hue = "#14e4ff") {
  const metal = materials.solid("#8b93a8");
  const dark = materials.solid("#1b2130");
  const glow = materials.glow(hue);
  const body = stallMesh(new RoundedBoxGeometry(0.28 * scale, 0.32 * scale, 0.22 * scale, 1, 0.04), metal, x, y, z);
  group.add(body);
  group.add(stallMesh(new THREE.SphereGeometry(0.12 * scale, 8, 6), metal, x, y + 0.24 * scale, z));
  group.add(stallMesh(new THREE.SphereGeometry(0.03 * scale, 6, 5), glow, x - 0.04 * scale, y + 0.26 * scale, z + 0.1 * scale));
  group.add(stallMesh(new THREE.SphereGeometry(0.03 * scale, 6, 5), glow, x + 0.04 * scale, y + 0.26 * scale, z + 0.1 * scale));
  group.add(stallMesh(new THREE.CylinderGeometry(0.015 * scale, 0.015 * scale, 0.16 * scale, 6), dark, x, y + 0.36 * scale, z));
  group.add(stallMesh(new THREE.SphereGeometry(0.035 * scale, 6, 5), glow, x, y + 0.46 * scale, z));
  group.add(stallMesh(new RoundedBoxGeometry(0.08 * scale, 0.18 * scale, 0.08 * scale, 1, 0.02), dark, x - 0.2 * scale, y, z));
  group.add(stallMesh(new RoundedBoxGeometry(0.08 * scale, 0.18 * scale, 0.08 * scale, 1, 0.02), dark, x + 0.2 * scale, y, z));
  return body;
}

function addTaxi(group, materials, x, y, z, scale = 1, color = "#ffd23f") {
  const body = materials.solid(color);
  const cabin = materials.solid("#f4f7ff");
  const tire = materials.solid("#2b2b33");
  group.add(stallMesh(new RoundedBoxGeometry(0.55 * scale, 0.16 * scale, 0.32 * scale, 1, 0.04), body, x, y, z));
  group.add(stallMesh(new RoundedBoxGeometry(0.28 * scale, 0.14 * scale, 0.28 * scale, 1, 0.03), cabin, x + 0.02 * scale, y + 0.13 * scale, z));
  group.add(stallMesh(new RoundedBoxGeometry(0.04 * scale, 0.1 * scale, 0.08 * scale, 1, 0.01), materials.solid("#ff4a3a"), x - 0.22 * scale, y + 0.14 * scale, z));
  for (const [wx, wz] of [
    [-0.16, 0.16],
    [0.16, 0.16],
    [-0.16, -0.16],
    [0.16, -0.16],
  ]) {
    group.add(stallMesh(new THREE.CylinderGeometry(0.07 * scale, 0.07 * scale, 0.07 * scale, 8), tire, x + wx * scale, y - 0.08 * scale, z + wz * scale, Math.PI / 2));
  }
}

function addTower(group, materials, x, y, z, height = 0.9) {
  const dark = materials.solid("#2b2b33");
  const glow = materials.glow("#fff38a");
  group.add(stallMesh(new THREE.CylinderGeometry(0.12, 0.16, 0.1, 8), dark, x, y, z));
  group.add(stallMesh(new THREE.CylinderGeometry(0.035, 0.05, height, 6), materials.solid("#8b93a8"), x, y + height / 2, z));
  group.add(stallMesh(new RoundedBoxGeometry(0.28, 0.04, 0.04, 1, 0.01), dark, x, y + height * 0.45, z));
  group.add(stallMesh(new RoundedBoxGeometry(0.04, 0.04, 0.28, 1, 0.01), dark, x, y + height * 0.7, z));
  const bulb = stallMesh(new THREE.SphereGeometry(0.1, 8, 6), glow, x, y + height + 0.08, z);
  group.add(bulb);
  return bulb;
}

function stockStall(group, theme, materials, bobbers, phase) {
  const pale = theme.look === "future" ? materials.solid("#8b93a8") : materials.pale;
  const crate = (x, y, z, s = 1, ry = 0.15) =>
    group.add(stallMesh(new RoundedBoxGeometry(0.55 * s, 0.42 * s, 0.55 * s, 1, 0.05), pale, x, y, z, 0, ry));

  if (theme.id === "robots") {
    group.add(stallMesh(new RoundedBoxGeometry(3.2, 0.04, 0.08, 1, 0.02), materials.glow("#14e4ff"), 0, 1.18, 0.88));
    crate(-1.25, 1.34, 0.2, 0.85, -0.2);
    const bots = [
      [-0.7, 1.42, 0.28, 1.05, "#14e4ff"],
      [0.05, 1.4, 0.18, 0.85, "#ff3d8a"],
      [0.75, 1.44, 0.32, 1.15, "#7af6ff"],
      [-0.45, 2.42, -0.5, 0.7, "#14e4ff"],
      [0.45, 2.4, -0.48, 0.75, "#ff3d8a"],
    ];
    bots.forEach((bot, i) => {
      const body = addRobot(group, materials, bot[0], bot[1], bot[2], bot[3], bot[4]);
      bobbers.push({ mesh: body, baseY: bot[1], phase: phase + i, amount: 0.05 });
    });
    group.add(stallMesh(new RoundedBoxGeometry(0.28, 0.08, 0.28, 1, 0.02), materials.solid("#1b2130"), 1.15, 1.28, 0.3));
    group.add(stallMesh(new THREE.OctahedronGeometry(0.1, 0), materials.glow("#14e4ff"), 1.15, 1.42, 0.3));
    return;
  }

  if (theme.id === "power") {
    crate(-1.3, 1.34, 0.28, 0.9, -0.25);
    const towers = [
      [-0.85, 1.22, 0.22, 0.85],
      [-0.15, 1.22, 0.34, 1.15],
      [0.55, 1.22, 0.18, 0.7],
      [1.15, 1.22, 0.3, 1],
      [-0.5, 2.28, -0.5, 0.55],
      [0.4, 2.28, -0.48, 0.7],
    ];
    towers.forEach((tower, i) => {
      const bulb = addTower(group, materials, tower[0], tower[1], tower[2], tower[3]);
      bobbers.push({ mesh: bulb, baseY: bulb.position.y, phase: phase + i, amount: 0.04 });
    });
    group.add(stallMesh(new THREE.TorusGeometry(0.16, 0.04, 6, 10), materials.solid("#ffd23f"), 1.2, 1.82, -0.5, Math.PI / 2));
    group.add(stallMesh(new THREE.CylinderGeometry(0.08, 0.08, 0.22, 8), materials.solid("#4fc3f7"), -1.1, 1.82, -0.5));
    return;
  }

  if (theme.id === "taxis") {
    const colors = ["#ffd23f", "#ff4a3a", "#ffffff", "#ffd23f"];
    [
      [-0.85, 1.3, 0.28, 1, 0.2],
      [0.15, 1.3, 0.18, 0.9, -0.15],
      [0.95, 1.3, 0.34, 1.05, 0.35],
      [-0.35, 2.36, -0.48, 0.7, 0.1],
      [0.55, 2.34, -0.5, 0.65, -0.25],
    ].forEach((car, i) => {
      const taxi = new THREE.Group();
      addTaxi(taxi, materials, 0, 0, 0, car[3], colors[i % colors.length]);
      taxi.position.set(car[0], car[1], car[2]);
      taxi.rotation.y = car[4];
      group.add(taxi);
      bobbers.push({ mesh: taxi, baseY: car[1], phase: phase + i, amount: 0.03 });
    });
    crate(-1.25, 1.34, 0.12, 0.8, -0.2);
    return;
  }

  crate(-1.28, 1.34, 0.22, 0.85, -0.2);
  for (let i = 0; i < 4; i++) {
    group.add(stallMesh(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 10), materials.solid("#ffd23f"), -0.95, 1.22 + i * 0.06, 0.32));
    group.add(stallMesh(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 10), materials.solid("#ffd23f"), 1.05, 1.22 + i * 0.06, 0.18));
  }
  group.add(stallMesh(new RoundedBoxGeometry(1.15, 0.55, 0.08, 1, 0.03), materials.solid("#1a8f4c"), 0.05, 1.48, 0.42));
  group.add(stallMesh(new THREE.ConeGeometry(0.14, 0.28, 3), materials.solid("#3ddc84"), 0.05, 1.58, 0.48));
  group.add(stallMesh(new RoundedBoxGeometry(0.9, 0.35, 0.06, 1, 0.02), materials.solid("#fff6d6"), -0.55, 2.48, -0.48));
  group.add(stallMesh(new RoundedBoxGeometry(0.08, 0.18, 0.04, 1, 0.01), materials.solid("#3ddc84"), -0.7, 2.5, -0.44));
  group.add(stallMesh(new RoundedBoxGeometry(0.08, 0.12, 0.04, 1, 0.01), materials.solid("#1a8f4c"), -0.55, 2.47, -0.44));
  group.add(stallMesh(new RoundedBoxGeometry(0.08, 0.22, 0.04, 1, 0.01), materials.solid("#3ddc84"), -0.4, 2.52, -0.44));
  group.add(stallMesh(new RoundedBoxGeometry(0.7, 0.32, 0.06, 1, 0.02), materials.solid("#1a8f4c"), 0.65, 2.42, -0.48));
  const coin = stallMesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 10), materials.glow("#b8ffd0"), 0.85, 1.82, -0.5);
  group.add(coin);
  bobbers.push({ mesh: coin, baseY: 1.82, phase, amount: 0.06 });
}

function createMarketDecor(area, heightAt, colliders) {
  const group = new THREE.Group();
  const canvas = ["#ff5b7a", "#ffd23f", "#3ec6ff", "#62d26a", "#ff9f43", "#8b6cff"];
  const solids = {};
  const glows = {};
  const materials = {
    wood: createSolidMaterial("#8b5a32"),
    pale: createSolidMaterial("#d7a36a"),
    dark: createSolidMaterial("#4d3424"),
    solid(color) {
      return (solids[color] ??= createSolidMaterial(color));
    },
    glow(color) {
      return (glows[color] ??= createEmissiveMaterial(color));
    },
  };
  const bobbers = [];
  const lanterns = [];
  const glowPoints = [];
  const stalls = [];
  const entranceAngle = Math.atan2(-area.direction.z, -area.direction.x);
  let themeIndex = 0;
  for (let i = 0; i < 6; i++) {
    const angle = entranceAngle + ((i + 0.5) / 6) * TAU;
    if (angleDistance(angle, entranceAngle) < 0.55) continue;
    const x = area.x + Math.cos(angle) * (area.radius - 4.6);
    const z = area.z + Math.sin(angle) * (area.radius - 4.6);
    const theme = STALL_THEMES[themeIndex % STALL_THEMES.length];
    const stall = createStall(theme, materials, bobbers, lanterns, i * 1.3);
    stall.position.set(x, area.y, z);
    stall.rotation.y = Math.atan2(area.x - x, area.z - z);
    group.add(stall);
    glowPoints.push(new THREE.Vector3(x, area.y + 3.1, z));
    colliders.push({ x, z, radius: 2.05 });
    stalls.push({
      name: theme.name,
      bio: theme.bio,
      url: theme.url,
      color: theme.color,
      x,
      y: area.y + 1.2,
      z,
      near: false,
      fired: false,
    });
    themeIndex += 1;
  }

  const flagParts = [];
  const flags = [];
  const flagGeometry = new THREE.BufferGeometry();
  flagGeometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, -0.7, 0, 1.2, -0.35, 0], 3));
  flagGeometry.computeVertexNormals();
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * TAU;
    const x = area.x + Math.cos(angle) * (area.radius + 1.3);
    const z = area.z + Math.sin(angle) * (area.radius + 1.3);
    const y = heightAt(x, z);
    flagParts.push(placed(new THREE.CylinderGeometry(0.07, 0.09, 3.6, 6), { x, y: y + 1.8, z }));
    const flag = new THREE.Mesh(flagGeometry, createSolidMaterial(canvas[i % canvas.length], { side: THREE.DoubleSide }));
    flag.position.set(x, y + 3.5, z);
    flag.castShadow = true;
    group.add(flag);
    flags.push({ flag, phase: i * 0.8 });
    colliders.push({ x, z, radius: 0.25 });
  }
  group.add(mergedMesh(flagParts, createSolidMaterial("#3d3a55")));
  if (glowPoints.length) group.add(createGlows(glowPoints, { color: "#ffd27a", size: 420, day: 0.22 }));

  let opened = null;
  let prompt = null;
  const openLink = (url) => Boolean(window.open(url, "_blank", "noopener,noreferrer"));

  return {
    group,
    takeOpened() {
      const value = opened;
      opened = null;
      return value;
    },
    socialState() {
      return prompt;
    },
    openPrompt() {
      const stall = stalls.find((item) => item.near && !item.fired);
      if (!stall) return false;
      stall.fired = true;
      prompt = null;
      opened = { ...stall, blocked: !openLink(stall.url) };
      return true;
    },
    update(time, _dt, _near, car) {
      for (const { flag, phase } of flags) flag.rotation.y = Math.sin(time * 2.4 + phase) * 0.45 + phase;
      for (const item of bobbers) item.mesh.position.y = item.baseY + Math.sin(time * 2.1 + item.phase) * (item.amount ?? 0.04);
      for (const item of lanterns) item.mesh.rotation.z = Math.sin(time * 1.8 + item.phase) * 0.12;
      if (!car) return;
      let nearest = null;
      let nearestDistance = 4.6;
      for (const stall of stalls) {
        const distance = Math.hypot(car.x - stall.x, (car.y ?? stall.y) - stall.y, car.z - stall.z);
        if (distance < nearestDistance) {
          nearest = stall;
          nearestDistance = distance;
        }
      }
      for (const stall of stalls) {
        stall.near = stall === nearest;
        if (stall !== nearest) stall.fired = false;
      }
      prompt = nearest && !nearest.fired
        ? { name: nearest.name, bio: nearest.bio, color: nearest.color, url: nearest.url }
        : null;
    },
  };
}

// Exact Blender (X, Y, Z) coordinates of all 23 stone lanterns in public/lotus-garden.glb
const LOTUS_LANTERNS_BLENDER = [
  [-2.15, 1.6, 2.69],
  [-2.15, 4.3, 4.64],
  [2.15, 1.6, 2.69],
  [2.15, 4.3, 4.64],
  [-6.0, -3.5, 3.14],
  [-6.0, 3.6, 3.14],
  [-5.6, 4.6, 4.64],
  [6.0, -3.5, 3.14],
  [6.0, 3.6, 3.14],
  [5.6, 4.6, 4.64],
  [0.0, 7.2, 4.36],
  [-9.2, 0.2, 2.54],
  [9.2, 0.2, 2.54],
  [8.19, -9.01, 2.09],
  [3.58, -7.51, 2.09],
  [7.41, -11.39, 2.09],
  [2.8, -9.89, 2.09],
  [-0.11, -6.31, 2.72],
  [-0.89, -8.69, 2.72],
  [-3.8, -5.11, 3.4],
  [-4.58, -7.49, 3.4],
  [-7.49, -3.91, 2.09],
  [-8.26, -6.29, 2.09],
];

function createLotusLampMaterial(hexColor, lampPositions, { metallic = false } = {}) {
  return createStylizedMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(hexColor) },
      uLampPositions: { value: lampPositions },
      uMetallic: { value: metallic ? 1.0 : 0.0 },
    },
    fragmentPars: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uLampPositions[23];
      uniform float uMetallic;
    `,
    fragmentMain: /* glsl */ `
      vec3 base = stylize(uColor, normal, vWorldPosition, 0.0, shadowMask);
      vec3 lampLight = vec3(0.0);
      for (int i = 0; i < 23; i++) {
        vec3 lPos = uLampPositions[i];
        vec3 toL = lPos - vWorldPosition;
        float d = length(toL);
        if (d < 6.4) {
          float ndl = max(dot(normal, toL / max(d, 0.001)), 0.0) * 0.72 + 0.28;
          float atten = pow(clamp(1.0 - d / 6.4, 0.0, 1.0), 1.85) * ndl + smoothstep(2.0, 0.18, d) * 0.72;
          lampLight += vec3(1.0, 0.62, 0.18) * atten;
        }
      }
      float lampStrength = mix(0.68, 1.18, uNight);
      outColor = base + uColor * lampLight * lampStrength;
      if (uMetallic > 0.5) {
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        vec3 halfVec = normalize(uSunDirection + viewDir);
        float spec = pow(max(dot(normal, halfVec), 0.0), 24.0) * 0.42;
        outColor += vec3(1.0, 0.86, 0.48) * spec;
      }
    `,
  });
}

function createGardenDecor(area, _heightAt, colliders, _particles, assets) {
  const group = new THREE.Group();
  const S = 1.25;
  const ry = Math.atan2(-area.direction.x, -area.direction.z);
  const cosRy = Math.cos(ry);
  const sinRy = Math.sin(ry);

  const toWorldXZ = (lx, lz) => ({
    x: area.x + S * (lx * cosRy + lz * sinRy),
    z: area.z + S * (-lx * sinRy + lz * cosRy),
  });

  // Compute exact world positions for all 23 lanterns so EVERY lamp emits its own light & halo
  const lampWorldPositions = LOTUS_LANTERNS_BLENDER.map(([bx, by, bz]) => {
    const lx = bx;
    const ly = bz;
    const lz = -by;
    const { x, z } = toWorldXZ(lx, lz);
    return new THREE.Vector3(x, S * ly, z);
  });

  const palette = {
    Lotus_Marble_Cream: createLotusLampMaterial("#f3dec2", lampWorldPositions),
    Lotus_Marble_Dark: createLotusLampMaterial("#d8be9c", lampWorldPositions),
    Lotus_Slate_Roof: createLotusLampMaterial("#4c5c7a", lampWorldPositions, { metallic: true }),
    Lotus_Gold_Trim: createLotusLampMaterial("#f2ad36", lampWorldPositions, { metallic: true }),
    Lotus_Rock_Grey: createLotusLampMaterial("#7c7582", lampWorldPositions),
    Lotus_Foliage_Dark: createLotusLampMaterial("#3a7d2c", lampWorldPositions),
    Lotus_Foliage_Bright: createLotusLampMaterial("#68b836", lampWorldPositions),
    Lotus_Cypress_Green: createLotusLampMaterial("#4d982c", lampWorldPositions),
    Lotus_Pad_Green: createLotusLampMaterial("#63b43c", lampWorldPositions),
    Lotus_Wood_Bark: createLotusLampMaterial("#7a4e2d", lampWorldPositions),
    Lotus_Flower_Pink: createEmissiveMaterial("#ff82a8"),
    Lotus_Flower_Core: createEmissiveMaterial("#ffd447"),
    Lotus_Waterfall_Foam: createEmissiveMaterial("#d2f8ff"),
    Lotus_Lantern_Glow: createEmissiveMaterial("#ffbe3b"),
  };

  if (assets?.lotusGarden) {
    const gardenRoot = assets.lotusGarden.clone(true);
    gardenRoot.position.set(area.x, 0, area.z);
    gardenRoot.rotation.y = ry;
    gardenRoot.scale.setScalar(S);
    gardenRoot.traverse((child) => {
      if (!child.isMesh) return;
      child.geometry = flatten(child.geometry.clone());
      const matKey = Object.keys(palette).find((k) => child.name.startsWith(k));
      child.material = matKey ? palette[matKey] : palette.Lotus_Marble_Cream;
      child.castShadow = !child.name.startsWith("Lotus_Lantern_Glow");
      child.receiveShadow = true;
    });
    group.add(gardenRoot);
  }

  // Spawn an individual glowing light sprite at EVERY single one of the 23 lamps
  group.add(createGlows(lampWorldPositions, { color: "#ffae2b", size: 420, day: 0.78 }));

  // Colliders around the pavilions, upper terrace & pond perimeter (leaving the arched bridge open)
  const localColliders = [
    // Upper central rotunda & terrace
    [0, -7.2, 4.5],
    [-6.0, -7.2, 2.8],
    [6.0, -7.2, 2.8],
    // Left & right flanking pavilions
    [-9.2, -0.2, 3.4],
    [9.2, -0.2, 3.4],
    // Waterfall cliff & boulders
    [-4.2, -2.2, 2.2],
    [0.0, -2.2, 2.2],
    [4.2, -2.2, 2.2],
    // Pond side banks
    [-6.8, 2.2, 1.8],
    [6.8, 2.5, 1.8],
  ];
  for (const [lx, lz, r] of localColliders) {
    const { x, z } = toWorldXZ(lx, lz);
    colliders.push({ x, z, radius: r * S });
  }

  // Walkable/driveable surface for the diagonal arched stone bridge across the lotus pond
  const bStartX = 7.8;
  const bStartZ = 10.2;
  const bDx = -16.6;
  const bDz = -5.4;
  const bLenSq = bDx * bDx + bDz * bDz;
  const bLen = Math.sqrt(bLenSq);
  const bNx = -bDz / bLen;
  const bNz = bDx / bLen;
  for (const t of [0.05, 0.25, 0.5, 0.75, 0.95]) {
    for (const side of [-1, 1]) {
      const lx = bStartX + bDx * t + side * bNx * 1.35;
      const lz = bStartZ + bDz * t + side * bNz * 1.35;
      const { x, z } = toWorldXZ(lx, lz);
      colliders.push({ x, z, radius: 0.45 });
    }
  }

  const surface = (wx, wz) => {
    const gdx = (wx - area.x) / S;
    const gdz = (wz - area.z) / S;
    const lx = gdx * cosRy - gdz * sinRy;
    const lz = gdx * sinRy + gdz * cosRy;
    const relX = lx - bStartX;
    const relZ = lz - bStartZ;
    const t = (relX * bDx + relZ * bDz) / bLenSq;
    const across = Math.abs(relX * bNx + relZ * bNz);
    if (t >= -0.04 && t <= 1.04 && across <= 1.35) {
      const clampedT = Math.max(0, Math.min(1, t));
      const archT = Math.max(0, Math.min(1, (clampedT - 0.42) / 0.52));
      return S * (0.62 + Math.sin(archT * Math.PI) * 1.35);
    }
    return -Infinity;
  };

  return {
    group,
    surface,
    update() {},
  };
}

function createBridge(bridge, heightAt, colliders) {
  const { a, b } = bridge;
  const ya = heightAt(a.x, a.z);
  const yb = heightAt(b.x, b.z);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz);
  const ux = dx / length;
  const uz = dz / length;
  const width = 5;
  const arch = Math.min(5, length * 0.09);
  const deck = (t) => ya + (yb - ya) * t + Math.sin(Math.PI * t) * arch;
  const angle = Math.atan2(ux, uz);
  const group = new THREE.Group();
  group.position.set(a.x, 0, a.z);
  group.rotation.y = angle;

  const plankA = [];
  const plankB = [];
  const step = 0.62;
  const plankCount = Math.ceil(length / step);
  for (let i = 0; i < plankCount; i++) {
    const t0 = i / plankCount;
    const t1 = (i + 1) / plankCount;
    const tm = (t0 + t1) / 2;
    const slope = (deck(t1) - deck(t0)) / (length / plankCount);
    const geometry = new THREE.BoxGeometry(width + (i % 3) * 0.1, 0.18, step * 0.86);
    (i % 2 ? plankA : plankB).push(placed(geometry, { x: (i % 2) * 0.05, y: deck(tm) - 0.09, z: tm * length, rx: -Math.atan(slope) }));
  }
  group.add(mergedMesh(plankA, createSolidMaterial("#c98f5a")), mergedMesh(plankB, createSolidMaterial("#bb8150")));

  const postParts = [];
  const railParts = [];
  const railStep = 2.6;
  const railCount = Math.ceil(length / railStep);
  for (let i = 0; i <= railCount; i++) {
    const t = i / railCount;
    const z = t * length;
    const y = deck(t);
    for (const s of [-1, 1]) {
      postParts.push(placed(new THREE.CylinderGeometry(0.09, 0.11, 1.3, 6), { x: s * (width / 2 - 0.1), y: y + 0.55, z }));
      if (i < railCount) {
        const tn = (i + 1) / railCount;
        const zn = tn * length;
        const yn = deck(tn);
        const span = Math.hypot(zn - z, yn - y);
        railParts.push(
          placed(new THREE.BoxGeometry(0.16, 0.14, span), { x: s * (width / 2 - 0.1), y: (y + yn) / 2 + 1.15, z: (z + zn) / 2, rx: -Math.atan2(yn - y, zn - z) })
        );
      }
    }
  }
  for (let t = 0.12; t < 0.95; t += 0.16) {
    const y = deck(t);
    for (const s of [-1, 1]) {
      const pillarHeight = y + 9;
      postParts.push(placed(new THREE.CylinderGeometry(0.28, 0.34, pillarHeight, 7), { x: s * (width / 2 + 0.15), y: y - pillarHeight / 2, z: t * length }));
    }
  }
  group.add(mergedMesh(postParts, createSolidMaterial("#7f5236")));
  group.add(mergedMesh(railParts, createSolidMaterial("#e9dcc6")));

  for (let d = 1.5; d < length - 1.5; d += 1.1) {
    const t = d / length;
    for (const s of [-1, 1]) {
      const offset = s * (width / 2 + 0.25);
      colliders.push({ x: a.x + ux * d + uz * offset, z: a.z + uz * d - ux * offset, radius: 0.3, minY: deck(t) - 1.2 });
    }
  }

  const surface = (x, z) => {
    const px = x - a.x;
    const pz = z - a.z;
    const along = px * ux + pz * uz;
    const across = px * uz - pz * ux;
    if (along < 0 || along > length || Math.abs(across) > width / 2 + 0.2) return -Infinity;
    return deck(along / length);
  };
  return { group, surface };
}

export async function createAreas({ terrain, colliders, particles, camera }) {
  const group = new THREE.Group();
  const dungeonGroup = new THREE.Group();
  const surfaces = [];
  const { features, heightAt } = terrain;
  const [golem, socials, temple, lotusGarden] = await Promise.all([
    loadGolemTemplate(),
    loadSocialTemplate(),
    loadTempleTemplate(),
    loadLotusGardenTemplate(),
  ]);
  const assets = { golem, socials, temple, lotusGarden };
  const decorBuilders = {
    stones: createStonesDecor,
    isle: createIsleDecor,
    market: createMarketDecor,
    garden: createGardenDecor,
  };
  const built = features.areas.map((area) => {
    if (area.id !== "garden") group.add(createPad(area));
    const beacon = createBeacon(area);
    group.add(beacon.mesh);
    const decor = decorBuilders[area.id]?.(area, heightAt, colliders, particles, assets);
    if (decor) {
      group.add(decor.group);
      if (decor.dungeonGroup) dungeonGroup.add(decor.dungeonGroup);
      if (decor.surface) surfaces.push(decor.surface);
    }
    return { area, beacon, decor };
  });

  if (features.bridge) {
    const bridge = createBridge(features.bridge, heightAt, colliders);
    group.add(bridge.group);
    surfaces.push(bridge.surface);
  }

  return {
    group,
    dungeonGroup,
    surfaces,
    areas: features.areas,
    isInsideDungeon() {
      return built.some(({ decor }) => decor?.isInsideDungeon?.());
    },
    updateDungeonPlayer(dt, input, cameraHeading) {
      for (const { decor } of built) {
        decor?.updateDungeonPlayer?.(dt, input, cameraHeading);
      }
    },
    takeOpened() {
      for (const { decor } of built) {
        const opened = decor?.takeOpened?.();
        if (opened) return opened;
      }
      return null;
    },
    openPrompt() {
      return built.some(({ decor }) => decor?.openPrompt?.());
    },
    socialState() {
      for (const { decor } of built) {
        const state = decor?.socialState?.();
        if (state) return state;
      }
      return null;
    },
    talk() {
      for (const { decor } of built) {
        if (decor?.talk?.()) return true;
      }
      return false;
    },
    talkState() {
      for (const { decor } of built) {
        const state = decor?.talkState?.();
        if (state) return state;
      }
      return null;
    },
    takeTeleport() {
      for (const { decor } of built) {
        const tp = decor?.takeTeleport?.();
        if (tp) return tp;
      }
      return null;
    },
    exitHall() {
      for (const { decor } of built) {
        decor?.exitHall?.();
      }
    },
    update(dt, time, carPosition) {
      let current = null;
      for (const { area, beacon, decor } of built) {
        const distance = Math.hypot(carPosition.x - area.x, carPosition.z - area.z);
        const heightGap = Math.abs((carPosition.y ?? area.y) - area.y);
        const inside = distance < area.radius + 2 && heightGap < 7;
        if (inside) current = area;
        const target = THREE.MathUtils.smoothstep(distance, area.radius * 0.6, area.radius * 2.2);
        beacon.material.uniforms.uFade.value += (target - beacon.material.uniforms.uFade.value) * Math.min(1, dt * 3);
        decor?.update(time, dt, distance < 90, carPosition, camera);
      }
      return current;
    },
  };
}
