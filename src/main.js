import "./style.css";
import * as THREE from "three";
import { mulberry32 } from "./world/noise.js";
import { shared } from "./world/shading.js";
import { createTerrain } from "./world/terrain.js";
import { createWater } from "./world/water.js";
import { createSky } from "./world/sky.js";
import { createGrass } from "./world/grass.js";
import { createVegetation } from "./world/vegetation.js";
import { createProps } from "./world/props.js";
import { createLetters } from "./world/letters.js";
import { createParticles, createFireflies } from "./world/particles.js";
import { createVehicle } from "./world/vehicle.js";
import { createFollowCamera } from "./world/followCamera.js";
import { createCycles } from "./world/cycles.js";
import { createAreas } from "./world/areas.js";
import { createMinimap } from "./world/minimap.js";
import { createMusicEngine } from "./world/music.js";

const canvas = document.querySelector("#view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.5, 2400);

const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -55;
sun.shadow.camera.right = 55;
sun.shadow.camera.top = 55;
sun.shadow.camera.bottom = -55;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 320;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.06;
scene.add(sun, sun.target);
scene.add(new THREE.AmbientLight(0xfff2dc, 0.42));

const random = mulberry32(7);
const islandRoot = new THREE.Group();
scene.add(islandRoot);

const terrain = createTerrain();
const { features } = terrain;
islandRoot.add(terrain.mesh);

const water = createWater();
islandRoot.add(water);

const sky = createSky();
scene.add(sky.mesh);

const grass = createGrass();
islandRoot.add(grass.mesh);

const lettersOrigin = { x: features.spawn.x, z: features.spawn.z - 7 };
const colliders = [];
const avoid = [
  { x: features.spawn.x, z: features.spawn.z, radius: 19 },
  { x: features.lighthouse.x, z: features.lighthouse.z, radius: 8 },
  { x: features.dock.x, z: features.dock.z, radius: 9 },
  ...features.areas.map((area) => ({ x: area.x, z: area.z, radius: area.radius + 9 })),
  ...features.areas.map((area) => ({ x: area.entrance.x, z: area.entrance.z, radius: 9 })),
];
if (features.bridge) {
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    avoid.push({
      x: features.bridge.a.x + (features.bridge.b.x - features.bridge.a.x) * t,
      z: features.bridge.a.z + (features.bridge.b.z - features.bridge.a.z) * t,
      radius: 9,
    });
  }
}

const particles = createParticles();
islandRoot.add(particles.points);

const props = createProps({ terrain, random, colliders, avoid });
islandRoot.add(props.group);

const areas = await createAreas({ terrain, colliders, particles, camera });
islandRoot.add(areas.group);
scene.add(areas.dungeonGroup);

const vegetation = createVegetation({ terrain, random, colliders, avoid });
islandRoot.add(vegetation.group);

const surfaces = [...props.surfaces, ...areas.surfaces];
const groundHeight = (x, z) => {
  let height = terrain.heightAt(x, z);
  for (const surface of surfaces) height = Math.max(height, surface(x, z));
  return height;
};

const letters = createLetters({ text: "FRAMEWORK", origin: lettersOrigin, heightAt: groundHeight });
islandRoot.add(letters.group);

islandRoot.add(createFireflies({ terrain, random }));

const vehicle = await createVehicle({
  spawn: { x: features.spawn.x + 2, z: features.spawn.z + 5 },
  heading: Math.PI,
  groundHeight,
  terrain,
  colliders,
  particles,
});
islandRoot.add(vehicle.group);

const follow = createFollowCamera(camera, canvas);
follow.snap(vehicle.position);
const cycles = createCycles(sky);

shared.uRevealCenter.value.set(vehicle.position.x, vehicle.position.z);

const input = { forward: false, backward: false, left: false, right: false, boost: false, jump: false, down: false, somersault: false, loop: false, reset: false };
const keyMap = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "backward",
  ArrowDown: "backward",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  Space: "jump",
  ControlLeft: "down",
  ControlRight: "down",
  KeyQ: "somersault",
  KeyF: "loop",
};

