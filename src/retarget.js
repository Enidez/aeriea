// Retargeting d'animations entre squelettes humanoïdes différents (KayKit → Mixamo, Biped 3ds Max…).
// Principe : pour chaque os, on applique au modèle cible la rotation « monde » de l'os source depuis sa pose
// de repos, après avoir aligné les directions des os au repos (corrige les écarts A-pose / T-pose).
import * as THREE from 'three';

export const boneKey = (s) => s.replace(/_\d+$/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
// os sémantiques → noms (normalisés) par type de rig
const Z = new THREE.Vector3(0, 0, 1);
const RIGS = {
  kaykit: { hips: 'hips', spine: 'spine', chest: 'chest', head: 'head', armL: 'upperarml', foreL: 'lowerarml', handL: 'wristl', armR: 'upperarmr', foreR: 'lowerarmr', handR: 'wristr',
    thighL: 'upperlegl', shinL: 'lowerlegl', footL: 'footl', toeL: 'toesl', thighR: 'upperlegr', shinR: 'lowerlegr', footR: 'footr', toeR: 'toesr' },
  mixamo: { hips: 'hips', spine: 'spine', chest: 'spine2', neck: 'neck', head: 'head', shL: 'leftshoulder', armL: 'leftarm', foreL: 'leftforearm', handL: 'lefthand', shR: 'rightshoulder', armR: 'rightarm', foreR: 'rightforearm', handR: 'righthand',
    thighL: 'leftupleg', shinL: 'leftleg', footL: 'leftfoot', toeL: 'lefttoebase', thighR: 'rightupleg', shinR: 'rightleg', footR: 'rightfoot', toeR: 'righttoebase' },
  biped: { hips: 'pelvis', spine: 'spine', chest: 'spine1', neck: 'neck', head: 'head', shL: 'bip01lclavicle', armL: 'lupperarm', foreL: 'lforearm', handL: 'lhand', shR: 'bip01rclavicle', armR: 'rupperarm', foreR: 'rforearm', handR: 'rhand',
    thighL: 'lthigh', shinL: 'lcalf', footL: 'lfoot', toeL: 'ltoe0', thighR: 'rthigh', shinR: 'rcalf', footR: 'rfoot', toeR: 'rtoe0' },
};
const ORDER = ['hips', 'spine', 'chest', 'neck', 'head', 'shL', 'armL', 'foreL', 'handL', 'shR', 'armR', 'foreR', 'handR', 'thighL', 'shinL', 'footL', 'toeL', 'thighR', 'shinR', 'footR', 'toeR'];
const CHILD = { hips: 'spine', spine: 'chest', chest: 'head', shL: 'armL', armL: 'foreL', foreL: 'handL', shR: 'armR', armR: 'foreR', foreR: 'handR', thighL: 'shinL', shinL: 'footL', footL: 'toeL', thighR: 'shinR', shinR: 'footR', footR: 'toeR' };

// trouve les os d'un modèle pour un type de rig donné
export function rigBones(root, type) {
  const byKey = {}; root.traverse((o) => { if (o.isBone) { const k = boneKey(o.name); if (!byKey[k]) byKey[k] = o; } });
  const out = {}; for (const [sem, k] of Object.entries(RIGS[type])) if (byKey[k]) out[sem] = byKey[k];
  return out;
}
// remet un modèle skinné dans sa pose de liaison (bind pose)
export function bindPose(root) { root.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.pose(); }); root.updateMatrixWorld(true); }
// oriente un modèle pour qu'il regarde vers +z (d'après la direction pied → orteils)
export function faceForward(root, bones) {
  bindPose(root);
  const p = (b) => b.getWorldPosition(new THREE.Vector3());
  const dir = p(bones.toeL).add(p(bones.toeR)).sub(p(bones.footL)).sub(p(bones.footR)); dir.y = 0;
  root.rotation.y -= Math.atan2(dir.x, dir.z); root.updateMatrixWorld(true);
}

