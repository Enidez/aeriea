// Aériea — MVP : voler sur un grand aigle, course d'anneaux, balade à cheval.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import knightGlb from '../assets/Knight-slim.glb';
import horseGlb from '../assets/Horse.glb';
import storkGlb from '../assets/Stork.glb';

// ---------------------------------------------------------------- utils
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- save
const SAVE_KEY = 'aeriea-save-v1';
let save = { coins: 0, best: null, medal: null, goldEagle: false, invertY: false };
try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { /* stockage indisponible */ }
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } };

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.75;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.5, 15000);
scene.add(camera);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- sky & light
const SUN = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 32), THREE.MathUtils.degToRad(140));
const sky = new Sky();
sky.scale.setScalar(12000);
Object.assign(sky.material.uniforms.turbidity, { value: 3 });
sky.material.uniforms.rayleigh.value = 1.2;
sky.material.uniforms.mieCoefficient.value = 0.004;
sky.material.uniforms.mieDirectionalG.value = 0.85;
sky.material.uniforms.sunPosition.value.copy(SUN);
scene.add(sky);
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene(); const s2 = new Sky(); s2.scale.setScalar(100);
  for (const k in sky.material.uniforms) s2.material.uniforms[k].value = sky.material.uniforms[k].value;
  envScene.add(s2);
  scene.environment = pmrem.fromScene(envScene).texture;
  scene.environmentIntensity = 0.6;
}
scene.fog = new THREE.Fog(0xa9c4dc, 500, 3200);
const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x5a6b3a, 0.9);
scene.add(hemi);
const sunLight = new THREE.DirectionalLight(0xfff1d6, 3.2);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
Object.assign(sunLight.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 10, far: 900 });
sunLight.shadow.bias = -0.0005;
sunLight.shadow.normalBias = 0.6;
scene.add(sunLight, sunLight.target);

// ---------------------------------------------------------------- terrain
const WORLD = 3400;
const CASTLE = { x: 260, z: -200, h: 42 };
const VILLAGE = { x: 60, z: 170, h: 16 };
const LAKE = { x: -360, z: 320 };
const STONES = { x: -230, z: -480 };
const perlin = new ImprovedNoise();
function fbm(x, z, oct) { let a = 1, f = 1, s = 0, n = 0; for (let i = 0; i < oct; i++) { s += a * perlin.noise(x * f, z * f, 1.7 + i * 13.1); n += a; a *= 0.5; f *= 2.03; } return s / n; }
function heightAt(x, z) {
  const r = Math.hypot(x, z);
  const n = fbm(x * 0.0025, z * 0.0025, 5);
  let h = 16 + n * 55;
  const rid = 1 - Math.abs(perlin.noise(x * 0.0032, z * 0.0032, 42.5));
  h += smooth(480, 1150, r) * (rid * rid * 430 + n * 140);
  h -= smooth(320, 40, Math.hypot(x - LAKE.x, z - LAKE.z)) * 60;
  h = lerp(h, CASTLE.h, smooth(175, 100, Math.hypot(x - CASTLE.x, z - CASTLE.z)));
  h = lerp(h, VILLAGE.h, smooth(160, 85, Math.hypot(x - VILLAGE.x, z - VILLAGE.z)));
  h = lerp(h, -40, smooth(1400, 1650, r));
  return h;
}
const groundAt = (x, z) => Math.max(heightAt(x, z), 0);
function slopeAt(x, z) { const e = 4; return Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e); }

{
  const seg = 340;
  const geo = new THREE.PlaneGeometry(WORLD, WORLD, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const sand = new THREE.Color(0xd8c48a), grass = new THREE.Color(0x6fa043), grass2 = new THREE.Color(0x4f8a35),
    rock = new THREE.Color(0x7d7468), snow = new THREE.Color(0xf4f6fa), dirt = new THREE.Color(0x8a7a4e);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = heightAt(x, z);
    pos.setY(i, h);
    const sl = slopeAt(x, z), v = perlin.noise(x * 0.01, z * 0.01, 3.3) * 0.5 + 0.5;
    c.copy(grass).lerp(grass2, v);
    if (h < 3) c.copy(sand);
    else if (h < 6) c.lerp(sand, 1 - (h - 3) / 3);
    if (sl > 0.55) c.lerp(dirt, smooth(0.55, 0.8, sl));
    if (sl > 0.8 || h > 200) c.lerp(rock, Math.max(smooth(0.8, 1.1, sl), smooth(200, 240, h)));
    if (h > 300) c.lerp(snow, smooth(300, 340, h) * (1 - smooth(1.2, 1.6, sl) * 0.6));
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }));
  terrain.receiveShadow = true;
  scene.add(terrain);

  const water = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000), new THREE.MeshStandardMaterial({ color: 0x2a7aa6, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.86 }));
  water.rotation.x = -Math.PI / 2; water.position.y = 0.2; water.receiveShadow = true;
  scene.add(water);
}

// ---------------------------------------------------------------- decor helpers
const M = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...extra });
const mats = { stone: M(0xa7a39b), stoneDark: M(0x8a857c), roof: M(0x9b2f2a), roofBlue: M(0x2f4f8f), wood: M(0x6b4a2b), plaster: M(0xeadfc4), flagBlue: M(0x2846a8, { side: THREE.DoubleSide }), gold: M(0xffc93c, { metalness: 0.6, roughness: 0.3 }), menhir: M(0x8f8c86) };
function add(mesh, x, y, z, parent = scene) { mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh; }
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (rt, rb, h, m, s = 10) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, s), m);
const cone = (r, h, m, s = 10) => new THREE.Mesh(new THREE.ConeGeometry(r, h, s), m);
const flags = [];
function flag(x, y, z, parent, color = mats.flagBlue) {
  add(cyl(0.25, 0.25, 8, mats.wood, 6), x, y + 4, z, parent);
  const g = new THREE.PlaneGeometry(5, 3, 8, 2); g.translate(2.5, 0, 0);
  const f = add(new THREE.Mesh(g, color), x, y + 6.4, z, parent);
  f.userData.base = g.attributes.position.array.slice(); flags.push(f);
}

