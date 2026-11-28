// Supremacy — 3D battle module.
// Bundled into Supremacy.html by build/build.mjs (exposed as window.Battle3D).
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { resolveQuality, QUALITY_LEVELS, storedQuality, saveQuality, defaultQuality } from "./graphics/quality.js";
import { createPipeline } from "./graphics/pipeline.js";
import { createSky } from "./graphics/sky.js";
import { createGroundMaterial } from "./graphics/ground.js";
import { createGrass } from "./graphics/grass.js";
import { pbrTextures } from "./graphics/textures.js";
import {
  detailedRifle,
  detailedHandgun,
  detailedRock,
  detailedPine,
  detailedSandbag,
  boxProjectUVs,
} from "./graphics/models.js";

var JOINTS = {
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
for (let s of Object.keys(JOINTS))
  if (s.endsWith("_L")) {
    let e = JOINTS[s];
    JOINTS[s.replace("_L", "_R")] = [-e[0], e[1], e[2]];
  }
var JOINT_PARENT = {
    hips: null,
    spine: "hips",
    chest: "spine",
    neck: "chest",
    head: "neck",
    upperArm_L: "chest",
    foreArm_L: "upperArm_L",
    hand_L: "foreArm_L",
    thigh_L: "hips",
    shin_L: "thigh_L",
    foot_L: "shin_L",
    upperArm_R: "chest",
    foreArm_R: "upperArm_R",
    hand_R: "foreArm_R",
    thigh_R: "hips",
    shin_R: "thigh_R",
    foot_R: "shin_R",
  },
  JOINT_NAMES = Object.keys(JOINT_PARENT),
  Li = Object.fromEntries(JOINT_NAMES.map((s, e) => [s, e])),
  Xo = (s) => new THREE.Vector3(s[0], s[1], s[2]),
  pi = (s, e, t) => {
    let n = Math.min(1, Math.max(0, (t - s) / (e - s)));
    return n * n * (3 - 2 * n);
  };
function hr(s, e, t) {
  let n = s.map(Xo),
    i = [0];
  for (let r = 1; r < n.length; r++) i.push(i[r - 1] + n[r].distanceTo(n[r - 1]));
  return { P: n, bones: e, blends: t, starts: i };
}
var zo = new THREE.Vector3(),
  Fl = new THREE.Vector3();
function Wo(s, e, t, n = 1) {
  let { P: i, bones: r, blends: o, starts: a } = s,
    c = 1 / 0,
    l = 0,
    h = i.length - 1;
  for (let u = 0; u < h; u++) {
    zo.subVectors(i[u + 1], i[u]);
    let d = zo.length();
    Fl.subVectors(e, i[u]);
    let f = Fl.dot(zo) / (d * d),
      g = u === 0 ? Math.min(f, 1) : u === h - 1 ? Math.max(f, 0) : Math.min(1, Math.max(0, f)),
      x = Math.min(1, Math.max(0, g)),
      m = Fl.sub(zo.multiplyScalar(x)).length();
    m < c && ((c = m), (l = a[u] + g * d));
  }
  for (let u = 0; u < r.length; u++) {
    let d = u === 0 ? 1 : pi(a[u] - o[u - 1], a[u] + o[u - 1], l),
      f = u === r.length - 1 ? 0 : pi(a[u + 1] - o[u], a[u + 1] + o[u], l),
      g = (d - f) * n;
    g > 1e-4 && (t[Li[r[u]]] = (t[Li[r[u]]] || 0) + g);
  }
}
var Vu = hr(
    [JOINTS.hips, JOINTS.spine, JOINTS.chest, JOINTS.neck, JOINTS.head, JOINTS.headTop],
    ["hips", "spine", "chest", "neck", "head"],
    [0.07, 0.07, 0.05, 0.03],
  ),
  V_ = {
    L: hr(
      [JOINTS.upperArm_L, JOINTS.foreArm_L, JOINTS.hand_L, JOINTS.fingers_L],
      ["upperArm_L", "foreArm_L", "hand_L"],
      [0.05, 0.025],
    ),
    R: hr(
      [JOINTS.upperArm_R, JOINTS.foreArm_R, JOINTS.hand_R, JOINTS.fingers_R],
      ["upperArm_R", "foreArm_R", "hand_R"],
      [0.05, 0.025],
    ),
  },
  G_ = {
    L: hr([[0.1, 1.08, 0], JOINTS.thigh_L, JOINTS.shin_L, JOINTS.foot_L], ["hips", "thigh_L", "shin_L"], [0.06, 0.05]),
    R: hr([[-0.1, 1.08, 0], JOINTS.thigh_R, JOINTS.shin_R, JOINTS.foot_R], ["hips", "thigh_R", "shin_R"], [0.06, 0.05]),
  };
function W_(s, e) {
  let t = Math.abs(s);
  if (e > 1.52) return 0;
  if (e > 1.36) return pi(0.13, 0.22, t) * (1 - pi(1.44, 1.52, e));
  let n = e < 1.18 ? 0.183 : 0.172;
  return pi(n - 0.006, n + 0.006, t);
}
function Gu(s, e, t) {
  let n = pi(-0.035, 0.035, s.x);
  n > 0 && Wu("L", s, e, t * n), n < 1 && Wu("R", s, e, t * (1 - n));
}
function Wu(s, e, t, n) {
  let i = {};
  Wo(G_[s], e, i, 1);
  let r = 1 - pi(0.07, 0.13, e.y);
  for (let o in i) t[o] = (t[o] || 0) + i[o] * (1 - r) * n;
  r > 0 && (t[Li["foot_" + s]] = (t[Li["foot_" + s]] || 0) + r * n);
}
function X_(s, e) {
  let t = {};
  switch (s) {
    case "helmet":
    case "hair":
    case "eye":
    case "iris":
    case "pupil":
      t[Li.head] = 1;
      break;
    case "boot":
    case "sole":
    case "trousers":
      Gu(e, t, 1);
      break;
    case "nail":
      t[Li[e.x > 0 ? "hand_L" : "hand_R"]] = 1;
      break;
    case "leather":
    case "steel":
    case "brass":
    case "canvas":
      Wo(Vu, e, t, 1);
      break;
    default: {
      let n = W_(e.x, e.y);
      if ((n > 0 && Wo(V_[e.x > 0 ? "L" : "R"], e, t, n), n < 1)) {
        let i = s === "tunic" ? 0.45 * (1 - pi(0.88, 1.02, e.y)) : 0;
        Wo(Vu, e, t, (1 - n) * (1 - i)), i > 0 && Gu(e, t, (1 - n) * i);
      }
    }
  }
  return t;
}
function q_(s, e) {
  let t = s.attributes.position,
    n = t.count,
    i = new Uint16Array(n * 4),
    r = new Float32Array(n * 4),
    o = new THREE.Vector3();
  for (let a = 0; a < n; a++) {
    o.fromBufferAttribute(t, a);
    let c = Object.entries(X_(e, o))
        .map(([h, u]) => [+h, u])
        .sort((h, u) => u[1] - h[1])
        .slice(0, 4),
      l = 0;
    for (let [, h] of c) l += h;
    c.length || (c.push([Li.hips, 1]), (l = 1));
    for (let h = 0; h < 4; h++) (i[a * 4 + h] = c[h] ? c[h][0] : 0), (r[a * 4 + h] = c[h] ? c[h][1] / l : 0);
  }
  s.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(i, 4)), s.setAttribute("skinWeight", new THREE.Float32BufferAttribute(r, 4));
}
var Y_ = new Set(["hair", "eye", "iris", "pupil", "nail", "sole", "steel", "brass"]);
function Z_(s, e) {
  let t = s.attributes.position.count,
    n = s.attributes.color,
    i = new Float32Array(t * 3),
    r = e.color || new THREE.Color(1, 1, 1);
  for (let o = 0; o < t; o++)
    (i[o * 3] = (n ? n.getX(o) : 1) * r.r),
      (i[o * 3 + 1] = (n ? n.getY(o) : 1) * r.g),
      (i[o * 3 + 2] = (n ? n.getZ(o) : 1) * r.b);
  for (let o of Object.keys(s.attributes))
    ["position", "normal", "skinIndex", "skinWeight"].includes(o) || s.deleteAttribute(o);
  return s.setAttribute("color", new THREE.BufferAttribute(i, 3)), s;
}
function buildSoldierRig(s) {
  let e = new THREE.Group();
  e.name = "soldier";
  let t = {};
  for (let o of JOINT_NAMES) {
    let a = new THREE.Bone();
    (a.name = o), (t[o] = a);
  }
  for (let o of JOINT_NAMES) {
    let a = t[o],
      c = JOINT_PARENT[o],
      l = Xo(JOINTS[o]);
    c ? (a.position.copy(l.sub(Xo(JOINTS[c]))), t[c].add(a)) : (a.position.copy(l), e.add(a));
  }
  e.updateMatrixWorld(!0);
  let n = new THREE.Skeleton(JOINT_NAMES.map((o) => t[o]));
  s.updateMatrixWorld(!0);
  let i = [],
    r = (o, a, c, l) => {
      let h = new THREE.SkinnedMesh(o, a);
      (h.name = c),
        (h.castShadow = l),
        (h.receiveShadow = !0),
        (h.frustumCulled = !1),
        h.bind(n, new THREE.Matrix4()),
        e.add(h);
    };
  if (
    (s.traverse((o) => {
      if (!o.isMesh) return;
      let a = (o.name || o.geometry.name || "").replace(/^soldier_gunner_/, "").replace(/_\d+$/, ""),
        c = o.geometry.clone();
      c.applyMatrix4(o.matrixWorld),
        q_(c, a),
        Y_.has(a) ? i.push(Z_(c, o.material)) : r(c, o.material, a, !0);
    }),
    i.length)
  ) {
    let o = mergeGeometries(i);
    i.forEach((a) => a.dispose()),
      r(o, new THREE.MeshStandardMaterial({ vertexColors: !0, roughness: 0.45, metalness: 0.2 }), "details", !1);
  }
  return e;
}
var yx = Object.fromEntries(Object.entries(JOINTS).map(([s, e]) => [s, Xo(e)])),
  Cs = new THREE.Vector3(),
  Bl = new THREE.Vector3(),
  ko = new THREE.Vector3(),
  Ii = new THREE.Vector3(),
  Ho = new THREE.Vector3(),
  Xu = new THREE.Vector3(),
  zl = new THREE.Vector3(),
  Vo = new THREE.Quaternion(),
  qu = new THREE.Quaternion(),
  Yu = new THREE.Quaternion();
