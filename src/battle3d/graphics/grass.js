// Instanced, wind-animated grass tufts scattered around the arena.
import * as THREE from "three";
import { mulberry } from "./textures.js";

function bladeGeometry() {
  // A tuft of thin, tapered blades fanning out from one root, each curving
  // away from the centre. 2 quads + a tip triangle per blade.
  const pos = [],
    hgt = [],
    idx = [];
  const BLADES = 7,
    r = (i) => ((Math.sin(i * 91.7) * 43758.5) % 1 + 1) % 1;
  for (let b = 0; b < BLADES; b++) {
    const a = (b / BLADES) * Math.PI * 2 + r(b) * 0.8,
      ca = Math.cos(a),
      sa = Math.sin(a),
      face = a + Math.PI / 2 + (r(b + 9) - 0.5),
      fc = Math.cos(face),
      fs = Math.sin(face);
    const len = 0.6 + r(b + 3) * 0.4,
      lean = 0.15 + r(b + 5) * 0.35,
      root = 0.02 + r(b + 7) * 0.03,
      base = pos.length / 3;
    const ring = [0, 0.45, 0.8];
    for (const f of ring) {
      const w = 0.009 * (1 - f * 0.7),
        out = root + lean * f * f;
      for (const side of [-1, 1]) {
        pos.push(ca * out + fc * w * side, f * len, sa * out + fs * w * side);
        hgt.push(f * len);
      }
    }
    pos.push(ca * (root + lean * 1.1), len, sa * (root + lean * 1.1));
    hgt.push(len);
    for (let s = 0; s < 2; s++) {
      const i = base + s * 2;
      idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
    }
    idx.push(base + 4, base + 5, base + 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aH", new THREE.Float32BufferAttribute(hgt, 1));
  // Up-facing normals light grass like the ground beneath it (soft, no
  // harsh per-blade facets).
  g.setAttribute("normal", new THREE.Float32BufferAttribute(hgt.flatMap(() => [0, 1, 0]), 3));
  g.setIndex(idx);
  return g;
}

export function createGrass({ count, world, seed = 5, wetAt = () => 0 }) {
  const rng = mulberry(seed);
  const geo = bladeGeometry();
  const time = { value: 0 };
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aH;\nuniform float uTime;\nvarying float vH;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vH = aH;
        vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
        float gust = sin(uTime * 0.7 + ip.x * 0.11 + ip.z * 0.07) * 0.5 + 0.5;
        float sway = sin(uTime * 2.1 + ip.x * 0.9 + ip.z * 0.6) * (0.05 + gust * 0.12);
        transformed.x += sway * aH * aH;
        transformed.z += sway * 0.6 * aH * aH;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vH;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        diffuseColor.rgb *= mix(0.45, 1.1, vH);`,
      );
  };

  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    e = new THREE.Euler(),
    s = new THREE.Vector3(),
    p = new THREE.Vector3(),
    c = new THREE.Color();
  const palette = ["#5a6a35", "#6f7540", "#51602f", "#857f4c", "#63703a", "#94895a"].map((h) => new THREE.Color(h));
  const blocked = (x, z) => {
    for (const b of world.boxes) if (x > b.minX - 0.15 && x < b.maxX + 0.15 && z > b.minZ - 0.15 && z < b.maxZ + 0.15) return true;
    for (const k of world.circles) if ((x - k.x) ** 2 + (z - k.z) ** 2 < (k.r * 0.9) ** 2) return true;
    return false;
  };
  // Patchy coverage: a few large sine fields make natural clumps & clearings.
  const ph = Array.from({ length: 6 }, () => rng() * 6.28);
  const density = (x, z) =>
    0.55 + 0.25 * Math.sin(x * 0.21 + ph[0]) * Math.sin(z * 0.17 + ph[1]) + 0.2 * Math.sin(x * 0.53 + z * 0.41 + ph[2]);
  let n = 0,
    tries = 0;
  while (n < count && tries < count * 4) {
    tries++;
    // ~80% inside the fenced arena, the rest thinning out into the fields.
    const outer = n > count * 0.8;
    const x = (rng() - 0.5) * (outer ? 110 : 52),
      z = (rng() - 0.5) * (outer ? 120 : 64);
    if (outer && Math.abs(x) < 26 && Math.abs(z) < 32) continue;
    if (rng() > density(x, z) || blocked(x, z) || wetAt(x, z) > 0.3) continue;
    const h = 0.16 + rng() * 0.24 * (0.6 + density(x, z) * 0.6);
    p.set(x, 0, z);
    e.set((rng() - 0.5) * 0.25, rng() * Math.PI * 2, (rng() - 0.5) * 0.25);
    q.setFromEuler(e);
    const spread = 0.7 + rng() * 0.6;
    s.set(spread * h * 2.2, h, spread * h * 2.2);
    m.compose(p, q, s);
    mesh.setMatrixAt(n, m);
    c.copy(palette[(rng() * palette.length) | 0]).multiplyScalar(0.85 + rng() * 0.3);
    mesh.setColorAt(n, c);
    n++;
  }
  mesh.count = n;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  mesh.userData.noAO = true;
  return {
    mesh,
    update(t) {
      time.value = t;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
