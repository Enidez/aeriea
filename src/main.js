// Aériea — exploration libre ou course d'anneaux, à pied, à cheval, sur un oiseau géant ou un dragon.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import knightGlb from '../assets/Knight-slim.glb';
import paladinGlb from '../assets/Paladin.glb';
import kingGlb from '../assets/King.glb';
import horseGlb from '../assets/Horse.glb';
import goldenGlb from '../assets/GoldenEagle.glb';
import baldGlb from '../assets/BaldEagle.glb';
import flintGlb from '../assets/FlintMaw.glb';
import { clamp, lerp, damp, angDiff, $ } from './util.js';
import { makeTextures } from './textures.js';
import { buildWorld, makeMaterials, groundAt, terrainAt, colliders, boxes, animated, CASTLE, VILLAGE, seasonAt } from './world.js';
import { createFlyer, FLYER_RIGS } from './flyers.js';
import { createBossFight } from './combat.js';
import { rigBones, faceForward, retargetClips, boneKey } from './retarget.js';
import { makeSword, gripLike } from './props.js';
import { createAudio } from './audio.js';
import { createMusic } from './music.js';
import { createFire } from './fire.js';
import { createBots } from './bots.js';
const music = createMusic();
const sfx = createAudio();

// ---------------------------------------------------------------- sauvegarde
const SAVE_KEY = 'aeriea-save-v1';
let save = { coins: 0, best: null, medal: null, goldEagle: false, invertY: false, mount: 'eagle', quality: 'high', bestCombo: 0, camInvX: false, camInvY: false, ui: 1, reduceFx: false, musicVol: 0.6 };
try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { /* stockage indisponible */ }
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } };

// ---------------------------------------------------------------- rendu
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.72;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.3, 15000);
scene.add(camera);
const composerRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, composerRT);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.22, 0.5, 1.1);
composer.addPass(bloom);
composer.addPass(new OutputPass());
function applyQuality() {
  const hi = save.quality === 'high';
  renderer.setPixelRatio(Math.min(devicePixelRatio, hi ? 2 : 1));
  renderer.setSize(innerWidth, innerHeight); composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight);
  sunLight.shadow.mapSize.set(hi ? 4096 : 2048, hi ? 4096 : 2048); sunLight.shadow.map?.dispose(); sunLight.shadow.map = null;
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); });

// ---------------------------------------------------------------- ciel & lumière
const SUN = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 30), THREE.MathUtils.degToRad(140));
const sky = new Sky();
sky.scale.setScalar(12000);
const su = sky.material.uniforms;
su.turbidity.value = 4; su.rayleigh.value = 1.4; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.86; su.sunPosition.value.copy(SUN);
scene.add(sky);
{
  const pmrem = new THREE.PMREMGenerator(renderer), envScene = new THREE.Scene(), s2 = new Sky(); s2.scale.setScalar(100);
  for (const k in su) s2.material.uniforms[k].value = su[k].value;
  envScene.add(s2); scene.environment = pmrem.fromScene(envScene).texture; scene.environmentIntensity = 0.55;
}
const FOG = 0xb4c9dc;
scene.fog = new THREE.Fog(FOG, 700, 4300);
const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4f5d32, 0.75);
scene.add(hemi);
const sunLight = new THREE.DirectionalLight(0xfff0d2, 3.4);
sunLight.castShadow = true;
sunLight.shadow.bias = -0.0004; sunLight.shadow.normalBias = 0.5;
scene.add(sunLight, sunLight.target);
function shadowBox(r) { const c = sunLight.shadow.camera; if (c.right === r) return; Object.assign(c, { left: -r, right: r, top: r, bottom: -r, near: 10, far: 1200 }); c.updateProjectionMatrix(); }
shadowBox(70);

// ---------------------------------------------------------------- monde
const tex = makeTextures();
const mats = makeMaterials(tex);
const grass = buildWorld(scene, tex, mats);
scene.traverse((o) => { if (o.material?.uniforms?.fogColor) o.material.uniforms.fogColor.value.set(FOG); });

// ---------------------------------------------------------------- course d'anneaux
const COURSE = [
  [260, -60, 55], [150, 90, 38], [-30, 260, 32], [-280, 340, 14], [-470, 220, 18], [-640, -30, 55],
  [-780, -330, 70], [-600, -640, 60], [-330, -790, 55], [-230, -480, 22], [40, -680, 90], [420, -800, 95],
  [760, -560, 85], [860, -200, 70], [700, 160, 45], [480, 320, 26], [360, 40, 24], [260, -190, 95],
];
const RING_R = 14;
const rings = COURSE.map(([x, z, alt]) => {
  const mat = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x3aa0ff, emissiveIntensity: 0.6, transparent: true, opacity: 0.35, roughness: 0.4, metalness: 0.2 });
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(RING_R, 1.3, 16, 64), mat);
  mesh.position.set(x, groundAt(x, z) + alt, z); scene.add(mesh);
  return { mesh, mat, c: mesh.position, n: new THREE.Vector3() };
});
rings.forEach((r, i) => { const a = rings[Math.max(0, i - 1)].c, b = rings[Math.min(rings.length - 1, i + 1)].c; r.n.subVectors(b, a).normalize(); r.mesh.lookAt(r.c.clone().add(r.n)); });
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
const guide = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3, 10).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0.9, depthTest: false }));
guide.renderOrder = 10; scene.add(guide);

// ---------------------------------------------------------------- montures volantes
const MOUNTS = {
  eagle: { name: 'Aigle royal', icon: '🦅', kind: 'bird', model: 'golden', span: 14, min: 16, max: 180, thrust: 39, turn: 1.05, cam: 14, clear: 4, skin: { tint: 0x9a6d42 } },
  falcon: { name: 'Pygargue', icon: '🦅', kind: 'bird', model: 'bald', span: 12, min: 18, max: 205, thrust: 46, turn: 1.4, cam: 12, clear: 3.5 },
  raven: { name: 'Aigle des ténèbres', icon: '🐦‍⬛', kind: 'bird', model: 'golden', span: 16, min: 14, max: 170, thrust: 37, turn: 1.0, cam: 16, clear: 5, skin: { tint: 0x3a3640, metal: 0.25, rough: 0.5 } },
  gold: { name: 'Aigle d’Or', icon: '✨', kind: 'bird', model: 'golden', span: 15, min: 17, max: 195, thrust: 43, turn: 1.15, cam: 15, clear: 4.5, locked: () => !save.goldEagle, skin: { tint: 0xffd36a, metal: 0.6, rough: 0.35, emissive: 0x2a1800 } },
  dragon: { name: 'Dragon', icon: '🐉', kind: 'dragon', model: 'flint', span: 30, min: 20, max: 150, thrust: 30, turn: 0.72, cam: 28, clear: 9, flapMul: 1.9 },
};
const MOUNT_IDS = Object.keys(MOUNTS);
const mountDef = () => MOUNTS[save.mount] || MOUNTS.eagle;
if (!MOUNTS[save.mount] || MOUNTS[save.mount].locked?.()) save.mount = 'eagle';

// ---------------------------------------------------------------- modèles
const loader = new GLTFLoader();
const buf = (u) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength);
const loadGlb = (u) => new Promise((res, rej) => loader.parse(buf(u), '', res, rej));
function normalize(obj, size, axis = 'max') {
  const b = new THREE.Box3().setFromObject(obj), sz = b.getSize(new THREE.Vector3());
  obj.scale.multiplyScalar(size / (axis === 'max' ? Math.max(sz.x, sz.y, sz.z) : sz[axis]));
  return new THREE.Box3().setFromObject(obj);
}
const shadowAll = (o) => o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; } });
const firstMesh = (o) => { let r = null; o.traverse((m) => { if (!r && m.isMesh) r = m; }); return r; };
// boneKey vient de retarget.js
function findBone(root, ...names) { const want = names.map(boneKey); let r = null; root.traverse((o) => { if (!r && o.isBone && want.includes(boneKey(o.name))) r = o; }); return r; }
// position animée (morph targets) d'un groupe de sommets : le dos réel de la monture
function morphPoint(mesh, ids, out) {
  const g = mesh.geometry, p = g.attributes.position, ma = g.morphAttributes.position || [], inf = mesh.morphTargetInfluences || [];
  out.set(0, 0, 0);
  for (const i of ids) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    for (let k = 0; k < ma.length; k++) { const w = inf[k]; if (w) { x += ma[k].getX(i) * w; y += ma[k].getY(i) * w; z += ma[k].getZ(i) * w; } }
    out.x += x; out.y += y; out.z += z;
  }
  return out.multiplyScalar(1 / ids.length);
}
// demi-largeur du corps sous le siège (maxFrac exclut les ailes)
function bodyHalfWidth(mesh, ids, maxFrac) {
  const p = mesh.geometry.attributes.position; mesh.geometry.computeBoundingBox(); const bb = mesh.geometry.boundingBox, sz = bb.getSize(new THREE.Vector3());
  let sy = 0, szz = 0; for (const i of ids) { sy += p.getY(i); szz += p.getZ(i); } sy /= ids.length; szz /= ids.length;
  let m = 0; for (let i = 0; i < p.count; i++) { const x = Math.abs(p.getX(i)), y = p.getY(i), z = p.getZ(i);
    if (Math.abs(z - szz) < sz.z * 0.08 && y < sy - sz.y * 0.03 && y > sy - sz.y * 0.25 && x < sz.x * maxFrac) m = Math.max(m, x); }
  return m;
}
function pickBack(mesh, z0, z1) {
  const p = mesh.geometry.attributes.position, c = [];
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); if (Math.abs(x) < 3 && z > z0 && z < z1) c.push([i, p.getY(i)]); }
  return c.sort((a, b) => b[1] - a[1]).slice(0, 4).map((a) => a[0]);
}

