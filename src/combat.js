// Combat de boss façon Sifu : le Roi en armure, dans la cour du château.
// Verrouillage de cible, garde automatique, parade, esquive, jauge de posture, coup de grâce.
import * as THREE from 'three';
import { rigBones, faceForward, retargetClips, boneKey } from './retarget.js';
import { makeSword, gripLike } from './props.js';
import { clamp, lerp, damp, angDiff } from './util.js';

function findBone(root, ...names) { const want = names.map(boneKey); let r = null; root.traverse((o) => { if (!r && o.isBone && want.includes(boneKey(o.name))) r = o; }); return r; }
const TAU = Math.PI * 2;

// attaques du roi : clip, dégâts, moment(s) d'impact (fraction du clip), portée, demi-angle, imparable (rouge), fente
const KING_ATTACKS = {
  slice: { clip: '2H_Melee_Attack_Slice', dmg: 18, hits: [0.42], range: 3.6, arc: 1.3 },
  chop: { clip: '2H_Melee_Attack_Chop', dmg: 26, hits: [0.5], range: 3.4, arc: 0.8, red: true },
  spin: { clip: '2H_Melee_Attack_Spin', dmg: 16, hits: [0.3, 0.6], range: 3.8, arc: Math.PI },
  stab: { clip: '2H_Melee_Attack_Stab', dmg: 20, hits: [0.45], range: 4.6, arc: 0.6, lunge: 4 },
};
const COMBOS = [['slice'], ['stab'], ['slice', 'slice'], ['chop'], ['slice', 'spin'], ['stab', 'chop'], ['slice', 'slice', 'chop'], ['spin']];
// attaques du joueur
const LIGHT = [
  { clip: '1H_Melee_Attack_Slice_Diagonal', dmg: 10, post: 9, hit: 0.38 },
  { clip: '1H_Melee_Attack_Slice_Horizontal', dmg: 10, post: 9, hit: 0.38 },
  { clip: '1H_Melee_Attack_Chop', dmg: 16, post: 15, hit: 0.45 },
];
const HEAVY = { clip: '1H_Melee_Attack_Stab', dmg: 22, post: 24, hit: 0.5 };
const ONCE = ['1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Slice_Horizontal', '1H_Melee_Attack_Chop', '1H_Melee_Attack_Stab', '2H_Melee_Attack_Slice', '2H_Melee_Attack_Chop', '2H_Melee_Attack_Spin', '2H_Melee_Attack_Stab',
  'Block_Hit', 'Dodge_Backward', 'Dodge_Forward', 'Dodge_Left', 'Dodge_Right', 'Hit_A', 'Hit_B', 'Death_A', 'Death_B', 'Cheer'];

