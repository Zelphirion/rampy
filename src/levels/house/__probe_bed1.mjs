// Temp probe: list every direct child of the house group with a box/sphere
// footprint inside bed1, so the magna-tile labyrinth can be placed clear of it.
import { addHouse } from './houseHarness.mjs';

const world = await addHouse({ add() {} }, {});

const bed1 = { x0: -90, x1: -46, z0: -86, z1: -20 };
const rows = [];

for (const child of world.group.children) {
  const boxes = [];
  let hasMesh = false;
  child.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    hasMesh = true;
    const kind = o.geometry.kind;
    let w = 0, h = 0, d = 0;
    if (kind === 'box') [w, h, d] = o.geometry.params.map(Number);
    else if (kind === 'sphere') w = h = d = Number(o.geometry.params[0]) * 2;
    else return;
    // accumulate position up the chain, including `child` itself, stopping
    // before child's parent (a direct mesh child must not double-add itself)
    let x = 0, y = 0, z = 0, n = o;
    while (n && n !== child.parent) { x += n.position.x; y += n.position.y; z += n.position.z; n = n.parent; }
    boxes.push({ x, y, z, w, h, d, kind });
  });
  if (!hasMesh || !boxes.length) continue;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const b of boxes) {
    x0 = Math.min(x0, b.x - b.w / 2); x1 = Math.max(x1, b.x + b.w / 2);
    y0 = Math.min(y0, b.y - b.h / 2); y1 = Math.max(y1, b.y + b.h / 2);
    z0 = Math.min(z0, b.z - b.d / 2); z1 = Math.max(z1, b.z + b.d / 2);
  }
  const inBed1 = x1 > bed1.x0 && x0 < bed1.x1 && z1 > bed1.z0 && z0 < bed1.z1;
  if (!inBed1) continue;
  rows.push({
    name: child.name || (child.isMesh ? 'mesh:' + child.geometry.kind : 'group'),
    x0: +x0.toFixed(1), x1: +x1.toFixed(1),
    z0: +z0.toFixed(1), z1: +z1.toFixed(1),
    y0: +y0.toFixed(2), y1: +y1.toFixed(2),
    n: boxes.length,
  });
}
rows.sort((a, b) => a.z0 - b.z0 || a.x0 - b.x0);
for (const r of rows) {
  console.log(`${r.name.padEnd(22)} x ${String(r.x0).padStart(6)}..${String(r.x1).padStart(6)}  z ${String(r.z0).padStart(6)}..${String(r.z1).padStart(6)}  y ${r.y0}..${r.y1}  (n=${r.n})`);
}
console.log('cat spot (-52,-40) r5.2 box: x -57.2..-46.8 z -45.2..-34.8');
console.log('planned maze:               x -72.5..-57.7 z -45.5..-35.5');
