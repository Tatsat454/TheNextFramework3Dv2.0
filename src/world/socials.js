import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { getFont } from "./letters.js";
import { createEmissiveMaterial, createSolidMaterial, flatten } from "./shading.js";

export const SOCIALS = [
  { id: "linkedin", name: "LinkedIn", url: "https://www.linkedin.com/in/tatsat-upadhyay", color: "#0a66c2" },
  { id: "instagram", name: "Instagram", url: "https://www.instagram.com/pplcallmetat/", color: "#e1306c" },
  { id: "github", name: "GitHub", url: "https://github.com/Tatsat454", color: "#24292f" },
  { id: "blog", name: "The Next Framework", label: "Blog", url: "https://thenextframework.blog/", color: "#7c6cf0" },
  { id: "email", name: "Email", url: "mailto:tat.upadhyay@gmail.com", color: "#ea4335" },
];

const NEAR_RADIUS = 3.8;
const PEDESTAL_TOP = 1.84;
const ICON_HEIGHT = 1.18;
const ICON_GAP = 0.86;
const GREY = "#8f8f99";
const GREY_MID = "#7a7a84";
const GREY_DARK = "#5e5e68";
const GREY_LIGHT = "#b4b4bc";

let socialTemplate = null;

export async function loadSocialTemplate() {
  if (socialTemplate) return socialTemplate;
  const gltf = await new GLTFLoader().loadAsync("/bruno/socials.glb");
  const icons = {};
  gltf.scene.traverse((child) => {
    if (["linkedin", "github", "email", "instagram", "twitch"].includes(child.name)) {
      icons[child.name] = child;
    }
  });
  socialTemplate = icons;
  return icons;
}

function openSocial(url) {
  const popup = window.open(url, "_blank", "noopener,noreferrer");
  return Boolean(popup);
}

