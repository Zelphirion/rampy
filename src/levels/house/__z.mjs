import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, 'index.js'), 'utf8')
  .replace(/import\s+\*\s+as\s+THREE\s+from\s+'https:[^']*';/, "import * as THREE from './three-stub.mjs';");
const built = path.join(here, '__z_built.mjs');
fs.writeFileSync(built, source);
const { addHouse } = await import(pathToFileURL(built).href);
const world = await addHouse({ add() {} }, {});

const [tx, tz] = (process.argv[2] || '0,0').split(',').map(Number);
for (const c of world.group.children) {
  if (c.isMesh || !c.children.some((k) => k.isMesh)) continue;
  if (c.position.x !== tx || c.position.z !== tz) continue;
  console.log(`grp (${c.position.x},${c.position.z}) ry=${c.rotation.y.toFixed(3)}`);
  c.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry?.params ? o.geometry.params.join('x') : o.geometry?.kind;
    console.log(`   ${o.geometry?.kind} ${p} at ${o.position.x},${o.position.y},${o.position.z} ry=${o.rotation.y.toFixed(2)}`);
  });
}
fs.unlinkSync(built);
