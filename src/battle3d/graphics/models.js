// Higher-detail procedural models used from MEDIUM quality upward.
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mulberry } from "./textures.js";

const V3 = THREE.Vector3;

function prep(geo, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const m = new THREE.Matrix4().compose(
    new V3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new V3(sx, sy, sz),
  );
  g.applyMatrix4(m);
  return g;
}

function merge(list) {
  const g = mergeGeometries(list);
  list.forEach((p) => p.dispose());
  return g;
}

// Side-profile (z forward, y up) extruded symmetrically along x.
function profile(points, depth, bevel = 0.005) {
  const shape = new THREE.Shape();
  points.forEach(([z, y], i) => (i ? shape.lineTo(z, y) : shape.moveTo(z, y)));
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: depth - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 6,
  });
  // Shape is in XY; map shape-x -> z, shape-y -> y, extrusion -> x.
  g.rotateY(-Math.PI / 2);
  g.translate(-(depth - bevel * 2) / 2, 0, 0);
  // UVs from the side projection so wood grain runs along the gun.
  const p = g.attributes.position,
    uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getZ(i) * 3, p.getY(i) * 3 + p.getX(i));
  return g;
}

const rbox = (w, h, d, r = 0.004) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.1, h / 2.1, d / 2.1));
const cyl = (r1, r2, len, seg = 14) => new THREE.CylinderGeometry(r1, r2, len, seg);