// château
const colliders = []; // cylindres simples {x,z,r,top}
const boxes = []; // murs {x0,x1,z0,z1,top}
{
  const g = new THREE.Group(); g.position.set(CASTLE.x, CASTLE.h, CASTLE.z); scene.add(g);
  const s = 46, H = 16, T = 4;
  const crenel = new THREE.BoxGeometry(2, 2, T * 0.8); const crenels = [];
  const wall = (x, z, w, d) => { add(box(w, H, d, mats.stone), x, H / 2, z, g); boxes.push({ x0: CASTLE.x + x - w / 2, x1: CASTLE.x + x + w / 2, z0: CASTLE.z + z - d / 2, z1: CASTLE.z + z + d / 2, top: CASTLE.h + H + 2 }); };
  wall(0, -s, 2 * s, T); wall(-s, 0, T, 2 * s); wall(s, 0, T, 2 * s);
  wall(-s / 2 - 4, s, s - 8, T); wall(s / 2 + 4, s, s - 8, T);
  add(box(16, 5, T + 1, mats.stoneDark), 0, H - 2.5, s, g); // linteau de la porte
  for (let i = -s + 2; i <= s - 2; i += 4) { crenels.push([i, -s], [i, s], [-s, i], [s, i]); }
  const inst = new THREE.InstancedMesh(crenel, mats.stone, crenels.length); const m4 = new THREE.Matrix4();
  crenels.forEach(([x, z], i) => { m4.makeRotationY(Math.abs(x) === s ? Math.PI / 2 : 0); m4.setPosition(x, H + 1, z); inst.setMatrixAt(i, m4); });
  inst.castShadow = true; g.add(inst);
  for (const [x, z] of [[-s, -s], [s, -s], [-s, s], [s, s]]) {
    add(cyl(7, 7.5, 28, mats.stone, 12), x, 14, z, g);
    add(cone(9, 12, mats.roof, 12), x, 34, z, g);
    flag(x, 40, z, g);
    colliders.push({ x: CASTLE.x + x, z: CASTLE.z + z, r: 9, top: CASTLE.h + 40 });
  }
  add(box(30, 26, 24, mats.stoneDark), 0, 13, -10, g);
  add(cone(22, 12, mats.roof, 4), 0, 32, -10, g).rotation.y = Math.PI / 4;
  add(cyl(8, 9, 56, mats.stone, 12), 12, 28, -14, g);
  add(cone(11, 20, mats.roofBlue, 12), 12, 66, -14, g);
  flag(12, 76, -14, g);
  colliders.push({ x: CASTLE.x + 12, z: CASTLE.z - 14, r: 10, top: CASTLE.h + 80 }, { x: CASTLE.x, z: CASTLE.z - 10, r: 18, top: CASTLE.h + 38 });
}

// village + moulin
let windmillBlades;
{
  const R = rng(7);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + R() * 0.3, d = 28 + R() * 55;
    const x = VILLAGE.x + Math.cos(a) * d, z = VILLAGE.z + Math.sin(a) * d, y = heightAt(x, z);
    const w = 7 + R() * 5, dd = 6 + R() * 4, hh = 5 + R() * 2, g = new THREE.Group();
    g.position.set(x, y, z); g.rotation.y = -a + Math.PI / 2; scene.add(g);
    add(box(w, hh, dd, mats.plaster), 0, hh / 2, 0, g);
    add(box(w + 0.2, 0.5, dd + 0.2, mats.wood), 0, hh * 0.55, 0, g);
    const rg = new THREE.ConeGeometry(1, 1, 4); rg.rotateY(Math.PI / 4);
    const roof = add(new THREE.Mesh(rg, R() < 0.5 ? mats.roof : mats.wood), 0, hh + 2.5, 0, g); roof.scale.set(w * 0.78, 5, dd * 0.78);
    add(box(1.6, 2.6, 0.3, mats.wood), 0, 1.3, dd / 2 + 0.1, g);
    colliders.push({ x, z, r: Math.max(w, dd) * 0.6, top: y + hh + 5 });
  }
  const wx = VILLAGE.x - 95, wz = VILLAGE.z - 20, wy = heightAt(wx, wz);
  add(cyl(3, 5, 18, mats.plaster, 8), wx, wy + 9, wz);
  add(cone(4.2, 6, mats.wood, 8), wx, wy + 21, wz);
  windmillBlades = new THREE.Group(); windmillBlades.position.set(wx, wy + 16, wz + 4.6); scene.add(windmillBlades);
  for (let i = 0; i < 4; i++) { const b = add(box(1.2, 12, 0.3, mats.wood), 0, 0, 0, windmillBlades); b.geometry.translate(0, 6, 0); b.rotation.z = i * Math.PI / 2; const sail = add(box(2.8, 9, 0.15, mats.plaster), 0, 0, 0.2, b); sail.geometry.translate(1.9, 7, 0); }
  colliders.push({ x: wx, z: wz, r: 6, top: wy + 28 });
  // cercle de menhirs
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2, x = STONES.x + Math.cos(a) * 22, z = STONES.z + Math.sin(a) * 22;
    const st = add(box(2.6, 8 + (i % 3) * 1.5, 1.6, mats.menhir), x, heightAt(x, z) + 3.5, z); st.rotation.y = -a;
  }
  const tx = STONES.x, tz = STONES.z, ty = heightAt(tx, tz);
  add(box(10, 1.5, 3, mats.menhir), tx, ty + 7.5, tz); add(box(2.5, 7, 2, mats.menhir), tx - 4, ty + 3.5, tz); add(box(2.5, 7, 2, mats.menhir), tx + 4, ty + 3.5, tz);
}

