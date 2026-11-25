// Procedural rig for the (unrigged, A-pose) soldier_gunner model.
//
// The model faces +Z, stands on y = 0 and is 1.78 m tall; its right side is -X.
// We build a small skeleton at measured joint positions, compute skin weights
// per material region (so arms hanging close to the torso don't pull the
// tunic along), and turn every mesh into a SkinnedMesh sharing one skeleton.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Rest positions of every joint in model space (L = +X = the soldier's left).
const J = {
  hips: [0, 0.95, 0],
  spine: [0, 1.1, 0],
  chest: [0, 1.3, 0],
  neck: [0, 1.5, -0.005],
  head: [0, 1.6, 0],
  headTop: [0, 1.8, 0],
  upperArm_L: [0.19, 1.42, -0.01],
  foreArm_L: [0.258, 1.13, -0.022],
  hand_L: [0.29, 0.87, 0.02],
  fingers_L: [0.29, 0.72, 0.05],
  thigh_L: [0.1, 0.92, 0],
  shin_L: [0.105, 0.5, 0.015],
  foot_L: [0.108, 0.095, -0.005],
};
for (const k of Object.keys(J)) {
  if (k.endsWith('_L')) {
    const p = J[k];
    J[k.replace('_L', '_R')] = [-p[0], p[1], p[2]];
  }
}

const PARENT = {
  hips: null,
  spine: 'hips',
  chest: 'spine',
  neck: 'chest',
  head: 'neck',
  upperArm_L: 'chest',
  foreArm_L: 'upperArm_L',
  hand_L: 'foreArm_L',
  thigh_L: 'hips',
  shin_L: 'thigh_L',
  foot_L: 'shin_L',
  upperArm_R: 'chest',
  foreArm_R: 'upperArm_R',
  hand_R: 'foreArm_R',
  thigh_R: 'hips',
  shin_R: 'thigh_R',
  foot_R: 'shin_R',
};
export const BONE_NAMES = Object.keys(PARENT);
const BI = Object.fromEntries(BONE_NAMES.map((n, i) => [n, i]));

const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// A chain is a polyline of joints with a bone per segment. A vertex is
// projected onto the chain to get an arc-length coordinate u, and weights
// cross-fade over +/- blend around each inner joint.
function makeChain(points, bones, blends) {
  const P = points.map(v3);
  const starts = [0];
  for (let i = 1; i < P.length; i++) starts.push(starts[i - 1] + P[i].distanceTo(P[i - 1]));
  return { P, bones, blends, starts };
}
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
function chainWeights(chain, p, out, scale = 1) {
  const { P, bones, blends, starts } = chain;
  let best = Infinity;
  let u = 0;
  const n = P.length - 1;
  for (let i = 0; i < n; i++) {
    _a.subVectors(P[i + 1], P[i]);
    const len = _a.length();
    _b.subVectors(p, P[i]);
    let t = _b.dot(_a) / (len * len);
    // Let the first and last segments extend past their ends.
    const tc = i === 0 ? Math.min(t, 1) : i === n - 1 ? Math.max(t, 0) : Math.min(1, Math.max(0, t));
    const tcc = Math.min(1, Math.max(0, tc));
    const d = _b.sub(_a.multiplyScalar(tcc)).length();
    if (d < best) {
      best = d;
      u = starts[i] + tc * len;
    }
  }
  // f_j = how far past inner joint j we are.
  for (let k = 0; k < bones.length; k++) {
    const fin = k === 0 ? 1 : smooth(starts[k] - blends[k - 1], starts[k] + blends[k - 1], u);
    const fout = k === bones.length - 1 ? 0 : smooth(starts[k + 1] - blends[k], starts[k + 1] + blends[k], u);
    const w = (fin - fout) * scale;
    if (w > 1e-4) out[BI[bones[k]]] = (out[BI[bones[k]]] || 0) + w;
  }
}

