import * as THREE from "three";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import fontData from "three/examples/fonts/helvetiker_bold.typeface.json";
import { createSolidMaterial } from "./shading.js";
import { damp } from "./noise.js";

const PALETTE = ["#ff6b5e", "#ffb547", "#ffe066", "#7ed957", "#4fc3f7", "#7c8cff", "#c77dff", "#ff7eb6", "#ff9f43"];

let cachedFont = null;
export function getFont() {
  if (!cachedFont) cachedFont = new FontLoader().parse(fontData);
  return cachedFont;
}

export function createLetters({ text, origin, heightAt, facing = 0 }) {
  const font = getFont();
  const group = new THREE.Group();
  const letters = [];
  const size = 3.1;
  const depth = 1.3;
  const spacing = 0.45;
  const glyphs = [];
  let totalWidth = 0;

  for (const char of text) {
    if (char === " ") {
      glyphs.push({ char, width: size * 0.5 });
      totalWidth += size * 0.5;
      continue;
    }
    const geometry = new TextGeometry(char, {
      font,
      size,
      depth,
      curveSegments: 5,
      bevelEnabled: true,
      bevelThickness: 0.12,
      bevelSize: 0.08,
      bevelSegments: 2,
    });
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    const width = box.max.x - box.min.x;
    geometry.translate(-(box.min.x + width / 2), -box.min.y, -depth / 2);
    glyphs.push({ char, width, geometry });
    totalWidth += width + spacing;
  }

  const cos = Math.cos(facing);
  const sin = Math.sin(facing);
  let cursor = -totalWidth / 2;
  glyphs.forEach((glyph, index) => {
    if (!glyph.geometry) {
      cursor += glyph.width;
      return;
    }
    const localX = cursor + glyph.width / 2;
    cursor += glyph.width + spacing;
    const x = origin.x + localX * cos;
    const z = origin.z - localX * sin;
    const mesh = new THREE.Mesh(glyph.geometry, createSolidMaterial(PALETTE[index % PALETTE.length]));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const pivot = new THREE.Group();
    pivot.add(mesh);
    group.add(pivot);
    letters.push({
      pivot,
      home: new THREE.Vector2(x, z),
      position: new THREE.Vector2(x, z),
      velocity: new THREE.Vector2(),
      yaw: facing,
      yawVelocity: 0,
      tilt: 0,
      tiltVelocity: 0,
      tiltAxis: new THREE.Vector3(1, 0, 0),
      radius: Math.max(glyph.width, depth) * 0.55 + 0.2,
      restTimer: 0,
      returning: false,
    });
  });

  const quaternion = new THREE.Quaternion();
  const tiltQuaternion = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);

  const sync = (letter) => {
    const y = heightAt(letter.position.x, letter.position.y);
    letter.pivot.position.set(letter.position.x, y + Math.sin(letter.tilt) * depth * 0.45, letter.position.y);
    quaternion.setFromAxisAngle(up, letter.yaw);
    tiltQuaternion.setFromAxisAngle(letter.tiltAxis, letter.tilt);
    letter.pivot.quaternion.copy(tiltQuaternion).multiply(quaternion);
  };
  letters.forEach(sync);

  return {
    group,
    collide(carPosition, carVelocity, carRadius) {
      let impact = 0;
      for (const letter of letters) {
        const dx = letter.position.x - carPosition.x;
        const dz = letter.position.y - carPosition.z;
        const distance = Math.hypot(dx, dz);
        const minDistance = letter.radius + carRadius;
        if (distance >= minDistance || distance === 0) continue;
        const nx = dx / distance;
        const nz = dz / distance;
        const speed = carVelocity.x * nx + carVelocity.y * nz;
        const overlap = minDistance - distance;
        letter.position.x += nx * overlap;
        letter.position.y += nz * overlap;
        if (speed > 0.5) {
          letter.velocity.x += nx * speed * 0.9 + carVelocity.x * 0.25;
          letter.velocity.y += nz * speed * 0.9 + carVelocity.y * 0.25;
          letter.yawVelocity += (Math.random() - 0.5) * speed * 0.5;
          if (speed > 3) {
            letter.tiltAxis.set(nz, 0, -nx).normalize();
            letter.tiltVelocity += speed * 0.45;
          }
          letter.restTimer = 0;
          letter.returning = false;
          impact = Math.max(impact, speed);
        }
      }
      return impact;
    },
    update(dt) {
      for (const letter of letters) {
        if (letter.returning) {
          letter.position.x = damp(letter.position.x, letter.home.x, 3, dt);
          letter.position.y = damp(letter.position.y, letter.home.y, 3, dt);
          letter.yaw = damp(letter.yaw, facing, 3, dt);
          letter.tilt = damp(letter.tilt, 0, 4, dt);
          if (letter.position.distanceTo(letter.home) < 0.02 && letter.tilt < 0.01) letter.returning = false;
          sync(letter);
          continue;
        }
        letter.position.addScaledVector(letter.velocity, dt);
        letter.velocity.multiplyScalar(Math.exp(-2.6 * dt));
        letter.yaw += letter.yawVelocity * dt;
        letter.yawVelocity *= Math.exp(-3 * dt);
        letter.tiltVelocity -= (letter.tilt > 0.6 ? -14 : 9) * dt;
        letter.tilt += letter.tiltVelocity * dt;
        if (letter.tilt >= Math.PI / 2) {
          letter.tilt = Math.PI / 2;
          letter.tiltVelocity = -Math.abs(letter.tiltVelocity) * 0.25;
        }
        if (letter.tilt <= 0) {
          letter.tilt = 0;
          letter.tiltVelocity = 0;
        }
        const moved = letter.position.distanceTo(letter.home) > 0.3 || letter.tilt > 0.05;
        if (moved && letter.velocity.lengthSq() < 0.05) {
          letter.restTimer += dt;
          if (letter.restTimer > 7) {
            letter.returning = true;
            letter.restTimer = 0;
          }
        }
        sync(letter);
      }
    },
  };
}
