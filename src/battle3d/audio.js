// Tiny synthesized sound effects (no audio files needed).
export function createAudio() {
  let ctx = null;
  let noise = null;
  let master = null;
  let recent = 0;
  let lastT = 0;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    const len = ctx.sampleRate;
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  // Throttle so a big firefight doesn't clip.
  function allow() {
    if (!ctx || ctx.state !== 'running') return false;
    const now = ctx.currentTime;
    recent = Math.max(0, recent - (now - lastT) * 20);
    lastT = now;
    if (recent > 10) return false;
    recent++;
    return true;
  }
  function burst({ vol, dur, freq, q = 0.8, type = 'lowpass', thump = 0, thumpF = 90 }) {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random() * 0.5, dur + 0.05);
    if (thump) {
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.frequency.setValueAtTime(thumpF, t);
      o.frequency.exponentialRampToValueAtTime(thumpF * 0.4, t + dur);
      og.gain.setValueAtTime(thump * vol, t);
      og.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(og).connect(master);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }
  return {
    unlock() {
      const c = ensure();
      if (c && c.state === 'suspended') c.resume();
    },
    shot(vol, pistol) {
      if (!allow()) return;
      burst({ vol: vol * 0.9, dur: pistol ? 0.12 : 0.16, freq: pistol ? 2600 : 1800, thump: 0.8, thumpF: pistol ? 160 : 110 });
    },
    boom(vol) {
      if (!ctx || ctx.state !== 'running') return;
      burst({ vol: vol * 1.4, dur: 1.2, freq: 380, thump: 1.2, thumpF: 60 });
    },
    hit() {
      if (!allow()) return;
      burst({ vol: 0.25, dur: 0.05, freq: 3500, type: 'highpass' });
    },
    whiz() {
      if (!allow()) return;
      burst({ vol: 0.18, dur: 0.18, freq: 4200, type: 'bandpass', q: 6 });
    },
    reload() {
      if (!allow()) return;
      burst({ vol: 0.2, dur: 0.06, freq: 2500, type: 'bandpass', q: 3 });
      setTimeout(() => ctx && burst({ vol: 0.22, dur: 0.07, freq: 1800, type: 'bandpass', q: 3 }), 260);
    },
    dispose() {
      if (ctx) ctx.close();
      ctx = null;
    },
  };
}