// arbres (instanciés)
{
  const R = rng(42), pines = [], leafy = [];
  for (let tries = 0; tries < 26000 && pines.length + leafy.length < 4200; tries++) {
    const x = (R() - 0.5) * 2900, z = (R() - 0.5) * 2900, h = heightAt(x, z);
    if (h < 4 || h > 260 || slopeAt(x, z) > 0.75) continue;
    if (Math.hypot(x - CASTLE.x, z - CASTLE.z) < 130 || Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < 100 || Math.hypot(x - STONES.x, z - STONES.z) < 40) continue;
    const forest = perlin.noise(x * 0.004, z * 0.004, 9.1);
    if (forest < -0.05 && R() > 0.15) continue;
    (h > 90 || R() < 0.55 ? pines : leafy).push([x, h, z, 0.7 + R() * 0.8, R() * 6.28]);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  function forest(list, geo, mat, yOff, sc) {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach(([x, h, z, k, r], i) => { q.setFromAxisAngle(Y, r); s.set(k * sc[0], k * sc[1], k * sc[0]); p.set(x, h + yOff * k, z); m4.compose(p, q, s); im.setMatrixAt(i, m4); });
    im.castShadow = true; im.receiveShadow = true; scene.add(im);
  }
  const trunk = new THREE.CylinderGeometry(0.4, 0.6, 1, 6);
  forest(pines, trunk, mats.wood, 2, [1.4, 4]);
  forest(pines, new THREE.ConeGeometry(3.4, 9, 7), M(0x2f6b3a), 8.5, [1, 1]);
  forest(pines, new THREE.ConeGeometry(2.4, 6, 7), M(0x3a7a44), 12.5, [1, 1]);
  forest(leafy, trunk, mats.wood, 2.5, [1.4, 5]);
  forest(leafy, new THREE.IcosahedronGeometry(4, 0), M(0x5d9a3a), 7.5, [1, 0.9]);
}

// nuages
{
  const R = rng(3), list = [];
  for (let c = 0; c < 70; c++) {
    const cx = (R() - 0.5) * 3200, cz = (R() - 0.5) * 3200, cy = 380 + R() * 220, n = 4 + (R() * 6 | 0);
    for (let i = 0; i < n; i++) list.push([cx + (R() - 0.5) * 70, cy + (R() - 0.5) * 14, cz + (R() - 0.5) * 50, 14 + R() * 20]);
  }
  const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 1, transparent: true, opacity: 0.92, emissive: 0x9aa8b8, emissiveIntensity: 0.35 }), list.length);
  const m4 = new THREE.Matrix4();
  list.forEach(([x, y, z, s], i) => { m4.makeScale(s, s * 0.6, s); m4.setPosition(x, y, z); im.setMatrixAt(i, m4); });
  scene.add(im);
}

// ---------------------------------------------------------------- course d'anneaux
const COURSE = [
  [260, -60, 55], [150, 90, 38], [-30, 260, 32], [-280, 340, 14], [-470, 220, 18], [-640, -30, 55],
  [-780, -330, 70], [-600, -640, 60], [-330, -790, 55], [-230, -480, 22], [40, -680, 90], [420, -800, 95],
  [760, -560, 85], [860, -200, 70], [700, 160, 45], [480, 320, 26], [360, 40, 24], [260, -190, 95],
];
const RING_R = 14;
const rings = COURSE.map(([x, z, alt]) => {
  const y = groundAt(x, z) + alt;
  const mat = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x3aa0ff, emissiveIntensity: 0.6, transparent: true, opacity: 0.35, roughness: 0.4, metalness: 0.2 });
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(RING_R, 1.3, 12, 48), mat);
  mesh.position.set(x, y, z); scene.add(mesh);
  return { mesh, mat, c: mesh.position, n: new THREE.Vector3() };
});
rings.forEach((r, i) => {
  const a = rings[Math.max(0, i - 1)].c, b = rings[Math.min(rings.length - 1, i + 1)].c;
  r.n.subVectors(b, a).normalize();
  r.mesh.lookAt(r.c.clone().add(r.n));
});
const courseLength = rings.reduce((s, r, i) => i ? s + r.c.distanceTo(rings[i - 1].c) : 0, 0);
const GOLD_T = Math.round(courseLength / 78), SILVER_T = Math.round(courseLength / 60);
function makeLabel(text, color = '#fff') {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const x = cv.getContext('2d');
  x.font = 'bold 76px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 10; x.strokeStyle = 'rgba(40,20,0,.85)'; x.strokeText(text, 256, 64); x.fillStyle = color; x.fillText(text, 256, 64);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthWrite: false }));
  sp.scale.set(40, 10, 1); return sp;
}
const startLabel = makeLabel('DÉPART', '#7dff8a'); startLabel.position.copy(rings[0].c).add(new THREE.Vector3(0, RING_R + 9, 0)); scene.add(startLabel);
// flèche de guidage
const guide = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3, 10).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0.9, depthTest: false }));
guide.renderOrder = 10; scene.add(guide);

// ---------------------------------------------------------------- modèles
const loader = new GLTFLoader();
const buf = (u) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength);
const loadGlb = (u) => new Promise((res, rej) => loader.parse(buf(u), '', res, rej));
function normalize(obj, size, axis = 'max') {
  const b = new THREE.Box3().setFromObject(obj), sz = b.getSize(new THREE.Vector3());
  const k = size / (axis === 'max' ? Math.max(sz.x, sz.y, sz.z) : sz[axis]);
  obj.scale.multiplyScalar(k);
  const b2 = new THREE.Box3().setFromObject(obj);
  return b2;
}
const shadowAll = (o) => o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; } });

const mixers = [];
let knight, knightActions = {}, knightAction, horse, eagle, eagleMat, eagleMixerAction, horseAction;
const seatHorse = new THREE.Object3D(), seatEagle = new THREE.Object3D();

