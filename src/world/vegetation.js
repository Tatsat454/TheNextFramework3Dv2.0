import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createNoise2D, smoothstep } from "./noise.js";
import { BEACH_TOP } from "./terrain.js";
import { createStylizedMaterial, createTintedInstanceMaterial, flatten, setInstanceTints } from "./shading.js";

function createLeafTexture(random) {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 16; i++) {
    const angle = random() * Math.PI * 2;
    const distance = random() * 30;
    const x = size / 2 + Math.cos(angle) * distance;
    const y = size / 2 + Math.sin(angle) * distance;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(random() * Math.PI);
    ctx.beginPath();
    ctx.ellipse(0, 0, 10 + random() * 12, 6 + random() * 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

function createCrownGeometry(random) {
  const planes = [];
  for (let i = 0; i < 70; i++) {
    const plane = new THREE.PlaneGeometry(0.95, 0.95);
    const spherical = new THREE.Spherical(1 - Math.pow(random(), 3), Math.acos(2 * random() - 1), random() * Math.PI * 2);
    const center = new THREE.Vector3().setFromSpherical(spherical);
    plane.rotateZ(random() * Math.PI * 2);
    plane.rotateY(random() * Math.PI * 2);
    plane.rotateX(random() * Math.PI * 2);
    plane.translate(center.x, center.y, center.z);
    const outward = center.clone().normalize();
    const normals = new Float32Array(12);
    const position = plane.attributes.position;
    const vertex = new THREE.Vector3();
    for (let v = 0; v < 4; v++) {
      vertex.fromBufferAttribute(position, v).lerp(outward, 0.82).normalize();
      vertex.toArray(normals, v * 3);
    }
    plane.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    planes.push(plane);
  }
  return mergeGeometries(planes);
}

function createPineGeometry() {
  const layers = [
    { radius: 1.7, height: 2.4, y: 2.0 },
    { radius: 1.3, height: 2.1, y: 3.2 },
    { radius: 0.85, height: 1.8, y: 4.3 },
  ];
  const parts = layers.map(({ radius, height, y }) => {
    const cone = new THREE.ConeGeometry(radius, height, 7, 1);
    cone.translate(0, y, 0);
    return cone.toNonIndexed();
  });
  return flatten(mergeGeometries(parts));
}

export function createVegetation({ terrain, random, colliders, avoid }) {
  const group = new THREE.Group();
  const forestNoise = createNoise2D(random);
  const placed = [];
  const tooClose = (x, z, minDistance) => placed.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < minDistance * minDistance);
  const blocked = (x, z) => avoid.some((zone) => Math.hypot(x - zone.x, z - zone.z) < zone.radius);

  const trees = [];
  const pines = [];
  for (let attempt = 0; attempt < 30000 && trees.length + pines.length < 520; attempt++) {
    const x = (random() - 0.5) * 360;
    const z = (random() - 0.5) * 360;
    const h = terrain.heightAt(x, z);
    if (h < BEACH_TOP + 0.5 || terrain.grassAt(x, z) < 0.6 || terrain.pathAt(x, z) > 0.02) continue;
    if (terrain.slopeAt(x, z) > 0.12 || blocked(x, z)) continue;
    const density = smoothstep(-0.15, 0.45, forestNoise(x * 0.028, z * 0.028));
    if (random() > density) continue;
    if (tooClose(x, z, 3.4)) continue;
    const scale = 0.8 + random() * 0.55;
    const entry = { x, z, y: h, scale, rotation: random() * Math.PI * 2 };
    placed.push(entry);
    if (h > 11 || random() < 0.22) pines.push(entry);
    else trees.push(entry);
    colliders.push({ x, z, radius: 0.55 * scale });
  }

  const bushes = [];
  for (let attempt = 0; attempt < 20000 && bushes.length < 680; attempt++) {
    const x = (random() - 0.5) * 360;
    const z = (random() - 0.5) * 360;
    const h = terrain.heightAt(x, z);
    if (h < BEACH_TOP + 0.3 || terrain.grassAt(x, z) < 0.45 || terrain.pathAt(x, z) > 0.2) continue;
    if (terrain.slopeAt(x, z) > 0.2 || blocked(x, z)) continue;
    const density = smoothstep(-0.4, 0.5, forestNoise(x * 0.028 + 9, z * 0.028));
    if (random() > density) continue;
    if (tooClose(x, z, 2.2)) continue;
    const entry = { x, z, y: h, scale: 0.55 + random() * 0.6, rotation: random() * Math.PI * 2 };
    placed.push(entry);
    bushes.push(entry);
  }

  const dummy = new THREE.Object3D();
  const leafTexture = createLeafTexture(random);

  const trunkGeometry = flatten(new THREE.CylinderGeometry(0.16, 0.3, 2.6, 6, 1).translate(0, 1.3, 0));
  const trunkMaterial = createTintedInstanceMaterial();
  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, trees.length + pines.length);
  const trunkTints = [];
  [...trees, ...pines].forEach((tree, index) => {
    dummy.position.set(tree.x, tree.y - 0.1, tree.z);
    dummy.rotation.set(0, tree.rotation, 0);
    dummy.scale.setScalar(tree.scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(index, dummy.matrix);
    trunkTints.push(new THREE.Color().setHSL(0.07, 0.42, 0.34 + random() * 0.08));
  });
  setInstanceTints(trunkGeometry, trunkTints);
  trunks.castShadow = true;
  trunks.receiveShadow = true;
  group.add(trunks);

  const crownGeometry = createCrownGeometry(random);
  const crowns = [];
  const crownTints = [];
  const leafPalette = ["#7fd256", "#64bf47", "#93dc5e", "#55ac44", "#a3d65a"].map((c) => new THREE.Color(c));
  for (const tree of trees) {
    const tint = leafPalette[Math.floor(random() * leafPalette.length)];
    const s = tree.scale;
    crowns.push({ x: tree.x, y: tree.y + 3.1 * s, z: tree.z, scale: 1.65 * s, rotation: random() * 6.28 });
    crowns.push({ x: tree.x + (random() - 0.5) * 1.4 * s, y: tree.y + 4.0 * s, z: tree.z + (random() - 0.5) * 1.4 * s, scale: 1.15 * s, rotation: random() * 6.28 });
    crownTints.push(tint.clone().offsetHSL(0, 0, -0.04), tint.clone().offsetHSL(0, 0, 0.03));
  }
  for (const bush of bushes) {
    crowns.push({ x: bush.x, y: bush.y + bush.scale * 0.55, z: bush.z, scale: bush.scale, rotation: bush.rotation });
    crownTints.push(leafPalette[Math.floor(random() * leafPalette.length)].clone().offsetHSL(0.01, 0, -0.06));
  }

  const crownMaterial = createStylizedMaterial({
    side: THREE.DoubleSide,
    defines: { KEEP_NORMAL: "" },
    uniforms: { uLeaf: { value: leafTexture } },
    vertexPars: /* glsl */ `
      attribute vec3 aTint;
      varying vec3 vTint;
      varying vec2 vLeafUv;
    `,
    vertexMain: /* glsl */ `
      vec3 rootPosition = vec3(instanceMatrix[3]);
      float sway = sin(uTime * 1.3 + rootPosition.x * 0.15 + rootPosition.z * 0.11);
      transformed.x += sway * 0.05 * (position.y + 1.0);
      transformed.z += cos(uTime * 1.05 + rootPosition.z * 0.17) * 0.04 * (position.y + 1.0);
      float flutter = sin(uTime * 2.1 + position.x * 2.7 + position.y * 1.9 + rootPosition.x) * 0.4;
      vec2 centered = uv - 0.5;
      vLeafUv = vec2(centered.x * cos(flutter) - centered.y * sin(flutter), centered.x * sin(flutter) + centered.y * cos(flutter)) + 0.5;
      vTint = aTint;
    `,
    fragmentPars: /* glsl */ `
      uniform sampler2D uLeaf;
      varying vec3 vTint;
      varying vec2 vLeafUv;
    `,
    fragmentMain: /* glsl */ `
      if (texture2D(uLeaf, vLeafUv).a < 0.5) discard;
      outColor = stylize(vTint, normal, vWorldPosition, 0.0, shadowMask);
    `,
  });
  const crownMesh = new THREE.InstancedMesh(crownGeometry, crownMaterial, crowns.length);
  crowns.forEach((crown, index) => {
    dummy.position.set(crown.x, crown.y, crown.z);
    dummy.rotation.set(0, crown.rotation, 0);
    dummy.scale.setScalar(crown.scale);
    dummy.updateMatrix();
    crownMesh.setMatrixAt(index, dummy.matrix);
  });
  setInstanceTints(crownGeometry, crownTints);
  crownMesh.castShadow = true;
  crownMesh.receiveShadow = true;
  crownMesh.customDepthMaterial = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    alphaMap: leafTexture,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  });
  group.add(crownMesh);

  const pineGeometry = createPineGeometry();
  const pineMesh = new THREE.InstancedMesh(pineGeometry, createTintedInstanceMaterial(), pines.length);
  const pineTints = [];
  pines.forEach((pine, index) => {
    dummy.position.set(pine.x, pine.y, pine.z);
    dummy.rotation.set(0, pine.rotation, 0);
    dummy.scale.setScalar(pine.scale);
    dummy.updateMatrix();
    pineMesh.setMatrixAt(index, dummy.matrix);
    pineTints.push(new THREE.Color("#3f9a62").offsetHSL((random() - 0.5) * 0.04, 0, (random() - 0.5) * 0.08));
  });
  setInstanceTints(pineGeometry, pineTints);
  pineMesh.castShadow = true;
  pineMesh.receiveShadow = true;
  group.add(pineMesh);

  return { group, count: { trees: trees.length, pines: pines.length, bushes: bushes.length } };
}
