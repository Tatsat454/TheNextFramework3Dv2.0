import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { damp } from "./noise.js";
import { createEmissiveMaterial, createSolidMaterial, flatten } from "./shading.js";

function part(geometry, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(flatten(geometry), material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function createHumanExplorer() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const skinMat = createSolidMaterial("#f4c59e");
  const hairMat = createSolidMaterial("#242038");
  const tunicMat = createSolidMaterial("#1c3f7a");
  const creamMat = createSolidMaterial("#f3e5ce");
  const goldMat = createSolidMaterial("#e8ad3a");
  const pantsMat = createSolidMaterial("#262b40");
  const bootMat = createSolidMaterial("#54331c");
  const packMat = createSolidMaterial("#7f5236");
  const visorGlow = createEmissiveMaterial("#4fd2ff");

  // Torso & Scholar Jacket (y = 0.85 -> 1.50)
  const torso = new THREE.Group();
  torso.position.y = 1.12;
  body.add(torso);

  // Blue tunic base. Overlay plates sit clearly in front / outside so gold vs blue
  // never share a depth plane (neck collar flicker confirmed by coplanarSiblingPairs logs).
  torso.add(part(new RoundedBoxGeometry(0.54, 0.64, 0.32, 2, 0.06), tunicMat, 0, 0, 0));
  torso.add(part(new RoundedBoxGeometry(0.24, 0.58, 0.06, 1, 0.03), creamMat, 0, 0.02, 0.19));
  // Gold belt & collar trim — thicker + offset so they wrap outside the tunic shell
  torso.add(part(new RoundedBoxGeometry(0.58, 0.09, 0.38, 1, 0.02), goldMat, 0, -0.22, 0));
  torso.add(part(new RoundedBoxGeometry(0.14, 0.12, 0.08, 1, 0.02), goldMat, 0, -0.22, 0.2));
  torso.add(part(new RoundedBoxGeometry(0.44, 0.07, 0.38, 1, 0.02), goldMat, 0, 0.31, 0.02));

  // Explorer Backpack / Research Satchel on back (-Z is back when facing +Z)
  torso.add(part(new RoundedBoxGeometry(0.40, 0.44, 0.20, 2, 0.05), packMat, 0, 0.04, -0.24));
  torso.add(part(new RoundedBoxGeometry(0.42, 0.14, 0.22, 1, 0.03), goldMat, 0, 0.16, -0.24));
  // Rolled scroll attached to top of backpack
  torso.add(part(new THREE.CylinderGeometry(0.06, 0.06, 0.46, 10), creamMat, 0, 0.30, -0.24, 0, 0, Math.PI / 2));

  // Head & Neck (y = 1.46 -> 1.98)
  const head = new THREE.Group();
  head.position.set(0, 0.56, 0);
  torso.add(head);

  head.add(part(new THREE.CylinderGeometry(0.10, 0.12, 0.14, 10), skinMat, 0, -0.18, 0));
  head.add(part(new RoundedBoxGeometry(0.44, 0.44, 0.42, 3, 0.09), skinMat, 0, 0.04, 0));
  // Stylized Hair + Crown
  head.add(part(new RoundedBoxGeometry(0.48, 0.20, 0.46, 2, 0.06), hairMat, 0, 0.22, -0.01));
  head.add(part(new RoundedBoxGeometry(0.48, 0.36, 0.18, 2, 0.05), hairMat, 0, 0.06, -0.16));
  head.add(part(new RoundedBoxGeometry(0.46, 0.12, 0.14, 2, 0.04), hairMat, 0.04, 0.18, 0.18, 0.15, 0, -0.08));
  // Golden headband + eyes on +Z front face
  head.add(part(new RoundedBoxGeometry(0.47, 0.06, 0.44, 1, 0.02), goldMat, 0, 0.13, 0.01));
  head.add(part(new RoundedBoxGeometry(0.07, 0.08, 0.04, 1, 0.01), hairMat, -0.10, 0.03, 0.21));
  head.add(part(new RoundedBoxGeometry(0.07, 0.08, 0.04, 1, 0.01), hairMat, 0.10, 0.03, 0.21));
  head.add(part(new THREE.SphereGeometry(0.04, 8, 6), visorGlow, 0, 0.13, 0.23));

  // Articulated Left & Right Arms
  const makeArm = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.36, 0.22, 0);
    torso.add(pivot);
    pivot.add(part(new RoundedBoxGeometry(0.17, 0.34, 0.17, 2, 0.04), tunicMat, 0, -0.14, 0));
    pivot.add(part(new RoundedBoxGeometry(0.18, 0.06, 0.18, 1, 0.02), goldMat, 0, -0.28, 0));
    pivot.add(part(new RoundedBoxGeometry(0.14, 0.22, 0.14, 2, 0.04), skinMat, 0, -0.40, 0));
    return pivot;
  };
  const leftArm = makeArm(1);
  const rightArm = makeArm(-1);

  // Articulated Left & Right Legs
  const makeLeg = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.15, 0.80, 0);
    body.add(pivot);
    pivot.add(part(new RoundedBoxGeometry(0.20, 0.48, 0.20, 2, 0.04), pantsMat, 0, -0.24, 0));
    pivot.add(part(new RoundedBoxGeometry(0.22, 0.34, 0.26, 2, 0.04), bootMat, 0, -0.63, 0.03));
    pivot.add(part(new RoundedBoxGeometry(0.23, 0.06, 0.24, 1, 0.02), goldMat, 0, -0.48, 0.01));
    return pivot;
  };
  const leftLeg = makeLeg(1);
  const rightLeg = makeLeg(-1);

  const position = new THREE.Vector3(0, 0, -13.5);
  const velocity = new THREE.Vector2(0, 0);
  const state = {
    heading: 0,
    vy: 0,
    grounded: true,
    walkPhase: 0,
    jumpLatch: false,
  };

  const RADIUS = 0.55;
  const GRAVITY = 26;
  // Boots are modeled with their soles at local y≈0 — keep a clear gap above the floor
  // so idle/walk bob never z-fights the carpet (confirmed by floorGap logs).
  const FOOT_CLEARANCE = 0.05;

  const spawn = (x, y, z, heading = 0) => {
    position.set(x, y + FOOT_CLEARANCE, z);
    velocity.set(0, 0);
    state.heading = heading;
    state.vy = 0;
    state.grounded = true;
    body.position.y = 0;
    root.position.copy(position);
    root.rotation.set(0, heading, 0);
  };

  const update = (dt, input, cameraHeading, surfaceAt, colliders, bounds) => {
    const moveForward = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
    const moveRight = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const isMoving = moveForward !== 0 || moveRight !== 0;
    const maxSpeed = input.boost ? 11.5 : 7.6;
    const hall = bounds ?? { minX: -13.6, maxX: 13.6, minZ: -16.6, maxZ: 16.4 };

    if (isMoving) {
      // Camera-relative movement direction
      const inputAngle = Math.atan2(-moveRight, moveForward);
      const targetHeading = cameraHeading + inputAngle;
      const targetVx = Math.sin(targetHeading) * maxSpeed;
      const targetVz = Math.cos(targetHeading) * maxSpeed;
      velocity.x = damp(velocity.x, targetVx, 12, dt);
      velocity.y = damp(velocity.y, targetVz, 12, dt);

      // Smoothly rotate character toward movement direction
      const deltaAngle = THREE.MathUtils.euclideanModulo(targetHeading - state.heading + Math.PI, Math.PI * 2) - Math.PI;
      state.heading += deltaAngle * (1 - Math.exp(-14 * dt));
    } else {
      velocity.x = damp(velocity.x, 0, 14, dt);
      velocity.y = damp(velocity.y, 0, 14, dt);
    }

    let nextX = position.x + velocity.x * dt;
    let nextZ = position.z + velocity.y * dt;

    // Collide with indoor columns, walls, and statue pedestals
    for (const c of colliders) {
      const dx = nextX - c.x;
      const dz = nextZ - c.z;
      const minD = c.radius + RADIUS;
      const dSq = dx * dx + dz * dz;
      if (dSq < minD * minD && dSq > 1e-6) {
        const d = Math.sqrt(dSq);
        const nx = dx / d;
        const nz = dz / d;
        nextX = c.x + nx * minD;
        nextZ = c.z + nz * minD;
      }
    }

    // Clamp inside the current hall shell (temple default, arcade overrides)
    nextX = THREE.MathUtils.clamp(nextX, hall.minX, hall.maxX);
    nextZ = THREE.MathUtils.clamp(nextZ, hall.minZ, hall.maxZ);

    position.x = nextX;
    position.z = nextZ;

    const floorY = surfaceAt(position.x, position.z);
    const standY = floorY + FOOT_CLEARANCE;
    if (state.grounded) {
      if (input.jump && !state.jumpLatch) {
        state.vy = 9.2;
        state.grounded = false;
        position.y += 0.05;
      } else if (standY > position.y) {
        // Snap up onto raised floors/stages so damp lag can't bury boots in geometry.
        position.y = standY;
        state.vy = 0;
      } else {
        position.y = damp(position.y, standY, 18, dt);
        state.vy = 0;
      }
    } else {
      state.vy -= GRAVITY * dt;
      position.y += state.vy * dt;
      if (position.y <= standY) {
        position.y = standY;
        state.vy = 0;
        state.grounded = true;
      }
    }
    state.jumpLatch = Boolean(input.jump);

    // Animate walking / running limbs & bobbing
    const speed = velocity.length();
    if (speed > 0.25 && state.grounded) {
      state.walkPhase += dt * (4.5 + speed * 0.95);
      const swing = Math.sin(state.walkPhase) * Math.min(0.75, speed * 0.085);
      leftLeg.rotation.x = swing;
      rightLeg.rotation.x = -swing;
      leftArm.rotation.x = -swing * 0.85;
      rightArm.rotation.x = swing * 0.85;
      body.position.y = Math.abs(Math.sin(state.walkPhase)) * 0.08;
      torso.rotation.x = Math.min(0.14, speed * 0.012);
    } else if (!state.grounded) {
      leftLeg.rotation.x = damp(leftLeg.rotation.x, 0.35, 10, dt);
      rightLeg.rotation.x = damp(rightLeg.rotation.x, -0.25, 10, dt);
      leftArm.rotation.x = damp(leftArm.rotation.x, -0.55, 10, dt);
      rightArm.rotation.x = damp(rightArm.rotation.x, -0.55, 10, dt);
    } else {
      state.walkPhase += dt * 2.0;
      leftLeg.rotation.x = damp(leftLeg.rotation.x, 0, 12, dt);
      rightLeg.rotation.x = damp(rightLeg.rotation.x, 0, 12, dt);
      leftArm.rotation.x = damp(leftArm.rotation.x, 0, 12, dt);
      rightArm.rotation.x = damp(rightArm.rotation.x, 0, 12, dt);
      // Positive-only idle bob — negative sin previously drove boots under the floor.
      body.position.y = Math.abs(Math.sin(state.walkPhase)) * 0.02;
      torso.rotation.x = damp(torso.rotation.x, 0, 10, dt);
    }

    root.position.copy(position);
    root.rotation.set(0, state.heading, 0);
  };

  return {
    group: root,
    position,
    velocity,
    get heading() {
      return state.heading;
    },
    get speed() {
      return velocity.length();
    },
    spawn,
    update,
  };
}