async function loadModels() {
  const [k, h, s] = await Promise.all([loadGlb(knightGlb), loadGlb(horseGlb), loadGlb(storkGlb)]);
  // chevalier
  knight = k.scene; shadowAll(knight);
  const keep = new Set(['1H_Sword', 'Round_Shield']);
  knight.traverse((o) => { if (o.isMesh && /Sword|Shield/.test(o.name) && !keep.has(o.name)) o.visible = false; if (o.name === '1H_Sword_Offhand') o.visible = false; });
  normalize(knight, 1.85, 'y');
  const km = new THREE.AnimationMixer(knight); mixers.push(km);
  for (const c of k.animations) knightActions[c.name] = km.clipAction(c);
  for (const n of ['Jump_Full_Short', 'Cheer']) { knightActions[n].setLoop(THREE.LoopOnce); knightActions[n].clampWhenFinished = true; }
  // cheval
  horse = new THREE.Group(); const hm = h.scene; shadowAll(hm);
  const hb = normalize(hm, 2.3, 'y'); hm.position.y -= hb.min.y; horse.add(hm);
  const hmx = new THREE.AnimationMixer(hm); mixers.push(hmx); horseAction = hmx.clipAction(h.animations[0]); horseAction.play();
  seatHorse.position.set(0, 1.42, -0.15); horse.add(seatHorse);
  scene.add(horse);
  // grand aigle (cigogne recolorée en aigle royal)
  eagle = new THREE.Group(); const em = s.scene; shadowAll(em);
  const eb = normalize(em, 13, 'x'); em.position.y -= (eb.min.y + eb.max.y) / 2; eagle.add(em);
  em.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); eagleMat = o.material; } });
  const emx = new THREE.AnimationMixer(em); mixers.push(emx); eagleMixerAction = emx.clipAction(s.animations[0]); eagleMixerAction.play();
  seatEagle.position.set(0, 0.55, -0.2); eagle.add(seatEagle);
  applyEagleSkin(); scene.add(eagle);
}
function applyEagleSkin() {
  if (!eagleMat) return;
  if (save.goldEagle) { eagleMat.color.set(0xffc23a); eagleMat.emissive = new THREE.Color(0x553300); eagleMat.metalness = 0.5; eagleMat.roughness = 0.35; }
  else { eagleMat.color.set(0x8a5a2b); eagleMat.emissive = new THREE.Color(0x000000); eagleMat.metalness = 0; eagleMat.roughness = 0.8; }
}
function playKnight(name, fade = 0.25) {
  const a = knightActions[name]; if (!a || a === knightAction) return;
  a.reset().play(); if (knightAction) a.crossFadeFrom(knightAction, fade, false); knightAction = a;
}

// ---------------------------------------------------------------- entrées (manette PS4 + clavier)
const keys = new Set(), tapped = new Set();
addEventListener('keydown', (e) => { keys.add(e.code); tapped.add(e.code); if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault(); if (e.code === 'KeyF') toggleFullscreen(); });
addEventListener('keyup', (e) => keys.delete(e.code));
const BTN = { cross: 0, circle: 1, square: 2, triangle: 3, l1: 4, r1: 5, l2: 6, r2: 7, share: 8, options: 9, up: 12, down: 13 };
const KEYMAP = { cross: ['Space', 'Enter'], circle: ['KeyR', 'Backspace'], square: ['KeyQ'], triangle: ['KeyE'], l1: ['KeyZ'], r1: ['KeyC'], share: ['KeyI'], options: ['Escape', 'KeyP'] };
let prevBtn = {}, padName = null;
const input = { lx: 0, ly: 0, rx: 0, ry: 0, r2: 0, l2: 0, held: {}, pressed: {} };
function dz(x, y, d = 0.16) { const m = Math.hypot(x, y); if (m < d) return [0, 0]; const k = (m - d) / (1 - d) / m; return [x * k, y * k]; }
function readInput() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const pad = [...pads].find((p) => p && p.connected);
  padName = pad ? pad.id : null;
  let lx = 0, ly = 0, rx = 0, ry = 0, r2 = 0, l2 = 0; const held = {};
  if (pad) {
    [lx, ly] = dz(pad.axes[0] || 0, pad.axes[1] || 0); [rx, ry] = dz(pad.axes[2] || 0, pad.axes[3] || 0);
    const b = (i) => pad.buttons[i] || { pressed: false, value: 0 };
    r2 = b(BTN.r2).value || (b(BTN.r2).pressed ? 1 : 0); l2 = b(BTN.l2).value || (b(BTN.l2).pressed ? 1 : 0);
    for (const n in BTN) held[n] = b(BTN[n]).pressed;
  }
  const k = (c) => keys.has(c) || tapped.has(c);
  lx += (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0); ly += (k('KeyS') ? 1 : 0) - (k('KeyW') ? 1 : 0);
  rx += (k('ArrowRight') ? 1 : 0) - (k('ArrowLeft') ? 1 : 0); ry += (k('ArrowDown') ? 1 : 0) - (k('ArrowUp') ? 1 : 0);
  if (k('ShiftLeft') || k('ShiftRight')) r2 = 1; if (k('ControlLeft') || k('KeyX')) l2 = 1;
  for (const n in KEYMAP) if (KEYMAP[n].some(k)) held[n] = true;
  Object.assign(input, { lx: clamp(lx, -1, 1), ly: clamp(ly, -1, 1), rx: clamp(rx, -1, 1), ry: clamp(ry, -1, 1), r2, l2, held });
  input.pressed = {}; for (const n in held) if (held[n] && !prevBtn[n]) input.pressed[n] = true;
  prevBtn = held; tapped.clear();
}
addEventListener('gamepadconnected', (e) => toast(`🎮 Manette connectée`));
function toggleFullscreen() { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {}); else document.exitFullscreen?.(); }

// ---------------------------------------------------------------- audio (généré, pas de fichiers)
let actx, windGain, windFilter;
function initAudio() {
  if (actx) { actx.resume(); return; }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    const len = actx.sampleRate * 2, nb = actx.createBuffer(1, len, actx.sampleRate), d = nb.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const src = actx.createBufferSource(); src.buffer = nb; src.loop = true;
    windFilter = actx.createBiquadFilter(); windFilter.type = 'lowpass'; windFilter.frequency.value = 400;
    windGain = actx.createGain(); windGain.gain.value = 0;
    src.connect(windFilter).connect(windGain).connect(actx.destination); src.start();
  } catch (e) { actx = null; }
}
function tone(freq, t0, dur, type = 'triangle', vol = 0.18) {
  if (!actx) return; const o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.value = freq;
  const t = actx.currentTime + t0; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.05);
}
const sfxRing = (i) => { const b = 660 * Math.pow(2, (i % 8) / 12); tone(b, 0, 0.25); tone(b * 1.5, 0.08, 0.35); };
const sfxFanfare = () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.13, i === 5 ? 0.9 : 0.25, 'square', 0.09));
const sfxPoof = () => { tone(300, 0, 0.2, 'sine', 0.2); tone(600, 0.05, 0.25, 'sine', 0.12); };

// ---------------------------------------------------------------- HUD
function toast(msg, ms = 2200) { const t = $('toast'); t.innerHTML = msg; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), ms); }
const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
function updateHudStatic() {
  $('coins').textContent = save.coins;
  $('best').textContent = save.best ? `${fmt(save.best)} ${save.medal || ''}` : '—';
  $('invert').textContent = save.invertY ? 'inversé' : 'normal';
}

