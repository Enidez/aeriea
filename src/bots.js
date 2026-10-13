// Autres joueurs (bots) : chevaliers sur aigles et dragons qui sillonnent le ciel et font des figures, et piétons au village.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { createFlyer, FLYER_RIGS } from './flyers.js';
import { rigBones } from './retarget.js';

const NAMES = ['Gauvain', 'Perceval', 'Lancelot', 'Yseult', 'Tristan', 'Morgane', 'Bohort', 'Viviane', 'Galaad', 'Ector', 'Guenièvre', 'Kay'];
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

function nameplate(text, color) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const x = cv.getContext('2d');
  x.font = '600 30px Barlow, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = 'rgba(15,17,22,.55)'; x.beginPath(); x.roundRect(128 - x.measureText(text).width / 2 - 18, 10, x.measureText(text).width + 36, 44, 22); x.fill();
  x.fillStyle = color; x.fillText(text, 128, 33);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthWrite: false, transparent: true }));
  sp.scale.set(4, 1, 1); sp.renderOrder = 5; return sp;
}

export function createBots(env) {
  const { scene, gltfs, knight, clips, sitHips, groundAt, flyingCount = 7, walkingCount = 4, center } = env;
  const bots = [], tmp = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Euler(), up = new THREE.Vector3(0, 1, 0);
  const R = (a, b) => a + Math.random() * (b - a);
  function makeRider() {
    const r = cloneSkinned(knight); const holder = new THREE.Group(); holder.add(r); scene.add(holder);
    const mixer = new THREE.AnimationMixer(r), acts = {}; for (const c of clips) acts[c.name] = mixer.clipAction(c);
    let cur = null; const play = (n) => { const a = acts[n]; if (!a || a === cur) return; a.reset().play(); if (cur) a.crossFadeFrom(cur, 0.25, false); cur = a; };
    return { holder, model: r, mixer, play, bones: rigBones(r, 'mixamo') };
  }
  // IK des jambes du bot autour du corps de sa monture
  const A = new THREE.Vector3(), B = new THREE.Vector3(), T = new THREE.Vector3(), Q = new THREE.Quaternion(), P = new THREE.Quaternion();
  function aim(bone, child, target) { bone.updateWorldMatrix(true, true); bone.getWorldPosition(A); child.getWorldPosition(B); Q.setFromUnitVectors(B.sub(A).normalize(), T.copy(target).sub(A).normalize()); bone.parent.getWorldQuaternion(P); bone.quaternion.premultiply(P.clone().invert().multiply(Q).multiply(P)); bone.updateWorldMatrix(false, true); }
  function legs(rd, hw) {
    for (const [th, sh, ft, s] of [[rd.bones.thighL, rd.bones.shinL, rd.bones.footL, 1], [rd.bones.thighR, rd.bones.shinR, rd.bones.footR, -1]]) {
      const hip = th.getWorldPosition(new THREE.Vector3()), kn = sh.getWorldPosition(new THREE.Vector3()), fo = ft.getWorldPosition(new THREE.Vector3());
      const k = hip.clone().add(rd.holder.localToWorld(new THREE.Vector3(s * (hw + 0.1), -0.32, 0.3)).sub(hip).normalize().multiplyScalar(hip.distanceTo(kn)));
      const f = k.clone().add(rd.holder.localToWorld(new THREE.Vector3(s * (hw * 0.8 + 0.12), -1, 0.12)).sub(k).normalize().multiplyScalar(kn.distanceTo(fo)));
      aim(th, sh, k); aim(sh, ft, f);
    }
  }
  const kinds = [['golden', 14, 0x9a6d42], ['golden', 15, 0x3a3640], ['golden', 13, 0xc8a070], ['flint', 30, null]];
  for (let i = 0; i < flyingCount; i++) {
    const [model, span, tint] = kinds[i % kinds.length];
    const f = createFlyer(gltfs[model], { ...FLYER_RIGS[model], span }, true); if (tint) f.skin({ tint }); scene.add(f.group);
    const rd = makeRider(); rd.play('Sit_Chair_Idle');
    const name = NAMES[i % NAMES.length], tag = nameplate(name, model === 'flint' ? '#ff9a7a' : '#ffffff'); scene.add(tag);
    const a = (i / flyingCount) * Math.PI * 2, rad = R(150, 700);
    const pos = new THREE.Vector3(center.x + Math.cos(a) * rad, 0, center.z + Math.sin(a) * rad); pos.y = groundAt(pos.x, pos.z) + R(60, 160);
    bots.push({ kind: 'fly', f, rd, tag, name, pos, yaw: R(0, 6.28), pitch: 0, roll: 0, speed: model === 'flint' ? 45 : 55, target: new THREE.Vector3(), retarget: 0, trick: 0, trickKind: 0, dragon: model === 'flint', t: R(0, 10) });
  }
  for (let i = 0; i < walkingCount; i++) {
    const rd = makeRider(); const name = NAMES[(flyingCount + i) % NAMES.length], tag = nameplate(name, '#e8e2d0'); scene.add(tag);
    const pos = new THREE.Vector3(center.vx + R(-40, 40), 0, center.vz + R(-40, 40)); pos.y = groundAt(pos.x, pos.z);
    bots.push({ kind: 'walk', rd, tag, name, pos, yaw: R(0, 6.28), target: pos.clone(), wait: R(0, 4), t: 0 });
  }
  function pickTarget(b) {
    const a = Math.random() * Math.PI * 2, rad = R(100, 1300);
    b.target.set(center.x + Math.cos(a) * rad, 0, center.z + Math.sin(a) * rad); b.target.y = groundAt(b.target.x, b.target.z) + R(40, 200); b.retarget = R(12, 30);
  }
  return {
    bots,
    update(dt, cameraPos) {
      for (const b of bots) {
        b.t += dt;
        if (b.kind === 'fly') {
          if ((b.retarget -= dt) <= 0 || b.pos.distanceTo(b.target) < 60) pickTarget(b);
          const dx = b.target.x - b.pos.x, dy = b.target.y - b.pos.y, dz = b.target.z - b.pos.z;
          const turn = Math.max(-1, Math.min(1, angDiff(b.yaw, Math.atan2(dx, dz)) * 1.5)) * (b.dragon ? 0.5 : 0.8);
          b.yaw += turn * dt; b.roll += (-turn * 0.7 - b.roll) * (1 - Math.exp(-3 * dt));
          b.pitch += (Math.max(-0.6, Math.min(0.5, Math.atan2(dy, Math.hypot(dx, dz)))) - b.pitch) * (1 - Math.exp(-2 * dt));
          // figures de temps en temps : tonneau (1) ou looping (2)
          if (!b.trick && Math.random() < dt / 9) { b.trick = 0.0001; b.trickKind = Math.random() < 0.6 ? 1 : 2; b.trickDir = Math.random() < 0.5 ? 1 : -1; }
          let extraRoll = 0, extraPitch = 0;
          if (b.trick) { b.trick += dt / (b.trickKind === 1 ? 0.8 : 1.8); const t = Math.min(b.trick, 1); if (b.trickKind === 1) extraRoll = b.trickDir * t * Math.PI * 2; else extraPitch = t * Math.PI * 2; if (b.trick >= 1) b.trick = 0; }
          const p = b.pitch + extraPitch;
          b.pos.x += Math.sin(b.yaw) * Math.cos(p) * b.speed * dt; b.pos.y += Math.sin(p) * b.speed * dt; b.pos.z += Math.cos(b.yaw) * Math.cos(p) * b.speed * dt;
          b.pos.y = Math.max(b.pos.y, groundAt(b.pos.x, b.pos.z) + (b.dragon ? 12 : 6));
          b.f.group.position.copy(b.pos); b.f.group.rotation.set(-p, b.yaw, b.roll + extraRoll, 'YXZ');
          b.f.flap((b.pitch > 0.1 ? 1.4 : 0.7) * (b.dragon ? 1.9 : 1), dt);
          b.f.mixer.update(dt);
          // cavalier
          b.f.seat(tmp, q); b.rd.holder.position.copy(tmp); b.rd.holder.quaternion.copy(q);
          b.rd.model.position.copy(sitHips).negate().add(new THREE.Vector3(0, 0.1, 0.05));
          b.rd.mixer.update(dt); b.rd.holder.updateMatrixWorld(true); legs(b.rd, b.f.hw);
          b.tag.position.copy(tmp).addScaledVector(up, 3.2);
        } else {
          const d = Math.hypot(b.target.x - b.pos.x, b.target.z - b.pos.z);
          if (d < 0.8) { if ((b.wait -= dt) <= 0) { b.target.set(center.vx + R(-60, 60), 0, center.vz + R(-60, 60)); b.wait = R(2, 7); } b.rd.play(Math.random() < 0.002 ? 'Cheer' : 'Idle'); }
          else { b.yaw += angDiff(b.yaw, Math.atan2(b.target.x - b.pos.x, b.target.z - b.pos.z)) * (1 - Math.exp(-6 * dt)); b.pos.x += Math.sin(b.yaw) * 2.6 * dt; b.pos.z += Math.cos(b.yaw) * 2.6 * dt; b.rd.play('Walking_A'); }
          b.pos.y = groundAt(b.pos.x, b.pos.z); b.rd.holder.position.copy(b.pos); b.rd.holder.rotation.set(0, b.yaw, 0);
          b.rd.mixer.update(dt); b.tag.position.copy(b.pos).add(tmp.set(0, 2.5, 0));
        }
        // étiquette visible seulement à distance raisonnable
        const dc = cameraPos.distanceTo(b.tag.position); b.tag.visible = dc < 600; b.tag.scale.set(4, 1, 1).multiplyScalar(Math.max(1, dc / 60));
      }
    },
  };
}
