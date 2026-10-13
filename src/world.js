// Monde : terrain texturé, eau, château, village, menhirs, forêts, herbe, nuages.
import * as THREE from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, lerp, smooth, rng } from './util.js';
import { boxUV, scaleUV } from './textures.js';

export const WORLD = 3400;
export const CASTLE = { x: 260, z: -200, h: 42 };
export const VILLAGE = { x: 60, z: 170, h: 16 };
export const LAKE = { x: -360, z: 320 };
export const STONES = { x: -230, z: -480 };
const perlin = new ImprovedNoise();
export const noise2 = (x, z, s) => perlin.noise(x, z, s);
function fbm(x, z, oct) { let a = 1, f = 1, s = 0, n = 0; for (let i = 0; i < oct; i++) { s += a * perlin.noise(x * f, z * f, 1.7 + i * 13.1); n += a; a *= 0.5; f *= 2.03; } return s / n; }
// quatre saisons réparties autour du centre (printemps au cœur, autour du château et du village)
const SEASONS = [['winter', -2.36], ['summer', -0.79], ['autumn', 0.79], ['spring', 2.36]];
export function seasonAt(x, z) {
  const r = Math.hypot(x, z), th = Math.atan2(z, x), w = {}; let sum = 0;
  for (const [k, a] of SEASONS) { const c = Math.max(0, Math.cos(th - a)); w[k] = c ** 3; sum += w[k]; }
  for (const k in w) w[k] /= sum || 1;
  const core = smooth(520, 380, r); // cœur printanier
  for (const k in w) w[k] = w[k] * (1 - core) + (k === 'spring' ? core : 0);
  return w;
}
export const LAKES = [[LAKE.x, LAKE.z, 320], [-700, -620, 260], [-1050, -150, 200], [760, -560, 240], [420, -950, 170], [620, 560, 280], [380, 820, 180], [920, 300, 200], [-720, 720, 240]];
export function heightAt(x, z) {
  const r = Math.hypot(x, z);
  const n = fbm(x * 0.0025, z * 0.0025, 5), s = seasonAt(x, z);
  let h = 16 + n * 45;
  const rid = 1 - Math.abs(perlin.noise(x * 0.0026, z * 0.0026, 42.5));
  h += smooth(520, 1250, r) * (rid ** 1.6 * 230 + n * 90) * (1 - s.summer * 0.55);
  h += s.summer * (Math.sin(x * 0.03 + perlin.noise(x * 0.004, z * 0.004, 7) * 6) * 4 + 3); // dunes
  for (const [lx, lz, lr] of LAKES) h -= smooth(lr, lr * 0.15, Math.hypot(x - lx, z - lz)) * (h + 14);
  h = lerp(h, CASTLE.h, smooth(175, 100, Math.hypot(x - CASTLE.x, z - CASTLE.z)));
  h = lerp(h, VILLAGE.h, smooth(160, 85, Math.hypot(x - VILLAGE.x, z - VILLAGE.z)));
  h = lerp(h, -40, smooth(1400, 1650, r));
  return h;
}
export function slopeAt(x, z) { const e = 4; return Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e); }

// grille du terrain : groundAt interpole exactement comme le maillage (pas de pieds qui flottent)
const SEG = 400, N1 = SEG + 1, CELL = WORLD / SEG, H0 = -WORLD / 2;
const heights = new Float32Array(N1 * N1);
for (let iz = 0; iz < N1; iz++) for (let ix = 0; ix < N1; ix++) heights[iz * N1 + ix] = heightAt(H0 + ix * CELL, H0 + iz * CELL);
export function terrainAt(x, z) {
  const fx = (x - H0) / CELL, fz = (z - H0) / CELL;
  if (fx < 0 || fz < 0 || fx >= SEG || fz >= SEG) return heightAt(x, z);
  const ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz;
  const ha = heights[iz * N1 + ix], hb = heights[(iz + 1) * N1 + ix], hc = heights[(iz + 1) * N1 + ix + 1], hd = heights[iz * N1 + ix + 1];
  return u + v <= 1 ? ha + (hd - ha) * u + (hb - ha) * v : hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v);
}
export const groundAt = (x, z) => Math.max(terrainAt(x, z), 0);

export const colliders = []; // cylindres {x,z,r,top}
export const boxes = []; // murs {x0,x1,z0,z1,top}
export const flags = [];
export const animated = []; // (dt, t) => void
export let windmillBlades;

