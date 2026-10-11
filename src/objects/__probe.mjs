import './nodeShims.mjs';
// Dynamic: nodeShims registers the https -> local three redirect while it is
// evaluated, and a static import of the catalogue would be resolved long
// before that - so the catalogue has to be pulled in afterwards.
const { categoriesForLevel } = await import('./catalog.js');

const count = (o) => { let n = 0; o.traverse((m) => { if (m.isMesh) n++; }); return n; };
let total = 0, fails = 0;
for (const cat of categoriesForLevel(process.argv[2] || 'beach')) {
  for (const o of cat.objects) {
    const g = o.build();
    const n = count(g);
    total += n;
    const ok = n > 0 && g.type === 'Group';
    if (!ok) fails++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${o.name.padEnd(16)} ${n} meshes`);
  }
}
console.log(`TOTAL ${total} meshes, ${fails} failures`);
