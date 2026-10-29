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
    // Allow looking further up indoors/outdoors (was capped too low for dungeon ceilings)
    state.targetPhi = THREE.MathUtils.clamp(state.targetPhi - dy * 0.0045, 0.28, 1.52);
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
    enterIndoor() {
      // Start over-the-shoulder close; walking will ease the camera out.
      state.targetRadius = 18;
      state.radius = 4.1;
      state.targetPhi = 1.08;
      state.phi = 1.08;
    },
    exitIndoor() {
      state.targetRadius = 26;
      state.radius = 26;
      state.targetPhi = 0.96;
      state.phi = 0.96;
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
      offset.setFromSphericalCoords(state.radius, state.phi, state.theta);
      camera.position.copy(smoothedFocus).add(offset);
    },
    update(dt, target, heading, velocity, options = {}) {
      lookAhead.set(velocity.x * (options.indoor ? 0.12 : 0.32), 0, velocity.y * (options.indoor ? 0.12 : 0.32));
      lookAhead.clampLength(0, options.indoor ? 1.8 : 7);
      focus.copy(target).add(lookAhead);
      focus.y += options.indoor ? 1.55 : options.soar ? 0.4 : 1.2;
      smoothedFocus.x = damp(smoothedFocus.x, focus.x, options.indoor ? 10 : 5, dt);
      smoothedFocus.y = damp(smoothedFocus.y, focus.y, options.indoor ? 8 : 3, dt);
      smoothedFocus.z = damp(smoothedFocus.z, focus.z, options.indoor ? 10 : 5, dt);

      let theta;
      let phi;
      let radius;
      if (options.indoor) {
        state.theta = damp(state.theta, state.targetTheta, 10, dt);
        // Free vertical look — previous 0.95–1.35 clamp locked the camera height
        state.phi = damp(state.phi, THREE.MathUtils.clamp(state.targetPhi, 0.42, 1.5), 10, dt);
        const speed = Math.hypot(velocity.x, velocity.y);
        const walkOut = THREE.MathUtils.smoothstep(speed, 0.35, 5.2);
        // Idle/enter: close (~4). Walking: pull out (~11). Wheel still nudges within range.
        const wheelT = THREE.MathUtils.clamp((state.targetRadius - 12) / 58, 0, 1);
        const speedRadius = THREE.MathUtils.lerp(4.0, 11.2, walkOut);
        const indoorTargetRadius = THREE.MathUtils.clamp(speedRadius + (wheelT - 0.35) * 5.5, 3.6, 13.5);
        state.radius = damp(state.radius, indoorTargetRadius, 5.5, dt);
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
        camera.position.x = THREE.MathUtils.clamp(camera.position.x, -12.8, 12.8);
        camera.position.z = THREE.MathUtils.clamp(camera.position.z, -14.6, 14.6);
        camera.position.y = THREE.MathUtils.clamp(camera.position.y, 1.15, 12.5);
      }

      state.shake = damp(state.shake, 0, 5, dt);
      if (state.shake > 0.01) {
        shakeOffset.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(state.shake * 0.9);
        camera.position.add(shakeOffset);
      }

      if (options.override) {
        state.overrideActive = true;
        state.overrideBlend = damp(state.overrideBlend ?? 0, 1, options.override.speed ?? 5.5, dt);
        if (!state.overridePos) {
          state.overridePos = new THREE.Vector3();
          state.overrideLook = new THREE.Vector3();
        }
        state.overridePos.copy(options.override.position);
        state.overrideLook.copy(options.override.lookAt);
      } else if (state.overrideActive) {
        state.overrideBlend = damp(state.overrideBlend, 0, 5.5, dt);
        if (state.overrideBlend < 0.005) {
          state.overrideActive = false;
          state.overrideBlend = 0;
        }
      }

      if (state.overrideActive && state.overrideBlend > 0) {
        camera.position.lerp(state.overridePos, state.overrideBlend);
        smoothedFocus.lerp(state.overrideLook, state.overrideBlend);
      }

      camera.lookAt(smoothedFocus);
    },
  };
}
