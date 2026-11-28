// Procedural PBR textures (albedo / normal / roughness) built on canvases.
// Every generator is deterministic and its CPU-side canvases are cached per
// size, so repeated battles only pay for the GPU upload.
import * as THREE from "three";

export function mulberry(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t) => t * t * (3 - 2 * t);

// Tileable value noise: `period` lattice cells across the texture.
function valueNoise(size, period, rng, out, amp) {
  const lat = new Float32Array(period * period);
  for (let i = 0; i < lat.length; i++) lat[i] = rng();
  const cell = size / period;
  for (let y = 0; y < size; y++) {
    const fy = y / cell,
      y0 = Math.floor(fy),
      ty = smooth(fy - y0),
      r0 = (y0 % period) * period,
      r1 = ((y0 + 1) % period) * period;
    for (let x = 0; x < size; x++) {
      const fx = x / cell,
        x0 = Math.floor(fx),
        tx = smooth(fx - x0),
        c0 = x0 % period,
        c1 = (x0 + 1) % period;
      const a = lat[r0 + c0] + (lat[r0 + c1] - lat[r0 + c0]) * tx;
      const b = lat[r1 + c0] + (lat[r1 + c1] - lat[r1 + c0]) * tx;
      out[y * size + x] += (a + (b - a) * ty) * amp;
    }
  }
}

// Fractal noise in [0,1].
export function fbm(size, basePeriod, octaves, rng, gain = 0.5) {
  const out = new Float32Array(size * size);
  let amp = 1,
    total = 0,
    p = basePeriod;
  for (let o = 0; o < octaves && p <= size; o++) {
    valueNoise(size, p, rng, out, amp);
    total += amp;
    amp *= gain;
    p *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

// Cellular / Worley distance field (tileable) — used for stones & pebbles.
export function worley(size, count, rng) {
  const pts = [];
  for (let i = 0; i < count; i++) pts.push([rng() * size, rng() * size]);
  const out = new Float32Array(size * size);
  const g = Math.ceil(Math.sqrt(count)),
    cs = size / g,
    grid = Array.from({ length: g * g }, () => []);
  pts.forEach((p) => grid[Math.min(g - 1, Math.floor(p[1] / cs)) * g + Math.min(g - 1, Math.floor(p[0] / cs))].push(p));
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const gx = Math.floor(x / cs),
        gy = Math.floor(y / cs);
      let d1 = 1e9;
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          const cx = (gx + ox + g) % g,
            cy = (gy + oy + g) % g;
          for (const p of grid[cy * g + cx]) {
            let dx = Math.abs(p[0] - x),
              dy = Math.abs(p[1] - y);
            if (dx > size / 2) dx = size - dx;
            if (dy > size / 2) dy = size - dy;
            const d = dx * dx + dy * dy;
            if (d < d1) d1 = d;
          }
        }
      out[y * size + x] = Math.sqrt(d1) / cs;
    }
  return out;
}

function canvasOf(size, fill) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(size, size);
  fill(img.data);
  ctx.putImageData(img, 0, 0);
  return c;
}

// Height field -> tangent-space normal map canvas (OpenGL convention).
export function normalCanvas(h, size, strength) {
  return canvasOf(size, (d) => {
    for (let y = 0; y < size; y++) {
      const yu = ((y - 1 + size) % size) * size,
        yd = ((y + 1) % size) * size;
      for (let x = 0; x < size; x++) {
        const xl = (x - 1 + size) % size,
          xr = (x + 1) % size;
        const dx = (h[y * size + xr] - h[y * size + xl]) * strength;
        const dy = (h[yd + x] - h[yu + x]) * strength;
        const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
        const i = (y * size + x) * 4;
        d[i] = (-dx * inv * 0.5 + 0.5) * 255;
        d[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
        d[i + 2] = (inv * 0.5 + 0.5) * 255;
        d[i + 3] = 255;
      }
    }
  });
}

export function rgbCanvas(size, fn) {
  return canvasOf(size, (d) => {
    const c = [0, 0, 0];
    for (let i = 0, n = size * size; i < n; i++) {
      fn(i, c);
      d[i * 4] = c[0];
      d[i * 4 + 1] = c[1];
      d[i * 4 + 2] = c[2];
      d[i * 4 + 3] = 255;
    }
  });
}

export function greyCanvas(size, fn) {
  return rgbCanvas(size, (i, c) => {
    const v = Math.max(0, Math.min(255, fn(i) * 255));
    c[0] = c[1] = c[2] = v;
  });
}

// Wood fibres running along x: warped sine bands plus per-row streak noise.
function grainField(size, rng, lines, warp) {
  const n = fbm(size, 4, 4, rng),
    rows = Float32Array.from({ length: size * 4 }, () => rng());
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x,
        band = Math.sin(((y / size) * lines + n[i] * warp) * Math.PI * 2) * 0.5 + 0.5,
        streak = rows[(y * 4 + ((x / size) * 3) | 0) % rows.length];
      out[i] = band * 0.65 + streak * 0.35;
    }
  return out;
}