// ---------------------------------------------------------------- état du joueur
const player = {
  mode: 'foot', pos: new THREE.Vector3(CASTLE.x - 10, 0, CASTLE.z + 75), yaw: Math.PI, vy: 0, onGround: true, speed: 0,
  pitch: 0, roll: 0, barrel: 0, barrelDir: 0,
};
player.pos.y = groundAt(player.pos.x, player.pos.z);
const cam = { yaw: Math.PI, pitch: 0.18, dist: 7, look: new THREE.Vector3(), orbitX: 0, orbitY: 0 };
const race = { on: false, next: 0, t: 0 };
const prevPos = new THREE.Vector3();
let paused = false, started = false, celebrateT = 0;

function setMode(mode) {
  const from = player.mode; if (!knight) return;
  sfxPoof();
  if (mode === 'foot') {
    scene.attach(knight);
    const p = from === 'eagle' ? new THREE.Vector3(player.pos.x, groundAt(player.pos.x, player.pos.z), player.pos.z) : player.pos.clone().add(new THREE.Vector3(Math.cos(player.yaw) * 2.2, 0, -Math.sin(player.yaw) * 2.2));
    p.y = groundAt(p.x, p.z);
    player.pos.copy(p); knight.position.copy(p); knight.rotation.set(0, player.yaw, 0); knight.scale.setScalar(knight.scale.x);
    player.vy = 0; player.speed = 0; playKnight('Idle');
    if (from === 'horse') { horse.position.set(p.x - Math.cos(player.yaw) * 2.2, 0, p.z + Math.sin(player.yaw) * 2.2); }
    eagle.visible = false; horse.visible = true;
    if (race.on) endRace(false);
  }
  if (mode === 'horse') {
    const p = player.pos.clone(); p.y = groundAt(p.x, p.z);
    player.pos.copy(p); player.speed = 0; player.vy = 0; player.pitch = 0; player.roll = 0;
    horse.visible = true; eagle.visible = false; seatHorse.add(knight); knight.position.set(0, 0, 0); knight.rotation.set(0, 0, 0);
    playKnight('Sit_Chair_Idle', 0.1);
    if (race.on) endRace(false);
  }
  if (mode === 'eagle') {
    player.pos.y = Math.max(player.pos.y, groundAt(player.pos.x, player.pos.z)) + 6;
    player.pitch = 0.35; player.roll = 0; player.speed = 38; player.barrel = 0;
    eagle.visible = true; seatEagle.add(knight); knight.position.set(0, 0, 0); knight.rotation.set(0, 0, 0);
    playKnight('Sit_Chair_Idle', 0.1);
    if (from === 'foot') { horse.visible = true; }
    else { horse.visible = true; horse.position.set(player.pos.x, groundAt(player.pos.x, player.pos.z), player.pos.z); horse.rotation.set(0, player.yaw, 0); }
  }
  player.mode = mode;
  cam.orbitX = 0; cam.orbitY = 0;
  $('mode').textContent = { foot: '🛡️ À pied', horse: '🐎 À cheval', eagle: '🦅 En vol' }[mode];
  updateHints();
}
function updateHints() {
  const h = {
    foot: '<b>L</b> marcher · <b>R2</b> courir · <b>✕</b> sauter · <b>△</b> appeler l’aigle · <b>□</b> monter à cheval · <b>R</b> caméra',
    horse: '<b>L</b> diriger · <b>R2</b> galop · <b>✕</b> sauter · <b>◯</b> descendre · <b>△</b> appeler l’aigle',
    eagle: '<b>L</b> piquer / monter / virer · <b>R2</b> battre des ailes · <b>L2</b> freiner · <b>L1/R1</b> tonneau · <b>◯</b> atterrir · Passe dans l’anneau <span style="color:#7dff8a">DÉPART</span> !',
  };
  $('hints').innerHTML = h[player.mode] + ' · <b>OPTIONS</b> pause';
}

