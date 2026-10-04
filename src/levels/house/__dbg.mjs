import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, 'index.js'), 'utf8')
  .replace(/import\s+\*\s+as\s+THREE\s+from\s+'https:[^']*';/, "import * as THREE from './three-stub.mjs';");
const built = path.join(here, '__dbg_built.mjs');
fs.writeFileSync(built, source);
const { addHouse } = await import(pathToFileURL(built).href);
const world = await addHouse({ add() {} }, {});

const want = process.argv[2] ? process.argv[2].split(';') : null;
let n = 0;
for (const child of world.group.children) {
  if (child.isMesh) continue;
  if (!child.children.some((c) => c.isMesh)) continue;
  const q = Math.round(child.rotation.y / (Math.PI / 2)) * (Math.PI / 2);
  const cos = Math.cos(q), sin = Math.sin(q);
  const gx = child.position.x, gz = child.position.z;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  const add = (lx, lz, w, d) => {
    const rx = lx * cos + lz * sin, rz = -lx * sin + lz * cos;
    const hw = (Math.abs(w * cos) + Math.abs(d * sin)) / 2;
    const hd = (Math.abs(w * sin) + Math.abs(d * cos)) / 2;
    x0 = Math.min(x0, gx + rx - hw); x1 = Math.max(x1, gx + rx + hw);
    z0 = Math.min(z0, gz + rz - hd); z1 = Math.max(z1, gz + rz + hd);
  };
  child.traverse((o) => {
    if (!o.isMesh || o.geometry?.kind !== 'box') return;
    const [w, h, d] = o.geometry.params.map(Number);
    const walk = (m, ax, az) => {
      const px = ax + m.position.x, pz = az + m.position.z;
      if (m === o) { add(px, pz, w, d); return; }
      for (const c of m.children) walk(c, px, pz);
    };
    walk(child, -gx, -gz);
  });
  const key = `x${x0.toFixed(1)}..${x1.toFixed(1)} z${z0.toFixed(1)}..${z1.toFixed(1)}`;
  const hit = want ? want.some((s) => key.startsWith(s.trim())) : true;
  if (hit) console.log(`${String(n).padStart(2)} grp(${gx},${gz}) ry=${q.toFixed(2)} ${key}`);
  n++;
}
fs.unlinkSync(built);