function Zu(s, e, t) {
  s.parent.getWorldQuaternion(Vo),
    Xu.copy(e).normalize().applyQuaternion(Vo),
    Yu.setFromUnitVectors(Xu, zl.copy(t).normalize()),
    qu.copy(Vo).invert(),
    s.quaternion.copy(qu).multiply(Yu).multiply(Vo),
    s.updateMatrixWorld(!0);
}
function solveTwoBoneIK(s, e, t, n, i) {
  s.quaternion.identity(), e.quaternion.identity(), s.updateMatrixWorld(!0), s.getWorldPosition(Cs);
  let r = e.position.length(),
    o = t.position.length();
  ko.copy(n), Ii.subVectors(ko, Cs);
  let a = Ii.length();
  (a = Math.min(r + o - 0.001, Math.max(Math.abs(r - o) + 0.001, a))),
    Ii.normalize(),
    Ho.subVectors(i, Cs),
    Ho.addScaledVector(Ii, -Ho.dot(Ii)).normalize();
  let c = (r * r + a * a - o * o) / (2 * r * a),
    l = Math.sqrt(Math.max(0, 1 - c * c));
  Bl.copy(Cs)
    .addScaledVector(Ii, r * c)
    .addScaledVector(Ho, r * l),
    ko.copy(Cs).addScaledVector(Ii, a),
    Zu(s, e.position, zl.subVectors(Bl, Cs)),
    Zu(e, t.position, zl.subVectors(ko, Bl));
}
var ARENA = { minX: -15.5, maxX: 15.5, minZ: -20.5, maxZ: 20.5 };
function rng(s) {
  let e = s >>> 0 || 1;
  return () => ((e ^= e << 13), (e ^= e >>> 17), (e ^= e << 5), ((e >>> 0) % 1e5) / 1e5);
}
function canvasTex(s, e, t, n) {
  let i = document.createElement("canvas");
  (i.width = s), (i.height = e), t(i.getContext("2d"), s, e);
  let r = new THREE.CanvasTexture(i);
  return (r.colorSpace = THREE.SRGBColorSpace), n && ((r.wrapS = r.wrapT = THREE.RepeatWrapping), r.repeat.set(n, n)), (r.anisotropy = 4), r;
}
function groundTex(s) {
  let e = ["#4a5138", "#5c4a34", "#3a4230", "#6b5a3d", "#42392a"];
  return canvasTex(
    512,
    512,
    (t, n, i) => {
      (t.fillStyle = "#4a4c34"), t.fillRect(0, 0, n, i);
      for (let o = 0; o < 70; o++) {
        let a = s() * n,
          c = s() * i,
          l = 20 + s() * 60;
        (t.fillStyle = e[Math.floor(s() * e.length)]), (t.globalAlpha = 0.35 + s() * 0.35);
        for (let h of [-n, 0, n])
          for (let u of [-i, 0, i])
            t.beginPath(),
              t.ellipse(a + h, c + u, l, l * (0.5 + s() * 0.4), s() * Math.PI, 0, Math.PI * 2),
              t.fill();
      }
      t.globalAlpha = 1;
      let r = t.getImageData(0, 0, n, i);
      for (let o = 0; o < r.data.length; o += 4) {
        let a = (s() - 0.5) * 34;
        (r.data[o] += a), (r.data[o + 1] += a), (r.data[o + 2] += a * 0.8);
      }
      t.putImageData(r, 0, 0);
      for (let o = 0; o < 900; o++) {
        let a = s() * n,
          c = s() * i;
        (t.strokeStyle = s() < 0.5 ? "rgba(96,110,60,0.7)" : "rgba(60,70,40,0.7)"),
          (t.lineWidth = 1),
          t.beginPath(),
          t.moveTo(a, c),
          t.lineTo(a + (s() - 0.5) * 4, c - 3 - s() * 4),
          t.stroke();
      }
    },
    14,
  );
}
function noiseTex(s, e, t, n = 128, i) {
  return canvasTex(n, n, (r, o, a) => {
    (r.fillStyle = s), r.fillRect(0, 0, o, a);
    let c = r.getImageData(0, 0, o, a);
    for (let l = 0; l < c.data.length; l += 4) {
      let h = (t() - 0.5) * e;
      (c.data[l] += h), (c.data[l + 1] += h), (c.data[l + 2] += h);
    }
    r.putImageData(c, 0, 0), i && i(r, o, a);
  });
}
function buildWorld(s, e, gfx, pipe) {
  // `hi` = PBR asset path (MEDIUM and above). The seeded layout RNG `t` is
  // consumed identically on every quality level so the map never changes.
  const hi = gfx.texSize > 0,
    renderer = pipe.renderer;
  let t = rng(e),
    n = [],
    i = (O) => (n.push(O), O),
    r = [],
    o = [],
    a = i(new THREE.SphereGeometry(400, 24, 12)),
    c = i(
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: !1,
        fog: !1,
        uniforms: {
          top: { value: new THREE.Color("#6f93ad") },
          mid: { value: new THREE.Color("#e2dcc4") },
          bot: { value: new THREE.Color("#6d6a55") },
        },
        vertexShader:
          "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader:
          "uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.6)) : mix(mid, bot, min(1.0, -h * 4.0)); gl_FragColor = vec4(c, 1.0); }",
      }),
    );
  const sunOffset = gfx.physicalSky ? new THREE.Vector3(21, 20, 9) : new THREE.Vector3(14, 26, 10);
  let sky = null;
  if (gfx.physicalSky) {
    sky = createSky({ sunDir: sunOffset });
    s.add(sky.mesh), n.push(sky), (s.fog = new THREE.FogExp2(sky.fogColor, 0.0058));
    if (gfx.envLighting) {
      const env = sky.bakeEnvironment(renderer);
      n.push(env), (s.environment = env.texture), (s.environmentIntensity = 0.6);
    }
  } else s.add(new THREE.Mesh(a, c)), (s.fog = new THREE.Fog("#c9c4aa", 40, 150));
  let l = gfx.physicalSky
    ? new THREE.HemisphereLight("#cfe0f0", "#5a5040", 0.25)
    : new THREE.HemisphereLight("#e4e8d8", "#5a5040", 1.5);
  s.add(l);
  let h = gfx.physicalSky ? new THREE.DirectionalLight("#ffe5c2", 4.3) : new THREE.DirectionalLight("#fff1d6", 2.4);
  h.position.copy(sunOffset), (h.castShadow = !0), h.shadow.mapSize.set(gfx.shadowMapSize, gfx.shadowMapSize);
  let u = h.shadow.camera;
  (u.left = -26),
    (u.right = 26),
    (u.top = 28),
    (u.bottom = -28),
    (u.near = 1),
    (u.far = 80),
    (h.shadow.bias = gfx.shadowMapSize >= 4096 ? -2.5e-4 : -6e-4),
    (h.shadow.normalBias = 0.03),
    s.add(h),
    s.add(h.target);
  let d = i(groundTex(t)),
    f = new THREE.Mesh(i(new THREE.PlaneGeometry(300, 300, 1, 1)), i(new THREE.MeshStandardMaterial({ map: d, roughness: 1, metalness: 0 })));
  d.repeat.set(60, 60), (f.rotation.x = -Math.PI / 2), (f.receiveShadow = !0), s.add(f);
  let ground = null;
  if (hi) {
    ground = createGroundMaterial(gfx, { seed: e, reflection: pipe.reflection });
    ground.textures.forEach((tx) => n.push(tx)), (f.material = i(ground.material));
    pipe.reflection && pipe.reflection.hide.push(f);
  }
  let g = i(
      noiseTex("#8a7a55", 40, t, 128, (O, Q, Y) => {
        O.strokeStyle = "rgba(60,50,30,0.35)";
        for (let T = 0; T < 12; T++)
          O.beginPath(), O.moveTo(0, (T * Y) / 12), O.lineTo(Q, (T * Y) / 12 + 3), O.stroke();
      }),
    ),
    x = i(new THREE.MeshStandardMaterial({ map: g, roughness: 1 })),
    m = i(
      noiseTex("#7a5a36", 30, t, 128, (O, Q, Y) => {
        (O.strokeStyle = "rgba(40,25,10,0.8)"), (O.lineWidth = 3), O.strokeRect(2, 2, Q - 4, Y - 4);
        for (let T = 1; T < 4; T++)
          O.beginPath(), O.moveTo(0, (T * Y) / 4), O.lineTo(Q, (T * Y) / 4), O.stroke();
        O.beginPath(), O.moveTo(4, 4), O.lineTo(Q - 4, Y - 4), O.stroke();
      }),
    ),
    p = i(new THREE.MeshStandardMaterial({ map: m, roughness: 0.9 })),
    y = i(
      noiseTex("#8b867a", 36, t, 128, (O, Q, Y) => {
        (O.strokeStyle = "rgba(50,45,40,0.6)"), (O.lineWidth = 2);
        for (let T = 0; T < 8; T++) {
          let me = (T * Y) / 8;
          O.beginPath(), O.moveTo(0, me), O.lineTo(Q, me), O.stroke();
          for (let ie = 0; ie < 4; ie++) {
            let ye = ((ie + (T % 2) * 0.5) * Q) / 4;
            O.beginPath(), O.moveTo(ye, me), O.lineTo(ye, me + Y / 8), O.stroke();
          }
        }
      }),
    ),
    v = i(new THREE.MeshStandardMaterial({ map: y, roughness: 0.95 })),
    S = i(new THREE.MeshStandardMaterial({ color: "#77736a", roughness: 0.95, flatShading: !0 })),
    b = i(new THREE.MeshStandardMaterial({ color: "#3b3a36", roughness: 0.6, metalness: 0.6 })),
    C = i(new THREE.MeshStandardMaterial({ color: "#4a3a2a", roughness: 1 })),
    A = i(new THREE.MeshStandardMaterial({ color: "#34452c", roughness: 0.95, flatShading: !0 })),
    L = i(
      new THREE.MeshBasicMaterial({
        map: i(
          canvasTex(128, 128, (O) => {
            let Q = O.createRadialGradient(64, 64, 8, 64, 64, 62);
            Q.addColorStop(0, "rgba(25,20,14,0.85)"),
              Q.addColorStop(0.6, "rgba(45,38,26,0.5)"),
              Q.addColorStop(1, "rgba(45,38,26,0)"),
              (O.fillStyle = Q),
              O.fillRect(0, 0, 128, 128);
          }),
        ),
        transparent: !0,
        depthWrite: !1,
        polygonOffset: !0,
        polygonOffsetFactor: -2,
      }),
    ),
    q = new Map(),
    _ = new THREE.Matrix4(),
    w = (O, Q, Y, T = !0) => {
      let me = Q.uuid + (T ? "s" : "");
      q.has(me) || q.set(me, { mat: Q, shadow: T, geos: [] });
      let ie = O.index ? O.toNonIndexed() : O;
      ie !== O && O.dispose(), ie.applyMatrix4(Y);
      Q.userData.worldUV && boxProjectUVs(ie, Q.userData.worldUV);
      q.get(me).geos.push(ie);
    },
    B = (O, Q, Y, T, me, ie = 0, ye = !0) => {
      _.compose(new THREE.Vector3(Y, T, me), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ie), new THREE.Vector3(1, 1, 1)),
        w(O, Q, _, ye);
    },
    k = (O, Q, Y, T, me, ie = {}) =>
      r.push({ minX: O - Y, maxX: O + Y, minZ: Q - T, maxZ: Q + T, h: me, ...ie }),
    W = i(hi ? detailedSandbag(gfx.texSize >= 1024 ? 24 : 16, gfx.texSize >= 1024 ? 14 : 10) : new THREE.SphereGeometry(0.5, 10, 6));
  W.scale(0.56, 0.3, 0.32);
  let ne = [];
  function V(O, Q, Y, T) {
    let ie = Math.max(2, Math.round(Y / 0.52));
    for (let ye = 0; ye < 4; ye++)
      for (let de = 0; de < ie - (ye % 2); de++) {
        let Be = (de + (ye % 2) * 0.5 + 0.5) / ie - 0.5,
          Ne = new THREE.Matrix4(),
          R = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(0, (T ? Math.PI / 2 : 0) + (t() - 0.5) * 0.12, (t() - 0.5) * 0.06),
          ),
          M = T
            ? new THREE.Vector3(O + (t() - 0.5) * 0.04, 0.15 + ye * 0.29, Q + Be * Y)
            : new THREE.Vector3(O + Be * Y, 0.15 + ye * 0.29, Q + (t() - 0.5) * 0.04);
        Ne.compose(M, R, new THREE.Vector3(1, 1, 1)), ne.push(Ne);
        let z = M.clone();
        T ? (z.x += 0.3) : (z.z += 0.3), ye < 3 && ne.push(new THREE.Matrix4().compose(z, R, new THREE.Vector3(1, 1, 1)));
      }
    T ? k(O + 0.15, Q, 0.38, Y / 2, 1.2) : k(O, Q + 0.15, Y / 2, 0.38, 1.2);
  }
  function ae(O, Q, Y, T) {
    B(new THREE.BoxGeometry(Y, Y, Y), p, O, Y / 2, Q, 0);
    let me = Y;
    T &&
      (B(
        new THREE.BoxGeometry(Y * 0.8, Y * 0.8, Y * 0.8),
        p,
        O + (t() - 0.5) * 0.15,
        Y + Y * 0.4,
        Q + (t() - 0.5) * 0.15,
        (t() - 0.5) * 0.5,
      ),
      (me = Y * 1.8)),
      k(O, Q, Y / 2, Y / 2, me);
  }
  function K(O, Q, Y, T) {
    let me = Math.max(3, Math.round(Y / 0.7));
    for (let ie = 0; ie < me; ie++) {
      let ye = (ie + 0.5) / me - 0.5,
        de = 1.5 + t() * 1.3 - (ie === 0 || ie === me - 1 ? 0.6 : 0),
        Be = Y / me + 0.02,
        Ne = T ? new THREE.BoxGeometry(0.5, de, Be) : new THREE.BoxGeometry(Be, de, 0.5);
      B(Ne, v, T ? O : O + ye * Y, de / 2, T ? Q + ye * Y : Q);
    }
    for (let ie = 0; ie < 5; ie++) {
      let ye = 0.15 + t() * 0.2;
      B(
        new THREE.DodecahedronGeometry(ye, 0),
        v,
        O + (T ? (t() - 0.5) * 1.6 : (t() - 0.5) * Y),
        ye * 0.6,
        Q + (T ? (t() - 0.5) * Y : (t() - 0.5) * 1.6),
        t() * 3,
      );
    }
    T ? k(O, Q, 0.25, Y / 2, 1.8) : k(O, Q, Y / 2, 0.25, 1.8);
  }
  function xe(O, Q, Y) {
    let T = new THREE.IcosahedronGeometry(Y, 1),
      me = T.attributes.position,
      ie = new Map();
    for (let ye = 0; ye < me.count; ye++) {
      let de = `${me.getX(ye).toFixed(3)},${me.getY(ye).toFixed(3)},${me.getZ(ye).toFixed(3)}`;
      ie.has(de) || ie.set(de, 0.75 + t() * 0.45);
      let Be = ie.get(de);
      me.setXYZ(ye, me.getX(ye) * Be, me.getY(ye) * Be * 0.75, me.getZ(ye) * Be);
    }
    T.computeVertexNormals();
    hi && (T.dispose(), (T = detailedRock(Y, (O * 1000 + Q * 37) | 0, gfx.texSize >= 1024 ? 4 : 3)));
    B(T, S, O, Y * 0.35, Q, t() * 6),
      o.push({ x: O, z: Q, r: Y * 0.85, h: Y * 1.05 });
  }
  function Me(O, Q) {
    let Y = new THREE.Object3D();
    Y.position.set(O, 0.5, Q), (Y.rotation.y = t() * 3), Y.updateMatrixWorld();
    let T = [
      [0.95, 0, 0],
      [0, 0, 0.95],
      [-0.6, Math.PI / 4, -0.6],
    ];
    for (let [me, ie, ye] of T) {
      let de = new THREE.Object3D();
      de.rotation.set(me, ie, ye),
        Y.add(de),
        de.updateMatrixWorld(),
        w(new THREE.BoxGeometry(0.12, 1.5, 0.12), b, de.matrixWorld);
    }
    o.push({ x: O, z: Q, r: 0.55, h: 1, bullets: !1 });
  }
  function fe(O, Q, Y, T = !0) {
    if (hi) {
      const rot = t() * 3;
      t(), t();
      const pine = detailedPine(Y, (O * 917 + Q * 131) | 0, T ? 7 : 5);
      B(pine.trunk, C, O, 0, Q, rot, T);
      pine.foliage.forEach((g) => B(g, A, O, 0, Q, rot, T));
      T && o.push({ x: O, z: Q, r: 0.25 * Y, h: 8 });
      return;
    }
    B(new THREE.CylinderGeometry(0.12 * Y, 0.2 * Y, 2.2 * Y, 7), C, O, 1.1 * Y, Q, 0, T);
    for (let me = 0; me < 3; me++) {
      let ie = (1.5 - me * 0.35) * Y;
      B(new THREE.ConeGeometry(ie, 2.2 * Y, 8), A, O, (2.2 + me * 1.2) * Y, Q, t() * 3, T);
    }
    T && o.push({ x: O, z: Q, r: 0.25 * Y, h: 8 });
  }
  function Ke(O, Q, Y) {
    let T = new THREE.PlaneGeometry(Y * 2, Y * 2);
    T.rotateZ(t() * 6), T.rotateX(-Math.PI / 2), w(T, L, _.makeTranslation(O, 0.01, Q), !1);
  }
  if (hi) {
    const ps = Math.min(512, Math.max(256, gfx.texSize / 2)),
      tex = (kind, rep = 1, size = ps) => {
        const tx = pbrTextures(kind, size, rep);
        return Object.values(tx).forEach((v) => v && n.push(v)), tx;
      },
      M = (o) => i(gfx.physicalMaterials && o.clearcoat ? new THREE.MeshPhysicalMaterial(o) : new THREE.MeshStandardMaterial(o));
    x = M({ ...tex("burlap", 2), roughness: 1, color: "#d9d2bf" });
    p = M({ ...tex("crate"), roughness: 1 });
    v = M({ ...tex("bricks"), roughness: 1 });
    v.userData.worldUV = 0.5;
    S = M({ ...tex("rock"), roughness: 1 });
    S.userData.worldUV = 0.45;
    b = M({ ...tex("steel"), roughness: 1, metalness: 1 });
    b.userData.worldUV = 2.5;
    C = M({ ...tex("bark"), roughness: 1 });
    A = M({ ...tex("needles"), roughness: 1, side: THREE.DoubleSide, color: "#c8d8b8" });
    A.userData.worldUV = 0.9;
  }
  let qe = [11, -11];
  for (let O of qe) {
    let Q = Math.sign(O),
      Y = [-9 + t() * 2, -1.5 + t() * 3, 7 + t() * 2];
    Y.forEach((T, me) => V(T, O + (t() - 0.5) * 1.5 - Q * (me === 1 ? 1 : 0), 2.6 + t() * 1.2, !1)),
      ae(Y[0] + 3.2 + t(), O - Q * 2, 1.1, t() < 0.5),
      ae(Y[2] - 3.4 - t(), O - Q * 2.3, 1.1, t() < 0.5);
  }
  [
    () => K(-6 + t() * 2, -2 + t() * 4, 3.5 + t() * 1.5, !1),
    () => K(6 + t() * 2, -2 + t() * 4, 3 + t() * 2, t() < 0.5),
    () => xe(-1 + t() * 2, -4 + t() * 1.5, 0.9 + t() * 0.4),
    () => xe(t() * 2 - 1, 3.5 + t() * 1.5, 0.8 + t() * 0.4),
    () => ae(-12 + t() * 1.5, t() * 4 - 2, 1.2, !0),
    () => ae(12 - t() * 1.5, t() * 4 - 2, 1.2, !0),
  ].forEach((O) => O());
  for (let O = 0; O < 5; O++) Me(-13 + O * 6.5 + (t() - 0.5) * 2, (t() < 0.5 ? -1 : 1) * (6 + t() * 1.5));
  for (let O = 0; O < 4; O++)
    xe((t() < 0.5 ? -1 : 1) * (13.5 + t() * 1.5), (t() - 0.5) * 30, 0.6 + t() * 0.5);
  for (let O = 0; O < 10; O++) Ke((t() - 0.5) * 28, (t() - 0.5) * 30, 1 + t() * 1.6);
  for (let O = 0; O < 6; O++)
    fe((O % 2 ? -1 : 1) * (14.3 + t() * 1), -16 + O * 6.5 + t() * 2, 0.9 + t() * 0.4);
  for (let O = 0; O < 70; O++) {
    let Q = t() * Math.PI * 2,
      Y = 30 + t() * 45;
    fe(Math.cos(Q) * Y, Math.sin(Q) * Y * 1.2, 1 + t() * 0.8, !1);
  }
  let oe = i(new THREE.MeshStandardMaterial({ color: "#56583e", roughness: 1, flatShading: !0 }));
  if (hi) {
    const tx = pbrTextures("ground", 512, 1);
    Object.values(tx).forEach((v) => v && n.push(v));
    oe = i(new THREE.MeshStandardMaterial({ ...tx, roughness: 1, color: "#58663c" }));
    oe.userData.worldUV = 0.12;
  }
  for (let O = 0; O < 14; O++) {
    let Q = (O / 14) * Math.PI * 2 + t() * 0.3,
      Y = 110 + t() * 40,
      T = 25 + t() * 30,
      me = new THREE.IcosahedronGeometry(T, 1);
    hi && (me.dispose(), (me = detailedRock(T, O * 71 + 5, 3)));
    me.scale(1, 0.25 + t() * 0.2, 1),
      w(me, oe, _.makeTranslation(Math.cos(Q) * Y, -T * 0.05, Math.sin(Q) * Y), !1);
  }
  if (ne.length) {
    let O = new THREE.InstancedMesh(W, x, ne.length);
    ne.forEach((Q, Y) => O.setMatrixAt(Y, Q)), (O.castShadow = !0), (O.receiveShadow = !0), s.add(O);
  }
  let Te = [],
    X = i(new THREE.CylinderGeometry(0.04, 0.05, 1.2, 5)),
    ve = [
      [ARENA.minX - 0.4, ARENA.minZ - 0.4],
      [ARENA.maxX + 0.4, ARENA.minZ - 0.4],
      [ARENA.maxX + 0.4, ARENA.maxZ + 0.4],
      [ARENA.minX - 0.4, ARENA.maxZ + 0.4],
    ];
  for (let O = 0; O < 4; O++) {
    let [Q, Y] = ve[O],
      [T, me] = ve[(O + 1) % 4],
      ie = Math.hypot(T - Q, me - Y),
      ye = Math.ceil(ie / 3);
    for (let de = 0; de <= ye; de++) {
      let Be = de / ye;
      if ((B(X.clone(), p, Q + (T - Q) * Be, 0.6, Y + (me - Y) * Be), de < ye))
        for (let Ne of [0.35, 0.7, 1.05]) {
          let R = (de + 1) / ye;
          Te.push(
            Q + (T - Q) * Be,
            Ne,
            Y + (me - Y) * Be,
            Q + (T - Q) * R,
            Ne + (t() - 0.5) * 0.08,
            Y + (me - Y) * R,
          );
        }
    }
  }
  let pe = i(new THREE.BufferGeometry());
  pe.setAttribute("position", new THREE.Float32BufferAttribute(Te, 3)), s.add(new THREE.LineSegments(pe, i(new THREE.LineBasicMaterial({ color: "#2a2722" }))));
  for (let { mat: O, shadow: Q, geos: Y } of q.values()) {
    let T = i(mergeGeometries(Y));
    Y.forEach((ie) => ie.dispose());
    let me = new THREE.Mesh(T, O);
    (me.castShadow = Q), (me.receiveShadow = !0), s.add(me);
  }
  let grass = null;
  if (gfx.grass) {
    grass = createGrass({ count: gfx.grass, world: { boxes: r, circles: o }, seed: e ^ 0x51ed, wetAt: ground && ground.wetAt });
    s.add(grass.mesh), n.push(grass);
    pipe.reflection && pipe.reflection.hide.push(grass.mesh);
  }
  return {
    boxes: r,
    circles: o,
    sun: h,
    sunOffset,
    update(time) {
      sky && sky.update(time), ground && ground.update(time), grass && grass.update(time);
    },
    dispose() {
      n.forEach((O) => O.dispose && O.dispose());
    },
  };
}
function rayBox(s, e, t) {
  let n = 0,
    i = 1,
    r = [t.minX, 0, t.minZ],
    o = [t.maxX, t.h, t.maxZ],
    a = [s.x, s.y, s.z],
    c = [e.x, e.y, e.z];
  for (let l = 0; l < 3; l++)
    if (Math.abs(c[l]) < 1e-9) {
      if (a[l] < r[l] || a[l] > o[l]) return null;
    } else {
      let h = (r[l] - a[l]) / c[l],
        u = (o[l] - a[l]) / c[l];
      if ((h > u && ([h, u] = [u, h]), (n = Math.max(n, h)), (i = Math.min(i, u)), n > i)) return null;
    }
  return n;
}
function rayCylinder(s, e, t, n, i, r, o) {
  let a = s.x - t,
    c = s.z - n,
    l = e.x * e.x + e.z * e.z,
    h = a * a + c * c - i * i,
    u;
  if (h <= 0) u = 0;
  else {
    if (l < 1e-9) return null;
    let f = 2 * (a * e.x + c * e.z),
      g = f * f - 4 * l * h;
    if (g < 0 || ((u = (-f - Math.sqrt(g)) / (2 * l)), u < 0 || u > 1)) return null;
  }
  let d = s.y + e.y * u;
  return d < r || d > o ? null : u;
}
function raySphere(s, e, t, n) {
  let i = s.x - t.x,
    r = s.y - t.y,
    o = s.z - t.z,
    a = e.x * e.x + e.y * e.y + e.z * e.z,
    c = 2 * (i * e.x + r * e.y + o * e.z),
    l = i * i + r * r + o * o - n * n,
    h = c * c - 4 * a * l;
  if (h < 0) return null;
  let u = (-c - Math.sqrt(h)) / (2 * a);
  return u >= 0 && u <= 1 ? u : l < 0 ? 0 : null;
}
function collideWorld(s, e, t) {
  for (let n of t.boxes) {
    let i = Math.max(n.minX, Math.min(s.x, n.maxX)),
      r = Math.max(n.minZ, Math.min(s.z, n.maxZ)),
      o = s.x - i,
      a = s.z - r,
      c = o * o + a * a;
    if (c < e * e)
      if (c > 1e-8) {
        let l = Math.sqrt(c);
        (s.x = i + (o / l) * e), (s.z = r + (a / l) * e);
      } else {
        let l = [
          [s.x - n.minX + e, -1, 0],
          [n.maxX - s.x + e, 1, 0],
          [s.z - n.minZ + e, 0, -1],
          [n.maxZ - s.z + e, 0, 1],
        ].sort((h, u) => h[0] - u[0])[0];
        (s.x += l[1] * l[0]), (s.z += l[2] * l[0]);
      }
  }
  for (let n of t.circles) {
    let i = s.x - n.x,
      r = s.z - n.z,
      o = e + n.r,
      a = i * i + r * r;
    if (a < o * o && a > 1e-8) {
      let c = Math.sqrt(a);
      (s.x = n.x + (i / c) * o), (s.z = n.z + (r / c) * o);
    }
  }
}
var MONO = "'IBM Plex Mono', monospace",
  css = (s, e) => (Object.assign(s.style, e), s),
  el = (s, e = {}, t) => {
    let n = document.createElement("div");
    return css(n, e), t != null && (n.textContent = t), s && s.appendChild(n), n;
  };
