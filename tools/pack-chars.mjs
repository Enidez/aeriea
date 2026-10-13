// Empaquette les personnages Sketchfab préparés (packs/out/*) en GLB optimisés dans assets/.
import { NodeIO } from '@gltf-transform/core';
import { prune, dedup, resample, weld } from '@gltf-transform/functions';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const [src, dst] of [['../packs/out/paladin/scene.gltf', 'assets/Paladin.glb'], ['../packs/out/king/scene.gltf', 'assets/King.glb']]) {
  const doc = await io.read(src);
  await doc.transform(resample(), prune(), dedup(), weld());
  await io.write(dst, doc); console.log('écrit', dst);
}
