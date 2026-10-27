import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { createEmissiveMaterial, createSolidMaterial, shared } from "./shading.js";
import { damp } from "./noise.js";

const WHEEL_RADIUS = 0.52;
const HALF_LENGTH = 1.35;
const HALF_WIDTH = 0.95;
const CAR_RADIUS = 1.35;
const GRAVITY = 34;
const WORLD_LIMIT = 198;

function buildCar() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const paint = createSolidMaterial("#ff5b4a");
  const cream = createSolidMaterial("#fff1dc");
  const dark = createSolidMaterial("#2f2c45");
  const glass = createSolidMaterial("#8fd6ff");
  const chrome = createSolidMaterial("#d7d9ea");

  const chassis = new THREE.Mesh(new RoundedBoxGeometry(2.05, 0.7, 3.2, 3, 0.26), paint);
  chassis.position.y = 0.95;
  body.add(chassis);
  const cabin = new THREE.Mesh(new RoundedBoxGeometry(1.7, 0.72, 1.6, 3, 0.24), cream);
  cabin.position.set(0, 1.58, -0.25);
  body.add(cabin);
  const windshield = new THREE.Mesh(new RoundedBoxGeometry(1.56, 0.5, 0.12, 2, 0.05), glass);
  windshield.position.set(0, 1.6, 0.56);
  windshield.rotation.x = -0.32;
  body.add(windshield);
  const rearWindow = windshield.clone();
  rearWindow.position.set(0, 1.6, -1.06);
  rearWindow.rotation.x = 0.3;
  body.add(rearWindow);
  for (const side of [-1, 1]) {
    const window = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.42, 1.2, 2, 0.04), glass);
    window.position.set(side * 0.86, 1.62, -0.25);
    body.add(window);
  }
  const bumperGeometry = new RoundedBoxGeometry(2.15, 0.28, 0.3, 2, 0.12);
  const frontBumper = new THREE.Mesh(bumperGeometry, chrome);
  frontBumper.position.set(0, 0.72, 1.62);
  const rearBumper = frontBumper.clone();
  rearBumper.position.z = -1.62;
  body.add(frontBumper, rearBumper);
  const stripe = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.06, 3.22, 2, 0.02), cream);
  stripe.position.set(0, 1.31, 0);
  body.add(stripe);

  const lampMaterial = createEmissiveMaterial("#fff6d0");
  const tailMaterial = createEmissiveMaterial("#ff3b3b");
  const lampGeometry = new THREE.CylinderGeometry(0.18, 0.18, 0.1, 12).rotateX(Math.PI / 2);
  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(lampGeometry, lampMaterial);
    lamp.position.set(side * 0.66, 1.0, 1.61);
    body.add(lamp);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.06), tailMaterial);
    tail.position.set(side * 0.7, 1.06, -1.61);
    body.add(tail);
  }

  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 4), dark);
  antenna.position.set(-0.7, 1.95, -1.1);
  body.add(antenna);
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.26, 0.42), createSolidMaterial("#ffd23f"));
  flag.position.set(-0.7, 2.38, -1.32);
  body.add(flag);

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
        gl_FragColor = vec4(vec3(1.0, 0.94, 0.72) * pow(vAlong, 1.6) * uNight * 0.32, 1.0);
      }
    `,
  });
  const beamGeometry = new THREE.ConeGeometry(2.6, 13, 20, 1, true);
  beamGeometry.translate(0, -6.5, 0);
  beamGeometry.rotateX(-Math.PI / 2);
  for (const side of [-1, 1]) {
    const beam = new THREE.Mesh(beamGeometry, beamMaterial);
    beam.position.set(side * 0.66, 1.0, 1.65);
    beam.rotation.x = 0.12;
    body.add(beam);
  }

  body.traverse((child) => {
    if (child.isMesh && child.material !== beamMaterial) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  const wheels = [];
  const tireMaterial = dark;
  const hubMaterial = createSolidMaterial("#f2f2f8");
  const tireGeometry = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.46, 14).rotateZ(Math.PI / 2);
  const hubGeometry = new THREE.CylinderGeometry(0.24, 0.24, 0.5, 8).rotateZ(Math.PI / 2);
  for (const [x, z, front] of [
    [-1, 1, true],
    [1, 1, true],
    [-1, -1, false],
    [1, -1, false],
  ]) {
    const steer = new THREE.Group();
    steer.position.set(x * 1.02, WHEEL_RADIUS, z * 1.0);
    const spin = new THREE.Group();
    const tire = new THREE.Mesh(tireGeometry, tireMaterial);
    const hub = new THREE.Mesh(hubGeometry, hubMaterial);
    tire.castShadow = true;
    spin.add(tire, hub);
    steer.add(spin);
    root.add(steer);
    wheels.push({ steer, spin, front, baseY: WHEEL_RADIUS, offset: 0 });
  }

  return { root, body, wheels, lampMaterial, tailMaterial, flag };
}

export function createVehicle({ spawn, heading = 0, groundHeight, terrain, colliders, particles }) {
  const car = buildCar();
  const position = new THREE.Vector3(spawn.x, groundHeight(spawn.x, spawn.z), spawn.z);
  const velocity = new THREE.Vector2();
  const safe = { x: spawn.x, z: spawn.z, heading };
  const gradient = new THREE.Vector2();
  const forward = new THREE.Vector2();
  const lateral = new THREE.Vector2();
  const state = {
    heading,
    vy: 0,
    grounded: true,
    steer: 0,
    pitch: 0,
    roll: 0,
    bodyOffset: 0,
    bodyVelocity: 0,
    bodyPitch: 0,
    bodyRoll: 0,
    lastForwardSpeed: 0,
    lastLateralSpeed: 0,
    airTime: 0,
    sinkTimer: 0,
    safeTimer: 0,
    dustTimer: 0,
    impact: 0,
    inWater: false,
    jumpLatch: false,
  };

  const respawn = (x, z, h) => {
    position.set(x, groundHeight(x, z) + 2.5, z);
    velocity.set(0, 0);
    state.vy = 0;
    state.heading = h;
    state.grounded = false;
    state.sinkTimer = 0;
    car.root.visible = true;
  };

  const surfaceColor = (x, z) => {
    const h = terrain.heightAt(x, z);
    if (terrain.pathAt(x, z) > 0.4) return "#dcb07a";
    if (h < 2.1) return "#f1d8a6";
    if (terrain.grassAt(x, z) > 0.4) return "#a9d66b";
    return "#c7c4d6";
  };

  const emitWheelDust = (intensity) => {
    const backX = Math.sin(state.heading) * -1.1;
    const backZ = Math.cos(state.heading) * -1.1;
    for (const side of [-1, 1]) {
      const sx = Math.cos(state.heading) * side * 0.95;
      const sz = -Math.sin(state.heading) * side * 0.95;
      const px = position.x + backX + sx;
      const pz = position.z + backZ + sz;
      particles.emit({
        position: new THREE.Vector3(px, position.y + 0.2, pz),
        velocity: new THREE.Vector3(-velocity.x * 0.15, 1.2 * intensity, -velocity.y * 0.15),
        color: surfaceColor(px, pz),
        size: 0.55 + intensity * 0.5,
        life: 0.7 + intensity * 0.4,
        gravity: 0.6,
        spread: 0.3,
      });
    }
  };

  const splash = (strength) => {
    const count = Math.round(4 + strength * 6);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 2.5 * strength;
      particles.emit({
        position: new THREE.Vector3(position.x, 0.1, position.z),
        velocity: new THREE.Vector3(Math.cos(angle) * speed + velocity.x * 0.3, 4 + Math.random() * 4 * strength, Math.sin(angle) * speed + velocity.y * 0.3),
        color: "#e9fbff",
        size: 0.45 + Math.random() * 0.4,
        life: 0.9,
        gravity: -16,
        spread: 1.4,
      });
    }
  };

  const update = (dt, input) => {
    state.impact = 0;
    if (state.sinkTimer > 0) {
      state.sinkTimer += dt;
      position.y -= dt * 2.2;
      velocity.multiplyScalar(Math.exp(-4 * dt));
      position.x += velocity.x * dt;
      position.z += velocity.y * dt;
      if (state.sinkTimer > 1.5) respawn(safe.x, safe.z, safe.heading);
      syncVisuals(dt, input);
      return;
    }

    if (input.reset) {
      respawn(safe.x, safe.z, safe.heading);
    }

    forward.set(Math.sin(state.heading), Math.cos(state.heading));
    lateral.set(Math.cos(state.heading), -Math.sin(state.heading));
    let forwardSpeed = velocity.dot(forward);
    let lateralSpeed = velocity.dot(lateral);

    const throttle = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
    const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    state.steer = damp(state.steer, steerTarget, 10, dt);
    const boosting = input.boost && throttle > 0;
    const topSpeed = boosting ? 36 : 23;
    const grip = state.grounded ? 1 : 0.15;

    if (throttle > 0) {
      const headroom = Math.max(0, 1 - forwardSpeed / topSpeed);
      forwardSpeed += (boosting ? 44 : 30) * headroom * grip * dt;
    } else if (throttle < 0) {
      if (forwardSpeed > 0.5) forwardSpeed -= 46 * grip * dt;
      else forwardSpeed = Math.max(-10, forwardSpeed - 18 * grip * dt);
    } else {
      forwardSpeed *= Math.exp(-(state.grounded ? 1.1 : 0.1) * dt);
    }
    if (forwardSpeed > topSpeed) forwardSpeed = damp(forwardSpeed, topSpeed, 1.5, dt);

    const lateralGrip = state.grounded ? (input.boost ? 4.5 : 9) : 0.6;
    lateralSpeed = damp(lateralSpeed, 0, lateralGrip, dt);

    const steerAuthority = Math.min(1, Math.abs(forwardSpeed) / 5) * Math.sign(forwardSpeed);
    const turnRate = 2.35 * (1 - Math.min(0.45, Math.abs(forwardSpeed) / 70));
    state.heading += state.steer * steerAuthority * turnRate * (state.grounded ? 1 : 0.45) * dt;

    forward.set(Math.sin(state.heading), Math.cos(state.heading));
    lateral.set(Math.cos(state.heading), -Math.sin(state.heading));
    velocity.set(
      forward.x * forwardSpeed + lateral.x * lateralSpeed,
      forward.y * forwardSpeed + lateral.y * lateralSpeed
    );

    if (state.grounded) {
      terrain.gradientAt(position.x, position.z, gradient);
      velocity.addScaledVector(gradient, -12 * dt);
    }

    const ground0 = groundHeight(position.x, position.z);
    let nextX = position.x + velocity.x * dt;
    let nextZ = position.z + velocity.y * dt;

    const baseY = Math.max(position.y, ground0);
    const blocked = (x, z) => {
      const rise = groundHeight(x, z) - baseY;
      const step = Math.hypot(x - position.x, z - position.z);
      return rise > 0.06 && rise / Math.max(step, 1e-3) > 1.3;
    };
    if (blocked(nextX, nextZ)) {
      terrain.gradientAt(nextX, nextZ, gradient);
      if (gradient.lengthSq() > 0) {
        gradient.normalize();
        const into = velocity.dot(gradient);
        if (into > 0) {
          state.impact = Math.max(state.impact, into);
          velocity.addScaledVector(gradient, -into * 1.4);
        }
      }
      nextX = position.x + velocity.x * dt;
      nextZ = position.z + velocity.y * dt;
      if (blocked(nextX, nextZ)) {
        state.impact = Math.max(state.impact, velocity.length() * 0.6);
        velocity.multiplyScalar(-0.3);
        nextX = position.x;
        nextZ = position.z;
      }
    }

    for (const collider of colliders) {
      const dx = nextX - collider.x;
      const dz = nextZ - collider.z;
      const minDistance = collider.radius + CAR_RADIUS * 0.85;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq >= minDistance * minDistance || distanceSq === 0) continue;
      if (collider.height !== undefined && position.y > collider.height) continue;
      if (collider.minY !== undefined && position.y < collider.minY) continue;
      const distance = Math.sqrt(distanceSq);
      const nx = dx / distance;
      const nz = dz / distance;
      nextX = collider.x + nx * minDistance;
      nextZ = collider.z + nz * minDistance;
      const into = velocity.x * nx + velocity.y * nz;
      if (into < 0) {
        state.impact = Math.max(state.impact, -into);
        velocity.x -= nx * into * 1.35;
        velocity.y -= nz * into * 1.35;
      }
    }

    const limit = Math.hypot(nextX, nextZ);
    if (limit > WORLD_LIMIT) {
      nextX *= WORLD_LIMIT / limit;
      nextZ *= WORLD_LIMIT / limit;
    }

    position.x = nextX;
    position.z = nextZ;
    const ground = groundHeight(position.x, position.z);

    if (state.grounded) {
      const followVy = THREE.MathUtils.clamp((ground - ground0) / Math.max(dt, 1e-4), -30, 30);
      if (input.jump && !state.jumpLatch) {
        state.vy = Math.max(followVy, 0) + 11;
        state.grounded = false;
        position.y = ground + 0.05;
      } else if (ground < position.y - 0.45) {
        state.grounded = false;
      } else {
        position.y = ground;
        state.vy = followVy;
      }
    } else {
      state.vy -= GRAVITY * dt;
      position.y += state.vy * dt;
      state.airTime += dt;
      if (position.y <= ground) {
        const landing = -state.vy;
        position.y = ground;
        state.grounded = true;
        state.bodyVelocity -= Math.min(10, landing * 0.35);
        if (landing > 6) {
          state.impact = Math.max(state.impact, landing * 0.5);
          for (let i = 0; i < 3; i++) emitWheelDust(1.2);
        }
        state.vy = 0;
        state.airTime = 0;
      }
    }
    state.jumpLatch = input.jump;

    const waterDepth = -ground;
    const wasInWater = state.inWater;
    state.inWater = position.y < 0.35 && waterDepth > 0.15;
    if (state.inWater) {
      velocity.multiplyScalar(Math.exp(-(1.2 + waterDepth * 1.6) * dt));
      if (!wasInWater) splash(Math.min(2, velocity.length() / 10 + 0.4));
      if (velocity.lengthSq() > 4 && Math.random() < 0.5) splash(0.25);
      if (waterDepth > 2.1) {
        state.sinkTimer = dt;
        splash(1.6);
      }
    }

    if (state.grounded && !state.inWater && ground > 1.2) {
      state.safeTimer += dt;
      if (state.safeTimer > 0.6) {
        state.safeTimer = 0;
        safe.x = position.x;
        safe.z = position.z;
        safe.heading = state.heading;
      }
    }

    const speed = velocity.length();
    if (state.grounded && !state.inWater && speed > 4) {
      state.dustTimer += dt * (speed / 10 + Math.abs(lateralSpeed) * 0.3);
      while (state.dustTimer > 0.06) {
        state.dustTimer -= 0.06;
        emitWheelDust(Math.min(1.4, speed / 24 + Math.abs(lateralSpeed) / 8));
      }
    }

    const forwardAccel = (forwardSpeed - state.lastForwardSpeed) / Math.max(dt, 1e-4);
    const lateralAccel = state.steer * forwardSpeed * 0.9;
    state.lastForwardSpeed = forwardSpeed;
    state.bodyPitch = damp(state.bodyPitch, THREE.MathUtils.clamp(-forwardAccel * 0.004, -0.09, 0.09), 6, dt);
    state.bodyRoll = damp(state.bodyRoll, THREE.MathUtils.clamp(lateralAccel * 0.006, -0.14, 0.14), 6, dt);

    syncVisuals(dt, input, forwardSpeed);
  };

  const syncVisuals = (dt, input, forwardSpeed = 0) => {
    const sin = Math.sin(state.heading);
    const cos = Math.cos(state.heading);
    const sample = (lx, lz) => groundHeight(position.x + sin * lz + cos * lx, position.z + cos * lz - sin * lx);
    let targetPitch = 0;
    let targetRoll = 0;
    if (state.grounded) {
      const front = sample(0, HALF_LENGTH);
      const back = sample(0, -HALF_LENGTH);
      const left = sample(HALF_WIDTH, 0);
      const right = sample(-HALF_WIDTH, 0);
      targetPitch = Math.atan2(back - front, HALF_LENGTH * 2);
      targetRoll = Math.atan2(left - right, HALF_WIDTH * 2);
    } else {
      targetPitch = THREE.MathUtils.clamp(-state.vy * 0.025, -0.4, 0.4);
    }
    state.pitch = damp(state.pitch, targetPitch, state.grounded ? 14 : 2.5, dt);
    state.roll = damp(state.roll, targetRoll, state.grounded ? 14 : 2.5, dt);

    const spring = -state.bodyOffset * 140 - state.bodyVelocity * 11;
    state.bodyVelocity += spring * dt;
    state.bodyOffset += state.bodyVelocity * dt;

    car.root.position.copy(position);
    car.root.rotation.set(state.pitch, state.heading, state.roll, "YXZ");
    car.body.position.y = state.bodyOffset * 0.6;
    car.body.rotation.set(state.bodyPitch, 0, state.bodyRoll);

    for (const wheel of car.wheels) {
      wheel.spin.rotation.x += (forwardSpeed / WHEEL_RADIUS) * dt;
      if (wheel.front) wheel.steer.rotation.y = state.steer * 0.42;
    }
    car.flag.rotation.y = Math.sin(performance.now() * 0.012) * 0.25 - Math.min(0.6, Math.abs(forwardSpeed) * 0.03);

    const night = shared.uNight.value;
    car.lampMaterial.color.setRGB(1, 0.96, 0.82).multiplyScalar(0.7 + night * 0.8);
    const braking = input.backward && forwardSpeed > 0.5;
    car.tailMaterial.color.setRGB(1, 0.22, 0.22).multiplyScalar(braking ? 1.6 : 0.55 + night * 0.4);
  };

  syncVisuals(0, {});

  return {
    group: car.root,
    position,
    velocity,
    state,
    radius: CAR_RADIUS,
    get speed() {
      return velocity.length();
    },
    get heading() {
      return state.heading;
    },
    update,
    teleport(x, z, h) {
      respawn(x, z, h);
      safe.x = x;
      safe.z = z;
      safe.heading = h;
    },
  };
}