const mixers = [];
const rider = new THREE.Group(); scene.add(rider); // conteneur du chevalier (pieds, hanches ou selle selon le mode)
let knight, kMixer, knightActions = {}, knightAction, kb = {};
const sitHips = new THREE.Vector3(), standHips = new THREE.Vector3();
let horse, horseMesh, horseAction, horseSeat, horseStandT = 0, horseHalfW = 0.45;
const flyers = {}; // créatures volantes riggées
let fight, animSource, playerSword, creatureGltf, bots, retargetedClips;
const fire = createFire(scene);

async function loadModels() {
  const [k, h, pal, kg, gEagle, bEagle, flint] = await Promise.all([loadGlb(knightGlb), loadGlb(horseGlb), loadGlb(paladinGlb), loadGlb(kingGlb), loadGlb(goldenGlb), loadGlb(baldGlb), loadGlb(flintGlb)]);
  // source d'animations : le chevalier KayKit (29 animations), jamais affiché
  const src = k.scene; normalize(src, 1.85, 'y'); src.updateMatrixWorld(true);
  animSource = { root: src, bones: rigBones(src, 'kaykit'), clips: k.animations };
  // le paladin (squelette Mixamo) : orienté vers +z, 1,85 m, pieds au sol
  const pm = pal.scene; shadowAll(pm);
  const pb = rigBones(pm, 'mixamo'); faceForward(pm, pb);
  const pbox = normalize(pm, 1.85, 'y'); pm.position.y -= pbox.min.y;
  knight = new THREE.Group(); knight.add(pm);
  pm.traverse((o) => { if (o.isMesh) { o.material.envMapIntensity = 1.2; } });
  const clips = retargetClips(animSource, { root: knight, bones: pb }, k.animations); retargetedClips = clips;
  kMixer = new THREE.AnimationMixer(knight); mixers.push(kMixer);
  for (const c of clips) knightActions[c.name] = kMixer.clipAction(c);
  for (const n of ['Jump_Full_Short', 'Cheer']) { knightActions[n].setLoop(THREE.LoopOnce); knightActions[n].clampWhenFinished = true; }
  kb = { ftL: pb.footL, ftR: pb.footR, hips: pb.hips, spine: pb.spine, chest: pb.chest, head: pb.head, ulL: pb.thighL, ulR: pb.thighR, llL: pb.shinL, llR: pb.shinR, uaL: pb.armL, uaR: pb.armR, laL: pb.foreL, laR: pb.foreR };
  // épée longue dans la main droite
  let finger = null; pm.traverse((o) => { if (!finger && o.isBone && boneKey(o.name) === 'righthandmiddle1') finger = o; });
  const srcSword = src.getObjectByName('1H_Sword');
  playerSword = gripLike(srcSword, pb.handR, finger || pb.handR.children[0], makeSword(0.95, 0.055));
  rider.add(knight);
  const measure = (name, out) => { kMixer.stopAllAction(); knightActions[name].reset().play(); kMixer.update(0.01); rider.updateMatrixWorld(true); kb.hips.getWorldPosition(out).sub(rider.position); kMixer.stopAllAction(); };
  measure('Sit_Chair_Idle', sitHips); measure('Idle', standHips);
  knight.updateMatrixWorld(true);
  // cheval (proportions d'un destrier : ~1,8 m au garrot)
  horse = new THREE.Group(); const hm = h.scene; shadowAll(hm);
  const hb = normalize(hm, 2.9, 'y'); hm.position.y -= hb.min.y; horse.add(hm);
  horseMesh = firstMesh(hm); horseSeat = pickBack(horseMesh, -45, 0); hm.updateMatrixWorld(true);
  horseHalfW = bodyHalfWidth(horseMesh, horseSeat, 0.5) * horseMesh.getWorldScale(new THREE.Vector3()).x;
  const hmx = new THREE.AnimationMixer(hm); mixers.push(hmx); horseAction = hmx.clipAction(h.animations[0]); horseAction.play();
  // le modèle n'a qu'un galop : on cherche l'image où les sabots sont le plus rassemblés pour la pose d'arrêt
  { const p = horseMesh.geometry.attributes.position, low = []; for (let i = 0; i < p.count; i++) if (p.getY(i) < 25) low.push(i);
    const v = new THREE.Vector3(), D = h.animations[0].duration; let best = 1e9;
    for (let i = 0; i < 48; i++) { horseAction.time = D * i / 48; hmx.update(0); let a = 1e9, b = -1e9; for (const j of low) { morphPoint(horseMesh, [j], v); a = Math.min(a, v.z); b = Math.max(b, v.z); } if (b - a < best) { best = b - a; horseStandT = D * i / 48; } }
    horseAction.time = horseStandT; }
  scene.add(horse);
  // créatures volantes : aigle royal, pygargue, dragon (modèles riggés et animés)
  for (const [key, g, span] of [['golden', gEagle, 14], ['bald', bEagle, 12], ['flint', flint, 30]]) {
    const f = createFlyer(g, { ...FLYER_RIGS[key], span }); f.span = span; flyers[key] = f; mixers.push(f.mixer); scene.add(f.group); f.group.visible = false;
  }
  creatureGltf = { golden: gEagle, bald: bEagle, flint };
  bots = createBots({ scene, gltfs: creatureGltf, knight, clips: retargetedClips, sitHips, groundAt, center: { x: 0, z: 0, vx: VILLAGE.x, vz: VILLAGE.z } });
  applyMount();
  fight = createBossFight({
    sfx, scene, kingGltf: kg, animSource, normalize, swords: [playerSword], knight, knightActions, playKnight, player, groundAt, toast, tone, cam, $, save, persist, mats, camBasis,
    knightScale: knight.scale.x, arena: { x: CASTLE.x, y: CASTLE.h, z: CASTLE.z + 22 },
    onReward: () => updateHudStatic(),
    onEnter: () => { setHints('<b>L</b> se déplacer (verrouillé) · <b>□</b> attaque (combo ×3) · <b>△</b> coup lourd · <b>✕</b> esquive · <b>L1/L2</b> parade au bon moment · <b>◯</b> coup de grâce · garde automatique face au roi'); },
    onExit: () => updateHints(),
  });
}
function applyMount() {
  const d = mountDef();
  const f = flyers[d.model]; if (!f) return;
  const k = d.span / f.span; f.model.scale.multiplyScalar(k); f.model.position.multiplyScalar(k); f.span = d.span; f.hw *= k; f.skin(d.skin);
  for (const k in flyers) if (k !== d.model) flyers[k].group.visible = false;
  $('mountName').textContent = `${d.icon} ${d.name}`;
}
const curFlyer = () => flyers[mountDef().model];
const flyer = () => curFlyer().group;
function playKnight(name, fade = 0.25) {
  if (window.__animLock && name !== window.__animLock) return; // debug : animation figée
  const a = knightActions[name]; if (!a || a === knightAction) return;
  a.reset().play(); if (knightAction) a.crossFadeFrom(knightAction, fade, false); knightAction = a;
}

// ---------------------------------------------------------------- entrées (manette PS4 + clavier)
const keys = new Set(), tapped = new Set();
addEventListener('keydown', (e) => { keys.add(e.code); tapped.add(e.code); if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); if (e.code === 'KeyF') toggleFullscreen(); });
addEventListener('keyup', (e) => keys.delete(e.code));
const BTN = { cross: 0, circle: 1, square: 2, triangle: 3, l1: 4, r1: 5, l2: 6, r2: 7, share: 8, options: 9, up: 12, down: 13, left: 14, right: 15 };
const KEYMAP = { cross: ['Space', 'Enter'], circle: ['KeyR', 'Backspace'], square: ['KeyQ'], triangle: ['KeyE'], l1: ['KeyZ'], r1: ['KeyC'], share: ['KeyI'], options: ['Escape', 'KeyP'], left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'] };
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
addEventListener('gamepadconnected', () => toast('🎮 Manette connectée'));
function toggleFullscreen() { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {}); else document.exitFullscreen?.(); }

// ---------------------------------------------------------------- audio (généré)
let actx, windGain, windFilter;
function initAudio() {
  if (actx) { actx.resume(); return; }
  try {
    actx = sfx.init(); if (!actx) return;
    const len = actx.sampleRate * 2, nb = actx.createBuffer(1, len, actx.sampleRate), d = nb.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const src = actx.createBufferSource(); src.buffer = nb; src.loop = true;
    windFilter = actx.createBiquadFilter(); windFilter.type = 'lowpass'; windFilter.frequency.value = 400;
    windGain = actx.createGain(); windGain.gain.value = 0;
    src.connect(windFilter).connect(windGain).connect(actx.destination); src.start();
  } catch (e) { actx = null; }
}
function tone(freq, t0, dur, type = 'triangle', vol = 0.18, slide = 0) {
  if (!actx) return; const o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.value = freq;
  const t = actx.currentTime + t0; if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.05);
}
const sfxRing = (i) => sfx.ring(i);
const sfxFanfare = () => sfx.fanfare();
const sfxPoof = () => sfx.wing();
const sfxTrick = (n) => sfx.trick(n);
const sfxCall = () => (mountDef().kind === 'dragon' ? sfx.dragonRoar() : sfx.eagle());
const sfxBail = () => sfx.bail();
const sfxThud = () => sfx.thud();

// ---------------------------------------------------------------- HUD
function toast(msg, ms = 2200) { const t = $('toast'); t.innerHTML = glyphs(msg); t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), ms); }
const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
function updateHudStatic() {
  $('coins').textContent = save.coins;
  $('best').textContent = save.best ? `${fmt(save.best)} ${save.medal || ''}` : '—';
  if (paused) renderMenu();
}
// pastilles de touches : <b>✕</b> → rond bleu, <b>R2</b> → touche, etc.
const GLYPH = { '✕': 'g r x', '◯': 'g r o', '△': 'g r t', '□': 'g r s' };
function glyphs(html) { return html.replace(/<b>([^<\s]{1,8})<\/b>/g, (m, k) => k.split('/').map((p) => `<span class="${GLYPH[p] || 'g'}">${p}</span>`).join('')); }
function setHints(html) { $('hints').innerHTML = html.split(' · ').map((h) => `<span class="h">${glyphs(h)}</span>`).join(''); }