// ---------------------------------------------------------------- matériaux
export function makeMaterials(tex) {
  const S = (map, normal, extra = {}) => new THREE.MeshStandardMaterial({ map, normalMap: normal, roughness: 0.88, ...extra });
  return {
    stone: S(tex.stone, tex.stoneN), stoneDark: S(tex.stone, tex.stoneN, { color: 0x9c958a }),
    roof: S(tex.roof, tex.roofN, { roughness: 0.7 }), roofBlue: S(tex.roof, tex.roofN, { color: 0x7d9ae6, roughness: 0.6 }),
    wood: S(tex.wood, tex.woodN, { roughness: 0.8 }), beam: S(tex.wood, tex.woodN, { color: 0x6b5a4a }), plaster: S(tex.plaster, tex.plasterN, { roughness: 0.95 }),
    flagBlue: new THREE.MeshStandardMaterial({ color: 0x2846a8, side: THREE.DoubleSide, roughness: 0.9 }),
    flagRed: new THREE.MeshStandardMaterial({ color: 0xa8282f, side: THREE.DoubleSide, roughness: 0.9 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xffc93c, metalness: 0.8, roughness: 0.3 }),
    menhir: S(tex.rock, tex.rockN, { color: 0xb8b2a8 }),
    bark: new THREE.MeshStandardMaterial({ map: tex.bark, roughness: 1 }),
  };
}

function add(mesh, x, y, z, parent) { mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh; }
const box = (w, h, d, m, tile = 4) => new THREE.Mesh(boxUV(new THREE.BoxGeometry(w, h, d), tile), m);
const cyl = (rt, rb, h, m, s = 16, tile = 4) => new THREE.Mesh(scaleUV(new THREE.CylinderGeometry(rt, rb, h, s), Math.PI * 2 * Math.max(rt, rb) / tile, h / tile), m);
const cone = (r, h, m, s = 16, tile = 3) => new THREE.Mesh(scaleUV(new THREE.ConeGeometry(r, h, s), Math.PI * 2 * r / tile, Math.hypot(r, h) / tile), m);

export function buildWorld(scene, tex, mats) {
  buildTerrain(scene, tex);
  buildWater(scene, tex);
  buildCastle(scene, mats);
  buildVillage(scene, mats);
  buildTrees(scene, tex, mats);
  buildClouds(scene, tex);
  return buildGrass(scene);
}

