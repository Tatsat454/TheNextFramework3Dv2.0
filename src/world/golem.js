import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { getFont } from "./letters.js";
import { createSolidMaterial } from "./shading.js";

export const GOLEM_NAME = "Sam";
export const GOLEM_TITLE = "the friendly golem";

const TALK_LINES = [
  "Hello! I am Sam! I look mean but I am a very sweet golem!",
  "This is Stone Circle, I am protector of Tatsat's links.",
  "Be sure to check them out, he responds fast on everything!",
];

const HEIGHT = 3.45;
const PATROL_RADIUS = 3.35;
const FOLLOW_RANGE = 26;
const LEAVE_RANGE = 34;
const FOLLOW_DISTANCE = 9.2;
const STOP_DISTANCE = 0.55;
const KEEP_BACK = 6.4;
const TALK_RANGE = 7.6;
const TALK_LEAVE = 8.8;

let golemTemplate = null;

function dampAngle(current, target, lambda, dt) {
  const delta = THREE.MathUtils.euclideanModulo(target - current + Math.PI, Math.PI * 2) - Math.PI;
  return current + delta * (1 - Math.exp(-lambda * dt));
}

function stripRootMotion(clip) {
  const tracks = clip.tracks.filter((track) => !/hips\.position$/i.test(track.name));
  return new THREE.AnimationClip(clip.name || "walk", clip.duration, tracks);
}

function measureWalkSpeed(clip) {
  const track = clip.tracks.find((item) => /hips\.position$/i.test(item.name));
  if (!track || track.times.length < 2) return 0;
  let distance = 0;
  for (let i = 1; i < track.times.length; i++) {
    const prev = (i - 1) * 3;
    const next = i * 3;
    distance += Math.hypot(track.values[next] - track.values[prev], track.values[next + 2] - track.values[prev + 2]);
  }
  const duration = track.times[track.times.length - 1] - track.times[0];
  return duration > 0 ? distance / duration : 0;
}

function decorateMaterials(root) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    child.frustumCulled = false;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!material) continue;
      material.roughness = 0.78;
      material.metalness = 0.08;
      material.emissive = new THREE.Color("#ff4a1c");
      if (material.map) material.emissiveMap = material.map;
      material.emissiveIntensity = 0.42;
    }
  });
}

function fitToGround(root) {
  root.rotation.set(0, 0, 0);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box.min.y;
  root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
}

export async function loadGolemTemplate() {
  if (golemTemplate) return golemTemplate;
  const fbx = await new FBXLoader().loadAsync("/golem-walk.fbx");
  decorateMaterials(fbx);

  const sourceClip = fbx.animations?.[0] ?? null;
  const sourceSpeed = sourceClip ? measureWalkSpeed(sourceClip) : 0;
  const walkClip = sourceClip ? stripRootMotion(sourceClip) : null;
  if (walkClip) {
    const mixer = new THREE.AnimationMixer(fbx);
    const action = mixer.clipAction(walkClip);
    action.play();
    mixer.update(walkClip.duration * 0.2);
  }
  const size = fitToGround(fbx);

  golemTemplate = { scene: fbx, walkClip, size, sourceSpeed };
  return golemTemplate;
}

