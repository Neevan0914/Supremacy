// Third-person 3D squad battle. Same rules as the old top-down battle:
// 5 v 5, a timer, rifle + handgun with ammo and reloads, mortar strikes
// telegraphed by warning circles. Win by wiping the enemy, or by having more
// troops standing when time runs out.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rigSoldier, solveTwoBone } from './rig.js';
import { FIELD, buildWorld, canvasTexture, resolveCircle, rng, segBox, segCyl, segSphere } from './world.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

// ---- Model -----------------------------------------------------------------
let templatePromise = null;
export function loadSoldier() {
  if (!templatePromise) {
    templatePromise = (async () => {
      let buf;
      const b64 = typeof window !== 'undefined' && window.__SUPREMACY_SOLDIER_GLB;
      if (b64) {
        const bin = atob(b64);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        buf = u8.buffer;
      } else {
        buf = await (await fetch('assets/soldier.glb')).arrayBuffer();
      }
      const gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
      return rigSoldier(gltf.scene);
    })();
    templatePromise.catch(() => (templatePromise = null));
  }
  return templatePromise;
}

// ---- Tuning ----------------------------------------------------------------
const TIME_LIMIT = 90;
const RUN_SPEED = 5.2;
const AI_SPEED = 3.4;
const BODY_R = 0.32;
const PLAYER_MIN_Z = -4; // the player can't storm the enemy line
const ENEMY_MAX_Z = -5;
const ALLY_MIN_Z = 4;
const MORTAR_R = 3.2;
const MORTAR_WARN = 1.6;

const WEAPONS = {
  rifle: { label: 'RIFLE', max: 50, damage: 8, interval: 0.14, reload: 1.5, spread: 0.012, speed: 170 },
  handgun: { label: 'HANDGUN', max: 12, damage: 20, interval: 0.3, reload: 0.9, spread: 0.006, speed: 150 },
};

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const FWD = new THREE.Vector3(0, 0, 1);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const forward = (facing, out = new THREE.Vector3()) => out.set(Math.sin(facing), 0, Math.cos(facing));

// ---- Guns ------------------------------------------------------------------
// Each gun is one vertex-coloured mesh (one draw call).
function buildGunMaterials() {
  return { vc: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.3 }) };
}
const WOOD = new THREE.Color('#5b3a1f');
const STEEL = new THREE.Color('#2a2b2d');
function part(geo, color, x, y, z, rx = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) color.toArray(c, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.deleteAttribute('uv');
  return g;
}
function gunMesh(parts, M, grips, offset) {
  const geo = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(geo, M.vc);
  mesh.castShadow = true;
  g.add(mesh);
  Object.values(grips).forEach((o) => g.add(o));
  g.userData = { grips, offset };
  return g;
}
const grip = (x, y, z) => {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  return o;
};
// Local frame: +Z is the muzzle direction, the butt plate sits at z = 0.
function makeRifle(M) {
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  return gunMesh(
    [
      part(B(0.045, 0.11, 0.28), WOOD, 0, -0.035, 0.14),
      part(B(0.04, 0.06, 0.12), WOOD, 0, -0.01, 0.31),
      part(B(0.05, 0.065, 0.2), STEEL, 0, 0.012, 0.44),
      part(B(0.05, 0.05, 0.3), WOOD, 0, -0.002, 0.66),
      part(B(0.032, 0.13, 0.055), STEEL, 0, -0.085, 0.44),
      part(B(0.012, 0.03, 0.012), STEEL, 0, 0.048, 0.92),
      part(new THREE.CylinderGeometry(0.011, 0.012, 0.44, 8), STEEL, 0, 0.018, 0.86, Math.PI / 2),
    ],
    M,
    { right: grip(0, -0.04, 0.27), left: grip(0.02, -0.05, 0.58), muzzle: grip(0, 0.018, 1.09) },
    new THREE.Vector3(0, 0, -0.02),
  );
}
function makePistol(M) {
  return gunMesh(
    [part(new THREE.BoxGeometry(0.032, 0.035, 0.19), STEEL, 0, 0.045, 0.07), part(new THREE.BoxGeometry(0.03, 0.1, 0.045), WOOD, 0, -0.01, 0, -0.25)],
    M,
    { right: grip(-0.025, -0.04, -0.04), left: grip(0.035, -0.045, -0.02), muzzle: grip(0, 0.045, 0.17) },
    // Held out in front of the chest, two-handed.
    new THREE.Vector3(0.1, -0.06, 0.36),
  );
}

// ---- Particles -------------------------------------------------------------
function spriteTex(inner, outer) {
  return canvasTexture(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 31);
    gr.addColorStop(0, inner);
    gr.addColorStop(1, outer);
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
}
class Particles {
  constructor(scene, cap = 160) {
    this.scene = scene;
    this.tex = {
      soft: spriteTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)'),
      smoke: spriteTex('rgba(200,200,200,0.7)', 'rgba(200,200,200,0)'),
    };
    this.pool = [];
    this.live = [];
    for (let i = 0; i < cap; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.soft, transparent: true, depthWrite: false }));
      s.visible = false;
      scene.add(s);
      this.pool.push(s);
    }
  }
  spawn(o) {
    let s = this.pool.pop();
    if (!s) {
      const old = this.live.shift();
      if (!old) return;
      s = old.s;
    }
    const m = s.material;
    m.map = o.smoke ? this.tex.smoke : this.tex.soft;
    m.blending = o.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    m.color.set(o.color);
    m.opacity = o.opacity ?? 1;
    m.needsUpdate = true;
    s.position.copy(o.pos);
    s.scale.setScalar(o.size);
    s.visible = true;
    this.live.push({ s, vel: o.vel ? o.vel.clone() : new THREE.Vector3(), life: o.life, max: o.life, size: o.size, grow: o.grow ?? 0, grav: o.grav ?? 0, op: m.opacity, drag: o.drag ?? 0 });
  }
  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.s.visible = false;
        this.pool.push(p.s);
        this.live.splice(i, 1);
        continue;
      }
      p.vel.y -= p.grav * dt;
      p.vel.multiplyScalar(1 - p.drag * dt);
      p.s.position.addScaledVector(p.vel, dt);
      const k = p.life / p.max;
      p.s.material.opacity = p.op * k;
      p.s.scale.setScalar(p.size + p.grow * (1 - k));
    }
  }
  dispose() {
    this.pool.concat(this.live.map((l) => l.s)).forEach((s) => s.material.dispose());
    Object.values(this.tex).forEach((t) => t.dispose());
  }
}