function createHud(s, { enemyColor: e }) {
  let t = el(s, {
      position: "relative",
      width: "100%",
      height: "100%",
      overflow: "hidden",
      background: "#141a14",
      userSelect: "none",
      WebkitUserSelect: "none",
      touchAction: "none",
      fontFamily: MONO,
      color: "#e8e4d5",
    }),
    n = el(t, { position: "absolute", inset: "0", pointerEvents: "none" }),
    i = el(n, { position: "absolute", left: "50%", top: "50%", width: "0", height: "0" }),
    r = [0, 1, 2, 3].map((X) =>
      el(i, {
        position: "absolute",
        background: "rgba(232,228,213,0.9)",
        boxShadow: "0 0 2px rgba(0,0,0,0.8)",
        width: X < 2 ? "2px" : "9px",
        height: X < 2 ? "9px" : "2px",
      }),
    );
  el(i, {
    position: "absolute",
    left: "-1.5px",
    top: "-1.5px",
    width: "3px",
    height: "3px",
    borderRadius: "50%",
    background: "#e8542a",
  });
  let o = (X) => {
    (r[0].style.left = "-1px"),
      (r[0].style.top = -X - 9 + "px"),
      (r[1].style.left = "-1px"),
      (r[1].style.top = X + "px"),
      (r[2].style.top = "-1px"),
      (r[2].style.left = -X - 9 + "px"),
      (r[3].style.top = "-1px"),
      (r[3].style.left = X + "px");
  };
  o(10);
  let a = el(n, {
      position: "absolute",
      left: "50%",
      top: "50%",
      width: "0",
      height: "0",
      opacity: "0",
      transition: "opacity 0.18s",
    }),
    c = [45, 135, 225, 315].map((X) =>
      el(a, {
        position: "absolute",
        left: "-1px",
        top: "-14px",
        width: "2px",
        height: "7px",
        background: "#fff",
        transformOrigin: "1px 14px",
        transform: `rotate(${X}deg)`,
      }),
    ),
    l = 0,
    h = el(n, {
      position: "absolute",
      inset: "0",
      opacity: "0",
      background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(170,20,10,0.75) 100%)",
      transition: "opacity 0.35s",
    }),
    u = 0,
    d = el(n, {
      position: "absolute",
      inset: "0",
      opacity: "0",
      background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(120,10,5,0.5) 100%)",
    }),
    f = el(
      n,
      {
        position: "absolute",
        top: "14%",
        left: "50%",
        transform: "translateX(-50%)",
        fontSize: "12px",
        fontWeight: "600",
        letterSpacing: "0.08em",
        color: "#fff",
        background: "rgba(232,84,42,0.85)",
        padding: "5px 12px",
        borderRadius: "3px",
        display: "none",
        whiteSpace: "nowrap",
      },
      "\u26A0 MORTAR INBOUND \u2014 MOVE!",
    ),
    g = el(n, {
      position: "absolute",
      left: "12px",
      bottom: "12px",
      textShadow: "0 1px 3px rgba(0,0,0,0.9)",
    }),
    x = el(g, { fontSize: "10px", letterSpacing: "0.1em", color: "#c9973f" }),
    m = el(g, {
      fontSize: "22px",
      fontWeight: "600",
      fontFamily: "'Oswald', sans-serif",
      letterSpacing: "0.04em",
    }),
    p = el(g, {
      width: "90px",
      height: "3px",
      background: "rgba(0,0,0,0.5)",
      marginTop: "3px",
      display: "none",
    }),
    y = el(p, { height: "100%", width: "0%", background: "#e8542a" }),
    v = el(n, {
      position: "absolute",
      right: "12px",
      bottom: "14px",
      width: "120px",
      textAlign: "right",
      textShadow: "0 1px 3px rgba(0,0,0,0.9)",
    });
  el(v, { fontSize: "9px", color: "#c8c4b5", letterSpacing: "0.1em", marginBottom: "3px" }, "HEALTH");
  let S = el(v, { height: "8px", background: "rgba(0,0,0,0.5)", border: "1px solid #232f27" }),
    b = el(S, { height: "100%", width: "100%", background: "#c9973f", transition: "width 0.15s" }),
    C = el(n, {
      position: "absolute",
      left: "10px",
      top: "10px",
      display: "flex",
      flexDirection: "column",
      gap: "3px",
    }),
    A = document.createElement("canvas"),
    L = 84,
    q = 110;
  (A.width = L * 2),
    (A.height = q * 2),
    css(A, {
      position: "absolute",
      right: "10px",
      top: "10px",
      width: L + "px",
      height: q + "px",
      borderRadius: "4px",
      border: "1px solid rgba(232,228,213,0.25)",
      background: "rgba(10,15,12,0.55)",
    }),
    n.appendChild(A);
  let _ = A.getContext("2d"),
    w = el(
      n,
      {
        position: "absolute",
        left: "50%",
        top: "62%",
        transform: "translateX(-50%)",
        fontSize: "10px",
        letterSpacing: "0.08em",
        background: "rgba(10,15,12,0.75)",
        border: "1px solid #3d4a3f",
        padding: "6px 10px",
        borderRadius: "4px",
        whiteSpace: "nowrap",
        display: "none",
      },
      "CLICK TO AIM \xB7 ESC RELEASES THE MOUSE",
    ),
    B = el(
      n,
      {
        position: "absolute",
        inset: "0",
        background: "rgba(10,15,12,0.55)",
        display: "none",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Oswald', sans-serif",
        fontSize: "26px",
        fontWeight: "700",
        letterSpacing: "0.1em",
      },
      "PAUSED",
    ),
    k = el(
      t,
      {
        position: "absolute",
        inset: "0",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "11px",
        letterSpacing: "0.12em",
        color: "#8a9186",
        background: "#0f140f",
      },
      "DEPLOYING TROOPS\u2026",
    ),
    W = el(n, { position: "absolute", inset: "0", display: "none" }),
    ne = el(W, {
      position: "absolute",
      width: "84px",
      height: "84px",
      marginLeft: "-42px",
      marginTop: "-42px",
      borderRadius: "50%",
      border: "2px solid rgba(232,228,213,0.35)",
      display: "none",
    }),
    V = el(W, {
      position: "absolute",
      width: "34px",
      height: "34px",
      marginLeft: "-17px",
      marginTop: "-17px",
      borderRadius: "50%",
      background: "rgba(201,151,63,0.6)",
      display: "none",
    }),
    ae = el(
      W,
      {
        position: "absolute",
        left: "12px",
        bottom: "62px",
        fontSize: "9px",
        color: "rgba(232,228,213,0.6)",
        letterSpacing: "0.06em",
      },
      "LEFT: MOVE \xB7 RIGHT: LOOK",
    ),
    K = el(
      W,
      {
        position: "absolute",
        right: "16px",
        bottom: "48px",
        width: "68px",
        height: "68px",
        borderRadius: "50%",
        background: "rgba(232,84,42,0.55)",
        border: "2px solid rgba(255,255,255,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "11px",
        fontWeight: "600",
        letterSpacing: "0.06em",
      },
      "FIRE",
    ),
    xe = el(
      W,
      {
        position: "absolute",
        right: "94px",
        bottom: "62px",
        width: "46px",
        height: "46px",
        borderRadius: "50%",
        background: "rgba(10,15,12,0.5)",
        border: "2px solid rgba(232,228,213,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "9px",
        letterSpacing: "0.06em",
      },
      "AIM",
    ),
    Me = (X, ve, pe) => {
      if (W.style.display === "none") return !1;
      let O = X.getBoundingClientRect(),
        Q = O.left + O.width / 2,
        Y = O.top + O.height / 2;
      return Math.hypot(ve - Q, pe - Y) < O.width / 2 + 10;
    },
    fe = {},
    Ke = !1,
    qe = !1,
    j = !1,
    oe = () => {
      w.style.display = j && !Ke && !qe ? "block" : "none";
    };
  return {
    root: t,
    setLoading(X) {
      X ? ((k.textContent = X), (k.style.display = "flex")) : ((k.style.display = "none"), (j = !0), oe());
    },
    setLocked(X) {
      (Ke = X), oe();
    },
    setPaused(X) {
      (qe = X), (B.style.display = X ? "flex" : "none"), oe();
    },
    showTouch(X) {
      (W.style.display = X ? "block" : "none"), (v.style.bottom = X ? "124px" : "14px");
    },
    isFireButton: (X, ve) => Me(K, X, ve),
    isAimButton: (X, ve) => Me(xe, X, ve),
    stick(X) {
      if (!X) {
        ne.style.display = V.style.display = "none";
        return;
      }
      (ae.style.display = "none"),
        (ne.style.display = V.style.display = "block"),
        (ne.style.left = X.ox + "px"),
        (ne.style.top = X.oy + "px");
      let ve = X.x - X.ox,
        pe = X.y - X.oy,
        O = Math.hypot(ve, pe),
        Q = O > 42 ? 42 / O : 1;
      (V.style.left = X.ox + ve * Q + "px"), (V.style.top = X.oy + pe * Q + "px");
    },
    hitMarker(X, ve) {
      let pe = X ? "#e8542a" : ve ? "#ffd27a" : "#ffffff";
      c.forEach((O) => (O.style.background = pe)),
        (a.style.transition = "none"),
        (a.style.opacity = "1"),
        (l = X ? 0.35 : 0.12);
    },
    damage(X) {
      (u = Math.min(1, u + 0.35 + X)), (h.style.opacity = String(u));
    },
    danger(X) {
      fe.danger !== X && ((fe.danger = X), (f.style.display = X ? "block" : "none"));
    },
    feed(X, ve) {
      let pe = el(
        C,
        {
          fontSize: "9px",
          letterSpacing: "0.08em",
          background: "rgba(10,15,12,0.6)",
          borderLeft: `2px solid ${ve}`,
          padding: "2px 6px",
          transition: "opacity 0.5s",
        },
        X,
      );
      for (
        setTimeout(() => (pe.style.opacity = "0"), 2600), setTimeout(() => pe.remove(), 3200);
        C.children.length > 4;

      )
        C.firstChild.remove();
    },
    crosshair(X) {
      let ve = Math.round(Math.min(40, X));
      fe.gap !== ve && o((fe.gap = ve));
    },
    update(X) {
      l > 0 && ((l -= 1 / 60), l <= 0 && ((a.style.transition = "opacity 0.18s"), (a.style.opacity = "0"))),
        u > 0 && ((u = Math.max(0, u - 0.02)), (h.style.opacity = String(u)));
      let ve = Math.max(0, X.hp),
        pe = Math.round(ve * 100);
      fe.hp !== pe &&
        ((fe.hp = pe),
        (b.style.width = pe + "%"),
        (b.style.background = ve > 0.35 ? "#c9973f" : "#a6402f"),
        (d.style.opacity = X.alive && ve < 0.35 ? "1" : "0")),
        fe.weapon !== X.weapon && (x.textContent = fe.weapon = X.weapon);
      let O = X.reloading >= 0 ? "RELOADING" : `${X.ammo} / ${X.max}`;
      fe.ammo !== O &&
        ((m.textContent = fe.ammo = O),
        (m.style.color = X.reloading >= 0 ? "#e8542a" : X.ammo <= X.max * 0.2 ? "#e8a23a" : "#e8e4d5"),
        (m.style.fontSize = X.reloading >= 0 ? "15px" : "22px")),
        (p.style.display = X.reloading >= 0 ? "block" : "none"),
        X.reloading >= 0 && (y.style.width = Math.round(X.reloading * 100) + "%");
      let Q = X.alive ? "block" : "none";
      fe.cross !== Q && ((i.style.display = g.style.display = Q), (fe.cross = Q)),
        (xe.style.background = X.aiming ? "rgba(201,151,63,0.6)" : "rgba(10,15,12,0.5)");
    },
    minimap(X, ve, pe, O, Q) {
      let Y = (ie) => ((ie - ARENA.minX) / (ARENA.maxX - ARENA.minX)) * A.width,
        T = (ie) => ((ie - ARENA.minZ) / (ARENA.maxZ - ARENA.minZ)) * A.height,
        me = A.width / (ARENA.maxX - ARENA.minX);
      _.clearRect(0, 0, A.width, A.height),
        (_.fillStyle = "rgba(70,74,50,0.55)"),
        _.fillRect(0, 0, A.width, A.height),
        (_.fillStyle = "rgba(20,20,16,0.85)");
      for (let ie of Q.boxes)
        _.fillRect(Y(ie.minX), T(ie.minZ), (ie.maxX - ie.minX) * me, (ie.maxZ - ie.minZ) * me);
      for (let ie of Q.circles)
        _.beginPath(), _.arc(Y(ie.x), T(ie.z), Math.max(2, ie.r * me), 0, Math.PI * 2), _.fill();
      for (let ie of ve)
        (_.strokeStyle = "#e8542a"),
          (_.lineWidth = 2),
          _.beginPath(),
          _.arc(Y(ie.pos.x), T(ie.pos.z), 3.2 * me, 0, Math.PI * 2),
          _.stroke();
      for (let ie of X)
        ie.alive &&
          (ie.isPlayer ||
            ((_.fillStyle = ie.team === "enemy" ? e : "#c9973f"),
            _.beginPath(),
            _.arc(Y(ie.pos.x), T(ie.pos.z), 5, 0, Math.PI * 2),
            _.fill()));
      if (pe.alive) {
        let ie = Y(pe.pos.x),
          ye = T(pe.pos.z),
          de = Math.sin(O),
          Be = Math.cos(O);
        (_.fillStyle = "#fff"),
          _.beginPath(),
          _.moveTo(ie + de * 12, ye + Be * 12),
          _.lineTo(ie - Be * 7 - de * 5, ye + de * 7 - Be * 5),
          _.lineTo(ie + Be * 7 - de * 5, ye - de * 7 - Be * 5),
          _.closePath(),
          _.fill();
      }
    },
    dispose() {
      t.remove();
    },
  };
}
function createAudio() {
  let s = null,
    e = null,
    t = null,
    n = 0,
    i = 0;
  function r() {
    if (s) return s;
    let c = window.AudioContext || window.webkitAudioContext;
    if (!c) return null;
    (s = new c()), (t = s.createGain()), (t.gain.value = 0.35), t.connect(s.destination);
    let l = s.sampleRate;
    e = s.createBuffer(1, l, s.sampleRate);
    let h = e.getChannelData(0);
    for (let u = 0; u < l; u++) h[u] = Math.random() * 2 - 1;
    return s;
  }
  function o() {
    if (!s || s.state !== "running") return !1;
    let c = s.currentTime;
    return (n = Math.max(0, n - (c - i) * 20)), (i = c), n > 10 ? !1 : (n++, !0);
  }
  function a({ vol: c, dur: l, freq: h, q: u = 0.8, type: d = "lowpass", thump: f = 0, thumpF: g = 90 }) {
    let x = s.currentTime,
      m = s.createBufferSource();
    (m.buffer = e), (m.playbackRate.value = 0.8 + Math.random() * 0.4);
    let p = s.createBiquadFilter();
    (p.type = d), (p.frequency.value = h), (p.Q.value = u);
    let y = s.createGain();
    if (
      (y.gain.setValueAtTime(c, x),
      y.gain.exponentialRampToValueAtTime(8e-4, x + l),
      m.connect(p).connect(y).connect(t),
      m.start(x, Math.random() * 0.5, l + 0.05),
      f)
    ) {
      let v = s.createOscillator(),
        S = s.createGain();
      v.frequency.setValueAtTime(g, x),
        v.frequency.exponentialRampToValueAtTime(g * 0.4, x + l),
        S.gain.setValueAtTime(f * c, x),
        S.gain.exponentialRampToValueAtTime(8e-4, x + l),
        v.connect(S).connect(t),
        v.start(x),
        v.stop(x + l + 0.05);
    }
  }
  return {
    unlock() {
      let c = r();
      c && c.state === "suspended" && c.resume();
    },
    shot(c, l) {
      o() &&
        a({ vol: c * 0.9, dur: l ? 0.12 : 0.16, freq: l ? 2600 : 1800, thump: 0.8, thumpF: l ? 160 : 110 });
    },
    boom(c) {
      !s || s.state !== "running" || a({ vol: c * 1.4, dur: 1.2, freq: 380, thump: 1.2, thumpF: 60 });
    },
    hit() {
      o() && a({ vol: 0.25, dur: 0.05, freq: 3500, type: "highpass" });
    },
    whiz() {
      o() && a({ vol: 0.18, dur: 0.18, freq: 4200, type: "bandpass", q: 6 });
    },
    reload() {
      o() &&
        (a({ vol: 0.2, dur: 0.06, freq: 2500, type: "bandpass", q: 3 }),
        setTimeout(() => s && a({ vol: 0.22, dur: 0.07, freq: 1800, type: "bandpass", q: 3 }), 260));
    },
    dispose() {
      s && s.close(), (s = null);
    },
  };
}
var soldierPromise = null;
function loadSoldier() {
  return (
    soldierPromise ||
      ((soldierPromise = (async () => {
        let s,
          e = typeof window < "u" && window.__SUPREMACY_SOLDIER_GLB;
        if (e) {
          let n = atob(e),
            i = new Uint8Array(n.length);
          for (let r = 0; r < n.length; r++) i[r] = n.charCodeAt(r);
          s = i.buffer;
        } else s = await (await fetch("assets/soldier.glb")).arrayBuffer();
        let t = await new Promise((n, i) => new GLTFLoader().parse(s, "", n, i));
        return buildSoldierRig(t.scene);
      })()),
      soldierPromise.catch(() => (soldierPromise = null))),
    soldierPromise
  );
}
var BATTLE_TIME = 90,
  RUN_SPEED = 5.2,
  AI_SPEED = 3.4,
  BODY_RADIUS = 0.32,
  PLAYER_MIN_Z = -4,
  ENEMY_MAX_Z = -5,
  SQUAD_MIN_Z = 4,
  MORTAR_RADIUS = 3.2,
  MORTAR_FUSE = 1.6,
  WEAPONS = {
    rifle: { label: "RIFLE", max: 50, damage: 8, interval: 0.14, reload: 1.5, spread: 0.012, speed: 170 },
    handgun: { label: "HANDGUN", max: 12, damage: 20, interval: 0.3, reload: 0.9, spread: 0.006, speed: 150 },
  },
  xt = new THREE.Vector3(),
  Is = new THREE.Vector3(),
  fr = new THREE.Vector3(),
  Nx = new THREE.Quaternion(),
  Ux = new THREE.Vector3(0, 1, 0),
  rx = new THREE.Vector3(0, 0, 1),
  clamp = (s, e, t) => Math.max(e, Math.min(t, s)),
  wrapAngle = (s) => Math.atan2(Math.sin(s), Math.cos(s)),
  dirFromYaw = (s, e = new THREE.Vector3()) => e.set(Math.sin(s), 0, Math.cos(s));