function gunGroup(parts, mats, grips, offset) {
  const group = new THREE.Group();
  for (const key of Object.keys(parts)) {
    if (!parts[key].length) continue;
    const mesh = new THREE.Mesh(merge(parts[key]), mats[key]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  for (const g of Object.values(grips)) group.add(g);
  group.userData = { grips, offset };
  return group;
}

const grip = (x, y, z) => {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  return o;
};

// Bolt-action style rifle; grip / muzzle points match the original model.
export function detailedRifle(mats) {
  const wood = [],
    metal = [];
  wood.push(
    prep(
      profile(
        [
          [0.0, 0.028],
          [0.0, -0.1],
          [0.012, -0.104],
          [0.11, -0.084],
          [0.2, -0.058],
          [0.25, -0.05],
          [0.3, -0.045],
          [0.34, -0.03],
          [0.56, -0.028],
          [0.8, -0.024],
          [0.814, -0.008],
          [0.81, 0.016],
          [0.56, 0.018],
          [0.33, 0.012],
          [0.29, 0.004],
          [0.2, 0.004],
          [0.07, 0.024],
        ],
        0.044,
      ),
    ),
  );
  // upper hand guard
  wood.push(prep(rbox(0.032, 0.02, 0.2, 0.008), { y: 0.036, z: 0.68 }));
  // receiver + bolt
  metal.push(prep(rbox(0.034, 0.042, 0.25, 0.006), { y: 0.03, z: 0.45 }));
  metal.push(prep(cyl(0.012, 0.012, 0.09, 12), { y: 0.05, z: 0.42, rx: Math.PI / 2 }));
  metal.push(prep(cyl(0.004, 0.004, 0.045, 8), { x: 0.03, y: 0.046, z: 0.39, rz: Math.PI / 2 - 0.35 }));
  metal.push(prep(new THREE.SphereGeometry(0.009, 10, 8), { x: 0.052, y: 0.038, z: 0.39 }));
  // barrel, muzzle, bands
  metal.push(prep(cyl(0.011, 0.012, 0.52), { y: 0.026, z: 0.82, rx: Math.PI / 2 }));
  metal.push(prep(cyl(0.0135, 0.0135, 0.04), { y: 0.026, z: 1.07, rx: Math.PI / 2 }));
  metal.push(prep(new THREE.TorusGeometry(0.0085, 0.0022, 6, 14), { y: 0.026, z: 1.09 }));
  for (const z of [0.6, 0.785]) metal.push(prep(rbox(0.05, 0.072, 0.014, 0.004), { y: 0.004, z }));
  // sights
  metal.push(prep(rbox(0.022, 0.014, 0.04, 0.003), { y: 0.055, z: 0.575 }));
  metal.push(prep(rbox(0.004, 0.024, 0.006, 0.001), { y: 0.05, z: 1.02 }));
  metal.push(prep(new THREE.TorusGeometry(0.013, 0.0022, 6, 12, Math.PI), { y: 0.044, z: 1.02 }));
  // magazine (curved)
  const mag = profile(
    [
      [0.4, -0.02],
      [0.465, -0.02],
      [0.49, -0.08],
      [0.52, -0.15],
      [0.455, -0.158],
      [0.43, -0.085],
    ],
    0.028,
    0.003,
  );
  metal.push(prep(mag));
  // trigger + guard, butt plate, sling swivels
  metal.push(prep(new THREE.TorusGeometry(0.02, 0.003, 6, 14, Math.PI), { y: -0.03, z: 0.33, rx: Math.PI, ry: Math.PI / 2 }));
  metal.push(prep(rbox(0.004, 0.022, 0.006, 0.001), { y: -0.038, z: 0.335, rx: 0.3 }));
  metal.push(prep(rbox(0.048, 0.13, 0.006, 0.002), { y: -0.036, z: 0.002, rx: -0.03 }));
  metal.push(prep(new THREE.TorusGeometry(0.01, 0.002, 6, 10), { y: -0.09, z: 0.12, ry: Math.PI / 2 }));
  metal.push(prep(new THREE.TorusGeometry(0.01, 0.002, 6, 10), { y: -0.035, z: 0.79, ry: Math.PI / 2 }));
  return gunGroup(
    { wood, metal },
    mats,
    { right: grip(0, -0.04, 0.27), left: grip(0.02, -0.05, 0.58), muzzle: grip(0, 0.018, 1.09) },
    new V3(0, 0, -0.02),
  );
}

export function detailedHandgun(mats) {
  const wood = [],
    metal = [];
  metal.push(prep(rbox(0.03, 0.033, 0.19, 0.005), { y: 0.046, z: 0.07 }));
  // slide serrations
  for (let i = 0; i < 6; i++) metal.push(prep(rbox(0.032, 0.026, 0.003, 0.001), { y: 0.046, z: -0.01 + i * 0.008 }));
  metal.push(prep(rbox(0.026, 0.02, 0.15, 0.004), { y: 0.022, z: 0.07 }));
  metal.push(prep(cyl(0.0065, 0.0065, 0.012, 10), { y: 0.05, z: 0.166, rx: Math.PI / 2 }));
  metal.push(prep(rbox(0.026, 0.1, 0.04, 0.006), { y: -0.012, z: 0.0, rx: -0.25 }));
  wood.push(prep(rbox(0.032, 0.075, 0.032, 0.006), { y: -0.016, z: 0.002, rx: -0.25 }));
  metal.push(prep(new THREE.TorusGeometry(0.016, 0.0028, 6, 12, Math.PI), { y: 0.012, z: 0.045, rx: Math.PI, ry: Math.PI / 2 }));
  metal.push(prep(rbox(0.006, 0.012, 0.008, 0.001), { y: 0.066, z: -0.018 }));
  metal.push(prep(rbox(0.004, 0.01, 0.006, 0.001), { y: 0.066, z: 0.15 }));
  return gunGroup(
    { wood, metal },
    mats,
    { right: grip(-0.025, -0.04, -0.04), left: grip(0.035, -0.045, -0.02), muzzle: grip(0, 0.045, 0.17) },
    new V3(0.1, -0.06, 0.36),
  );
}

// ------------------------------------------------------------------ nature
function noise3(seed) {
  const r = mulberry(seed),
    ph = Array.from({ length: 9 }, () => r() * 6.283),
    fr = Array.from({ length: 9 }, (_, i) => 1.3 + i * 0.9 + r());
  return (x, y, z) => {
    let v = 0;
    for (let i = 0; i < 3; i++) {
      v += Math.sin(x * fr[i * 3] + ph[i * 3]) * Math.sin(y * fr[i * 3 + 1] + ph[i * 3 + 1]) * Math.sin(z * fr[i * 3 + 2] + ph[i * 3 + 2]) / (i + 1);
    }
    return v;
  };
}

// Smooth, lumpy boulder of radius r, matching the original's squashed shape.
export function detailedRock(r, seed, detail = 3) {
  const n = noise3(seed);
  let g = new THREE.IcosahedronGeometry(r, detail);
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  g = mergeVertices(g);
  const p = g.attributes.position,
    v = new V3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).divideScalar(r);
    let k = 0.86 + n(v.x * 1.1, v.y * 1.1, v.z * 1.1) * 0.22 + n(v.x * 4, v.y * 4, v.z * 4) * 0.05;
    // chiselled facets
    k -= Math.max(0, n(v.x * 2.3 + 5, v.y * 2.3, v.z * 2.3) - 0.35) * 0.25;
    p.setXYZ(i, v.x * r * k, v.y * r * k * 0.75, v.z * r * k);
  }
  g.computeVertexNormals();
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(p.count * 2), 2));
  return g;
}

