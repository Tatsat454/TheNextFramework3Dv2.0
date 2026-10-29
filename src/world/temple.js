import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { getFont } from "./letters.js";
import { createGlows } from "./props.js";
import { createHumanExplorer } from "./human.js";
import { createEmissiveMaterial, createSolidMaterial, createStylizedMaterial, flatten, shared } from "./shading.js";

const STATUE_DEFS = [
  {
    id: "power",
    file: "/statue-lightning.glb",
    label: "PJM POWER",
    name: "PJM Electricity · AI Power Demand",
    bio: "Extended a Solow growth model on PJM's forecast — Northern Virginia's electricity demand nearly triples by 2045 due to AI data center clustering.",
    url: "https://docs.google.com/document/d/1RdxttWFKVUh-v5Mpnh5NdulgkWqoU-2Z/edit?usp=sharing&ouid=107914389794548838716&rtpof=true&sd=true",
    color: "#ffd23f",
    // Position inside the 30m x 36m Sanctuary Dungeon Hall
    x: -4.4,
    z: -7.2,
    ry: Math.PI * 0.28,
  },
  {
    id: "stocks",
    file: "/statue-stocks.glb",
    label: "STOCK MARKET",
    name: "Stock Market & Startup Success",
    bio: "Analyzed 923 startups and market trends to test what predicts acquisition vs. shutdown and how funding scales across milestones.",
    url: "https://docs.google.com/document/d/1p5DEkt8RaFbv2ApwcXwB4Nx1NX4POlWb5OOID0KcHL4/edit?tab=t.0",
    color: "#2ee87a",
    x: 4.4,
    z: -7.2,
    ry: -Math.PI * 0.28,
  },
  {
    id: "pokemon",
    file: "/statue-pokemon.glb",
    label: "POKEMON RL",
    name: "Pokémon Reinforcement Learning Model",
    bio: "Trained an autonomous RL agent on GameBoy Pokémon to master battle strategy, state evaluation, and long-horizon exploration.",
    url: "https://github.com/Tatsat454",
    color: "#ffd426",
    x: -4.4,
    z: 1.5,
    ry: Math.PI * 0.22,
  },
  {
    id: "robots",
    file: "/statue-robot.glb",
    label: "FLO ROBOT",
    name: "Flo the Autonomous Helper Robot",
    bio: "Designed and 3D-printed Flo, a low-cost home robot that picks up clothes, carries them to a basket, and docks itself to recharge.",
    url: "https://github.com/Tatsat454/FLO-Mini-v0.3",
    color: "#14e4ff",
    x: 4.4,
    z: 1.5,
    ry: -Math.PI * 0.22,
  },
  {
    id: "bellman",
    file: "/statue-bellman.glb",
    label: "BELLMAN DDC",
    name: "DDC Taxi Driver · Bellman Equation",
    bio: "Dynamic discrete choice model on 83K+ NYC taxi trips solving the Bellman equation V(s) = max [R(s,a) + γ Σ P(s'|s,a)V(s')] for driver routing.",
    url: "https://drive.google.com/file/d/12_YDLHcJTAI3FRRCVqYile0xuvCYIPNO/view",
    color: "#ffbe2e",
    // Centerpiece on the raised Altar of Tribulations dais!
    x: 0.0,
    z: 13.6,
    ry: Math.PI,
    onAltar: true,
  },
];

let cachedAssets = null;

export async function loadTempleTemplate() {
  if (cachedAssets) return cachedAssets;
  const loader = new GLTFLoader();
  const [templeGltf, interiorGltf, ...statueGltfs] = await Promise.all([
    loader.loadAsync("/temple.glb"),
    loader.loadAsync("/temple-interior.glb"),
    ...STATUE_DEFS.map((s) => loader.loadAsync(s.file)),
  ]);
  const statues = {};
  STATUE_DEFS.forEach((def, idx) => {
    statues[def.id] = statueGltfs[idx].scene;
  });
  cachedAssets = {
    temple: templeGltf.scene,
    interior: interiorGltf.scene,
    statues,
  };
  return cachedAssets;
}