// ---------------------------------------------------------------- état
let gameMode = 'free';
const player = {
  mode: 'foot', pos: new THREE.Vector3(CASTLE.x - 10, 0, CASTLE.z + 75), yaw: Math.PI, vy: 0, onGround: true, speed: 0,
  vel: new THREE.Vector3(), stand: false, air: null, flip: 0, trick: null, rollVis: 0,
};
player.pos.y = groundAt(player.pos.x, player.pos.z);
// état de vol de la monture volante (montée ou non)
const fl = { state: 'hidden', pos: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, speed: 30, barrel: 0, barrelDir: 0, loop: 0, extraRoll: 0, t: 0, path: null, fwd: new THREE.Vector3(0, 0, 1) };
const hs = { state: 'idle', speed: 0, yaw: Math.PI * 0.8, vy: 0, onGround: true }; // cheval
const cam = { yaw: Math.PI, pitch: 0.18, orbitX: 0, orbitY: 0, shake: 0 };
const race = { on: false, next: 0, t: 0 };
const prevPos = new THREE.Vector3();
let paused = false, started = false, celebrateT = 0, menuSel = 0;

// ---------------------------------------------------------------- combos de figures
const combo = { names: [], score: 0, mult: 0, timer: 0, hold: 0 };
function trick(name, pts) {
  combo.names.push(name); if (combo.names.length > 4) combo.names.shift();
  combo.score += pts; combo.mult++; combo.timer = 3; sfxTrick(combo.mult); drawCombo();
}
function holdTrick(name, ptsPerSec, dt) { // figure continue (rase-mottes…)
  if (combo.names[combo.names.length - 1] !== name) { combo.names.push(name); if (combo.names.length > 4) combo.names.shift(); combo.mult++; }
  combo.score += ptsPerSec * dt; combo.timer = Math.max(combo.timer, 1.5); drawCombo();
}
function drawCombo() { $('trick').classList.add('on'); $('tnames').textContent = combo.names.join(' + '); $('tscore').textContent = `${Math.round(combo.score)} × ${combo.mult}`; }
function updateCombo(dt) {
  if (combo.timer <= 0) return; combo.timer -= dt;
  if (combo.timer <= 0) {
    const total = Math.round(combo.score * combo.mult), gain = Math.floor(total / 250);
    if (gain) sfx.coin(); save.coins += gain; if (total > (save.bestCombo || 0)) save.bestCombo = total; persist(); updateHudStatic();
    $('tscore').textContent = `${total} pts${gain ? ` · +${gain} 🪙` : ''}`; $('trick').classList.add('bank');
    setTimeout(() => $('trick').classList.remove('on', 'bank'), 1600);
    combo.names = []; combo.score = 0; combo.mult = 0;
  }
}
function bail(msg = 'Raté !') {
  if (combo.mult) { $('tscore').textContent = msg; $('trick').classList.add('fail'); setTimeout(() => $('trick').classList.remove('on', 'fail'), 1400); }
  combo.names = []; combo.score = 0; combo.mult = 0; combo.timer = 0; sfxBail();
}

// ---------------------------------------------------------------- modes
const MODE_LABEL = () => ({ foot: '🛡️ À pied', horse: '🐎 À cheval', fly: `${mountDef().icon} ${mountDef().name}`, fall: '🪂 Chute libre' })[player.mode];
function setMode(mode) {
  const from = player.mode; player.mode = mode;
  if (mode === 'foot') { player.vy = 0; player.speed = 0; player.stand = false; player.air = null; playKnight('Idle'); }
  if (mode === 'horse') { player.speed = hs.speed; playKnight('Sit_Chair_Idle', 0.15); }
  if (mode === 'fly') { fl.state = 'ridden'; player.stand = false; player.air = null; playKnight('Sit_Chair_Idle', 0.15); flyer().visible = true; }
  if (mode === 'fall') { playKnight('Jump_Full_Short', 0.15); }
  if ((from === 'fly' || mode === 'foot') && race.on && mode !== 'fly' && mode !== 'fall') endRace(false);
  cam.orbitX = 0; cam.orbitY = 0;
  $('mode').textContent = MODE_LABEL(); $('mountName').style.display = mode === 'fly' ? 'none' : '';
  updateHints();
}
function updateHints() {
  const m = mountDef(), call = `<b>△</b> appeler ${m.kind === 'dragon' ? 'le dragon' : 'l’oiseau'}`;
  const h = {
    foot: `<b>L</b> marcher · <b>R2</b> courir · <b>✕</b> sauter (×2 salto) · <b>L1</b> épée · ${call} · <b>□</b> cheval`,
    horse: `<b>L</b> diriger · <b>R2</b> galop · <b>✕</b> sauter · <b>◯</b> descendre · ${call} (il te cueille au galop)`,
    fly: player.stand ? '<b>✕</b> saut — en l’air : <b>stick</b> salto · <b>L1/R1</b> vrille · <b>△</b> se rasseoir · <b>◯</b> plonger dans le vide'
      : `<b>L</b> piloter · <b>R</b> caméra / zoom · <b>R2</b> battre des ailes · <b>L2</b> freiner · <b>L1/R1</b> pirouette · <b>L1+R1</b> Immelmann · ${m.kind === 'dragon' ? '<b>□</b> souffle de feu (maintenir)' : '<b>□</b> looping'} · <b>✕</b> se lever · <b>◯</b> sauter dans le vide`,
    fall: `<b>L</b> se diriger · <b>✕</b> salto avant · <b>□</b> salto arrière · <b>L1/R1</b> vrille · ${call}`,
  };
  setHints(h[player.mode] + ' · <b>OPTIONS</b> menu');
}

// ---------------------------------------------------------------- collisions
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), upV = new THREE.Vector3(0, 1, 0);
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

// ---------------------------------------------------------------- à pied
function camBasis() { const f = new THREE.Vector3(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw)); return [f, new THREE.Vector3(-f.z, 0, f.x)]; }
function updateFoot(dt) {
  const [camF, camR] = camBasis();
  const move = camF.multiplyScalar(-input.ly).add(camR.multiplyScalar(input.lx));
  const mag = Math.min(1, move.length());
  player.speed = lerp(player.speed, mag * (input.r2 > 0.3 ? 9 : 4.2), damp(10, dt));
  if (mag > 0.05) player.yaw += angDiff(player.yaw, Math.atan2(move.x, move.z)) * damp(12, dt);
  player.pos.x += Math.sin(player.yaw) * player.speed * dt; player.pos.z += Math.cos(player.yaw) * player.speed * dt;
  pushOutColliders(player.pos, 0.6);
  const g = groundAt(player.pos.x, player.pos.z);
  if (input.pressed.cross) {
    if (player.onGround) { player.vy = 7.2; player.onGround = false; playKnight('Jump_Full_Short', 0.1); }
    else if (player.flip === 0 && player.vy > -4) { player.vy = Math.max(player.vy, 5); player.flip = 0.0001; } // salto
  }
  player.vy -= 22 * dt; player.pos.y += player.vy * dt;
  if (player.flip > 0) { player.flip += dt / 0.55; if (player.flip >= 1) { player.flip = 0; trick('Salto', 150); } }
  if (player.pos.y <= g) {
    if (player.flip > 0) { player.flip = 0; bail(); }
    player.pos.y = g; player.vy = 0; player.onGround = true;
  }
  if (celebrateT > 0) playKnight('Cheer');
  else if (player.onGround && !(knightAction === knightActions.Jump_Full_Short && knightAction.isRunning())) {
    playKnight(player.speed > 6 ? 'Running_A' : player.speed > 0.6 ? 'Walking_A' : 'Idle');
    if (knightAction === knightActions.Running_A) knightAction.timeScale = player.speed / 8;
    if (knightAction === knightActions.Walking_A) knightAction.timeScale = player.speed / 3.5;
  }
  if (input.pressed.l1) fight.toggleSword();
  const inFort = Math.abs(player.pos.x - CASTLE.x) < 46 && Math.abs(player.pos.z - CASTLE.z) < 46;
  if ((input.pressed.triangle || input.pressed.square) && inFort) toast('🏰 Pas de monture dans la forteresse', 1400);
  else if (input.pressed.triangle && fl.state !== 'summon') summonFlyer();
  else if (input.pressed.square) {
    if (horse.position.distanceTo(player.pos) < 5) setMode('horse');
    else { hs.state = 'come'; sfx.whistle(); toast('🐎 Ton cheval arrive au galop'); }
  }
}

