// Créatures volantes riggées (aigle royal, pygargue, dragon) : orientation, échelle, battements, siège du cavalier.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { boneKey } from './retarget.js';

function findBoneBy(root, test) { let r = null; root.traverse((o) => { if (!r && o.isBone && test(boneKey(o.name))) r = o; }); return r; }

// opts : { span (envergure en m), head, tail, seat (tests sur le nom normalisé des os), clip, seatAhead (m), hwFrac }
export function createFlyer(gltf, opts, cloneIt = false) {
  const model = cloneIt ? cloneSkinned(gltf.scene) : gltf.scene;
  const meshes = [];
  model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; o.material = o.material.clone(); meshes.push(o); } });
  const mouth = opts.mouth ? findBoneBy(model, opts.mouth) : null, head = findBoneBy(model, opts.head), tail = findBoneBy(model, opts.tail), seatBone = findBoneBy(model, opts.seat);
  model.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.pose(); });
  // orientation : tête vers +z
  model.updateMatrixWorld(true);
  const hp = head.getWorldPosition(new THREE.Vector3()), tp = tail.getWorldPosition(new THREE.Vector3());
  const dir = hp.clone().sub(tp); model.rotation.y -= Math.atan2(dir.x, dir.z); model.updateMatrixWorld(true);
  // échelle : envergure = largeur en x
  let box = new THREE.Box3().setFromObject(model, true);
  model.scale.multiplyScalar(opts.span / Math.max(0.01, box.max.x - box.min.x)); model.updateMatrixWorld(true);
  // surface du dos au-dessus de l'os du siège + demi-largeur du corps (sommets en pose de liaison)
  const v = new THREE.Vector3(), c = seatBone.getWorldPosition(new THREE.Vector3());
  let top = -1e9, hw = 0; const rz = opts.span * 0.06, rx = opts.span * (opts.hwFrac || 0.07);
  for (const m of meshes) {
    const p = m.geometry.attributes.position; if (!p) continue;
    for (let i = 0; i < p.count; i += 1) {
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
      if (Math.abs(v.z - c.z - (opts.seatAhead || 0)) > rz) continue;
      if (Math.abs(v.x - c.x) < rx * 0.4) top = Math.max(top, v.y);
      if (Math.abs(v.x - c.x) < rx && v.y < c.y) hw = Math.max(hw, Math.abs(v.x - c.x));
    }
  }
  const seatW = new THREE.Vector3(c.x, top > -1e8 ? top : c.y + opts.span * 0.03, c.z + (opts.seatAhead || 0));
  const seatLocal = seatBone.worldToLocal(seatW.clone());
  const group = new THREE.Group(); group.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const clip = gltf.animations.find((a) => !opts.clip || a.name === opts.clip) || gltf.animations[0];
  const action = clip ? mixer.clipAction(clip) : null; action?.play();
  // centre sur le siège dans la pose animée (l'animation de vol déplace souvent l'os racine)
  mixer.update(0.001); model.updateMatrixWorld(true);
  const sp0 = seatBone.localToWorld(seatLocal.clone()); model.position.sub(sp0); model.updateMatrixWorld(true);
  const base = meshes.map((m) => ({ m, color: m.material.color.clone(), rough: m.material.roughness, metal: m.material.metalness }));
  return {
    group, model, mixer, action, mouth: mouth || head, hw: Math.max(hw, opts.span * 0.03),
    seat(outP, outQ) { group.updateMatrixWorld(true); outP.copy(seatLocal); seatBone.localToWorld(outP); group.getWorldQuaternion(outQ); },
    flap(rate, dt) { if (action) action.timeScale += (rate - action.timeScale) * (1 - Math.exp(-4 * dt)); },
    skin(s) { // teinte (variantes : aigle noir, aigle d'or)
      for (const b of base) { b.m.material.color.copy(b.color); b.m.material.roughness = b.rough; b.m.material.metalness = b.metal; b.m.material.emissive?.set(0);
        if (s?.tint) b.m.material.color.multiply(new THREE.Color(s.tint)); if (s?.metal != null) { b.m.material.metalness = s.metal; b.m.material.roughness = s.rough ?? 0.35; } if (s?.emissive) b.m.material.emissive?.set(s.emissive); }
    },
  };
}

export const FLYER_RIGS = {
  golden: { head: (k) => k === 'bip01head', tail: (k) => k === 'bip01pelvis', seat: (k) => k === 'bip01spine1', seatAhead: 0, hwFrac: 0.08 },
  bald: { head: (k) => k.includes('hawkhead'), tail: (k) => k.includes('hawktail01'), seat: (k) => k.includes('hawkspine'), seatAhead: 0, hwFrac: 0.08 },
  flint: { mouth: (k) => k === 'jaw', head: (k) => k === 'head', tail: (k) => k === 'hip', seat: (k) => k === 'spine3', seatAhead: 0, hwFrac: 0.06 },
};
