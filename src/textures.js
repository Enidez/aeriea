// Textures procédurales (générées au chargement, rien à télécharger) : albedo + normal maps tuilables.
import * as THREE from 'three';
import { rng, clamp } from './util.js';

// bruit de valeur périodique (tuilable) multi-octaves → Float32Array [0..1]
function noise(size, freq, oct, seed, stretch = [1, 1]) {
  const out = new Float32Array(size * size); const R = rng(seed);
  let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) {
    const fx = Math.max(1, Math.round(freq * stretch[0] * 2 ** o)), fy = Math.max(1, Math.round(freq * stretch[1] * 2 ** o));
    const g = new Float32Array(fx * fy); for (let i = 0; i < g.length; i++) g[i] = R();
    for (let y = 0; y < size; y++) {
      const gy = y / size * fy, y0 = Math.floor(gy), ty = gy - y0, sy = ty * ty * (3 - 2 * ty), y1 = (y0 + 1) % fy;
      for (let x = 0; x < size; x++) {
        const gx = x / size * fx, x0 = Math.floor(gx), tx = gx - x0, sx = tx * tx * (3 - 2 * tx), x1 = (x0 + 1) % fx;
        const a = g[y0 * fx + x0], b = g[y0 * fx + x1], c = g[y1 * fx + x0], d = g[y1 * fx + x1];
        out[y * size + x] += amp * ((a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy);
      }
    }
    tot += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
const mix = (a, b, t) => a + (b - a) * t;
function canvas(size) { const c = document.createElement('canvas'); c.width = c.height = size; return c; }

function toTexture(cv, srgb, repeat = true) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
// albedo à partir d'une fonction (i, x, y) → [r,g,b] (0..255)
function paint(size, fn) {
  const cv = canvas(size), ctx = cv.getContext('2d'), img = ctx.createImageData(size, size), d = img.data;
  for (let y = 0, i = 0; y < size; y++) for (let x = 0; x < size; x++, i++) { const c = fn(i, x, y); d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = c[3] ?? 255; }
  ctx.putImageData(img, 0, 0); return cv;
}
// normal map depuis une carte de hauteur (Sobel, bords tuilables)
function normalFrom(h, size, strength) {
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  return paint(size, (i, x, y) => {
    const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    let nx = -dx * strength, ny = dy * strength, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    return [(nx * 0.5 + 0.5) * 255, (ny * 0.5 + 0.5) * 255, (nz * 0.5 + 0.5) * 255];
  });
}
const col = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const lerpC = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const mulC = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

// --------------------------------------------------------------- sols
function grass(S = 512) {
  const n1 = noise(S, 4, 5, 11), n2 = noise(S, 32, 3, 12);
  const a = col(0x3f6e24), b = col(0x6b9a36), c = col(0x8aa848);
  const cv = paint(S, (i) => { let k = lerpC(a, b, n1[i]); k = lerpC(k, c, clamp((n2[i] - 0.55) * 2.5, 0, 1)); return mulC(k, 0.82 + n2[i] * 0.3); });
  // brins
  const ctx = cv.getContext('2d'), R = rng(5);
  for (let i = 0; i < 9000; i++) {
    const x = R() * S, y = R() * S, l = 3 + R() * 7, ang = -Math.PI / 2 + (R() - 0.5) * 0.9, sh = R();
    ctx.strokeStyle = `rgba(${sh < 0.5 ? '40,70,20' : '150,185,80'},${0.25 + R() * 0.35})`; ctx.lineWidth = 0.8 + R();
    for (const ox of [0, -S, S]) for (const oy of [0, -S, S]) { ctx.beginPath(); ctx.moveTo(x + ox, y + oy); ctx.lineTo(x + ox + Math.cos(ang) * l, y + oy + Math.sin(ang) * l); ctx.stroke(); }
  }
  return cv;
}
function dirt(S = 256) {
  const n1 = noise(S, 4, 5, 21), n2 = noise(S, 48, 2, 22);
  const cv = paint(S, (i) => mulC(lerpC(col(0x5e4a30), col(0x8c7350), n1[i]), 0.75 + n2[i] * 0.45));
  const ctx = cv.getContext('2d'), R = rng(23);
  for (let i = 0; i < 700; i++) { const x = R() * S, y = R() * S, r = 0.6 + R() * 2; const g = 90 + R() * 80 | 0; ctx.fillStyle = `rgb(${g},${g - 8},${g - 20})`; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
  return cv;
}
function rockHeight(S) {
  const n1 = noise(S, 3, 6, 31), n2 = noise(S, 6, 4, 32, [0.35, 2.4]), h = new Float32Array(S * S);
  for (let i = 0; i < h.length; i++) { const r = 1 - Math.abs(n1[i] * 2 - 1); h[i] = r * 0.55 + n2[i] * 0.45; }
  return h;
}
function rock(S = 512) {
  const h = rockHeight(S), n3 = noise(S, 40, 2, 33);
  return { map: paint(S, (i) => mulC(lerpC(col(0x5b5650), col(0x9a9387), h[i]), 0.8 + n3[i] * 0.35)), normal: normalFrom(h, S, 2.2) };
}
function sand(S = 256) { const n1 = noise(S, 5, 4, 41), n2 = noise(S, 80, 1, 42); return paint(S, (i) => mulC(lerpC(col(0xc7b07a), col(0xe3d3a1), n1[i]), 0.88 + n2[i] * 0.2)); }
function snow(S = 256) { const n1 = noise(S, 4, 4, 51), n2 = noise(S, 90, 1, 52); return paint(S, (i) => { const k = lerpC(col(0xc9d6e6), col(0xf7fafd), n1[i]); return n2[i] > 0.93 ? [255, 255, 255] : k; }); }

// --------------------------------------------------------------- matériaux de construction
function stoneWall(S = 512) {
  const R = rng(61), h = new Float32Array(S * S), tint = new Float32Array(S * S), n = noise(S, 16, 4, 62), n2 = noise(S, 3, 3, 63);
  const rows = 8, rh = S / rows;
  for (let r = 0; r < rows; r++) {
    let x = R() * 40; const y0 = r * rh;
    const blocks = []; while (x < S + 40) { const w = 50 + R() * 70; blocks.push([x, w, R()]); x += w; }
    for (let y = Math.floor(y0); y < Math.floor(y0 + rh); y++) for (let px = 0; px < S; px++) {
      let xx = px + (r % 2) * 37;
      const b = blocks.find(([bx, bw]) => ((xx - bx) % S + S) % S < bw) || blocks[0];
      const lx = ((xx - b[0]) % S + S) % S, ly = y - y0, edge = Math.min(lx, b[1] - lx, ly, rh - ly);
      const i = y * S + px;
      h[i] = edge < 2.5 ? 0.05 : clamp(edge / 7, 0.3, 1) * (0.75 + n[i] * 0.25);
      tint[i] = edge < 2.5 ? -1 : b[2];
    }
  }
  const map = paint(S, (i) => {
    if (tint[i] < 0) return mulC(col(0x6b665c), 0.7 + n[i] * 0.3);
    const k = lerpC(col(0x8f897d), col(0xb5ad9c), tint[i]);
    return mulC(lerpC(k, col(0x6e7a5a), clamp((n2[i] - 0.62) * 3, 0, 0.5)), 0.78 + n[i] * 0.32 + h[i] * 0.08);
  });
  return { map, normal: normalFrom(h, S, 3) };
}
function roofTiles(S = 512) {
  const h = new Float32Array(S * S), tint = new Float32Array(S * S), n = noise(S, 24, 3, 71), R = rng(72);
  const rows = 12, cols = 12, rh = S / rows, cw = S / cols, rnd = Array.from({ length: rows * cols }, () => R());
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const r = Math.floor(y / rh), xx = (x + (r % 2) * cw / 2) % S, c = Math.floor(xx / cw);
    const lx = (xx - c * cw) / cw, ly = (y - r * rh) / rh;
    const i = y * S + x;
    h[i] = Math.sqrt(Math.max(0, 1 - (2 * lx - 1) ** 2)) * (0.4 + ly * 0.6);
    tint[i] = rnd[(r * cols + c) % rnd.length];
  }
  const map = paint(S, (i) => mulC(lerpC(col(0x7e2a1e), col(0xb2533a), tint[i]), (0.55 + h[i] * 0.55) * (0.85 + n[i] * 0.25)));
  return { map, normal: normalFrom(h, S, 2.5) };
}
function planks(S = 256) {
  const g = noise(S, 3, 4, 81, [0.25, 6]), n = noise(S, 30, 2, 82), h = new Float32Array(S * S), R = rng(83);
  const pl = 6, pw = S / pl, tints = Array.from({ length: pl }, () => R());
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const p = Math.floor(x / pw), lx = x - p * pw; h[y * S + x] = lx < 2 ? 0 : 0.6 + g[y * S + x] * 0.4; }
  const map = paint(S, (i, x) => { const p = Math.floor(x / pw); if (h[i] === 0) return col(0x2a1b0e); return mulC(lerpC(col(0x5a3b1f), col(0x8a6036), tints[p] * 0.6 + g[i] * 0.4), 0.85 + n[i] * 0.2); });
  return { map, normal: normalFrom(h, S, 1.5) };
}
function plaster(S = 256) {
  const n1 = noise(S, 4, 5, 91), n2 = noise(S, 40, 2, 92);
  const h = new Float32Array(S * S); for (let i = 0; i < h.length; i++) h[i] = n1[i] * 0.6 + n2[i] * 0.4;
  return { map: paint(S, (i) => mulC(lerpC(col(0xd9ccad), col(0xf0e7d2), n1[i]), 0.9 + n2[i] * 0.12)), normal: normalFrom(h, S, 0.8) };
}
function leaves(S = 256) {
  const cv = paint(S, () => col(0x34561f)), ctx = cv.getContext('2d'), R = rng(101);
  for (let i = 0; i < 2600; i++) {
    const x = R() * S, y = R() * S, r = 2 + R() * 4, l = R();
    ctx.fillStyle = `rgb(${50 + l * 70 | 0},${85 + l * 85 | 0},${30 + l * 35 | 0})`;
    for (const ox of [0, -S, S]) for (const oy of [0, -S, S]) { ctx.beginPath(); ctx.ellipse(x + ox, y + oy, r, r * 0.55, R() * 3, 0, 7); ctx.fill(); }
  }
  return cv;
}
function bark(S = 128) { const g = noise(S, 3, 4, 111, [4, 0.3]), n = noise(S, 20, 2, 112); return paint(S, (i) => mulC(lerpC(col(0x3a2a1c), col(0x6e563c), g[i]), 0.8 + n[i] * 0.3)); }
// écailles de dragon
function scales(S = 512) {
  const h = new Float32Array(S * S), n = noise(S, 20, 3, 121), cols = 16, rows = 16, cw = S / cols, rh = S / rows;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const r = Math.floor(y / rh), xx = (x + (r % 2) * cw / 2) % S, c = Math.floor(xx / cw);
    const lx = (xx - c * cw) / cw * 2 - 1, ly = (y - r * rh) / rh;
    const d = Math.hypot(lx, (ly - 0.15) * 1.3);
    h[y * S + x] = clamp(1 - d, 0, 1) ** 0.6 * (0.3 + ly * 0.7);
  }
  return { map: paint(S, (i) => { const v = 0.55 + h[i] * 0.6 + n[i] * 0.15; return [255 * Math.min(1, v), 255 * Math.min(1, v), 255 * Math.min(1, v)]; }), normal: normalFrom(h, S, 3.5) };
}
function waterNormal(S = 256) { const a = noise(S, 8, 4, 131), b = noise(S, 3, 3, 132), h = new Float32Array(S * S); for (let i = 0; i < h.length; i++) h[i] = a[i] * 0.6 + b[i] * 0.4; return normalFrom(h, S, 2.4); }
function cloudPuff(S = 128) {
  const n = noise(S, 5, 4, 141);
  return paint(S, (i, x, y) => { const d = Math.hypot(x / S * 2 - 1, y / S * 2 - 1); const a = clamp((1 - d) * 1.6, 0, 1) ** 1.5 * clamp(0.35 + n[i] * 1.1, 0, 1); return [255, 255, 255, a * 255]; });
}

