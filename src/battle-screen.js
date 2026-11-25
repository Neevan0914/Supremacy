// Replacement for the bundled app's battle component (`i2`).
// It runs inside the minified React bundle, so it uses the bundle's own
// names: `g` is the React module, `Ra` is base troop HP (30), `Sm` is squad size (5).
function i2({ target: l, onResolved: t, paused: e, playerDebuffed: n, nations: a }) {
  const R = g.default;
  const mount = (0, g.useRef)(null);
  const game = (0, g.useRef)(null);
  const pausedRef = (0, g.useRef)(e);
  pausedRef.current = e;
  const [stats, setStats] = (0, g.useState)({ playerAlive: Sm, enemyAlive: Sm, time: 90 });
  const [result, setResult] = (0, g.useState)(null);
  const [died, setDied] = (0, g.useState)(!1);
  const [error, setError] = (0, g.useState)(null);

  (0, g.useEffect)(() => {
    game.current && game.current.setPaused(e);
  }, [e]);

  (0, g.useEffect)(() => {
    let cancelled = !1;
    let timer = null;
    const color = a[l.owner]?.color || '#a6402f';
    if (!window.Battle3D) {
      setError('3D engine failed to load.');
      return;
    }
    window.Battle3D.createBattle(mount.current, {
      difficulty: l.strength,
      enemyColor: color,
      playerHp: n ? Math.round(Ra * 0.8) : Ra,
      enemyHp: Ra + l.strength * 1.5,
      seed: ((l.q * 73856093) ^ (l.r * 19349663) ^ 0x5bd1e995) >>> 0,
      isCancelled: () => cancelled,
      onStats: setStats,
      onPlayerDied: () => setDied(!0),
      onOver: (win) => {
        setResult(win ? 'WIN' : 'LOSS');
        timer = setTimeout(() => t(win), 1400);
      },
    })
      .then((gm) => {
        if (!gm) return;
        if (cancelled) return gm.dispose();
        game.current = gm;
        gm.setPaused(pausedRef.current);
      })
      .catch((x) => {
        console.error(x);
        setError('3D battle could not start: ' + ((x && x.message) || x));
      });
    return () => {
      cancelled = !0;
      clearTimeout(timer);
      game.current && game.current.dispose();
      game.current = null;
    };
  }, []);

  const color = a[l.owner]?.color || '#a6402f';
  const name = a[l.owner]?.name || 'HOSTILE';
  const mono = "'IBM Plex Mono', monospace";
  const btn = {
    flex: 1,
    background: '#161d15',
    border: '1px solid #2a3630',
    color: '#c8c4b5',
    padding: '6px 4px',
    borderRadius: 4,
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: '0.06em',
    cursor: 'pointer',
  };
  const overlay = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  return R.createElement(
    'div',
    { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: '100%', maxWidth: 1100 } },
    R.createElement(
      'div',
      { style: { width: '100%', display: 'flex', justifyContent: 'space-between', fontFamily: mono, fontSize: 10, color: '#8a9186', letterSpacing: '0.08em' } },
      R.createElement('span', null, 'SECTOR ', l.q, ',', l.r),
      R.createElement('span', { style: { color: '#e8542a' } }, 'T-', stats.time, 's'),
    ),
    R.createElement(
      'div',
      { style: { width: '100%', display: 'flex', justifyContent: 'space-between' } },
      R.createElement('span', { style: { fontSize: 9, color, fontFamily: mono, letterSpacing: '0.08em' } }, name, ' \xB7 ', stats.enemyAlive, '/', Sm, ' TROOPS'),
      R.createElement('span', { style: { fontSize: 9, color: '#c9973f', fontFamily: mono, letterSpacing: '0.08em' } }, 'YOUR SQUAD \xB7 ', stats.playerAlive, '/', Sm, ' TROOPS'),
    ),
    R.createElement(
      'div',
      { style: { position: 'relative', width: '100%', height: 'min(68vh, 640px)', minHeight: 300, borderRadius: 6, border: '1px solid #232f27', overflow: 'hidden', background: '#0f140f' } },
      R.createElement('div', { ref: mount, style: { position: 'absolute', inset: 0 } }),
      error &&
        R.createElement(
          'div',
          { style: { ...overlay, padding: 20, textAlign: 'center', fontFamily: mono, fontSize: 11, color: '#e8542a', background: '#0f140f' } },
          error,
        ),
    ),
    R.createElement(
      'div',
      { style: { display: 'flex', gap: 8, width: '100%', maxWidth: 520 } },
      R.createElement('button', { onClick: () => game.current && game.current.switchWeapon(), style: btn }, 'SWITCH WEAPON (1/2)'),
      R.createElement('button', { onClick: () => game.current && game.current.reload(), style: btn }, 'RELOAD (R)'),
      died && !result && R.createElement('button', { onClick: () => game.current && game.current.spectateNext(), style: btn }, 'NEXT SQUADMATE'),
    ),
    R.createElement(
      'p',
      { style: { fontFamily: mono, fontSize: 9, color: '#8a9186', textAlign: 'center', maxWidth: 640, margin: 0, lineHeight: 1.6 } },
      'PC: CLICK TO LOCK MOUSE \xB7 WASD MOVE \xB7 MOUSE LOOKS \xB7 CLICK/SPACE FIRES \xB7 RIGHT-CLICK/Q AIMS \xB7 SHIFT SPRINTS \xB7 R RELOADS \xB7 1/2 OR SCROLL SWITCHES',
      R.createElement('br', null),
      'TOUCH: LEFT SIDE MOVES \xB7 DRAG RIGHT SIDE TO LOOK \xB7 HOLD FIRE \xB7 TAP AIM',
      R.createElement('br', null),
      'WATCH FOR RED MORTAR CIRCLES — GET OUT OF THEM',
    ),
    died &&
      !result &&
      R.createElement(
        'div',
        { style: { ...overlay, flexDirection: 'column', background: 'rgba(120,15,15,0.38)', zIndex: 45 } },
        R.createElement(
          'div',
          { style: { fontFamily: "'Oswald', sans-serif", fontSize: 'clamp(30px, 9vw, 48px)', fontWeight: 700, letterSpacing: '0.08em', color: '#e8542a', textShadow: '0 2px 10px rgba(0,0,0,0.7)' } },
          'YOU DIED',
        ),
        R.createElement(
          'div',
          { style: { fontFamily: mono, fontSize: 11, color: '#e8e4d5', marginTop: 8, letterSpacing: '0.05em', textShadow: '0 1px 4px rgba(0,0,0,0.8)' } },
          'YOUR TROOPS FIGHT ON WITHOUT YOU',
        ),
        R.createElement(
          'button',
          { onClick: () => setDied(!1), style: { marginTop: 18, background: '#e8542a', border: 'none', color: '#0a0f0c', padding: '8px 20px', borderRadius: 4, fontFamily: mono, fontWeight: 600, fontSize: 11, letterSpacing: '0.06em', cursor: 'pointer' } },
          'SPECTATE',
        ),
      ),
    result &&
      R.createElement(
        'div',
        { style: { ...overlay, background: 'rgba(10,15,12,0.7)', zIndex: 50 } },
        R.createElement(
          'div',
          { style: { fontFamily: "'Oswald', sans-serif", fontSize: 'clamp(24px, 8vw, 40px)', fontWeight: 700, letterSpacing: '0.06em', textAlign: 'center', width: '90%', maxWidth: 340, color: result === 'WIN' ? '#7fae4f' : '#a6402f' } },
          result === 'WIN' ? 'TERRITORY SEIZED' : 'FORCES REPELLED',
        ),
      ),
  );
}
