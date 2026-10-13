// Empaquette les créatures Sketchfab préparées (packs/out/*) en GLB dans assets/.
import { NodeIO } from '@gltf-transform/core';
import { prune, dedup, resample, weld } from '@gltf-transform/functions';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const [src, dst] of [['eagle', 'GoldenEagle'], ['baldeagle', 'BaldEagle'], ['flintmaw', 'FlintMaw']]) {
  const doc = await io.read(`../packs/out/${src}/scene.gltf`);
  await doc.transform(resample(), prune(), dedup(), weld());
  await io.write(`assets/${dst}.glb`, doc); console.log('écrit', dst);
}
