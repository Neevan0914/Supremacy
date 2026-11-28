// Sprite textures for higher-quality combat effects.
import * as THREE from "three";
import { fbm, mulberry } from "./textures.js";

function spriteTex(size, fill) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(size, size);
  fill(img.data, size);
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let cache = null;
function canvases() {
  if (cache) return cache;
  const S = 128,
    r = mulberry(4242),
    n = fbm(S, 4, 5, r),
    m = fbm(S, 8, 4, r);
  // Billowy smoke puff: fbm density inside a soft disc, lit from above.
  const puff = (d, s) => {
    for (let y = 0; y < s; y++)
      for (let x = 0; x < s; x++) {
        const i = y * s + x,
          dx = x / s - 0.5,
          dy = y / s - 0.5,
          rr = Math.sqrt(dx * dx + dy * dy) * 2;
        const dens = Math.max(0, n[i] * 1.25 + m[i] * 0.35 - 0.38 - rr * rr * 0.95);
        const a = Math.min(1, dens * 3.4) * Math.min(1, Math.max(0, 1 - rr) * 1.6);
        const light = 0.72 + (0.5 - y / s) * 0.45 + (m[i] - 0.5) * 0.3;
        const v = Math.max(0, Math.min(255, light * 235));
        d[i * 4] = v;
        d[i * 4 + 1] = v * 0.98;
        d[i * 4 + 2] = v * 0.95;
        d[i * 4 + 3] = a * 255;
      }
  };
  // Muzzle flash: hot core + 5 ragged spikes.
  const flash = (d, s) => {
    for (let y = 0; y < s; y++)
      for (let x = 0; x < s; x++) {
        const i = y * s + x,
          dx = x / s - 0.5,
          dy = y / s - 0.5,
          rr = Math.sqrt(dx * dx + dy * dy) * 2,
          a = Math.atan2(dy, dx);
        const spikes = Math.pow(Math.abs(Math.cos(a * 2.5 + 0.4)), 8) * (0.7 + n[i] * 0.6);
        const core = Math.exp(-rr * rr * 18);
        const v = Math.max(0, core + spikes * Math.max(0, 1 - rr) * 0.9 + Math.exp(-rr * 4) * 0.35);
        d[i * 4] = 255;
        d[i * 4 + 1] = Math.min(255, 150 + v * 105);
        d[i * 4 + 2] = Math.min(255, 60 + v * 160);
        d[i * 4 + 3] = Math.min(1, v) * 255;
      }
  };
  // Fireball: turbulent, brighter core.
  const fire = (d, s) => {
    for (let y = 0; y < s; y++)
      for (let x = 0; x < s; x++) {
        const i = y * s + x,
          dx = x / s - 0.5,
          dy = y / s - 0.5,
          rr = Math.sqrt(dx * dx + dy * dy) * 2;
        const v = Math.max(0, (n[i] * 0.9 + 0.35) * (1 - rr * rr) * 1.3);
        d[i * 4] = 255;
        d[i * 4 + 1] = Math.min(255, 110 + v * 150);
        d[i * 4 + 2] = Math.min(255, 40 + v * 90);
        d[i * 4 + 3] = Math.min(1, v) * 255;
      }
  };
  cache = { puff, flash, fire };
  return cache;
}

export function createFxTextures() {
  const c = canvases();
  return { puff: spriteTex(128, c.puff), flash: spriteTex(128, c.flash), fire: spriteTex(128, c.fire) };
}