// ---------------------------------------------------------------- cheval
function updateHorseBody(dt, ridden) {
  if (!ridden && hs.state === 'come') {
    const dx = player.pos.x - horse.position.x, dz = player.pos.z - horse.position.z, d = Math.hypot(dx, dz);
    hs.yaw += angDiff(hs.yaw, Math.atan2(dx, dz)) * damp(4, dt);
    hs.speed = lerp(hs.speed, d > 25 ? 20 : d > 4 ? 8 : 0, damp(2, dt));
    if (d < 3.5) { hs.state = 'idle'; if (player.mode === 'foot' && !fight?.active) setMode('horse'); }
  } else if (!ridden) hs.speed = lerp(hs.speed, 0, damp(1.2, dt));
  const p = horse.position;
  p.x += Math.sin(hs.yaw) * hs.speed * dt; p.z += Math.cos(hs.yaw) * hs.speed * dt;
  pushOutColliders(p, 1.4);
  const g = groundAt(p.x, p.z);
  hs.vy -= 22 * dt; p.y += hs.vy * dt;
  if (p.y <= g) { p.y = g; hs.vy = 0; hs.onGround = true; }
  const ahead = groundAt(p.x + Math.sin(hs.yaw) * 1.5, p.z + Math.cos(hs.yaw) * 1.5) - groundAt(p.x - Math.sin(hs.yaw) * 1.5, p.z - Math.cos(hs.yaw) * 1.5);
  horse.rotation.set(-Math.atan2(ahead, 3) * 0.8 - (hs.onGround ? 0 : clamp(hs.vy * 0.035, -0.3, 0.3)), hs.yaw, 0, 'YXZ');
  // galop : amplitude et cadence suivent la vitesse (pose de repos à l'arrêt)
  const sp = Math.abs(hs.speed);
  if (sp < 0.6 && hs.onGround) { // à l'arrêt : on glisse vers la pose debout
    horseAction.timeScale = 0; const D = horseAction.getClip().duration, d = ((horseStandT - horseAction.time) % D + D * 1.5) % D - D / 2;
    horseAction.time += d * damp(6, dt);
  } else horseAction.timeScale = hs.onGround ? clamp(sp / 13, 0.45, 1.7) : 0.25;
}
function updateHorse(dt) {
  const want = input.ly < -0.1 ? (-input.ly) * (input.r2 > 0.3 ? 22 : 10) : input.ly > 0.3 ? -3 : 0;
  hs.speed = lerp(hs.speed, want, damp(want > hs.speed ? 1.6 : 3, dt));
  hs.yaw -= input.lx * dt * lerp(2.2, 1.2, clamp(hs.speed / 22, 0, 1));
  if (input.pressed.cross && hs.onGround) { hs.vy = 8; hs.onGround = false; }
  player.pos.copy(horse.position); player.yaw = hs.yaw; player.speed = hs.speed;
  if (input.pressed.circle) { player.pos.add(tmpV.set(Math.cos(hs.yaw) * 2.2, 0, -Math.sin(hs.yaw) * 2.2)); player.pos.y = groundAt(player.pos.x, player.pos.z); setMode('foot'); }
  else if (input.pressed.triangle && fl.state !== 'summon') summonFlyer();
}