function addSolid(parent, geometry, material, y) {
  const mesh = new THREE.Mesh(flatten(geometry), material);
  mesh.position.y = y;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function glyph(text, material, { size = 0.7, depth = 0.3 } = {}) {
  const geometry = new TextGeometry(text, {
    font: getFont(),
    size,
    depth,
    curveSegments: 4,
    bevelEnabled: true,
    bevelThickness: 0.045,
    bevelSize: 0.03,
    bevelSegments: 1,
  });
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -depth / 2);
  const mesh = new THREE.Mesh(flatten(geometry), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createBlogIcon() {
  const group = new THREE.Group();
  group.add(glyph("N", createSolidMaterial(GREY), { size: 0.88, depth: 0.36 }));
  return sitOnPedestal(group);
}

function sitOnPedestal(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  root.scale.multiplyScalar(ICON_HEIGHT / Math.max(size.y, 0.001));
  root.updateMatrixWorld(true);
  const fitted = new THREE.Box3().setFromObject(root);
  const center = fitted.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= fitted.min.y;
  const holder = new THREE.Group();
  holder.add(root);
  return holder;
}

function cloneBrunoIcon(source) {
  const icon = source.clone(true);
  const clay = createSolidMaterial(GREY);
  icon.traverse((child) => {
    if (!child.isMesh) return;
    child.material = clay;
    child.castShadow = true;
    child.receiveShadow = true;
  });
  return sitOnPedestal(icon);
}

function createStylizedPedestal() {
  const group = new THREE.Group();
  const stone = createSolidMaterial(GREY);
  const stoneMid = createSolidMaterial(GREY_MID);
  const stoneDark = createSolidMaterial(GREY_DARK);
  const lip = createSolidMaterial(GREY_LIGHT);

  addSolid(group, new RoundedBoxGeometry(1.95, 0.2, 1.95, 3, 0.08), stoneDark, 0.08);
  addSolid(group, new RoundedBoxGeometry(1.52, 0.18, 1.52, 3, 0.07), stoneMid, 0.26);
  addSolid(group, new RoundedBoxGeometry(1.12, 1.18, 1.12, 4, 0.16), stone, 0.94);
  addSolid(group, new RoundedBoxGeometry(1.42, 0.16, 1.42, 3, 0.07), stoneMid, 1.6);
  addSolid(group, new RoundedBoxGeometry(1.2, 0.06, 1.2, 2, 0.03), stoneMid, 1.7);
  addSolid(group, new RoundedBoxGeometry(1.28, 0.1, 1.28, 3, 0.05), lip, 1.78);

  const crystal = new THREE.Mesh(flatten(new THREE.OctahedronGeometry(0.11, 0)), createEmissiveMaterial(GREY_LIGHT));
  crystal.position.set(0.62, 1.72, 0.62);
  crystal.castShadow = true;
  group.add(crystal);

  return { group, topY: PEDESTAL_TOP, crystal };
}

export function createSocialLogos(area, heightAt, colliders, template = {}) {
  const group = new THREE.Group();
  const logos = [];
  const count = SOCIALS.length;
  const ring = area.radius * 0.54;
  const entranceAngle = Math.atan2(-area.direction.z, -area.direction.x);

  SOCIALS.forEach((social, index) => {
    const angle = entranceAngle + Math.PI + (index / count) * Math.PI * 2;
    const x = area.x + Math.cos(angle) * ring;
    const z = area.z + Math.sin(angle) * ring;
    const ground = heightAt(x, z);

    const stand = new THREE.Group();
    stand.position.set(x, ground, z);
    stand.rotation.y = -angle + Math.PI;
    stand.userData.socialId = social.id;

    const pedestal = createStylizedPedestal();
    stand.add(pedestal.group);
    const topY = pedestal.topY;
    const iconY = topY + ICON_GAP;

    const icon = template[social.id] ? cloneBrunoIcon(template[social.id]) : createBlogIcon();
    icon.position.y = iconY;
    stand.add(icon);

    const glow = new THREE.Mesh(flatten(new THREE.TorusGeometry(0.46, 0.04, 8, 22)), createEmissiveMaterial(GREY_LIGHT));
    glow.rotation.x = Math.PI / 2;
    glow.position.y = topY + 0.02;
    stand.add(glow);

    group.add(stand);
    colliders.push({ x, z, radius: 1.0 });

    logos.push({
      ...social,
      stand,
      icon,
      glow,
      crystal: pedestal.crystal,
      x,
      z,
      topY,
      iconY,
      ground,
      phase: index * 1.25,
      near: false,
      fired: false,
    });
  });

  let opened = null;
  let prompt = null;

  const tryOpen = (social) => {
    opened = { ...social, blocked: !openSocial(social.url) };
    return opened;
  };

  return {
    group,
    logos,
    takeOpened() {
      const value = opened;
      opened = null;
      return value;
    },
    socialState() {
      return prompt;
    },
    openPrompt() {
      const logo = logos.find((item) => item.near && !item.fired);
      if (!logo) return false;
      logo.fired = true;
      prompt = null;
      tryOpen(logo);
      return true;
    },
    probe(car) {
      let nearest = null;
      let nearestDistance = NEAR_RADIUS;
      for (const logo of logos) {
        const distance = Math.hypot(car.x - logo.x, car.z - logo.z);
        if (distance < nearestDistance) {
          nearest = logo;
          nearestDistance = distance;
        }
      }

      for (const logo of logos) {
        logo.near = logo === nearest;
        if (logo !== nearest) logo.fired = false;
      }

      if (!nearest || nearest.fired) {
        prompt = null;
        return null;
      }

      prompt = {
        name: nearest.name,
        color: nearest.color,
        url: nearest.url,
      };
      return null;
    },
    update(time) {
      for (const logo of logos) {
        const lift = logo.fired || logo.near ? 0.12 : 0;
        logo.icon.position.y = logo.iconY + Math.sin(time * 1.35 + logo.phase) * 0.05 + lift;
        logo.icon.rotation.y = Math.sin(time * 0.65 + logo.phase) * 0.2;
        logo.glow.scale.setScalar(logo.near || logo.fired ? 1.25 : 1);
        if (logo.crystal) logo.crystal.rotation.y = time * 1.4 + logo.phase;
      }
    },
  };
}