const hud = {
  intro: document.querySelector("#intro"),
  start: document.querySelector("#start"),
  time: document.querySelector("#time"),
  speed: document.querySelector("#speed"),
  hud: document.querySelector("#hud"),
  toast: document.querySelector("#toast"),
  toastEyebrow: document.querySelector("#toast-eyebrow"),
  toastName: document.querySelector("#toast-name"),
  toastTagline: document.querySelector("#toast-tagline"),
  toastProgress: document.querySelector("#toast-progress"),
  toastProgressFill: document.querySelector("#toast-progress-fill"),
  dialogue: document.querySelector("#dialogue"),
  dialogueName: document.querySelector("#dialogue-name"),
  dialogueLine: document.querySelector("#dialogue-line"),
  dialogueHint: document.querySelector("#dialogue-hint"),
  menu: document.querySelector("#menu"),
  menuToggle: document.querySelector("#menu-toggle"),
  menuPanel: document.querySelector("#menu-panel"),
  menuMusicPause: document.querySelector("#menu-music-pause"),
  menuMusicOff: document.querySelector("#menu-music-off"),
  menuMusicRestart: document.querySelector("#menu-music-restart"),
  menuMusicNext: document.querySelector("#menu-music-next"),
  menuNowPlaying: document.querySelector("#menu-now-playing"),
  exitDungeon: document.querySelector("#exit-dungeon"),
  dungeonLoader: document.querySelector("#dungeon-loader"),
  dungeonLoaderBar: document.querySelector("#dungeon-loader-bar"),
  dungeonLoaderTitle: document.querySelector("#dungeon-loader-title"),
  dungeonLoaderSub: document.querySelector("#dungeon-loader-sub"),
};

let activeHuman = null;

const music = createMusicEngine();
const minimap = createMinimap({ canvas: document.querySelector("#minimap"), terrain, areas: areas.areas });
let currentArea = null;
let toastTimer = 0;
let rideToast = null;

const spawnPoint = { x: features.spawn.x + 2, z: features.spawn.z + 5, heading: Math.PI };
const travel = (index) => {
  areas.exitHall?.();
  const area = areas.areas[index];
  const target = area
    ? { x: area.x - area.direction.x * (area.radius - 3), z: area.z - area.direction.z * (area.radius - 3), heading: Math.atan2(area.direction.x, area.direction.z) }
    : spawnPoint;
  vehicle.teleport(target.x, target.z, target.heading);
  follow.snap(vehicle.position);
  follow.shake(0.4);
};

let started = false;
let revealTime = -1;

const setKey = (code, value) => {
  const action = keyMap[code];
  if (!action) return false;
  input[action] = value;
  return true;
};

const isUfoRide = () => !areas.isInsideDungeon() && vehicle.ride?.id === "ufo";
const isShiftKey = (code) => code === "ShiftLeft" || code === "ShiftRight";

window.addEventListener("keydown", (event) => {
  if (!started) {
    if (event.code === "Enter" || event.code === "Space") start();
    return;
  }
  if (setKey(event.code, true)) event.preventDefault();
  if (event.repeat) return;
  if (isShiftKey(event.code)) {
    // Kart / on foot: boost/sprint. UFO: sonic boom.
    if (isUfoRide()) input.reset = true;
    else input.boost = true;
    event.preventDefault();
  }
  if (event.code === "KeyR") {
    // Kart only: respawn. UFO: unbound.
    if (!isUfoRide() && !areas.isInsideDungeon()) {
      input.reset = true;
      event.preventDefault();
    }
  }
  if (event.code === "KeyC") follow.toggleChase();
  if (event.code === "KeyT") cycles.skip();
  if (event.code === "KeyE") areas.talk();
  if (event.code === "KeyV" && !areas.isInsideDungeon()) {
    input.boost = false;
    input.reset = false;
    rideToast = vehicle.cycleRide();
    follow.alignTo(vehicle.heading);
    follow.setFlyLook(vehicle.ride?.id === "ufo");
  }
  if (event.code === "KeyL" && !areas.isInsideDungeon()) vehicle.toggleLights();
  const digit = /^Digit([0-4])$/.exec(event.code);
  if (digit) travel(Number(digit[1]) - 1);
});
window.addEventListener("keyup", (event) => {
  setKey(event.code, false);
  if (isShiftKey(event.code)) input.boost = false;
});
window.addEventListener("blur", () => {
  for (const key of Object.keys(input)) input[key] = false;
});
hud.time.addEventListener("click", () => cycles.skip());

const syncMusicButton = () => {
  const track = music.track;
  if (hud.menuNowPlaying) {
    if (music.muted) hud.menuNowPlaying.textContent = "Music off";
    else if (music.paused) hud.menuNowPlaying.textContent = track ? `Paused · ${track.title} — ${track.artist}` : "Paused";
    else if (track) hud.menuNowPlaying.textContent = `Now playing · ${track.title} — ${track.artist}`;
    else hud.menuNowPlaying.textContent = "Music ready";
  }
  if (hud.menuMusicPause) {
    hud.menuMusicPause.textContent = music.playing ? "⏸" : "▶";
    hud.menuMusicPause.setAttribute("aria-label", music.playing ? "Pause" : "Play");
    hud.menuMusicPause.title = music.playing ? "Pause" : "Play";
    hud.menuMusicPause.classList.toggle("is-active", music.playing);
  }
  hud.menuMusicOff?.classList.toggle("is-active", music.muted);
};