// ---------------------------------------------------------------- monture volante : appel, pilotage, IA
const seatW = new THREE.Vector3(), seatQ = new THREE.Quaternion();
function flyerSeat(outP, outQ) { // position/orientation monde du siège
  const d = mountDef();
  curFlyer().seat(outP, outQ);
}
function placeFlyer() {
  const g = flyer();
  g.position.copy(fl.pos); g.rotation.set(-fl.pitch, fl.yaw, fl.roll + fl.extraRoll, 'YXZ');
  fl.fwd.set(Math.sin(fl.yaw) * Math.cos(fl.pitch), Math.sin(fl.pitch), Math.cos(fl.yaw) * Math.cos(fl.pitch));
}
function summonFlyer() {
  const d = mountDef(); sfxCall(); flyer().visible = true;
  for (const k in flyers) flyers[k].group.visible = k === d.model;
  const [camF] = camBasis(); const back = camF.clone().negate();
  const gy = groundAt(player.pos.x, player.pos.z);
  fl.path = { p0: player.pos.clone().addScaledVector(back, 110 + d.span * 2).add(tmpV.set(0, 55 + d.span, 0)), t: 0, T: 2.2 + d.span * 0.02, from: player.mode };
  fl.path.p0.y = Math.max(fl.path.p0.y, groundAt(fl.path.p0.x, fl.path.p0.z) + 40);
  fl.state = 'summon'; fl.speed = 40; fl.pos.copy(fl.path.p0); fl.roll = 0;
  toast(`${d.icon} ${d.name} arrive !`, 1500);
}
function updateSummon(dt) {
  const P = fl.path, d = mountDef(); P.t += dt;
  // point de rendez-vous : un peu devant le joueur, à hauteur de selle
  const lead = player.mode === 'horse' ? Math.max(0, hs.speed) * 0.35 : player.speed * 0.3;
  const p2 = player.pos.clone().add(tmpV.set(Math.sin(player.yaw) * lead, (d.kind === 'dragon' ? 1.2 : 1.6) + (player.mode === 'horse' ? 1.8 : 0), Math.cos(player.yaw) * lead));
  const p1 = p2.clone().lerp(P.p0, 0.35); p1.y = p2.y + 1;
  const t = clamp(P.t / P.T, 0, 1), e = 1 - (1 - t) * (1 - t) * 0.6 - 0.4 * (1 - t);
  const u = clamp(e, 0, 1), a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
  const prev = fl.pos.clone();
  fl.pos.set(a * P.p0.x + b * p1.x + c * p2.x, a * P.p0.y + b * p1.y + c * p2.y, a * P.p0.z + b * p1.z + c * p2.z);
  const v = tmpV.subVectors(fl.pos, prev); if (v.lengthSq() > 1e-6) { fl.yaw = Math.atan2(v.x, v.z); fl.pitch = lerp(fl.pitch, Math.atan2(v.y, Math.hypot(v.x, v.z)), damp(6, dt)); fl.speed = v.length() / dt; }
  fl.roll = lerp(fl.roll, 0, damp(3, dt)); fl.extraRoll = 0;
  placeFlyer();
  curFlyer().flap((t > 0.7 ? 0.4 : 1.2) * (d.flapMul || 1), dt);
  // le chevalier saute sur la monture au dernier moment
  if (P.T - P.t < 0.45 && !P.jumped) { P.jumped = true; playKnight('Jump_Full_Short', 0.1); }
  if (P.t >= P.T) {
    if (P.from === 'horse') hs.state = 'idle';
    fl.speed = Math.max(d.min + 8, P.from === 'horse' ? hs.speed + 12 : 30); fl.pitch = 0.3;
    setMode('fly'); trick(P.from === 'horse' ? 'Envol au galop' : 'Envol', P.from === 'horse' ? 600 : 200);
  }
}
function flightStep(dt, d, ctl) { // physique de vol commune
  const sp = fl.speed;
  fl.yaw -= Math.sin(fl.roll) * dt * 1.25 * clamp(60 / Math.max(sp, 25), 0.55, 1.6) * 1.1 * d.turn;
  const thrust = ctl.r2 * d.thrust + 9, grav = -Math.sin(fl.pitch) * 30, drag = 0.0045 * sp * sp * (175 / d.max) + ctl.l2 * 0.018 * sp * sp;
  fl.speed = clamp(sp + (thrust + grav - drag) * dt, d.min, d.max);
  fl.fwd.set(Math.sin(fl.yaw) * Math.cos(fl.pitch), Math.sin(fl.pitch), Math.cos(fl.yaw) * Math.cos(fl.pitch));
  prevPos.copy(fl.pos);
  fl.pos.addScaledVector(fl.fwd, fl.speed * dt);
  const g = groundAt(fl.pos.x, fl.pos.z) + d.clear;
  if (fl.pos.y < g) { fl.pos.y = g; if (fl.pitch < 0.15 && !fl.loop) fl.pitch = lerp(fl.pitch, 0.25, damp(6, dt)); }
  pushOutColliders(fl.pos, d.kind === 'dragon' ? 7 : 4);
  if (fl.pos.y > 1100) { fl.pos.y = 1100; fl.pitch = Math.min(fl.pitch, 0); }
  const r = Math.hypot(fl.pos.x, fl.pos.z); if (r > 1900) { fl.pos.x *= 1900 / r; fl.pos.z *= 1900 / r; fl.yaw += dt * 1.5; }
}
function updateFly(dt) {
  const d = mountDef(), inv = save.invertY ? -1 : 1;
  const pitchIn = player.air ? 0 : input.ly * inv; // en l'air, le stick sert aux saltos
  if (!fl.loop && !fl.imm) {
    fl.pitch = clamp(fl.pitch + pitchIn * 1.35 * dt, -1.35, 1.25);
    if (Math.abs(pitchIn) < 0.05) fl.pitch *= 1 - damp(0.4, dt);
  }
  fl.roll = lerp(fl.roll, input.lx * 1.15, damp(3.2, dt));
  // figures de la monture
  const seated = !player.stand;
  if (seated && fl.barrel <= 0 && !fl.loop && !fl.imm) {
    if (input.pressed.l1 || input.pressed.r1) { fl.pend = { dir: input.pressed.r1 ? 1 : -1, t: 0.12, l: !!input.held.l1, r: !!input.held.r1 }; }
    if (fl.pend) {
      fl.pend.t -= dt; fl.pend.l ||= !!input.held.l1; fl.pend.r ||= !!input.held.r1;
      if (fl.pend.l && fl.pend.r) { fl.imm = 0.0001; fl.immBase = fl.pitch; fl.immYaw = fl.yaw; fl.pend = null; }
      else if (fl.pend.t <= 0) { fl.barrel = 1; fl.barrelDir = fl.pend.dir; fl.pend = null; }
    }
  }
  if (fl.imm) { // Immelmann : on monte en demi-looping puis on se remet à l'endroit d'un demi-tonneau
    fl.imm += dt / 1.6; const t = Math.min(fl.imm, 1), up = Math.min(t / 0.6, 1);
    fl.pitch = fl.immBase + up * Math.PI; fl.speed = Math.max(fl.speed, d.min + 25);
    fl.extraRoll = t > 0.6 ? ((t - 0.6) / 0.4) * Math.PI : 0;
    if (fl.imm >= 1) { fl.imm = 0; fl.pitch = 0.1; fl.yaw = fl.immYaw + Math.PI; fl.extraRoll = 0; trick('Immelmann royal', 800); }
  }
  if (seated && d.kind !== 'dragon' && !fl.loop && fl.barrel <= 0 && input.pressed.square) { fl.loop = 0.0001; fl.loopBase = fl.pitch; }
  fl.breath = d.kind === 'dragon' && !!input.held.square;
  if (!fl.imm) fl.extraRoll = 0; let side = 0;
  if (fl.barrel > 0) {
    fl.barrel = Math.max(0, fl.barrel - dt / 0.6); const t = 1 - fl.barrel;
    fl.extraRoll = fl.barrelDir * t * Math.PI * 2; side = fl.barrelDir * Math.sin(t * Math.PI) * 26;
    if (fl.barrel === 0) trick('Tonneau', 150);
  }
  if (fl.loop) {
    fl.loop += dt / 1.7; fl.pitch = fl.loopBase + Math.min(fl.loop, 1) * Math.PI * 2; fl.speed = Math.max(fl.speed, d.min + 25);
    if (fl.loop >= 1) { fl.loop = 0; fl.pitch = fl.loopBase; trick('Looping', 400); }
  }
  flightStep(dt, d, { r2: input.r2, l2: input.l2 });
  if (side) fl.pos.add(tmpV.set(-Math.cos(fl.yaw), 0, Math.sin(fl.yaw)).multiplyScalar(side * dt));
  placeFlyer();
  player.pos.copy(fl.pos); player.yaw = fl.yaw; player.speed = fl.speed;
  // rase-mottes
  if (fl.pos.y - groundAt(fl.pos.x, fl.pos.z) < d.clear + 5 && fl.speed > 30) holdTrick('Rase-mottes', 180, dt);
  if (gameMode === 'race') checkRings(dt);
  // surf : se lever, sauter, figures
  if (!player.stand) {
    if (input.pressed.cross) { player.stand = true; playKnight('Idle', 0.2); updateHints(); }
  } else if (!player.air) {
    if (input.pressed.cross) { player.air = { oy: 0, vy: 8.5, flip: 0, spin: 0 }; playKnight('Jump_Full_Short', 0.1); }
    else if (input.pressed.triangle) { player.stand = false; playKnight('Sit_Chair_Idle', 0.2); updateHints(); }
  } else updateSurfAir(dt);
  if (input.pressed.circle) leapOff();
  if ((fl.cryT = (fl.cryT ?? 8) - dt) < 0) { fl.cryT = 14 + Math.random() * 18; if (d.kind === 'bird') sfx.eagle(0.45); else if (Math.random() < 0.4) sfx.dragonRoar(); }
  // battements d'ailes
  const flap = 0.35 + input.r2 * 1.4 + (fl.pitch > 0.2 ? 0.5 : 0) - (fl.pitch < -0.4 ? 0.3 : 0);
  curFlyer().flap(Math.max(0.12, flap) * (d.flapMul || 1), dt);
}
function updateSurfAir(dt) {
  const a = player.air;
  a.vy -= 20 * dt; a.oy += a.vy * dt;
  const inv = save.invertY ? -1 : 1;
  a.flip += -input.ly * inv * dt * (Math.PI * 2 / 0.75);
  if (input.held.l1) a.spin += dt * (Math.PI * 2 / 0.65); if (input.held.r1) a.spin -= dt * (Math.PI * 2 / 0.65);
  if (a.oy <= 0 && a.vy < 0) {
    const nf = Math.round(a.flip / (Math.PI * 2)), ns = Math.round(a.spin / (Math.PI * 2));
    const okF = Math.abs(a.flip - nf * Math.PI * 2) < 0.75, okS = Math.abs(a.spin - ns * Math.PI * 2) < 0.75;
    player.air = null;
    if (okF && okS) {
      playKnight('Idle', 0.1);
      if (nf) trick(`${Math.abs(nf) > 1 ? Math.abs(nf) + '× ' : ''}${nf > 0 ? 'Salto avant' : 'Salto arrière'}`, 500 * Math.abs(nf));
      if (ns) trick(`Vrille ${Math.abs(ns) * 360}`, 300 * Math.abs(ns));
      if (!nf && !ns) trick('Ollie', 50);
    } else { bail('Chute !'); leapOff(true, a.flip, a.spin); }
  }
}
function leapOff(bailed = false, flip = 0, spin = 0) {
  flyerSeat(seatW, seatQ);
  player.pos.copy(seatW).add(tmpV.set(0, standHips.y, 0));
  player.vel.copy(fl.fwd).multiplyScalar(fl.speed).add(tmpV.set(0, bailed ? 2 : 6, 0));
  player.stand = false; player.air = null; player.trick = { kind: null, t: 0, flip, spin };
  fl.state = 'free'; fl.t = 0; fl.circleYaw = fl.yaw;
  setMode('fall');
  if (!bailed) trick('Saut de l’ange', 100);
}
function updateFall(dt) {
  const [camF, camR] = camBasis();
  const steer = camF.multiplyScalar(-input.ly).add(camR.multiplyScalar(input.lx));
  const v = player.vel;
  v.x += steer.x * 14 * dt; v.z += steer.z * 14 * dt; v.y -= 15.7 * dt;
  const sp = v.length(); v.multiplyScalar(1 - Math.min(0.5, 0.0052 * sp * dt));
  player.pos.addScaledVector(v, dt);
  pushOutColliders(player.pos, 0.6);
  // figures en chute libre
  const T = player.trick;
  if (!T.kind) {
    if (input.pressed.cross) Object.assign(T, { kind: 'Salto avant', t: 0, axis: 'flip', dir: 1, pts: 300 });
    else if (input.pressed.square) Object.assign(T, { kind: 'Salto arrière', t: 0, axis: 'flip', dir: -1, pts: 300 });
    else if (input.pressed.l1 || input.pressed.r1) Object.assign(T, { kind: 'Vrille', t: 0, axis: 'spin', dir: input.pressed.l1 ? 1 : -1, pts: 250 });
  } else {
    T.t += dt / 0.7; const k = Math.min(T.t, 1);
    if (T.axis === 'flip') T.cur = T.dir * k * Math.PI * 2; else T.cur = T.dir * k * Math.PI * 2;
    if (T.t >= 1) { T.flip += T.axis === 'flip' ? T.dir * Math.PI * 2 : 0; T.spin += T.axis === 'spin' ? T.dir * Math.PI * 2 : 0; trick(T.kind, T.pts); T.kind = null; T.cur = 0; }
  }
  if (Math.abs(v.x) + Math.abs(v.z) > 1) player.yaw += angDiff(player.yaw, Math.atan2(v.x, v.z)) * damp(2, dt);
  if (input.pressed.triangle) { if (fl.state === 'free' || fl.state === 'catch') { fl.state = 'catch'; sfxCall(); } else { summonFlyer(); fl.state = 'catch'; } }
  // sol
  const g = terrainAt(player.pos.x, player.pos.z);
  if (player.pos.y - standHips.y <= Math.max(g, 0)) {
    if (g < -0.6) { // dans l'eau : la monture te repêche
      player.pos.y = 0.6 + standHips.y; fl.state = 'catch'; fl.pos.set(player.pos.x - Math.sin(player.yaw) * 40, 25, player.pos.z - Math.cos(player.yaw) * 40); flyer().visible = true;
      catchRider(true); return;
    }
    if (T.kind) bail('Atterrissage raté');
    const hard = v.y < -28;
    player.pos.y = g; player.vy = 0; player.onGround = true; player.speed = Math.min(6, Math.hypot(v.x, v.z));
    setMode('foot'); sfxThud(); cam.shake = hard ? 0.6 : 0.25;
    if (hard) toast('💥 Réception brutale !', 1500); else trick('Réception', 100);
    if (fl.state === 'catch' || fl.state === 'free') { fl.state = 'leave'; fl.t = 0; }
  }
}
function catchRider(rescue = false) {
  const d = mountDef();
  fl.speed = Math.max(d.min + 10, Math.hypot(player.vel.x, player.vel.z));
  if (rescue) { fl.pos.copy(player.pos); fl.pos.y = Math.max(fl.pos.y, groundAt(fl.pos.x, fl.pos.z) + d.clear + 2); fl.pitch = 0.45; toast(`${d.icon} Repêché !`, 1400); }
  setMode('fly');
  if (!rescue) trick('Récupération', 1000);
}
function flyerAI(dt) { // monture sans cavalier : tourne autour, vient te cueillir, ou s'en va
  const d = mountDef(); if (fl.state === 'hidden' || fl.state === 'ridden' || fl.state === 'summon') return;
  fl.t += dt;
  let target, want;
  if (fl.state === 'free') {
    fl.circleYaw = (fl.circleYaw || 0) + dt * 0.35;
    target = tmpV2.copy(player.pos).add(tmpV.set(Math.cos(fl.circleYaw) * 70, -25, Math.sin(fl.circleYaw) * 70));
    target.y = Math.max(target.y, groundAt(target.x, target.z) + 30); want = d.min * 2.2;
  } else if (fl.state === 'catch') {
    target = tmpV2.copy(player.pos).addScaledVector(player.vel, 0.15).sub(tmpV.set(0, standHips.y + (d.kind === 'dragon' ? 1.6 : 1.4), 0));
    want = Math.max(d.min * 2.5, player.vel.length() + 45);
  } else { target = tmpV2.copy(fl.pos).add(tmpV.set(Math.sin(fl.yaw) * 200, 120, Math.cos(fl.yaw) * 200)); want = d.max * 0.6; if (fl.t > 6 && fl.state === 'leave') { fl.state = 'hidden'; flyer().visible = false; return; } }
  const dx = target.x - fl.pos.x, dy = target.y - fl.pos.y, dz = target.z - fl.pos.z, horiz = Math.hypot(dx, dz);
  const dYaw = angDiff(fl.yaw, Math.atan2(dx, dz)), turn = clamp(dYaw * 2.2, -1.8, 1.8) * (fl.state === 'catch' ? 1.6 : d.turn);
  fl.yaw += turn * dt; fl.roll = lerp(fl.roll, -turn * 0.45, damp(3, dt));
  fl.pitch = lerp(fl.pitch, clamp(Math.atan2(dy, horiz), -1.1, 0.9), damp(fl.state === 'catch' ? 5 : 2.5, dt));
  fl.speed = lerp(fl.speed, want, damp(1.5, dt)); fl.extraRoll = 0;
  fl.fwd.set(Math.sin(fl.yaw) * Math.cos(fl.pitch), Math.sin(fl.pitch), Math.cos(fl.yaw) * Math.cos(fl.pitch));
  fl.pos.addScaledVector(fl.fwd, Math.min(fl.speed * dt, Math.hypot(dx, dy, dz) + 0.01));
  fl.pos.y = Math.max(fl.pos.y, groundAt(fl.pos.x, fl.pos.z) + d.clear);
  placeFlyer();
  curFlyer().flap((fl.pitch > 0.1 ? 1.4 : 0.6) * (d.flapMul || 1), dt);
  if (fl.state === 'catch' && player.mode === 'fall') {
    flyerSeat(seatW, seatQ);
    if (seatW.distanceTo(tmpV.copy(player.pos).sub(tmpV2.set(0, standHips.y, 0))) < 3.2) catchRider();
  }
}

