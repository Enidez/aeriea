// Réduit Knight.glb (garde 6 animations). Nécessite: npm i -D @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions
import { NodeIO } from '@gltf-transform/core';
import { prune, dedup, resample, weld, quantize } from '@gltf-transform/functions';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS); const doc = await io.read('assets/Knight.glb');
const keep = new Set(['Idle','Walking_A','Running_A','Jump_Full_Short','Sit_Chair_Idle','Cheer']);
for (const a of doc.getRoot().listAnimations()) if (!keep.has(a.getName())) { a.listChannels().forEach(c=>c.dispose()); a.listSamplers().forEach(s=>{ s.dispose(); }); a.dispose(); }
const hide = /^(1H_Sword_Offhand|Badge_Shield|Rectangle_Shield|Spike_Shield|2H_Sword)$/;
for (const n of doc.getRoot().listNodes()) if (hide.test(n.getName())) n.dispose();
await doc.transform(resample(), prune(), dedup(), weld(), quantize());
await io.write('assets/Knight-slim.glb', doc);