music.onTrackChange(() => syncMusicButton());

const setMenuOpen = (open) => {
  if (!hud.menu || !hud.menuToggle || !hud.menuPanel) return;
  hud.menu.classList.toggle("is-open", open);
  hud.menuToggle.setAttribute("aria-expanded", String(open));
  if (open) hud.menuPanel.removeAttribute("hidden");
  else hud.menuPanel.setAttribute("hidden", "");
};

const showMenuPage = (page) => {
  for (const tab of document.querySelectorAll(".menu-tab")) {
    const active = tab.dataset.page === page;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  }
  for (const panel of document.querySelectorAll(".menu-page")) {
    panel.classList.toggle("is-active", panel.dataset.page === page);
  }
};

const showControlMode = (mode) => {
  for (const tab of document.querySelectorAll(".menu-subtab")) {
    tab.classList.toggle("is-active", tab.dataset.mode === mode);
  }
  for (const panel of document.querySelectorAll(".menu-mode")) {
    panel.classList.toggle("is-active", panel.dataset.mode === mode);
  }
};

hud.menuToggle?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  setMenuOpen(!hud.menu.classList.contains("is-open"));
});

hud.menuPanel?.addEventListener("click", (event) => {
  const tab = event.target.closest?.(".menu-tab");
  if (tab?.dataset.page) {
    showMenuPage(tab.dataset.page);
    return;
  }
  const sub = event.target.closest?.(".menu-subtab");
  if (sub?.dataset.mode) showControlMode(sub.dataset.mode);
});

hud.menuMusicPause?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  music.togglePause().then(syncMusicButton);
});

hud.menuMusicOff?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  music.turnOff();
  syncMusicButton();
});

hud.menuMusicRestart?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  music.restart().then(syncMusicButton);
});

hud.menuMusicNext?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  music.next().then(syncMusicButton);
});

window.addEventListener("pointerdown", (event) => {
  if (!hud.menu?.classList.contains("is-open") || hud.menu.contains(event.target)) return;
  setMenuOpen(false);
});

window.addEventListener(
  "keydown",
  (event) => {
    if (!started || event.code !== "Escape") return;
    if (!hud.menu?.classList.contains("is-open")) return;
    setMenuOpen(false);
    event.preventDefault();
    event.stopImmediatePropagation();
  },
  true
);

function start() {
  if (started) return;
  started = true;
  hud.intro.classList.add("is-hidden");
  hud.hud.classList.add("is-visible");
  revealTime = 0;
  follow.startIntro();
  music.start().then(syncMusicButton);
}
hud.start.addEventListener("click", start);
hud.toast.addEventListener("click", () => {
  if (areas.openPrompt()) return;
  const url = hud.toast.dataset.url;
  if (url) window.open(url, "_blank", "noopener,noreferrer");
});
hud.dialogue.addEventListener("click", () => {
  areas.talk();
});
const setExitChipVisible = (visible) => {
  if (!hud.exitDungeon) return;
  hud.exitDungeon.classList.toggle("is-visible", visible);
  if (visible) hud.exitDungeon.removeAttribute("hidden");
  else hud.exitDungeon.setAttribute("hidden", "");
};

hud.exitDungeon?.addEventListener("click", () => {
  areas.exitHall();
});

const runDungeonTransition = (transition) => {
  if (!hud.dungeonLoader) {
    applyWorldSwitch(transition);
    return;
  }
  if (hud.dungeonLoaderTitle) {
    hud.dungeonLoaderTitle.textContent = transition.inDungeon
      ? (transition.title || "Temple of Tribulations")
      : "Returning to Island";
  }
  if (hud.dungeonLoaderSub) {
    hud.dungeonLoaderSub.textContent = transition.inDungeon
      ? (transition.subtitle || "Summoning Research Sanctuary & Human Form…")
      : "Restoring Island World & Vehicle…";
  }
  if (hud.dungeonLoaderBar) hud.dungeonLoaderBar.style.width = "12%";
  hud.dungeonLoader.classList.add("is-active");
  hud.dungeonLoader.setAttribute("aria-hidden", "false");

  setTimeout(() => {
    if (hud.dungeonLoaderBar) hud.dungeonLoaderBar.style.width = "72%";
    applyWorldSwitch(transition);
  }, 180);

  setTimeout(() => {
    if (hud.dungeonLoaderBar) hud.dungeonLoaderBar.style.width = "100%";
  }, 460);

  setTimeout(() => {
    hud.dungeonLoader.classList.remove("is-active");
    hud.dungeonLoader.setAttribute("aria-hidden", "true");
    if (hud.dungeonLoaderBar) hud.dungeonLoaderBar.style.width = "0%";
  }, 680);
};