// ---------------------------------------------------------------- terrain
function buildTerrain(scene, tex) {
  const geo = new THREE.PlaneGeometry(WORLD, WORLD, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, n = pos.count;
  const tint = new Float32Array(n * 3), w = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = heights[i];
    pos.setY(i, h);
    const sl = slopeAt(x, z), v = perlin.noise(x * 0.01, z * 0.01, 3.3) * 0.5 + 0.5, v2 = perlin.noise(x * 0.0021, z * 0.0021, 8.8);
    // couches : sable < terre < roche < neige (chaque couche recouvre les précédentes)
    const se = seasonAt(x, z);
    let sand = Math.max(h < 3 ? 1 : smooth(6, 3, h), se.summer * smooth(0.9, 0.5, sl));
    let dirt = Math.max(smooth(0.42, 0.75, sl), smooth(0.25, 0.5, perlin.noise(x * 0.012, z * 0.012, 5.5)) * 0.8,
      smooth(75, 35, Math.hypot(x - VILLAGE.x, z - VILLAGE.z)) * 0.85, smooth(70, 50, Math.hypot(x - CASTLE.x, z - CASTLE.z)) * 0.9, se.autumn * (0.55 + v * 0.4));
    let rock = Math.max(smooth(0.78, 1.05, sl), smooth(200, 250, h));
    let snow = Math.max(smooth(260, 300, h), se.winter * smooth(1.1, 0.6, sl)) * (1 - smooth(1.2, 1.6, sl) * 0.6);
    sand *= (1 - dirt); const k1 = 1 - rock; sand *= k1; dirt *= k1; const k2 = 1 - snow; sand *= k2; dirt *= k2; rock *= k2;
    w.set([sand, dirt, rock, snow], i * 4);
    // teintes de saison : boue sombre et feuilles mortes en automne, sable doré en été, neige bleutée en hiver
    const tr = 0.86 + v * 0.22 + v2 * 0.08, tg = 0.9 + v * 0.16, tb = 0.86 + v * 0.12 - v2 * 0.08;
    tint.set([lerp(lerp(lerp(tr, 0.82, se.autumn), 1.05, se.summer), 0.95, se.winter), lerp(lerp(lerp(tg, 0.66, se.autumn), 0.95, se.summer), 1.0, se.winter), lerp(lerp(lerp(tb, 0.5, se.autumn), 0.82, se.summer), 1.08, se.winter)], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(tint, 3));
  geo.setAttribute('weights', new THREE.BufferAttribute(w, 4));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, normalMap: tex.rockN, normalScale: new THREE.Vector2(0.6, 0.6) });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { tGrass: { value: tex.grass }, tDirt: { value: tex.dirt }, tRock: { value: tex.rock }, tSand: { value: tex.sand }, tSnow: { value: tex.snow } });
    sh.vertexShader = 'attribute vec4 weights; varying vec4 vW; varying vec3 vWP; varying vec3 vWN;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n vW = weights; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = 'uniform sampler2D tGrass, tDirt, tRock, tSand, tSnow; varying vec4 vW; varying vec3 vWP; varying vec3 vWN;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `
        vec3 an = abs(normalize(vWN)); an = pow(an, vec3(4.0)); an /= (an.x + an.y + an.z);
        vec2 p = vWP.xz;
        float far = smoothstep(60.0, 400.0, length(vWP - cameraPosition));
        vec3 cg = mix(texture2D(tGrass, p / 7.0).rgb, texture2D(tGrass, p / 31.0 + 0.37).rgb, 0.35 + far * 0.4);
        vec3 cd = mix(texture2D(tDirt, p / 5.0).rgb, texture2D(tDirt, p / 23.0).rgb, 0.3 + far * 0.4);
        vec3 cs = texture2D(tSand, p / 5.0).rgb;
        vec3 cn = texture2D(tSnow, p / 9.0).rgb;
        vec3 cr = texture2D(tRock, vWP.zy / 18.0).rgb * an.x + texture2D(tRock, p / 18.0).rgb * an.y + texture2D(tRock, vWP.xy / 18.0).rgb * an.z;
        vec4 w = vW;
        float hr = dot(cr, vec3(0.333)), hd = dot(cd, vec3(0.333));
        w.z = clamp(w.z * (0.35 + hr * 1.8) + (w.z > 0.5 ? (w.z - 0.5) : 0.0), 0.0, 1.0);
        w.y = clamp(w.y * (0.5 + hd * 1.5), 0.0, 1.0);
        float wg = max(0.0, 1.0 - w.x - w.y - w.z - w.w);
        vec3 tc = (cg * wg + cs * w.x + cd * w.y + cr * w.z + cn * w.w) / max(wg + w.x + w.y + w.z + w.w, 1e-3);
        diffuseColor.rgb *= tc;`)
      .replace('#include <normal_fragment_maps>', `
        { vec3 mapN = texture2D(normalMap, vWP.xz / 18.0).xyz * 2.0 - 1.0; mapN.xy *= normalScale * (vW.z + vW.y * 0.5);
          normal = normalize(tbn * mapN); }`);
  };
  // la normal map du terrain a besoin d'UV : on garde celles du plan
  const terrain = new THREE.Mesh(geo, mat);
  terrain.receiveShadow = true; terrain.castShadow = false;
  scene.add(terrain);
}

// ---------------------------------------------------------------- eau
function buildWater(scene, tex) {
  const t = tex.water.clone(); t.repeat.set(2400, 2400); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const mat = new THREE.MeshStandardMaterial({ color: 0x184e6b, roughness: 0.06, metalness: 0.05, transparent: true, opacity: 0.82, normalMap: t, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.3 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000), mat);
  water.rotation.x = -Math.PI / 2; water.position.y = 0.2; water.receiveShadow = true;
  scene.add(water);
  animated.push((dt, time) => { t.offset.set(time * 0.012, time * 0.007); });
  // lacs gelés en hiver : glace brillante au-dessus de l'eau, masquée hors de la saison
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S; const ctx = cv.getContext('2d'), img = ctx.createImageData(S, S);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const x = (i / S - 0.5) * WORLD, z = (j / S - 0.5) * WORLD, w = seasonAt(x, z).winter, k = (j * S + i) * 4;
    const a2 = smooth(0.35, 0.6, w) * 255; img.data[k] = img.data[k + 1] = img.data[k + 2] = a2; img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const mask = new THREE.CanvasTexture(cv);
  const ice = new THREE.Mesh(new THREE.PlaneGeometry(WORLD, WORLD), new THREE.MeshStandardMaterial({ color: 0xdcecf7, roughness: 0.12, metalness: 0.1, alphaMap: mask, transparent: true, opacity: 0.92, normalMap: tex.rockN, normalScale: new THREE.Vector2(0.15, 0.15) }));
  ice.rotation.x = -Math.PI / 2; ice.position.y = 0.35; ice.receiveShadow = true; scene.add(ice);
}

