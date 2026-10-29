import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { createEmissiveMaterial, createSolidMaterial, shared } from "./shading.js";
import { damp, dampAngle } from "./noise.js";
import { F1CarController } from "./f1CarController.js";

const F1_TARGET_LENGTH = 7.1; // 2x prior scale — user-requested size
const F1_CLEARANCE = 0.28; // lift so pitched body/wheels don't bury into terrain

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

const FLY_HOVER = 9;
const FLY_CEILING = 78;
const FLY_CLEARANCE = 1.6;

function buildUfo() {
  const holder = new THREE.Group();
  const body = new THREE.Group();
  const rimSpin = new THREE.Group();
  holder.add(body);
  body.add(rimSpin);

  const hull = createSolidMaterial("#ece7f8");
  const teal = createSolidMaterial("#3ad1c4");
  const navy = createSolidMaterial("#2f2c45");
  const cream = createSolidMaterial("#fff1dc");
  const glass = createSolidMaterial("#8fd6ff");
  const chrome = createSolidMaterial("#d7d9ea");
  const lampMaterial = createEmissiveMaterial("#ffd56a");
  const coreMaterial = createEmissiveMaterial("#7ef6ff");
  const visorMaterial = createEmissiveMaterial("#9af7ff");

  const saucer = new THREE.Mesh(new THREE.SphereGeometry(1.62, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hull);
  saucer.scale.set(1, 0.34, 1);
  saucer.position.y = 0.62;
  body.add(saucer);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(1.38, 24, 12, 0, Math.PI * 2, Math.PI * 0.48, Math.PI * 0.45), chrome);
  belly.scale.set(1, 0.3, 1);
  belly.position.y = 0.5;
  body.add(belly);

  const band = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.18, 12, 32), teal);
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.64;
  rimSpin.add(band);

  const cabin = new THREE.Mesh(new THREE.SphereGeometry(0.78, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.58), glass);
  cabin.position.y = 1.08;
  body.add(cabin);

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.96, 0.16, 18), cream);
  collar.position.y = 0.86;
  body.add(collar);

  const seat = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), coreMaterial);
  seat.position.y = 0.86;
  body.add(seat);

  const visor = new THREE.Mesh(new RoundedBoxGeometry(0.78, 0.2, 0.12, 2, 0.05), visorMaterial);
  visor.position.set(0, 1.02, 0.68);
  visor.rotation.x = -0.18;
  body.add(visor);

  const well = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.56, 0.18, 14), navy);
  well.position.y = 0.2;
  body.add(well);
  const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 12), coreMaterial);
  hatch.position.y = 0.12;
  body.add(hatch);

  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), lampMaterial);
    lamp.position.set(Math.sin(angle) * 1.5, 0.54, Math.cos(angle) * 1.5);
    rimSpin.add(lamp);
  }

  const fin = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.42, 0.55, 2, 0.04), teal);
  fin.position.set(0, 0.92, -1.05);
  fin.rotation.x = 0.35;
  body.add(fin);
  for (const side of [-1, 1]) {
    const stab = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.08, 0.28, 2, 0.04), navy);
    stab.position.set(side * 1.18, 0.7, -0.35);
    stab.rotation.z = side * -0.18;
    body.add(stab);
  }

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), navy);
  pole.position.y = 1.62;
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), createEmissiveMaterial("#ff5b4a"));
  bead.position.y = 1.9;
  body.add(pole, bead);

  const beamMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uBeam: { value: 1 } },
    vertexShader: /* glsl */ `
      varying float vAlong;
      void main() {
        vAlong = uv.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uBeam;
      varying float vAlong;
      void main() {
        gl_FragColor = vec4(vec3(0.55, 1.0, 0.92) * pow(1.0 - vAlong, 1.35) * uBeam * 0.58, 1.0);
      }
    `,
  });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(2.1, 9.2, 22, 1, true), beamMaterial);
  beam.position.y = -4.3;
  body.add(beam);

  body.traverse((child) => {
    if (child.isMesh && child.material !== beamMaterial) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  return { holder, body, rimSpin, lampMaterial, coreMaterial, visorMaterial, beamMaterial };
}

function createSonicBoom() {
  const group = new THREE.Group();
  group.visible = false;
  const makeRing = (color, tube) => {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, tube, 8, 36), mat);
    group.add(mesh);
    return { mesh, mat };
  };
  const rings = [makeRing("#f4ffff", 0.07), makeRing("#7ef6ff", 0.16)];
  const flashMat = new THREE.MeshBasicMaterial({
    color: "#ffffff",
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const flash = new THREE.Mesh(new THREE.CircleGeometry(1.35, 24), flashMat);
  group.add(flash);
  return { group, rings, flash, flashMat, time: 0, active: false };
}

async function loadF1Ride() {
  const holder = new THREE.Group();
  holder.visible = false;
  try {
    const gltf = await new GLTFLoader().loadAsync("/f1_rigged.glb");
    const model = gltf.scene;
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });

    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const scale = F1_TARGET_LENGTH / Math.max(size.z, 0.001);
    model.scale.setScalar(scale);
    model.updateMatrixWorld(true);
    const fitted = new THREE.Box3().setFromObject(model);
    const center = fitted.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -fitted.min.y, -center.z);
    holder.add(model);
    model.updateMatrixWorld(true);
    const after = new THREE.Box3().setFromObject(holder);
    const afterSize = after.getSize(new THREE.Vector3());

    const controller = new F1CarController(model);
    return { holder, controller, length: afterSize.z, width: afterSize.x, height: afterSize.y };
  } catch (error) {
    console.warn("F1 ride failed to load:", error);
    return { holder, controller: null };
  }
}