// ---------------------------------------------------------------- mise à jour par mode
const tmpV = new THREE.Vector3(), fwd = new THREE.Vector3(), upV = new THREE.Vector3(0, 1, 0);
function pushOutColliders(p, radius) {
  for (const c of colliders) {
    if (p.y > c.top) continue; const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + radius;
    if (d < m && d > 0.001) { p.x = c.x + dx / d * m; p.z = c.z + dz / d * m; }
  }
  for (const b of boxes) {
    if (p.y > b.top || p.x < b.x0 - radius || p.x > b.x1 + radius || p.z < b.z0 - radius || p.z > b.z1 + radius) continue;
    const px = Math.min(p.x - (b.x0 - radius), (b.x1 + radius) - p.x), pz = Math.min(p.z - (b.z0 - radius), (b.z1 + radius) - p.z);
    if (px < pz) p.x = p.x - b.x0 < b.x1 - p.x ? b.x0 - radius : b.x1 + radius;
    else p.z = p.z - b.z0 < b.z1 - p.z ? b.z0 - radius : b.z1 + radius;
  }
}
function updateFoot(dt) {
  const camF = new THREE.Vector3(Math.sin(cam.yaw), 0, Math.cos(cam.yaw)).negate(); // caméra → joueur
  const camR = new THREE.Vector3(-camF.z, 0, camF.x);
  const move = camF.multiplyScalar(-input.ly).add(camR.multiplyScalar(input.lx));
  const mag = Math.min(1, move.length());
  const target = mag * (input.r2 > 0.3 ? 9 : 4.2);
  player.speed = lerp(player.speed, target, damp(10, dt));
  if (mag > 0.05) { const want = Math.atan2(move.x, move.z); player.yaw += angDiff(player.yaw, want) * damp(12, dt); }
  player.pos.x += Math.sin(player.yaw) * player.speed * dt; player.pos.z += Math.cos(player.yaw) * player.speed * dt;
  pushOutColliders(player.pos, 0.6);
  const g = groundAt(player.pos.x, player.pos.z);
  if (input.pressed.cross && player.onGround) { player.vy = 7; player.onGround = false; playKnight('Jump_Full_Short', 0.1); }
  player.vy -= 22 * dt; player.pos.y += player.vy * dt;
  if (player.pos.y <= g) { player.pos.y = g; player.vy = 0; player.onGround = true; }
  if (celebrateT > 0) playKnight('Cheer');
  else if (player.onGround && !(knightAction === knightActions.Jump_Full_Short && knightAction.isRunning())) {
    playKnight(player.speed > 6 ? 'Running_A' : player.speed > 0.6 ? 'Walking_A' : 'Idle');
    if (knightAction === knightActions.Running_A) knightAction.timeScale = player.speed / 8;
    if (knightAction === knightActions.Walking_A) knightAction.timeScale = player.speed / 3.5;
  }
  knight.position.copy(player.pos); knight.rotation.set(0, player.yaw, 0);
  if (input.pressed.triangle) setMode('eagle'); else if (input.pressed.square) { player.pos.copy(horse.position); player.yaw = horse.rotation.y; setMode('horse'); }
  if (horse.visible) horse.position.y = groundAt(horse.position.x, horse.position.z);
  horseAction.timeScale = 0;
}
function updateHorse(dt) {
  const want = input.ly < -0.1 ? (-input.ly) * (input.r2 > 0.3 ? 22 : 10) : input.ly > 0.3 ? -3 : 0;
  player.speed = lerp(player.speed, want, damp(want > player.speed ? 1.6 : 3, dt));
  player.yaw -= input.lx * dt * lerp(2.2, 1.2, clamp(player.speed / 22, 0, 1));
  player.pos.x += Math.sin(player.yaw) * player.speed * dt; player.pos.z += Math.cos(player.yaw) * player.speed * dt;
  pushOutColliders(player.pos, 1.4);
  const g = groundAt(player.pos.x, player.pos.z);
  if (input.pressed.cross && player.onGround) { player.vy = 8; player.onGround = false; }
  player.vy -= 22 * dt; player.pos.y += player.vy * dt;
  if (player.pos.y <= g) { player.pos.y = g; player.vy = 0; player.onGround = true; }
  const ahead = groundAt(player.pos.x + Math.sin(player.yaw) * 1.5, player.pos.z + Math.cos(player.yaw) * 1.5) - groundAt(player.pos.x - Math.sin(player.yaw) * 1.5, player.pos.z - Math.cos(player.yaw) * 1.5);
  horse.position.copy(player.pos); horse.rotation.set(-Math.atan2(ahead, 3) * 0.8, player.yaw, 0, 'YXZ');
  horseAction.timeScale = player.onGround ? Math.abs(player.speed) / 9 : 0.3;
  if (input.pressed.circle) setMode('foot'); else if (input.pressed.triangle) setMode('eagle');
}
function updateEagle(dt) {
  const inv = save.invertY ? -1 : 1;
  // tangage : stick vers l'avant = piquer (comme un avion), configurable
  const pitchIn = input.ly * inv;
  player.pitch = clamp(player.pitch + pitchIn * 1.35 * dt, -1.35, 1.25);
  if (Math.abs(pitchIn) < 0.05) player.pitch *= 1 - damp(0.4, dt);
  const rollTarget = input.lx * 1.15;
  player.roll = lerp(player.roll, rollTarget, damp(3.2, dt));
  const sp = player.speed;
  player.yaw -= Math.sin(player.roll) * dt * 1.25 * clamp(60 / Math.max(sp, 25), 0.55, 1.6) * 1.1;
  // vitesse : gravité en piqué, battements, freinage, traînée
  const thrust = input.r2 * 38 + 9;
  const grav = -Math.sin(player.pitch) * 30;
  const drag = 0.0045 * sp * sp + input.l2 * 0.03 * sp * sp * 0.6;
  player.speed = clamp(sp + (thrust + grav - drag) * dt, 16, 175);
  // tonneau
  if (player.barrel <= 0 && (input.pressed.l1 || input.pressed.r1)) { player.barrel = 1; player.barrelDir = input.pressed.r1 ? 1 : -1; }
  let extraRoll = 0, side = 0;
  if (player.barrel > 0) { player.barrel = Math.max(0, player.barrel - dt / 0.6); const t = 1 - player.barrel; extraRoll = player.barrelDir * t * Math.PI * 2; side = player.barrelDir * Math.sin(t * Math.PI) * 26; }
  fwd.set(Math.sin(player.yaw) * Math.cos(player.pitch), Math.sin(player.pitch), Math.cos(player.yaw) * Math.cos(player.pitch));
  prevPos.copy(player.pos);
  player.pos.addScaledVector(fwd, player.speed * dt);
  if (side) player.pos.add(tmpV.set(-Math.cos(player.yaw), 0, Math.sin(player.yaw)).multiplyScalar(side * dt));
  // sol / plafond
  const g = groundAt(player.pos.x, player.pos.z) + 4;
  if (player.pos.y < g) { player.pos.y = g; if (player.pitch < 0.15) player.pitch = lerp(player.pitch, 0.25, damp(6, dt)); }
  pushOutColliders(player.pos, 4);
  if (player.pos.y > 1100) { player.pos.y = 1100; player.pitch = Math.min(player.pitch, 0); }
  const r = Math.hypot(player.pos.x, player.pos.z); if (r > 1900) { player.pos.x *= 1900 / r; player.pos.z *= 1900 / r; player.yaw += dt * 1.5; }
  eagle.position.copy(player.pos);
  eagle.rotation.set(-player.pitch, player.yaw, player.roll + extraRoll, 'YXZ');
  // animation des ailes : rapide quand on accélère, plané en piqué
  const flap = 0.35 + input.r2 * 1.4 + (player.pitch > 0.2 ? 0.5 : 0) - (player.pitch < -0.4 ? 0.3 : 0);
  eagleMixerAction.timeScale = lerp(eagleMixerAction.timeScale, Math.max(0.1, flap), damp(4, dt));
  checkRings(dt);
  if (input.pressed.circle) setMode('foot'); else if (input.pressed.square) setMode('horse');
}

