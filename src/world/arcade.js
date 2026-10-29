import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { getFont } from "./letters.js";
import { createGlows } from "./props.js";
import { createHumanExplorer } from "./human.js";
import { createArcadeGameOverlay } from "./minigames.js";
import { createEmissiveMaterial, createSolidMaterial, createStylizedMaterial, flatten, shared } from "./shading.js";

const ARCADE_MACHINE_DEFS = [
  {
    id: "astro",
    label: "ASTRO BLASTER",
    gameTitle: "ASTRO BLASTER",
    name: "Classic Retro Space Shooter",
    bio: "Defend against waves of alien invaders! Move with Left/Right or A/D, fire lasers with Space. High scores saved!",
    url: "https://github.com/Tatsat454",
    color: "#4fc3f7",
    x: -5.1,
    z: 10.2,
    floorY: 0.65,
  },
  {
    id: "brick",
    label: "BRICK SMASH",
    gameTitle: "BRICK SMASH",
    name: "Classic Retro Breakout",
    bio: "Smash through 5 rows of colorful candy bricks! Control the paddle with Left/Right or A/D, launch with Space.",
    url: "https://github.com/Tatsat454",
    color: "#ffd23f",
    x: -1.7,
    z: 11.0,
    floorY: 0.65,
  },
  {
    id: "racer",
    label: "TURBO DRIFT",
    gameTitle: "TURBO DRIFT",
    name: "Classic 80s Highway Racer",
    bio: "Dodge highway traffic and grab gold coins! Steer with Left/Right or A/D, hit Up or Space for Turbo Nitro!",
    url: "https://github.com/Tatsat454",
    color: "#ff5b4a",
    x: 1.7,
    z: 11.0,
    floorY: 0.65,
  },
  {
    id: "hopper",
    label: "PIXEL HOPPER",
    gameTitle: "PIXEL HOPPER",
    name: "Classic Endless Jumper Runner",
    bio: "Hop over spike traps and leap for floating gems! Tap Space or Up to jump, tap again to Double Jump!",
    url: "https://github.com/Tatsat454",
    color: "#7c6cf0",
    x: 5.1,
    z: 10.2,
    floorY: 0.65,
  },
];

let cachedArcadeAssets = null;

export async function loadArcadeTemplate() {
  if (cachedArcadeAssets) return cachedArcadeAssets;
  const loader = new GLTFLoader();
  const [extGltf, intGltf] = await Promise.all([
    loader.loadAsync("/arcade.glb"),
    loader.loadAsync("/arcade-interior.glb"),
  ]);
  cachedArcadeAssets = {
    exterior: extGltf.scene,
    interior: intGltf.scene,
  };
  return cachedArcadeAssets;
}

function createGoldMaterial() {
  return createStylizedMaterial({
    uniforms: {
      uColor: { value: new THREE.Color("#e8ad3a") },
    },
    fragmentPars: "uniform vec3 uColor;",
    fragmentMain: /* glsl */ `
      vec3 lightDir = uIndoor > 0.5 ? normalize(vec3(0.0, 10.0, vWorldPosition.z) - vWorldPosition) : uSunDirection;
      vec3 viewDir = normalize(cameraPosition - vWorldPosition);
      vec3 halfVec = normalize(lightDir + viewDir);
      float spec = pow(max(dot(normal, halfVec), 0.0), 24.0) * 0.45;
      outColor = stylize(uColor, normal, vWorldPosition, 0.0, shadowMask) + vec3(1.0, 0.85, 0.45) * spec + uColor * uNight * 0.18;
    `,
  });
}

function createGpuOculusBeam(radiusTop = 2.8, radiusBottom = 4.2, height = 11.2, yPos = 5.6, zPos = 2.2) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color("#68e8ff") },
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
        float shimmer = 0.9 + 0.1 * sin(uTime * 2.0 + vHeight * 10.0);
        float alpha = verticalFade * pow(vFacing, 1.3) * shimmer * 0.18;
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