function makeGunMats(gfx) {
  const mats = { vc: new THREE.MeshStandardMaterial({ vertexColors: !0, roughness: 0.55, metalness: 0.3 }) };
  if (gfx && gfx.detailModels) {
    const wt = pbrTextures("gunwood", 256, 1),
      mt = pbrTextures("steel", 256, 2);
    const woodOpts = { map: wt.map, normalMap: wt.normalMap, roughnessMap: wt.roughnessMap, roughness: 0.9, metalness: 0 };
    mats.wood = gfx.physicalMaterials
      ? new THREE.MeshPhysicalMaterial({ ...woodOpts, clearcoat: 0.45, clearcoatRoughness: 0.35 })
      : new THREE.MeshStandardMaterial(woodOpts);
    mats.metal = new THREE.MeshStandardMaterial({
      color: "#4a4d52",
      roughnessMap: mt.roughnessMap,
      normalMap: mt.normalMap,
      normalScale: new THREE.Vector2(0.3, 0.3),
      roughness: 0.85,
      metalness: 0.92,
    });
    mats.textures = [...Object.values(wt), ...Object.values(mt)].filter(Boolean);
  }
  return mats;
}

// Re-creates a soldier material as MeshPhysicalMaterial with cloth sheen /
// clear coats (ULTRA). Other levels just clone it.
function upgradeSoldierMaterial(gfx, part, src) {
  if (!gfx.physicalMaterials || !src.isMeshStandardMaterial) return src.clone();
  const m = new THREE.MeshPhysicalMaterial();
  THREE.MeshStandardMaterial.prototype.copy.call(m, src);
  m.defines = { STANDARD: "", PHYSICAL: "" };
  if (["tunic", "trousers", "canvas"].includes(part)) {
    m.sheen = 1;
    m.sheenRoughness = 0.7;
    m.sheenColor = new THREE.Color(0.32, 0.32, 0.28);
    m.roughness = Math.min(1, m.roughness + 0.04);
  } else if (part === "helmet") {
    m.clearcoat = 0.35;
    m.clearcoatRoughness = 0.5;
    m.metalness = 0.35;
  } else if (part === "skin") {
    m.sheen = 0.35;
    m.sheenRoughness = 0.45;
    m.sheenColor = new THREE.Color(0.55, 0.32, 0.26);
    m.roughness = 0.52;
    m.specularIntensity = 0.6;
  } else if (part === "boot" || part === "leather") {
    m.clearcoat = 0.3;
    m.clearcoatRoughness = 0.4;
  }
  return m;
}
var Yo = new THREE.Color("#5b3a1f"),
  pr = new THREE.Color("#2a2b2d");