// ---------------------------------------------------------------- course
function startRace() { race.on = true; race.next = 1; race.t = 0; toast('🏁 C’est parti ! Passe dans les anneaux dorés'); sfxRing(0); }
function endRace(finished) {
  race.on = false; race.next = 0;
  if (!finished) toast('Course abandonnée');
  updateRings();
}
function finishRace() {
  const t = race.t; let medal, gain;
  if (t <= GOLD_T) { medal = '🥇'; gain = 100; } else if (t <= SILVER_T) { medal = '🥈'; gain = 50; } else { medal = '🥉'; gain = 25; }
  const rank = { '🥇': 3, '🥈': 2, '🥉': 1 };
  const record = !save.best || t < save.best;
  if (record) save.best = t;
  if (!save.medal || rank[medal] > rank[save.medal]) save.medal = medal;
  save.coins += gain;
  let extra = '';
  if (medal === '🥇' && !save.goldEagle) { save.goldEagle = true; applyEagleSkin(); extra = '<br>✨ Récompense : <b>l’Aigle d’Or</b> est débloqué !'; }
  persist(); updateHudStatic(); sfxFanfare(); celebrateT = 3;
  $('result').innerHTML = `<div class="big">${medal}</div><h2>${medal === '🥇' ? 'Médaille d’or !' : medal === '🥈' ? 'Médaille d’argent !' : 'Médaille de bronze'}</h2>
    <p>Temps : <b>${fmt(t)}</b>${record ? ' · <span class="rec">Nouveau record !</span>' : ''}</p>
    <p>+${gain} écus 🪙${extra}</p><p class="small">Or : ${fmt(GOLD_T)} · Argent : ${fmt(SILVER_T)}</p><p class="small">✕ pour continuer</p>`;
  $('result').classList.add('on');
  endRace(true);
}
function checkRings(dt) {
  if (race.on) race.t += dt;
  const idx = race.on ? race.next : 0; const r = rings[idx];
  const a = tmpV.subVectors(prevPos, r.c).dot(r.n), b = new THREE.Vector3().subVectors(player.pos, r.c).dot(r.n);
  if ((a < 0) !== (b < 0)) {
    const t = a / (a - b); const hit = prevPos.clone().lerp(player.pos, t);
    if (hit.distanceTo(r.c) < RING_R + 1.5) {
      if (!race.on) startRace();
      else {
        sfxRing(race.next); save.coins += 2; updateHudStatic();
        r.mesh.scale.setScalar(1.5);
        if (race.next === rings.length - 1) finishRace(); else race.next++;
      }
      updateRings();
    }
  }
}
function updateRings() {
  rings.forEach((r, i) => {
    let col = 0x3aa0ff, op = 0.22, vis = true, ei = 0.5;
    if (!race.on) { if (i === 0) { col = 0x3dff6a; op = 0.95; ei = 1.6; } }
    else if (i < race.next) vis = false;
    else if (i === race.next) { col = i === rings.length - 1 ? 0xff5a3d : 0xffc21a; op = 1; ei = 1.8; }
    else if (i === race.next + 1) { col = 0xffffff; op = 0.55; ei = 0.6; }
    r.mesh.visible = vis; r.mat.emissive.set(col); r.mat.color.set(col); r.mat.opacity = op; r.mat.emissiveIntensity = ei;
  });
  startLabel.visible = !race.on;
}

// ---------------------------------------------------------------- caméra
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), camUp = new THREE.Vector3(0, 1, 0);
let firstCam = true;
function updateCamera(dt) {
  let want = new THREE.Vector3(), look = new THREE.Vector3(), wantUp = new THREE.Vector3(0, 1, 0), fov = 65, k = 8;
  if (player.mode === 'foot') {
    cam.yaw -= input.rx * dt * 2.6; cam.pitch = clamp(cam.pitch + input.ry * dt * 1.8, -0.2, 1.2);
    // vue TPS par-dessus l'épaule droite (style Fortnite)
    look.copy(player.pos).add(tmpV.set(Math.cos(cam.yaw) * 0.75, 1.75, -Math.sin(cam.yaw) * 0.75));
    want.set(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)).multiplyScalar(5.2).add(look);
    k = 12;
  } else if (player.mode === 'horse') {
    cam.orbitX = lerp(cam.orbitX, input.rx * 2.4, damp(4, dt)); cam.orbitY = lerp(cam.orbitY, input.ry * 0.6, damp(4, dt));
    const y = player.yaw + Math.PI + cam.orbitX, p = 0.28 + cam.orbitY;
    look.copy(player.pos).add(tmpV.set(0, 2.6, 0));
    want.set(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)).multiplyScalar(8 + Math.abs(player.speed) * 0.1).add(look);
    fov = 65 + Math.abs(player.speed) * 0.4; k = 6;
    cam.yaw = y;
  } else {
    cam.orbitX = lerp(cam.orbitX, input.rx * 2.6, damp(4, dt)); cam.orbitY = lerp(cam.orbitY, input.ry * 0.8, damp(4, dt));
    const dist = 13 + player.speed * 0.045;
    const y = player.yaw + Math.PI + cam.orbitX, p = -player.pitch * 0.85 + 0.17 + cam.orbitY;
    want.set(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)).multiplyScalar(dist).add(player.pos);
    look.copy(player.pos).addScaledVector(fwd, 14).add(tmpV.set(0, 2.6, 0));
    wantUp.set(-Math.cos(player.yaw) * Math.sin(player.roll) * 0.35, 1, Math.sin(player.yaw) * Math.sin(player.roll) * 0.35).normalize();
    fov = 68 + clamp((player.speed - 40) * 0.22, 0, 30); k = 5;
    cam.yaw = y;
  }
  if (firstCam) { camPos.copy(want); camLook.copy(look); firstCam = false; }
  camPos.lerp(want, damp(k, dt)); camLook.lerp(look, damp(k * 1.6, dt)); camUp.lerp(wantUp, damp(3, dt));
  const gy = groundAt(camPos.x, camPos.z) + 1.5; if (camPos.y < gy) camPos.y = gy;
  camera.position.copy(camPos); camera.up.copy(camUp); camera.lookAt(camLook);
  camera.fov = lerp(camera.fov, fov, damp(3, dt)); camera.updateProjectionMatrix();
}

