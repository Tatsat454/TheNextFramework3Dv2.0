import * as THREE from "three";
import { damp } from "./noise.js";

export function createFollowCamera(camera, domElement) {
  const focus = new THREE.Vector3();
  const smoothedFocus = new THREE.Vector3();
  const lookAhead = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const shakeOffset = new THREE.Vector3();
  const state = {
    theta: 0.62,
    phi: 0.96,
    radius: 26,
    targetTheta: 0.62,
    targetPhi: 0.96,
    targetRadius: 26,
    chase: false,
    chaseTheta: 0,
    shake: 0,
    intro: 0,
    introDuration: 3.2,
    dragging: false,
    lastX: 0,
    lastY: 0,
    idle: 0,
    flyLook: false,
    blockLock: false,
  };

  const look = (dx, dy) => {
    state.targetTheta -= dx * 0.006;
    state.targetPhi = THREE.MathUtils.clamp(state.targetPhi - dy * 0.004, 0.35, 1.32);
    state.idle = 0;
  };

  const releaseLook = () => {
    state.dragging = false;
    if (document.pointerLockElement === domElement) document.exitPointerLock?.();
  };

  // Kart: classic click-drag orbit (c2603a1 style).
  // UFO: optional pointer-lock look when flyLook is on.
  domElement.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;

    // UFO mouse-look: click again to unlock
    if (state.flyLook && document.pointerLockElement === domElement) {
      releaseLook();
      return;
    }

    // Link toasts: only block UFO pointer-lock, never kart drag
    if (state.flyLook && state.blockLock) return;

    // Dragging the orbit cancels chase lock
    if (!state.flyLook) state.chase = false;

    state.dragging = true;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    domElement.setPointerCapture(event.pointerId);

    if (state.flyLook && !state.blockLock) {
      domElement.requestPointerLock?.();
    }
  });

  domElement.addEventListener("pointermove", (event) => {
    const locked = state.flyLook && document.pointerLockElement === domElement;
    if (!state.dragging && !locked) return;
    const dx = locked ? event.movementX : event.clientX - state.lastX;
    const dy = locked ? event.movementY : event.clientY - state.lastY;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    look(dx, dy);
  });

  const release = () => {
    state.dragging = false;
  };
  domElement.addEventListener("pointerup", release);
  domElement.addEventListener("pointercancel", release);
  domElement.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      state.targetRadius = THREE.MathUtils.clamp(state.targetRadius * Math.exp(event.deltaY * 0.0012), 12, 70);
    },
    { passive: false }
  );

  return {
    state,
    toggleChase() {
      state.chase = !state.chase;
    },
    setFlyLook(on) {
      // Important: do NOT releaseLook every frame when already off —
      // that was killing kart click-drag immediately.
      if (state.flyLook === on) return;
      state.flyLook = on;
      if (!on) releaseLook();
    },
    setBlockLock(on) {
      if (state.blockLock === on) return;
      state.blockLock = on;
      // Unlock UFO look so toast links are clickable; kart drag stays free
      if (on && state.flyLook) releaseLook();
    },
    releaseLook,
    alignTo(heading) {
      const theta = heading + Math.PI;
      state.targetTheta = theta;
      state.theta = theta;
      state.chaseTheta = theta;
    },
    nudgeYaw(delta) {
      state.targetTheta += delta;
      state.theta += delta;
      state.chaseTheta += delta;
    },
    lookHeading() {
      return Math.atan2(smoothedFocus.x - camera.position.x, smoothedFocus.z - camera.position.z);
    },
    shake(amount) {
      state.shake = Math.min(1.4, state.shake + amount);
    },
    startIntro() {
      state.intro = 0.0001;
    },
    snap(target) {
      focus.copy(target);
      smoothedFocus.copy(target);
    },
    update(dt, target, heading, velocity, options = {}) {
      lookAhead.set(velocity.x * (options.indoor ? 0.14 : 0.32), 0, velocity.y * (options.indoor ? 0.14 : 0.32));
      lookAhead.clampLength(0, options.indoor ? 2.2 : 7);
      focus.copy(target).add(lookAhead);
      focus.y += options.indoor ? 1.65 : options.soar ? 0.4 : 1.2;
      smoothedFocus.x = damp(smoothedFocus.x, focus.x, options.indoor ? 9 : 5, dt);
      smoothedFocus.y = damp(smoothedFocus.y, focus.y, options.indoor ? 7 : 3, dt);
      smoothedFocus.z = damp(smoothedFocus.z, focus.z, options.indoor ? 9 : 5, dt);

      let theta;
      let phi;
      let radius;
      if (options.indoor) {
        state.theta = damp(state.theta, state.targetTheta, 8, dt);
        state.phi = damp(state.phi, THREE.MathUtils.clamp(state.targetPhi, 0.92, 1.38), 8, dt);
        const indoorTargetRadius = THREE.MathUtils.clamp(state.targetRadius * 0.34, 5.5, 11.5);
        state.radius = damp(state.radius, indoorTargetRadius, 8, dt);
        theta = state.theta;
        phi = state.phi;
        radius = state.radius;
      } else if (options.soar) {
        // UFO: free mouse orbit (pointer-lock or drag)
        state.theta = damp(state.theta, state.targetTheta, 8, dt);
        state.phi = damp(state.phi, state.targetPhi, 8, dt);
        state.radius = damp(state.radius, state.targetRadius, 6, dt);
        theta = state.theta;
        phi = state.phi;
        radius = state.radius;
      } else if (state.chase && !state.dragging) {
        state.chaseTheta = damp(state.chaseTheta, heading + Math.PI, 3.5, dt);
        theta = state.chaseTheta;
        phi = 1.2;
        radius = 15;
      } else {
        // Kart default: click-drag orbit
        state.chaseTheta = heading + Math.PI;
        state.theta = damp(state.theta, state.targetTheta, 6, dt);
        state.phi = damp(state.phi, state.targetPhi, 6, dt);
        state.radius = damp(state.radius, state.targetRadius, 6, dt);
        theta = state.theta;
        phi = state.phi;
        radius = state.radius;
      }

      if (state.intro > 0) {
        state.intro += dt;
        const t = Math.min(1, state.intro / state.introDuration);
        const ease = 1 - Math.pow(1 - t, 3);
        theta += (1 - ease) * -1.6;
        phi += (1 - ease) * -0.55;
        radius += (1 - ease) * 120;
        if (t >= 1) state.intro = 0;
      }

      state.viewTheta = theta;
      offset.setFromSphericalCoords(radius, phi, theta);
      camera.position.copy(smoothedFocus).add(offset);
      if (options.indoor) {
        camera.position.x = THREE.MathUtils.clamp(camera.position.x, -13.6, 13.6);
        camera.position.z = THREE.MathUtils.clamp(camera.position.z, -16.8, 16.8);
        camera.position.y = THREE.MathUtils.clamp(camera.position.y, 1.4, 11.8);
      }

      state.shake = damp(state.shake, 0, 5, dt);
      if (state.shake > 0.01) {
        shakeOffset.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(state.shake * 0.9);
        camera.position.add(shakeOffset);
      }
      camera.lookAt(smoothedFocus);
    },
  };
}