const lerp = (a, b, t) => a + (b - a) * t;
const sat = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const hex = (s) => {
  const n = parseInt(s.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
function mixc(a, b, t, out) {
  out[0] = lerp(a[0], b[0], t);
  out[1] = lerp(a[1], b[1], t);
  out[2] = lerp(a[2], b[2], t);
  return out;
}

// ---------------------------------------------------------------- materials
// Each returns { map, normal, rough } canvases.
const GEN = {
  ground(size) {
    const r = mulberry(11);
    const big = fbm(size, 4, 6, r),
      mid = fbm(size, 16, 5, r),
      fine = fbm(size, 64, 3, r),
      peb = worley(size, Math.round(size * 1.6), r),
      blades = fbm(size, Math.max(64, size / 4), 2, r);
    const grassA = hex("#4b5a2c"),
      grassB = hex("#6b6f36"),
      dirt = hex("#5f4c35"),
      dry = hex("#8a7a55"),
      stone = hex("#86806f"),
      c = [0, 0, 0],
      t = [0, 0, 0];
    const H = new Float32Array(size * size),
      cover = new Float32Array(size * size);
    for (let i = 0; i < H.length; i++) {
      const g = sat((big[i] - 0.42) * 3 + (mid[i] - 0.5) * 1.6);
      cover[i] = g;
      const pebble = peb[i] < 0.22 && g < 0.45 ? 1 - peb[i] / 0.22 : 0;
      H[i] = mid[i] * 0.6 + fine[i] * 0.5 + pebble * 0.9 + g * blades[i] * 0.6;
    }
    const map = rgbCanvas(size, (i, o) => {
      const g = cover[i];
      mixc(dirt, dry, sat(mid[i] * 1.4 - 0.3), c);
      mixc(grassA, grassB, sat(fine[i] * 1.6 - 0.4 + blades[i] * 0.4), t);
      mixc(c, t, g, o);
      const pebble = peb[i] < 0.22 && g < 0.45 ? 1 - peb[i] / 0.22 : 0;
      if (pebble > 0) mixc(o, stone, sat(pebble * 1.8) * (0.7 + fine[i] * 0.3), o);
      const shade = 0.78 + fine[i] * 0.3 + (blades[i] - 0.5) * 0.25 * g;
      o[0] *= shade;
      o[1] *= shade;
      o[2] *= shade;
    });
    const rough = greyCanvas(size, (i) => 0.82 + cover[i] * 0.1 - (peb[i] < 0.2 ? 0.15 : 0) + (fine[i] - 0.5) * 0.1);
    return { map, normal: normalCanvas(H, size, size / 90), rough };
  },
  burlap(size) {
    const r = mulberry(21);
    const n = fbm(size, 8, 4, r),
      threads = Math.max(16, size / 10);
    const H = new Float32Array(size * size);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const u = Math.sin((x / size) * threads * Math.PI * 2),
          v = Math.sin((y / size) * threads * Math.PI * 2);
        const over = ((Math.floor((x / size) * threads) + Math.floor((y / size) * threads)) & 1) === 0;
        H[i] = (over ? Math.abs(u) * 0.7 + 0.3 * Math.abs(v) : Math.abs(v) * 0.7 + 0.3 * Math.abs(u)) * 0.6 + n[i] * 0.6;
      }
    const base = hex("#8f8466"),
      dark = hex("#5c5442"),
      c = [0, 0, 0];
    const map = rgbCanvas(size, (i, o) => {
      mixc(dark, base, sat(H[i] * 0.9 + 0.1), o);
      const dirt = sat((n[i] - 0.55) * 3);
      mixc(o, hex("#4a3d2a"), dirt * 0.6, c);
      o[0] = c[0];
      o[1] = c[1];
      o[2] = c[2];
    });
    return { map, normal: normalCanvas(H, size, size / 40), rough: greyCanvas(size, (i) => 0.9 + n[i] * 0.1) };
  },
  wood(size) {
    const r = mulberry(31);
    const n = fbm(size, 4, 5, r),
      fine = fbm(size, 32, 3, r);
    const planks = 4,
      H = new Float32Array(size * size),
      gw = grainField(size, r, 10, 1.2);
    const light = hex("#7d6a52"),
      dark = hex("#44382b"),
      t = [0, 0, 0];
    const map = rgbCanvas(size, (i, o) => {
      const x = i % size,
        y = (i / size) | 0;
      const py = (y / size) * planks,
        pi = Math.floor(py),
        fy = py - pi;
      const grain = gw[i];
      const ring = Math.pow(grain, 3) * 0.6;
      const edge = Math.min(fy, 1 - fy) * size / planks;
      const groove = edge < 2.5 ? edge / 2.5 : 1;
      const border = Math.min(x, size - 1 - x) < 3 ? 0.5 : 1;
      H[i] = groove * border * (0.8 + ring * 0.15 + fine[i] * 0.1);
      mixc(dark, light, sat(0.35 + grain * 0.4 - ring * 0.35 + (pi % 2) * 0.1), o);
      const k = (0.75 + 0.25 * groove * border) * (0.9 + fine[i] * 0.2);
      o[0] *= k;
      o[1] *= k;
      o[2] *= k;
      mixc(o, hex("#3b3328"), sat((n[i] - 0.6) * 2) * 0.5, t);
      o[0] = t[0];
      o[1] = t[1];
      o[2] = t[2];
    });
    return { map, normal: normalCanvas(H, size, size / 50), rough: greyCanvas(size, (i) => 0.62 + fine[i] * 0.25) };
  },
  crate(size) {
    const r = mulberry(33);
    const n = fbm(size, 4, 5, r),
      fine = fbm(size, 48, 3, r);
    const planks = 5,
      frame = size * 0.09,
      H = new Float32Array(size * size),
      gH = grainField(size, r, 9, 1.2),
      gV = grainField(size, r, 7, 1.0);
    const light = hex("#8f7b5c"),
      dark = hex("#4f4231"),
      c = [0, 0, 0];
    const map = rgbCanvas(size, (i, o) => {
      const x = i % size,
        y = (i / size) | 0;
      const ex = Math.min(x, size - 1 - x),
        ey = Math.min(y, size - 1 - y);
      const onFrame = ex < frame || ey < frame;
      const diag = Math.abs(x - y) < frame * 0.7 && !onFrame;
      const py = (y / size) * planks,
        pi = Math.floor(py),
        fy = py - pi;
      const vertical = onFrame && ex < frame && ey >= frame; // side rails run vertically
      const grain = vertical ? gV[x * size + y] : gH[i];
      const ring = Math.pow(grain, 3) * 0.6;
      const groove = onFrame || diag ? 1 : Math.min(1, (Math.min(fy, 1 - fy) * size) / planks / 2);
      const raised = onFrame || diag ? 1.0 : 0.82;
      const edgeFrame = onFrame ? Math.min(1, Math.abs(Math.min(ex, ey) - frame) / 2) : 1;
      const edgeDiag = diag ? Math.min(1, (frame * 0.7 - Math.abs(x - y)) / 2) : 1;
      H[i] = raised * groove * edgeFrame * edgeDiag + fine[i] * 0.08;
      mixc(dark, light, sat(0.25 + grain * 0.55 - ring * 0.3 + (pi % 2) * 0.08 + (onFrame || diag ? 0.06 : 0) + (n[i] - 0.5) * 0.3), c);
      const k = (0.7 + 0.3 * groove * edgeFrame * edgeDiag) * (0.88 + fine[i] * 0.24);
      o[0] = c[0] * k;
      o[1] = c[1] * k;
      o[2] = c[2] * k;
      // nail heads on the frame corners
      for (const [nx, ny] of [[frame / 2, frame / 2], [size - frame / 2, frame / 2], [frame / 2, size - frame / 2], [size - frame / 2, size - frame / 2]])
        if ((x - nx) ** 2 + (y - ny) ** 2 < (size * 0.012) ** 2) (o[0] = o[1] = 50), (o[2] = 48), (H[i] += 0.3);
    });
    return { map, normal: normalCanvas(H, size, size / 45), rough: greyCanvas(size, (i) => 0.7 + fine[i] * 0.25) };
  },
  gunwood(size) {
    const r = mulberry(37);
    const fine = fbm(size, 64, 2, r),
      grain = grainField(size, r, 14, 1.6);
    const H = new Float32Array(size * size);
    const a = hex("#5e3d24"),
      b = hex("#2b1a0f");
    const map = rgbCanvas(size, (i, o) => {
      const g = grain[i];
      H[i] = g * 0.3 + fine[i] * 0.2;
      mixc(b, a, sat(0.3 + g * 0.5 + fine[i] * 0.2), o);
    });
    return { map, normal: normalCanvas(H, size, size / 120), rough: greyCanvas(size, (i) => 0.4 + fine[i] * 0.2) };
  },
  bricks(size) {
    const r = mulberry(41);
    const n = fbm(size, 8, 5, r),
      fine = fbm(size, 64, 3, r);
    const rows = 8,
      cols = 4,
      H = new Float32Array(size * size);
    const tones = Array.from({ length: rows * cols * 2 }, () => 0.8 + r() * 0.35);
    const stone = hex("#8b867a"),
      mortar = hex("#5d584f"),
      c = [0, 0, 0];
    const map = rgbCanvas(size, (i, o) => {
      const x = i % size,
        y = (i / size) | 0;
      const ry = (y / size) * rows,
        row = Math.floor(ry),
        fy = ry - row;
      const rx = (x / size) * cols + (row % 2) * 0.5,
        col = Math.floor(rx),
        fx = rx - col;
      const ex = Math.min(fx, 1 - fx) * (size / cols),
        ey = Math.min(fy, 1 - fy) * (size / rows);
      const e = Math.min(ex, ey),
        m = 3 + n[i] * 3;
      const inBrick = sat((e - m) / 3);
      H[i] = inBrick * (0.7 + fine[i] * 0.4 + n[i] * 0.3);
      const tone = tones[(row * cols + (col % cols)) % tones.length];
      mixc(mortar, stone, inBrick, c);
      const k = (inBrick ? tone : 1) * (0.85 + fine[i] * 0.3);
      o[0] = c[0] * k;
      o[1] = c[1] * k;
      o[2] = c[2] * k * 0.97;
      const moss = sat((n[i] - 0.62) * 4) * (1 - inBrick * 0.5);
      mixc(o, hex("#4f5a33"), moss * 0.7, o);
    });
    return { map, normal: normalCanvas(H, size, size / 40), rough: greyCanvas(size, (i) => 0.88 + fine[i] * 0.12) };
  },
  rock(size) {
    const r = mulberry(51);
    const n = fbm(size, 4, 6, r),
      cr = worley(size, 40, r),
      fine = fbm(size, 64, 3, r);
    const H = new Float32Array(size * size);
    const a = hex("#8d877a"),
      b = hex("#5c574e");
    const map = rgbCanvas(size, (i, o) => {
      const crack = sat(cr[i] * 2.2);
      H[i] = n[i] * 0.8 + fine[i] * 0.3 + crack * 0.4;
      mixc(b, a, sat(n[i] * 1.2 - 0.1 + fine[i] * 0.2), o);
      const k = 0.65 + 0.35 * crack;
      o[0] *= k;
      o[1] *= k;
      o[2] *= k;
      mixc(o, hex("#556036"), sat((n[i] - 0.6) * 3) * 0.55, o);
    });
    return { map, normal: normalCanvas(H, size, size / 30), rough: greyCanvas(size, (i) => 0.78 + fine[i] * 0.2) };
  },
  bark(size) {
    const r = mulberry(61);
    const n = fbm(size, 4, 5, r),
      H = new Float32Array(size * size);
    const v = fbm(size, 16, 3, r);
    const a = hex("#5a4532"),
      b = hex("#2c2118");
    const map = rgbCanvas(size, (i, o) => {
      const x = i % size;
      const ridge = Math.abs(Math.sin((x / size) * Math.PI * 10 + n[i] * 8));
      H[i] = ridge * 0.7 + v[i] * 0.4;
      mixc(b, a, sat(ridge * 0.8 + v[i] * 0.3), o);
    });
    return { map, normal: normalCanvas(H, size, size / 25), rough: greyCanvas(size, (i) => 0.9 + v[i] * 0.1) };
  },
  needles(size) {
    const r = mulberry(71);
    const n = fbm(size, 8, 4, r),
      fine = fbm(size, Math.min(size, 128), 2, r);
    const H = new Float32Array(size * size);
    const a = hex("#3d5530"),
      b = hex("#1d2b18");
    const map = rgbCanvas(size, (i, o) => {
      H[i] = fine[i] * 0.8 + n[i] * 0.4;
      mixc(b, a, sat(fine[i] * 1.3 - 0.15 + n[i] * 0.3), o);
    });
    return { map, normal: normalCanvas(H, size, size / 16), rough: greyCanvas(size, (i) => 0.75 + fine[i] * 0.2) };
  },
  steel(size) {
    const r = mulberry(81);
    const n = fbm(size, 4, 5, r),
      fine = fbm(size, 64, 3, r),
      H = new Float32Array(size * size);
    const scratches = new Float32Array(size * size);
    for (let k = 0; k < size / 2; k++) {
      let x = r() * size,
        y = r() * size;
      const a = r() * Math.PI,
        len = 4 + r() * size * 0.1;
      for (let s = 0; s < len; s++) {
        const ix = ((x | 0) + size) % size,
          iy = ((y | 0) + size) % size;
        scratches[iy * size + ix] = 1;
        x += Math.cos(a);
        y += Math.sin(a);
      }
    }
    const steel = hex("#3c3d3f"),
      rust = hex("#6b3a1e"),
      c = [0, 0, 0];
    const rustMask = new Float32Array(size * size);
    const map = rgbCanvas(size, (i, o) => {
      const rr = sat((n[i] - 0.58) * 4 + (fine[i] - 0.5));
      rustMask[i] = rr;
      H[i] = rr * fine[i] * 0.8 + fine[i] * 0.1;
      mixc(steel, rust, rr, c);
      const k = 0.85 + fine[i] * 0.3 + scratches[i] * 0.4;
      o[0] = c[0] * k;
      o[1] = c[1] * k;
      o[2] = c[2] * k;
    });
    const rough = greyCanvas(size, (i) => 0.35 + rustMask[i] * 0.55 + fine[i] * 0.1 - scratches[i] * 0.15);
    // metalness is encoded in the blue channel of the roughness texture by
    // three's roughnessMap/metalnessMap convention (G = rough, B = metal).
    const metal = greyCanvas(size, (i) => 1 - rustMask[i] * 0.9);
    return { map, normal: normalCanvas(H, size, size / 40), rough, metal };
  },
  fabric(size) {
    const r = mulberry(91);
    const n = fbm(size, 8, 3, r),
      threads = size / 2,
      H = new Float32Array(size * size);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const u = Math.abs(Math.sin((x / size) * threads * Math.PI)),
          v = Math.abs(Math.sin((y / size) * threads * Math.PI));
        const tw = ((Math.floor((x / size) * threads) + Math.floor((y / size) * threads * 0.5)) & 1) === 0;
        H[y * size + x] = (tw ? u : v) * 0.7 + n[y * size + x] * 0.3;
      }
    return { normal: normalCanvas(H, size, size / 60) };
  },
};

const cache = new Map();
export function pbrSet(kind, size) {
  const key = kind + size;
  if (!cache.has(key)) cache.set(key, GEN[kind](size));
  return cache.get(key);
}

// Wraps cached canvases into fresh THREE textures (one set per battle so the
// battle can dispose its GPU copies freely).
export function pbrTextures(kind, size, repeat = 1, anisotropy = 8) {
  const set = pbrSet(kind, size);
  const wrap = (canvas, srgb) => {
    if (!canvas) return null;
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = anisotropy;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    return t;
  };
  return {
    map: wrap(set.map, true),
    normalMap: wrap(set.normal, false),
    roughnessMap: wrap(set.rough, false),
    metalnessMap: wrap(set.metal, false),
  };
}
