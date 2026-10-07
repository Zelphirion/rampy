import './nodeShims.mjs';
import * as THREE from 'three';
import { addUnderground } from '../levels/underground/index.js';

const count = (o) => { let n = 0; o.traverse((m) => { if (m.isMesh) n++; }); return n; };
const g = new THREE.Group();
const out = await addUnderground(g, {});
const gemSet = new Set();
(out.gemstones || []).forEach((el) => el.mesh && gemSet.add(el.mesh.uuid));
const nogem = { n: 0, hist: {} };
g.traverse((m) => {
  if (m.isMesh && !gemSet.has(m.uuid)) {
    nogem.n++;
    const t = m.geometry.type;
    nogem.hist[t] = (nogem.hist[t] || 0) + 1;
  }
});
const snap = {
  meshes: count(g),
  nogem,
  colliders: out.colliders ? out.colliders.length : 'MISSING',
  steamPress: out.steamPress && out.steamPress.head ? 'ok' : 'MISSING',
  carWash: out.carWash && out.carWash.drums ? `ok(${out.carWash.drums.length})` : 'MISSING',
  taffy: out.taffy && out.taffy.hooks ? `ok(${out.taffy.hooks.length})` : 'MISSING',
  magnet: out.magnet && out.magnet.holdY ? 'ok' : 'MISSING',
  holy: out.holy && out.holy.armR ? 'ok' : 'MISSING',
  trampolines: out.trampolines ? out.trampolines.length : 'MISSING',
  statues: out.statues ? out.statues.length : 'MISSING',
  gems: out.gemstones ? out.gemstones.length : 'MISSING',
  rings: out.expressTube && out.expressTube.rings ? out.expressTube.rings.length : 'MISSING',
};
console.log(JSON.stringify(snap));