// ---------------------------------------------------------------- placement du cavalier (après les animations)
const qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), qK = new THREE.Quaternion(), eA = new THREE.Euler();
function boneRot(bone, x, y, z) { // rotation exprimée dans le repère du chevalier
  if (!bone) return;
  knight.getWorldQuaternion(qK); bone.parent.getWorldQuaternion(qA); qA.premultiply(qK.invert()); // parent → repère chevalier
  qB.setFromEuler(eA.set(x, y, z, 'YXZ'));
  bone.quaternion.premultiply(qA.clone().invert().multiply(qB).multiply(qA));
  bone.updateMatrixWorld(true);
}
// IK des jambes : genoux et pieds à l'extérieur des flancs de la monture (demi-largeur hw, en mètres)
const ikA = new THREE.Vector3(), ikB = new THREE.Vector3(), ikT = new THREE.Vector3(), ikQ = new THREE.Quaternion(), ikP = new THREE.Quaternion();
function aimBone(bone, child, target) {
  bone.updateWorldMatrix(true, true);
  bone.getWorldPosition(ikA); child.getWorldPosition(ikB);
  const cur = ikB.sub(ikA).normalize(), want = ikT.copy(target).sub(ikA).normalize();
  ikQ.setFromUnitVectors(cur, want); bone.parent.getWorldQuaternion(ikP);
  bone.quaternion.premultiply(ikP.clone().invert().multiply(ikQ).multiply(ikP)); bone.updateWorldMatrix(false, true);
}
function legIK(thigh, shin, foot, side, hw) {
  const hip = thigh.getWorldPosition(new THREE.Vector3()), kneeP = shin.getWorldPosition(new THREE.Vector3()), footP = foot.getWorldPosition(new THREE.Vector3());
  const lT = hip.distanceTo(kneeP), lS = kneeP.distanceTo(footP);
  const kneeW = rider.localToWorld(new THREE.Vector3(side * (hw + 0.1), -0.32, 0.3));
  const knee = hip.clone().add(kneeW.sub(hip).normalize().multiplyScalar(lT));
  const footW = rider.localToWorld(new THREE.Vector3(side * (hw * 0.8 + 0.12), -1.0, 0.12));
  const ft = knee.clone().add(footW.sub(knee).normalize().multiplyScalar(lS));
  aimBone(thigh, shin, knee); aimBone(shin, foot, ft);
}
function seatedPose(hw, lean) {
  knight.updateMatrixWorld(true);
  boneRot(kb.spine, lean, 0, 0);
  boneRot(kb.uaL, -0.5, 0, 0.3); boneRot(kb.uaR, -0.5, 0, -0.3); // bras vers l'avant : il tient les rênes / le cou
  legIK(kb.ulL, kb.llL, kb.ftL, 1, hw); legIK(kb.ulR, kb.llR, kb.ftR, -1, hw);
}
function placeRider(dt) {
  if (!knight) return;
  const m = player.mode;
  if (fl.state === 'summon' && fl.path?.jumped) { // saut vers la monture
    const k = clamp(1 - (fl.path.T - fl.path.t) / 0.45, 0, 1);
    flyerSeat(seatW, seatQ);
    const start = fl.path.start || (fl.path.start = rider.position.clone());
    rider.position.lerpVectors(start, seatW, k * k).add(tmpV.set(0, Math.sin(k * Math.PI) * 2.2, 0));
    rider.quaternion.slerp(seatQ, damp(10, dt)); knight.position.set(0, 0, 0); return;
  }
  if (m === 'foot') {
    rider.position.copy(player.pos); rider.quaternion.setFromEuler(eA.set(player.flip > 0 ? -player.flip * Math.PI * 2 : 0, player.yaw, 0, 'YXZ'));
    knight.position.set(0, player.flip > 0 ? 0.6 * Math.sin(player.flip * Math.PI) : 0, 0); return;
  }
  if (m === 'horse') {
    horse.updateMatrixWorld(true); morphPoint(horseMesh, horseSeat, seatW).applyMatrix4(horseMesh.matrixWorld); horse.getWorldQuaternion(seatQ);
    rider.position.copy(seatW); rider.quaternion.copy(seatQ);
    knight.position.copy(sitHips).negate().add(tmpV.set(0, 0.12, 0.05)); playKnight('Sit_Chair_Idle', 0.15);
    seatedPose(horseHalfW, clamp(hs.speed / 22, 0, 1) * 0.3); return;
  }
  if (m === 'fly') {
    flyerSeat(seatW, seatQ); rider.position.copy(seatW);
    const d = mountDef();
    if (!player.stand) {
      rider.quaternion.copy(seatQ).multiply(qA.setFromEuler(eA.set(clamp(fl.speed / d.max, 0, 1) * 0.25, 0, -fl.roll * 0.15)));
      knight.position.copy(sitHips).negate().add(tmpV.set(0, 0.1, 0.05));
      playKnight('Sit_Chair_Idle', 0.15);
      seatedPose(curFlyer().hw, 0.25 + clamp(fl.speed / d.max, 0, 1) * 0.3);
    } else {
      const a = player.air; // debout en travers, comme sur une planche
      rider.quaternion.copy(seatQ).multiply(qA.setFromEuler(eA.set(0, -1.1 + (a ? a.spin : 0), 0)));
      if (!a) { knight.position.set(0, 0, 0); return; }
      rider.position.addScaledVector(tmpV.set(0, 1, 0).applyQuaternion(seatQ), a.oy + standHips.y);
      rider.quaternion.multiply(qB.setFromAxisAngle(tmpV.set(1, 0, 0), a.flip));
      knight.position.copy(standHips).negate();
    }
    return;
  }
  if (m === 'fall') {
    const T = player.trick, fallPitch = clamp(-player.vel.y / 30, 0, 1) * 1.2;
    rider.position.copy(player.pos);
    rider.quaternion.setFromEuler(eA.set(fallPitch + (T.axis === 'flip' && T.kind ? T.cur : 0), player.yaw + (T.axis === 'spin' && T.kind ? T.cur : 0), 0, 'YXZ'));
    knight.position.copy(standHips).negate();
    knight.updateMatrixWorld(true); boneRot(kb.uaL, 0, 0, 1.1); boneRot(kb.uaR, 0, 0, -1.1); // bras écartés
  }
}

// ---------------------------------------------------------------- course
function startRace() { race.on = true; race.next = 1; race.t = 0; toast('🏁 C’est parti ! Passe dans les anneaux dorés'); sfxRing(0); }
function endRace(finished) { race.on = false; race.next = 0; if (!finished) toast('Course abandonnée'); updateRings(); }
function finishRace() {
  const t = race.t; let medal, gain;
  if (t <= GOLD_T) { medal = '🥇'; gain = 100; } else if (t <= SILVER_T) { medal = '🥈'; gain = 50; } else { medal = '🥉'; gain = 25; }
  const rank = { '🥇': 3, '🥈': 2, '🥉': 1 };
  const record = !save.best || t < save.best;
  if (record) save.best = t;
  if (!save.medal || rank[medal] > rank[save.medal]) save.medal = medal;
  save.coins += gain;
  let extra = '';
  if (medal === '🥇' && !save.goldEagle) { save.goldEagle = true; extra = '<br>✨ Récompense : <b>l’Aigle d’Or</b> est débloqué (menu OPTIONS) !'; }
  persist(); updateHudStatic(); sfxFanfare(); celebrateT = 3;
  $('result').innerHTML = `<div class="big">${medal}</div><h2>${medal === '🥇' ? 'Médaille d’or !' : medal === '🥈' ? 'Médaille d’argent !' : 'Médaille de bronze'}</h2>
    <p>Temps : <b>${fmt(t)}</b>${record ? ' · <span class="rec">Nouveau record !</span>' : ''}</p>
    <p>+${gain} écus 🪙${extra}</p><p class="small">Or : ${fmt(GOLD_T)} · Argent : ${fmt(SILVER_T)}</p><p class="small">✕ pour continuer</p>`;
  $('result').classList.add('on');
  endRace(true);
}
function checkRings(dt) {
  if (race.on) race.t += dt;
  const r = rings[race.on ? race.next : 0];
  const a = tmpV.subVectors(prevPos, r.c).dot(r.n), b = new THREE.Vector3().subVectors(player.pos, r.c).dot(r.n);
  if ((a < 0) !== (b < 0)) {
    const hit = prevPos.clone().lerp(player.pos, a / (a - b));
    if (hit.distanceTo(r.c) < RING_R + 1.5) {
      if (!race.on) startRace();
      else { sfxRing(race.next); sfx.coin(); save.coins += 2; updateHudStatic(); r.mesh.scale.setScalar(1.5); if (race.next === rings.length - 1) finishRace(); else race.next++; }
      updateRings();
    }
  }
}
function updateRings() {
  const show = gameMode === 'race';
  rings.forEach((r, i) => {
    let col = 0x3aa0ff, op = 0.22, vis = show, ei = 0.5;
    if (!race.on) { if (i === 0) { col = 0x3dff6a; op = 0.95; ei = 1.6; } }
    else if (i < race.next) vis = false;
    else if (i === race.next) { col = i === rings.length - 1 ? 0xff5a3d : 0xffc21a; op = 1; ei = 1.8; }
    else if (i === race.next + 1) { col = 0xffffff; op = 0.55; ei = 0.6; }
    r.mesh.visible = vis; r.mat.emissive.set(col); r.mat.color.set(col); r.mat.opacity = op; r.mat.emissiveIntensity = ei;
  });
  startLabel.visible = show && !race.on;
}