// lignes de vitesse
const STREAKS = 160;
const streakGeo = new THREE.BufferGeometry(); streakGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(STREAKS * 6), 3));
const streakData = Array.from({ length: STREAKS }, () => ({ x: 0, y: 0, z: -Math.random() * 80 }));
streakData.forEach(resetStreak);
function resetStreak(s) { const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 16; s.x = Math.cos(a) * r; s.y = Math.sin(a) * r * 0.7; s.z = -60 - Math.random() * 30; }
const streaks = new THREE.LineSegments(streakGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
streaks.frustumCulled = false; camera.add(streaks);
function updateStreaks(dt) {
  const v = player.mode === 'eagle' ? player.speed : 0, o = clamp((v - 65) / 70, 0, 0.55);
  streaks.material.opacity = o; streaks.visible = o > 0.01; if (!streaks.visible) return;
  const arr = streakGeo.attributes.position.array, len = v * 0.05;
  streakData.forEach((s, i) => {
    s.z += v * dt * 1.4; if (s.z > 2) resetStreak(s);
    arr.set([s.x, s.y, s.z, s.x, s.y, s.z - len], i * 6);
  });
  streakGeo.attributes.position.needsUpdate = true;
}

// ---------------------------------------------------------------- boucle
const clock = new THREE.Clock();
let elapsed = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05); elapsed += dt;
  readInput();
  if (!started) {
    if (input.pressed.cross || input.pressed.options) begin();
    $('padstate').textContent = padName ? '🎮 Manette détectée — appuie sur ✕' : '🎮 Branche la manette et appuie sur une touche (ou joue au clavier)';
  } else if ($('result').classList.contains('on')) {
    if (input.pressed.cross || input.pressed.circle) $('result').classList.remove('on');
  } else if (paused) {
    if (input.pressed.options || input.pressed.cross) setPause(false);
    if (input.pressed.share) { save.invertY = !save.invertY; persist(); updateHudStatic(); }
    if (input.pressed.circle && race.on) { endRace(false); setPause(false); }
  } else {
    if (input.pressed.options) setPause(true);
    if (input.pressed.share) { save.invertY = !save.invertY; persist(); updateHudStatic(); toast(`Axe vertical en vol : ${save.invertY ? 'inversé' : 'normal'}`); }
    if (knight) {
      if (player.mode === 'foot') updateFoot(dt); else if (player.mode === 'horse') updateHorse(dt); else updateEagle(dt);
    }
  }
  if (celebrateT > 0) celebrateT -= dt;
  for (const m of mixers) m.update(paused ? 0 : dt);
  // décor animé
  if (windmillBlades) windmillBlades.rotation.z += dt * 0.6;
  for (const f of flags) { const a = f.geometry.attributes.position, b = f.userData.base; for (let i = 0; i < a.count; i++) { const x = b[i * 3]; a.array[i * 3 + 2] = Math.sin(elapsed * 4 + x * 0.9) * 0.35 * x / 5; } a.needsUpdate = true; }
  rings.forEach((r, i) => { r.mesh.scale.lerp(tmpV.setScalar(1 + (i === (race.on ? race.next : 0) ? Math.sin(elapsed * 4) * 0.05 : 0)), damp(6, dt)); });
  // flèche de guidage
  const tgt = rings[race.on ? race.next : 0].c;
  guide.visible = started && player.mode === 'eagle' && player.pos.distanceTo(tgt) > 60;
  if (guide.visible) { guide.position.copy(player.pos).add(tmpV.set(0, 6, 0)); guide.lookAt(tgt); }
  if (started) updateCamera(dt);
  updateStreaks(dt);
  // ombre qui suit le joueur
  sunLight.position.copy(player.pos).addScaledVector(SUN, 400); sunLight.target.position.copy(player.pos);
  // audio vent
  if (windGain) { const v = player.mode === 'eagle' ? player.speed : Math.abs(player.speed) * 0.5; windGain.gain.value = lerp(windGain.gain.value, clamp(v / 140, 0.02, 0.9) * 0.5, 0.05); windFilter.frequency.value = 250 + v * 12; }
  // HUD
  if (started) {
    $('race').style.display = race.on ? 'block' : 'none';
    if (race.on) { $('rtime').textContent = fmt(race.t); $('rcount').textContent = `${race.next}/${rings.length - 1}`; $('rdist').textContent = `${Math.round(player.pos.distanceTo(tgt))} m`; }
    $('flight').style.display = player.mode === 'eagle' ? 'block' : 'none';
    if (player.mode === 'eagle') { $('spd').textContent = Math.round(player.speed * 3.6); $('alt').textContent = Math.round(player.pos.y - groundAt(player.pos.x, player.pos.z)); }
  }
  renderer.render(scene, camera);
}
function setPause(p) { paused = p; $('pause').classList.toggle('on', p); $('pause-race').style.display = race.on ? 'block' : 'none'; }
function begin() {
  if (!knight) return;
  started = true; initAudio(); $('start').classList.add('off'); setMode('foot');
  horse.position.set(player.pos.x + 4, groundAt(player.pos.x + 4, player.pos.z - 3), player.pos.z - 3); horse.rotation.y = Math.PI * 0.8;
  eagle.visible = false;
  setTimeout(() => toast('Appuie sur <b>△</b> pour appeler ton aigle, <b>□</b> pour ton cheval', 4500), 800);
}
$('start').addEventListener('click', () => { begin(); });
$('fs').addEventListener('click', (e) => { e.stopPropagation(); toggleFullscreen(); });
window.__aeriea = { player, race, rings, setMode, begin, get started() { return started; } };

updateRings(); updateHudStatic(); updateHints();
$('targets').textContent = `Or ≤ ${fmt(GOLD_T)} · Argent ≤ ${fmt(SILVER_T)}`;
loadModels().then(() => { $('loading').textContent = ''; horse.position.set(player.pos.x + 4, groundAt(player.pos.x + 4, player.pos.z - 3), player.pos.z - 3); scene.add(knight); knight.position.copy(player.pos); eagle.visible = false; frame0(); })
  .catch((e) => { $('loading').textContent = 'Erreur de chargement : ' + e.message; console.error(e); });
// vue d'intro (avant de commencer) : caméra qui tourne autour du château
function frame0() {
  camera.position.set(CASTLE.x + 160, CASTLE.h + 70, CASTLE.z + 200); camera.lookAt(CASTLE.x, CASTLE.h + 20, CASTLE.z);
  const intro = () => { if (started) return; const t = performance.now() / 1000 * 0.05; camera.position.set(CASTLE.x + Math.cos(t) * 240, CASTLE.h + 80, CASTLE.z + Math.sin(t) * 240); camera.lookAt(CASTLE.x, CASTLE.h + 15, CASTLE.z); requestAnimationFrame(intro); };
  intro();
}
frame();
