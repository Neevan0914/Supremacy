// DOM overlay for the 3D battle: crosshair, hit markers, ammo, health,
// minimap, kill feed, prompts and touch controls.
import { FIELD } from './world.js';

const MONO = "'IBM Plex Mono', monospace";
const css = (el, s) => (Object.assign(el.style, s), el);
const div = (parent, s = {}, text) => {
  const d = document.createElement('div');
  css(d, s);
  if (text != null) d.textContent = text;
  parent && parent.appendChild(d);
  return d;
};

export function createHud(container, { enemyColor }) {
  const root = div(container, {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    background: '#141a14',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    touchAction: 'none',
    fontFamily: MONO,
    color: '#e8e4d5',
  });
  const layer = div(root, { position: 'absolute', inset: '0', pointerEvents: 'none' });

  // Crosshair.
  const cross = div(layer, { position: 'absolute', left: '50%', top: '50%', width: '0', height: '0' });
  const bars = [0, 1, 2, 3].map((i) =>
    div(cross, {
      position: 'absolute',
      background: 'rgba(232,228,213,0.9)',
      boxShadow: '0 0 2px rgba(0,0,0,0.8)',
      width: i < 2 ? '2px' : '9px',
      height: i < 2 ? '9px' : '2px',
    }),
  );
  div(cross, { position: 'absolute', left: '-1.5px', top: '-1.5px', width: '3px', height: '3px', borderRadius: '50%', background: '#e8542a' });
  const placeBars = (gap) => {
    bars[0].style.left = '-1px';
    bars[0].style.top = -gap - 9 + 'px';
    bars[1].style.left = '-1px';
    bars[1].style.top = gap + 'px';
    bars[2].style.top = '-1px';
    bars[2].style.left = -gap - 9 + 'px';
    bars[3].style.top = '-1px';
    bars[3].style.left = gap + 'px';
  };
  placeBars(10);

  // Hit marker.
  const hm = div(layer, { position: 'absolute', left: '50%', top: '50%', width: '0', height: '0', opacity: '0', transition: 'opacity 0.18s' });
  const hmBars = [45, 135, 225, 315].map((a) =>
    div(hm, { position: 'absolute', left: '-1px', top: '-14px', width: '2px', height: '7px', background: '#fff', transformOrigin: '1px 14px', transform: `rotate(${a}deg)` }),
  );
  let hmTimer = 0;

  const vignette = div(layer, { position: 'absolute', inset: '0', opacity: '0', background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(170,20,10,0.75) 100%)', transition: 'opacity 0.35s' });
  let dmg = 0;
  const lowHp = div(layer, { position: 'absolute', inset: '0', opacity: '0', background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(120,10,5,0.5) 100%)' });

  const danger = div(
    layer,
    { position: 'absolute', top: '14%', left: '50%', transform: 'translateX(-50%)', fontSize: '12px', fontWeight: '600', letterSpacing: '0.08em', color: '#fff', background: 'rgba(232,84,42,0.85)', padding: '5px 12px', borderRadius: '3px', display: 'none', whiteSpace: 'nowrap' },
    '⚠ MORTAR INBOUND — MOVE!',
  );

  // Ammo (bottom-left) and health (bottom-right).
  const ammoBox = div(layer, { position: 'absolute', left: '12px', bottom: '12px', textShadow: '0 1px 3px rgba(0,0,0,0.9)' });
  const wLabel = div(ammoBox, { fontSize: '10px', letterSpacing: '0.1em', color: '#c9973f' });
  const ammoTxt = div(ammoBox, { fontSize: '22px', fontWeight: '600', fontFamily: "'Oswald', sans-serif", letterSpacing: '0.04em' });
  const reloadBar = div(ammoBox, { width: '90px', height: '3px', background: 'rgba(0,0,0,0.5)', marginTop: '3px', display: 'none' });
  const reloadFill = div(reloadBar, { height: '100%', width: '0%', background: '#e8542a' });

  const hpBox = div(layer, { position: 'absolute', right: '12px', bottom: '14px', width: '120px', textAlign: 'right', textShadow: '0 1px 3px rgba(0,0,0,0.9)' });
  div(hpBox, { fontSize: '9px', color: '#c8c4b5', letterSpacing: '0.1em', marginBottom: '3px' }, 'HEALTH');
  const hpBar = div(hpBox, { height: '8px', background: 'rgba(0,0,0,0.5)', border: '1px solid #232f27' });
  const hpFill = div(hpBar, { height: '100%', width: '100%', background: '#c9973f', transition: 'width 0.15s' });

  // Kill feed.
  const feedBox = div(layer, { position: 'absolute', left: '10px', top: '10px', display: 'flex', flexDirection: 'column', gap: '3px' });

  // Minimap.
  const mm = document.createElement('canvas');
  const MW = 84;
  const MH = 110;
  mm.width = MW * 2;
  mm.height = MH * 2;
  css(mm, { position: 'absolute', right: '10px', top: '10px', width: MW + 'px', height: MH + 'px', borderRadius: '4px', border: '1px solid rgba(232,228,213,0.25)', background: 'rgba(10,15,12,0.55)' });
  layer.appendChild(mm);
  const mg = mm.getContext('2d');

  // Prompts.
  const prompt = div(
    layer,
    { position: 'absolute', left: '50%', top: '62%', transform: 'translateX(-50%)', fontSize: '10px', letterSpacing: '0.08em', background: 'rgba(10,15,12,0.75)', border: '1px solid #3d4a3f', padding: '6px 10px', borderRadius: '4px', whiteSpace: 'nowrap', display: 'none' },
    'CLICK TO AIM · ESC RELEASES THE MOUSE',
  );
  const paused = div(layer, { position: 'absolute', inset: '0', background: 'rgba(10,15,12,0.55)', display: 'none', alignItems: 'center', justifyContent: 'center', fontFamily: "'Oswald', sans-serif", fontSize: '26px', fontWeight: '700', letterSpacing: '0.1em' }, 'PAUSED');
  const loading = div(root, { position: 'absolute', inset: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', letterSpacing: '0.12em', color: '#8a9186', background: '#0f140f' }, 'DEPLOYING TROOPS…');

  // Touch controls.
  const touchLayer = div(layer, { position: 'absolute', inset: '0', display: 'none' });
  const stickBase = div(touchLayer, { position: 'absolute', width: '84px', height: '84px', marginLeft: '-42px', marginTop: '-42px', borderRadius: '50%', border: '2px solid rgba(232,228,213,0.35)', display: 'none' });
  const stickKnob = div(touchLayer, { position: 'absolute', width: '34px', height: '34px', marginLeft: '-17px', marginTop: '-17px', borderRadius: '50%', background: 'rgba(201,151,63,0.6)', display: 'none' });
  const hint = div(touchLayer, { position: 'absolute', left: '12px', bottom: '62px', fontSize: '9px', color: 'rgba(232,228,213,0.6)', letterSpacing: '0.06em' }, 'LEFT: MOVE · RIGHT: LOOK');
  const fireBtn = div(
    touchLayer,
    { position: 'absolute', right: '16px', bottom: '48px', width: '68px', height: '68px', borderRadius: '50%', background: 'rgba(232,84,42,0.55)', border: '2px solid rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '600', letterSpacing: '0.06em' },
    'FIRE',
  );
  const aimBtn = div(
    touchLayer,
    { position: 'absolute', right: '94px', bottom: '62px', width: '46px', height: '46px', borderRadius: '50%', background: 'rgba(10,15,12,0.5)', border: '2px solid rgba(232,228,213,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', letterSpacing: '0.06em' },
    'AIM',
  );
  const inside = (el, x, y) => {
    if (touchLayer.style.display === 'none') return false;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    return Math.hypot(x - cx, y - cy) < r.width / 2 + 10;
  };

  const last = {};
  let isLocked = false;
  let isPaused = false;
  let ready = false;
  const refreshPrompt = () => {
    prompt.style.display = ready && !isLocked && !isPaused ? 'block' : 'none';
  };

  const api = {
    root,
    setLoading(text) {
      if (text) {
        loading.textContent = text;
        loading.style.display = 'flex';
      } else {
        loading.style.display = 'none';
        ready = true;
        refreshPrompt();
      }
    },
    setLocked(l) {
      isLocked = l;
      refreshPrompt();
    },
    setPaused(p) {
      isPaused = p;
      paused.style.display = p ? 'flex' : 'none';
      refreshPrompt();
    },
    showTouch(on) {
      touchLayer.style.display = on ? 'block' : 'none';
      hpBox.style.bottom = on ? '124px' : '14px';
    },
    isFireButton: (x, y) => inside(fireBtn, x, y),
    isAimButton: (x, y) => inside(aimBtn, x, y),
    stick(m) {
      if (!m) {
        stickBase.style.display = stickKnob.style.display = 'none';
        return;
      }
      hint.style.display = 'none';
      stickBase.style.display = stickKnob.style.display = 'block';
      stickBase.style.left = m.ox + 'px';
      stickBase.style.top = m.oy + 'px';
      const dx = m.x - m.ox;
      const dy = m.y - m.oy;
      const d = Math.hypot(dx, dy);
      const k = d > 42 ? 42 / d : 1;
      stickKnob.style.left = m.ox + dx * k + 'px';
      stickKnob.style.top = m.oy + dy * k + 'px';
    },
    hitMarker(killed, head) {
      const c = killed ? '#e8542a' : head ? '#ffd27a' : '#ffffff';
      hmBars.forEach((b) => (b.style.background = c));
      hm.style.transition = 'none';
      hm.style.opacity = '1';
      hmTimer = killed ? 0.35 : 0.12;
    },
    damage(amount) {
      dmg = Math.min(1, dmg + 0.35 + amount);
      vignette.style.opacity = String(dmg);
    },
    danger(on) {
      if (last.danger === on) return;
      last.danger = on;
      danger.style.display = on ? 'block' : 'none';
    },
    feed(text, color) {
      const el = div(feedBox, { fontSize: '9px', letterSpacing: '0.08em', background: 'rgba(10,15,12,0.6)', borderLeft: `2px solid ${color}`, padding: '2px 6px', transition: 'opacity 0.5s' }, text);
      setTimeout(() => (el.style.opacity = '0'), 2600);
      setTimeout(() => el.remove(), 3200);
      while (feedBox.children.length > 4) feedBox.firstChild.remove();
    },
    crosshair(gap) {
      const g = Math.round(Math.min(40, gap));
      if (last.gap !== g) placeBars((last.gap = g));
    },
    update(st) {
      if (hmTimer > 0) {
        hmTimer -= 1 / 60;
        if (hmTimer <= 0) {
          hm.style.transition = 'opacity 0.18s';
          hm.style.opacity = '0';
        }
      }
      if (dmg > 0) {
        dmg = Math.max(0, dmg - 0.02);
        vignette.style.opacity = String(dmg);
      }
      const hp = Math.max(0, st.hp);
      const hpKey = Math.round(hp * 100);
      if (last.hp !== hpKey) {
        last.hp = hpKey;
        hpFill.style.width = hpKey + '%';
        hpFill.style.background = hp > 0.35 ? '#c9973f' : '#a6402f';
        lowHp.style.opacity = st.alive && hp < 0.35 ? '1' : '0';
      }
      if (last.weapon !== st.weapon) wLabel.textContent = last.weapon = st.weapon;
      const at = st.reloading >= 0 ? 'RELOADING' : `${st.ammo} / ${st.max}`;
      if (last.ammo !== at) {
        ammoTxt.textContent = last.ammo = at;
        ammoTxt.style.color = st.reloading >= 0 ? '#e8542a' : st.ammo <= st.max * 0.2 ? '#e8a23a' : '#e8e4d5';
        ammoTxt.style.fontSize = st.reloading >= 0 ? '15px' : '22px';
      }
      reloadBar.style.display = st.reloading >= 0 ? 'block' : 'none';
      if (st.reloading >= 0) reloadFill.style.width = Math.round(st.reloading * 100) + '%';
      const showCross = st.alive ? 'block' : 'none';
      if (last.cross !== showCross) {
        cross.style.display = ammoBox.style.display = showCross;
        last.cross = showCross;
      }
      aimBtn.style.background = st.aiming ? 'rgba(201,151,63,0.6)' : 'rgba(10,15,12,0.5)';
    },
    minimap(soldiers, mortars, player, yaw, world) {
      const sx = (x) => ((x - FIELD.minX) / (FIELD.maxX - FIELD.minX)) * mm.width;
      const sz = (z) => ((z - FIELD.minZ) / (FIELD.maxZ - FIELD.minZ)) * mm.height;
      const kx = mm.width / (FIELD.maxX - FIELD.minX);
      mg.clearRect(0, 0, mm.width, mm.height);
      mg.fillStyle = 'rgba(70,74,50,0.55)';
      mg.fillRect(0, 0, mm.width, mm.height);
      mg.fillStyle = 'rgba(20,20,16,0.85)';
      for (const b of world.boxes) mg.fillRect(sx(b.minX), sz(b.minZ), (b.maxX - b.minX) * kx, (b.maxZ - b.minZ) * kx);
      for (const c of world.circles) {
        mg.beginPath();
        mg.arc(sx(c.x), sz(c.z), Math.max(2, c.r * kx), 0, Math.PI * 2);
        mg.fill();
      }
      for (const m of mortars) {
        mg.strokeStyle = '#e8542a';
        mg.lineWidth = 2;
        mg.beginPath();
        mg.arc(sx(m.pos.x), sz(m.pos.z), 3.2 * kx, 0, Math.PI * 2);
        mg.stroke();
      }
      for (const s of soldiers) {
        if (!s.alive) continue;
        if (s.isPlayer) continue;
        mg.fillStyle = s.team === 'enemy' ? enemyColor : '#c9973f';
        mg.beginPath();
        mg.arc(sx(s.pos.x), sz(s.pos.z), 5, 0, Math.PI * 2);
        mg.fill();
      }
      if (player.alive) {
        const px = sx(player.pos.x);
        const pz = sz(player.pos.z);
        const fx = Math.sin(yaw);
        const fz = Math.cos(yaw);
        mg.fillStyle = '#fff';
        mg.beginPath();
        mg.moveTo(px + fx * 12, pz + fz * 12);
        mg.lineTo(px - fz * 7 - fx * 5, pz + fx * 7 - fz * 5);
        mg.lineTo(px + fz * 7 - fx * 5, pz - fx * 7 - fz * 5);
        mg.closePath();
        mg.fill();
      }
    },
    dispose() {
      root.remove();
    },
  };
  return api;
}
