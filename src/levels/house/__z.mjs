// Dumps one placed group's children: the group at (x,z) from argv, "0,0".
// Run: node src/levels/house/__z.mjs <x>,<z>
import { addHouse } from './houseHarness.mjs';

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
