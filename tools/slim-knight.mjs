// Réduit Knight.glb (garde les animations de déplacement, monte et combat). Nécessite: npm i -D @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions
import { NodeIO } from '@gltf-transform/core';
import { prune, dedup, resample, weld, quantize } from '@gltf-transform/functions';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS); const doc = await io.read('assets/Knight.glb');
const keep = new Set(['Idle','Walking_A','Walking_Backwards','Running_A','Running_Strafe_Left','Running_Strafe_Right','Jump_Full_Short','Sit_Chair_Idle','Cheer',
  '1H_Melee_Attack_Slice_Diagonal','1H_Melee_Attack_Slice_Horizontal','1H_Melee_Attack_Chop','1H_Melee_Attack_Stab',
  '2H_Melee_Attack_Chop','2H_Melee_Attack_Slice','2H_Melee_Attack_Spin','2H_Melee_Attack_Stab','2H_Melee_Idle',
  'Block','Block_Hit','Blocking','Dodge_Backward','Dodge_Forward','Dodge_Left','Dodge_Right','Hit_A','Hit_B','Death_A','Death_B']);
for (const a of doc.getRoot().listAnimations()) if (!keep.has(a.getName())) { a.listChannels().forEach(c=>c.dispose()); a.listSamplers().forEach(s=>{ s.dispose(); }); a.dispose(); }
const hide = /^(1H_Sword_Offhand|Badge_Shield|Rectangle_Shield|Spike_Shield)$/; // 2H_Sword gardée pour le roi
for (const n of doc.getRoot().listNodes()) if (hide.test(n.getName())) n.dispose();
await doc.transform(resample(), prune(), dedup(), weld(), quantize());
await io.write('assets/Knight-slim.glb', doc);
