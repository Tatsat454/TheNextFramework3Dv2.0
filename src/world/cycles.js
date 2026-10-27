import * as THREE from "three";
import { shared } from "./shading.js";

const PRESETS = [
  {
    name: "Day",
    sun: [0.45, 0.82, 0.35],
    light: "#fff4e2",
    intensity: 1.15,
    shadow: "#7c6cf0",
    zenith: "#4fb3ff",
    horizon: "#bde8ff",
    sunColor: "#fff6d6",
    night: 0,
  },
  {
    name: "Dusk",
    sun: [-0.75, 0.28, 0.4],
    light: "#ffc08a",
    intensity: 1.08,
    shadow: "#8a5ab8",
    zenith: "#5b6fd6",
    horizon: "#ffb88a",
    sunColor: "#ff9a5c",
    night: 0.35,
  },
  {
    name: "Night",
    sun: [-0.35, 0.75, -0.45],
    light: "#9fb4ff",
    intensity: 0.62,
    shadow: "#2a2f7a",
    zenith: "#0b1033",
    horizon: "#2a3a7a",
    sunColor: "#dfe6ff",
    night: 1,
  },
  {
    name: "Dawn",
    sun: [0.8, 0.3, -0.35],
    light: "#ffd6c2",
    intensity: 1.0,
    shadow: "#7a6ad0",
    zenith: "#7ca8f0",
    horizon: "#ffd1c4",
    sunColor: "#ffc7a0",
    night: 0.15,
  },
].map((preset) => ({
  ...preset,
  sun: new THREE.Vector3(...preset.sun).normalize(),
  light: new THREE.Color(preset.light),
  shadow: new THREE.Color(preset.shadow),
  zenith: new THREE.Color(preset.zenith),
  horizon: new THREE.Color(preset.horizon),
  sunColor: new THREE.Color(preset.sunColor),
}));

const HOLD = 0.62;

export function createCycles(sky, { duration = 280 } = {}) {
  let progress = 0.02;
  let skipTarget = null;

  const blend = (a, b, t) => {
    shared.uSunDirection.value.copy(a.sun).lerp(b.sun, t).normalize();
    shared.uLightColor.value.copy(a.light).lerp(b.light, t);
    shared.uLightIntensity.value = a.intensity + (b.intensity - a.intensity) * t;
    shared.uShadowColor.value.copy(a.shadow).lerp(b.shadow, t);
    shared.uFogColor.value.copy(a.horizon).lerp(b.horizon, t);
    shared.uNight.value = a.night + (b.night - a.night) * t;
    sky.uniforms.uZenith.value.copy(a.zenith).lerp(b.zenith, t);
    sky.uniforms.uHorizon.value.copy(a.horizon).lerp(b.horizon, t);
    sky.uniforms.uSunColor.value.copy(a.sunColor).lerp(b.sunColor, t);
    sky.uniforms.uNight.value = shared.uNight.value;
  };

  const current = () => {
    const scaled = progress * PRESETS.length;
    const index = Math.floor(scaled) % PRESETS.length;
    const local = scaled - Math.floor(scaled);
    const t = local < HOLD ? 0 : (local - HOLD) / (1 - HOLD);
    return { index, t: t * t * (3 - 2 * t) };
  };

  return {
    get name() {
      const { index, t } = current();
      return PRESETS[t > 0.5 ? (index + 1) % PRESETS.length : index].name;
    },
    skip() {
      skipTarget = (Math.floor(progress * PRESETS.length) + 1) / PRESETS.length;
    },
    update(dt) {
      if (skipTarget !== null) {
        progress += dt * 0.4;
        if (progress >= skipTarget) {
          progress = skipTarget;
          skipTarget = null;
        }
      } else {
        progress += dt / duration;
      }
      if (progress >= 1) {
        progress -= 1;
        if (skipTarget !== null) skipTarget -= 1;
      }
      const { index, t } = current();
      blend(PRESETS[index], PRESETS[(index + 1) % PRESETS.length], t);
    },
  };
}