function createPortalRing(colorHex, radius = 1.15) {
  const group = new THREE.Group();
  const ringMat = createEmissiveMaterial(colorHex);
  const torus = new THREE.Mesh(flatten(new THREE.TorusGeometry(radius, 0.075, 10, 28)), ringMat);
  torus.rotation.x = Math.PI / 2;
  torus.position.y = 0.07;
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

export function createMarketArcade(area, _heightAt, colliders, assets, onStateChange) {
  const exteriorGroup = new THREE.Group();
  const dungeonGroup = new THREE.Group();
  dungeonGroup.visible = false;

  const EXT_SCALE = 1.15;
  const entranceVec = new THREE.Vector2(-area.direction.x, -area.direction.z).normalize();
  const yaw = Math.atan2(-entranceVec.x, -entranceVec.y) + Math.PI;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);

  const arcadeMaterials = {
    Arcade_Marble_Cream: createSolidMaterial("#fffbf5"),
    Arcade_Marble_Dark: createSolidMaterial("#f1d8a6"),
    Arcade_Floor_Cream: createSolidMaterial("#ede1cb"),
    Arcade_Royal_Slate: createSolidMaterial("#2b2850"),
    Arcade_Slate_Dark: createSolidMaterial("#242045"),
    Arcade_Coral_Rose: createSolidMaterial("#ff5b4a"),
    Arcade_Gold_Trim: createGoldMaterial(),
    Arcade_Bronze_Wood: createSolidMaterial("#dcb07a"),
    Arcade_Chrome: createSolidMaterial("#e8ecf8"),
    Arcade_Torch_Flames: createEmissiveMaterial("#ffae38"),
    Arcade_Glass: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.22,
      roughness: 0.08,
      metalness: 0.05,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    Arcade_Glow_Cyan: createEmissiveMaterial("#4fc3f7"),
    Arcade_Glow_Gold: createEmissiveMaterial("#ffd23f"),
    Arcade_Glow_Pink: createEmissiveMaterial("#ff6b9d"),
    Arcade_Glow_Green: createEmissiveMaterial("#a9d66b"),
    Arcade_Glow_White: createEmissiveMaterial("#fff1dc"),
    Arcade_Cab_Cyan: createSolidMaterial("#4fc3f7"),
    Arcade_Cab_Navy: createSolidMaterial("#2b2850"),
    Arcade_Cab_Amber: createSolidMaterial("#ffd23f"),
    Arcade_Cab_Crimson: createSolidMaterial("#ff5b4a"),
    Arcade_Cab_Magenta: createSolidMaterial("#ff6b9d"),
    Arcade_Cab_Violet: createSolidMaterial("#7c6cf0"),
    Arcade_Cab_Emerald: createSolidMaterial("#a9d66b"),
    Arcade_Cab_Teal: createSolidMaterial("#3ad1c4"),
    Arcade_Cab_Blue: createSolidMaterial("#4fc3f7"),
    Arcade_Cab_Orange: createSolidMaterial("#ff7a32"),
    Arcade_Cab_Black: createSolidMaterial("#2b2850"),
    Arcade_Carpet: createSolidMaterial("#f5ece0"),
    Arcade_Screen: createEmissiveMaterial("#141228"),
    Arcade_PS5_White: createSolidMaterial("#fffbf5"),
    Arcade_Copper: createSolidMaterial("#d87040"),
    Arcade_Coolant_Cyan: createEmissiveMaterial("#4fc3f7"),
    Arcade_Coolant_Pink: createEmissiveMaterial("#ff6b9d"),
  };

  const resolveMaterial = (meshName, matName) => {
    const cleanMesh = (meshName || "").replace(/\.\d+$/, "");
    const cleanMat = (matName || "").replace(/\.\d+$/, "");
    return (
      arcadeMaterials[cleanMat] ||
      arcadeMaterials[cleanMesh] ||
      arcadeMaterials.Arcade_Marble_Cream
    );
  };

  const styleModel = (root, { isInterior = false } = {}) => {
    root.traverse((child) => {
      if (!child.isMesh) return;
      child.geometry = flatten(child.geometry.clone());
      const check = `${child.name} ${child.material?.name || ""}`;
      const isGlass = check.includes("Glass");
      if (isGlass) {
        child.material = arcadeMaterials.Arcade_Glass;
        child.castShadow = false;
        child.receiveShadow = false;
        child.renderOrder = 3;
        child.frustumCulled = false;
        return;
      }
      child.material = resolveMaterial(child.name, child.material?.name);
      const isEmissive =
        check.includes("Glow_") ||
        check.includes("Torch_Flames") ||
        check.includes("Coolant_") ||
        check.includes("Screen");
      child.castShadow = !isInterior && !isEmissive;
      child.receiveShadow = !isEmissive;
      child.frustumCulled = false;
    });
  };

  // ============================================================================
  // A. EXTERIOR ARCADE PAVILION ON EXPANDED MARKET ROW ISLAND
  // ============================================================================
  const exteriorRoot = new THREE.Group();
  exteriorRoot.position.set(area.x, area.y, area.z);
  exteriorRoot.rotation.y = yaw;
  exteriorRoot.scale.setScalar(EXT_SCALE);
  exteriorGroup.add(exteriorRoot);

  if (assets?.exterior) {
    const extModel = assets.exterior.clone(true);
    styleModel(extModel);
    exteriorRoot.add(extModel);
  }

  const toExteriorWorld = (lx, ly, lz) =>
    new THREE.Vector3(
      area.x + (lx * cosY + lz * sinY) * EXT_SCALE,
      area.y + ly * EXT_SCALE,
      area.z + (-lx * sinY + lz * cosY) * EXT_SCALE
    );

  // Exterior Beacon & Marquee Glows
  const extGlowCoords = [
    [-4.85, 2.2, 9.5],
    [4.85, 2.2, 9.5],
    [-5.8, 4.6, 6.6],
    [5.8, 4.6, 6.6],
    [0.0, 12.1, 6.2],
    [-6.8, 11.7, 6.2],
    [6.8, 11.7, 6.2],
  ];
  exteriorGroup.add(
    createGlows(
      extGlowCoords.map(([lx, ly, lz]) => toExteriorWorld(lx, ly, lz)),
      { color: "#ffd23f", size: 520, day: 0.55 }
    )
  );

  // Solid Exterior Colliders around the Podium & Stairs so the car cannot enter or bounce on stairs
  const addExtCollider = (lx, lz, radius) => {
    const w = toExteriorWorld(lx, 0, lz);
    colliders.push({ x: w.x, z: w.z, radius: radius * EXT_SCALE });
  };
  for (let lx = -10.6; lx <= 10.61; lx += 1.9) {
    addExtCollider(lx, -8.8, 1.45);
    addExtCollider(lx, 8.2, 1.45);
    addExtCollider(lx, 0.0, 2.1);
  }
  for (let lz = -7.0; lz <= 6.8; lz += 1.9) {
    addExtCollider(-10.6, lz, 1.45);
    addExtCollider(10.6, lz, 1.45);
  }
  for (let lx = -4.5; lx <= 4.51; lx += 1.5) {
    addExtCollider(lx, 9.2, 1.25);
    addExtCollider(lx, 10.2, 1.25);
  }

  // ============================================================================
  // B. SEPARATE INDOOR PS5 / CUSTOM GAMING PC ARCADE HALL + HUMAN EXPLORER
  // ============================================================================
  const hallRoot = new THREE.Group();
  hallRoot.rotation.y = Math.PI;
  dungeonGroup.add(hallRoot);

  if (assets?.interior) {
    const intModel = assets.interior.clone(true);
    styleModel(intModel, { isInterior: true });
    hallRoot.add(intModel);
  }

  // Volumetric Cyan/Gold GPU Oculus Beam streaming down onto the CPU Socket Medallion (Z = -2.2)
  dungeonGroup.add(createGpuOculusBeam(2.8, 4.2, 11.2, 5.6, -2.2));

  // Glowing Golden EXIT ARCADE Ring & 3D Label at the South Entrance Doors (Z = -14.0)
  const exitPortal = createPortalRing("#ffd23f", 1.5);
  exitPortal.group.position.set(0, 0.06, -14.0);
  dungeonGroup.add(exitPortal.group);

  const exitLabel = make3DLabel("EXIT ARCADE", "#ffd23f");
  exitLabel.scale.setScalar(0.65);
  exitLabel.position.set(0, 3.6, -15.0);
  dungeonGroup.add(exitLabel);

  // Decorative 3D Labels for Claw Machines & Air Hockey Wing
  const clawLabel = make3DLabel("CLAW MACHINES", "#ff6b9d");
  clawLabel.scale.setScalar(0.58);
  clawLabel.position.set(-4.6, 4.9, -3.35);
  clawLabel.rotation.y = Math.PI * 0.5;
  dungeonGroup.add(clawLabel);

  const hockeyLabel = make3DLabel("AIR HOCKEY", "#24e8ff");
  hockeyLabel.scale.setScalar(0.58);
  hockeyLabel.position.set(4.4, 3.6, -3.3);
  hockeyLabel.rotation.y = -Math.PI * 0.5;
  dungeonGroup.add(hockeyLabel);

  // Human Explorer inside the Console Arcade Hall
  const human = createHumanExplorer();
  dungeonGroup.add(human.group);

  const interactiveMachines = [];
  const clickableMeshes = [];
  const dungeonGlows = [];
  const dungeonColliders = [];

  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const hitGeo = new THREE.BoxGeometry(2.1, 4.2, 2.2);

  for (const def of ARCADE_MACHINE_DEFS) {
    const holder = new THREE.Group();
    holder.position.set(def.x, def.floorY, def.z);
    dungeonGroup.add(holder);

    const hitMesh = new THREE.Mesh(hitGeo, hitMat);
    hitMesh.position.set(0, 2.1, 0);
    hitMesh.userData.machineId = def.id;
    holder.add(hitMesh);
    clickableMeshes.push(hitMesh);

    const titleMesh = make3DLabel(def.label, def.color);
    titleMesh.scale.setScalar(0.62);
    titleMesh.position.set(0, 5.2, 0);
    holder.add(titleMesh);

    const aura = createPortalRing(def.color, 1.05);
    aura.group.position.set(0, 0.02, -1.55);
    holder.add(aura.group);

    dungeonGlows.push(new THREE.Vector3(def.x, def.floorY + 2.8, def.z - 0.6));
    dungeonColliders.push({ x: def.x, z: def.z, radius: 1.25 });

    interactiveMachines.push({
      ...def,
      holder,
      titleMesh,
      aura: aura.torus,
      interactZ: def.z - 1.4,
      near: false,
      fired: false,
    });
  }

  // Colliders & Per-Unit Glows for the 2 Claw Machines (x = -4.6, z = [-5.5, -1.2]),
  // the Air Hockey Table (x = 4.4, z = -3.3), PS5 Console Ribs (x = ±8.2), and Wall RGB Fans!
  dungeonColliders.push(
    { x: -4.6, z: -5.5, radius: 1.35 },
    { x: -4.6, z: -1.2, radius: 1.35 },
    { x: 4.4, z: -4.4, radius: 1.35 },
    { x: 4.4, z: -2.2, radius: 1.35 }
  );
  // Physical Three.js Lights inside the Arcade Hall (Warm, bright Bruno-Simon toy lighting)
  const dungeonAmbient = new THREE.AmbientLight("#fff8ed", 1.8);
  dungeonGroup.add(dungeonAmbient);

  const dungeonKey = new THREE.DirectionalLight("#fff4db", 1.2);
  dungeonKey.position.set(4, 12, -4);
  dungeonGroup.add(dungeonKey);

  // Soft subtle accents over each machine
  const spotM1 = new THREE.PointLight("#4fc3f7", 0.8, 8);
  spotM1.position.set(-5.1, 4.2, 10.2);
  dungeonGroup.add(spotM1);

  const spotM2 = new THREE.PointLight("#ffd23f", 0.8, 8);
  spotM2.position.set(-1.7, 4.2, 11.0);
  dungeonGroup.add(spotM2);

  const spotM3 = new THREE.PointLight("#ff5b4a", 0.8, 8);
  spotM3.position.set(1.7, 4.2, 11.0);
  dungeonGroup.add(spotM3);

  const spotM4 = new THREE.PointLight("#7c6cf0", 0.8, 8);
  spotM4.position.set(5.1, 4.2, 10.2);
  dungeonGroup.add(spotM4);

  // Distinct Color-Separated Soft Glow Billboards using the defined palette
  const cyanGlows = [
    new THREE.Vector3(-5.1, 3.4, 10.2), // Astro Blaster
    new THREE.Vector3(4.4, 2.4, -3.3),  // Air Hockey
    new THREE.Vector3(-7.5, 4.5, -11.5),
    new THREE.Vector3(-7.5, 4.5, -0.5),
    new THREE.Vector3(-7.5, 4.5, 10.5),
  ];
  dungeonGroup.add(createGlows(cyanGlows, { color: "#4fc3f7", size: 140, day: 0.85 }));

  const pinkGlows = [
    new THREE.Vector3(1.7, 3.4, 11.0),  // Turbo Drift
    new THREE.Vector3(-4.6, 3.4, -5.5), // Claw 1
    new THREE.Vector3(-4.6, 3.4, -1.2), // Claw 2
    new THREE.Vector3(7.5, 4.5, -6.0),
    new THREE.Vector3(7.5, 4.5, 5.0),
  ];
  dungeonGroup.add(createGlows(pinkGlows, { color: "#ff6b9d", size: 140, day: 0.85 }));

  const goldGlows = [
    new THREE.Vector3(-1.7, 3.4, 11.0), // Brick Smash
    new THREE.Vector3(0.0, 1.2, -2.2),  // Central Medallion
    new THREE.Vector3(0.0, 2.5, -14.0), // Exit Portal
  ];
  dungeonGroup.add(createGlows(goldGlows, { color: "#ffd23f", size: 140, day: 0.85 }));

  const purpleGlows = [
    new THREE.Vector3(5.1, 3.4, 10.2),  // Pixel Hopper
  ];
  dungeonGroup.add(createGlows(purpleGlows, { color: "#7c6cf0", size: 140, day: 0.85 }));

  // Floor height inside the Arcade Hall (flat floor + raised North Stage at z >= 6.2)
  const dungeonSurfaceAt = (_x, z) => {
    if (z >= 6.2) {
      const t = THREE.MathUtils.clamp((z - 6.2) / 1.8, 0, 1);
      return t * 0.65;
    }
    return 0.0;
  };

  // ============================================================================
  // C. STATE & INTERACTIONS
  // ============================================================================
  let inDungeon = false;
  let nearExteriorCircle = false;
  let nearDungeonExit = false;
  let opened = null;
  let prompt = null;
  let activeCamera = null;
  let cameraOverride = null;
  let activePlayingMachine = null;

  const gameOverlay = createArcadeGameOverlay();

  const playMachineGame = (machine) => {
    activePlayingMachine = machine;
    cameraOverride = {
      position: new THREE.Vector3(machine.x, machine.floorY + 3.02, machine.z - 1.28),
      lookAt: new THREE.Vector3(machine.x, machine.floorY + 3.02, machine.z - 0.46),
      speed: 6.5,
    };
    gameOverlay.open(machine, () => {
      cameraOverride = null;
      activePlayingMachine = null;
    });
  };

  const enterDungeon = () => {
    if (inDungeon) return;
    inDungeon = true;
    nearExteriorCircle = false;
    prompt = null;
    human.spawn(0, 0, -7.5, 0);
    onStateChange?.({
      inDungeon: true,
      indoorMode: 2,
      dungeonGroup,
      human,
      title: "Market Row Arcade",
      subtitle: "Step inside the Retro Arcade Hall!",
      toastEyebrow: "Retro Island Arcade · Human Form",
      toastColor: "#ff5b4a",
      toastTagline: "Walk with WASD, Space to jump, R to sprint. Approach any of the 4 Arcade Machines and press E or Click!",
    });
  };

  const exitDungeon = () => {
    if (!inDungeon) return;
    if (gameOverlay.isOpen()) {
      gameOverlay.close();
    }
    cameraOverride = null;
    activePlayingMachine = null;
    inDungeon = false;
    nearDungeonExit = false;
    prompt = null;
    const outPos = toExteriorWorld(0, 0, 13.5);
    const outHeading = Math.atan2(sinY, cosY);
    onStateChange?.({
      inDungeon: false,
      dungeonGroup,
      returnPose: { x: outPos.x, z: outPos.z, heading: outHeading },
    });
  };

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  window.addEventListener("pointerdown", (event) => {
    if (!inDungeon || !activeCamera || event.button !== 0) return;
    if (event.target?.closest?.("#hud, #intro, #toast, #controls, #dialogue, #dungeon-loader, #arcade-game")) return;
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, activeCamera);
    const hits = raycaster.intersectObjects(clickableMeshes, false);
    if (hits.length > 0) {
      const machineId = hits[0].object.userData.machineId;
      const machine = interactiveMachines.find((m) => m.id === machineId);
      if (machine) {
        machine.fired = true;
        playMachineGame(machine);
      }
    }
  });

  window.addEventListener("keydown", (event) => {
    if (inDungeon && event.code === "Escape") {
      if (gameOverlay.isOpen()) {
        gameOverlay.close();
        return;
      }
      exitDungeon();
    }
  });

  return {
    group: exteriorGroup,
    dungeonGroup,
    human,
    isInsideDungeon: () => inDungeon,
    exitHall: exitDungeon,
    getCameraOverride() {
      return inDungeon ? cameraOverride : null;
    },
    takeOpened() {
      const val = opened;
      opened = null;
      return val;
    },
    socialState() {
      return prompt;
    },
    openPrompt() {
      if (!inDungeon && nearExteriorCircle) {
        enterDungeon();
        return true;
      }
      if (inDungeon && nearDungeonExit) {
        exitDungeon();
        return true;
      }
      const active = interactiveMachines.find((m) => m.near);
      if (!active) return false;
      active.fired = true;
      prompt = null;
      playMachineGame(active);
      return true;
    },
    talk() {
      if (!inDungeon && nearExteriorCircle) {
        enterDungeon();
        return true;
      }
      if (inDungeon) {
        const active = interactiveMachines.find((m) => m.near);
        if (active) {
          active.fired = true;
          playMachineGame(active);
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
      if (!inDungeon && nearExteriorCircle) {
        return {
          name: "Market Row Arcade",
          line: "Enter the PS5 & PC Console Arcade Hall",
          hint: "Click or Press E to Enter",
          prompt: false,
        };
      }
      if (inDungeon) {
        const active = interactiveMachines.find((m) => m.near);
        if (active) {
          return {
            name: `${active.name} · ${active.gameTitle || active.label}`,
            line: `${active.label} Arcade Cabinet`,
            hint: "Click or Press E to Zoom In & Play Mini-Game",
            prompt: false,
          };
        }
        if (nearDungeonExit) {
          return {
            name: "Arcade Exit Portal",
            line: "Return to Market Row",
            hint: "Click or Press E (or Esc) to Exit",
            prompt: false,
          };
        }
      }
      return null;
    },
    updateDungeonPlayer(dt, input, cameraHeading) {
      if (!inDungeon) return;
      if (gameOverlay.isOpen()) {
        human.update(dt, { forward: false, backward: false, left: false, right: false, jump: false, sprint: false }, cameraHeading, dungeonSurfaceAt, dungeonColliders);
        return;
      }
      human.update(dt, input, cameraHeading, dungeonSurfaceAt, dungeonColliders);
    },
    update(time, _dt = 0.016, carPosition, camera) {
      activeCamera = camera;
      exitPortal.torus.rotation.z = -time * 1.2;

      if (!inDungeon) {
        if (!carPosition) return;
        const distFromIslandCenter = Math.hypot(carPosition.x - area.x, carPosition.z - area.z);
        nearExteriorCircle = distFromIslandCenter < area.radius + 3.0;
        prompt = null;
        return;
      }

      const p = human.position;

      interactiveMachines.forEach((machine, idx) => {
        machine.aura.rotation.z = time * 1.6 + idx;
        const auraScale = machine.near ? 1.18 + Math.sin(time * 6) * 0.06 : 1.0;
        machine.aura.scale.setScalar(auraScale);
        if (camera) {
          machine.titleMesh.lookAt(camera.position);
        }
      });

      let nearest = null;
      let nearestDist = 3.6;
      for (const machine of interactiveMachines) {
        const d = Math.hypot(p.x - machine.x, p.z - machine.interactZ);
        if (d < nearestDist) {
          nearest = machine;
          nearestDist = d;
        }
      }
      for (const machine of interactiveMachines) {
        machine.near = machine === nearest;
        if (machine !== nearest) machine.fired = false;
      }

      const exitDist = Math.hypot(p.x - 0, p.z - -14.0);
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