function colorPart(s, e, t, n, i, r = 0) {
  let o = s.index ? s.toNonIndexed() : s;
  r && o.rotateX(r), o.translate(t, n, i);
  let a = o.attributes.position.count,
    c = new Float32Array(a * 3);
  for (let l = 0; l < a; l++) e.toArray(c, l * 3);
  return o.setAttribute("color", new THREE.BufferAttribute(c, 3)), o.deleteAttribute("uv"), o;
}
function assembleGun(s, e, t, n) {
  let i = mergeGeometries(s);
  s.forEach((a) => a.dispose());
  let r = new THREE.Group(),
    o = new THREE.Mesh(i, e.vc);
  return (
    (o.castShadow = !0),
    r.add(o),
    Object.values(t).forEach((a) => r.add(a)),
    (r.userData = { grips: t, offset: n }),
    r
  );
}
var Ls = (s, e, t) => {
  let n = new THREE.Object3D();
  return n.position.set(s, e, t), n;
};
function makeRifle(s) {
  let e = (t, n, i) => new THREE.BoxGeometry(t, n, i);
  return assembleGun(
    [
      colorPart(e(0.045, 0.11, 0.28), Yo, 0, -0.035, 0.14),
      colorPart(e(0.04, 0.06, 0.12), Yo, 0, -0.01, 0.31),
      colorPart(e(0.05, 0.065, 0.2), pr, 0, 0.012, 0.44),
      colorPart(e(0.05, 0.05, 0.3), Yo, 0, -0.002, 0.66),
      colorPart(e(0.032, 0.13, 0.055), pr, 0, -0.085, 0.44),
      colorPart(e(0.012, 0.03, 0.012), pr, 0, 0.048, 0.92),
      colorPart(new THREE.CylinderGeometry(0.011, 0.012, 0.44, 8), pr, 0, 0.018, 0.86, Math.PI / 2),
    ],
    s,
    { right: Ls(0, -0.04, 0.27), left: Ls(0.02, -0.05, 0.58), muzzle: Ls(0, 0.018, 1.09) },
    new THREE.Vector3(0, 0, -0.02),
  );
}
function makeHandgun(s) {
  return assembleGun(
    [
      colorPart(new THREE.BoxGeometry(0.032, 0.035, 0.19), pr, 0, 0.045, 0.07),
      colorPart(new THREE.BoxGeometry(0.03, 0.1, 0.045), Yo, 0, -0.01, 0, -0.25),
    ],
    s,
    { right: Ls(-0.025, -0.04, -0.04), left: Ls(0.035, -0.045, -0.02), muzzle: Ls(0, 0.045, 0.17) },
    new THREE.Vector3(0.1, -0.06, 0.36),
  );
}
function radialTex(s, e) {
  return canvasTex(64, 64, (t) => {
    let n = t.createRadialGradient(32, 32, 0, 32, 32, 31);
    n.addColorStop(0, s), n.addColorStop(1, e), (t.fillStyle = n), t.fillRect(0, 0, 64, 64);
  });
}
var Particles = class {
    constructor(e, t = 160) {
      (this.scene = e),
        (this.tex = {
          soft: radialTex("rgba(255,255,255,1)", "rgba(255,255,255,0)"),
          smoke: radialTex("rgba(200,200,200,0.7)", "rgba(200,200,200,0)"),
        }),
        (this.pool = []),
        (this.live = []),
        (this.boost = 1);
      for (let n = 0; n < t; n++) {
        let i = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.soft, transparent: !0, depthWrite: !1 }));
        (i.visible = !1), e.add(i), this.pool.push(i);
      }
    }
    spawn(e) {
      let t = this.pool.pop();
      if (!t) {
        let i = this.live.shift();
        if (!i) return;
        t = i.s;
      }
      let n = t.material;
      (n.map = e.smoke ? this.tex.smoke : this.tex.soft),
        (n.blending = e.additive ? THREE.AdditiveBlending : THREE.NormalBlending),
        n.color.set(e.color),
        e.additive && n.color.multiplyScalar(this.boost),
        (n.opacity = e.opacity ?? 1),
        (n.needsUpdate = !0),
        t.position.copy(e.pos),
        t.scale.setScalar(e.size),
        (t.visible = !0),
        this.live.push({
          s: t,
          vel: e.vel ? e.vel.clone() : new THREE.Vector3(),
          life: e.life,
          max: e.life,
          size: e.size,
          grow: e.grow ?? 0,
          grav: e.grav ?? 0,
          op: n.opacity,
          drag: e.drag ?? 0,
        });
    }
    update(e) {
      for (let t = this.live.length - 1; t >= 0; t--) {
        let n = this.live[t];
        if (((n.life -= e), n.life <= 0)) {
          (n.s.visible = !1), this.pool.push(n.s), this.live.splice(t, 1);
          continue;
        }
        (n.vel.y -= n.grav * e), n.vel.multiplyScalar(1 - n.drag * e), n.s.position.addScaledVector(n.vel, e);
        let i = n.life / n.max;
        (n.s.material.opacity = n.op * i), n.s.scale.setScalar(n.size + n.grow * (1 - i));
      }
    }
    dispose() {
      this.pool.concat(this.live.map((e) => e.s)).forEach((e) => e.material.dispose()),
        Object.values(this.tex).forEach((e) => e.dispose());
    }
  },
  Soldier = class {
    constructor(e, t) {
      (this.game = e),
        (this.team = t.team),
        (this.isPlayer = !!t.isPlayer),
        (this.hp = this.maxHp = t.hp),
        (this.pos = new THREE.Vector3(t.x, 0, t.z)),
        (this.vel = new THREE.Vector3()),
        (this.facing = t.facing),
        (this.pitch = 0),
        (this.aimYaw = 0),
        (this.walkPhase = Math.random() * 6),
        (this.moveAmount = 0),
        (this.localMove = new THREE.Vector2()),
        (this.alive = !0),
        (this.deathT = 0),
        (this.fallDir = Math.random() < 0.6 ? -1 : 1),
        (this.lastShot = Math.random() * 0.5),
        (this.recoil = 0),
        (this.hitKick = 0),
        (this.weapon = "rifle"),
        (this.id = t.id),
        Object.assign(this, t.ai || {}),
        (this.group = new THREE.Group()),
        (this.model = cloneSkinned(e.template)),
        (this.bones = {}),
        this.model.traverse((n) => {
          n.isBone && (this.bones[n.name] = n),
            n.isSkinnedMesh && (n.material = e.teamMaterial(this.team, n.name, n.material));
        }),
        this.group.add(this.model),
        (this.gunPivot = new THREE.Object3D()),
        this.gunPivot.position.set(-0.1, 1.42, 0.02),
        this.group.add(this.gunPivot),
        (this.guns = e.gunMats.wood
          ? { rifle: detailedRifle(e.gunMats), handgun: detailedHandgun(e.gunMats) }
          : { rifle: makeRifle(e.gunMats), handgun: makeHandgun(e.gunMats) });
      for (let n in this.guns) {
        let i = this.guns[n];
        i.position.copy(i.userData.offset), (i.visible = n === this.weapon), this.gunPivot.add(i);
      }
      (this.poleL = new THREE.Object3D()),
        (this.poleR = new THREE.Object3D()),
        this.group.add(this.poleL, this.poleR),
        this.isPlayer || this.makeHealthBar(),
        e.scene.add(this.group);
    }
    makeHealthBar() {
      let e = this.team === "player" ? "#c9973f" : this.game.enemyColor;
      this.bar = new THREE.Group();
      let t = new THREE.Mesh(this.game.barGeo, this.game.barBgMat),
        n = new THREE.Mesh(this.game.barGeo, this.game.barMat(e));
      t.scale.set(0.62, 0.075, 1),
        n.scale.set(0.58, 0.045, 1),
        (n.position.z = 0.001),
        this.bar.add(t, n),
        (this.barFill = n),
        (this.bar.renderOrder = 10),
        (this.bar.userData.noReflect = !0),
        this.game.scene.add(this.bar);
    }
    get gun() {
      return this.guns[this.weapon];
    }
    setWeapon(e) {
      this.weapon = e;
      for (let t in this.guns) this.guns[t].visible = t === e;
    }
    head(e = new THREE.Vector3()) {
      return e.set(this.pos.x, this.pos.y + 1.66, this.pos.z);
    }
    muzzle(e = new THREE.Vector3()) {
      return this.gun.userData.grips.muzzle.getWorldPosition(e);
    }
    aimAt(e) {
      xt.copy(e),
        this.group.worldToLocal(xt),
        xt.sub(this.gunPivot.position),
        this.weapon === "handgun" && xt.sub(this.gun.userData.offset);
      let t = Math.atan2(xt.x, xt.z),
        n = Math.atan2(xt.y, Math.hypot(xt.x, xt.z));
      (this.aimYaw = clamp(t, -0.5, 0.5)), (this.pitch = clamp(n, -0.9, 0.9));
    }
    damage(e, t) {
      return this.alive
        ? ((this.hp -= e), (this.hitKick = 1), this.hp <= 0 ? ((this.hp = 0), this.die(t), !0) : !1)
        : !1;
    }
    die(e) {
      if (((this.alive = !1), (this.deathT = 0), e)) {
        let n = dirFromYaw(this.facing, xt),
          i = Is.subVectors(this.pos, e);
        this.fallDir = n.dot(i) > 0 ? 1 : -1;
      }
      let t = this.gun;
      this.game.scene.attach(t),
        (t.userData.drop = { vy: 0.5, spin: (Math.random() - 0.5) * 6 }),
        this.game.droppedGuns.push(t),
        this.bar && (this.bar.visible = !1);
    }
    update(e, t, n) {
      let i = Math.hypot(this.vel.x, this.vel.z);
      if (
        ((this.moveAmount += (clamp(i / 4, 0, 1) - this.moveAmount) * Math.min(1, e * 10)),
        (this.walkPhase += (i * e * Math.PI) / 0.78),
        i > 0.1)
      ) {
        let v = dirFromYaw(this.facing, xt),
          S = this.vel.x / i,
          b = this.vel.z / i,
          C = S * v.x + b * v.z,
          A = S * v.z - b * v.x;
        this.localMove.set(A, C);
      }
      (this.recoil = Math.max(0, this.recoil - e * 9)), (this.hitKick = Math.max(0, this.hitKick - e * 6));
      let r = this.group;
      r.position.copy(this.pos), r.rotation.set(0, this.facing, 0);
      let o = this.bones;
      for (let v in o) o[v].quaternion.identity();
      let a = this.moveAmount,
        c = this.walkPhase,
        l = Math.sin(c),
        h = Math.cos(c),
        u = this.localMove.y,
        d = this.localMove.x,
        f = 0.55 * a;
      o.hips.position.set(0, 0.92 - 0.035 * a * (1 - Math.abs(h)) - 0.02, 0),
        o.thigh_L.rotation.set(-f * l * u - 0.12, 0, 0.05 + f * l * d * 0.6),
        o.thigh_R.rotation.set(f * l * u - 0.12, 0, -0.05 - f * l * d * 0.6),
        o.shin_L.rotation.set(0.2 + 0.85 * a * Math.max(0, h), 0, 0),
        o.shin_R.rotation.set(0.2 + 0.85 * a * Math.max(0, -h), 0, 0),
        o.foot_L.rotation.set(-0.08 - 0.25 * a * Math.max(0, h), 0, 0),
        o.foot_R.rotation.set(-0.08 - 0.25 * a * Math.max(0, -h), 0, 0);
      let g = this.weapon === "rifle",
        x = g ? -0.32 : 0,
        m = Math.sin(t * 1.7 + this.walkPhase * 0.01) * 0.015,
        p = this.alive ? this.pitch : 0;
      if (
        (o.spine.rotation.set(-p * 0.25 + 0.05 + this.hitKick * 0.15 + m, x * 0.5, l * 0.04 * a),
        o.chest.rotation.set(-p * 0.25 + m, x * 0.5 + this.aimYaw * 0.5, 0),
        o.neck.rotation.set(-p * 0.15, -x * 0.4 - this.aimYaw * 0.2, 0),
        o.head.rotation.set(-p * 0.2, -x * 0.6 - this.aimYaw * 0.2, 0),
        this.gunPivot.position.set(g ? -0.12 : -0.08, 1.41 + (o.hips.position.y - 0.92), g ? 0.02 : 0.04),
        this.gunPivot.rotation.set(-this.pitch, this.aimYaw, 0, "YXZ"),
        this.gun.position.copy(this.gun.userData.offset),
        (this.gun.position.z -= this.recoil * 0.05),
        (this.gun.rotation.x = -this.recoil * 0.08),
        !this.alive)
      ) {
        this.deathT += e;
        let v = Math.min(1, this.deathT / 0.75),
          S = v * v;
        r.rotation.set(this.fallDir * S * 1.48, this.facing, 0, "YXZ"),
          (r.position.y = S * 0.14),
          (o.shin_L.rotation.x += S * 0.5),
          (o.shin_R.rotation.x += S * 0.2),
          (o.thigh_L.rotation.x -= S * 0.3),
          (o.spine.rotation.x += -this.fallDir * S * 0.2),
          o.upperArm_L.rotation.set(0, 0, 0.4 * S),
          o.upperArm_R.rotation.set(-this.fallDir * 0.6 * S, 0, -0.5 * S),
          o.foreArm_R.rotation.set(-0.5 * S, 0, 0),
          r.updateMatrixWorld(!0);
        return;
      }
      r.updateMatrixWorld(!0);
      let y = this.gun.userData.grips;
      if (
        (this.poleR.position.set(-0.7, 0.7, g ? -0.1 : 0.1),
        this.poleL.position.set(0.55, 0.6, g ? 0.4 : 0.1),
        this.poleR.updateMatrixWorld(),
        this.poleL.updateMatrixWorld(),
        solveTwoBoneIK(
          o.upperArm_R,
          o.foreArm_R,
          o.hand_R,
          y.right.getWorldPosition(xt),
          this.poleR.getWorldPosition(Is),
        ),
        solveTwoBoneIK(o.upperArm_L, o.foreArm_L, o.hand_L, y.left.getWorldPosition(xt), this.poleL.getWorldPosition(Is)),
        o.hand_R.rotation.set(0.5, 0, -0.3),
        o.hand_L.rotation.set(0.3, 0, 0.6),
        o.hand_R.updateMatrixWorld(!0),
        o.hand_L.updateMatrixWorld(!0),
        this.bar)
      ) {
        this.bar.position.set(this.pos.x, this.pos.y + 2.05, this.pos.z),
          this.bar.quaternion.copy(n.quaternion);
        let v = clamp(this.hp / this.maxHp, 0, 1);
        (this.barFill.scale.x = 0.58 * v), (this.barFill.position.x = -0.29 * (1 - v));
      }
    }
    dispose() {
      this.game.scene.remove(this.group),
        this.bar && this.game.scene.remove(this.bar),
        Object.values(this.guns).forEach((e) => {
          e.parent && e.parent.remove(e), e.traverse((t) => t.isMesh && t.geometry.dispose());
        });
    }
  };
