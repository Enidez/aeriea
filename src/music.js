// Bande-son adaptative : un morceau par situation, fondu enchaîné quand la situation change.
// Les fichiers sont servis à côté du jeu (music/*.mp3) ; s'ils manquent (fichier ouvert hors ligne), le jeu reste muet sans erreur.
const TRACKS = { village: 'music/village.mp3', explore: 'music/explore.mp3', winter: 'music/winter.mp3', horse: 'music/horse.mp3', eagle: 'music/eagle.mp3', dragon: 'music/dragon.mp3', boss: 'music/boss.mp3' };

export function createMusic() {
  const els = {}; let cur = null, volume = 0.6, started = false, pending = null;
  for (const [k, src] of Object.entries(TRACKS)) { const a = new Audio(); a.src = src; a.loop = true; a.preload = 'none'; a.volume = 0; a.onerror = () => { a.broken = true; }; els[k] = a; }
  const target = {};
  return {
    start() { started = true; if (pending) { const p = pending; pending = null; this.play(p); } },
    setVolume(v) { volume = v; },
    get volume() { return volume; },
    play(name) {
      if (!started) { pending = name; return; }
      if (name === cur) return; cur = name;
      for (const k in els) target[k] = k === name ? 1 : 0;
      const a = els[name]; if (a && !a.broken && a.paused) { a.preload = 'auto'; a.play().catch(() => {}); }
    },
    update(dt) { // fondus (≈2,5 s)
      for (const k in els) {
        const a = els[k], want = (target[k] || 0) * volume; if (a.paused && want === 0) continue;
        const v = a.volume + Math.sign(want - a.volume) * Math.min(Math.abs(want - a.volume), dt * 0.4);
        a.volume = Math.max(0, Math.min(1, v)); if (a.volume === 0 && want === 0 && !a.paused) a.pause();
      }
    },
  };
}