const applyWorldSwitch = (transition) => {
  shared.uIndoor.value = transition.inDungeon ? (transition.indoorMode ?? 1) : 0;
  if (transition.inDungeon) {
    islandRoot.visible = false;
    transition.dungeonGroup.visible = true;
    activeHuman = transition.human;
    setExitChipVisible(true);
    follow.setFlyLook(false);
    follow.alignTo(activeHuman.heading);
    follow.enterIndoor();
    follow.snap(activeHuman.position);
    follow.update(0, activeHuman.position, activeHuman.heading, activeHuman.velocity, { indoor: true });
    hud.toastEyebrow.textContent = transition.toastEyebrow || "Sanctuary Dungeon · Human Form";
    hud.toastName.textContent = transition.title || "Temple of Tribulations";
    hud.toastName.style.color = transition.toastColor || "#ffd23f";
    hud.toastTagline.textContent =
      transition.toastTagline ||
      "WASD walk · Shift sprint · Space jump · Esc to leave. Approach a statue and press E or Click!";
    hud.toast.classList.add("is-visible");
    hud.toast.classList.remove("is-link", "has-progress", "is-story");
    delete hud.toast.dataset.url;
    delete hud.toast.dataset.live;
    toastTimer = 5.5;
  } else {
    transition.dungeonGroup.visible = false;
    islandRoot.visible = true;
    activeHuman = null;
    setExitChipVisible(false);
    if (transition.returnPose) {
      vehicle.teleport(transition.returnPose.x, transition.returnPose.z, transition.returnPose.heading);
    }
    follow.exitIndoor();
    follow.snap(vehicle.position);
    follow.alignTo(vehicle.heading);
    follow.shake(0.3);
  }
};

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const sunOffset = new THREE.Vector3();
const carPoint = new THREE.Vector3();
let lastTime = performance.now();
let elapsed = 0;
let timeLabel = "";
let speedLabel = "";

