// Turns the 955k-triangle source soldier into a game-ready LOD (~25k triangles, 256px textures).
// Usage: node tools/optimize-model.mjs <path/to/soldier_gunner.glb> [assets/soldier.glb]
import { NodeIO } from '@gltf-transform/core';
import { weld, simplifyPrimitive, prune, textureCompress, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const [src, out = 'assets/soldier.glb'] = process.argv.slice(2);
if (!src) {
  console.error('usage: node tools/optimize-model.mjs <soldier_gunner.glb> [out.glb]');
  process.exit(1);
}

// Fraction of triangles kept per mesh. Hair is mostly hidden by the helmet,
// eyes are tiny on screen, so they get cut harder than clothing.
const RATIO = { hair: 0.012, eye: 0.15, iris: 0.4, pupil: 0.5, nail: 0.06, default: 0.028 };

await MeshoptSimplifier.ready;
const io = new NodeIO();
const doc = await io.read(src);
await doc.transform(weld());

for (const mesh of doc.getRoot().listMeshes()) {
  const key = mesh.getName().replace('soldier_gunner_', '');
  const ratio = RATIO[key] ?? RATIO.default;
  for (const prim of mesh.listPrimitives()) {
    const before = prim.getIndices().getCount() / 3;
    simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio, error: key === 'hair' ? 0.03 : 0.004, lockBorder: false });
    console.log(`${key.padEnd(10)} ${before} -> ${prim.getIndices().getCount() / 3} tris`);
  }
}

await doc.transform(
  textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [256, 256], quality: 82 }),
  dedup(),
  prune(),
);
await io.write(out, doc);
console.log('wrote', out);