// ---------------------------------------------------------------- caméra
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), camUp = new THREE.Vector3(0, 1, 0);
let firstCam = true;
const camX = () => input.rx * (save.camInvX ? -1 : 1), camY = () => input.ry * (save.camInvY ? -1 : 1);
function updateCamera(dt) {
  const want = new THREE.Vector3(), look = new THREE.Vector3(), wantUp = new THREE.Vector3(0, 1, 0);
  let fov = 65, k = 8;
  const m = player.mode;
  if (m === 'foot' || m === 'fall') {
    cam.yaw += camX() * dt * 2.6; cam.pitch = clamp(cam.pitch + camY() * dt * 1.8, -0.3, 1.2);
    let dist = 5.2;
    if (m === 'fall') { dist = 9; if (Math.abs(input.rx) < 0.1) cam.yaw += angDiff(cam.yaw, player.yaw + Math.PI) * damp(1.2, dt); fov = 72 + clamp(player.vel.length() - 30, 0, 40) * 0.3; }
    look.copy(m === 'fall' ? player.pos : tmpV.copy(player.pos).add(tmpV2.set(Math.cos(cam.yaw) * 0.75, 1.75, -Math.sin(cam.yaw) * 0.75)));
    want.set(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)).multiplyScalar(dist).add(look);
    k = m === 'fall' ? 7 : 12;
    if (fight?.active) { fight.camera(want, look); k = 6; cam.yaw = Math.atan2(want.x - player.pos.x, want.z - player.pos.z); }
  } else if (m === 'horse') {
    cam.orbitX = lerp(cam.orbitX, -camX() * 2.4, damp(4, dt)); cam.orbitY = lerp(cam.orbitY, camY() * 0.6, damp(4, dt));
    const y = hs.yaw + Math.PI + cam.orbitX, p = 0.26 + cam.orbitY;
    look.copy(horse.position).add(tmpV.set(0, 2.5, 0));
    want.set(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)).multiplyScalar(7.5 + Math.abs(hs.speed) * 0.1).add(look);
    fov = 65 + Math.abs(hs.speed) * 0.4; k = 6; cam.yaw = y;
  } else {
    const d = mountDef();
    cam.orbitX = lerp(cam.orbitX, -camX() * 2.6, damp(4, dt)); cam.orbitY = lerp(cam.orbitY, 0, damp(4, dt));
    cam.zoom = clamp((cam.zoom ?? 1) + camY() * dt * 1.1, 0.28, 2.4);
    const trickPull = fl.loop || fl.imm || fl.barrel > 0 ? 1.25 : 1;
    const dist = (d.cam + fl.speed * 0.045 + (player.stand ? 3 : 0)) * cam.zoom * trickPull;
    // derrière la monture, dans son repère (suit les loopings), sans le tonneau
    tmpQ.setFromEuler(tmpE.set(-fl.pitch, fl.yaw, 0, 'YXZ'));
    want.set(0, 0, -dist).applyAxisAngle(upV, cam.orbitX).add(tmpV.set(0, dist * 0.2 + cam.orbitY * dist * 0.6, 0)).applyQuaternion(tmpQ).add(fl.pos);
    look.copy(fl.pos).addScaledVector(fl.fwd, 14).add(tmpV.set(0, 2.6, 0).applyQuaternion(tmpQ));
    wantUp.set(0, 1, 0).applyQuaternion(tmpQ).add(tmpV.set(-Math.cos(fl.yaw) * Math.sin(fl.roll) * 0.35, 0, Math.sin(fl.yaw) * Math.sin(fl.roll) * 0.35)).normalize();
    fov = 68 + clamp((fl.speed - 40) * 0.22, 0, 30); k = fl.loop ? 9 : 5;
    cam.yaw = fl.yaw + Math.PI + cam.orbitX;
  }
  if (firstCam) { camPos.copy(want); camLook.copy(look); firstCam = false; }
  camPos.lerp(want, damp(k, dt)); camLook.lerp(look, damp(k * 1.6, dt)); camUp.lerp(wantUp, damp(4, dt));
  const gy = groundAt(camPos.x, camPos.z) + 1.2; if (camPos.y < gy) camPos.y = gy;
  camera.position.copy(camPos);
  if (save.reduceFx) cam.shake = 0;
  if (cam.shake > 0) { cam.shake -= dt; camera.position.add(tmpV.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(cam.shake * 0.8)); }
  camera.up.copy(camUp); camera.lookAt(camLook);
  if (window.__dbgCam) { const c = window.__dbgCam, t = c.target(); camera.position.copy(t).add(c.off); camera.up.set(0, 1, 0); camera.lookAt(t); }
  camera.fov = lerp(camera.fov, fov, damp(3, dt)); camera.updateProjectionMatrix();
}

