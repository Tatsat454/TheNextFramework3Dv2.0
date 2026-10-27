import * as THREE from "three";

function landBounds(terrain) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const scan = 180;
  const extent = 200;
  for (let j = 0; j < scan; j++) {
    for (let i = 0; i < scan; i++) {
      const x = (i / (scan - 1) - 0.5) * extent * 2;
      const z = (j / (scan - 1) - 0.5) * extent * 2;
      if (terrain.heightAt(x, z) <= 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  }
  const margin = 18;
  const midX = (minX + maxX) / 2;
  const midZ = (minZ + maxZ) / 2;
  const side = Math.max(maxX - minX, maxZ - minZ) + margin * 2;
  return { left: midX - side / 2, top: midZ - side / 2, side };
}

export function createMinimap({ canvas, terrain, areas }) {
  const ratio = Math.min(window.devicePixelRatio, 2);
  const cssSize = canvas.clientWidth || 168;
  const size = Math.round(cssSize * ratio);
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const { left, top, side } = landBounds(terrain);

  const resolution = 256;
  const base = document.createElement("canvas");
  base.width = resolution;
  base.height = resolution;
  const baseCtx = base.getContext("2d");
  const image = baseCtx.createImageData(resolution, resolution);
  const color = new THREE.Color();
  const deep = new THREE.Color("#2f86d8");
  const shallow = new THREE.Color("#8ee8dc");
  const sand = new THREE.Color("#f4d9a0");
  const grass = new THREE.Color("#86c94f");
  const rock = new THREE.Color("#a7a4c2");
  const dirt = new THREE.Color("#d9a76c");
  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const x = left + (i / resolution) * side;
      const z = top + (j / resolution) * side;
      const h = terrain.heightAt(x, z);
      if (h < 0) {
        color.copy(shallow).lerp(deep, Math.min(1, -h / 5));
      } else if (terrain.pathAt(x, z) > 0.45) {
        color.copy(dirt);
      } else if (terrain.grassAt(x, z) > 0.45) {
        color.copy(grass).multiplyScalar(0.92 + Math.min(1, h / 20) * 0.18);
      } else if (h < 2.2) {
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

  const toMap = (x, z) => [((x - left) / side) * size, ((z - top) / side) * size];

  return {
    draw(car, heading, _viewTheta, currentArea) {
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
      ctx.clip();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(base, 0, 0, size, size);

      for (const area of areas) {
        const [px, py] = toMap(area.x, area.z);
        const active = currentArea === area;
        ctx.beginPath();
        ctx.arc(px, py, (active ? 7.5 : 6) * ratio, 0, Math.PI * 2);
        ctx.fillStyle = area.color;
        ctx.fill();
        ctx.lineWidth = 2 * ratio;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
      }

      const [cx, cy] = toMap(car.x, car.z);
      const fx = Math.sin(heading);
      const fy = Math.cos(heading);
      const s = 7 * ratio;
      ctx.beginPath();
      ctx.moveTo(cx + fx * s, cy + fy * s);
      ctx.lineTo(cx - fx * s * 0.6 + fy * s * 0.65, cy - fy * s * 0.6 - fx * s * 0.65);
      ctx.lineTo(cx - fx * s * 0.25, cy - fy * s * 0.25);
      ctx.lineTo(cx - fx * s * 0.6 - fy * s * 0.65, cy - fy * s * 0.6 + fx * s * 0.65);
      ctx.closePath();
      ctx.fillStyle = "#ff4d3d";
      ctx.fill();
      ctx.lineWidth = 1.6 * ratio;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      ctx.restore();
    },
  };
}