export function retargetClips(src, tgt, clips, fps = 30, armDown = 0.55) {
  const S = src.bones, T = tgt.bones, sems = ORDER.filter((k) => S[k] && T[k]);
  bindPose(src.root); bindPose(tgt.root);
  const wq = (b) => b.getWorldQuaternion(new THREE.Quaternion()), wp = (b) => b.getWorldPosition(new THREE.Vector3());
  const rest = {};
  for (const k of sems) {
    const align = new THREE.Quaternion(), c = CHILD[k];
    const cs = c && (S[c] || (k === 'chest' && S.head)), ct = c && (T[c] || (k === 'chest' && T.head));
    if (cs && ct) { const ds = wp(cs).sub(wp(S[k])).normalize(), dt = wp(ct).sub(wp(T[k])).normalize(); align.setFromUnitVectors(dt, ds); }
    rest[k] = { s: wq(S[k]).invert(), t: wq(T[k]), align };
  }
  const sHip0 = wp(S.hips), tHip0 = wp(T.hips);
  const sGround = new THREE.Box3().setFromObject(src.root).min.y, tGround = new THREE.Box3().setFromObject(tgt.root).min.y;
  const footY = (B) => Math.min(wp(B.footL).y, wp(B.footR).y, B.toeL ? wp(B.toeL).y : 1e9, B.toeR ? wp(B.toeR).y : 1e9);
  const sFoot0 = footY(S) - sGround, tFoot0 = footY(T) - tGround; // hauteur des pieds au repos
  const scale = (tHip0.y - new THREE.Box3().setFromObject(tgt.root).min.y) / Math.max(1e-3, sHip0.y - new THREE.Box3().setFromObject(src.root).min.y);
  const tRestLocal = {}; tgt.root.traverse((o) => { if (o.isBone) tRestLocal[o.uuid] = o.quaternion.clone(); });
  const mixer = new THREE.AnimationMixer(src.root), q = new THREE.Quaternion(), pq = new THREE.Quaternion(), v = new THREE.Vector3();
  const out = [];
  for (const clip of clips) {
    mixer.stopAllAction(); const act = mixer.clipAction(clip); act.play();
    const n = Math.max(2, Math.ceil(clip.duration * fps) + 1), times = new Float32Array(n);
    const qv = {}; for (const k of sems) qv[k] = new Float32Array(n * 4);
    const hp = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const t = Math.min(clip.duration, i / fps); times[i] = t;
      mixer.setTime(t); src.root.updateMatrixWorld(true);
      tgt.root.traverse((o) => { if (o.isBone) o.quaternion.copy(tRestLocal[o.uuid]); });
      for (const k of sems) {
        const r = rest[k], b = T[k];
        q.copy(wq(S[k])).multiply(r.s).multiply(r.align).multiply(r.t); // rotation monde voulue
        if (k === 'armL' || k === 'armR') q.premultiply(pq.setFromAxisAngle(Z, (k === 'armL' ? -1 : 1) * armDown)); // le modèle source a un gros torse : bras rabattus
        b.parent.updateWorldMatrix(true, false); b.parent.getWorldQuaternion(pq);
        b.quaternion.copy(pq.invert().multiply(q)); b.updateWorldMatrix(false, false);
        qv[k].set([b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w], i * 4);
      }
      v.copy(wp(S.hips)).sub(sHip0).multiplyScalar(scale).add(tHip0);
      T.hips.parent.updateWorldMatrix(true, false);
      // ancrage des pieds : le pied le plus bas reste à la même hauteur relative que sur la source
      const lv = T.hips.parent.worldToLocal(v.clone()); T.hips.position.copy(lv); tgt.root.updateMatrixWorld(true);
      const want = tGround + tFoot0 + (footY(S) - sGround - sFoot0) * scale;
      v.y += want - footY(T);
      T.hips.parent.worldToLocal(v);
      hp.set([v.x, v.y, v.z], i * 3);
    }
    const tracks = sems.map((k) => new THREE.QuaternionKeyframeTrack(`${T[k].name}.quaternion`, times, qv[k]));
    tracks.push(new THREE.VectorKeyframeTrack(`${T.hips.name}.position`, times, hp));
    out.push(new THREE.AnimationClip(clip.name, clip.duration, tracks));
    mixer.uncacheClip(clip);
  }
  mixer.stopAllAction();
  bindPose(src.root); bindPose(tgt.root);
  return out;
}