// ---------------------------------------------------------------- drapeaux
function flag(x, y, z, parent, mats, color) {
  add(cyl(0.18, 0.22, 8, mats.wood, 6), x, y + 4, z, parent);
  const g = new THREE.PlaneGeometry(5, 3, 12, 4); g.translate(2.5, 0, 0);
  const f = add(new THREE.Mesh(g, color || mats.flagBlue), x, y + 6.4, z, parent);
  f.userData.base = g.attributes.position.array.slice(); flags.push(f);
}
animated.push((dt, t) => {
  for (const f of flags) { const a = f.geometry.attributes.position, b = f.userData.base; for (let i = 0; i < a.count; i++) { const x = b[i * 3], y = b[i * 3 + 1]; a.array[i * 3 + 2] = (Math.sin(t * 4 + x * 0.9 + y * 0.4) * 0.35 + Math.sin(t * 7.3 + x * 1.7) * 0.08) * x / 5; } a.needsUpdate = true; f.geometry.computeVertexNormals(); }
});

// ---------------------------------------------------------------- château
function buildCastle(scene, mats) {
  const g = new THREE.Group(); g.position.set(CASTLE.x, CASTLE.h, CASTLE.z); scene.add(g);
  const s = 46, H = 16, T = 4;
  const wall = (x, z, w, d) => { add(box(w, H, d, mats.stone), x, H / 2, z, g); boxes.push({ x0: CASTLE.x + x - w / 2, x1: CASTLE.x + x + w / 2, z0: CASTLE.z + z - d / 2, z1: CASTLE.z + z + d / 2, top: CASTLE.h + H + 2 }); };
  wall(0, -s, 2 * s, T); wall(-s, 0, T, 2 * s); wall(s, 0, T, 2 * s);
  wall(-s / 2 - 4, s, s - 8, T); wall(s / 2 + 4, s, s - 8, T);
  add(box(16, 5, T + 1, mats.stoneDark), 0, H - 2.5, s, g); // linteau
  // chemin de ronde en encorbellement
  for (const [x, z, w, d] of [[0, -s, 2 * s + 6, T + 2.4], [0, s, 2 * s + 6, T + 2.4], [-s, 0, T + 2.4, 2 * s], [s, 0, T + 2.4, 2 * s]]) add(box(w, 1.2, d, mats.stoneDark), x, H - 0.6, z, g);
  const crenel = boxUV(new THREE.BoxGeometry(2, 2.2, T + 1.6), 4), crenels = [];
  for (let i = -s + 2; i <= s - 2; i += 4) crenels.push([i, -s], [i, s], [-s, i], [s, i]);
  const inst = new THREE.InstancedMesh(crenel, mats.stone, crenels.length), m4 = new THREE.Matrix4();
  crenels.forEach(([x, z], i) => { m4.makeRotationY(Math.abs(x) === s ? Math.PI / 2 : 0); m4.setPosition(x, H + 1.1, z); inst.setMatrixAt(i, m4); });
  inst.castShadow = true; inst.receiveShadow = true; g.add(inst);
  for (const [x, z] of [[-s, -s], [s, -s], [-s, s], [s, s]]) {
    add(cyl(7, 7.8, 28, mats.stone, 20), x, 14, z, g);
    add(cyl(8, 7, 2, mats.stoneDark, 20), x, 28, z, g);
    add(cone(9, 13, mats.roof, 20), x, 35.5, z, g);
    flag(x, 41, z, g, mats);
    colliders.push({ x: CASTLE.x + x, z: CASTLE.z + z, r: 9, top: CASTLE.h + 40 });
  }
  add(box(30, 26, 24, mats.stoneDark), 0, 13, -10, g);
  const hip = cone(22, 12, mats.roof, 4); hip.rotation.y = Math.PI / 4; add(hip, 0, 32, -10, g);
  add(cyl(8, 9, 56, mats.stone, 20), 12, 28, -14, g);
  add(cone(11, 20, mats.roofBlue, 20), 12, 66, -14, g);
  flag(12, 76, -14, g, mats, mats.flagRed);
  colliders.push({ x: CASTLE.x + 12, z: CASTLE.z - 14, r: 10, top: CASTLE.h + 80 }, { x: CASTLE.x, z: CASTLE.z - 10, r: 18, top: CASTLE.h + 38 });
}