export function createBossFight(env) {
  const { scene, kingGltf, animSource, normalize, knight, knightActions, playKnight, player, groundAt, toast, tone, cam, $, save, persist, onReward, arena, knightScale } = env;
  for (const n of ONCE) { const a = knightActions[n]; if (a) { a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; } }
  const swordMeshes = env.swords;

  // ------------------------------------------------ décor : estrade + trône
  const throne = new THREE.Group(); throne.position.set(arena.x, arena.y, arena.z - 10); scene.add(throne);
  const stoneM = env.mats.stoneDark, goldM = env.mats.gold, redM = new THREE.MeshStandardMaterial({ color: 0x8c1420, roughness: 0.9 });
  const add = (m, x, y, z) => { m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; throne.add(m); return m; };
  add(new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5, 0.6, 24), stoneM), 0, 0.3, 0);
  add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 1.8), goldM), 0, 0.85, -1.6);
  add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.2, 0.3), goldM), 0, 2.4, -2.45);
  add(new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.5, 0.08), redM), 0, 2.3, -2.28);
  for (const s of [-1, 1]) add(new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.8, 6), goldM), s * 0.95, 4.3, -2.45);
  // tapis rouge jusqu'à la porte
  const carpet = add(new THREE.Mesh(new THREE.PlaneGeometry(3, 34), redM), 0, 0.03, 17); carpet.rotation.x = -Math.PI / 2;

  // ------------------------------------------------ le Roi en armure (modèle Sketchfab « Armored King », squelette Biped)
  const km = kingGltf.scene;
  km.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; o.material = o.material.clone(); o.material.emissive = new THREE.Color(0); o.userData.flash = true; } });
  const kbones = rigBones(km, 'biped'); faceForward(km, kbones);
  const kbox = normalize(km, 2.15, 'y'); km.position.y -= kbox.min.y;
  const king = new THREE.Group(); king.add(km);
  const kingRoot = new THREE.Group(); kingRoot.add(king); scene.add(kingRoot);
  // ses propres animations (garde, marche, course) + les attaques du chevalier transposées sur son squelette
  const native = { FIGHTIDLE_Root: '2H_Melee_Idle', WALK_player_Root: 'Walking_A', run_player_Root: 'Running_A' };
  const kClips = retargetClips(animSource, { root: king, bones: kbones }, animSource.clips.filter((c) => !Object.values(native).includes(c.name)));
  for (const c of kingGltf.animations) if (native[c.name]) { const cc = c.clone(); cc.name = native[c.name]; cc.tracks = cc.tracks.filter((t) => !t.name.endsWith('.position')); kClips.push(cc); }
  const kMixer = new THREE.AnimationMixer(king), kAct = {};
  for (const c of kClips) kAct[c.name] = kMixer.clipAction(c);
  for (const n of ONCE) if (kAct[n]) { kAct[n].setLoop(THREE.LoopOnce); kAct[n].clampWhenFinished = true; }
  let kCur = null;
  const playK = (n, fade = 0.2, ts = 1) => { const a = kAct[n]; if (!a) return; if (a === kCur) { a.timeScale = ts; return; } a.reset().play(); a.timeScale = ts; if (kCur) a.crossFadeFrom(kCur, fade, false); kCur = a; };
  // espadon dans la main droite
  let kFinger = null; km.traverse((o) => { if (!kFinger && o.isBone && boneKey(o.name) === 'rfinger') kFinger = o; });
  gripLike(animSource.root.getObjectByName('2H_Sword'), kbones.handR, kFinger || kbones.handR.children[0], makeSword(1.3, 0.075));

  // ------------------------------------------------ état
  const HOME = new THREE.Vector3(arena.x, arena.y + 0.6, arena.z - 9.6);
  const K = { pos: HOME.clone(), yaw: 0, hp: 300, maxHp: 300, post: 0, state: 'dormant', t: 0, combo: [], ci: 0, atk: null, hitsDone: 0, hurtT: 0, lastHit: 0, flashT: 0, flashCol: new THREE.Color(), hitStreak: 0 };
  const P = { hp: 100, armor: 0, post: 0, state: 'free', t: 0, combo: 0, atk: null, queued: null, parryT: -9, dodgeDir: new THREE.Vector3(), lastHit: 0, sword: true };
  const F = { active: false, hitStop: 0, slow: 0, deadT: 0, wonT: 0 };
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  kingRoot.position.copy(K.pos); playK('2H_Melee_Idle');

  // ------------------------------------------------ étincelles
  const SPARKS = 60, sparkGeo = new THREE.BufferGeometry(), sparkPos = new Float32Array(SPARKS * 3), sparkVel = [], sparkLife = new Float32Array(SPARKS);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  for (let i = 0; i < SPARKS; i++) sparkVel.push(new THREE.Vector3());
  const sparkMat = new THREE.PointsMaterial({ color: 0xffd27a, size: 0.12, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const sparks = new THREE.Points(sparkGeo, sparkMat); sparks.frustumCulled = false; scene.add(sparks);
  let sparkI = 0;
  function burst(at, n, color) {
    sparkMat.color.set(color);
    for (let k = 0; k < n; k++) { const i = sparkI++ % SPARKS; sparkPos.set([at.x, at.y, at.z], i * 3); sparkVel[i].set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(4 + Math.random() * 6); sparkLife[i] = 0.35 + Math.random() * 0.3; }
  }
  function updateSparks(dt) {
    for (let i = 0; i < SPARKS; i++) { if (sparkLife[i] <= 0) { sparkPos[i * 3 + 1] = -1e4; continue; } sparkLife[i] -= dt; sparkVel[i].y -= 18 * dt; sparkPos[i * 3] += sparkVel[i].x * dt; sparkPos[i * 3 + 1] += sparkVel[i].y * dt; sparkPos[i * 3 + 2] += sparkVel[i].z * dt; }
    sparkGeo.attributes.position.needsUpdate = true;
  }

  // ------------------------------------------------ sons
  const sfx = env.sfx;
  const sClang = () => sfx.clang(), sParry = () => sfx.parry(), sHit = () => sfx.hit(), sWhoosh = () => sfx.whoosh(1), sWarn = (red) => sfx.warn(red);

  // ------------------------------------------------ HUD
  function hud() {
    $('boss').classList.toggle('on', F.active); document.body.classList.toggle('fight', F.active);
    $('pbars').classList.toggle('on', F.active);
    if (!F.active) return;
    $('bossHp').style.width = `${K.hp / K.maxHp * 100}%`;
    $('bossTrail').style.width = `${K.hp / K.maxHp * 100}%`; $('pTrail').style.width = `${P.hp}%`;
    $('bossPost').style.width = `${K.post}%`;
    $('pHp').style.width = `${P.hp}%`; $('pArmor').style.width = `${P.armor / 60 * 100}%`; $('pPost').style.width = `${P.post}%`;
    $('finisher').classList.toggle('on', K.state === 'stagger' && P.state !== 'finisher');
  }

  // ------------------------------------------------ géométrie de combat
  const kingFwd = () => tmp.set(Math.sin(K.yaw), 0, Math.cos(K.yaw));
  const toPlayer = () => tmp2.subVectors(player.pos, K.pos).setY(0);
  const dist = () => Math.hypot(player.pos.x - K.pos.x, player.pos.z - K.pos.z);
  function inArc(fromPos, fromYaw, target, range, arc) {
    const dx = target.x - fromPos.x, dz = target.z - fromPos.z, d = Math.hypot(dx, dz);
    return d < range && Math.abs(angDiff(fromYaw, Math.atan2(dx, dz))) < arc;
  }
  const facingKing = () => Math.abs(angDiff(player.yaw, Math.atan2(K.pos.x - player.pos.x, K.pos.z - player.pos.z))) < 1.2;

  // ------------------------------------------------ dégâts sur le joueur
  function hitPlayer(a) {
    if (P.state === 'dead' || P.state === 'finisher') return;
    const at = tmp.copy(player.pos).add(new THREE.Vector3(0, 1.3, 0));
    if (P.state === 'dodge' && P.t > 0.04 && P.t < 0.38) { // esquive parfaite
      K.post = Math.min(100, K.post + 12); toast('💨 Esquive parfaite', 700); F.slow = 0.25; return;
    }
    const now = performance.now() / 1000;
    if (!a.red && now - P.parryT < 0.24 && facingKing()) { // parade parfaite
      K.post = Math.min(100, K.post + 26); burst(at, 26, 0xfff1b0); sParry(); F.hitStop = 0.09; F.slow = 0.2; playKnight('Block_Hit', 0.05); P.state = 'block'; P.t = 0;
      toast('✨ Parade !', 600); checkKingBreak(); return;
    }
    const guarding = !a.red && facingKing() && (P.state === 'free' || P.state === 'block');
    if (guarding) { // garde : pas de PV perdus mais la posture monte
      P.post += a.dmg * 1.5; burst(at, 12, 0xffd27a); sClang(); F.hitStop = 0.05; cam.shake = 0.15;
      playKnight('Block_Hit', 0.05); P.state = 'block'; P.t = 0;
      if (P.post >= 100) { P.post = 60; P.state = 'broken'; P.t = 0; playKnight('Hit_B', 0.05); toast('Garde brisée !', 900); damage(a.dmg * 0.5); }
      return;
    }
    damage(a.dmg); burst(at, 18, 0xff5040); sHit(); F.hitStop = 0.08; cam.shake = 0.35;
    if (P.hp > 0) { P.state = 'hit'; P.t = 0; P.atk = null; playKnight('Hit_A', 0.05); }
  }
  function damage(d) {
    P.lastHit = performance.now() / 1000;
    if (P.armor > 0) { const ab = Math.min(P.armor, d * 0.6); P.armor -= ab; d -= ab; }
    P.hp = Math.max(0, P.hp - d);
    if (P.hp <= 0) { P.state = 'dead'; P.t = 0; playKnight('Death_A', 0.1); F.deadT = 3.2; toast('☠️ Vaincu… le roi garde son trône', 2800); }
  }
  // ------------------------------------------------ dégâts sur le roi
  function checkKingBreak() {
    if (K.post >= 100 && K.state !== 'stagger' && K.state !== 'dead') { K.state = 'stagger'; K.t = 0; K.post = 100; playK('Hit_B', 0.1, 0.5); toast('💥 Posture brisée ! <b>◯</b> coup de grâce', 1600); sfx.heavyHit(); }
  }
  function hitKing(atk) {
    const at = tmp.copy(K.pos).add(new THREE.Vector3(0, 1.8, 0));
    K.lastHit = performance.now() / 1000; K.hitStreak++;
    // le roi pare parfois de face s'il n'attaque pas
    const front = Math.abs(angDiff(K.yaw, Math.atan2(player.pos.x - K.pos.x, player.pos.z - K.pos.z))) < 1.1;
    if (front && (K.state === 'circle' || K.state === 'recover' || K.state === 'chase') && Math.random() < (K.hp < K.maxHp / 2 ? 0.5 : 0.35)) {
      K.post = Math.min(100, K.post + atk.post * 0.3); burst(at, 10, 0xffd27a); sClang(); F.hitStop = 0.04;
      playK('Block_Hit', 0.05); K.state = 'block'; K.t = 0;
      if (K.hitStreak >= 2) { K.hitStreak = 0; startCombo(['slice']); } // riposte
      return;
    }
    const mult = K.state === 'stagger' ? 1.5 : 1;
    K.hp = Math.max(0, K.hp - atk.dmg * mult); K.post = Math.min(100, K.post + atk.post);
    burst(at, 16, 0xff6a50); sHit(); F.hitStop = 0.06; cam.shake = 0.12; K.flashT = 0.12; K.flashCol.set(0xffffff);
    if (K.hp <= 0) return killKing();
    if (K.state === 'circle' || K.state === 'recover' || K.state === 'chase') { K.state = 'hurt'; K.t = 0; playK('Hit_A', 0.05); }
    checkKingBreak();
  }
  function killKing() {
    K.state = 'dead'; K.t = 0; playK('Death_A', 0.1); F.wonT = 4; F.slow = 0.8;
    toast('👑 Le Roi en armure est vaincu !<br>+300 écus', 3500); sfx.victory(); setTimeout(() => sfx.coin(), 1800);
    save.coins += 300; save.kingDefeated = (save.kingDefeated || 0) + 1; persist(); onReward();
  }

  // ------------------------------------------------ IA du roi
  function startCombo(list) { K.combo = list; K.ci = 0; startAttack(); }
  function startAttack() {
    const a = KING_ATTACKS[K.combo[K.ci]]; K.atk = a; K.state = 'windup'; K.t = 0; K.hitsDone = 0;
    K.flashCol.set(a.red ? 0xff1a00 : 0xffc040); K.flashT = 0.45; sWarn(a.red);
  }
  const phase2 = () => K.hp < K.maxHp * 0.5;
  function updateKing(dt) {
    K.t += dt;
    const d = dist(), want = Math.atan2(player.pos.x - K.pos.x, player.pos.z - K.pos.z);
    const speedUp = phase2() ? 1.25 : 1;
    if (K.state === 'dormant') {
      K.yaw += angDiff(K.yaw, 0) * damp(3, dt); playK('2H_Melee_Idle');
      if (player.mode === 'foot' && d < 20 && P.state !== 'dead') begin();
    } else if (K.state === 'intro') {
      K.yaw += angDiff(K.yaw, want) * damp(4, dt);
      if (K.t > 1.6) { K.state = 'chase'; K.t = 0; }
    } else if (P.state === 'dead' && F.active) { playK('2H_Melee_Idle', 0.3);
    } else if (K.state === 'chase' || K.state === 'circle') {
      K.yaw += angDiff(K.yaw, want) * damp(5, dt);
      if (K.state === 'chase') {
        const run = d > 7; playK(run ? 'Running_A' : 'Walking_A', 0.25, run ? 0.9 : 0.8);
        const sp = run ? 5.2 : 2.3; K.pos.addScaledVector(toPlayer().normalize(), Math.min(sp * dt, Math.max(0, d - 2.6)));
        if (d < 3.3) { K.state = 'circle'; K.t = 0; K.circleDir = Math.random() < 0.5 ? 1 : -1; K.circleT = (0.6 + Math.random() * 1.1) / speedUp; }
      } else {
        playK(K.circleDir > 0 ? 'Running_Strafe_Left' : 'Running_Strafe_Right', 0.25, 0.55);
        const side = tmp.set(Math.cos(K.yaw), 0, -Math.sin(K.yaw)).multiplyScalar(K.circleDir * 1.6 * dt); K.pos.add(side);
        if (d > 4.5) { K.state = 'chase'; K.t = 0; }
        else if (K.t > K.circleT) startCombo(COMBOS[Math.floor(Math.random() * (phase2() ? COMBOS.length : 6))]);
      }
    } else if (K.state === 'windup') {
      K.yaw += angDiff(K.yaw, want) * damp(8, dt); playK('2H_Melee_Idle', 0.15);
      if (K.t > (K.atk.red ? 0.55 : 0.35) / speedUp) { K.state = 'attack'; K.t = 0; playK(K.atk.clip, 0.08, 1.05 * speedUp); sWhoosh(); }
    } else if (K.state === 'attack') {
      const a = K.atk, dur = kAct[a.clip].getClip().duration / (1.05 * speedUp), f = K.t / dur;
      if (f < a.hits[0] - 0.12) K.yaw += angDiff(K.yaw, want) * damp(6, dt); // suit la cible jusqu'au dernier moment
      if (a.lunge && f > 0.2 && f < a.hits[0]) K.pos.addScaledVector(kingFwd(), a.lunge * dt / (dur * (a.hits[0] - 0.2)) * (d > 1.8 ? 1 : 0));
      if (K.hitsDone < a.hits.length && f >= a.hits[K.hitsDone]) { K.hitsDone++; if (inArc(K.pos, K.yaw, player.pos, a.range, a.arc)) hitPlayer(a); }
      if (f >= 1) { K.ci++; if (K.ci < K.combo.length) startAttack(); else { K.state = 'recover'; K.t = 0; K.recoverT = (0.55 + Math.random() * 0.5) / speedUp; playK('2H_Melee_Idle', 0.2); } }
    } else if (K.state === 'recover') {
      if (K.t > K.recoverT) { K.state = d > 4 ? 'chase' : 'circle'; K.t = 0; K.circleDir = Math.random() < 0.5 ? 1 : -1; K.circleT = 0.4 + Math.random() * 0.8; }
    } else if (K.state === 'block' || K.state === 'hurt') {
      if (K.t > 0.45) { K.state = 'circle'; K.t = 0; K.circleDir = Math.random() < 0.5 ? 1 : -1; K.circleT = 0.3; }
    } else if (K.state === 'stagger') {
      if (K.t > 3) { K.state = 'recover'; K.t = 0; K.recoverT = 0.3; K.post = 40; playK('2H_Melee_Idle', 0.3); }
    } else if (K.state === 'dead') {
      if (F.wonT > 0) { F.wonT -= dt; if (F.wonT <= 0) end(); }
    }
    // posture : redescend si le roi n'est pas frappé
    if (K.state !== 'stagger' && K.state !== 'dead' && performance.now() / 1000 - K.lastHit > 2) K.post = Math.max(0, K.post - (phase2() ? 4 : 7) * dt);
    if (performance.now() / 1000 - K.lastHit > 1.2) K.hitStreak = 0;
    // séparation roi / joueur
    const dd = dist(); if (dd < 1.6 && dd > 0.01) { const push = toPlayer().normalize().multiplyScalar((1.6 - dd) * 0.5); player.pos.add(push); K.pos.sub(push); }
    K.pos.y = groundAt(K.pos.x, K.pos.z) + (K.pos.distanceTo(HOME) < 4.8 ? 0.6 : 0);
    kingRoot.position.copy(K.pos); kingRoot.rotation.y = K.yaw;
    // éclat de télégraphe (or = parable, rouge = imparable)
    K.flashT = Math.max(0, K.flashT - dt);
    const fi = K.state === 'windup' ? 0.6 + Math.sin(K.t * 40) * 0.4 : K.flashT * 6;
    king.traverse((o) => { if (o.userData.flash) { o.material.emissive.copy(K.flashCol).multiplyScalar(fi); } });
  }

  // ------------------------------------------------ joueur en combat
  function begin() {
    F.active = true; K.state = 'intro'; K.t = 0; playK('Cheer', 0.2);
    P.hp = 100; P.armor = 60; P.post = 0; P.state = 'free'; P.t = 0;
    setSword(true);
    toast('⚔️ <b>Le Roi en armure</b> se dresse !<br><span style="font-size:20px">🛡️ Armure royale équipée · garde automatique</span>', 2600);
    sfx.warn(true); sfx.unsheathe(true);
    env.onEnter();
  }
  function end() {
    F.active = false; P.state = 'free'; env.onExit(); hud();
  }
  function reset() { // le roi reprend sa place, PV au maximum
    K.hp = K.maxHp; K.post = 0; K.state = 'dormant'; K.pos.copy(HOME); K.yaw = 0; playK('2H_Melee_Idle', 0.3);
  }
  function setSword(on) { P.sword = on; for (const m of swordMeshes) m.visible = on; }
  function lockYaw(dt) { const want = Math.atan2(K.pos.x - player.pos.x, K.pos.z - player.pos.z); player.yaw += angDiff(player.yaw, want) * damp(10, dt); }
  function playerAttack(atk) { P.atk = atk; P.state = 'attack'; P.t = 0; P.hitDone = false; playKnight(atk.clip, 0.06); knightActions[atk.clip].timeScale = 1.25; sWhoosh(); }
  function updatePlayer(dt, input) {
    P.t += dt;
    const [cf, cr] = env.camBasis();
    const move = cf.multiplyScalar(-input.ly).add(cr.multiplyScalar(input.lx)), mag = Math.min(1, move.length());
    if (input.pressed.l2 || input.pressed.l1) P.parryT = performance.now() / 1000;
    if (P.state === 'dead') {
      F.deadT -= dt;
      if (F.deadT <= 0) { // retour à la porte du château
        player.pos.set(arena.x, groundAt(arena.x, arena.z + 40), arena.z + 40); player.yaw = Math.PI; reset(); end(); playKnight('Idle', 0.2);
      }
      return;
    }
    if (P.state === 'finisher') {
      lockYaw(dt);
      if (P.t > 0.45 && !P.hitDone) { P.hitDone = true; K.hp = Math.max(0, K.hp - 70); burst(tmp.copy(K.pos).add(new THREE.Vector3(0, 1.8, 0)), 40, 0xffffff); sfx.heavyHit(); F.hitStop = 0.15; cam.shake = 0.5; K.post = 0; if (K.hp <= 0) killKing(); else { K.state = 'hurt'; K.t = -0.6; playK('Hit_A', 0.05); } }
      if (P.t > 0.9) { P.state = 'free'; P.t = 0; }
      return;
    }
    if (P.state === 'attack') {
      const a = P.atk, dur = knightActions[a.clip].getClip().duration / 1.25, f = P.t / dur;
      if (f < a.hit) lockYaw(dt);
      if (f < a.hit) player.pos.addScaledVector(tmp.set(Math.sin(player.yaw), 0, Math.cos(player.yaw)), dist() > 2 ? 2.2 * dt : 0);
      if (!P.hitDone && f >= a.hit) { P.hitDone = true; if (K.state !== 'dead' && inArc(player.pos, player.yaw, K.pos, 2.9, 1.0)) hitKing(a); }
      if (input.pressed.square && f > 0.35) P.queued = 'light'; if (input.pressed.triangle && f > 0.35) P.queued = 'heavy';
      if (f > 0.72 && P.queued) { const q = P.queued; P.queued = null; if (q === 'light') { P.combo = (P.combo + 1) % LIGHT.length; playerAttack(LIGHT[P.combo]); } else playerAttack(HEAVY); return; }
      if (f >= 1) { P.state = 'free'; P.t = 0; P.combo = -1; }
      return;
    }
    if (P.state === 'dodge') {
      player.pos.addScaledVector(P.dodgeDir, 7 * (1 - P.t / 0.5) * dt);
      if (P.t > 0.5) { P.state = 'free'; P.t = 0; }
      return;
    }
    if (P.state === 'hit' || P.state === 'block' || P.state === 'broken') {
      lockYaw(dt);
      if (P.t > (P.state === 'broken' ? 1.4 : P.state === 'hit' ? 0.5 : 0.3)) { P.state = 'free'; P.t = 0; }
      return;
    }
    // libre : déplacement verrouillé sur le roi, garde automatique
    lockYaw(dt);
    player.pos.addScaledVector(move, mag * 3.4 * dt);
    const fwdAmt = move.dot(tmp.set(Math.sin(player.yaw), 0, Math.cos(player.yaw))), sideAmt = move.dot(tmp2.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw)));
    if (mag < 0.15) playKnight('Blocking', 0.2);
    else if (Math.abs(sideAmt) > Math.abs(fwdAmt)) playKnight(sideAmt > 0 ? 'Running_Strafe_Left' : 'Running_Strafe_Right', 0.2);
    else playKnight(fwdAmt > 0 ? 'Walking_A' : 'Walking_Backwards', 0.2);
    if (knightActions.Running_Strafe_Left) { knightActions.Running_Strafe_Left.timeScale = 0.6; knightActions.Running_Strafe_Right.timeScale = 0.6; }
    if (P.post > 0 && performance.now() / 1000 - P.lastHit > 1.5) P.post = Math.max(0, P.post - 12 * dt);
    if (input.pressed.circle && K.state === 'stagger' && dist() < 4) { P.state = 'finisher'; P.t = 0; P.hitDone = false; playKnight('1H_Melee_Attack_Chop', 0.05); knightActions['1H_Melee_Attack_Chop'].timeScale = 0.8; F.slow = 0.6; return; }
    if (input.pressed.square) { P.combo = 0; playerAttack(LIGHT[0]); }
    else if (input.pressed.triangle) playerAttack(HEAVY);
    else if (input.pressed.cross) {
      P.state = 'dodge'; P.t = 0;
      if (mag > 0.2) P.dodgeDir.copy(move).normalize(); else P.dodgeDir.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
      const fa = P.dodgeDir.dot(tmp.set(Math.sin(player.yaw), 0, Math.cos(player.yaw))), sa = P.dodgeDir.dot(tmp2.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw)));
      playKnight(Math.abs(sa) > Math.abs(fa) ? (sa > 0 ? 'Dodge_Left' : 'Dodge_Right') : (fa > 0 ? 'Dodge_Forward' : 'Dodge_Backward'), 0.05);
      sfx.whoosh(0.7);
    }
  }

  return {
    get active() { return F.active; }, K, P,
    // ralenti / arrêt sur image (impact, parade, coup de grâce)
    timeScale(dt) { if (F.hitStop > 0) { F.hitStop -= dt; return 0.03; } if (F.slow > 0) { F.slow -= dt; return 0.35; } return 1; },
    update(dt, input) {
      if (F.active) updatePlayer(dt, input);
      updateKing(dt); kMixer.update(dt); updateSparks(dt);
      // fuite : le roi retourne sur son trône et récupère ; vaincu : il revient quand on s'éloigne
      if (F.active && K.state !== 'dead' && (dist() > 40 || player.mode !== 'foot')) { end(); reset(); toast('Le roi retourne sur son trône', 1500); }
      if (!F.active && K.state === 'dead' && dist() > 90) reset();
      hud();
    },
    toggleSword() { setSword(!P.sword); sfx.unsheathe(P.sword); toast(P.sword ? '🗡️ Épée dégainée' : 'Épée rengainée', 900); },
    // caméra verrouillée : derrière l'épaule, le roi dans le cadre
    camera(want, look) {
      const away = tmp.subVectors(player.pos, K.pos).setY(0).normalize();
      const right = tmp2.set(-away.z, 0, away.x);
      want.copy(player.pos).addScaledVector(away, 4.6).addScaledVector(right, -1.3).add(new THREE.Vector3(0, 2.5, 0));
      look.copy(player.pos).lerp(K.pos, 0.55).add(new THREE.Vector3(0, 1.5, 0));
    },
  };
}
