import './nodeShims.mjs';
import { categoriesForLevel } from './catalog.js';

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