// ---------------------------------------------------------------- village + moulin + menhirs
function gableRoof(w, d, hh, mat) {
  const sh = new THREE.Shape(); sh.moveTo(-w / 2 - 0.7, 0); sh.lineTo(0, hh); sh.lineTo(w / 2 + 0.7, 0); sh.lineTo(-w / 2 - 0.7, 0);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: d + 1.2, bevelEnabled: false }); geo.translate(0, 0, -(d + 1.2) / 2);
  scaleUV(geo, 1 / 3, 1 / 3);
  return new THREE.Mesh(geo, mat);
}
function buildVillage(scene, mats) {
  const R = rng(7);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + R() * 0.3, d = 28 + R() * 55;
    const x = VILLAGE.x + Math.cos(a) * d, z = VILLAGE.z + Math.sin(a) * d, y = terrainAt(x, z);
    const w = 7 + R() * 5, dd = 6 + R() * 4, hh = 5 + R() * 2.5, base = new THREE.Group();
    base.position.set(x, y, z); base.rotation.y = -a + Math.PI / 2; scene.add(base); base.updateMatrixWorld(true);
    // terrain sous l'emprise : la maison repose sur le point le plus haut, un soubassement descend jusqu'au plus bas
    let lo = y, hi = y; for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 1], [0, -1], [1, 0], [-1, 0]]) { const pnt = base.localToWorld(new THREE.Vector3(cx * w / 2, 0, cz * dd / 2)); const h = terrainAt(pnt.x, pnt.z); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    base.position.y = lo; const g = new THREE.Group(); g.position.y = hi - lo; base.add(g);
    add(box(w + 0.4, hi - lo + 1.5, dd + 0.4, mats.stone), 0, -(hi - lo) / 2 + 0.15, 0, g); // soubassement jusqu'au sol
    add(box(w, hh, dd, mats.plaster), 0, hh / 2 + 0.9, 0, g);
    // colombages
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(box(0.4, hh, 0.4, mats.beam, 2), sx * w / 2, hh / 2 + 0.9, sz * dd / 2, g);
    add(box(w + 0.3, 0.35, dd + 0.3, mats.beam, 2), 0, hh * 0.55 + 0.9, 0, g);
    add(box(w + 0.3, 0.35, dd + 0.3, mats.beam, 2), 0, hh + 0.9, 0, g);
    for (let k = -1; k <= 1; k += 2) { const br = add(box(0.3, hh * 0.62, 0.3, mats.beam, 2), k * w / 4, hh * 0.8 + 0.9, dd / 2 + 0.05, g); br.rotation.z = k * 0.6; }
    add(gableRoof(w, dd, 3.4 + R() * 1.5, R() < 0.7 ? mats.roof : mats.wood), 0, hh + 0.9, 0, g);
    add(box(1.6, 2.6, 0.3, mats.wood, 2), 0, 2.2, dd / 2 + 0.1, g);
    add(box(1.4, 3.5, 1.4, mats.stone, 3), w / 2 - 1.2, hh + 2.6, -dd / 4, g); // cheminée
    colliders.push({ x, z, r: Math.max(w, dd) * 0.6, top: hi + hh + 6 });
  }
  const wx = VILLAGE.x - 95, wz = VILLAGE.z - 20, wy = terrainAt(wx, wz), scn = new THREE.Group(); scene.add(scn);
  add(cyl(3, 5, 18, mats.plaster, 12), wx, wy + 9, wz, scn);
  add(cyl(5.2, 5.6, 6, mats.stone, 12), wx, wy - 1.5, wz, scn); // socle enterré
  add(cone(4.2, 6, mats.wood, 12), wx, wy + 21, wz, scn);
  windmillBlades = new THREE.Group(); windmillBlades.position.set(wx, wy + 16, wz + 4.6); scene.add(windmillBlades);
  for (let i = 0; i < 4; i++) { const b = add(box(1.2, 12, 0.3, mats.wood, 2), 0, 0, 0, windmillBlades); b.geometry.translate(0, 6, 0); b.rotation.z = i * Math.PI / 2; const sail = add(box(2.8, 9, 0.15, mats.plaster, 3), 0, 0, 0.2, b); sail.geometry.translate(1.9, 7, 0); }
  colliders.push({ x: wx, z: wz, r: 6, top: wy + 28 });
  animated.push((dt) => { windmillBlades.rotation.z += dt * 0.6; });
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2, x = STONES.x + Math.cos(a) * 22, z = STONES.z + Math.sin(a) * 22;
    const hgt = 8 + (i % 3) * 1.5; const st = add(box(2.6, hgt + 2, 1.6, mats.menhir, 6), x, terrainAt(x, z) + hgt / 2 - 1, z, scene); st.rotation.y = -a; st.rotation.z = (R() - 0.5) * 0.12;
  }
  const tx = STONES.x, tz = STONES.z, ty = terrainAt(tx, tz);
  add(box(10, 1.5, 3, mats.menhir, 6), tx, ty + 7.5, tz, scene); add(box(2.5, 9, 2, mats.menhir, 6), tx - 4, ty + 2.5, tz, scene); add(box(2.5, 9, 2, mats.menhir, 6), tx + 4, ty + 2.5, tz, scene);
}