function createGoldMaterial() {
  return createStylizedMaterial({
    uniforms: {
      uColor: { value: new THREE.Color("#e8ad3a") },
    },
    fragmentPars: "uniform vec3 uColor;",
    fragmentMain: /* glsl */ `
      vec3 viewDir = normalize(cameraPosition - vWorldPosition);
      vec3 halfVec = normalize(uSunDirection + viewDir);
      float spec = pow(max(dot(normal, halfVec), 0.0), 24.0) * 0.45;
      outColor = stylize(uColor, normal, vWorldPosition, 0.0, shadowMask) + vec3(1.0, 0.85, 0.45) * spec + uColor * uNight * 0.18;
    `,
  });
}

function createOculusSunbeam(radiusTop = 3.1, radiusBottom = 4.5, height = 13.0, yPos = 6.5, zPos = 3.2) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color("#ffe29a") },
      uNight: shared.uNight,
      uTime: shared.uTime,
    },
    vertexShader: /* glsl */ `
      varying float vHeight;
      varying float vFacing;
      void main() {
        vHeight = uv.y;
        vec3 viewNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vFacing = abs(dot(viewNormal, normalize(-mvPosition.xyz)));
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uNight;
      uniform float uTime;
      varying float vHeight;
      varying float vFacing;
      void main() {
        float verticalFade = smoothstep(0.0, 0.18, vHeight) * pow(vHeight, 0.65);
        float shimmer = 0.9 + 0.1 * sin(uTime * 1.5 + vHeight * 10.0);
        float dayStrength = mix(0.24, 0.12, uNight);
        float alpha = verticalFade * pow(vFacing, 1.3) * shimmer * dayStrength;
        gl_FragColor = vec4(uColor * alpha, 1.0);
      }
    `,
  });
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 32, 1, true);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, yPos, zPos);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return mesh;
}

function createPortalRing(colorHex, radius = 1.6) {
  const group = new THREE.Group();
  const ringMat = createEmissiveMaterial(colorHex);
  const torus = new THREE.Mesh(flatten(new THREE.TorusGeometry(radius, 0.08, 10, 28)), ringMat);
  torus.rotation.x = Math.PI / 2;
  torus.position.y = 0.08;
  group.add(torus);
  return { group, torus };
}

function make3DLabel(text, colorHex) {
  const font = getFont();
  if (!font) return new THREE.Group();
  const geo = new TextGeometry(text, {
    font,
    size: 0.34,
    depth: 0.08,
    curveSegments: 3,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.015,
    bevelSegments: 2,
  });
  geo.computeBoundingBox();
  geo.center();
  return new THREE.Mesh(flatten(geo), createEmissiveMaterial(colorHex));
}