// Pine: trunk + drooping, jittered needle layers. Returns { trunk, foliage }.
export function detailedPine(scale, seed, layers = 6) {
  const r = mulberry(seed),
    n = noise3(seed + 7);
  const trunk = new THREE.CylinderGeometry(0.1 * scale, 0.2 * scale, 4.2 * scale, 10, 4);
  trunk.translate(0, 2.1 * scale, 0);
  const tp = trunk.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i);
    tp.setX(i, tp.getX(i) + Math.sin(y * 1.7 + seed) * 0.03 * scale);
  }
  trunk.computeVertexNormals();
  const foliage = [];
  for (let l = 0; l < layers; l++) {
    const f = l / (layers - 1);
    const rad = (1.65 - f * 1.25) * scale * (0.9 + r() * 0.2);
    const h = (1.5 - f * 0.4) * scale;
    const c = new THREE.ConeGeometry(rad, h, 16, 3, true);
    const p = c.attributes.position,
      v = new V3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const rim = 1 - (v.y + h / 2) / h; // 1 at base
      const a = Math.atan2(v.z, v.x);
      const jag = 1 + 0.18 * Math.sin(a * 7 + l * 2.1) * rim + n(v.x, v.y + l, v.z) * 0.12;
      v.x *= jag;
      v.z *= jag;
      v.y -= rim * rim * 0.35 * scale * (0.8 + 0.4 * Math.sin(a * 3 + l)); // droop
      p.setXYZ(i, v.x, v.y, v.z);
    }
    c.computeVertexNormals();
    c.rotateY(r() * 6.28);
    c.translate(0, (1.7 + f * 4.3) * scale, 0);
    foliage.push(c);
    // underside so layers are not see-through from below
    const under = new THREE.CircleGeometry(rad * 0.85, 12);
    under.rotateX(Math.PI / 2);
    under.translate(0, (1.7 + f * 4.3) * scale - h / 2 - 0.2 * scale, 0);
    foliage.push(under);
  }
  return { trunk, foliage };
}

// Plump, slightly creased sandbag (unit size; caller scales like the original).
export function detailedSandbag(segW = 24, segH = 14) {
  const g = new THREE.SphereGeometry(0.5, segW, segH);
  const p = g.attributes.position,
    v = new V3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    if (v.y < 0) v.y *= 0.62;
    else v.y *= 0.92;
    const ax = Math.abs(v.x) / 0.5;
    const pinch = 1 - Math.pow(Math.max(0, ax - 0.55) / 0.45, 2) * 0.45;
    v.y *= pinch;
    v.z *= pinch;
    v.y += Math.sin(v.x * 18) * 0.012 * (1 - ax);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// Replace a geometry's UVs with a world-space box projection (for merged
// walls / rocks / hills that would otherwise stretch their textures).
export function boxProjectUVs(geo, scale) {
  const p = geo.attributes.position,
    nrm = geo.attributes.normal;
  let uv = geo.attributes.uv;
  if (!uv) {
    uv = new THREE.Float32BufferAttribute(new Float32Array(p.count * 2), 2);
    geo.setAttribute("uv", uv);
  }
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(nrm.getX(i)),
      ny = Math.abs(nrm.getY(i)),
      nz = Math.abs(nrm.getZ(i));
    const x = p.getX(i) * scale,
      y = p.getY(i) * scale,
      z = p.getZ(i) * scale;
    if (ny >= nx && ny >= nz) uv.setXY(i, x, z);
    else if (nx >= nz) uv.setXY(i, z, y);
    else uv.setXY(i, x, y);
  }
  uv.needsUpdate = true;
}
