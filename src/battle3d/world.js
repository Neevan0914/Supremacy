// Battlefield: ground, sky, lighting, cover objects and their colliders.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const FIELD = { minX: -15.5, maxX: 15.5, minZ: -20.5, maxZ: 20.5 };

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

export function canvasTexture(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
  }
  t.anisotropy = 4;
  return t;
}

function groundTexture(rand) {
  const camo = ['#4a5138', '#5c4a34', '#3a4230', '#6b5a3d', '#42392a'];
  return canvasTexture(
    512,
    512,
    (g, w, h) => {
      g.fillStyle = '#4a4c34';
      g.fillRect(0, 0, w, h);
      // Wrap-around blotches so the tile is seamless.
      for (let i = 0; i < 70; i++) {
        const x = rand() * w;
        const y = rand() * h;
        const r = 20 + rand() * 60;
        g.fillStyle = camo[Math.floor(rand() * camo.length)];
        g.globalAlpha = 0.35 + rand() * 0.35;
        for (const dx of [-w, 0, w])
          for (const dy of [-h, 0, h]) {
            g.beginPath();
            g.ellipse(x + dx, y + dy, r, r * (0.5 + rand() * 0.4), rand() * Math.PI, 0, Math.PI * 2);
            g.fill();
          }
      }
      g.globalAlpha = 1;
      const img = g.getImageData(0, 0, w, h);
      for (let i = 0; i < img.data.length; i += 4) {
        const n = (rand() - 0.5) * 34;
        img.data[i] += n;
        img.data[i + 1] += n;
        img.data[i + 2] += n * 0.8;
      }
      g.putImageData(img, 0, 0);
      // Grass tufts.
      for (let i = 0; i < 900; i++) {
        const x = rand() * w;
        const y = rand() * h;
        g.strokeStyle = rand() < 0.5 ? 'rgba(96,110,60,0.7)' : 'rgba(60,70,40,0.7)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (rand() - 0.5) * 4, y - 3 - rand() * 4);
        g.stroke();
      }
    },
    14,
  );
}

function noiseTexture(base, spread, rand, size = 128, lines) {
  return canvasTexture(size, size, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const img = g.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (rand() - 0.5) * spread;
      img.data[i] += n;
      img.data[i + 1] += n;
      img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
    if (lines) lines(g, w, h);
  });
}

