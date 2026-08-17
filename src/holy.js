import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { addKnockable } from './physics.js';

// ===== The Holy Mountain =====
// A driveable mountain in the far-NW field (north of the shops row at z=64,
// west of the mega ramp at x=0, past the north train straight at z=84). It is
// a truncated cone you can drive right up: the slope rises from its base
// (radius) to a flat snowy summit plateau, and main.js mirrors the surface in
// mountainHeightAt() so the car rides it like a ramp (but never launches).
// On the flat snowy summit sits a guru in a wide-brimmed white hat, with a goat
// on either side of him, all facing the town — you drive all the way to the
// top to reach them.
const mountain = { x: -58, z: 104, radius: 18, plateau: 5, height: 22 };

// Height of the mountain surface above ground level (0 at the base, full
// `height` on the summit plateau) at a world point. main.js adds groundHeight
// to this when placing the car. Keep in sync with the mesh below.
export function mountainHeightAt(px, pz) {
  const r = Math.hypot(px - mountain.x, pz - mountain.z);
  if (r >= mountain.radius) return 0;
  if (r <= mountain.plateau) return mountain.height;
  return (mountain.height * (mountain.radius - r)) / (mountain.radius - mountain.plateau);
}

export function addHolyMountain(scene) {
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6e6559, roughness: 1 });
  const rockDarkMat = new THREE.MeshStandardMaterial({ color: 0x524a40, roughness: 1 });
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xeef3f7, roughness: 0.7 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xb8b5ad, roughness: 0.9 });
  const robeMat = new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.9 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xe8b98a, roughness: 0.8 });
  const hatMat = new THREE.MeshStandardMaterial({ color: 0xf5f2ea, roughness: 0.6 });
  const goatMatA = new THREE.MeshStandardMaterial({ color: 0xeae4da, roughness: 0.9 });
  const goatMatB = new THREE.MeshStandardMaterial({ color: 0x9c7a54, roughness: 0.9 });
  const hornMat = new THREE.MeshStandardMaterial({ color: 0xefe8d8, roughness: 0.6 });

  // --- Mountain body: truncated cone (base radius -> summit plateau) ---
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(mountain.plateau, mountain.radius, mountain.height, 28),
    rockMat
  );
  body.position.set(mountain.x, mountain.height / 2, mountain.z);
  body.receiveShadow = true;
  body.castShadow = true;
  scene.add(body);

  // Snow crown on the summit (thin disc — still drivable across).
  const snow = new THREE.Mesh(new THREE.CylinderGeometry(mountain.plateau, mountain.plateau, 0.25, 28), snowMat);
  snow.position.set(mountain.x, mountain.height, mountain.z);   // sinks a little into the plateau top
  snow.receiveShadow = true;
  scene.add(snow);

  // A few rocky outcroppings around the base for texture.
  const boulders = [
    [-45, 90], [-40, 104], [-76, 104], [-72, 118], [-44, 119],
  ];
  for (const [bx, bz] of boulders) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), rockDarkMat);
    b.position.set(bx, 0.5, bz);
    b.scale.set(1, 0.7 + Math.random() * 0.4, 1);
    b.rotation.y = Math.random() * Math.PI;
    b.castShadow = true;
    scene.add(b);
  }

  // --- The guru: a man in a wide-brimmed WHITE hat, seated on a stone dais,
  // on the summit plateau, facing the town (-Z) ---
  const guru = new THREE.Group();
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.72, 0.42, 14), stoneMat);
  dais.position.y = 0.21;
  dais.castShadow = true;
  guru.add(dais);
  const robe = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.62, 0.62), robeMat);
  robe.position.y = 0.8;
  robe.castShadow = true;
  guru.add(robe);
  const lap = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.5), robeMat); // folded hands
  lap.position.set(0, 0.86, 0.34);
  guru.add(lap);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), skinMat);
  head.position.y = 1.28;
  head.castShadow = true;
  guru.add(head);
  const face = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.2, 0.06), skinMat);
  face.position.set(0, 1.25, 0.17);
  guru.add(face);
  const beard = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.13, 0.05), hatMat);
  beard.position.set(0, 1.08, 0.17);
  guru.add(beard);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.06, 18), hatMat);
  brim.position.y = 1.32;
  brim.castShadow = true;
  guru.add(brim);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.36, 14), hatMat);
  crown.position.y = 1.53;
  crown.castShadow = true;
  guru.add(crown);
  guru.position.set(mountain.x, mountain.height + 0.15, mountain.z);   // on the summit
  guru.rotation.y = Math.PI;                              // face the town (-Z)
  scene.add(guru);
  addKnockable(guru, 1.1, { mode: 'wobble', wobbleAmp: 0.4 });

  // --- Two goats flanking the guru, one on each side ---
  function makeGoat(mat, x) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.46, 0.72), mat);
    body.position.y = 0.58;
    body.castShadow = true;
    g.add(body);
    for (const [lx, lz] of [[-0.14, -0.26], [0.14, -0.26], [-0.14, 0.26], [0.14, 0.26]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.5, 0.09), mat);
      leg.position.set(lx, 0.25, lz);
      leg.castShadow = true;
      g.add(leg);
    }
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.24), mat);
    head.position.set(0, 0.84, 0.42);
    head.castShadow = true;
    g.add(head);
    for (const [hx, hz] of [[-0.09, 0.4], [0.09, 0.4]]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.26, 8), hornMat);
      horn.position.set(hx, 1.0, hz);
      horn.rotation.x = -0.5;
      g.add(horn);
    }
    const beard = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.11, 0.06), hornMat);
    beard.position.set(0, 0.68, 0.52);
    g.add(beard);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.16), mat);
    tail.position.set(0, 0.66, -0.45);
    tail.rotation.x = 0.4;
    g.add(tail);
    g.position.set(x, mountain.height + 0.15, mountain.z);
    g.rotation.y = Math.PI;                               // face the town (-Z)
    scene.add(g);
    addKnockable(g, 0.8, { mode: 'wobble', wobbleAmp: 0.4 });
  }
  makeGoat(goatMatA, mountain.x - 1.9);
  makeGoat(goatMatB, mountain.x + 1.9);

  return { config: mountain };
}