export function createTempleOfTribulations(area, _heightAt, colliders, assets, onStateChange) {
  // 1. Exterior Group (lives on the Island)
  const exteriorGroup = new THREE.Group();

  // 2. Separate Dungeon World Group (lives at origin (0,0,0) when inside the Sanctuary!)
  const dungeonGroup = new THREE.Group();
  dungeonGroup.visible = false;

  // Exterior Temple Scale = 1.35x bigger as requested, rotated 180 degrees!
  const EXT_SCALE = 1.35;
  const entranceVec = new THREE.Vector2(-area.direction.x, -area.direction.z).normalize();
  const yaw = Math.atan2(-entranceVec.x, -entranceVec.y) + Math.PI;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);

  const templeMaterials = {
    Temple_Marble_Cream: createSolidMaterial("#f3e5ce"),
    Temple_Marble_Dark: createSolidMaterial("#d8c2a3"),
    Temple_Floor_Marble: createSolidMaterial("#ede1cb"),
    Temple_Royal_Blue: createSolidMaterial("#1c3f7a"),
    Temple_Royal_Blue_Dark: createSolidMaterial("#132b56"),
    Temple_Gold_Trim: createGoldMaterial(),
    Temple_Bronze_Wood: createSolidMaterial("#54331c"),
    Temple_Torch_Flames: createEmissiveMaterial("#ffae38"),
    Temple_Skylight_Glass: createEmissiveMaterial("#88c8ff"),
    Dungeon_Marble_Cream: createSolidMaterial("#f3e5ce"),
    Dungeon_Marble_Dark: createSolidMaterial("#d8c2a3"),
    Dungeon_Floor_Marble: createSolidMaterial("#ede1cb"),
    Dungeon_Royal_Blue: createSolidMaterial("#1c3f7a"),
    Dungeon_Royal_Blue_Dark: createSolidMaterial("#132b56"),
    Dungeon_Gold_Trim: createGoldMaterial(),
    Dungeon_Bronze_Wood: createSolidMaterial("#54331c"),
    Dungeon_Torch_Flames: createEmissiveMaterial("#ffae38"),
    Dungeon_Skylight_Glass: createEmissiveMaterial("#88c8ff"),
  };

  const styleModel = (root, { isInterior = false } = {}) => {
    root.traverse((child) => {
      if (!child.isMesh) return;
      child.geometry = flatten(child.geometry.clone());
      child.material = templeMaterials[child.name] || templeMaterials.Temple_Marble_Cream;
      const isEmissive = child.name.includes("Torch_Flames") || child.name.includes("Skylight_Glass");
      child.castShadow = !isInterior && !isEmissive;
      child.receiveShadow = !isEmissive;
      child.frustumCulled = false;
    });
  };

  // ============================================================================
  // A. EXTERIOR TEMPLE ON THE EXPANDED NORTHERN ISLAND (1.35x Bigger, Rotated 180°)
  // ============================================================================
  const exteriorRoot = new THREE.Group();
  exteriorRoot.position.set(area.x, area.y, area.z);
  exteriorRoot.rotation.y = yaw;
  exteriorRoot.scale.setScalar(EXT_SCALE);
  exteriorGroup.add(exteriorRoot);

  if (assets?.temple) {
    const extModel = assets.temple.clone(true);
    styleModel(extModel);
    exteriorRoot.add(extModel);
  }

  const toExteriorWorld = (lx, ly, lz) =>
    new THREE.Vector3(
      area.x + (lx * cosY + lz * sinY) * EXT_SCALE,
      area.y + ly * EXT_SCALE,
      area.z + (-lx * sinY + lz * cosY) * EXT_SCALE
    );

  // Exterior Torch Glows
  const extGlowCoords = [
    [-3.1, 5.2, -6.1],
    [3.1, 5.2, -6.1],
    [-6.5, 5.2, -6.1],
    [6.5, 5.2, -6.1],
    [-8.7, 5.2, -4.3],
    [-8.7, 5.2, 2.0],
    [8.7, 5.2, -4.3],
    [8.7, 5.2, 2.0],
    [0.0, 1.5, -11.4],
  ];
  exteriorGroup.add(
    createGlows(
      extGlowCoords.map(([lx, ly, lz]) => toExteriorWorld(lx, ly, lz)),
      { color: "#ffae38", size: 520, day: 0.45 }
    )
  );

  // Solid Exterior Colliders around the entire Temple Podium AND Stairs so the car cannot enter or bounce on stairs
  const addExtCollider = (lx, lz, radius) => {
    const w = toExteriorWorld(lx, 0, lz);
    colliders.push({ x: w.x, z: w.z, radius: radius * EXT_SCALE });
  };
  // Podium front & back edges (lx from -11.4 to +11.4)
  for (let lx = -11.4; lx <= 11.41; lx += 1.9) {
    addExtCollider(lx, -8.5, 1.45);
    addExtCollider(lx, 8.7, 1.45);
    addExtCollider(lx, 0.0, 2.2);
  }
  // Podium left & right edges (lz from -8.5 to +8.7)
  for (let lz = -6.8; lz <= 7.0; lz += 1.9) {
    addExtCollider(-11.4, lz, 1.45);
    addExtCollider(11.4, lz, 1.45);
  }
  // Full Staircase solid block (lx from -4.8 to +4.8, lz from -11.2 to -8.6)
  for (let lx = -4.5; lx <= 4.51; lx += 1.5) {
    addExtCollider(lx, -10.8, 1.25);
    addExtCollider(lx, -9.5, 1.25);
  }

  // ============================================================================
  // B. SEPARATE INDOOR SANCTUARY DUNGEON WORLD + HUMAN EXPLORER + 5 STATUES
  // ============================================================================
  // Note: Blender export (+Y up) maps Blender (X, Y, Z) -> Three.js (X, Z, -Y).
  // So in temple-interior.glb:
  //   Blender South Entrance (Y = -18) -> Three.js Z = +18
  //   Blender North Altar Apse (Y = +17.8) -> Three.js Z = -17.8
  // Let's rotate the interior model by Math.PI around Y so South Entrance is at Z = -18
  // and North Altar Apse is at Z = +17.8 (matching standard +Z North)!
  const dungeonHallRoot = new THREE.Group();
  dungeonHallRoot.rotation.y = Math.PI;
  dungeonGroup.add(dungeonHallRoot);

  if (assets?.interior) {
    const intModel = assets.interior.clone(true);
    styleModel(intModel, { isInterior: true });
    dungeonHallRoot.add(intModel);
  }

  // Volumetric Golden Oculus Sunbeam streaming onto the central Compass Rose Medallion (at Z = -3.2)
  dungeonGroup.add(createOculusSunbeam(3.2, 4.4, 13.0, 6.5, -3.2));

  // Glowing Golden Exit Ring & Label at the South Entrance Doors (Z = -15.6)
  const exitPortal = createPortalRing("#ffd23f", 1.5);
  exitPortal.group.position.set(0, 0.06, -15.6);
  dungeonGroup.add(exitPortal.group);

  const exitLabel = make3DLabel("EXIT SANCTUARY", "#ffd23f");
  exitLabel.scale.setScalar(0.65);
  exitLabel.position.set(0, 3.6, -16.8);
  dungeonGroup.add(exitLabel);

  // Human Explorer Character inside the Dungeon World!
  const human = createHumanExplorer();
  dungeonGroup.add(human.group);

  // Material palette for the 5 Project Statues
  const statuePalette = {
    Pedestal_Marble: createSolidMaterial("#f3e5ce"),
    Pedestal_Blue: createSolidMaterial("#1c3f7a"),
    Pedestal_Gold: createGoldMaterial(),
    Statue_Glow_Yellow: createEmissiveMaterial("#ffd438"),
    Statue_Glow_Cyan: createEmissiveMaterial("#24e8ff"),
    Statue_Dark_Coil: createSolidMaterial("#263044"),
    Statue_Glow_Green: createEmissiveMaterial("#2ee87a"),
    Statue_Red: createEmissiveMaterial("#ff4a4a"),
    Statue_Dark_Grid: createSolidMaterial("#263044"),
    Statue_GameBoy_Shell: createSolidMaterial("#dcdad2"),
    Statue_Glow_Screen: createEmissiveMaterial("#9bbc0f"),
    Statue_Pikachu_Yellow: createSolidMaterial("#ffd426"),
    Statue_Pikachu_Red: createSolidMaterial("#ee3232"),
    Statue_Dark_Parts: createSolidMaterial("#1e1e24"),
    Statue_Robot_Shell: createSolidMaterial("#f0f4fa"),
    Statue_Robot_Visor: createSolidMaterial("#1a2234"),
    Statue_Robot_Accent: createEmissiveMaterial("#ff3d8a"),
    Statue_Taxi_Yellow: createSolidMaterial("#ffc824"),
    Statue_Glow_Equation: createEmissiveMaterial("#ffe066"),
    Statue_Dark_Wheels: createSolidMaterial("#1e222b"),
  };

  const resolveStatueMaterial = (meshName) => {
    const clean = meshName.replace(/\.\d+$/, "");
    return statuePalette[clean] || templeMaterials.Temple_Gold_Trim;
  };

  const interactiveStatues = [];
  const clickableMeshes = [];
  const dungeonGlows = [];
  const dungeonColliders = [];

  for (const def of STATUE_DEFS) {
    const floorY = def.onAltar ? 1.15 : 0.0;
    const holder = new THREE.Group();
    holder.position.set(def.x, floorY, def.z);
    holder.rotation.y = def.ry;
    holder.scale.setScalar(1.12);
    dungeonGroup.add(holder);

    const floatingParts = [];
    const template = assets?.statues?.[def.id];
    if (template) {
      const statueScene = template.clone(true);
      statueScene.traverse((child) => {
        if (!child.isMesh) return;
        child.geometry = flatten(child.geometry.clone());
        child.material = resolveStatueMaterial(child.name);
        child.castShadow = true;
        child.receiveShadow = true;
        child.frustumCulled = false;
        child.userData.statueId = def.id;
        clickableMeshes.push(child);
        if (!child.name.startsWith("Pedestal_")) {
          floatingParts.push({ mesh: child, baseY: child.position.y });
        }
      });
      holder.add(statueScene);
    }

    const titleMesh = make3DLabel(def.label, def.color);
    titleMesh.scale.setScalar(0.65);
    titleMesh.position.set(0, 4.35, 0);
    holder.add(titleMesh);

    const aura = createPortalRing(def.color, 1.25);
    holder.add(aura.group);

    dungeonGlows.push(new THREE.Vector3(def.x, floorY + 2.8, def.z));
    dungeonColliders.push({ x: def.x, z: def.z, radius: 1.15 });

    interactiveStatues.push({
      ...def,
      holder,
      floatingParts,
      titleMesh,
      aura: aura.torus,
      y: floorY + 1.5,
      near: false,
      fired: false,
    });
  }

  // Add warm torchlight glows at EVERY single lamp/sconce/brazier in the Dungeon (40 lamps total)
  for (const cy of [-13.0, -7.2, -1.4, 4.4, 10.2]) {
    // 10 Column Twin Sconces
    dungeonGlows.push(new THREE.Vector3(-6.23, 4.46, cy), new THREE.Vector3(6.23, 4.46, cy));
    dungeonColliders.push({ x: -7.0, z: cy, radius: 1.05 }, { x: 7.0, z: cy, radius: 1.05 });
  }
  for (const pz of [-16.8, -13.0, -7.2, -1.4, 4.4, 10.2, 16.0]) {
    // 14 Outer Wall Pilaster Sconces
    dungeonGlows.push(new THREE.Vector3(-13.88, 4.55, pz), new THREE.Vector3(13.88, 4.55, pz));
  }
  for (const az of [-10.1, -4.3, 1.5, 7.3, 13.1]) {
    // 10 Side-Aisle Shrine Alcove Braziers
    dungeonGlows.push(new THREE.Vector3(-14.95, 3.22, az), new THREE.Vector3(14.95, 3.22, az));
  }
  for (const bx of [-4.2, -3.1, -2.0, 2.0, 3.1, 4.2]) {
    // 6 North Altar Candelabra Braziers
    dungeonGlows.push(new THREE.Vector3(bx, 2.53, 15.8));
  }
  dungeonGroup.add(createGlows(dungeonGlows, { color: "#ffae38", size: 480, day: 0.82 }));

  // Floor height inside the Sanctuary Dungeon (flat floor + 5-step Sanctuary Altar Dais at z >= 11.0)
  const dungeonSurfaceAt = (_x, z) => {
    if (z >= 11.0) {
      const t = THREE.MathUtils.clamp((z - 11.0) / 3.2, 0, 1);
      return t * 1.15;
    }
    return 0.0;
  };

  // ============================================================================
  // C. STATE & INTERACTIONS (STAIRS PROMPT -> LOADING SCREEN -> HUMAN DUNGEON)
  // ============================================================================
  let inDungeon = false;
  let nearExteriorStairs = false;
  let nearDungeonExit = false;
  let opened = null;
  let prompt = null;
  let activeCamera = null;

  const openLink = (url) => Boolean(window.open(url, "_blank", "noopener,noreferrer"));

  const enterDungeon = () => {
    if (inDungeon) return;
    inDungeon = true;
    nearExteriorStairs = false;
    prompt = null;
    human.spawn(0, 0, -13.2, 0); // Spawn near South Entrance facing North (+Z) toward Altar & 5 Statues!
    onStateChange?.({
      inDungeon: true,
      dungeonGroup,
      human,
    });
  };

  const exitDungeon = () => {
    if (!inDungeon) return;
    inDungeon = false;
    nearDungeonExit = false;
    prompt = null;
    const outPos = toExteriorWorld(0, 0, 14.2);
    const outHeading = Math.atan2(sinY, cosY);
    onStateChange?.({
      inDungeon: false,
      dungeonGroup,
      returnPose: { x: outPos.x, z: outPos.z, heading: outHeading },
    });
  };

  // Click directly on 3D statues inside the Dungeon!
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  window.addEventListener("pointerdown", (event) => {
    if (!inDungeon || !activeCamera || event.button !== 0) return;
    if (event.target?.closest?.("#hud, #intro, #toast, #controls, #dialogue, #dungeon-loader")) return;
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, activeCamera);
    const hits = raycaster.intersectObjects(clickableMeshes, false);
    if (hits.length > 0) {
      const statueId = hits[0].object.userData.statueId;
      const statue = interactiveStatues.find((s) => s.id === statueId);
      if (statue) {
        statue.fired = true;
        opened = { ...statue, blocked: !openLink(statue.url) };
      }
    }
  });

  window.addEventListener("keydown", (event) => {
    if (inDungeon && event.code === "Escape") {
      exitDungeon();
    }
  });

  return {
    group: exteriorGroup,
    dungeonGroup,
    human,
    isInsideDungeon: () => inDungeon,
    exitHall: exitDungeon,
    takeOpened() {
      const val = opened;
      opened = null;
      return val;
    },
    socialState() {
      return prompt;
    },
    openPrompt() {
      if (!inDungeon && nearExteriorStairs) {
        enterDungeon();
        return true;
      }
      if (inDungeon && nearDungeonExit) {
        exitDungeon();
        return true;
      }
      const active = interactiveStatues.find((s) => s.near);
      if (!active) return false;
      active.fired = true;
      prompt = null;
      opened = { ...active, blocked: !openLink(active.url) };
      return true;
    },
    talk() {
      if (!inDungeon && nearExteriorStairs) {
        enterDungeon();
        return true;
      }
      if (inDungeon) {
        const active = interactiveStatues.find((s) => s.near);
        if (active) {
          active.fired = true;
          opened = { ...active, blocked: !openLink(active.url) };
          return true;
        }
        if (nearDungeonExit) {
          exitDungeon();
          return true;
        }
      }
      return false;
    },
    talkState() {
      if (!inDungeon && nearExteriorStairs) {
        return {
          name: "Temple of Tribulations",
          line: "Enter the Grand Research Sanctuary",
          hint: "Click or Press E to Enter",
          prompt: false,
        };
      }
      if (inDungeon) {
        const active = interactiveStatues.find((s) => s.near);
        if (active) {
          return {
            name: active.name,
            line: active.label,
            hint: "Click or Press E to Open Research",
            prompt: false,
          };
        }
        if (nearDungeonExit) {
          return {
            name: "Sanctuary Doors",
            line: "Return to the Island",
            hint: "Click or Press E (or Esc) to Exit",
            prompt: false,
          };
        }
      }
      return null;
    },
    updateDungeonPlayer(dt, input, cameraHeading) {
      if (!inDungeon) return;
      human.update(dt, input, cameraHeading, dungeonSurfaceAt, dungeonColliders);
    },
    update(time, _dt = 0.016, carPosition, camera) {
      activeCamera = camera;
      exitPortal.torus.rotation.z = -time * 1.2;

      if (!inDungeon) {
        if (!carPosition) return;
        // Trigger the prompt box anywhere on the Temple Island Circle!
        const distFromIslandCenter = Math.hypot(carPosition.x - area.x, carPosition.z - area.z);
        nearExteriorStairs = distFromIslandCenter < area.radius + 3.5;
        prompt = null;
        return;
      }

      // Inside the Sanctuary Dungeon World:
      const p = human.position;

      // 1. Animate the 5 Project Statues
      interactiveStatues.forEach((statue, idx) => {
        const bob = Math.sin(time * 2.2 + idx * 1.3) * 0.12;
        for (const fp of statue.floatingParts) {
          fp.mesh.position.y = fp.baseY + bob;
        }
        statue.aura.rotation.z = time * 1.5 + idx;
        const auraScale = statue.near ? 1.18 + Math.sin(time * 6) * 0.06 : 1.0;
        statue.aura.scale.setScalar(auraScale);
        if (camera) {
          statue.titleMesh.lookAt(camera.position);
        }
      });

      // 2. Check proximity to the 5 Project Statues
      let nearest = null;
      let nearestDist = 4.2;
      for (const statue of interactiveStatues) {
        const d = Math.hypot(p.x - statue.x, p.z - statue.z);
        if (d < nearestDist) {
          nearest = statue;
          nearestDist = d;
        }
      }
      for (const statue of interactiveStatues) {
        statue.near = statue === nearest;
        if (statue !== nearest) statue.fired = false;
      }

      // 3. Check proximity to the South Exit Doors (z = -15.6)
      const exitDist = Math.hypot(p.x - 0, p.z - -15.6);
      nearDungeonExit = exitDist < 3.4;

      if (nearest && !nearest.fired) {
        prompt = {
          name: nearest.name,
          bio: nearest.bio,
          color: nearest.color,
          url: nearest.url,
        };
      } else {
        prompt = null;
      }
    },
  };
}