// Every collider is an axis-aligned box {minX,maxX,minZ,maxZ,h} or a
// vertical cylinder {x,z,r,h}. `bullets: false` lets shots pass.
export function buildWorld(scene, seed) {
  const rand = rng(seed);
  const disposables = [];
  const track = (x) => (disposables.push(x), x);
  const boxes = [];
  const circles = [];

  // Sky dome with a vertical gradient.
  const skyGeo = track(new THREE.SphereGeometry(400, 24, 12));
  const skyMat = track(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color('#6f93ad') },
        mid: { value: new THREE.Color('#e2dcc4') },
        bot: { value: new THREE.Color('#6d6a55') },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.6)) : mix(mid, bot, min(1.0, -h * 4.0)); gl_FragColor = vec4(c, 1.0); }',
    }),
  );
  scene.add(new THREE.Mesh(skyGeo, skyMat));
  scene.fog = new THREE.Fog('#c9c4aa', 40, 150);

  const hemi = new THREE.HemisphereLight('#e4e8d8', '#5a5040', 1.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff1d6', 2.4);
  sun.position.set(14, 26, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -26;
  sc.right = 26;
  sc.top = 28;
  sc.bottom = -28;
  sc.near = 1;
  sc.far = 80;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(sun.target);

  // Ground.
  const gTex = track(groundTexture(rand));
  const ground = new THREE.Mesh(
    track(new THREE.PlaneGeometry(300, 300, 1, 1)),
    track(new THREE.MeshStandardMaterial({ map: gTex, roughness: 1, metalness: 0 })),
  );
  gTex.repeat.set(60, 60);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Shared materials.
  const sandTex = track(
    noiseTexture('#8a7a55', 40, rand, 128, (g, w, h) => {
      g.strokeStyle = 'rgba(60,50,30,0.35)';
      for (let i = 0; i < 12; i++) {
        g.beginPath();
        g.moveTo(0, (i * h) / 12);
        g.lineTo(w, (i * h) / 12 + 3);
        g.stroke();
      }
    }),
  );
  const sandMat = track(new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 }));
  const woodTex = track(
    noiseTexture('#7a5a36', 30, rand, 128, (g, w, h) => {
      g.strokeStyle = 'rgba(40,25,10,0.8)';
      g.lineWidth = 3;
      g.strokeRect(2, 2, w - 4, h - 4);
      for (let i = 1; i < 4; i++) {
        g.beginPath();
        g.moveTo(0, (i * h) / 4);
        g.lineTo(w, (i * h) / 4);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(4, 4);
      g.lineTo(w - 4, h - 4);
      g.stroke();
    }),
  );
  const woodMat = track(new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.9 }));
  const stoneTex = track(
    noiseTexture('#8b867a', 36, rand, 128, (g, w, h) => {
      g.strokeStyle = 'rgba(50,45,40,0.6)';
      g.lineWidth = 2;
      for (let r = 0; r < 8; r++) {
        const y = (r * h) / 8;
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
        for (let c = 0; c < 4; c++) {
          const x = ((c + (r % 2) * 0.5) * w) / 4;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x, y + h / 8);
          g.stroke();
        }
      }
    }),
  );
  const stoneMat = track(new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.95 }));
  const rockMat = track(new THREE.MeshStandardMaterial({ color: '#77736a', roughness: 0.95, flatShading: true }));
  const steelMat = track(new THREE.MeshStandardMaterial({ color: '#3b3a36', roughness: 0.6, metalness: 0.6 }));
  const barkMat = track(new THREE.MeshStandardMaterial({ color: '#4a3a2a', roughness: 1 }));
  const pineMat = track(new THREE.MeshStandardMaterial({ color: '#34452c', roughness: 0.95, flatShading: true }));
  const craterMat = track(
    new THREE.MeshBasicMaterial({
      map: track(
        canvasTexture(128, 128, (g) => {
          const gr = g.createRadialGradient(64, 64, 8, 64, 64, 62);
          gr.addColorStop(0, 'rgba(25,20,14,0.85)');
          gr.addColorStop(0.6, 'rgba(45,38,26,0.5)');
          gr.addColorStop(1, 'rgba(45,38,26,0)');
          g.fillStyle = gr;
          g.fillRect(0, 0, 128, 128);
        }),
      ),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  );

  // Static props are baked into one merged mesh per material (few draw calls).
  const buckets = new Map();
  const _m = new THREE.Matrix4();
  const bake = (geo, mat, matrix, shadow = true) => {
    const key = mat.uuid + (shadow ? 's' : '');
    if (!buckets.has(key)) buckets.set(key, { mat, shadow, geos: [] });
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    g.applyMatrix4(matrix);
    buckets.get(key).geos.push(g);
  };
  const add = (geo, mat, x, y, z, ry = 0, shadow = true) => {
    _m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1));
    bake(geo, mat, _m, shadow);
  };
  const addBox = (cx, cz, hx, hz, h, opts = {}) => boxes.push({ minX: cx - hx, maxX: cx + hx, minZ: cz - hz, maxZ: cz + hz, h, ...opts });

  // Sandbag wall: chest high (1.2 m), 3 staggered rows.
  const bagGeo = track(new THREE.SphereGeometry(0.5, 10, 6));
  bagGeo.scale(0.56, 0.3, 0.32);
  const bags = [];
  function sandbags(cx, cz, len, alongZ) {
    const rows = 4;
    const per = Math.max(2, Math.round(len / 0.52));
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < per - (r % 2); i++) {
        const t = (i + (r % 2) * 0.5 + 0.5) / per - 0.5;
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (alongZ ? Math.PI / 2 : 0) + (rand() - 0.5) * 0.12, (rand() - 0.5) * 0.06));
        const p = alongZ ? new THREE.Vector3(cx + (rand() - 0.5) * 0.04, 0.15 + r * 0.29, cz + t * len) : new THREE.Vector3(cx + t * len, 0.15 + r * 0.29, cz + (rand() - 0.5) * 0.04);
        m.compose(p, q, new THREE.Vector3(1, 1, 1));
        bags.push(m);
        // Second layer behind for depth.
        const p2 = p.clone();
        if (alongZ) p2.x += 0.3;
        else p2.z += 0.3;
        if (r < rows - 1) bags.push(new THREE.Matrix4().compose(p2, q, new THREE.Vector3(1, 1, 1)));
      }
    }
    if (alongZ) addBox(cx + 0.15, cz, 0.38, len / 2, 1.2);
    else addBox(cx, cz + 0.15, len / 2, 0.38, 1.2);
  }

  function crate(x, z, s, stack) {
    add(new THREE.BoxGeometry(s, s, s), woodMat, x, s / 2, z, 0);
    let h = s;
    if (stack) {
      add(new THREE.BoxGeometry(s * 0.8, s * 0.8, s * 0.8), woodMat, x + (rand() - 0.5) * 0.15, s + s * 0.4, z + (rand() - 0.5) * 0.15, (rand() - 0.5) * 0.5);
      h = s * 1.8;
    }
    addBox(x, z, s / 2, s / 2, h);
  }

  function ruin(cx, cz, len, alongZ) {
    const segs = Math.max(3, Math.round(len / 0.7));
    for (let i = 0; i < segs; i++) {
      const t = (i + 0.5) / segs - 0.5;
      const h = 1.5 + rand() * 1.3 - (i === 0 || i === segs - 1 ? 0.6 : 0);
      const w = len / segs + 0.02;
      const geo = alongZ ? new THREE.BoxGeometry(0.5, h, w) : new THREE.BoxGeometry(w, h, 0.5);
      add(geo, stoneMat, alongZ ? cx : cx + t * len, h / 2, alongZ ? cz + t * len : cz);
    }
    // Rubble at the foot.
    for (let i = 0; i < 5; i++) {
      const r = 0.15 + rand() * 0.2;
      add(new THREE.DodecahedronGeometry(r, 0), stoneMat, cx + (alongZ ? (rand() - 0.5) * 1.6 : (rand() - 0.5) * len), r * 0.6, cz + (alongZ ? (rand() - 0.5) * len : (rand() - 0.5) * 1.6), rand() * 3);
    }
    if (alongZ) addBox(cx, cz, 0.25, len / 2, 1.8);
    else addBox(cx, cz, len / 2, 0.25, 1.8);
  }

  function rock(x, z, s) {
    const geo = new THREE.IcosahedronGeometry(s, 1);
    const p = geo.attributes.position;
    // Same jitter for coincident vertices so faces stay sealed.
    const jit = new Map();
    for (let i = 0; i < p.count; i++) {
      const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
      if (!jit.has(key)) jit.set(key, 0.75 + rand() * 0.45);
      const k = jit.get(key);
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.75, p.getZ(i) * k);
    }
    geo.computeVertexNormals();
    add(geo, rockMat, x, s * 0.35, z, rand() * 6);
    circles.push({ x, z, r: s * 0.85, h: s * 1.05 });
  }

  function hedgehog(x, z) {
    // Czech hedgehog: three beams crossing at the middle.
    const g = new THREE.Object3D();
    g.position.set(x, 0.5, z);
    g.rotation.y = rand() * 3;
    g.updateMatrixWorld();
    const tilts = [
      [0.95, 0, 0],
      [0, 0, 0.95],
      [-0.6, Math.PI / 4, -0.6],
    ];
    for (const [rx, ry, rz] of tilts) {
      const b = new THREE.Object3D();
      b.rotation.set(rx, ry, rz);
      g.add(b);
      b.updateMatrixWorld();
      bake(new THREE.BoxGeometry(0.12, 1.5, 0.12), steelMat, b.matrixWorld);
    }
    circles.push({ x, z, r: 0.55, h: 1.0, bullets: false });
  }

  function tree(x, z, s, collide = true) {
    add(new THREE.CylinderGeometry(0.12 * s, 0.2 * s, 2.2 * s, 7), barkMat, x, 1.1 * s, z, 0, collide);
    for (let i = 0; i < 3; i++) {
      const r = (1.5 - i * 0.35) * s;
      add(new THREE.ConeGeometry(r, 2.2 * s, 8), pineMat, x, (2.2 + i * 1.2) * s, z, rand() * 3, collide);
    }
    if (collide) circles.push({ x, z, r: 0.25 * s, h: 8 });
  }

  function crater(x, z, r) {
    const geo = new THREE.PlaneGeometry(r * 2, r * 2);
    geo.rotateZ(rand() * 6);
    geo.rotateX(-Math.PI / 2);
    bake(geo, craterMat, _m.makeTranslation(x, 0.01, z), false);
  }

  // Layout: mirrored cover lines near each side, varied clutter in the middle.
  const lines = [11, -11];
  for (const zl of lines) {
    const s = Math.sign(zl);
    const xs = [-9 + rand() * 2, -1.5 + rand() * 3, 7 + rand() * 2];
    xs.forEach((x, i) => sandbags(x, zl + (rand() - 0.5) * 1.5 - s * (i === 1 ? 1 : 0), 2.6 + rand() * 1.2, false));
    crate(xs[0] + 3.2 + rand(), zl - s * 2, 1.1, rand() < 0.5);
    crate(xs[2] - 3.4 - rand(), zl - s * 2.3, 1.1, rand() < 0.5);
  }
  // Middle band: ruins, rocks, hedgehogs, crates.
  const mid = [
    () => ruin(-6 + rand() * 2, -2 + rand() * 4, 3.5 + rand() * 1.5, false),
    () => ruin(6 + rand() * 2, -2 + rand() * 4, 3 + rand() * 2, rand() < 0.5),
    () => rock(-1 + rand() * 2, -4 + rand() * 1.5, 0.9 + rand() * 0.4),
    () => rock(rand() * 2 - 1, 3.5 + rand() * 1.5, 0.8 + rand() * 0.4),
    () => crate(-12 + rand() * 1.5, rand() * 4 - 2, 1.2, true),
    () => crate(12 - rand() * 1.5, rand() * 4 - 2, 1.2, true),
  ];
  mid.forEach((f) => f());
  for (let i = 0; i < 5; i++) hedgehog(-13 + i * 6.5 + (rand() - 0.5) * 2, (rand() < 0.5 ? -1 : 1) * (6 + rand() * 1.5));
  for (let i = 0; i < 4; i++) rock((rand() < 0.5 ? -1 : 1) * (13.5 + rand() * 1.5), (rand() - 0.5) * 30, 0.6 + rand() * 0.5);
  for (let i = 0; i < 10; i++) crater((rand() - 0.5) * 28, (rand() - 0.5) * 30, 1 + rand() * 1.6);

  // Trees at the flanks and a forest ring outside the field.
  for (let i = 0; i < 6; i++) tree((i % 2 ? -1 : 1) * (14.3 + rand() * 1), -16 + i * 6.5 + rand() * 2, 0.9 + rand() * 0.4);
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2;
    const r = 30 + rand() * 45;
    tree(Math.cos(a) * r, Math.sin(a) * r * 1.2, 1 + rand() * 0.8, false);
  }
  // Rolling hills on the horizon.
  const hillMat = track(new THREE.MeshStandardMaterial({ color: '#56583e', roughness: 1, flatShading: true }));
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rand() * 0.3;
    const r = 110 + rand() * 40;
    const s = 25 + rand() * 30;
    const geo = new THREE.IcosahedronGeometry(s, 1);
    geo.scale(1, 0.25 + rand() * 0.2, 1);
    bake(geo, hillMat, _m.makeTranslation(Math.cos(a) * r, -s * 0.05, Math.sin(a) * r), false);
  }

  // Bags in one draw call.
  if (bags.length) {
    const im = new THREE.InstancedMesh(bagGeo, sandMat, bags.length);
    bags.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = true;
    im.receiveShadow = true;
    scene.add(im);
  }

  // Barbed-wire perimeter.
  const wire = [];
  const postGeo = track(new THREE.CylinderGeometry(0.04, 0.05, 1.2, 5));
  const perim = [
    [FIELD.minX - 0.4, FIELD.minZ - 0.4],
    [FIELD.maxX + 0.4, FIELD.minZ - 0.4],
    [FIELD.maxX + 0.4, FIELD.maxZ + 0.4],
    [FIELD.minX - 0.4, FIELD.maxZ + 0.4],
  ];
  for (let e = 0; e < 4; e++) {
    const [ax, az] = perim[e];
    const [bx, bz] = perim[(e + 1) % 4];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(len / 3);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      add(postGeo.clone(), woodMat, ax + (bx - ax) * t, 0.6, az + (bz - az) * t);
      if (i < n)
        for (const hgt of [0.35, 0.7, 1.05]) {
          const t2 = (i + 1) / n;
          wire.push(ax + (bx - ax) * t, hgt, az + (bz - az) * t, ax + (bx - ax) * t2, hgt + (rand() - 0.5) * 0.08, az + (bz - az) * t2);
        }
    }
  }
  const wireGeo = track(new THREE.BufferGeometry());
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
  scene.add(new THREE.LineSegments(wireGeo, track(new THREE.LineBasicMaterial({ color: '#2a2722' }))));

  for (const { mat, shadow, geos } of buckets.values()) {
    const merged = track(mergeGeometries(geos));
    geos.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  return {
    boxes,
    circles,
    sun,
    dispose() {
      disposables.forEach((d) => d.dispose && d.dispose());
    },
  };
}