export async function createVehicle({ spawn, heading = 0, groundHeight, terrain, colliders, particles }) {
  const car = buildCar();
  const ufo = buildUfo();
  const boom = createSonicBoom();
  const f1 = await loadF1Ride();
  car.root.add(ufo.holder);
  car.root.add(f1.holder);
  ufo.holder.visible = false;
  const rides = [
    { id: "car", name: "Kart", color: "#ff5b4a" },
    ...(f1.controller ? [{ id: "f1", name: "F1", color: "#e10600" }] : []),
    { id: "ufo", name: "UFO", color: "#3ad1c4" },
  ];
  let rideIndex = 0;

  const flying = () => rides[rideIndex].id === "ufo";
  const isF1 = () => rides[rideIndex].id === "f1";

  const applyRide = () => {
    const ride = rides[rideIndex];
    const isCar = ride.id === "car";
    car.body.visible = isCar;
    for (const wheel of car.wheels) wheel.steer.visible = isCar;
    f1.holder.visible = ride.id === "f1";
    ufo.holder.visible = ride.id === "ufo";
    const ground = groundHeight(position.x, position.z);
    if (ride.id === "ufo") {
      position.y = Math.max(position.y, ground + FLY_HOVER);
      state.grounded = false;
      state.airspeed = 0;
      state.vy = 0;
      state.stunt = null;
    } else {
      position.y = ground + (ride.id === "f1" ? F1_CLEARANCE : 0);
      state.grounded = true;
      state.vy = 0;
      state.airspeed = 0;
      state.flightPitch = 0;
      state.flightRoll = 0;
    }
    return ride;
  };

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
    airspeed: 0,
    flightPitch: 0,
    flightRoll: 0,
    stunt: null,
    stuntTime: 0,
    boostLatch: false,
    stuntLatch: false,
    prevThrottle: 0,
    ufoLight: true,
  };

  const respawn = (x, z, h) => {
    const lift = flying() ? FLY_HOVER : 2.5;
    position.set(x, groundHeight(x, z) + lift, z);
    velocity.set(0, 0);
    state.vy = flying() ? 0 : 0;
    state.heading = h;
    state.grounded = !flying();
    state.sinkTimer = 0;
    state.airspeed = 0;
    state.stunt = null;
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

  const startStunt = (name) => {
    state.stunt = name;
    state.stuntTime = 0;
  };

  const fireSonicBoom = () => {
    boom.active = true;
    boom.time = 0;
    boom.group.visible = true;
    boom.group.position.set(position.x, position.y + 0.65, position.z);
    boom.group.rotation.set(0, state.heading, 0);
    if (car.root.parent && boom.group.parent !== car.root.parent) car.root.parent.add(boom.group);
    const hx = Math.sin(state.heading);
    const hz = Math.cos(state.heading);
    for (let i = 0; i < 26; i++) {
      const angle = (i / 26) * Math.PI * 2;
      const rx = Math.cos(angle) * 1.35;
      const ry = Math.sin(angle) * 1.35;
      particles.emit({
        position: new THREE.Vector3(position.x + Math.cos(state.heading) * rx, position.y + 0.65 + ry, position.z - Math.sin(state.heading) * rx),
        velocity: new THREE.Vector3(-hx * 20, ry * 0.8, -hz * 20),
        color: i % 2 ? "#f4ffff" : "#7ef6ff",
        size: 0.72,
        life: 0.5,
        gravity: 0,
        spread: 0.25,
      });
    }
    particles.emit({
      position: new THREE.Vector3(position.x, position.y + 0.55, position.z),
      velocity: new THREE.Vector3(-hx * 10, 1.2, -hz * 10),
      color: "#c6fff6",
      size: 0.95,
      life: 0.7,
      gravity: 0,
      spread: 1.8,
      count: 18,
    });
    state.impact = 12;
  };

  const updateBoomFx = (dt) => {
    if (!boom.active) return;
    boom.time += dt;
    const t = boom.time;
    boom.flashMat.opacity = t < 0.1 ? (1 - t / 0.1) * 0.85 : 0;
    boom.flash.scale.setScalar(1 + t * 10);
    boom.rings.forEach((ring, index) => {
      const u = Math.min(1, (t - index * 0.07) / 0.4);
      if (u <= 0) {
        ring.mat.opacity = 0;
        return;
      }
      ring.mesh.scale.setScalar(0.55 + u * 8.2);
      ring.mat.opacity = (1 - u) * (1 - u) * 0.95;
    });
    if (t > 0.58) {
      boom.active = false;
      boom.group.visible = false;
    }
  };

  const updateFlight = (dt, input, look = {}) => {
    const lookHeading = look.heading ?? state.heading;
    const throttle = input.forward ? 1 : 0;
    const pitchInput = (input.jump ? 1 : 0) - (input.down ? 1 : 0);
    const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    state.steer = damp(state.steer, steerTarget, 8, dt);

    const wantDash = input.boost && input.forward;
    if (wantDash && !state.boostLatch && !state.stunt) startStunt("dash");
    const wantTrick = input.somersault || input.loop;
    if (wantTrick && !state.stuntLatch && !state.stunt && input.forward) startStunt(input.somersault ? "somersault" : "loop");
    if (input.reset && !state.stunt) {
      startStunt("boom");
      fireSonicBoom();
    }
    state.boostLatch = input.boost;
    state.stuntLatch = wantTrick;
    state.prevThrottle = throttle;

    let posePitch = 0;
    let poseRoll = state.steer * 0.38;
    let move = 0;

    if (state.stunt) {
      state.stuntTime += dt;
      const t = state.stuntTime;
      if (state.stunt === "dash") {
        move = 36;
        poseRoll = (t / 0.62) * Math.PI * 2;
        posePitch = -0.08;
        if (t >= 0.62) state.stunt = null;
      } else if (state.stunt === "boom") {
        move = 54;
        posePitch = -0.12;
        poseRoll = Math.sin(t * 18) * 0.08;
        if (Math.random() < 0.7) {
          particles.emit({
            position: new THREE.Vector3(position.x, position.y + 0.4, position.z),
            velocity: new THREE.Vector3(-Math.sin(state.heading) * 6, 0.4, -Math.cos(state.heading) * 6),
            color: "#d8fff8",
            size: 0.7,
            life: 0.35,
            gravity: 0,
            spread: 1.1,
            count: 2,
          });
        }
        if (t >= 0.52) {
          state.stunt = null;
          state.airspeed = 26;
        }
      } else if (state.stunt === "loop") {
        const u = Math.min(1, t / 1.15);
        const a = u * Math.PI * 2;
        move = 20;
        posePitch = -a;
        position.y += Math.cos(a) * 26 * dt;
        if (t >= 1.15) state.stunt = null;
      } else if (state.stunt === "somersault") {
        const u = Math.min(1, t / 1.05);
        const a = u * Math.PI * 2;
        move = 18;
        posePitch = a;
        poseRoll = a * 1.4;
        position.y -= 14 * dt;
        if (t >= 1.05) state.stunt = null;
      } else if (state.stunt === "uturn") {
        const u = Math.min(1, t / 0.95);
        posePitch = -u * Math.PI;
        poseRoll = Math.sin(u * Math.PI) * 0.8;
        move = 16;
        position.y += Math.sin(u * Math.PI) * 18 * dt;
        if (t >= 0.95) {
          state.heading += Math.PI;
          state.stunt = null;
          posePitch = 0;
        }
      }
    } else {
      const cruise = input.boost ? 28 : 18;
      if (input.forward) state.airspeed = damp(state.airspeed, cruise, 3.2, dt);
      else state.airspeed = damp(state.airspeed, 0, 2.2, dt);
      state.airspeed = Math.max(0, state.airspeed);
      move = state.airspeed;
      const moving = state.airspeed > 1.4;
      const pitchTarget = moving ? THREE.MathUtils.clamp(-pitchInput * 0.48, -0.5, 0.5) : 0;
      posePitch = damp(state.flightPitch, pitchTarget, 7, dt);
    }

    if (!state.stunt) {
      const turn = state.steer * 1.85 * dt;
      state.heading += turn;
      look.turnCamera?.(turn);
      if (input.forward) state.heading = dampAngle(state.heading, lookHeading, 10, dt);
    }

    const signedSpeed = Math.max(0, state.stunt ? move : state.airspeed);
    const flyHeading = !state.stunt && input.forward ? lookHeading : state.heading;
    const nextX = position.x + Math.sin(flyHeading) * signedSpeed * dt;
    const nextZ = position.z + Math.cos(flyHeading) * signedSpeed * dt;
    const limit = Math.hypot(nextX, nextZ);
    if (limit > WORLD_LIMIT && state.stunt !== "uturn") {
      startStunt("uturn");
      position.x *= WORLD_LIMIT / Math.max(limit, 1e-3);
      position.z *= WORLD_LIMIT / Math.max(limit, 1e-3);
    } else if (limit > WORLD_LIMIT) {
      position.x = (nextX / limit) * WORLD_LIMIT;
      position.z = (nextZ / limit) * WORLD_LIMIT;
    } else {
      position.x = nextX;
      position.z = nextZ;
    }

    if (!state.stunt || state.stunt === "dash" || state.stunt === "boom") {
      const climb = signedSpeed * Math.sin(-posePitch);
      position.y += climb * dt;
    }
    if (!state.stunt && input.backward) position.y -= 18 * dt;

    const floor = groundHeight(position.x, position.z) + FLY_CLEARANCE;
    if (position.y < floor) position.y = floor;
    if (position.y > FLY_CEILING) position.y = FLY_CEILING;

    velocity.set(Math.sin(flyHeading) * signedSpeed, Math.cos(flyHeading) * signedSpeed);
    state.airspeed = signedSpeed;
    state.flightPitch = posePitch;
    state.flightRoll = poseRoll;
    state.pitch = posePitch;
    state.roll = poseRoll;
    state.vy = 0;
    state.grounded = false;
    state.inWater = false;
    state.bodyPitch = posePitch;
    state.bodyRoll = poseRoll;

    if (position.y > floor + 2) {
      safe.x = position.x;
      safe.z = position.z;
      safe.heading = state.heading;
    }

    syncVisuals(dt, input, Math.abs(signedSpeed));
  };

  const update = (dt, input, look = {}) => {
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

    if (input.reset && !flying()) {
      respawn(safe.x, safe.z, safe.heading);
    }

    if (flying()) {
      updateFlight(dt, input, look);
      updateBoomFx(dt);
      return;
    }

    forward.set(Math.sin(state.heading), Math.cos(state.heading));
    lateral.set(Math.cos(state.heading), -Math.sin(state.heading));
    let forwardSpeed = velocity.dot(forward);
    let lateralSpeed = velocity.dot(lateral);

    const throttle = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
    const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    state.steer = damp(state.steer, steerTarget, isF1() ? 12 : 10, dt);
    const boosting = input.boost && throttle > 0;
    const f1Ride = isF1();
    const topSpeed = f1Ride ? (boosting ? 34 : 26) : boosting ? 36 : 23;
    const grip = state.grounded ? 1 : 0.15;

    if (throttle > 0) {
      const headroom = Math.max(0, 1 - forwardSpeed / topSpeed);
      const push = f1Ride ? (boosting ? 38 : 28) : boosting ? 44 : 30;
      forwardSpeed += push * headroom * grip * dt;
    } else if (throttle < 0) {
      if (forwardSpeed > 0.5) forwardSpeed -= (f1Ride ? 50 : 46) * grip * dt;
      else forwardSpeed = Math.max(f1Ride ? -10 : -10, forwardSpeed - 18 * grip * dt);
    } else {
      forwardSpeed *= Math.exp(-(state.grounded ? (f1Ride ? 1.05 : 1.1) : 0.1) * dt);
    }
    if (forwardSpeed > topSpeed) forwardSpeed = damp(forwardSpeed, topSpeed, 1.5, dt);

    const lateralGrip = state.grounded ? (input.boost ? (f1Ride ? 3.6 : 4.5) : f1Ride ? 7.2 : 9) : 0.6;
    lateralSpeed = damp(lateralSpeed, 0, lateralGrip, dt);

    const steerAuthority = Math.min(1, Math.abs(forwardSpeed) / (f1Ride ? 7 : 5)) * Math.sign(forwardSpeed);
    const turnRate = (f1Ride ? 2.05 : 2.35) * (1 - Math.min(0.45, Math.abs(forwardSpeed) / (f1Ride ? 90 : 70)));
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

    const groundY = ground + (f1Ride ? F1_CLEARANCE : 0);
    if (state.grounded) {
      const followVy = THREE.MathUtils.clamp((ground - ground0) / Math.max(dt, 1e-4), -30, 30);
      if (input.jump && !state.jumpLatch) {
        state.vy = Math.max(followVy, 0) + 11;
        state.grounded = false;
        position.y = groundY + 0.05;
      } else if (ground < position.y - 0.45 - (f1Ride ? F1_CLEARANCE : 0)) {
        state.grounded = false;
      } else {
        position.y = groundY;
        state.vy = followVy;
      }
    } else {
      state.vy -= GRAVITY * dt;
      position.y += state.vy * dt;
      state.airTime += dt;
      if (position.y <= groundY) {
        const landing = -state.vy;
        position.y = groundY;
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
    updateBoomFx(dt);
  };

  const syncVisuals = (dt, input, forwardSpeed = 0) => {
    if (flying()) {
      state.pitch = damp(state.pitch, state.flightPitch, 8, dt);
      state.roll = damp(state.roll, state.flightRoll, 8, dt);
    } else {
      const sin = Math.sin(state.heading);
      const cos = Math.cos(state.heading);
      const halfL = isF1() && f1.length ? f1.length * 0.42 : HALF_LENGTH;
      const halfW = isF1() && f1.width ? f1.width * 0.42 : HALF_WIDTH;
      const sample = (lx, lz) => groundHeight(position.x + sin * lz + cos * lx, position.z + cos * lz - sin * lx);
      let targetPitch = 0;
      let targetRoll = 0;
      if (state.grounded) {
        const front = sample(0, halfL);
        const back = sample(0, -halfL);
        const left = sample(halfW, 0);
        const right = sample(-halfW, 0);
        targetPitch = Math.atan2(back - front, halfL * 2);
        targetRoll = Math.atan2(left - right, halfW * 2);
        if (isF1()) {
          // Long chassis: soften slope align so corners don't bury into terrain.
          targetPitch = THREE.MathUtils.clamp(targetPitch * 0.55, -0.18, 0.18);
          targetRoll = THREE.MathUtils.clamp(targetRoll * 0.55, -0.16, 0.16);
        }
      } else {
        targetPitch = THREE.MathUtils.clamp(-state.vy * 0.025, -0.4, 0.4);
      }
      state.pitch = damp(state.pitch, targetPitch, state.grounded ? 14 : 2.5, dt);
      state.roll = damp(state.roll, targetRoll, state.grounded ? 14 : 2.5, dt);
    }

    const spring = -state.bodyOffset * 140 - state.bodyVelocity * 11;
    state.bodyVelocity += spring * dt;
    state.bodyOffset += state.bodyVelocity * dt;

    car.root.position.copy(position);
    if (flying()) car.root.rotation.set(0, state.heading, 0, "YXZ");
    else car.root.rotation.set(state.pitch, state.heading, state.roll, "YXZ");
    car.body.position.y = state.bodyOffset * 0.6;
    car.body.rotation.set(state.bodyPitch, 0, state.bodyRoll);
    f1.holder.position.y = state.bodyOffset * 0.45;
    f1.holder.rotation.set(state.bodyPitch * 0.85, 0, state.bodyRoll * 0.9);

    if (car.body.visible) {
      for (const wheel of car.wheels) {
        wheel.spin.rotation.x += (forwardSpeed / WHEEL_RADIUS) * dt;
        if (wheel.front) wheel.steer.rotation.y = state.steer * 0.42;
      }
      car.flag.rotation.y = Math.sin(performance.now() * 0.012) * 0.25 - Math.min(0.6, Math.abs(forwardSpeed) * 0.03);
    }
    if (f1.holder.visible && f1.controller) {
      const braking = input.backward && forwardSpeed > 0.5;
      f1.controller.setSpeed(forwardSpeed);
      f1.controller.setSteer(state.steer * f1.controller.maxSteer);
      f1.controller.setBraking(braking);
      f1.controller.update(dt);
    }
    if (ufo.holder.visible) {
      const dash = state.stunt === "dash" || state.stunt === "boom" || input.boost;
      ufo.holder.position.y = 0.16 + Math.sin(shared.uTime.value * 2.4) * 0.1;
      ufo.holder.rotation.x = state.flightPitch;
      ufo.holder.rotation.z = state.flightRoll;
      ufo.rimSpin.rotation.y += (1.4 + Math.abs(forwardSpeed) * 0.06 + (dash ? 4 : 0)) * dt;
      const night = shared.uNight.value;
      const lit = state.ufoLight ? 1 : 0;
      const pulse = 0.55 + night * 0.35 + lit * 0.7 + (dash ? 0.45 : 0) + Math.sin(shared.uTime.value * 8) * 0.08 * lit;
      ufo.lampMaterial.color.setRGB(1, 0.84, 0.4).multiplyScalar(pulse);
      ufo.coreMaterial.color.setRGB(0.5, 1, 0.96).multiplyScalar(0.55 + night * 0.25 + lit * 0.7 + (dash ? 0.35 : 0));
      ufo.visorMaterial.color.setRGB(0.6, 0.97, 1).multiplyScalar(0.55 + night * 0.25 + lit * 0.55);
      ufo.beamMaterial.uniforms.uBeam.value = damp(ufo.beamMaterial.uniforms.uBeam.value, lit, 10, Math.max(dt, 1e-3));
    }

    const night = shared.uNight.value;
    car.lampMaterial.color.setRGB(1, 0.96, 0.82).multiplyScalar(0.7 + night * 0.8);
    const braking = input.backward && forwardSpeed > 0.5;
    car.tailMaterial.color.setRGB(1, 0.22, 0.22).multiplyScalar(braking ? 1.6 : 0.55 + night * 0.4);
  };

  applyRide();
  syncVisuals(0, {});

  return {
    group: car.root,
    position,
    velocity,
    state,
    radius: CAR_RADIUS,
    get speed() {
      return flying() ? Math.abs(state.airspeed) : velocity.length();
    },
    get heading() {
      return state.heading;
    },
    get ride() {
      return rides[rideIndex];
    },
    get lights() {
      return state.ufoLight;
    },
    toggleLights() {
      if (flying()) {
        state.ufoLight = !state.ufoLight;
        ufo.beamMaterial.uniforms.uBeam.value = state.ufoLight ? 1 : 0;
        return state.ufoLight;
      }
      if (isF1() && f1.controller) {
        f1.controller.setRainLight(!f1.controller.rainLight);
        return f1.controller.rainLight;
      }
      return false;
    },
    cycleRide() {
      if (rides.length < 2) return rides[rideIndex];
      rideIndex = (rideIndex + 1) % rides.length;
      return applyRide();
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