const BODY = makeChain(
  [J.hips, J.spine, J.chest, J.neck, J.head, J.headTop],
  ['hips', 'spine', 'chest', 'neck', 'head'],
  [0.07, 0.07, 0.05, 0.03],
);
const ARM = {
  L: makeChain([J.upperArm_L, J.foreArm_L, J.hand_L, J.fingers_L], ['upperArm_L', 'foreArm_L', 'hand_L'], [0.05, 0.025]),
  R: makeChain([J.upperArm_R, J.foreArm_R, J.hand_R, J.fingers_R], ['upperArm_R', 'foreArm_R', 'hand_R'], [0.05, 0.025]),
};
const LEG = {
  L: makeChain([[0.1, 1.08, 0], J.thigh_L, J.shin_L, J.foot_L], ['hips', 'thigh_L', 'shin_L'], [0.06, 0.05]),
  R: makeChain([[-0.1, 1.08, 0], J.thigh_R, J.shin_R, J.foot_R], ['hips', 'thigh_R', 'shin_R'], [0.06, 0.05]),
};

// How much a tunic/skin vertex belongs to the arm rather than the torso.
function armness(x, y) {
  const ax = Math.abs(x);
  if (y > 1.52) return 0;
  if (y > 1.36) return smooth(0.13, 0.22, ax) * (1 - smooth(1.44, 1.52, y));
  const edge = y < 1.18 ? 0.183 : 0.172;
  return smooth(edge - 0.006, edge + 0.006, ax);
}

function legWeights(p, out, scale) {
  // Crotch: cross-fade left/right so the seam doesn't tear.
  const l = smooth(-0.035, 0.035, p.x);
  if (l > 0) legChainWeights('L', p, out, scale * l);
  if (l < 1) legChainWeights('R', p, out, scale * (1 - l));
}
function legChainWeights(side, p, out, scale) {
  const tmp = {};
  chainWeights(LEG[side], p, tmp, 1);
  // Below the ankle the foot bone takes over.
  const foot = 1 - smooth(0.07, 0.13, p.y);
  for (const k in tmp) out[k] = (out[k] || 0) + tmp[k] * (1 - foot) * scale;
  if (foot > 0) out[BI['foot_' + side]] = (out[BI['foot_' + side]] || 0) + foot * scale;
}

function vertexWeights(region, p) {
  const out = {};
  switch (region) {
    case 'helmet':
    case 'hair':
    case 'eye':
    case 'iris':
    case 'pupil':
      out[BI.head] = 1;
      break;
    case 'boot':
    case 'sole':
    case 'trousers':
      legWeights(p, out, 1);
      break;
    case 'nail':
      out[BI[p.x > 0 ? 'hand_L' : 'hand_R']] = 1;
      break;
    case 'leather':
    case 'steel':
    case 'brass':
    case 'canvas':
      chainWeights(BODY, p, out, 1);
      break;
    default: {
      // tunic, skin
      const a = armness(p.x, p.y);
      if (a > 0) chainWeights(ARM[p.x > 0 ? 'L' : 'R'], p, out, a);
      if (a < 1) {
        // Tunic skirt follows the thighs a little.
        const legShare = region === 'tunic' ? 0.45 * (1 - smooth(0.88, 1.02, p.y)) : 0;
        chainWeights(BODY, p, out, (1 - a) * (1 - legShare));
        if (legShare > 0) legWeights(p, out, (1 - a) * legShare);
      }
    }
  }
  return out;
}

function skinGeometry(geom, region) {
  const pos = geom.attributes.position;
  const n = pos.count;
  const idx = new Uint16Array(n * 4);
  const wts = new Float32Array(n * 4);
  const p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    const w = Object.entries(vertexWeights(region, p))
      .map(([k, v]) => [+k, v])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
    let sum = 0;
    for (const [, v] of w) sum += v;
    if (!w.length) {
      w.push([BI.hips, 1]);
      sum = 1;
    }
    for (let j = 0; j < 4; j++) {
      idx[i * 4 + j] = w[j] ? w[j][0] : 0;
      wts[i * 4 + j] = w[j] ? w[j][1] / sum : 0;
    }
  }
  geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wts, 4));
}

const SMALL_PARTS = new Set(['hair', 'eye', 'iris', 'pupil', 'nail', 'sole', 'steel', 'brass']);

// Fold material colour into a plain RGB vertex colour so parts can be merged.
function bakeColor(geom, mat) {
  const n = geom.attributes.position.count;
  const src = geom.attributes.color;
  const c = new Float32Array(n * 3);
  const base = mat.color || new THREE.Color(1, 1, 1);
  for (let i = 0; i < n; i++) {
    c[i * 3] = (src ? src.getX(i) : 1) * base.r;
    c[i * 3 + 1] = (src ? src.getY(i) : 1) * base.g;
    c[i * 3 + 2] = (src ? src.getZ(i) : 1) * base.b;
  }
  for (const k of Object.keys(geom.attributes)) if (!['position', 'normal', 'skinIndex', 'skinWeight'].includes(k)) geom.deleteAttribute(k);
  geom.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geom;
}