export function makeTextures() {
  const r = rock(), sw = stoneWall(), rt = roofTiles(), pk = planks(), ps = plaster(), sc = scales();
  return {
    grass: toTexture(grass(), true), dirt: toTexture(dirt(), true), rock: toTexture(r.map, true), rockN: toTexture(r.normal, false),
    sand: toTexture(sand(), true), snow: toTexture(snow(), true),
    stone: toTexture(sw.map, true), stoneN: toTexture(sw.normal, false), roof: toTexture(rt.map, true), roofN: toTexture(rt.normal, false),
    wood: toTexture(pk.map, true), woodN: toTexture(pk.normal, false), plaster: toTexture(ps.map, true), plasterN: toTexture(ps.normal, false),
    leaves: toTexture(leaves(), true), bark: toTexture(bark(), true), scales: toTexture(sc.map, true), scalesN: toTexture(sc.normal, false),
    water: toTexture(waterNormal(), false), cloud: toTexture(cloudPuff(), true, false),
  };
}

// UV en unités monde sur une BoxGeometry (1 répétition = `tile` mètres)
export function boxUV(geo, tile) {
  const p = geo.attributes.position, nrm = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(nrm.getX(i)), ay = Math.abs(nrm.getY(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (ax > 0.5) uv.setXY(i, z / tile, y / tile); else if (ay > 0.5) uv.setXY(i, x / tile, z / tile); else uv.setXY(i, x / tile, y / tile);
  }
  uv.needsUpdate = true; return geo;
}
export function scaleUV(geo, su, sv) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); uv.needsUpdate = true; return geo; }
