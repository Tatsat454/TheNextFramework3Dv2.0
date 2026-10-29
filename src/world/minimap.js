import * as THREE from "three";
import { WORLD_SIZE } from "./terrain.js";

function mapBounds(terrain, areas) {
  const points = [
    terrain.features.spawn,
    terrain.features.dock,
    terrain.features.lighthouse,
    terrain.features.mountain,
    ...areas.map((area) => ({ x: area.x, z: area.z })),
  ];
  if (terrain.features.bridge) {
    points.push(terrain.features.bridge.a, terrain.features.bridge.b);
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const point of points) {
    const pad = 28;
    minX = Math.min(minX, point.x - pad);
    maxX = Math.max(maxX, point.x + pad);
    minZ = Math.min(minZ, point.z - pad);
    maxZ = Math.max(maxZ, point.z + pad);
  }

  // Also scan real land so the coastline matches the mesh.
  const half = WORLD_SIZE * 0.5;
  const step = 6;
  for (let z = -half; z <= half; z += step) {
    for (let x = -half; x <= half; x += step) {
      if (terrain.heightAt(x, z) <= 0.05) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  }

  const margin = 14;
  minX -= margin;
  maxX += margin;
  minZ -= margin;
  maxZ += margin;
  const midX = (minX + maxX) * 0.5;
  const midZ = (minZ + maxZ) * 0.5;
  const side = Math.max(maxX - minX, maxZ - minZ);
  return { midX, midZ, side, minZ, maxZ };
}

export function createMinimap({ canvas, terrain, areas }) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const cssSize = canvas.clientWidth || 176;
  const size = Math.round(cssSize * ratio);
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const { midX, midZ, side } = mapBounds(terrain, areas);

  const resolution = 320;
  const base = document.createElement("canvas");
  base.width = resolution;
  base.height = resolution;
  const baseCtx = base.getContext("2d");
  const image = baseCtx.createImageData(resolution, resolution);
  const color = new THREE.Color();
  const deep = new THREE.Color("#1f6fbf");
  const shallow = new THREE.Color("#7ad7d0");
  const sand = new THREE.Color("#f2d39a");
  const grass = new THREE.Color("#7fc24a");
  const rock = new THREE.Color("#9b98b8");
  const dirt = new THREE.Color("#c9965c");

  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      // Canvas Y grows down; world −Z (temple / "north") maps to the top of the map.
      const x = midX + ((i + 0.5) / resolution - 0.5) * side;
      const z = midZ - ((j + 0.5) / resolution - 0.5) * side;
      const h = terrain.heightAt(x, z);
      if (h < 0.05) {
        color.copy(shallow).lerp(deep, Math.min(1, Math.max(0, -h) / 5));
      } else if (terrain.pathAt(x, z) > 0.42) {
        color.copy(dirt);
      } else if (terrain.grassAt(x, z) > 0.42) {
        color.copy(grass).multiplyScalar(0.9 + Math.min(1, h / 18) * 0.2);
      } else if (h < 2.1) {
        color.copy(sand);
      } else {
        color.copy(rock);
      }
      color.convertLinearToSRGB();
      const index = (j * resolution + i) * 4;
      image.data[index] = color.r * 255;
      image.data[index + 1] = color.g * 255;
      image.data[index + 2] = color.b * 255;
      image.data[index + 3] = 255;
    }
  }
  baseCtx.putImageData(image, 0, 0);

  // Bake path ribbons on top for readable roads.
  baseCtx.lineCap = "round";
  baseCtx.lineJoin = "round";
  const paths = terrain.features.paths || [];
  for (const path of paths) {
    if (!path?.length) continue;
    baseCtx.beginPath();
    path.forEach((point, index) => {
      const px = ((point.x - midX) / side + 0.5) * resolution;
      const py = ((midZ - point.z) / side + 0.5) * resolution;
      if (index === 0) baseCtx.moveTo(px, py);
      else baseCtx.lineTo(px, py);
    });
    baseCtx.strokeStyle = "rgba(210, 160, 95, 0.9)";
    baseCtx.lineWidth = Math.max(2.2, resolution * 0.008);
    baseCtx.stroke();
  }

  if (terrain.features.bridge) {
    const a = terrain.features.bridge.a;
    const b = terrain.features.bridge.b;
    baseCtx.beginPath();
    baseCtx.moveTo(((a.x - midX) / side + 0.5) * resolution, ((midZ - a.z) / side + 0.5) * resolution);
    baseCtx.lineTo(((b.x - midX) / side + 0.5) * resolution, ((midZ - b.z) / side + 0.5) * resolution);
    baseCtx.strokeStyle = "rgba(180, 150, 120, 0.95)";
    baseCtx.lineWidth = Math.max(2.5, resolution * 0.01);
    baseCtx.stroke();
  }

  const toMap = (x, z) => [((x - midX) / side + 0.5) * size, ((midZ - z) / side + 0.5) * size];

  return {
    draw(car, heading, _viewTheta, currentArea) {
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 2 * ratio, 0, Math.PI * 2);
      ctx.clip();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(base, 0, 0, size, size);

      // Soft vignette so the rim reads as a compass glass.
      const vignette = ctx.createRadialGradient(size / 2, size / 2, size * 0.28, size / 2, size / 2, size * 0.5);
      vignette.addColorStop(0, "rgba(255,255,255,0)");
      vignette.addColorStop(1, "rgba(30,40,80,0.18)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, size, size);

      for (const area of areas) {
        const [px, py] = toMap(area.x, area.z);
        const radius = Math.max(5 * ratio, (area.radius / side) * size * 0.55);
        const active = currentArea === area;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fillStyle = `${area.color}33`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(px, py, active ? 6.5 * ratio : 5 * ratio, 0, Math.PI * 2);
        ctx.fillStyle = area.color;
        ctx.fill();
        ctx.lineWidth = 2 * ratio;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
      }

      const spawn = terrain.features.spawn;
      const [sx, sy] = toMap(spawn.x, spawn.z);
      ctx.beginPath();
      ctx.arc(sx, sy, 3.2 * ratio, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.lineWidth = 1.4 * ratio;
      ctx.strokeStyle = "#5b54c4";
      ctx.stroke();

      const [cx, cy] = toMap(car.x, car.z);
      // World forward (+Z when heading=0) points down on this north-up map.
      const fx = Math.sin(heading);
      const fy = -Math.cos(heading);
      const s = 8 * ratio;
      ctx.beginPath();
      ctx.moveTo(cx + fx * s, cy + fy * s);
      ctx.lineTo(cx - fx * s * 0.62 + fy * s * 0.62, cy - fy * s * 0.62 - fx * s * 0.62);
      ctx.lineTo(cx - fx * s * 0.22, cy - fy * s * 0.22);
      ctx.lineTo(cx - fx * s * 0.62 - fy * s * 0.62, cy - fy * s * 0.62 + fx * s * 0.62);
      ctx.closePath();
      ctx.fillStyle = "#ff4d3d";
      ctx.fill();
      ctx.lineWidth = 1.7 * ratio;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      ctx.restore();

      // North tick outside the clip.
      ctx.save();
      ctx.fillStyle = "rgba(43, 40, 80, 0.75)";
      ctx.font = `800 ${11 * ratio}px Nunito, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("N", size / 2, 14 * ratio);
      ctx.restore();
    },
  };
}
