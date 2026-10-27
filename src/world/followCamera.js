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
  };

  domElement.addEventListener("pointerdown", (event) => {
    state.dragging = true;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    domElement.setPointerCapture(event.pointerId);
  });
  domElement.addEventListener("pointermove", (event) => {
    if (!state.dragging) return;
    const dx = event.clientX - state.lastX;
    const dy = event.clientY - state.lastY;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    state.targetTheta -= dx * 0.006;
    state.targetPhi = THREE.MathUtils.clamp(state.targetPhi - dy * 0.004, 0.35, 1.32);
    state.idle = 0;
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
      lookAhead.set(velocity.x * 0.32, 0, velocity.y * 0.32);
      lookAhead.clampLength(0, 7);
      focus.copy(target).add(lookAhead);
      focus.y += options.soar ? 0.4 : 1.2;
      smoothedFocus.x = damp(smoothedFocus.x, focus.x, 5, dt);
      smoothedFocus.y = damp(smoothedFocus.y, focus.y, 3, dt);
      smoothedFocus.z = damp(smoothedFocus.z, focus.z, 5, dt);

      let theta;
      let phi;
      let radius;
      if (options.soar || state.chase) {
        state.chaseTheta = damp(state.chaseTheta, heading + Math.PI, options.soar ? 4.2 : 3.5, dt);
        theta = state.chaseTheta;
        phi = options.soar ? 1.12 : 1.2;
        radius = options.soar ? 18 : 15;
      } else {
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

      state.shake = damp(state.shake, 0, 5, dt);
      if (state.shake > 0.01) {
        shakeOffset.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(state.shake * 0.9);
        camera.position.add(shakeOffset);
      }
      camera.lookAt(smoothedFocus);
    },
  };
}