// ---- Soldier ---------------------------------------------------------------
class Soldier {
  constructor(game, o) {
    this.game = game;
    this.team = o.team;
    this.isPlayer = !!o.isPlayer;
    this.hp = this.maxHp = o.hp;
    this.pos = new THREE.Vector3(o.x, 0, o.z);
    this.vel = new THREE.Vector3();
    this.facing = o.facing;
    this.pitch = 0;
    this.aimYaw = 0; // gun yaw relative to body
    this.walkPhase = Math.random() * 6;
    this.moveAmount = 0;
    this.localMove = new THREE.Vector2();
    this.alive = true;
    this.deathT = 0;
    this.fallDir = Math.random() < 0.6 ? -1 : 1;
    this.lastShot = Math.random() * 0.5;
    this.recoil = 0;
    this.hitKick = 0;
    this.weapon = 'rifle';
    this.id = o.id;
    Object.assign(this, o.ai || {});

    this.group = new THREE.Group();
    this.model = cloneSkinned(game.template);
    this.bones = {};
    this.model.traverse((n) => {
      if (n.isBone) this.bones[n.name] = n;
      if (n.isSkinnedMesh) n.material = game.teamMaterial(this.team, n.name, n.material);
    });
    this.group.add(this.model);

    this.gunPivot = new THREE.Object3D();
    this.gunPivot.position.set(-0.1, 1.42, 0.02);
    this.group.add(this.gunPivot);
    this.guns = { rifle: makeRifle(game.gunMats), handgun: makePistol(game.gunMats) };
    for (const k in this.guns) {
      const g = this.guns[k];
      g.position.copy(g.userData.offset);
      g.visible = k === this.weapon;
      this.gunPivot.add(g);
    }
    this.poleL = new THREE.Object3D();
    this.poleR = new THREE.Object3D();
    this.group.add(this.poleL, this.poleR);

    if (!this.isPlayer) this.makeHealthBar();
    game.scene.add(this.group);
  }

  makeHealthBar() {
    const color = this.team === 'player' ? '#c9973f' : this.game.enemyColor;
    this.bar = new THREE.Group();
    const bg = new THREE.Mesh(this.game.barGeo, this.game.barBgMat);
    const fg = new THREE.Mesh(this.game.barGeo, this.game.barMat(color));
    bg.scale.set(0.62, 0.075, 1);
    fg.scale.set(0.58, 0.045, 1);
    fg.position.z = 0.001;
    this.bar.add(bg, fg);
    this.barFill = fg;
    this.bar.renderOrder = 10;
    this.game.scene.add(this.bar);
  }

  get gun() {
    return this.guns[this.weapon];
  }
  setWeapon(w) {
    this.weapon = w;
    for (const k in this.guns) this.guns[k].visible = k === w;
  }
  head(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + 1.66, this.pos.z);
  }
  muzzle(out = new THREE.Vector3()) {
    return this.gun.userData.grips.muzzle.getWorldPosition(out);
  }

  // Point the gun at a world-space target; the body yaw is set separately.
  aimAt(target) {
    _v.copy(target);
    this.group.worldToLocal(_v);
    _v.sub(this.gunPivot.position);
    if (this.weapon === 'handgun') _v.sub(this.gun.userData.offset);
    const yaw = Math.atan2(_v.x, _v.z);
    const pitch = Math.atan2(_v.y, Math.hypot(_v.x, _v.z));
    this.aimYaw = clamp(yaw, -0.5, 0.5);
    this.pitch = clamp(pitch, -0.9, 0.9);
  }

  damage(amount, fromPos) {
    if (!this.alive) return false;
    this.hp -= amount;
    this.hitKick = 1;
    if (this.hp <= 0) {
      this.hp = 0;
      this.die(fromPos);
      return true;
    }
    return false;
  }

  die(fromPos) {
    this.alive = false;
    this.deathT = 0;
    if (fromPos) {
      // Fall away from the shooter.
      const f = forward(this.facing, _v);
      const away = _v2.subVectors(this.pos, fromPos);
      this.fallDir = f.dot(away) > 0 ? 1 : -1;
    }
    // Drop the gun.
    const g = this.gun;
    this.game.scene.attach(g);
    g.userData.drop = { vy: 0.5, spin: (Math.random() - 0.5) * 6 };
    this.game.droppedGuns.push(g);
    if (this.bar) this.bar.visible = false;
  }

  update(dt, t, camera) {
    // Walk cycle driven by distance travelled.
    const speed = Math.hypot(this.vel.x, this.vel.z);
    this.moveAmount += (clamp(speed / 4, 0, 1) - this.moveAmount) * Math.min(1, dt * 10);
    this.walkPhase += (speed * dt * Math.PI) / 0.78;
    if (speed > 0.1) {
      const f = forward(this.facing, _v);
      // local: x = soldier's left (+X), y = forward
      const fx = this.vel.x / speed;
      const fz = this.vel.z / speed;
      const fwd = fx * f.x + fz * f.z;
      const left = fx * f.z - fz * f.x;
      this.localMove.set(left, fwd);
    }
    this.recoil = Math.max(0, this.recoil - dt * 9);
    this.hitKick = Math.max(0, this.hitKick - dt * 6);

    const g = this.group;
    g.position.copy(this.pos);
    g.rotation.set(0, this.facing, 0);

    const B = this.bones;
    for (const k in B) B[k].quaternion.identity();
    const m = this.moveAmount;
    const ph = this.walkPhase;
    const s = Math.sin(ph);
    const c = Math.cos(ph);
    const fwd = this.localMove.y;
    const side = this.localMove.x;
    const swing = 0.55 * m;

    // Hips: bob + slight crouch when aiming.
    B.hips.position.set(0, 0.92 - 0.035 * m * (1 - Math.abs(c)) - 0.02, 0);
    B.thigh_L.rotation.set(-swing * s * fwd - 0.12, 0, 0.05 + swing * s * side * 0.6);
    B.thigh_R.rotation.set(swing * s * fwd - 0.12, 0, -0.05 - swing * s * side * 0.6);
    B.shin_L.rotation.set(0.2 + 0.85 * m * Math.max(0, c), 0, 0);
    B.shin_R.rotation.set(0.2 + 0.85 * m * Math.max(0, -c), 0, 0);
    B.foot_L.rotation.set(-0.08 - 0.25 * m * Math.max(0, c), 0, 0);
    B.foot_R.rotation.set(-0.08 - 0.25 * m * Math.max(0, -c), 0, 0);

    const rifle = this.weapon === 'rifle';
    const twist = rifle ? -0.32 : 0;
    const breathe = Math.sin(t * 1.7 + this.walkPhase * 0.01) * 0.015;
    const p = this.alive ? this.pitch : 0;
    B.spine.rotation.set(-p * 0.25 + 0.05 + this.hitKick * 0.15 + breathe, twist * 0.5, s * 0.04 * m);
    B.chest.rotation.set(-p * 0.25 + breathe, twist * 0.5 + this.aimYaw * 0.5, 0);
    B.neck.rotation.set(-p * 0.15, -twist * 0.4 - this.aimYaw * 0.2, 0);
    B.head.rotation.set(-p * 0.2, -twist * 0.6 - this.aimYaw * 0.2, 0);

    // Gun pivot follows the torso and aims.
    this.gunPivot.position.set(rifle ? -0.12 : -0.08, 1.41 + (B.hips.position.y - 0.92), rifle ? 0.02 : 0.04);
    this.gunPivot.rotation.set(-this.pitch, this.aimYaw, 0, 'YXZ');
    this.gun.position.copy(this.gun.userData.offset);
    this.gun.position.z -= this.recoil * 0.05;
    this.gun.rotation.x = -this.recoil * 0.08;

    // Death: topple over from the feet.
    if (!this.alive) {
      this.deathT += dt;
      const k = Math.min(1, this.deathT / 0.75);
      const e = k * k;
      g.rotation.set(this.fallDir * e * 1.48, this.facing, 0, 'YXZ');
      g.position.y = e * 0.14;
      B.shin_L.rotation.x += e * 0.5;
      B.shin_R.rotation.x += e * 0.2;
      B.thigh_L.rotation.x -= e * 0.3;
      B.spine.rotation.x += -this.fallDir * e * 0.2;
      B.upperArm_L.rotation.set(0, 0, 0.4 * e);
      B.upperArm_R.rotation.set(-this.fallDir * 0.6 * e, 0, -0.5 * e);
      B.foreArm_R.rotation.set(-0.5 * e, 0, 0);
      g.updateMatrixWorld(true);
      return;
    }

    g.updateMatrixWorld(true);
    // Arms reach for the gun.
    const grips = this.gun.userData.grips;
    this.poleR.position.set(-0.7, 0.7, rifle ? -0.1 : 0.1);
    this.poleL.position.set(0.55, 0.6, rifle ? 0.4 : 0.1);
    this.poleR.updateMatrixWorld();
    this.poleL.updateMatrixWorld();
    solveTwoBone(B.upperArm_R, B.foreArm_R, B.hand_R, grips.right.getWorldPosition(_v), this.poleR.getWorldPosition(_v2));
    solveTwoBone(B.upperArm_L, B.foreArm_L, B.hand_L, grips.left.getWorldPosition(_v), this.poleL.getWorldPosition(_v2));
    B.hand_R.rotation.set(0.5, 0, -0.3);
    B.hand_L.rotation.set(0.3, 0, 0.6);
    B.hand_R.updateMatrixWorld(true);
    B.hand_L.updateMatrixWorld(true);

    if (this.bar) {
      this.bar.position.set(this.pos.x, this.pos.y + 2.05, this.pos.z);
      this.bar.quaternion.copy(camera.quaternion);
      const r = clamp(this.hp / this.maxHp, 0, 1);
      this.barFill.scale.x = 0.58 * r;
      this.barFill.position.x = -0.29 * (1 - r);
    }
  }

  dispose() {
    this.game.scene.remove(this.group);
    if (this.bar) this.game.scene.remove(this.bar);
    Object.values(this.guns).forEach((g) => {
      g.parent && g.parent.remove(g);
      g.traverse((n) => n.isMesh && n.geometry.dispose());
    });
  }
}