export function createStoneGolem(area, heightAt, colliders, particles, template) {
  const group = new THREE.Group();
  const model = template.scene;
  const scale = HEIGHT / Math.max(template.size.y, 0.001);
  const walkSpeed = Math.max(1.6, (template.sourceSpeed || 90) * scale);
  group.add(model);
  group.scale.setScalar(scale);

  const mixer = new THREE.AnimationMixer(model);
  const walk = template.walkClip ? mixer.clipAction(template.walkClip) : null;
  const stanceTime = template.walkClip ? template.walkClip.duration * 0.02 : 0;
  if (walk) {
    walk.enabled = true;
    walk.loop = THREE.LoopRepeat;
    walk.clampWhenFinished = false;
    walk.play();
  }

  const glow = new THREE.PointLight("#ff6a32", 2.2, 14, 1.6);
  glow.position.set(0, HEIGHT * 0.62 / scale, 0.2);
  group.add(glow);

  const font = getFont();
  const labelGeo = new TextGeometry(GOLEM_NAME.toUpperCase(), {
    font,
    size: 0.28 / scale,
    depth: 0.06 / scale,
    curveSegments: 3,
    bevelEnabled: false,
  });
  labelGeo.computeBoundingBox();
  const labelWidth = labelGeo.boundingBox.max.x - labelGeo.boundingBox.min.x;
  labelGeo.translate(-labelWidth / 2, 0, 0);
  const label = new THREE.Mesh(labelGeo, createSolidMaterial("#fff2d8"));
  label.position.y = HEIGHT / scale + 0.2;
  label.castShadow = true;
  group.add(label);

  const entranceAngle = Math.atan2(-area.direction.z, -area.direction.x);
  const collider = { x: area.x, z: area.z, radius: 1.15 };
  colliders.push(collider);

  const emberPos = new THREE.Vector3();
  const emberVel = new THREE.Vector3();
  let emberTimer = 0;
  let patrolAngle = entranceAngle + Math.PI;
  let heading = patrolAngle + Math.PI / 2;
  let mode = "patrol";
  let chasing = false;
  let wasWalking = true;
  let near = false;
  let talking = false;
  let lineIndex = 0;
  const padLimit = Math.max(6, area.radius - 1.7);

  const clampToPad = (x, z) => {
    const dx = x - area.x;
    const dz = z - area.z;
    const radius = Math.hypot(dx, dz);
    if (radius <= padLimit || radius < 0.001) return [x, z];
    return [area.x + (dx / radius) * padLimit, area.z + (dz / radius) * padLimit];
  };

  const steerAround = (x, z) => {
    let nextX = x;
    let nextZ = z;
    for (const other of colliders) {
      if (other === collider) continue;
      const dx = nextX - other.x;
      const dz = nextZ - other.z;
      const distance = Math.hypot(dx, dz);
      const min = (other.radius || 0.8) + 1.25;
      if (distance < min && distance > 0.001) {
        nextX = other.x + (dx / distance) * min;
        nextZ = other.z + (dz / distance) * min;
      }
    }
    return clampToPad(nextX, nextZ);
  };

  const place = (x, z) => {
    const [px, pz] = clampToPad(x, z);
    group.position.set(px, heightAt(px, pz), pz);
    collider.x = px;
    collider.z = pz;
  };

  const playWalk = (moving, dt) => {
    if (!walk) return;
    if (moving) {
      walk.paused = false;
      walk.timeScale = 1;
      mixer.update(dt);
      wasWalking = true;
      return;
    }
    if (wasWalking) {
      walk.time = stanceTime;
      wasWalking = false;
    }
    walk.paused = true;
    mixer.update(0);
  };

  place(area.x + Math.cos(patrolAngle) * PATROL_RADIUS, area.z + Math.sin(patrolAngle) * PATROL_RADIUS);

  if (import.meta.env.DEV) {
    window.__sam = window.__cinder = {
      group,
      model,
      mixer,
      walk,
      scale,
      walkSpeed,
      size: template.size.toArray(),
      get mode() {
        return mode;
      },
    };
  }

  return {
    group,
    name: GOLEM_NAME,
    talk() {
      if (!near) return false;
      if (!talking) {
        talking = true;
        lineIndex = 0;
        return true;
      }
      if (lineIndex < TALK_LINES.length - 1) {
        lineIndex += 1;
        return true;
      }
      talking = false;
      return true;
    },
    talkState() {
      if (talking) {
        return {
          name: GOLEM_NAME,
          title: GOLEM_TITLE,
          line: TALK_LINES[lineIndex],
          prompt: false,
          hint: lineIndex < TALK_LINES.length - 1 ? "E" : "E",
        };
      }
      if (near) {
        return {
          name: GOLEM_NAME,
          title: GOLEM_TITLE,
          line: "Press E to talk",
          prompt: true,
          hint: "E",
        };
      }
      return null;
    },
    update(time, dt, car, camera) {
      const x = group.position.x;
      const z = group.position.z;
      const toCenter = car ? Math.hypot(car.x - area.x, car.z - area.z) : 999;
      const toCar = car ? Math.hypot(car.x - x, (car.y ?? group.position.y) - (group.position.y + 1.6), car.z - z) : 999;
      if (toCar < TALK_RANGE) near = true;
      else if (toCar > TALK_LEAVE) near = false;
      if (!near) talking = false;

      if (car && toCenter < FOLLOW_RANGE) mode = "follow";
      else if (toCenter > LEAVE_RANGE) mode = "patrol";

      let walking = false;
      let targetHeading = heading;

      if (talking && car) {
        targetHeading = toCar > 0.001 ? Math.atan2(car.x - x, car.z - z) : heading;
        walking = false;
        place(x, z);
      } else if (mode === "follow" && car) {
        targetHeading = toCar > 0.001 ? Math.atan2(car.x - x, car.z - z) : heading;
        const extra = toCar - FOLLOW_DISTANCE;
        if (extra > STOP_DISTANCE) chasing = true;
        else if (extra < 0.12) chasing = false;
        const back = KEEP_BACK - toCar;
        if (back > 0.05) {
          const step = Math.min(back, walkSpeed * dt);
          const nx = x - ((car.x - x) / Math.max(toCar, 0.001)) * step;
          const nz = z - ((car.z - z) / Math.max(toCar, 0.001)) * step;
          const [px, pz] = steerAround(nx, nz);
          walking = true;
          place(px, pz);
        } else if (chasing) {
          const step = Math.min(Math.max(extra, 0), walkSpeed * dt);
          const nx = x + ((car.x - x) / Math.max(toCar, 0.001)) * step;
          const nz = z + ((car.z - z) / Math.max(toCar, 0.001)) * step;
          const [px, pz] = steerAround(nx, nz);
          walking = true;
          place(px, pz);
        } else {
          place(x, z);
        }
      } else {
        patrolAngle += (walkSpeed * dt) / PATROL_RADIUS;
        const px = area.x + Math.cos(patrolAngle) * PATROL_RADIUS;
        const pz = area.z + Math.sin(patrolAngle) * PATROL_RADIUS;
        targetHeading = Math.atan2(px - x, pz - z);
        walking = true;
        place(px, pz);
      }

      heading = dampAngle(heading, targetHeading, walking ? 5 : 3.2, dt);
      group.rotation.y = heading;
      playWalk(walking, dt);

      glow.intensity = 2 + Math.sin(time * 3.2) * 0.4;
      if (camera) {
        label.lookAt(camera.position.x, group.position.y + HEIGHT, camera.position.z);
      }

      emberTimer -= dt;
      if (particles && emberTimer <= 0) {
        emberTimer = 0.09;
        emberPos.set(x + (Math.random() - 0.5) * 0.7, group.position.y + 0.5 + Math.random() * 2.1, z + (Math.random() - 0.5) * 0.7);
        emberVel.set((Math.random() - 0.5) * 0.35, 1.1 + Math.random() * 0.7, (Math.random() - 0.5) * 0.35);
        particles.emit({
          position: emberPos,
          velocity: emberVel,
          color: Math.random() > 0.35 ? "#ff7a32" : "#ffd27a",
          size: 0.22 + Math.random() * 0.18,
          life: 0.7 + Math.random() * 0.4,
          gravity: 0.4,
          spread: 0.12,
        });
      }
    },
  };
}