// ---- Collision helpers -----------------------------------------------------

// First hit along segment p0 -> p0 + d (t in [0,1]) against an AABB [0,h].
export function segBox(p0, d, b) {
  let tmin = 0;
  let tmax = 1;
  const lo = [b.minX, 0, b.minZ];
  const hi = [b.maxX, b.h, b.maxZ];
  const o = [p0.x, p0.y, p0.z];
  const dv = [d.x, d.y, d.z];
  for (let k = 0; k < 3; k++) {
    if (Math.abs(dv[k]) < 1e-9) {
      if (o[k] < lo[k] || o[k] > hi[k]) return null;
    } else {
      let t1 = (lo[k] - o[k]) / dv[k];
      let t2 = (hi[k] - o[k]) / dv[k];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

// First hit along a segment against a vertical cylinder from y0 to y1.
export function segCyl(p0, d, cx, cz, r, y0, y1) {
  const ox = p0.x - cx;
  const oz = p0.z - cz;
  const a = d.x * d.x + d.z * d.z;
  const c = ox * ox + oz * oz - r * r;
  let t;
  if (c <= 0) t = 0;
  else {
    if (a < 1e-9) return null;
    const b = 2 * (ox * d.x + oz * d.z);
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t < 0 || t > 1) return null;
  }
  const y = p0.y + d.y * t;
  if (y < y0 || y > y1) return null;
  return t;
}

export function segSphere(p0, d, c, r) {
  const ox = p0.x - c.x;
  const oy = p0.y - c.y;
  const oz = p0.z - c.z;
  const a = d.x * d.x + d.y * d.y + d.z * d.z;
  const b = 2 * (ox * d.x + oy * d.y + oz * d.z);
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - 4 * a * cc;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : cc < 0 ? 0 : null;
}

// Push a circle (soldier) out of every collider.
export function resolveCircle(p, r, world) {
  for (const b of world.boxes) {
    const cx = Math.max(b.minX, Math.min(p.x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
    const dx = p.x - cx;
    const dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * r;
        p.z = cz + (dz / d) * r;
      } else {
        // Centre inside the box: leave by the nearest face.
        const opts = [
          [p.x - b.minX + r, -1, 0],
          [b.maxX - p.x + r, 1, 0],
          [p.z - b.minZ + r, 0, -1],
          [b.maxZ - p.z + r, 0, 1],
        ].sort((a, c) => a[0] - c[0])[0];
        p.x += opts[1] * opts[0];
        p.z += opts[2] * opts[0];
      }
    }
  }
  for (const c of world.circles) {
    const dx = p.x - c.x;
    const dz = p.z - c.z;
    const rr = r + c.r;
    const d2 = dx * dx + dz * dz;
    if (d2 < rr * rr && d2 > 1e-8) {
      const d = Math.sqrt(d2);
      p.x = c.x + (dx / d) * rr;
      p.z = c.z + (dz / d) * rr;
    }
  }
}