// ---------------------------------------------------------------- forêts (instanciées, balancées par le vent)
const windUniform = { value: 0 };
function windy(mat, amp) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = windUniform;
    sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
      { vec4 ip = instanceMatrix[3]; float k = max(position.y - 1.5, 0.0) * ${amp.toFixed(4)};
        transformed.x += sin(uWind * 1.3 + ip.x * 0.05 + ip.z * 0.07) * k; transformed.z += sin(uWind * 1.1 + ip.z * 0.06) * k * 0.6; }
      #endif`);
  };
  return mat;
}
function blob(r, detail, seed, squash = 1) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(r, detail)); const p = g.attributes.position, R = rng(seed);
  const off = [R() * 10, R() * 10, R() * 10];
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 1 + perlin.noise(x * 0.6 + off[0], y * 0.6 + off[1], z * 0.6 + off[2]) * 0.45; p.setXYZ(i, x * k, y * k * squash, z * k); }
  g.computeVertexNormals(); return g;
}
function buildTrees(scene, tex, mats) {
  const R = rng(42), pines = [], leafy = [];
  for (let tries = 0; tries < 30000 && pines.length + leafy.length < 5200; tries++) {
    const x = (R() - 0.5) * 2900, z = (R() - 0.5) * 2900, h = heightAt(x, z);
    if (h < 4 || h > 270 || slopeAt(x, z) > 0.75) continue;
    const se = seasonAt(x, z); if (se.summer > 0.5 && R() > 0.06) continue; // désert : rares arbres
    if (Math.hypot(x - CASTLE.x, z - CASTLE.z) < 130 || Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < 100 || Math.hypot(x - STONES.x, z - STONES.z) < 40) continue;
    const forest = perlin.noise(x * 0.004, z * 0.004, 9.1);
    if (forest < -0.05 && R() > 0.15) continue;
    (h > 90 || se.winter > 0.5 || R() < 0.55 ? pines : leafy).push([x, terrainAt(x, z) - 0.7, z, 0.7 + R() * 0.8, R() * 6.28, R(), se]);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
  function forest(list, geo, mat, sc, tint) {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach(([x, h, z, k, r, v, se], i) => { q.setFromAxisAngle(Y, r); s.set(k * sc[0], k * sc[1], k * sc[0]); p.set(x, h, z); m4.compose(p, q, s); im.setMatrixAt(i, m4);
      if (tint) { c.setHSL(tint[0] + v * tint[1], tint[2], tint[3] + v * tint[4]);
        if (se.autumn > 0.3) c.lerp(new THREE.Color().setHSL(0.02 + v * 0.09, 0.75, 0.42), Math.min(1, se.autumn * 1.4)); // feuillage roux
        if (se.winter > 0.3) c.lerp(new THREE.Color(0xe8f0f6), Math.min(0.85, se.winter)); // sapins enneigés
        im.setColorAt(i, c); } });
    im.castShadow = true; im.receiveShadow = true; scene.add(im);
  }
  // sapin : tronc + 4 étages de branches irréguliers
  const trunkP = scaleUV(new THREE.CylinderGeometry(0.25, 0.55, 14, 7).translate(0, 7, 0), 1, 4);
  const tiers = [];
  for (let t = 0; t < 4; t++) { const r = 3.6 - t * 0.75, hh = 5.5 - t * 0.6; const g = mergeVertices(new THREE.ConeGeometry(r, hh, 9, 2)); const pp = g.attributes.position; const RR = rng(300 + t); for (let i = 0; i < pp.count; i++) { if (pp.getY(i) < hh / 2 - 0.01) { const k = 0.8 + RR() * 0.4; pp.setX(i, pp.getX(i) * k); pp.setZ(i, pp.getZ(i) * k); pp.setY(i, pp.getY(i) - RR() * 0.6); } } g.computeVertexNormals(); g.translate(0, 4 + t * 2.6 + hh / 2, 0); tiers.push(g); }
  const pineTop = mergeGeometries(tiers);
  forest(pines, trunkP, windy(mats.bark.clone(), 0.004), [1, 1]);
  forest(pines, pineTop, windy(new THREE.MeshStandardMaterial({ map: tex.leaves, roughness: 0.95, color: 0x9fc0a0 }), 0.012), [1, 1], [0.32, 0.05, 0.38, 0.22, 0.12]);
  // feuillu : tronc + houppier en 4 masses
  const trunkL = scaleUV(new THREE.CylinderGeometry(0.35, 0.65, 7, 7).translate(0, 3.5, 0), 1, 2);
  const crown = mergeGeometries([blob(3.6, 2, 1).translate(0, 8.5, 0), blob(2.6, 2, 2).translate(2.2, 7.2, 0.8), blob(2.5, 2, 3).translate(-2, 7.6, -1), blob(2.3, 2, 4).translate(0.4, 10.6, -0.6)]);
  forest(leafy, trunkL, windy(mats.bark.clone(), 0.004), [1, 1]);
  forest(leafy, crown, windy(new THREE.MeshStandardMaterial({ map: tex.leaves, roughness: 0.9 }), 0.02), [1, 1], [0.2, 0.08, 0.45, 0.42, 0.18]);
  animated.push((dt, t) => { windUniform.value = t; });
}

// ---------------------------------------------------------------- nuages (billboards doux)
function buildClouds(scene, tex) {
  const R = rng(3), list = [];
  for (let c = 0; c < 80; c++) {
    const cx = (R() - 0.5) * 3600, cz = (R() - 0.5) * 3600, cy = 380 + R() * 240, n = 10 + (R() * 14 | 0), big = 0.7 + R() * 0.8;
    for (let i = 0; i < n; i++) list.push([cx + (R() - 0.5) * 110 * big, cy + (R() - 0.3) * 22 * big, cz + (R() - 0.5) * 80 * big, (26 + R() * 30) * big]);
  }
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex.cloud }, fogColor: { value: new THREE.Color(0xb7cde0) }, sunDir: { value: new THREE.Vector3(0, 1, 0) } },
    vertexShader: `varying vec2 vUv; varying float vDist; varying float vH;
      void main() { vUv = uv; vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); float s = length(instanceMatrix[0].xyz);
        c.xy += position.xy * s; vDist = -c.z; vH = position.y; gl_Position = projectionMatrix * c; }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 fogColor; varying vec2 vUv; varying float vDist; varying float vH;
      void main() { float a = texture2D(map, vUv).a; vec3 col = mix(vec3(0.62, 0.68, 0.78), vec3(1.0, 0.99, 0.96), smoothstep(-0.5, 0.45, vH));
        a *= smoothstep(8.0, 60.0, vDist); col = mix(col, fogColor, smoothstep(900.0, 3400.0, vDist)); a *= 1.0 - smoothstep(3000.0, 4200.0, vDist);
        if (a < 0.01) discard; gl_FragColor = vec4(col, a * 0.9); }`,
    transparent: true, depthWrite: false,
  });
  const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, list.length), m4 = new THREE.Matrix4();
  list.forEach(([x, y, z, s], i) => { m4.makeScale(s, s, s); m4.setPosition(x, y, z); im.setMatrixAt(i, m4); });
  im.frustumCulled = false; im.renderOrder = 2; scene.add(im);
}