function tick(now) {
  const dt = Math.min((now - lastTime) / 1000, 1 / 20);
  lastTime = now;
  elapsed += dt;
  shared.uTime.value = elapsed;

  cycles.update(dt);

  const inDungeon = areas.isInsideDungeon();

  if (started) {
    if (inDungeon) {
      follow.setFlyLook(false);
      areas.updateDungeonPlayer(dt, input, follow.lookHeading());
      input.reset = false;
    } else {
      const steps = dt > 1 / 50 ? 2 : 1;
      const flying = vehicle.ride?.id === "ufo";
      follow.setFlyLook(flying);
      const look = {
        heading: follow.lookHeading(),
        turnCamera: (delta) => follow.nudgeYaw(delta),
      };
      for (let s = 0; s < steps; s++) {
        vehicle.update(dt / steps, input, look);
        input.reset = false;
      }
      if (vehicle.state.impact > 4) follow.shake(vehicle.state.impact * 0.035);
      const letterImpact = letters.collide(vehicle.position, vehicle.velocity, vehicle.radius);
      if (letterImpact > 3) follow.shake(letterImpact * 0.03);
    }
  }
  if (!inDungeon) {
    letters.update(dt);
    particles.update(dt);
    props.update(dt, elapsed, shared.uNight.value);
  }
  const area = areas.update(dt, elapsed, vehicle.position);
  const transition = started ? areas.takeTeleport?.() : null;
  if (transition) {
    runDungeonTransition(transition);
  }
  const opened = started ? areas.takeOpened() : null;
  const prompt = started ? areas.socialState() : null;
  const talk = started ? areas.talkState() : null;
  if (talk) {
    hud.dialogueName.textContent = talk.name;
    hud.dialogueLine.textContent = talk.prompt ? "" : talk.line;
    hud.dialogueHint.textContent = talk.hint || "E to talk";
    hud.dialogue.classList.add("is-visible");
  } else {
    hud.dialogue.classList.remove("is-visible");
  }
  if (area !== currentArea && !inDungeon) {
    currentArea = area;
    if (area && started && !opened && !prompt) {
      hud.toastEyebrow.textContent = "Now arriving";
      hud.toastName.textContent = area.name;
      hud.toastName.style.color = area.color;
      hud.toastTagline.textContent = area.tagline;
      hud.toast.classList.add("is-visible");
      hud.toast.classList.remove("is-link", "has-progress", "is-story");
      delete hud.toast.dataset.url;
      hud.toast.removeAttribute("title");
      toastTimer = 3.5;
    }
  }
  if (rideToast) {
    hud.toastEyebrow.textContent = "Now riding";
    hud.toastName.textContent = rideToast.name;
    hud.toastName.style.color = rideToast.color;
    hud.toastTagline.textContent =
      rideToast.id === "ufo"
        ? "Mouse look, W camera-forward, S down, A/D turn. Shift sonic boom, L light"
        : rideToast.id === "f1"
          ? "WASD drive, Shift boost, R respawn, Space jump, L rain light"
          : "WASD drive, Shift boost, R respawn, Space jump";
    hud.toast.classList.add("is-visible");
    hud.toast.classList.remove("is-link", "has-progress", "is-story");
    delete hud.toast.dataset.url;
    hud.toast.removeAttribute("title");
    toastTimer = 2.4;
    rideToast = null;
  }
  const hideToast = () => {
    hud.toast.classList.remove("is-visible", "is-link", "has-progress", "is-story");
    delete hud.toast.dataset.url;
    delete hud.toast.dataset.live;
    hud.toast.removeAttribute("title");
  };

  if (opened) {
    hud.toastEyebrow.textContent = "Opening";
    hud.toastName.textContent = opened.name;
    hud.toastName.style.color = opened.color;
    hud.toastTagline.textContent = opened.blocked ? "Click to open" : "See you over there";
    hud.toast.dataset.url = opened.url;
    delete hud.toast.dataset.live;
    hud.toast.title = "Click to open in a new tab";
    hud.toast.classList.add("is-visible", "is-link");
    hud.toast.classList.remove("has-progress", "is-story");
    toastTimer = opened.blocked ? 6 : 2.6;
    follow.setBlockLock(true);
  } else if (prompt) {
    hud.toastEyebrow.textContent = "Click the box or press E to open";
    hud.toastName.textContent = prompt.name;
    hud.toastName.style.color = prompt.color;
    hud.toastTagline.textContent = prompt.bio || "Opens in a new tab";
    hud.toast.dataset.url = prompt.url;
    hud.toast.dataset.live = "1";
    hud.toast.title = "Click to open in a new tab";
    hud.toast.classList.add("is-visible", "is-link");
    hud.toast.classList.toggle("is-story", Boolean(prompt.bio));
    hud.toast.classList.remove("has-progress");
    toastTimer = 0;
    follow.setBlockLock(true);
  } else {
    follow.setBlockLock(false);
    if (hud.toast.dataset.live) {
      hideToast();
      toastTimer = 0;
    } else if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) hideToast();
    }
  }

  if (revealTime >= 0) {
    revealTime += dt;
    const t = Math.min(1, revealTime / 3.4);
    shared.uRevealRadius.value = 5 + Math.pow(t, 1.5) * 560;
    if (t >= 1) revealTime = -1;
  }

  const activeTarget = inDungeon && activeHuman ? activeHuman : vehicle;
  follow.update(dt, activeTarget.position, activeTarget.heading, activeTarget.velocity, {
    soar: !inDungeon && vehicle.ride?.id === "ufo",
    indoor: inDungeon,
    override: inDungeon ? areas.getCameraOverride?.() : null,
  });
  sky.mesh.position.copy(camera.position);

  carPoint.copy(activeTarget.position);
  if (!inDungeon) grass.update(carPoint, carPoint);
  sunOffset.copy(shared.uSunDirection.value).multiplyScalar(140);
  sun.target.position.set(Math.round(carPoint.x), Math.round(carPoint.y), Math.round(carPoint.z));
  sun.position.copy(sun.target.position).add(sunOffset);

  const label = cycles.name;
  if (label !== timeLabel) {
    timeLabel = label;
    hud.time.textContent = label;
  }
  const speedVal = inDungeon && activeHuman ? activeHuman.speed : vehicle.speed;
  const speed = `${Math.round(speedVal * 3.6)}`;
  if (speed !== speedLabel) {
    speedLabel = speed;
    hud.speed.textContent = speed;
  }

  if (!inDungeon) {
    minimap.draw(vehicle.position, vehicle.heading, 0, currentArea);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

follow.update(0, vehicle.position, vehicle.heading, vehicle.velocity);
renderer.compile(scene, camera);
requestAnimationFrame((now) => {
  lastTime = now;
  tick(now);
});

if (import.meta.env.DEV) {
  window.__island = { vehicle, follow, cycles, terrain, shared, start, input, travel, camera, areas, render: () => renderer.render(scene, camera) };
}