// lignes de vitesse
const STREAKS = 160;
const streakGeo = new THREE.BufferGeometry(); streakGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(STREAKS * 6), 3));
const streakData = Array.from({ length: STREAKS }, () => ({ x: 0, y: 0, z: -Math.random() * 80 }));
function resetStreak(s) { const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 16; s.x = Math.cos(a) * r; s.y = Math.sin(a) * r * 0.7; s.z = -60 - Math.random() * 30; }
streakData.forEach(resetStreak);
const streaks = new THREE.LineSegments(streakGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
streaks.frustumCulled = false; camera.add(streaks);
function updateStreaks(dt) {
  const v = player.mode === 'fly' ? fl.speed : player.mode === 'fall' ? player.vel.length() * 1.4 : 0, o = clamp((v - 65) / 70, 0, 0.5);
  streaks.material.opacity = o; streaks.visible = o > 0.01; if (!streaks.visible) return;
  const arr = streakGeo.attributes.position.array, len = v * 0.05;
  streakData.forEach((s, i) => { s.z += v * dt * 1.4; if (s.z > 2) resetStreak(s); arr.set([s.x, s.y, s.z, s.x, s.y, s.z - len], i * 6); });
  streakGeo.attributes.position.needsUpdate = true;
}

// ---------------------------------------------------------------- menus
function cycleMount(dir) {
  let i = MOUNT_IDS.indexOf(save.mount);
  for (let n = 0; n < MOUNT_IDS.length; n++) { i = (i + dir + MOUNT_IDS.length) % MOUNT_IDS.length; if (!MOUNTS[MOUNT_IDS[i]].locked?.()) break; }
  save.mount = MOUNT_IDS[i]; persist();
  if (fl.state !== 'hidden') { const now = mountDef().kind; flyer().visible = true; }
  applyMount(); updateHudStatic(); updateHints(); if (player.mode === 'fly') $('mode').textContent = MODE_LABEL();
}
function setGameMode(m) { gameMode = m; if (race.on) endRace(false); updateRings(); updateHudStatic(); }
// à pied : taverne au village, hiver dans les terres gelées, sinon thème d'exploration
function footTrack() {
  if (Math.hypot(player.pos.x - VILLAGE.x, player.pos.z - VILLAGE.z) < 140) return 'village';
  return seasonAt(player.pos.x, player.pos.z).winter > 0.5 ? 'winter' : 'explore';
}
function setPause(p) { paused = p; menuSel2 = 0; $('pause').classList.toggle('on', p); if (p) renderMenu(); }
let menuSel2 = 0;
const onOff = (b) => (b ? 'Oui' : 'Non');
const MENU = [
  { label: 'Reprendre', act: () => setPause(false) },
  { label: 'Monture volante', val: () => `${mountDef().icon} ${mountDef().name}`, change: (d) => cycleMount(d) },
  { label: 'Mode de jeu', val: () => (gameMode === 'race' ? 'Course d’anneaux' : 'Exploration libre'), change: () => setGameMode(gameMode === 'race' ? 'free' : 'race') },
  { label: 'Musique', val: () => `${Math.round(save.musicVol * 100)} %`, change: (dd) => { save.musicVol = clamp(Math.round((save.musicVol + dd * 0.1) * 10) / 10, 0, 1); } },
  { label: 'Qualité graphique', val: () => (save.quality === 'high' ? 'Haute' : 'Équilibrée'), change: () => { save.quality = save.quality === 'high' ? 'medium' : 'high'; applyQuality(); } },
  { label: 'Taille de l’interface', val: () => `${Math.round(save.ui * 100)} %`, change: (d) => { save.ui = clamp(Math.round((save.ui + d * 0.25) * 4) / 4, 0.75, 1.75); applyUi(); } },
  { label: 'Caméra : axe horizontal', val: () => (save.camInvX ? 'Inversé' : 'Normal'), change: () => { save.camInvX = !save.camInvX; } },
  { label: 'Caméra : axe vertical', val: () => (save.camInvY ? 'Inversé' : 'Normal'), change: () => { save.camInvY = !save.camInvY; } },
  { label: 'Vol : piquer / monter', val: () => (save.invertY ? 'Inversé' : 'Avion'), change: () => { save.invertY = !save.invertY; } },
  { label: 'Secousses et flashs', val: () => (save.reduceFx ? 'Réduits' : 'Activés'), change: () => { save.reduceFx = !save.reduceFx; applyUi(); } },
  { label: 'Abandonner la course', show: () => race.on, act: () => { endRace(false); setPause(false); } },
];
function renderMenu() {
  const items = MENU.filter((m) => !m.show || m.show());
  menuSel2 = clamp(menuSel2, 0, items.length - 1);
  $('menu').innerHTML = items.map((m, i) => `<div class="mrow${i === menuSel2 ? ' sel' : ''}" role="menuitem" data-i="${i}"><span class="lb">${m.label}</span>${m.val ? `<span class="vl"><span class="ar">◀</span>${m.val()}<span class="ar">▶</span></span>` : ''}</div>`).join('');
  $('menu').querySelectorAll('.mrow').forEach((el) => el.addEventListener('click', (e) => {
    const i = +el.dataset.i, m = items[i]; menuSel2 = i;
    if (m.change) { const r = el.getBoundingClientRect(); m.change(e.clientX < r.left + r.width * 0.55 && e.clientX > r.left + r.width * 0.4 ? -1 : 1); persist(); } else m.act?.();
    if (paused) renderMenu();
  }));
}
function applyUi() { document.documentElement.style.setProperty('--ui', save.ui); document.body.classList.toggle('reduce', save.reduceFx); }
function pauseMenu() {
  const items = MENU.filter((m) => !m.show || m.show());
  if (input.pressed.options || input.pressed.circle) { setPause(false); return; }
  const nav = (input.pressed.down || (input.ly > 0.6 && !pauseMenu.held)) ? 1 : (input.pressed.up || (input.ly < -0.6 && !pauseMenu.held)) ? -1 : 0;
  pauseMenu.held = Math.abs(input.ly) > 0.6;
  if (nav) { menuSel2 = (menuSel2 + nav + items.length) % items.length; sfx.tick(); renderMenu(); }
  const m = items[menuSel2];
  const ch = input.pressed.left ? -1 : input.pressed.right ? 1 : 0;
  if (ch && m.change) { m.change(ch); persist(); sfx.select(); renderMenu(); }
  if (input.pressed.cross) { if (m.change) m.change(1); else m.act?.(); persist(); if (paused) renderMenu(); }
}
function startMenu() {
  if (input.pressed.left || input.pressed.up || input.lx < -0.6) menuSel = 0; if (input.pressed.right || input.pressed.down || input.lx > 0.6) menuSel = 1;
  document.querySelectorAll('.choice').forEach((c, i) => c.classList.toggle('sel', i === menuSel));
  if (input.pressed.cross || input.pressed.options) begin(menuSel === 0 ? 'free' : 'race');
  $('padstate').textContent = padName ? '🎮 Manette détectée — prête à jouer' : '🎮 Branche la manette et appuie sur une touche, ou joue au clavier';
}

// ---------------------------------------------------------------- boucle
const clock = new THREE.Clock();
let elapsed = 0;
function frame() {
  requestAnimationFrame(frame);
  const rdt = Math.min(clock.getDelta(), 0.05); readInput();
  const dt = rdt * (fight && started && !paused ? fight.timeScale(rdt) : 1); elapsed += dt;
  if (!started) startMenu();
  else if ($('result').classList.contains('on')) { if (input.pressed.cross || input.pressed.circle) $('result').classList.remove('on'); }
  else if (paused) pauseMenu();
  else {
    if (input.pressed.options) setPause(true);
    if (input.pressed.share) { save.invertY = !save.invertY; persist(); updateHudStatic(); toast(`Axe vertical en vol : ${save.invertY ? 'inversé' : 'normal'}`); }
    if (knight) {
      if (fight.active) { /* le combat pilote le joueur */ } else if (player.mode === 'foot') updateFoot(dt); else if (player.mode === 'horse') updateHorse(dt); else if (player.mode === 'fly') updateFly(dt); else updateFall(dt);
      updateHorseBody(dt, player.mode === 'horse');
      if (fl.state === 'summon') updateSummon(dt); else flyerAI(dt);
      if (player.mode === 'horse') player.pos.copy(horse.position);
      updateCombo(dt);
      fight.update(dt, input);
    }
  }
  if (celebrateT > 0) celebrateT -= dt;
  const mdt = paused ? 0 : dt;
  for (const mx of mixers) mx.update(mdt);
  if (knight && !paused && started) placeRider(dt);
  for (const f of animated) f(mdt, elapsed);
  if (knight && !paused) {
    const breathing = player.mode === 'fly' && fl.breath, cf = curFlyer();
    if (breathing) { cf.mouth.getWorldPosition(tmpV2); tmpV.copy(fl.fwd).addScaledVector(upV, -0.22).normalize(); fire.update(mdt, true, tmpV2.addScaledVector(fl.fwd, 2.5), tmpV, fl.fwd.clone().multiplyScalar(fl.speed)); if ((fl.fireSfx = (fl.fireSfx || 0) - mdt) < 0) { fl.fireSfx = 0.3; sfx.fire(); } }
    else fire.update(mdt, false, null, tmpV.set(0, 0, 1), tmpV2.set(0, 0, 0));
    if (bots && started) bots.update(mdt, camera.position);
  }
  rings.forEach((r, i) => { r.mesh.scale.lerp(tmpV.setScalar(1 + (i === (race.on ? race.next : 0) ? Math.sin(elapsed * 4) * 0.05 : 0)), damp(6, dt)); });
  const tgt = rings[race.on ? race.next : 0].c;
  guide.visible = started && gameMode === 'race' && player.mode === 'fly' && player.pos.distanceTo(tgt) > 60;
  if (guide.visible) { guide.position.copy(player.pos).add(tmpV.set(0, 6, 0)); guide.lookAt(tgt); }
  if (started) updateCamera(dt);
  if (started) { music.setVolume(save.musicVol); music.play(fight?.active ? 'boss' : (player.mode === 'fly' || player.mode === 'fall' || fl.state === 'summon') ? (mountDef().kind === 'dragon' ? 'dragon' : 'eagle') : player.mode === 'horse' ? 'horse' : footTrack()); }
  music.update(rdt);
  updateStreaks(dt);
  grass.update(camera.position);
  // ombres : boîte serrée à pied (nettes), large en vol
  const focus = player.mode === 'fly' ? fl.pos : player.pos;
  shadowBox(player.mode === 'fly' ? 180 : 60);
  sunLight.position.copy(focus).addScaledVector(SUN, 500); sunLight.target.position.copy(focus);
  if (windGain) { const v = player.mode === 'fly' ? fl.speed : player.mode === 'fall' ? player.vel.length() * 1.3 : Math.abs(player.speed) * 0.5; windGain.gain.value = lerp(windGain.gain.value, clamp(v / 140, 0.02, 0.9) * 0.5, 0.05); windFilter.frequency.value = 250 + v * 12; }
  if (started) {
    $('race').style.display = race.on ? 'block' : 'none';
    if (race.on) { $('rtime').textContent = fmt(race.t); $('rcount').textContent = `${race.next}/${rings.length - 1}`; $('rdist').textContent = `${Math.round(player.pos.distanceTo(tgt))} m`; }
    const flying = player.mode === 'fly' || player.mode === 'fall';
    $('flight').style.display = flying ? 'block' : 'none';
    if (flying) { const v = player.mode === 'fly' ? fl.speed : player.vel.length(); $('spd').textContent = Math.round(v * 3.6); $('alt').textContent = Math.round(player.pos.y - groundAt(player.pos.x, player.pos.z)); }
  }
  if (save.quality === 'high') composer.render(dt); else renderer.render(scene, camera);
}
function begin(mode) {
  if (!knight || started) return;
  started = true; initAudio(); music.start(); $('start').classList.add('off'); document.body.classList.add('playing'); setGameMode(mode); setMode('foot');
  horse.position.set(player.pos.x + 4, groundAt(player.pos.x + 4, player.pos.z - 3), player.pos.z - 3);
  setTimeout(() => toast(mode === 'race' ? 'Appelle ta monture (<b>△</b>) et passe dans l’anneau <span style="color:#7dff8a">DÉPART</span>' : 'Monde libre : <b>△</b> monture volante · <b>□</b> cheval · <b>OPTIONS</b> choisir sa monture', 4500), 800);
}
document.querySelectorAll('.choice').forEach((c, i) => c.addEventListener('click', (e) => { e.stopPropagation(); menuSel = i; begin(i === 0 ? 'free' : 'race'); }));
$('fs').addEventListener('click', (e) => { e.stopPropagation(); toggleFullscreen(); });
window.__aeriea = { get fight() { return fight; }, get knightActions() { return knightActions; }, playKnight, player, fl, race, setMode, begin, summonFlyer, cycleMount, camera, cam, save, get started() { return started; }, get knight() { return knight; } };

applyQuality(); applyUi(); updateRings(); updateHudStatic(); updateHints();
$('targets').textContent = `Or ≤ ${fmt(GOLD_T)} · Argent ≤ ${fmt(SILVER_T)}`;
loadModels().then(() => {
  $('loading').textContent = '';
  horse.position.set(player.pos.x + 4, groundAt(player.pos.x + 4, player.pos.z - 3), player.pos.z - 3); horse.rotation.y = hs.yaw;
  rider.position.copy(player.pos); playKnight('Idle'); frame0();
}).catch((e) => { $('loading').textContent = 'Erreur de chargement : ' + e.message; console.error(e); });
// vue d'intro : caméra qui tourne autour du château
function frame0() {
  const intro = () => { if (started) return; const t = performance.now() / 1000 * 0.05; camera.position.set(CASTLE.x + Math.cos(t) * 240, CASTLE.h + 80, CASTLE.z + Math.sin(t) * 240); camera.lookAt(CASTLE.x, CASTLE.h + 15, CASTLE.z); requestAnimationFrame(intro); };
  intro();
}
frame();