// ---- Game ------------------------------------------------------------------
export async function createBattle(container, opts) {
  const o = {
    difficulty: 1,
    enemyColor: '#a6402f',
    playerColor: '#c9973f',
    playerHp: 30,
    enemyHp: 31.5,
    seed: 1,
    onStats() {},
    onPlayerDied() {},
    onOver() {},
    ...opts,
  };
  const game = {
    scene: new THREE.Scene(),
    enemyColor: o.enemyColor,
    droppedGuns: [],
    gunMats: buildGunMaterials(),
    disposed: false,
  };
  const hud = createHud(container, { enemyColor: o.enemyColor });
  const audio = createAudio();

  let template;
  try {
    template = await loadSoldier();
  } catch (e) {
    hud.setLoading('COULD NOT LOAD SOLDIER MODEL');
    throw e;
  }
  if (opts.isCancelled && opts.isCancelled()) {
    hud.dispose();
    return null;
  }
  game.template = template;
  hud.setLoading(null);

  // Renderer.
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  const canvas = renderer.domElement;
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;cursor:crosshair;outline:none';
  canvas.tabIndex = 0;
  hud.root.insertBefore(canvas, hud.root.firstChild);

  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 500);
  const scene = game.scene;
  const world = buildWorld(scene, o.seed);

  // Team materials: tint the uniform so sides read at a glance.
  const matCache = new Map();
  const tintFor = { player: new THREE.Color('#efe2c2'), enemy: new THREE.Color(o.enemyColor).lerp(new THREE.Color('#ffffff'), 0.25) };
  game.teamMaterial = (team, part, mat) => {
    if (!['tunic', 'trousers', 'helmet'].includes(part)) return mat;
    const key = team + part;
    if (!matCache.has(key)) {
      const m = mat.clone();
      if (part === 'helmet') {
        if (team === 'enemy') m.color.copy(new THREE.Color(o.enemyColor).multiplyScalar(0.35));
      } else m.color.copy(tintFor[team]);
      matCache.set(key, m);
    }
    return matCache.get(key);
  };
  game.barGeo = new THREE.PlaneGeometry(1, 1);
  game.barBgMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.5, depthTest: false });
  const barMats = {};
  game.barMat = (c) => (barMats[c] ||= new THREE.MeshBasicMaterial({ color: c, depthTest: false }));

  const particles = new Particles(scene);

  // Soldiers. Old 2D field was 320x420 px; 1 px = 0.1 m.
  const k = o.difficulty;
  const soldiers = [];
  const player = new Soldier(game, { team: 'player', isPlayer: true, hp: o.playerHp, x: 0, z: 17, facing: Math.PI, id: 'p0' });
  soldiers.push(player);
  [
    [-5.5, 18, 0.6],
    [5.5, 18, 0.7],
    [-9.5, 16.5, 0.5],
    [9.5, 16.5, 0.8],
  ].forEach(([x, z, w], i) =>
    soldiers.push(new Soldier(game, { team: 'player', hp: o.playerHp, x, z, facing: Math.PI, id: 'p' + (i + 1), ai: { homeX: x, homeZ: z - 3, wander: w, think: 0, offset: 0, blocked: 0 } })),
  );
  [-9, -4.5, 0, 4.5, 9].forEach((x, i) =>
    soldiers.push(
      new Soldier(game, {
        team: 'enemy',
        hp: o.enemyHp,
        x,
        z: -15,
        facing: 0,
        id: 'e' + i,
        ai: { homeX: x, homeZ: -15 + Math.min(4, k * 0.5), wander: 0.6 + Math.random() * 0.4, phase: Math.random() * 6, think: Math.random(), offset: 0, blocked: 0 },
      }),
    ),
  );
  const allies = soldiers.filter((s) => s.team === 'player');
  const enemies = soldiers.filter((s) => s.team === 'enemy');

  // ---- State ----
  const S = {
    time: TIME_LIMIT,
    over: false,
    paused: false,
    yaw: Math.PI, // camera facing (same convention as soldier.facing)
    pitch: 0.05,
    aiming: false,
    firing: false,
    reloading: false,
    reloadTimer: 0,
    ammo: { rifle: WEAPONS.rifle.max, handgun: WEAPONS.handgun.max },
    bloom: 0,
    shake: 0,
    nextPlayerMortar: 6 + Math.random() * 4,
    nextEnemyMortar: 5 + Math.random() * 4,
    mortars: [],
    bullets: [],
    statsT: 0,
    deadNotified: false,
    spectate: 0,
    elapsed: 0,
  };
  const keys = {};
  const touch = { move: null, look: null, fire: null, used: false };

  // ---- Bullets ----
  const tracerGeo = new THREE.BoxGeometry(0.025, 0.025, 1);
  const tracerMats = {
    player: new THREE.MeshBasicMaterial({ color: '#fff2c0', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    enemy: new THREE.MeshBasicMaterial({ color: '#ff7040', transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
  };
  const tracerPool = [];
  function fire(shooter, dir, w) {
    const mesh = tracerPool.pop() || new THREE.Mesh(tracerGeo, tracerMats.player);
    mesh.material = tracerMats[shooter.team];
    mesh.visible = true;
    scene.add(mesh);
    const pos = shooter.muzzle(new THREE.Vector3());
    S.bullets.push({ pos, vel: dir.clone().multiplyScalar(w.speed), team: shooter.team, dmg: w.damage, life: 1.2, mesh, from: shooter, travelled: 0 });
    shooter.recoil = 1;
    // Muzzle flash.
    particles.spawn({ pos, size: 0.22, life: 0.05, color: '#ffd080', additive: true });
    particles.spawn({ pos: pos.clone().addScaledVector(dir, 0.1), size: 0.3, life: 0.4, color: '#bbbbbb', smoke: true, opacity: 0.25, grow: 0.4, vel: new THREE.Vector3(0, 0.4, 0) });
    const dist = shooter.pos.distanceTo(S.listener || player.pos);
    audio.shot(shooter.isPlayer ? 1 : clamp(1 - dist / 60, 0.08, 0.6), shooter.weapon === 'handgun');
  }

  // Closest hit along segment against world + soldiers of `targetTeam`.
  function castSegment(p0, d, targetTeam, ignoreBulletless = true) {
    let best = { t: Infinity };
    for (const b of world.boxes) {
      const t = segBox(p0, d, b);
      if (t !== null && t < best.t) best = { t, kind: 'world' };
    }
    for (const c of world.circles) {
      if (ignoreBulletless && c.bullets === false) continue;
      const t = segCyl(p0, d, c.x, c.z, c.r, 0, c.h);
      if (t !== null && t < best.t) best = { t, kind: 'world' };
    }
    if (d.y < 0) {
      const t = -p0.y / d.y;
      if (t >= 0 && t <= 1 && t < best.t) best = { t, kind: 'ground' };
    }
    if (targetTeam) {
      for (const s of soldiers) {
        if (!s.alive || s.team !== targetTeam) continue;
        const th = segSphere(p0, d, s.head(_v3), 0.14);
        if (th !== null && th < best.t) best = { t: th, kind: 'soldier', s, head: true };
        const tb = segCyl(p0, d, s.pos.x, s.pos.z, 0.27, 0, 1.52);
        if (tb !== null && tb < best.t) best = { t: tb, kind: 'soldier', s, head: false };
      }
    }
    return best;
  }
  function hasLOS(a, b) {
    _v.subVectors(b, a);
    const hit = castSegment(a, _v, null);
    return hit.t > 0.98;
  }

  function updateBullets(dt) {
    for (let i = S.bullets.length - 1; i >= 0; i--) {
      const b = S.bullets[i];
      b.life -= dt;
      const d = _v2.copy(b.vel).multiplyScalar(dt);
      const hit = castSegment(b.pos, d, b.team === 'player' ? 'enemy' : 'player');
      let done = b.life <= 0;
      if (hit.t <= 1) {
        const p = b.pos.clone().addScaledVector(d, hit.t);
        if (hit.kind === 'soldier') {
          const dmg = hit.head ? b.dmg * 2 : b.dmg;
          const killed = hit.s.damage(dmg, b.from.pos);
          for (let j = 0; j < 5; j++)
            particles.spawn({ pos: p, size: 0.08 + Math.random() * 0.08, life: 0.35, color: '#5a0d08', grav: 6, opacity: 0.9, vel: new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2) });
          if (b.from.isPlayer) {
            hud.hitMarker(killed, hit.head);
            audio.hit();
          }
          if (hit.s.isPlayer) {
            hud.damage(dmg / o.playerHp);
            S.shake = Math.max(S.shake, 0.25);
          }
          if (killed) onKill(hit.s, b.from);
        } else {
          const n = hit.kind === 'ground' ? 3 : 4;
          for (let j = 0; j < n; j++)
            particles.spawn({ pos: p, size: 0.12 + Math.random() * 0.12, life: 0.5, color: hit.kind === 'ground' ? '#6b5d45' : '#9a917e', smoke: true, opacity: 0.6, grow: 0.3, vel: new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random() * 1.5, (Math.random() - 0.5) * 1.5) });
          particles.spawn({ pos: p, size: 0.07, life: 0.08, color: '#ffe0a0', additive: true });
        }
        done = true;
      } else {
        b.pos.add(d);
      }
      // Bullets whizzing past the player's head.
      if (!done && b.team === 'enemy' && player.alive && !b.whizzed) {
        const hd = player.head(_v3);
        if (b.pos.distanceToSquared(hd) < 1.2) {
          b.whizzed = true;
          audio.whiz();
        }
      }
      if (done) {
        b.mesh.visible = false;
        scene.remove(b.mesh);
        tracerPool.push(b.mesh);
        S.bullets.splice(i, 1);
      } else {
        const sp = b.vel.length();
        const len = Math.min(1.6, sp * 0.012);
        b.mesh.scale.set(1, 1, len);
        b.mesh.position.copy(b.pos).addScaledVector(b.vel, -len / 2 / sp);
        b.mesh.quaternion.setFromUnitVectors(FWD, _v.copy(b.vel).divideScalar(sp));
      }
    }
  }

  function onKill(victim, killer) {
    if (victim.isPlayer) hud.feed('YOU WERE KILLED', '#e8542a');
    else if (victim.team === 'enemy') hud.feed(killer && killer.isPlayer ? 'ENEMY KILLED' : 'ENEMY DOWN', o.enemyColor);
    else hud.feed('SQUADMATE DOWN', '#c9973f');
  }

  // ---- Mortars ----
  const ringGeo = new THREE.RingGeometry(MORTAR_R - 0.12, MORTAR_R, 48);
  const discGeo = new THREE.CircleGeometry(MORTAR_R, 48);
  const ringMat = new THREE.MeshBasicMaterial({ color: '#e8542a', transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  const shellGeo = new THREE.CylinderGeometry(0.06, 0.03, 0.45, 8);
  const shellMat = new THREE.MeshStandardMaterial({ color: '#2d2f2a', metalness: 0.5, roughness: 0.6 });
  const scorchTex = canvasTexture(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    gr.addColorStop(0, 'rgba(10,8,6,0.9)');
    gr.addColorStop(0.7, 'rgba(20,16,10,0.55)');
    gr.addColorStop(1, 'rgba(20,16,10,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  });
  const scorchMat = new THREE.MeshBasicMaterial({ map: scorchTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  const boomLight = new THREE.PointLight('#ffb070', 0, 18, 1.5);
  scene.add(boomLight);

  function launchMortar(side, target) {
    const pos = new THREE.Vector3(target.pos.x, 0, target.pos.z);
    const g = new THREE.Group();
    const ring = new THREE.Mesh(ringGeo, ringMat.clone());
    const disc = new THREE.Mesh(discGeo, ringMat.clone());
    disc.material.opacity = 0.15;
    ring.rotation.x = disc.rotation.x = -Math.PI / 2;
    g.add(ring, disc);
    g.position.set(pos.x, 0.03, pos.z);
    const shell = new THREE.Mesh(shellGeo, shellMat);
    shell.visible = false;
    scene.add(g, shell);
    S.mortars.push({ side, pos, timer: MORTAR_WARN, g, ring, disc, shell });
  }
  function explode(m) {
    const victims = m.side === 'player' ? enemies : allies;
    victims.forEach((s) => {
      if (s.alive && Math.hypot(s.pos.x - m.pos.x, s.pos.z - m.pos.z) < MORTAR_R) {
        s.hp *= 0.25;
        s.hitKick = 1;
        if (s.isPlayer) hud.damage(0.6);
      }
    });
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * (2 + Math.random() * 4), 3 + Math.random() * 5, Math.sin(a) * (2 + Math.random() * 4));
      particles.spawn({ pos: m.pos.clone().setY(0.6), size: 1.6 + Math.random() * 1.4, life: 0.5 + Math.random() * 0.25, color: i % 3 ? '#ff9a3a' : '#ffd27a', additive: true, vel: v.clone().multiplyScalar(0.6), drag: 3, grow: 2 });
      particles.spawn({ pos: m.pos.clone().setY(0.8), size: 2 + Math.random() * 1.5, life: 2.2 + Math.random(), color: i % 2 ? '#3d3a33' : '#5a5547', smoke: true, opacity: 1, vel: v.multiplyScalar(0.4), drag: 1.2, grow: 4 });
    }
    for (let i = 0; i < 12; i++)
      particles.spawn({ pos: m.pos.clone().setY(0.2), size: 0.12, life: 0.9, color: '#4a3f2e', grav: 14, vel: new THREE.Vector3((Math.random() - 0.5) * 10, 6 + Math.random() * 6, (Math.random() - 0.5) * 10) });
    boomLight.position.set(m.pos.x, 1.5, m.pos.z);
    boomLight.intensity = 60;
    const sc = new THREE.Mesh(new THREE.PlaneGeometry(MORTAR_R * 1.5, MORTAR_R * 1.5), scorchMat);
    sc.rotation.x = -Math.PI / 2;
    sc.rotation.z = Math.random() * 6;
    sc.position.set(m.pos.x, 0.015, m.pos.z);
    scene.add(sc);
    game.scorches = (game.scorches || []).concat(sc);
    const near = (S.listener || player.pos).distanceTo(m.pos);
    S.shake = Math.max(S.shake, clamp(1.2 - near / 20, 0, 1));
    audio.boom(clamp(1 - near / 50, 0.15, 1));
  }
  function updateMortars(dt) {
    S.nextPlayerMortar -= dt;
    if (S.nextPlayerMortar <= 0) {
      S.nextPlayerMortar = 6 + Math.random() * 5;
      const live = enemies.filter((s) => s.alive);
      if (live.length) launchMortar('player', live[Math.floor(Math.random() * live.length)]);
    }
    S.nextEnemyMortar -= dt;
    if (S.nextEnemyMortar <= 0) {
      S.nextEnemyMortar = 5 + Math.random() * 5;
      const live = allies.filter((s) => s.alive);
      if (live.length) launchMortar('enemy', live[Math.floor(Math.random() * live.length)]);
    }
    let inDanger = false;
    for (let i = S.mortars.length - 1; i >= 0; i--) {
      const m = S.mortars[i];
      m.timer -= dt;
      const pulse = 0.55 + 0.45 * Math.sin(S.elapsed * 14);
      m.ring.material.opacity = 0.5 + 0.5 * pulse;
      m.disc.material.opacity = 0.1 + 0.12 * pulse;
      const fall = 0.5;
      if (m.timer < fall) {
        m.shell.visible = true;
        const k2 = m.timer / fall;
        m.shell.position.set(m.pos.x + k2 * 3, k2 * 28, m.pos.z - k2 * 2);
        m.shell.lookAt(m.pos);
        m.shell.rotateX(Math.PI / 2);
      }
      if (m.side === 'enemy' && player.alive && Math.hypot(player.pos.x - m.pos.x, player.pos.z - m.pos.z) < MORTAR_R + 0.3) inDanger = true;
      if (m.timer <= 0) {
        explode(m);
        scene.remove(m.g, m.shell);
        m.ring.material.dispose();
        m.disc.material.dispose();
        S.mortars.splice(i, 1);
      }
    }
    hud.danger(inDanger);
    boomLight.intensity = Math.max(0, boomLight.intensity - dt * 220);
  }

  // ---- AI ----
  function nearest(from, list) {
    let best = null;
    let bd = Infinity;
    for (const s of list) {
      if (!s.alive) continue;
      const d = from.pos.distanceToSquared(s.pos);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }
  const _eye = new THREE.Vector3();
  const _tgt = new THREE.Vector3();
  function aiUpdate(s, dt) {
    const foes = s.team === 'enemy' ? allies : enemies;
    s.think -= dt;
    if (s.think <= 0 || !s.target || !s.target.alive) {
      s.think = 0.4 + Math.random() * 0.4;
      // Prefer the nearest foe we can actually see.
      let best = null;
      let bd = Infinity;
      for (const f of foes) {
        if (!f.alive) continue;
        _eye.set(s.pos.x, 1.5, s.pos.z);
        _tgt.set(f.pos.x, 1.35, f.pos.z);
        // Some randomness so a whole squad doesn't focus one soldier.
        const d = s.pos.distanceTo(f.pos) + (hasLOS(_eye, _tgt) ? 0 : 25) + Math.random() * 8;
        if (d < bd) {
          bd = d;
          best = f;
        }
      }
      s.target = best;
      if (best) {
        _eye.set(s.pos.x, 1.5, s.pos.z);
        _tgt.set(best.pos.x, 1.35, best.pos.z);
        s.los = hasLOS(_eye, _tgt);
        s.blocked = s.los ? 0 : s.blocked + 1;
        // Lost sight for a while: try a new flanking offset.
        if (s.blocked >= 3) {
          s.offset = (Math.random() < 0.5 ? -1 : 1) * (2.5 + Math.random() * 3);
          s.blocked = 0;
        }
      }
    }
    const T = s.target;
    const t = S.elapsed;
    let gx;
    let gz;
    if (s.team === 'enemy') {
      gx = s.homeX + Math.sin(t * 0.8 * s.wander + s.phase) * 3 + s.offset;
      gz = s.homeZ + Math.sin(t * 0.5 + s.phase) * 1.6;
      if (T) gx = gx * 0.6 + T.pos.x * 0.4;
    } else {
      gx = s.homeX + Math.sin(t * s.wander + s.homeZ) * 3.5 + s.offset;
      gz = s.homeZ + Math.cos(t * s.wander * 0.7 + s.homeZ) * 2;
      if (T) gx = T.pos.x * 0.5 + gx * 0.5;
    }
    // Get out of incoming mortar circles.
    let flee = null;
    for (const m of S.mortars) {
      if (m.side === s.team) continue;
      const dx = s.pos.x - m.pos.x;
      const dz = s.pos.z - m.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < MORTAR_R + 0.8) flee = d > 0.01 ? [dx / d, dz / d] : [1, 0];
    }
    let mx = gx - s.pos.x;
    let mz = gz - s.pos.z;
    let speed = AI_SPEED;
    if (flee) {
      mx = flee[0];
      mz = flee[1];
      speed = RUN_SPEED;
    }
    const md = Math.hypot(mx, mz);
    const want = md > 0.3 ? speed * Math.min(1, md / 1.5) : 0;
    const vx = md > 1e-3 ? (mx / md) * want : 0;
    const vz = md > 1e-3 ? (mz / md) * want : 0;
    s.vel.x += (vx - s.vel.x) * Math.min(1, dt * 5);
    s.vel.z += (vz - s.vel.z) * Math.min(1, dt * 5);
    moveSoldier(s, dt);

    if (T) {
      const desired = Math.atan2(T.pos.x - s.pos.x, T.pos.z - s.pos.z);
      const diff = wrapAngle(desired - s.facing);
      s.facing += clamp(diff, -dt * 5, dt * 5);
      _tgt.set(T.pos.x, 1.3, T.pos.z);
      s.aimAt(_tgt);
      // Fire.
      s.lastShot += dt;
      const interval = s.team === 'enemy' ? Math.max(0.6, 1.5 - k * 0.09) : 0.55;
      if (s.lastShot > interval && Math.abs(diff) < 0.3 && s.los !== false && S.elapsed > 2) {
        s.lastShot = Math.random() * 0.15;
        // Accuracy falls off with range; tougher sectors shoot straighter.
        const range = clamp(s.pos.distanceTo(T.pos) / 25, 0.6, 1.6);
        const spread = (s.team === 'enemy' ? Math.max(0.032, 0.075 - k * 0.005) : 0.05) * range * (T.isPlayer && T.vel.lengthSq() > 4 ? 1.35 : 1);
        const m = s.muzzle(_eye);
        const dir = _v.subVectors(_tgt, m).normalize();
        dir.x += (Math.random() - 0.5) * 2 * spread;
        dir.y += (Math.random() - 0.5) * 2 * spread * 0.6;
        dir.z += (Math.random() - 0.5) * 2 * spread;
        dir.normalize();
        fire(s, dir, { speed: s.team === 'enemy' ? 55 : 80, damage: 8 });
      }
    }
  }

  function moveSoldier(s, dt) {
    s.pos.x += s.vel.x * dt;
    s.pos.z += s.vel.z * dt;
    // Keep squads on their side.
    let minZ = FIELD.minZ;
    let maxZ = FIELD.maxZ;
    if (s.isPlayer) minZ = PLAYER_MIN_Z;
    else if (s.team === 'enemy') maxZ = ENEMY_MAX_Z;
    else minZ = ALLY_MIN_Z;
    // Soldiers don't walk through each other.
    for (const o2 of soldiers) {
      if (o2 === s || !o2.alive) continue;
      const dx = s.pos.x - o2.pos.x;
      const dz = s.pos.z - o2.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.5 && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (0.71 - d) * 0.5;
        s.pos.x += (dx / d) * push;
        s.pos.z += (dz / d) * push;
      }
    }
    resolveCircle(s.pos, BODY_R, world);
    s.pos.x = clamp(s.pos.x, FIELD.minX, FIELD.maxX);
    s.pos.z = clamp(s.pos.z, minZ, maxZ);
  }

  // ---- Player ----
  function playerUpdate(dt) {
    const w = WEAPONS[player.weapon];
    // Movement relative to camera.
    let ix = 0;
    let iz = 0;
    if (keys.a || keys.arrowleft) ix -= 1;
    if (keys.d || keys.arrowright) ix += 1;
    if (keys.w || keys.arrowup) iz += 1;
    if (keys.s || keys.arrowdown) iz -= 1;
    if (touch.move) {
      const dx = touch.move.x - touch.move.ox;
      const dy = touch.move.y - touch.move.oy;
      const d = Math.hypot(dx, dy);
      if (d > 6) {
        const m = Math.min(1, d / 50);
        ix = (dx / d) * m;
        iz = (-dy / d) * m;
      }
    }
    const f = forward(S.yaw, _v);
    const r = _v2.set(-f.z, 0, f.x); // camera right
    const len = Math.hypot(ix, iz);
    const sprint = keys.shift && iz > 0 && !S.firing;
    const speed = (S.aiming ? RUN_SPEED * 0.55 : RUN_SPEED) * (sprint ? 1.35 : 1) * Math.min(1, len);
    let vx = 0;
    let vz = 0;
    if (len > 0) {
      vx = ((f.x * iz + r.x * ix) / len) * speed;
      vz = ((f.z * iz + r.z * ix) / len) * speed;
    }
    player.vel.x += (vx - player.vel.x) * Math.min(1, dt * 12);
    player.vel.z += (vz - player.vel.z) * Math.min(1, dt * 12);
    moveSoldier(player, dt);
    player.facing = S.yaw;

    // Aim point from the camera's crosshair ray.
    const aimPoint = S.freeCam ? forward(S.yaw, new THREE.Vector3()).multiplyScalar(20).add(player.pos).setY(1.4 + S.pitch * 10) : cameraAimPoint();
    player.aimAt(aimPoint);

    // Reload / fire.
    if (S.reloading) {
      S.reloadTimer -= dt;
      if (S.reloadTimer <= 0) {
        S.ammo[player.weapon] = w.max;
        S.reloading = false;
      }
    }
    player.lastShot += dt;
    const moving = Math.hypot(player.vel.x, player.vel.z) / RUN_SPEED;
    S.bloom = Math.max(0, S.bloom - dt * 2.2);
    if (S.firing && !S.reloading && !S.over) {
      if (S.ammo[player.weapon] <= 0) startReload();
      else if (player.lastShot > w.interval) {
        player.lastShot = 0;
        S.ammo[player.weapon] -= 1;
        const m = player.muzzle(_v3);
        const dir = _v.subVectors(aimPoint, m).normalize();
        const spread = w.spread * (S.aiming ? 0.45 : 1) + moving * 0.02 + S.bloom * 0.025;
        dir.x += (Math.random() - 0.5) * 2 * spread;
        dir.y += (Math.random() - 0.5) * 2 * spread;
        dir.z += (Math.random() - 0.5) * 2 * spread;
        fire(player, dir.normalize(), w);
        S.bloom = Math.min(1, S.bloom + (player.weapon === 'rifle' ? 0.18 : 0.35));
        S.pitch += player.weapon === 'rifle' ? 0.006 : 0.014;
        if (S.ammo[player.weapon] <= 0) startReload();
      }
    }
    hud.crosshair(10 + (moving * 0.02 + S.bloom * 0.025 + w.spread * (S.aiming ? 0.45 : 1)) * 400);
  }
  function startReload() {
    const w = WEAPONS[player.weapon];
    if (S.reloading || S.ammo[player.weapon] >= w.max || !player.alive) return;
    S.reloading = true;
    S.reloadTimer = w.reload;
    audio.reload();
  }
  function switchWeapon(to) {
    if (!player.alive) return;
    const next = to || (player.weapon === 'rifle' ? 'handgun' : 'rifle');
    if (next === player.weapon) return;
    player.setWeapon(next);
    S.reloading = false;
  }

  const ray = { o: new THREE.Vector3(), d: new THREE.Vector3() };
  function cameraAimPoint() {
    camera.getWorldDirection(ray.d);
    ray.o.copy(camera.position);
    // Start the ray at the player so cover behind us doesn't catch it.
    const skip = Math.max(0, _v.subVectors(player.head(_v3), ray.o).dot(ray.d));
    ray.o.addScaledVector(ray.d, skip);
    const d = _v.copy(ray.d).multiplyScalar(150);
    const hit = castSegment(ray.o, d, 'enemy');
    const t = Math.min(1, hit.t);
    return new THREE.Vector3().copy(ray.o).addScaledVector(d, t);
  }

  // ---- Camera ----
  const camPos = new THREE.Vector3();
  let baseFov = 70;
  let fov = 70;
  function updateCamera(dt) {
    let subject = player;
    if (!player.alive) {
      const liv = allies.filter((s) => s.alive);
      subject = liv.length ? liv[S.spectate % liv.length] : player;
      if (subject !== player) {
        S.yaw += wrapAngle(subject.facing - S.yaw) * Math.min(1, dt * 3);
        S.pitch += (0.15 - S.pitch) * Math.min(1, dt * 2);
      }
    }
    S.pitch = clamp(S.pitch, -0.6, 0.85);
    const aim = S.aiming && player.alive;
    const f = forward(S.yaw, _v);
    const right = _v2.set(-f.z, 0, f.x);
    const dist = aim ? 1.4 : 3.0;
    const shoulder = aim ? 0.55 : 0.78;
    const cp = Math.cos(S.pitch);
    const sp = Math.sin(S.pitch);
    const pivot = _v3.set(subject.pos.x, subject.pos.y + 1.6, subject.pos.z).addScaledVector(right, shoulder);
    // Look direction.
    const look = new THREE.Vector3(f.x * cp, sp, f.z * cp);
    const want = pivot.clone().addScaledVector(look, -dist);
    want.y += 0.28;
    // Don't let the camera sink into cover.
    const seg = new THREE.Vector3().subVectors(want, pivot);
    const hit = castSegment(pivot, seg, null);
    if (hit.t < 1) want.copy(pivot).addScaledVector(seg, Math.max(0, hit.t - 0.12));
    want.y = Math.max(0.25, want.y);
    camPos.lerp(want, Math.min(1, dt * 18));
    if (S.elapsed < 0.05) camPos.copy(want);
    camera.position.copy(camPos);
    if (S.shake > 0) {
      camera.position.x += (Math.random() - 0.5) * S.shake * 0.25;
      camera.position.y += (Math.random() - 0.5) * S.shake * 0.25;
      S.shake = Math.max(0, S.shake - dt * 2.5);
    }
    camera.lookAt(_v.copy(camPos).add(look));
    fov += ((aim ? baseFov - 20 : baseFov) - fov) * Math.min(1, dt * 12);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    S.listener = subject.pos;
    // Sun shadow follows the action.
    world.sun.position.set(subject.pos.x + 14, 26, subject.pos.z + 10);
    world.sun.target.position.set(subject.pos.x, 0, subject.pos.z);
  }

  // ---- Input ----
  let locked = false;
  const look = (dx, dy, k2 = 0.0024) => {
    const m = S.aiming ? 0.55 : 1;
    S.yaw -= dx * k2 * m;
    S.pitch -= dy * k2 * m;
  };
  let skipMoves = 0;
  const onMouseMove = (e) => {
    if (S.paused) return;
    if (!locked && !e.buttons) return;
    const mx = e.movementX || 0;
    const my = e.movementY || 0;
    // Browsers sometimes report a bogus jump right after pointer lock.
    if (skipMoves > 0) {
      skipMoves--;
      return;
    }
    if (Math.abs(mx) > 250 || Math.abs(my) > 250) return;
    look(mx, my);
  };
  const onMouseDown = (e) => {
    audio.unlock();
    canvas.focus();
    if (S.paused) return;
    if (!locked && canvas.requestPointerLock && !touch.used) {
      try {
        const p = canvas.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
      } catch (_) {
        /* not allowed here: drag-to-look still works */
      }
    }
    if (e.button === 0) S.firing = true;
    if (e.button === 2) S.aiming = true;
  };
  const onMouseUp = (e) => {
    if (e.button === 0) S.firing = false;
    if (e.button === 2) S.aiming = false;
  };
  const onLockChange = () => {
    locked = document.pointerLockElement === canvas;
    skipMoves = 2;
    hud.setLocked(locked || touch.used);
  };
  const onContext = (e) => e.preventDefault();
  const onWheel = (e) => {
    e.preventDefault();
    switchWeapon();
  };
  const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift']);
  const onKeyDown = (e) => {
    const key = e.key.toLowerCase();
    if (MOVE_KEYS.has(key)) {
      keys[key] = true;
      e.preventDefault();
    }
    if (key === ' ' || e.code === 'Space') {
      S.firing = true;
      e.preventDefault();
    }
    if (key === 'r') startReload();
    if (key === '1') switchWeapon('rifle');
    if (key === '2') switchWeapon('handgun');
    if (key === 'q' || key === 'e') S.aiming = !S.aiming;
  };
  const onKeyUp = (e) => {
    const key = e.key.toLowerCase();
    if (MOVE_KEYS.has(key)) keys[key] = false;
    if (key === ' ' || e.code === 'Space') S.firing = false;
  };
  const onBlur = () => {
    for (const kk in keys) keys[kk] = false;
    S.firing = false;
    S.aiming = false;
    touch.move = touch.look = touch.fire = null;
  };

  // Touch: left half = move stick, right half = look, fire button = fire + look.
  const rel = (t) => {
    const r = canvas.getBoundingClientRect();
    return { x: t.clientX - r.left, y: t.clientY - r.top, w: r.width, h: r.height };
  };
  const onTouchStart = (e) => {
    audio.unlock();
    if (!touch.used) {
      touch.used = true;
      hud.showTouch(true);
      hud.setLocked(true);
    }
    for (const t of e.changedTouches) {
      const p = rel(t);
      if (hud.isFireButton(t.clientX, t.clientY) && !touch.fire) {
        touch.fire = { id: t.identifier, x: p.x, y: p.y };
        S.firing = true;
      } else if (hud.isAimButton(t.clientX, t.clientY)) {
        S.aiming = !S.aiming;
      } else if (p.x < p.w / 2 && !touch.move) {
        touch.move = { id: t.identifier, ox: p.x, oy: p.y, x: p.x, y: p.y };
      } else if (!touch.look) {
        touch.look = { id: t.identifier, x: p.x, y: p.y };
      }
    }
    hud.stick(touch.move);
    e.preventDefault();
  };
  const onTouchMove = (e) => {
    for (const t of e.changedTouches) {
      const p = rel(t);
      if (touch.move && t.identifier === touch.move.id) {
        touch.move.x = p.x;
        touch.move.y = p.y;
      } else if (touch.look && t.identifier === touch.look.id) {
        if (!S.paused) look(p.x - touch.look.x, p.y - touch.look.y, 0.006);
        touch.look.x = p.x;
        touch.look.y = p.y;
      } else if (touch.fire && t.identifier === touch.fire.id) {
        if (!S.paused) look(p.x - touch.fire.x, p.y - touch.fire.y, 0.006);
        touch.fire.x = p.x;
        touch.fire.y = p.y;
      }
    }
    hud.stick(touch.move);
    e.preventDefault();
  };
  const onTouchEnd = (e) => {
    for (const t of e.changedTouches) {
      if (touch.move && t.identifier === touch.move.id) touch.move = null;
      if (touch.look && t.identifier === touch.look.id) touch.look = null;
      if (touch.fire && t.identifier === touch.fire.id) {
        touch.fire = null;
        S.firing = false;
      }
    }
    hud.stick(touch.move);
  };
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('contextmenu', onContext);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  document.addEventListener('pointerlockchange', onLockChange);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  hud.root.addEventListener('touchstart', onTouchStart, { passive: false });
  hud.root.addEventListener('touchmove', onTouchMove, { passive: false });
  hud.root.addEventListener('touchend', onTouchEnd);
  hud.root.addEventListener('touchcancel', onTouchEnd);
  hud.onSpectateNext = () => S.spectate++;

  // ---- Resize ----
  const resize = () => {
    const w = Math.max(1, hud.root.clientWidth);
    const h = Math.max(1, hud.root.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Keep ~75 deg of horizontal view on tall (phone) screens.
    const a = w / h;
    baseFov = a >= 1 ? 70 : Math.min(92, (2 * Math.atan(Math.tan((75 * Math.PI) / 360) / a) * 180) / Math.PI);
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(hud.root);
  resize();

  // ---- Loop ----
  let raf = 0;
  let last = performance.now();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    let dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (S.paused) dt = 0;
    if (dt > 0) {
      S.elapsed += dt;
      if (!S.over) {
        S.time -= dt;
        if (player.alive) playerUpdate(dt);
        else player.vel.set(0, 0, 0);
        for (const s of soldiers) if (!s.isPlayer && s.alive) aiUpdate(s, dt);
        updateMortars(dt);
      }
      for (const s of soldiers) if (!s.alive) s.vel.set(0, 0, 0);
      updateBullets(dt);
      particles.update(dt);
      for (const g of game.droppedGuns) {
        const d = g.userData.drop;
        if (!d || d.done) continue;
        d.vy -= 9.8 * dt;
        g.position.y += d.vy * dt;
        g.rotation.z += d.spin * dt;
        if (g.position.y <= 0.04) {
          g.position.y = 0.04;
          g.rotation.set(0, g.rotation.y, Math.PI / 2);
          d.done = true;
        }
      }
      if (!S.freeCam) updateCamera(dt);
      for (const s of soldiers) s.update(dt, S.elapsed, camera);

      if (!player.alive && !S.deadNotified) {
        S.deadNotified = true;
        S.firing = false;
        S.aiming = false;
        o.onPlayerDied();
      }
      const pa = allies.filter((s) => s.alive).length;
      const ea = enemies.filter((s) => s.alive).length;
      if (!S.over && (pa === 0 || ea === 0 || S.time <= 0)) {
        S.over = true;
        S.firing = false;
        const win = ea === 0 || (S.time <= 0 && pa > ea);
        if (document.pointerLockElement === canvas) document.exitPointerLock();
        o.onOver(win);
      }
      S.statsT -= dt;
      if (S.statsT <= 0 || S.over) {
        S.statsT = 0.2;
        o.onStats({ playerAlive: pa, enemyAlive: ea, time: Math.max(0, Math.ceil(S.time)) });
      }
      const w = WEAPONS[player.weapon];
      hud.update({
        hp: player.hp / player.maxHp,
        weapon: w.label,
        ammo: S.ammo[player.weapon],
        max: w.max,
        reloading: S.reloading ? 1 - S.reloadTimer / w.reload : -1,
        alive: player.alive,
        aiming: S.aiming,
      });
      hud.minimap(soldiers, S.mortars, player, S.yaw, world);
    } else {
      updateCamera(0.0001);
      for (const s of soldiers) s.update(0, S.elapsed, camera);
    }
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  const api = {
    setPaused(p) {
      S.paused = !!p;
      hud.setPaused(S.paused);
      if (S.paused) {
        onBlur();
        if (document.pointerLockElement === canvas) document.exitPointerLock();
      }
    },
    reload: startReload,
    switchWeapon: () => switchWeapon(),
    spectateNext: () => S.spectate++,
    debug: { S, soldiers, camera, scene, renderer, player },
    dispose() {
      game.disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('contextmenu', onContext);
      canvas.removeEventListener('wheel', onWheel);
      document.removeEventListener('pointerlockchange', onLockChange);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      soldiers.forEach((s) => s.dispose());
      particles.dispose();
      world.dispose();
      [tracerGeo, ringGeo, discGeo, shellGeo, game.barGeo].forEach((g) => g.dispose());
      [shellMat, scorchMat, ringMat, game.barBgMat, ...Object.values(tracerMats), ...Object.values(barMats), ...matCache.values(), ...Object.values(game.gunMats)].forEach((m) => m.dispose());
      scorchTex.dispose();
      (game.scorches || []).forEach((s) => s.geometry.dispose());
      audio.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      hud.dispose();
      if (window.__battle3d === api) window.__battle3d = null;
    },
  };
  window.__battle3d = api; // handy from the dev console
  return api;
}