async function createBattle(s, e) {
  let t = {
      difficulty: 1,
      enemyColor: "#a6402f",
      playerColor: "#c9973f",
      playerHp: 30,
      enemyHp: 31.5,
      seed: 1,
      onStats() {},
      onPlayerDied() {},
      onOver() {},
      ...e,
    },
    gfx = resolveQuality(t.quality),
    n = { scene: new THREE.Scene(), enemyColor: t.enemyColor, droppedGuns: [], gunMats: makeGunMats(gfx), disposed: !1 },
    i = createHud(s, { enemyColor: t.enemyColor }),
    r = createAudio(),
    o;
  try {
    o = await loadSoldier();
  } catch (P) {
    throw (i.setLoading("COULD NOT LOAD SOLDIER MODEL"), P);
  }
  if (e.isCancelled && e.isCancelled()) return i.dispose(), null;
  if (((n.template = o), gfx.texSize)) {
    // Procedural PBR textures take a moment the first time; let the HUD paint.
    i.setLoading("BUILDING " + gfx.level.toUpperCase() + " GRAPHICS");
    await new Promise((P) => setTimeout(P, 50));
    if (e.isCancelled && e.isCancelled()) return i.dispose(), null;
  }
  const pipe = createPipeline(gfx);
  let a = pipe.renderer;
  let c = a.domElement;
  (c.style.cssText = "display:block;width:100%;height:100%;touch-action:none;cursor:crosshair;outline:none"),
    (c.tabIndex = 0),
    i.root.insertBefore(c, i.root.firstChild);
  let l = new THREE.PerspectiveCamera(70, 1, 0.05, 500),
    h = n.scene,
    u = buildWorld(h, t.seed, gfx, pipe),
    _loaded = i.setLoading(null),
    d = new Map(),
    f = { player: new THREE.Color("#efe2c2"), enemy: new THREE.Color(t.enemyColor).lerp(new THREE.Color("#ffffff"), 0.25) };
  pipe.attach(h, l);
  (n.teamMaterial = (P, F, Z) => {
    const team = ["tunic", "trousers", "helmet"].includes(F);
    if (!team && !gfx.physicalMaterials) return Z;
    let $ = (team ? P : "") + F;
    if (!d.has($)) {
      let ce = upgradeSoldierMaterial(gfx, F, Z);
      if (!team) return d.set($, ce), ce;
      F === "helmet"
        ? P === "enemy" && ce.color.copy(new THREE.Color(t.enemyColor).multiplyScalar(0.35))
        : ce.color.copy(f[P]),
        d.set($, ce);
    }
    return d.get($);
  }),
    (n.barGeo = new THREE.PlaneGeometry(1, 1)),
    (n.barBgMat = new THREE.MeshBasicMaterial({ color: "#000000", transparent: !0, opacity: 0.5, depthTest: !1 }));
  let g = {};
  n.barMat = (P) => g[P] || (g[P] = new THREE.MeshBasicMaterial({ color: P, depthTest: !1 }));
  let x = new Particles(h);
  gfx.post && (x.boost = 3.5);
  // Pooled muzzle-flash lights (fixed count so shaders never recompile).
  const flashLights = gfx.dynamicLights
    ? [0, 1].map(() => {
        const pl = new THREE.PointLight("#ffc27a", 0, 10, 2);
        return h.add(pl), pl;
      })
    : [];
  let flashIdx = 0;
  let m = t.difficulty,
    p = [],
    y = new Soldier(n, { team: "player", isPlayer: !0, hp: t.playerHp, x: 0, z: 17, facing: Math.PI, id: "p0" });
  p.push(y),
    [
      [-5.5, 18, 0.6],
      [5.5, 18, 0.7],
      [-9.5, 16.5, 0.5],
      [9.5, 16.5, 0.8],
    ].forEach(([P, F, Z], $) =>
      p.push(
        new Soldier(n, {
          team: "player",
          hp: t.playerHp,
          x: P,
          z: F,
          facing: Math.PI,
          id: "p" + ($ + 1),
          ai: { homeX: P, homeZ: F - 3, wander: Z, think: 0, offset: 0, blocked: 0 },
        }),
      ),
    ),
    [-9, -4.5, 0, 4.5, 9].forEach((P, F) =>
      p.push(
        new Soldier(n, {
          team: "enemy",
          hp: t.enemyHp,
          x: P,
          z: -15,
          facing: 0,
          id: "e" + F,
          ai: {
            homeX: P,
            homeZ: -15 + Math.min(4, m * 0.5),
            wander: 0.6 + Math.random() * 0.4,
            phase: Math.random() * 6,
            think: Math.random(),
            offset: 0,
            blocked: 0,
          },
        }),
      ),
    );
  let v = p.filter((P) => P.team === "player"),
    S = p.filter((P) => P.team === "enemy"),
    b = {
      time: BATTLE_TIME,
      over: !1,
      paused: !1,
      yaw: Math.PI,
      pitch: 0.05,
      aiming: !1,
      firing: !1,
      reloading: !1,
      reloadTimer: 0,
      ammo: { rifle: WEAPONS.rifle.max, handgun: WEAPONS.handgun.max },
      bloom: 0,
      shake: 0,
      nextPlayerMortar: 6 + Math.random() * 4,
      nextEnemyMortar: 5 + Math.random() * 4,
      mortars: [],
      bullets: [],
      statsT: 0,
      deadNotified: !1,
      spectate: 0,
      elapsed: 0,
    },
    C = {},
    A = { move: null, look: null, fire: null, used: !1 },
    L = new THREE.BoxGeometry(0.025, 0.025, 1),
    q = {
      player: new THREE.MeshBasicMaterial({ color: "#fff2c0", transparent: !0, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: !1 }),
      enemy: new THREE.MeshBasicMaterial({ color: "#ff7040", transparent: !0, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: !1 }),
    },
    _ = [];
  gfx.post && (q.player.color.multiplyScalar(4), q.enemy.color.multiplyScalar(4));
  function w(P, F, Z) {
    if (flashLights.length) {
      const pl = P.isPlayer ? flashLights[0] : flashLights[1 + (flashIdx++ % (flashLights.length - 1))];
      (P.isPlayer || pl.intensity < 1) && (P.muzzle(pl.position), (pl.intensity = P.isPlayer ? 5 : 3.5));
    }
    let $ = _.pop() || new THREE.Mesh(L, q.player);
    ($.material = q[P.team]), ($.visible = !0), h.add($);
    let ce = P.muzzle(new THREE.Vector3());
    b.bullets.push({
      pos: ce,
      vel: F.clone().multiplyScalar(Z.speed),
      team: P.team,
      dmg: Z.damage,
      life: 1.2,
      mesh: $,
      from: P,
      travelled: 0,
    }),
      (P.recoil = 1),
      x.spawn({ pos: ce, size: 0.22, life: 0.05, color: "#ffd080", additive: !0 }),
      x.spawn({
        pos: ce.clone().addScaledVector(F, 0.1),
        size: 0.3,
        life: 0.4,
        color: "#bbbbbb",
        smoke: !0,
        opacity: 0.25,
        grow: 0.4,
        vel: new THREE.Vector3(0, 0.4, 0),
      });
    let le = P.pos.distanceTo(b.listener || y.pos);
    r.shot(P.isPlayer ? 1 : clamp(1 - le / 60, 0.08, 0.6), P.weapon === "handgun");
  }
  function B(P, F, Z, $ = !0) {
    let ce = { t: 1 / 0 };
    for (let le of u.boxes) {
      let Ue = rayBox(P, F, le);
      Ue !== null && Ue < ce.t && (ce = { t: Ue, kind: "world" });
    }
    for (let le of u.circles) {
      if ($ && le.bullets === !1) continue;
      let Ue = rayCylinder(P, F, le.x, le.z, le.r, 0, le.h);
      Ue !== null && Ue < ce.t && (ce = { t: Ue, kind: "world" });
    }
    if (F.y < 0) {
      let le = -P.y / F.y;
      le >= 0 && le <= 1 && le < ce.t && (ce = { t: le, kind: "ground" });
    }
    if (Z)
      for (let le of p) {
        if (!le.alive || le.team !== Z) continue;
        let Ue = raySphere(P, F, le.head(fr), 0.14);
        Ue !== null && Ue < ce.t && (ce = { t: Ue, kind: "soldier", s: le, head: !0 });
        let ht = rayCylinder(P, F, le.pos.x, le.pos.z, 0.27, 0, 1.52);
        ht !== null && ht < ce.t && (ce = { t: ht, kind: "soldier", s: le, head: !1 });
      }
    return ce;
  }
  function k(P, F) {
    return xt.subVectors(F, P), B(P, xt, null).t > 0.98;
  }
  function W(P) {
    for (let F = b.bullets.length - 1; F >= 0; F--) {
      let Z = b.bullets[F];
      Z.life -= P;
      let $ = Is.copy(Z.vel).multiplyScalar(P),
        ce = B(Z.pos, $, Z.team === "player" ? "enemy" : "player"),
        le = Z.life <= 0;
      if (ce.t <= 1) {
        let Ue = Z.pos.clone().addScaledVector($, ce.t);
        if (ce.kind === "soldier") {
          let ht = ce.head ? Z.dmg * 2 : Z.dmg,
            ut = ce.s.damage(ht, Z.from.pos);
          for (let Mt = 0; Mt < 5; Mt++)
            x.spawn({
              pos: Ue,
              size: 0.08 + Math.random() * 0.08,
              life: 0.35,
              color: "#5a0d08",
              grav: 6,
              opacity: 0.9,
              vel: new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2),
            });
          Z.from.isPlayer && (i.hitMarker(ut, ce.head), r.hit()),
            ce.s.isPlayer && (i.damage(ht / t.playerHp), (b.shake = Math.max(b.shake, 0.25))),
            ut && ne(ce.s, Z.from);
        } else {
          let ht = ce.kind === "ground" ? 3 : 4;
          for (let ut = 0; ut < ht; ut++)
            x.spawn({
              pos: Ue,
              size: 0.12 + Math.random() * 0.12,
              life: 0.5,
              color: ce.kind === "ground" ? "#6b5d45" : "#9a917e",
              smoke: !0,
              opacity: 0.6,
              grow: 0.3,
              vel: new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random() * 1.5, (Math.random() - 0.5) * 1.5),
            });
          x.spawn({ pos: Ue, size: 0.07, life: 0.08, color: "#ffe0a0", additive: !0 });
        }
        le = !0;
      } else Z.pos.add($);
      if (!le && Z.team === "enemy" && y.alive && !Z.whizzed) {
        let Ue = y.head(fr);
        Z.pos.distanceToSquared(Ue) < 1.2 && ((Z.whizzed = !0), r.whiz());
      }
      if (le) (Z.mesh.visible = !1), h.remove(Z.mesh), _.push(Z.mesh), b.bullets.splice(F, 1);
      else {
        let Ue = Z.vel.length(),
          ht = Math.min(1.6, Ue * 0.012);
        Z.mesh.scale.set(1, 1, ht),
          Z.mesh.position.copy(Z.pos).addScaledVector(Z.vel, -ht / 2 / Ue),
          Z.mesh.quaternion.setFromUnitVectors(rx, xt.copy(Z.vel).divideScalar(Ue));
      }
    }
  }
  function ne(P, F) {
    P.isPlayer
      ? i.feed("YOU WERE KILLED", "#e8542a")
      : P.team === "enemy"
        ? i.feed(F && F.isPlayer ? "ENEMY KILLED" : "ENEMY DOWN", t.enemyColor)
        : i.feed("SQUADMATE DOWN", "#c9973f");
  }
  let V = new THREE.RingGeometry(MORTAR_RADIUS - 0.12, MORTAR_RADIUS, 48),
    ae = new THREE.CircleGeometry(MORTAR_RADIUS, 48),
    K = new THREE.MeshBasicMaterial({
      color: "#e8542a",
      transparent: !0,
      depthWrite: !1,
      polygonOffset: !0,
      polygonOffsetFactor: -4,
      depthTest: !gfx.grass, // keep the danger zone readable through grass
    }),
    xe = new THREE.CylinderGeometry(0.06, 0.03, 0.45, 8),
    Me = new THREE.MeshStandardMaterial({ color: "#2d2f2a", metalness: 0.5, roughness: 0.6 }),
    fe = canvasTex(128, 128, (P) => {
      let F = P.createRadialGradient(64, 64, 4, 64, 64, 62);
      F.addColorStop(0, "rgba(10,8,6,0.9)"),
        F.addColorStop(0.7, "rgba(20,16,10,0.55)"),
        F.addColorStop(1, "rgba(20,16,10,0)"),
        (P.fillStyle = F),
        P.fillRect(0, 0, 128, 128);
    }),
    Ke = new THREE.MeshBasicMaterial({ map: fe, transparent: !0, depthWrite: !1, polygonOffset: !0, polygonOffsetFactor: -3 }),
    qe = new THREE.PointLight("#ffb070", 0, 18, 1.5);
  h.add(qe);
  function j(P, F) {
    let Z = new THREE.Vector3(F.pos.x, 0, F.pos.z),
      $ = new THREE.Group(),
      ce = new THREE.Mesh(V, K.clone()),
      le = new THREE.Mesh(ae, K.clone());
    (le.material.opacity = 0.15),
      (ce.rotation.x = le.rotation.x = -Math.PI / 2),
      $.add(ce, le),
      $.position.set(Z.x, 0.03, Z.z);
    let Ue = new THREE.Mesh(xe, Me);
    (Ue.visible = !1),
      h.add($, Ue),
      b.mortars.push({ side: P, pos: Z, timer: MORTAR_FUSE, g: $, ring: ce, disc: le, shell: Ue });
  }
  function oe(P) {
    (P.side === "player" ? S : v).forEach((ce) => {
      ce.alive &&
        Math.hypot(ce.pos.x - P.pos.x, ce.pos.z - P.pos.z) < MORTAR_RADIUS &&
        ((ce.hp *= 0.25), (ce.hitKick = 1), ce.isPlayer && i.damage(0.6));
    });
    for (let ce = 0; ce < 14; ce++) {
      let le = Math.random() * Math.PI * 2,
        Ue = new THREE.Vector3(
          Math.cos(le) * (2 + Math.random() * 4),
          3 + Math.random() * 5,
          Math.sin(le) * (2 + Math.random() * 4),
        );
      x.spawn({
        pos: P.pos.clone().setY(0.6),
        size: 1.6 + Math.random() * 1.4,
        life: 0.5 + Math.random() * 0.25,
        color: ce % 3 ? "#ff9a3a" : "#ffd27a",
        additive: !0,
        vel: Ue.clone().multiplyScalar(0.6),
        drag: 3,
        grow: 2,
      }),
        x.spawn({
          pos: P.pos.clone().setY(0.8),
          size: 2 + Math.random() * 1.5,
          life: 2.2 + Math.random(),
          color: ce % 2 ? "#3d3a33" : "#5a5547",
          smoke: !0,
          opacity: 1,
          vel: Ue.multiplyScalar(0.4),
          drag: 1.2,
          grow: 4,
        });
    }
    for (let ce = 0; ce < 12; ce++)
      x.spawn({
        pos: P.pos.clone().setY(0.2),
        size: 0.12,
        life: 0.9,
        color: "#4a3f2e",
        grav: 14,
        vel: new THREE.Vector3((Math.random() - 0.5) * 10, 6 + Math.random() * 6, (Math.random() - 0.5) * 10),
      });
    qe.position.set(P.pos.x, 1.5, P.pos.z), (qe.intensity = 60);
    let Z = new THREE.Mesh(new THREE.PlaneGeometry(MORTAR_RADIUS * 1.5, MORTAR_RADIUS * 1.5), Ke);
    (Z.rotation.x = -Math.PI / 2),
      (Z.rotation.z = Math.random() * 6),
      Z.position.set(P.pos.x, 0.015, P.pos.z),
      h.add(Z),
      (n.scorches = (n.scorches || []).concat(Z));
    let $ = (b.listener || y.pos).distanceTo(P.pos);
    (b.shake = Math.max(b.shake, clamp(1.2 - $ / 20, 0, 1))), r.boom(clamp(1 - $ / 50, 0.15, 1));
  }
  function Te(P) {
    if (((b.nextPlayerMortar -= P), b.nextPlayerMortar <= 0)) {
      b.nextPlayerMortar = 6 + Math.random() * 5;
      let Z = S.filter(($) => $.alive);
      Z.length && j("player", Z[Math.floor(Math.random() * Z.length)]);
    }
    if (((b.nextEnemyMortar -= P), b.nextEnemyMortar <= 0)) {
      b.nextEnemyMortar = 5 + Math.random() * 5;
      let Z = v.filter(($) => $.alive);
      Z.length && j("enemy", Z[Math.floor(Math.random() * Z.length)]);
    }
    let F = !1;
    for (let Z = b.mortars.length - 1; Z >= 0; Z--) {
      let $ = b.mortars[Z];
      $.timer -= P;
      let ce = 0.55 + 0.45 * Math.sin(b.elapsed * 14);
      ($.ring.material.opacity = 0.5 + 0.5 * ce), ($.disc.material.opacity = 0.1 + 0.12 * ce);
      let le = 0.5;
      if ($.timer < le) {
        $.shell.visible = !0;
        let Ue = $.timer / le;
        $.shell.position.set($.pos.x + Ue * 3, Ue * 28, $.pos.z - Ue * 2),
          $.shell.lookAt($.pos),
          $.shell.rotateX(Math.PI / 2);
      }
      $.side === "enemy" &&
        y.alive &&
        Math.hypot(y.pos.x - $.pos.x, y.pos.z - $.pos.z) < MORTAR_RADIUS + 0.3 &&
        (F = !0),
        $.timer <= 0 &&
          (oe($),
          h.remove($.g, $.shell),
          $.ring.material.dispose(),
          $.disc.material.dispose(),
          b.mortars.splice(Z, 1));
    }
    i.danger(F), (qe.intensity = Math.max(0, qe.intensity - P * 220));
  }
  function X(P, F) {
    let Z = null,
      $ = 1 / 0;
    for (let ce of F) {
      if (!ce.alive) continue;
      let le = P.pos.distanceToSquared(ce.pos);
      le < $ && (($ = le), (Z = ce));
    }
    return Z;
  }
  let ve = new THREE.Vector3(),
    pe = new THREE.Vector3();
  function O(P, F) {
    let Z = P.team === "enemy" ? v : S;
    if (((P.think -= F), P.think <= 0 || !P.target || !P.target.alive)) {
      P.think = 0.4 + Math.random() * 0.4;
      let pt = null,
        Yt = 1 / 0;
      for (let rn of Z) {
        if (!rn.alive) continue;
        ve.set(P.pos.x, 1.5, P.pos.z), pe.set(rn.pos.x, 1.35, rn.pos.z);
        let gn = P.pos.distanceTo(rn.pos) + (k(ve, pe) ? 0 : 25) + Math.random() * 8;
        gn < Yt && ((Yt = gn), (pt = rn));
      }
      (P.target = pt),
        pt &&
          (ve.set(P.pos.x, 1.5, P.pos.z),
          pe.set(pt.pos.x, 1.35, pt.pos.z),
          (P.los = k(ve, pe)),
          (P.blocked = P.los ? 0 : P.blocked + 1),
          P.blocked >= 3 &&
            ((P.offset = (Math.random() < 0.5 ? -1 : 1) * (2.5 + Math.random() * 3)), (P.blocked = 0)));
    }
    let $ = P.target,
      ce = b.elapsed,
      le,
      Ue;
    P.team === "enemy"
      ? ((le = P.homeX + Math.sin(ce * 0.8 * P.wander + P.phase) * 3 + P.offset),
        (Ue = P.homeZ + Math.sin(ce * 0.5 + P.phase) * 1.6),
        $ && (le = le * 0.6 + $.pos.x * 0.4))
      : ((le = P.homeX + Math.sin(ce * P.wander + P.homeZ) * 3.5 + P.offset),
        (Ue = P.homeZ + Math.cos(ce * P.wander * 0.7 + P.homeZ) * 2),
        $ && (le = $.pos.x * 0.5 + le * 0.5));
    let ht = null;
    for (let pt of b.mortars) {
      if (pt.side === P.team) continue;
      let Yt = P.pos.x - pt.pos.x,
        rn = P.pos.z - pt.pos.z,
        gn = Math.hypot(Yt, rn);
      gn < MORTAR_RADIUS + 0.8 && (ht = gn > 0.01 ? [Yt / gn, rn / gn] : [1, 0]);
    }
    let ut = le - P.pos.x,
      Mt = Ue - P.pos.z,
      mn = AI_SPEED;
    ht && ((ut = ht[0]), (Mt = ht[1]), (mn = RUN_SPEED));
    let wt = Math.hypot(ut, Mt),
      Jt = wt > 0.3 ? mn * Math.min(1, wt / 1.5) : 0,
      sn = wt > 0.001 ? (ut / wt) * Jt : 0,
      Lt = wt > 0.001 ? (Mt / wt) * Jt : 0;
    if (
      ((P.vel.x += (sn - P.vel.x) * Math.min(1, F * 5)),
      (P.vel.z += (Lt - P.vel.z) * Math.min(1, F * 5)),
      Q(P, F),
      $)
    ) {
      let pt = Math.atan2($.pos.x - P.pos.x, $.pos.z - P.pos.z),
        Yt = wrapAngle(pt - P.facing);
      (P.facing += clamp(Yt, -F * 5, F * 5)), pe.set($.pos.x, 1.3, $.pos.z), P.aimAt(pe), (P.lastShot += F);
      let rn = P.team === "enemy" ? Math.max(0.6, 1.5 - m * 0.09) : 0.55;
      if (P.lastShot > rn && Math.abs(Yt) < 0.3 && P.los !== !1 && b.elapsed > 2) {
        P.lastShot = Math.random() * 0.15;
        let gn = clamp(P.pos.distanceTo($.pos) / 25, 0.6, 1.6),
          Ds =
            (P.team === "enemy" ? Math.max(0.032, 0.075 - m * 0.005) : 0.05) *
            gn *
            ($.isPlayer && $.vel.lengthSq() > 4 ? 1.35 : 1),
          E = P.muzzle(ve),
          N = xt.subVectors(pe, E).normalize();
        (N.x += (Math.random() - 0.5) * 2 * Ds),
          (N.y += (Math.random() - 0.5) * 2 * Ds * 0.6),
          (N.z += (Math.random() - 0.5) * 2 * Ds),
          N.normalize(),
          w(P, N, { speed: P.team === "enemy" ? 55 : 80, damage: 8 });
      }
    }
  }
  function Q(P, F) {
    (P.pos.x += P.vel.x * F), (P.pos.z += P.vel.z * F);
    let Z = ARENA.minZ,
      $ = ARENA.maxZ;
    P.isPlayer ? (Z = PLAYER_MIN_Z) : P.team === "enemy" ? ($ = ENEMY_MAX_Z) : (Z = SQUAD_MIN_Z);
    for (let ce of p) {
      if (ce === P || !ce.alive) continue;
      let le = P.pos.x - ce.pos.x,
        Ue = P.pos.z - ce.pos.z,
        ht = le * le + Ue * Ue;
      if (ht < 0.5 && ht > 1e-6) {
        let ut = Math.sqrt(ht),
          Mt = (0.71 - ut) * 0.5;
        (P.pos.x += (le / ut) * Mt), (P.pos.z += (Ue / ut) * Mt);
      }
    }
    collideWorld(P.pos, BODY_RADIUS, u), (P.pos.x = clamp(P.pos.x, ARENA.minX, ARENA.maxX)), (P.pos.z = clamp(P.pos.z, Z, $));
  }
  function Y(P) {
    let F = WEAPONS[y.weapon],
      Z = 0,
      $ = 0;
    if (
      ((C.a || C.arrowleft) && (Z -= 1),
      (C.d || C.arrowright) && (Z += 1),
      (C.w || C.arrowup) && ($ += 1),
      (C.s || C.arrowdown) && ($ -= 1),
      A.move)
    ) {
      let sn = A.move.x - A.move.ox,
        Lt = A.move.y - A.move.oy,
        pt = Math.hypot(sn, Lt);
      if (pt > 6) {
        let Yt = Math.min(1, pt / 50);
        (Z = (sn / pt) * Yt), ($ = (-Lt / pt) * Yt);
      }
    }
    let ce = dirFromYaw(b.yaw, xt),
      le = Is.set(-ce.z, 0, ce.x),
      Ue = Math.hypot(Z, $),
      ht = C.shift && $ > 0 && !b.firing,
      ut = (b.aiming ? RUN_SPEED * 0.55 : RUN_SPEED) * (ht ? 1.35 : 1) * Math.min(1, Ue),
      Mt = 0,
      mn = 0;
    Ue > 0 && ((Mt = ((ce.x * $ + le.x * Z) / Ue) * ut), (mn = ((ce.z * $ + le.z * Z) / Ue) * ut)),
      (y.vel.x += (Mt - y.vel.x) * Math.min(1, P * 12)),
      (y.vel.z += (mn - y.vel.z) * Math.min(1, P * 12)),
      Q(y, P),
      (y.facing = b.yaw);
    let wt = b.freeCam
      ? dirFromYaw(b.yaw, new THREE.Vector3())
          .multiplyScalar(20)
          .add(y.pos)
          .setY(1.4 + b.pitch * 10)
      : ye();
    y.aimAt(wt),
      b.reloading &&
        ((b.reloadTimer -= P), b.reloadTimer <= 0 && ((b.ammo[y.weapon] = F.max), (b.reloading = !1))),
      (y.lastShot += P);
    let Jt = Math.hypot(y.vel.x, y.vel.z) / RUN_SPEED;
    if (((b.bloom = Math.max(0, b.bloom - P * 2.2)), b.firing && !b.reloading && !b.over)) {
      if (b.ammo[y.weapon] <= 0) T();
      else if (y.lastShot > F.interval) {
        (y.lastShot = 0), (b.ammo[y.weapon] -= 1);
        let sn = y.muzzle(fr),
          Lt = xt.subVectors(wt, sn).normalize(),
          pt = F.spread * (b.aiming ? 0.45 : 1) + Jt * 0.02 + b.bloom * 0.025;
        (Lt.x += (Math.random() - 0.5) * 2 * pt),
          (Lt.y += (Math.random() - 0.5) * 2 * pt),
          (Lt.z += (Math.random() - 0.5) * 2 * pt),
          w(y, Lt.normalize(), F),
          (b.bloom = Math.min(1, b.bloom + (y.weapon === "rifle" ? 0.18 : 0.35))),
          (b.pitch += y.weapon === "rifle" ? 0.006 : 0.014),
          b.ammo[y.weapon] <= 0 && T();
      }
    }
    i.crosshair(10 + (Jt * 0.02 + b.bloom * 0.025 + F.spread * (b.aiming ? 0.45 : 1)) * 400);
  }
  function T() {
    let P = WEAPONS[y.weapon];
    b.reloading ||
      b.ammo[y.weapon] >= P.max ||
      !y.alive ||
      ((b.reloading = !0), (b.reloadTimer = P.reload), r.reload());
  }
  function me(P) {
    if (!y.alive) return;
    let F = P || (y.weapon === "rifle" ? "handgun" : "rifle");
    F !== y.weapon && (y.setWeapon(F), (b.reloading = !1));
  }
  let ie = { o: new THREE.Vector3(), d: new THREE.Vector3() };
  function ye() {
    l.getWorldDirection(ie.d), ie.o.copy(l.position);
    let P = Math.max(0, xt.subVectors(y.head(fr), ie.o).dot(ie.d));
    ie.o.addScaledVector(ie.d, P);
    let F = xt.copy(ie.d).multiplyScalar(150),
      Z = B(ie.o, F, "enemy"),
      $ = Math.min(1, Z.t);
    return new THREE.Vector3().copy(ie.o).addScaledVector(F, $);
  }
  let de = new THREE.Vector3(),
    Be = 70,
    Ne = 70;
  function R(P) {
    let F = y;
    if (!y.alive) {
      let Lt = v.filter((pt) => pt.alive);
      (F = Lt.length ? Lt[b.spectate % Lt.length] : y),
        F !== y &&
          ((b.yaw += wrapAngle(F.facing - b.yaw) * Math.min(1, P * 3)),
          (b.pitch += (0.15 - b.pitch) * Math.min(1, P * 2)));
    }
    b.pitch = clamp(b.pitch, -0.6, 0.85);
    let Z = b.aiming && y.alive,
      $ = dirFromYaw(b.yaw, xt),
      ce = Is.set(-$.z, 0, $.x),
      le = Z ? 1.4 : 3,
      Ue = Z ? 0.55 : 0.78,
      ht = Math.cos(b.pitch),
      ut = Math.sin(b.pitch),
      Mt = fr.set(F.pos.x, F.pos.y + 1.6, F.pos.z).addScaledVector(ce, Ue),
      mn = new THREE.Vector3($.x * ht, ut, $.z * ht),
      wt = Mt.clone().addScaledVector(mn, -le);
    wt.y += 0.28;
    let Jt = new THREE.Vector3().subVectors(wt, Mt),
      sn = B(Mt, Jt, null);
    sn.t < 1 && wt.copy(Mt).addScaledVector(Jt, Math.max(0, sn.t - 0.12)),
      (wt.y = Math.max(0.25, wt.y)),
      de.lerp(wt, Math.min(1, P * 18)),
      b.elapsed < 0.05 && de.copy(wt),
      l.position.copy(de),
      b.shake > 0 &&
        ((l.position.x += (Math.random() - 0.5) * b.shake * 0.25),
        (l.position.y += (Math.random() - 0.5) * b.shake * 0.25),
        (b.shake = Math.max(0, b.shake - P * 2.5))),
      l.lookAt(xt.copy(de).add(mn)),
      (Ne += ((Z ? Be - 20 : Be) - Ne) * Math.min(1, P * 12)),
      Math.abs(l.fov - Ne) > 0.01 && ((l.fov = Ne), l.updateProjectionMatrix()),
      (b.listener = F.pos),
      placeSun(F.pos);
  }
  let M = !1,
    z = (P, F, Z = 0.0024) => {
      let $ = b.aiming ? 0.55 : 1;
      (b.yaw -= P * Z * $), (b.pitch -= F * Z * $);
    },
    ee = 0,
    re = (P) => {
      if (b.paused || (!M && !P.buttons)) return;
      let F = P.movementX || 0,
        Z = P.movementY || 0;
      if (ee > 0) {
        ee--;
        return;
      }
      Math.abs(F) > 250 || Math.abs(Z) > 250 || z(F, Z);
    },
    te = (P) => {
      if ((r.unlock(), c.focus(), !b.paused)) {
        if (!M && c.requestPointerLock && !A.used)
          try {
            let F = c.requestPointerLock();
            F && F.catch && F.catch(() => {});
          } catch {}
        P.button === 0 && (b.firing = !0), P.button === 2 && (b.aiming = !0);
      }
    },
    Le = (P) => {
      P.button === 0 && (b.firing = !1), P.button === 2 && (b.aiming = !1);
    },
    ge = () => {
      (M = document.pointerLockElement === c), (ee = 2), i.setLocked(M || A.used);
    },
    Ae = (P) => P.preventDefault(),
    je = (P) => {
      P.preventDefault(), me();
    },
    he = new Set(["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"]),
    Re = (P) => {
      let F = P.key.toLowerCase();
      he.has(F) && ((C[F] = !0), P.preventDefault()),
        (F === " " || P.code === "Space") && ((b.firing = !0), P.preventDefault()),
        F === "r" && T(),
        F === "1" && me("rifle"),
        F === "2" && me("handgun"),
        (F === "q" || F === "e") && (b.aiming = !b.aiming);
    },
    He = (P) => {
      let F = P.key.toLowerCase();
      he.has(F) && (C[F] = !1), (F === " " || P.code === "Space") && (b.firing = !1);
    },
    ke = () => {
      for (let P in C) C[P] = !1;
      (b.firing = !1), (b.aiming = !1), (A.move = A.look = A.fire = null);
    },
    Ce = (P) => {
      let F = c.getBoundingClientRect();
      return { x: P.clientX - F.left, y: P.clientY - F.top, w: F.width, h: F.height };
    },
    $e = (P) => {
      r.unlock(), A.used || ((A.used = !0), i.showTouch(!0), i.setLocked(!0));
      for (let F of P.changedTouches) {
        let Z = Ce(F);
        i.isFireButton(F.clientX, F.clientY) && !A.fire
          ? ((A.fire = { id: F.identifier, x: Z.x, y: Z.y }), (b.firing = !0))
          : i.isAimButton(F.clientX, F.clientY)
            ? (b.aiming = !b.aiming)
            : Z.x < Z.w / 2 && !A.move
              ? (A.move = { id: F.identifier, ox: Z.x, oy: Z.y, x: Z.x, y: Z.y })
              : A.look || (A.look = { id: F.identifier, x: Z.x, y: Z.y });
      }
      i.stick(A.move), P.preventDefault();
    },
    Xe = (P) => {
      for (let F of P.changedTouches) {
        let Z = Ce(F);
        A.move && F.identifier === A.move.id
          ? ((A.move.x = Z.x), (A.move.y = Z.y))
          : A.look && F.identifier === A.look.id
            ? (b.paused || z(Z.x - A.look.x, Z.y - A.look.y, 0.006), (A.look.x = Z.x), (A.look.y = Z.y))
            : A.fire &&
              F.identifier === A.fire.id &&
              (b.paused || z(Z.x - A.fire.x, Z.y - A.fire.y, 0.006), (A.fire.x = Z.x), (A.fire.y = Z.y));
      }
      i.stick(A.move), P.preventDefault();
    },
    ot = (P) => {
      for (let F of P.changedTouches)
        A.move && F.identifier === A.move.id && (A.move = null),
          A.look && F.identifier === A.look.id && (A.look = null),
          A.fire && F.identifier === A.fire.id && ((A.fire = null), (b.firing = !1));
      i.stick(A.move);
    };
  c.addEventListener("mousedown", te),
    window.addEventListener("mouseup", Le),
    window.addEventListener("mousemove", re),
    c.addEventListener("contextmenu", Ae),
    c.addEventListener("wheel", je, { passive: !1 }),
    document.addEventListener("pointerlockchange", ge),
    window.addEventListener("keydown", Re),
    window.addEventListener("keyup", He),
    window.addEventListener("blur", ke),
    i.root.addEventListener("touchstart", $e, { passive: !1 }),
    i.root.addEventListener("touchmove", Xe, { passive: !1 }),
    i.root.addEventListener("touchend", ot),
    i.root.addEventListener("touchcancel", ot),
    (i.onSpectateNext = () => b.spectate++);
  let D = () => {
      let P = Math.max(1, i.root.clientWidth),
        F = Math.max(1, i.root.clientHeight);
      pipe.setSize(P, F), (l.aspect = P / F);
      let Z = P / F;
      (Be = Z >= 1 ? 70 : Math.min(92, (2 * Math.atan(Math.tan((75 * Math.PI) / 360) / Z) * 180) / Math.PI)),
        l.updateProjectionMatrix();
    },
    Ee = new ResizeObserver(D);
  Ee.observe(i.root), D();
  let J = 0,
    se = performance.now();
  function Se(P) {
    J = requestAnimationFrame(Se);
    let F = Math.min(0.05, (P - se) / 1e3);
    if (((se = P), b.paused && (F = 0), F > 0)) {
      if (((b.elapsed += F), !b.over)) {
        (b.time -= F), y.alive ? Y(F) : y.vel.set(0, 0, 0);
        for (let le of p) !le.isPlayer && le.alive && O(le, F);
        Te(F);
      }
      for (let le of p) le.alive || le.vel.set(0, 0, 0);
      W(F), x.update(F);
      for (let le of n.droppedGuns) {
        let Ue = le.userData.drop;
        !Ue ||
          Ue.done ||
          ((Ue.vy -= 9.8 * F),
          (le.position.y += Ue.vy * F),
          (le.rotation.z += Ue.spin * F),
          le.position.y <= 0.04 &&
            ((le.position.y = 0.04), le.rotation.set(0, le.rotation.y, Math.PI / 2), (Ue.done = !0)));
      }
      b.freeCam || R(F);
      for (let le of p) le.update(F, b.elapsed, l);
      !y.alive &&
        !b.deadNotified &&
        ((b.deadNotified = !0), (b.firing = !1), (b.aiming = !1), t.onPlayerDied());
      let Z = v.filter((le) => le.alive).length,
        $ = S.filter((le) => le.alive).length;
      if (!b.over && (Z === 0 || $ === 0 || b.time <= 0)) {
        (b.over = !0), (b.firing = !1);
        let le = $ === 0 || (b.time <= 0 && Z > $);
        document.pointerLockElement === c && document.exitPointerLock(), t.onOver(le);
      }
      (b.statsT -= F),
        (b.statsT <= 0 || b.over) &&
          ((b.statsT = 0.2),
          t.onStats({ playerAlive: Z, enemyAlive: $, time: Math.max(0, Math.ceil(b.time)) }));
      let ce = WEAPONS[y.weapon];
      i.update({
        hp: y.hp / y.maxHp,
        weapon: ce.label,
        ammo: b.ammo[y.weapon],
        max: ce.max,
        reloading: b.reloading ? 1 - b.reloadTimer / ce.reload : -1,
        alive: y.alive,
        aiming: b.aiming,
      }),
        i.minimap(p, b.mortars, y, b.yaw, u);
    } else {
      R(1e-4);
      for (let Z of p) Z.update(0, b.elapsed, l);
    }
    u.update(b.elapsed);
    for (const pl of flashLights) pl.intensity = Math.max(0, pl.intensity - F * 90);
    pipe.render(h, l, F);
  }
  // Follow the focus soldier with the sun's shadow frustum, snapped to whole
  // shadow-map texels so shadow edges don't shimmer while moving.
  const sunZ = u.sunOffset.clone().normalize(),
    sunX = new THREE.Vector3(0, 1, 0).cross(sunZ).normalize(),
    sunY = sunZ.clone().cross(sunX),
    texel = (u.sun.shadow.camera.right - u.sun.shadow.camera.left) / gfx.shadowMapSize,
    snapV = new THREE.Vector3();
  function placeSun(pos) {
    snapV.set(pos.x, 0, pos.z);
    const ax = snapV.dot(sunX),
      ay = snapV.dot(sunY);
    snapV.addScaledVector(sunX, Math.round(ax / texel) * texel - ax).addScaledVector(sunY, Math.round(ay / texel) * texel - ay);
    u.sun.target.position.copy(snapV), u.sun.position.copy(snapV).add(u.sunOffset);
  }
  J = requestAnimationFrame(Se);
  let be = {
    setPaused(P) {
      (b.paused = !!P),
        i.setPaused(b.paused),
        b.paused && (ke(), document.pointerLockElement === c && document.exitPointerLock());
    },
    reload: T,
    switchWeapon: () => me(),
    spectateNext: () => b.spectate++,
    quality: gfx.level,
    debug: { S: b, soldiers: p, camera: l, scene: h, renderer: a, player: y, gfx, pipe },
    dispose() {
      (n.disposed = !0),
        cancelAnimationFrame(J),
        Ee.disconnect(),
        c.removeEventListener("mousedown", te),
        window.removeEventListener("mouseup", Le),
        window.removeEventListener("mousemove", re),
        c.removeEventListener("contextmenu", Ae),
        c.removeEventListener("wheel", je),
        document.removeEventListener("pointerlockchange", ge),
        window.removeEventListener("keydown", Re),
        window.removeEventListener("keyup", He),
        window.removeEventListener("blur", ke),
        document.pointerLockElement === c && document.exitPointerLock(),
        p.forEach((P) => P.dispose()),
        x.dispose(),
        u.dispose(),
        [L, V, ae, xe, n.barGeo].forEach((P) => P.dispose()),
        [
          Me,
          Ke,
          K,
          n.barBgMat,
          ...Object.values(q),
          ...Object.values(g),
          ...d.values(),
          ...Object.values(n.gunMats).filter((P) => P.isMaterial),
        ].forEach((P) => P.dispose()),
        fe.dispose(),
        (n.scorches || []).forEach((P) => P.geometry.dispose()),
        r.dispose(),
        (n.gunMats.textures || []).forEach((P) => P.dispose()),
        pipe.dispose(),
        a.dispose(),
        a.forceContextLoss(),
        i.dispose(),
        window.__battle3d === be && (window.__battle3d = null);
    },
  };
  return (window.__battle3d = be), be;
}

export {
  createBattle,
  loadSoldier,
  QUALITY_LEVELS,
  storedQuality as getQuality,
  saveQuality as setQuality,
  defaultQuality,
};