// ---------------------------------------------------------------- herbe (GPU, suit la caméra)
function buildGrass(scene) {
  const RAD = 42, BLADES = 110000;
  // textures : hauteur (float, lue texel par texel) et densité d'herbe
  const hTex = new THREE.DataTexture(heights, N1, N1, THREE.RedFormat, THREE.FloatType); hTex.needsUpdate = true;
  const dens = new Uint8Array(N1 * N1);
  for (let iz = 0; iz < N1; iz++) for (let ix = 0; ix < N1; ix++) {
    const x = H0 + ix * CELL, z = H0 + iz * CELL, h = heights[iz * N1 + ix];
    let d = smooth(4, 8, h) * smooth(230, 180, h) * smooth(0.7, 0.4, slopeAt(x, z));
    d *= smooth(55, 75, Math.hypot(x - CASTLE.x, z - CASTLE.z)) * smooth(40, 70, Math.hypot(x - VILLAGE.x, z - VILLAGE.z)) * (1 - smooth(0.25, 0.5, perlin.noise(x * 0.012, z * 0.012, 5.5)) * 0.8);
    d *= 0.55 + 0.45 * (perlin.noise(x * 0.03, z * 0.03, 77) * 0.5 + 0.5);
    const se = seasonAt(x, z); d *= 1 - Math.min(1, se.summer * 1.5 + se.winter * 1.5);
    dens[iz * N1 + ix] = clamp(d, 0, 1) * 255;
  }
  const dTex = new THREE.DataTexture(dens, N1, N1, THREE.RedFormat, THREE.UnsignedByteType); dTex.magFilter = dTex.minFilter = THREE.LinearFilter; dTex.needsUpdate = true;
  // brin : 4 segments effilés
  const base = new THREE.BufferGeometry(), pv = [], idx = [], SEGS = 4;
  for (let i = 0; i <= SEGS; i++) { const t = i / SEGS, w = 0.045 * (1 - t * 0.9); pv.push(-w, t, 0, w, t, 0); if (i < SEGS) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
  const geo = new THREE.InstancedBufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pv, 3)); geo.setIndex(idx);
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(pv.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  const off = new Float32Array(BLADES * 4), R = rng(99);
  for (let i = 0; i < BLADES; i++) off.set([R() * RAD * 2, R() * RAD * 2, R() * Math.PI * 2, R()], i * 4);
  geo.setAttribute('offset', new THREE.InstancedBufferAttribute(off, 4)); geo.instanceCount = BLADES;
  const uniforms = { uCenter: { value: new THREE.Vector2() }, uTime: windUniform, tH: { value: hTex }, tD: { value: dTex } };
  const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = `uniform vec2 uCenter; uniform float uTime; uniform sampler2D tH, tD; attribute vec4 offset; varying float vT; varying float vV;
      float hAt(vec2 p) { vec2 f = (p - vec2(${H0.toFixed(1)})) / ${CELL.toFixed(4)}; ivec2 i = ivec2(floor(f)); vec2 u = f - vec2(i);
        float ha = texelFetch(tH, i, 0).r, hb = texelFetch(tH, i + ivec2(0, 1), 0).r, hc = texelFetch(tH, i + ivec2(1, 1), 0).r, hd = texelFetch(tH, i + ivec2(1, 0), 0).r;
        return u.x + u.y <= 1.0 ? ha + (hd - ha) * u.x + (hb - ha) * u.y : hc + (hb - hc) * (1.0 - u.x) + (hd - hc) * (1.0 - u.y); }
      ` + sh.vertexShader
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
      .replace('#include <begin_vertex>', `
        vec2 wp = uCenter + mod(offset.xy - uCenter + ${RAD.toFixed(1)}, ${(RAD * 2).toFixed(1)}) - ${RAD.toFixed(1)};
        float dns = texture2D(tD, ((wp - vec2(${H0.toFixed(1)})) / ${CELL.toFixed(4)} + 0.5) / ${N1.toFixed(1)}).r;
        float fade = 1.0 - smoothstep(${(RAD * 0.55).toFixed(1)}, ${RAD.toFixed(1)}, length(wp - cameraPosition.xz));
        float keep = step(offset.w, dns);
        float hgt = (0.2 + offset.w * 0.38) * keep * fade * (0.7 + dns * 0.5);
        float c = cos(offset.z), s = sin(offset.z);
        vec3 transformed = vec3(position.x * c * (0.5 + hgt), position.y * hgt, position.x * s * (0.5 + hgt));
        float wv = sin(uTime * 1.8 + wp.x * 0.15 + wp.y * 0.1) * 0.5 + sin(uTime * 3.1 + wp.x * 0.4) * 0.2;
        transformed.x += wv * position.y * position.y * hgt * 0.35; transformed.z += wv * position.y * position.y * hgt * 0.2;
        transformed += vec3(wp.x, hAt(wp) - 0.05, wp.y);
        vT = position.y; vV = offset.w;`);
    sh.fragmentShader = 'varying float vT; varying float vV;\n' + sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal);').replace('#include <color_fragment>',
      '#include <color_fragment>\n diffuseColor.rgb *= mix(vec3(0.16, 0.27, 0.07), mix(vec3(0.42, 0.6, 0.2), vec3(0.62, 0.66, 0.3), vV), vT);');
  };
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.receiveShadow = true; scene.add(mesh);
  return { update(camPos) { uniforms.uCenter.value.set(camPos.x, camPos.z); mesh.visible = camPos.y - groundAt(camPos.x, camPos.z) < 70; } };
}