// Returns a Group holding the bone hierarchy and the skinned meshes.
// Clone it with SkeletonUtils.clone().
export function rigSoldier(gltfScene) {
  const group = new THREE.Group();
  group.name = 'soldier';
  const bones = {};
  for (const name of BONE_NAMES) {
    const b = new THREE.Bone();
    b.name = name;
    bones[name] = b;
  }
  for (const name of BONE_NAMES) {
    const b = bones[name];
    const par = PARENT[name];
    const wp = v3(J[name]);
    if (par) {
      b.position.copy(wp.sub(v3(J[par])));
      bones[par].add(b);
    } else {
      b.position.copy(wp);
      group.add(b);
    }
  }
  group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(BONE_NAMES.map((n) => bones[n]));

  gltfScene.updateMatrixWorld(true);
  const small = [];
  const addMesh = (geom, mat, name, shadow) => {
    const sm = new THREE.SkinnedMesh(geom, mat);
    sm.name = name;
    sm.castShadow = shadow;
    sm.receiveShadow = true;
    sm.frustumCulled = false;
    sm.bind(skeleton, new THREE.Matrix4());
    group.add(sm);
  };
  gltfScene.traverse((o) => {
    if (!o.isMesh) return;
    const region = (o.name || o.geometry.name || '').replace(/^soldier_gunner_/, '').replace(/_\d+$/, '');
    const geom = o.geometry.clone();
    geom.applyMatrix4(o.matrixWorld);
    skinGeometry(geom, region);
    if (SMALL_PARTS.has(region)) small.push(bakeColor(geom, o.material));
    else addMesh(geom, o.material, region, true);
  });
  // Small untextured parts share one vertex-coloured mesh: fewer draw calls.
  if (small.length) {
    const merged = mergeGeometries(small);
    small.forEach((g) => g.dispose());
    addMesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.2 }), 'details', false);
  }
  return group;
}

export const REST = Object.fromEntries(Object.entries(J).map(([k, v]) => [k, v3(v)]));

// ---- Two-bone IK -----------------------------------------------------------
const _S = new THREE.Vector3();
const _E = new THREE.Vector3();
const _T = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _bend = new THREE.Vector3();
const _rest = new THREE.Vector3();
const _want = new THREE.Vector3();
const _pq = new THREE.Quaternion();
const _pqi = new THREE.Quaternion();
const _q = new THREE.Quaternion();

function aimBone(bone, restLocalDir, wantWorldDir) {
  bone.parent.getWorldQuaternion(_pq);
  _rest.copy(restLocalDir).normalize().applyQuaternion(_pq);
  _q.setFromUnitVectors(_rest, _want.copy(wantWorldDir).normalize());
  // local = P^-1 * q * P
  _pqi.copy(_pq).invert();
  bone.quaternion.copy(_pqi).multiply(_q).multiply(_pq);
  bone.updateMatrixWorld(true);
}

// upper/lower/end are bones; target and pole are world-space points.
export function solveTwoBone(upper, lower, end, target, pole) {
  upper.quaternion.identity();
  lower.quaternion.identity();
  upper.updateMatrixWorld(true);
  upper.getWorldPosition(_S);
  const a = lower.position.length();
  const b = end.position.length();
  _T.copy(target);
  _dir.subVectors(_T, _S);
  let d = _dir.length();
  d = Math.min(a + b - 1e-3, Math.max(Math.abs(a - b) + 1e-3, d));
  _dir.normalize();
  _bend.subVectors(pole, _S);
  _bend.addScaledVector(_dir, -_bend.dot(_dir)).normalize();
  const cosA = (a * a + d * d - b * b) / (2 * a * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  _E.copy(_S).addScaledVector(_dir, a * cosA).addScaledVector(_bend, a * sinA);
  _T.copy(_S).addScaledVector(_dir, d);
  aimBone(upper, lower.position, _want.subVectors(_E, _S));
  aimBone(lower, end.position, _want.subVectors(_T, _E));
}
