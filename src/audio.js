// Sons réalistes : enregistrements (cris de rapace) + synthèse physique (métal, impacts, souffles, cloches).
import eagleCry from '../assets/eagle-cry.mp3';
import hawkCall from '../assets/hawk-call.mp3';

export function createAudio() {
  let ctx = null, master, noise, samples = {};
  const now = () => ctx.currentTime;
  function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  function noiseSrc() { const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; return s; }
  // bruit filtré avec balayage de fréquence (souffles, frottements)
  function swoosh({ f0 = 400, f1 = 1800, q = 1.2, dur = 0.25, vol = 0.25, type = 'bandpass', at = 0 }) {
    const t = now() + at, s = noiseSrc(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, dur * 0.35, vol, dur * 0.65); s.connect(f).connect(g).connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  // corps résonant : somme de partiels sinusoïdaux inharmoniques qui s'éteignent (métal, cloche)
  function partials(f0, ratios, decays, vol, at = 0, detune = 0) {
    const t = now() + at;
    ratios.forEach((r, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f0 * r * (1 + (Math.random() - 0.5) * detune);
      env(g, t, 0.003, vol / (1 + i * 0.6), decays[i] ?? decays[decays.length - 1]); o.connect(g).connect(master); o.start(t); o.stop(t + 3);
    });
  }
  function thump(f = 90, dur = 0.25, vol = 0.5, at = 0) {
    const t = now() + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(f * 1.8, t); o.frequency.exponentialRampToValueAtTime(f * 0.6, t + dur); env(g, t, 0.005, vol, dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function play(name, vol = 0.8, rate = 1) {
    const b = samples[name]; if (!b) return; const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = b; s.playbackRate.value = rate; g.gain.value = vol; s.connect(g).connect(master); s.start();
  }
  const api = {
    get ctx() { return ctx; },
    init() {
      if (ctx) { ctx.resume(); return ctx; }
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createDynamicsCompressor(); master.threshold.value = -14; master.ratio.value = 4; master.connect(ctx.destination);
        const len = ctx.sampleRate * 2; noise = ctx.createBuffer(1, len, ctx.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        for (const [n, u] of [['eagle', eagleCry], ['hawk', hawkCall]]) ctx.decodeAudioData(u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength)).then((b) => { samples[n] = b; }).catch(() => {});
      } catch (e) { ctx = null; }
      return ctx;
    },
    // ---- créatures
    eagle(vol = 0.75) { if (!ctx) return; play(Math.random() < 0.7 ? 'eagle' : 'hawk', vol, 0.92 + Math.random() * 0.16); },
    dragonRoar() {
      if (!ctx) return; const t = now(), dur = 1.8;
      const s = noiseSrc(), f = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      f.type = 'bandpass'; f.Q.value = 2.5; f.frequency.setValueAtTime(260, t); f.frequency.linearRampToValueAtTime(520, t + 0.5); f.frequency.exponentialRampToValueAtTime(180, t + dur);
      lfo.frequency.value = 23; lg.gain.value = 0.5; lfo.connect(lg).connect(g.gain);
      env(g, t, 0.25, 0.9, dur); s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + dur + 0.1); lfo.start(t); lfo.stop(t + dur + 0.1);
      const o = ctx.createOscillator(), og = ctx.createGain(), of = ctx.createBiquadFilter(); o.type = 'sawtooth'; of.type = 'lowpass'; of.frequency.value = 400;
      o.frequency.setValueAtTime(70, t); o.frequency.linearRampToValueAtTime(95, t + 0.6); o.frequency.exponentialRampToValueAtTime(48, t + dur);
      env(og, t, 0.3, 0.35, dur); o.connect(of).connect(og).connect(master); o.start(t); o.stop(t + dur + 0.1);
    },
    whistle() { if (!ctx) return; const t = now(); [0, 0.32].forEach((a, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(i ? 1500 : 1900, t + a); o.frequency.exponentialRampToValueAtTime(i ? 2300 : 1500, t + a + 0.25); env(g, t + a, 0.02, 0.12, 0.25); o.connect(g).connect(master); o.start(t + a); o.stop(t + a + 0.35); }); },
    // ---- mouvements
    whoosh(power = 1) { if (ctx) swoosh({ f0: 300, f1: 2200 * power, dur: 0.22 + 0.1 * power, vol: 0.22 * power }); },
    wing() { if (ctx) swoosh({ f0: 180, f1: 600, q: 0.8, dur: 0.4, vol: 0.3, type: 'lowpass' }); },
    thud(power = 1) { if (!ctx) return; thump(70, 0.3, 0.6 * power); swoosh({ f0: 900, f1: 150, q: 0.7, dur: 0.25, vol: 0.3 * power, type: 'lowpass' }); },
    splash() { if (ctx) { swoosh({ f0: 3000, f1: 500, q: 0.6, dur: 0.6, vol: 0.4, type: 'lowpass' }); swoosh({ f0: 1200, f1: 4000, q: 0.5, dur: 0.35, vol: 0.2, at: 0.05 }); } },
    fire() { if (ctx) { swoosh({ f0: 200, f1: 700, q: 0.6, dur: 0.45, vol: 0.45, type: 'lowpass' }); swoosh({ f0: 1500, f1: 3000, q: 0.5, dur: 0.3, vol: 0.08 }); } },
    // ---- combat
    clang() { if (!ctx) return; partials(520 + Math.random() * 80, [1, 2.76, 5.4, 8.93, 13.3], [0.9, 0.6, 0.35, 0.2, 0.12], 0.16, 0, 0.02); swoosh({ f0: 6000, f1: 2500, q: 0.7, dur: 0.07, vol: 0.35, type: 'highpass' }); },
    parry() { if (!ctx) return; partials(880, [1, 2.76, 5.4, 8.93], [1.6, 1.1, 0.6, 0.3], 0.2, 0, 0.01); partials(1320, [1, 2.4], [1.2, 0.8], 0.08, 0.02); swoosh({ f0: 8000, f1: 3000, q: 0.6, dur: 0.1, vol: 0.4, type: 'highpass' }); },
    hit() { if (!ctx) return; thump(110, 0.22, 0.55); swoosh({ f0: 1500, f1: 300, q: 0.9, dur: 0.16, vol: 0.4, type: 'lowpass' }); partials(330, [1, 2.3, 3.9], [0.25, 0.15, 0.1], 0.07, 0.01); },
    heavyHit() { if (!ctx) return; thump(70, 0.45, 0.8); swoosh({ f0: 2000, f1: 200, q: 0.8, dur: 0.3, vol: 0.5, type: 'lowpass' }); partials(240, [1, 2.76, 5.4], [0.8, 0.5, 0.3], 0.12, 0.01); },
    warn(red) { if (!ctx) return; if (red) { swoosh({ f0: 140, f1: 90, q: 3, dur: 0.6, vol: 0.5 }); thump(55, 0.6, 0.4); } else swoosh({ f0: 2500, f1: 900, q: 4, dur: 0.35, vol: 0.18 }); },
    unsheathe(on) { if (!ctx) return; swoosh({ f0: on ? 2500 : 5000, f1: on ? 6000 : 2000, q: 3, dur: 0.35, vol: 0.15 }); partials(on ? 1400 : 900, [1, 2.76], [0.4, 0.2], 0.05, 0.3); },
    // ---- récompenses
    coin() { if (!ctx) return; partials(2100, [1, 1.52, 2.7], [0.18, 0.12, 0.08], 0.09); partials(2650, [1, 1.52, 2.7], [0.22, 0.14, 0.1], 0.08, 0.07); },
    ring(i = 0) { if (!ctx) return; const f = 660 * Math.pow(2, (i % 8) / 12); partials(f, [1, 2.4, 3.9, 5.3], [1.4, 0.9, 0.5, 0.3], 0.12); swoosh({ f0: 400, f1: 2000, dur: 0.4, vol: 0.12 }); },
    trick(n = 1) { if (!ctx) return; swoosh({ f0: 500, f1: 3000, dur: 0.25, vol: 0.12 }); partials(523 * Math.pow(2, Math.min(n, 12) / 12), [1, 2.4, 3.9], [0.6, 0.4, 0.2], 0.08, 0.05); },
    bail() { if (!ctx) return; swoosh({ f0: 1500, f1: 120, q: 0.8, dur: 0.5, vol: 0.3, type: 'lowpass' }); thump(60, 0.4, 0.4, 0.15); },
    fanfare() { // cor de chasse : dents de scie filtrées, léger vibrato
      if (!ctx) return; const notes = [[392, 0], [523, 0.18], [659, 0.36], [784, 0.54], [659, 0.8], [784, 0.95]];
      for (const [f, a] of notes) { const t = now() + a, o = ctx.createOscillator(), o2 = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain(), vib = ctx.createOscillator(), vg = ctx.createGain();
        o.type = o2.type = 'sawtooth'; o.frequency.value = f; o2.frequency.value = f * 1.004; fl.type = 'lowpass'; fl.frequency.setValueAtTime(600, t); fl.frequency.linearRampToValueAtTime(2200, t + 0.08);
        vib.frequency.value = 5.5; vg.gain.value = 3; vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
        const d = a > 0.9 ? 1.1 : 0.3; env(g, t, 0.04, 0.09, d); o.connect(fl); o2.connect(fl); fl.connect(g).connect(master);
        for (const x of [o, o2, vib]) { x.start(t); x.stop(t + d + 0.1); } }
    },
    victory() { api.fanfare(); setTimeout(() => api.clang(), 1300); },
    // ---- interface (discrète)
    tick() { if (ctx) swoosh({ f0: 3500, f1: 3000, q: 4, dur: 0.03, vol: 0.12 }); },
    select() { if (ctx) { swoosh({ f0: 2000, f1: 1500, q: 3, dur: 0.05, vol: 0.15 }); partials(1200, [1, 2.4], [0.12, 0.08], 0.05); } },
  };
  return api;
}
