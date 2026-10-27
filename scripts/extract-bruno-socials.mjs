globalThis.self = globalThis;
if (typeof globalThis.FileReader === "undefined") {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buffer) => {
        this.result = buffer;
        this.onloadend?.();
      });
    }
    readAsDataURL(blob) {
      blob.arrayBuffer().then((buffer) => {
        this.result = `data:application/octet-stream;base64,${Buffer.from(buffer).toString("base64")}`;
        this.onloadend?.();
      });
    }
  };
}

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = process.argv[2] || "/tmp/bruno-folio/areas.glb";
const destDir = resolve(root, "public/bruno");

const NAMES = {
  linkedin: "linkedInPhysicalDynamic",
  github: "gitHubPhysicalDynamic",
  email: "mailPhysicalDynamic",
  instagram: "youtubePhysicalDynamic",
  twitch: "twitchPhysicalDynamic",
};

const loader = new GLTFLoader();
const gltf = await loader.parseAsync(readFileSync(source).buffer, "");
const found = {};
gltf.scene.traverse((child) => {
  for (const [id, name] of Object.entries(NAMES)) {
    if (child.name === name) found[id] = child;
  }
});

console.log("found", Object.keys(found));
for (const [id, object] of Object.entries(found)) {
  const box = new THREE.Box3().setFromObject(object);
  console.log(id, object.name, "size", box.getSize(new THREE.Vector3()).toArray(), "children", object.children.map((c) => c.name));
}

const group = new THREE.Group();
group.name = "brunoSocials";
for (const [id, object] of Object.entries(found)) {
  const clone = object.clone(true);
  for (const child of [...clone.children]) {
    if (!child.isMesh) clone.remove(child);
  }
  clone.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry = child.geometry.toNonIndexed();
    child.geometry.computeVertexNormals();
    child.material = new THREE.MeshStandardMaterial({ color: "#b08968" });
  });
  clone.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(clone);
  const center = box.getCenter(new THREE.Vector3());
  clone.position.x -= center.x;
  clone.position.z -= center.z;
  clone.position.y -= box.min.y;
  clone.name = id;
  group.add(clone);
}

const exporter = new GLTFExporter();
const result = await exporter.parseAsync(group, { binary: true });
mkdirSync(destDir, { recursive: true });
writeFileSync(resolve(destDir, "socials.glb"), Buffer.from(result));
console.log("wrote", resolve(destDir, "socials.glb"), Buffer.from(result).length);
