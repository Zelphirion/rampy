import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import {
  BEACH_SANDCASTLE, SAND_PILE_R, sandPileProfileAt, setSandPile, beachGroundOffsetAt,
} from './layout.js?v=1800000000000';

// ===== The sand castle =====
//
// The landmark in the corner of the cove diagonally opposite the giant scallop:
// a full castle the car can drive straight into. It has NO collider of its own,
// so nothing here can ever wedge the car. Two gates face each other into a
// straight, open arch the car drives through clean; bump a wall, a tower or the
// keep instead and the castle caves in on itself and comes down in a heap.
//
// The wreck is not a special surface either. It is a low, wide mound described by
// layout.js's sandPileProfileAt, and the level folds that same mound into the
// drivable height once the walls are down - so the heap the player sees and the
// ground the car rides are one and the same, and the car simply drives out the
// other side.
const SAND_COLOR = 0xd8bd86;
const SAND_DARK = 0xbfa267;
const SAND_INNER = 0xb4955a;   // window recesses and gate shadows

// ---- The castle's own dimensions (local, keep at the origin) ----
const WALL_HALF = 7.0;    // the curtain wall ring
const WALL_H = 7.2;
const WALL_T = 1.3;
const TOWER_R = 2.35;
const TOWER_H = 12.5;
const GATE_HALF = 4.5;    // half-width of the gate opening (a car drives in clean)
const GATE_TOP = 6.6;     // apex of the arch; the solid lintel sits above it
const GATE_SPRING = GATE_TOP - GATE_HALF;   // where the arch leaves the jambs
const KEEP_R = 1.9;       // the keep's base radius
const KEEP_Z = 4.9;       // set back so the gate corridor (z = 0) clears it
const KEEP_H = 15;
const WALL_SEG_HALF = (WALL_HALF - GATE_HALF) / 2;   // half-length of each jamb run
const WALL_SEG_MID = (WALL_HALF + GATE_HALF) / 2;    // centre of each jamb run

// The solid footprint of the standing castle, in castle-local XZ. The car is
// only knocked into the castle when it actually contacts one of these - the
// keep, a tower, a wall run - and NOT merely by driving into the courtyard
// through the arch. Rectangles are [centreX, centreZ, halfW(x), halfD(z)].
const SOLID_RECTS = [
  // East and west curtain walls, either side of the gate gap.
  [WALL_HALF, WALL_SEG_MID, WALL_T / 2, WALL_SEG_HALF],
  [WALL_HALF, -WALL_SEG_MID, WALL_T / 2, WALL_SEG_HALF],
  [-WALL_HALF, WALL_SEG_MID, WALL_T / 2, WALL_SEG_HALF],
  [-WALL_HALF, -WALL_SEG_MID, WALL_T / 2, WALL_SEG_HALF],
  // North and south curtain walls (solid all the way across).
  [0, WALL_HALF, WALL_HALF, WALL_T / 2],
  [0, -WALL_HALF, WALL_HALF, WALL_T / 2],
];
// Discs: the four corner turrets and the keep. [centreX, centreZ, radius].
const SOLID_DISCS = [
  [WALL_HALF, WALL_HALF, TOWER_R], [-WALL_HALF, WALL_HALF, TOWER_R],
  [WALL_HALF, -WALL_HALF, TOWER_R], [-WALL_HALF, -WALL_HALF, TOWER_R],
  [0, KEEP_Z, KEEP_R],
];

// Circle-vs-axis-aligned-box overlap.
function boxHits(dx, dz, hw, hd, r) {
  const qx = Math.max(Math.abs(dx) - hw, 0);
  const qz = Math.max(Math.abs(dz) - hd, 0);
  return qx * qx + qz * qz <= r * r;
}

// Does a car disc at world (px, pz) of radius r touch any solid part of the
// standing castle? A little reach past the surface (BUMP_MARGIN) so a resting
// contact - the car stopped hard against a wall - still reads as the hit.
const BUMP_MARGIN = 0.12;
function bumpsCastle(px, pz, r) {
  const lx = px - BEACH_SANDCASTLE.x;
  const lz = pz - BEACH_SANDCASTLE.z;
  const reach = r + BUMP_MARGIN;
  for (const [cx, cz, hw, hd] of SOLID_RECTS) {
    if (boxHits(lx - cx, lz - cz, hw, hd, reach)) return true;
  }
  for (const [cx, cz, cr] of SOLID_DISCS) {
    if (Math.hypot(lx - cx, lz - cz) < cr + reach) return true;
  }
  return false;
}

// A tiny deterministic RNG. This file, like the rest of the level, avoids
// Math.random so a build is reproducible run to run.
let seed = 7;
const rnd = () => {
  seed = (seed * 48271) % 2147483647;
  return seed / 2147483647;
};

function box(g, mat, w, h, d, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}

// A crenellated band of little blocks around a circle - a turret crown.
function crenellateCircle(g, mat, cx, cz, r, y, n = 10) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    box(g, mat, 0.85, 1.15, 0.85, cx + Math.cos(a) * r, y, cz + Math.sin(a) * r);
  }
}

// One curtain wall down one side, with a gate cut where `gateAt` is within
// `GATE_HALF` of zero. Piers carry the wall either side of the opening and a
// lintel bridges it, which is what makes the hole read as a gateway rather than
// a gap. `axis` is 'x' for a wall running along z (fixed x) and vice versa.
function curtainWall(g, mat, dark, axis, fixed, gate) {
  const half = WALL_HALF;
  const segs = gate ? [[-half, -GATE_HALF], [GATE_HALF, half]] : [[-half, half]];
  for (const [a, b] of segs) {
    const len = b - a;
    if (len <= 0.001) continue;
    const mid = (a + b) / 2;
    if (axis === 'x') box(g, mat, WALL_T, WALL_H, len, fixed, WALL_H / 2, mid);
    else box(g, mat, len, WALL_H, WALL_T, mid, WALL_H / 2, fixed);
  }
  if (gate) {
    // The gateway is a GENUINE opening: a semicircular arch of corbelled blocks
    // springs from the jambs and closes just under a solid lintel. There is no
    // filler in the doorway, so the car drives through empty air - which is the
    // whole point. Previously a dark panel filled the gap, so the "gate" was a
    // wall you clipped straight through.
    const rows = 6;
    for (let r = 0; r < rows; r++) {
      const y0 = GATE_SPRING + (r / rows) * GATE_HALF;
      const y1 = GATE_SPRING + ((r + 1) / rows) * GATE_HALF;
      // Opening half-width at the TOP of the band (its narrowest) so the blocks
      // never intrude on the clear opening below them.
      const dy = Math.min(GATE_HALF, y1 - GATE_SPRING);
      const openHalf = Math.sqrt(Math.max(0, GATE_HALF * GATE_HALF - dy * dy));
      const fill = GATE_HALF - openHalf;
      if (fill <= 0.02) continue;
      for (const sgn of [1, -1]) {
        const cz = sgn * (GATE_HALF + openHalf) / 2;
        if (axis === 'x') box(g, mat, WALL_T, y1 - y0, fill, fixed, (y0 + y1) / 2, cz);
        else box(g, mat, fill, y1 - y0, WALL_T, cz, (y0 + y1) / 2, fixed);
      }
    }
    // The solid lintel above the apex, with a dark shadow line under it.
    if (axis === 'x') {
      box(g, mat, WALL_T, WALL_H - GATE_TOP, GATE_HALF * 2, fixed, (WALL_H + GATE_TOP) / 2, 0);
      box(g, dark, WALL_T * 0.7, 0.24, GATE_HALF * 2 * 0.9, fixed, GATE_TOP - 0.14, 0);
    } else {
      box(g, mat, GATE_HALF * 2, WALL_H - GATE_TOP, WALL_T, 0, (WALL_H + GATE_TOP) / 2, fixed);
      box(g, dark, GATE_HALF * 2 * 0.9, 0.24, WALL_T * 0.7, 0, GATE_TOP - 0.14, fixed);
    }
  }
  // The crenellated crown along the top, skipping the gate span.
  const crownN = 8;
  if (axis === 'x') {
    for (let i = 0; i <= crownN; i++) {
      const z = -half + (i / crownN) * 2 * half;
      if (gate && Math.abs(z) < GATE_HALF - 0.2) continue;
      box(g, mat, 0.8, 1.1, 0.8, fixed, WALL_H + 0.55, z);
    }
  } else {
    for (let i = 0; i <= crownN; i++) {
      const x = -half + (i / crownN) * 2 * half;
      if (gate && Math.abs(x) < GATE_HALF - 0.2) continue;
      box(g, mat, 0.8, 1.1, 0.8, x, WALL_H + 0.55, fixed);
    }
  }
}

// The standing castle geometry, built from whatever three materials are handed
// in. Exported so the mermaids' undersea castle can be the SAME model in a
// different palette instead of a second, drifting copy of these dimensions.
export function buildStanding(mat, dark, inner) {
  const g = new THREE.Group();

  // The ring of curtain wall. Gates on the east (the car's approach) and west,
  // aligned into a straight drive-through corridor.
  curtainWall(g, mat, inner, 'x', WALL_HALF, true);    // east
  curtainWall(g, mat, inner, 'x', -WALL_HALF, true);   // west
  curtainWall(g, mat, inner, 'z', WALL_HALF, false);   // north
  curtainWall(g, mat, inner, 'z', -WALL_HALF, false);  // south

  // Four corner turrets, taller than the wall, with crenellated crowns.
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      const cx = sx * WALL_HALF, cz = sz * WALL_HALF;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(TOWER_R * 0.82, TOWER_R, TOWER_H, 12), mat);
      t.position.set(cx, TOWER_H / 2, cz);
      t.castShadow = true;
      t.receiveShadow = true;
      g.add(t);
      crenellateCircle(g, mat, cx, cz, TOWER_R * 0.9, TOWER_H + 0.4);
      // A window slit facing out of the cove.
      box(g, inner, 0.7, 2.2, 0.7, cx + sx * (TOWER_R - 0.1), 6.5, cz);
    }
  }

  // The keep: a stout round tower set back off the drive-through line so the car
  // threads past it, with a battlemented crown and a little pennant.
  const keep = new THREE.Mesh(new THREE.CylinderGeometry(KEEP_R * 0.72, KEEP_R, KEEP_H, 14), mat);
  keep.position.set(0, KEEP_H / 2, KEEP_Z);
  keep.castShadow = true;
  keep.receiveShadow = true;
  g.add(keep);
  crenellateCircle(g, mat, 0, KEEP_Z, KEEP_R * 0.82, KEEP_H + 0.45, 12);
  for (let i = 0; i < 3; i++) {
    const a = -0.9 + i * 0.9;
    box(g, inner, 0.6, 1.8, 0.6, Math.sin(a) * KEEP_R, 11.5 - i * 2.4, KEEP_Z + Math.cos(a) * KEEP_R);
  }
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.2, 6), dark);
  pole.position.set(0, KEEP_H + 2.4, KEEP_Z);
  g.add(pole);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(2.0, 1.2),
    new THREE.MeshStandardMaterial({ color: 0xe8695a, roughness: 0.8, side: THREE.DoubleSide }),
  );
  flag.position.set(1.05, KEEP_H + 3.6, KEEP_Z);
  flag.castShadow = true;
  g.add(flag);

  // Window slits punched into the three solid sides of the curtain wall, so the
  // castle reads as something with an inside even from across the sand.
  for (const [x, z] of [[-3.6, WALL_HALF], [3.6, WALL_HALF], [-3.6, -WALL_HALF], [3.6, -WALL_HALF]]) {
    box(g, inner, 0.9, 2.4, 0.55, x, 4.2, z);
  }

  // Every mesh that makes up the standing castle, so the collapse can sink each
  // piece inward on its own instead of swapping the whole thing for a heap.
  const pieces = [];
  g.traverse((o) => { if (o.isMesh) pieces.push(o); });
  // The pole and its pennant are handed back separately so a caller that wants
  // the castle WITHOUT a flag (the mermaids' drowned copy) can drop them both.
  return { group: g, pieces, flagParts: [pole, flag] };
}

// A dome mesh walked from the SAME profile the car will ride, so the visible
// heap and the drivable mound cannot drift apart. The profile returns an offset
// above the sand, so the group is already seated on the sand (see buildSandcastle)
// and the heap carries no lift of its own.
function buildHeap() {
  const g = new THREE.Group();
  const RINGS = 9;
  const SEG = 44;
  const pos = [];
  const push = (lx, lz) => {
    pos.push(lx, sandPileProfileAt(BEACH_SANDCASTLE.x + lx, BEACH_SANDCASTLE.z + lz), lz);
  };
  for (let ri = 0; ri < RINGS; ri++) {
    const r0 = (ri / RINGS) * SAND_PILE_R;
    const r1 = ((ri + 1) / RINGS) * SAND_PILE_R;
    for (let s = 0; s < SEG; s++) {
      const a0 = (s / SEG) * Math.PI * 2;
      const a1 = ((s + 1) / SEG) * Math.PI * 2;
      // Two triangles per quad, wound counter-clockwise from above so their
      // normals face up and the heap lights like the sand around it.
      const p0 = [Math.cos(a0) * r0, Math.sin(a0) * r0];
      const p1 = [Math.cos(a1) * r0, Math.sin(a1) * r0];
      const p2 = [Math.cos(a1) * r1, Math.sin(a1) * r1];
      const p3 = [Math.cos(a0) * r1, Math.sin(a0) * r1];
      push(...p0); push(...p1); push(...p2);
      push(...p0); push(...p2); push(...p3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: SAND_COLOR, roughness: 1, flatShading: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  g.add(mesh);

  // A scatter of lumps and toppled blocks on top, so the heap reads as rubble
  // rather than a smooth dune.
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2;
    const r = rnd() * SAND_PILE_R * 0.85;
    const lx = Math.cos(a) * r;
    const lz = Math.sin(a) * r;
    const s = 0.5 + rnd() * 1.1;
    const lump = new THREE.Mesh(
      new THREE.DodecahedronGeometry(s, 0),
      new THREE.MeshStandardMaterial({ color: rnd() > 0.5 ? SAND_COLOR : SAND_DARK, roughness: 1, flatShading: true }),
    );
    lump.position.set(lx, sandPileProfileAt(BEACH_SANDCASTLE.x + lx, BEACH_SANDCASTLE.z + lz) + s * 0.25, lz);
    lump.scale.y = 0.7;
    lump.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    lump.castShadow = true;
    g.add(lump);
  }
  g.visible = false;
  return g;
}

// ===== Flying sand =====
// A fixed pool of soft sprites, re-used forever. A hard collapse throws a big
// cloud up all at once, then the heap keeps shedding a light flurry for minutes.
const SAND_SPRITE_MAX = 340;
const SAND_FLURRY_TIME = 150;   // seconds of drifting sand after the collapse
const SHAKE_TIME = 0.42;        // the whole castle judders just before it goes
const COLLAPSE_TIME = 1.85;     // seconds the walls take to topple in on themselves (a little slower, so the fall reads)
const REVEAL_AT = 0.9;          // fraction of the fall before the heap shows
// The car is tall and narrow (half-width ~0.9) but its collision disc is fat.
// Testing the castle's solid footprint against the fat disc would trip the
// collapse while the car is still a car's-width clear of the masonry - and, in
// particular, would wall off the (now wide) gateway. Test against a radius close
// to the real body instead, so only an actual BUMP brings the castle down and
// the arch is genuinely drivable.
const BUMP_R = 1.7;
const sandTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(233,214,168,0.95)');
  grad.addColorStop(0.55, 'rgba(214,190,138,0.6)');
  grad.addColorStop(1, 'rgba(200,175,120,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
})();

function makeSandPool(group) {
  const pool = [];
  for (let i = 0; i < SAND_SPRITE_MAX; i++) {
    const mat = new THREE.SpriteMaterial({ map: sandTex, transparent: true, depthWrite: false, opacity: 0 });
    const s = new THREE.Sprite(mat);
    s.visible = false;
    group.add(s);
    pool.push({ sprite: s, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1 });
  }
  return pool;
}

export function buildSandcastle(base) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: SAND_COLOR, roughness: 1, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: SAND_DARK, roughness: 1, flatShading: true });
  const inner = new THREE.MeshStandardMaterial({ color: SAND_INNER, roughness: 1 });

  const standRes = buildStanding(mat, dark, inner);
  const stand = standRes.group;
  const standPieces = standRes.pieces;
  group.add(stand);
  const heap = buildHeap();
  group.add(heap);

  // The castle is seated ON the sand, not at the world datum, so its foot sits
  // in the surface the car rides. The wreck, when it comes, is the same mound
  // the level folds into that surface.
  group.position.set(BEACH_SANDCASTLE.x, base + beachGroundOffsetAt(BEACH_SANDCASTLE.x, BEACH_SANDCASTLE.z), BEACH_SANDCASTLE.z);

  const pool = makeSandPool(group);
  let seq = 0;
  let flurryLeft = 0;
  let burstLeft = 0;
  let burstAcc = 0;
  let collapsed = false;
  let justCollapsed = false;
  // The fall. `collapseT` is < 0 until the car lands a hit, then counts up to
  // COLLAPSE_TIME while the walls sink in; `revealed` flips once the heap is up.
  let collapseT = -1;
  let revealed = false;
  let pieceAnim = null;

  const spawn = (cx, cy, cz, speed) => {
    const p = pool[seq % SAND_SPRITE_MAX];
    seq++;
    p.sprite.visible = true;
    p.sprite.position.set(cx, cy, cz);
    const a = rnd() * Math.PI * 2;
    const out = 0.4 + rnd() * 1.0;
    p.vx = Math.cos(a) * out * speed;
    p.vz = Math.sin(a) * out * speed;
    p.vy = (0.8 + rnd() * 1.6) * speed;
    p.maxLife = 1.1 + rnd() * 1.6;
    p.life = p.maxLife;
    const s = 0.5 + rnd() * 0.9;
    p.sprite.scale.set(s, s, 1);
    p.sprite.material.opacity = 0.9;
  };

  // Plan each standing piece's inward fall once, at the moment of the hit. Every
  // piece is dragged toward the centre of the castle, drops to the sand and
  // tumbles as it goes - a wall folding in on itself, not a slab that vanishes
  // into a heap. A per-piece delay staggers the collapse so it crumbles from the
  // impact outward instead of moving in one rigid step.
  const planCollapse = () => {
    pieceAnim = standPieces.map((m) => {
      const p = m.position;
      const len = Math.hypot(p.x, p.z) || 1;
      const inx = p.x / len, inz = p.z / len;   // unit direction toward the centre
      const pull = Math.min(len, WALL_HALF) * 0.9;
      return {
        m,
        from: p.clone(),
        fromQ: m.quaternion.clone(),
        to: new THREE.Vector3(
          p.x - inx * pull,
          Math.max(0.12, p.y * 0.14),
          p.z - inz * pull,
        ),
        // Fold over toward the centre and roll a random way, so no two blocks
        // land the same and the wreck reads as rubble.
        toQ: m.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(
          new THREE.Euler((rnd() - 0.5) * 2.0, (rnd() - 0.5) * 1.2, (rnd() - 0.5) * 2.0),
        )),
        delay: rnd() * 0.25,
      };
    });
  };

  const update = (delta, carPos, carR) => {
    // The castle only comes down on a real BUMP against a wall, a tower or the
    // keep - never by simply driving in through the open arch.
    if (collapseT < 0 && !collapsed && carPos &&
        bumpsCastle(carPos.x, carPos.z, BUMP_R)) {
      collapseT = 0;
      justCollapsed = true;
      planCollapse();
      // A first, small puff right at the point of impact.
      for (let i = 0; i < 8; i++) {
        const a = rnd() * Math.PI * 2;
        const r = rnd() * 1.6;
        spawn(Math.cos(a) * r, 0.5 + rnd() * 1.4, Math.sin(a) * r, 1.4);
      }
    }

    // The walls cave in on themselves. First the whole castle shudders in place
    // while the impact sinks in; then, piece by piece, the walls fold inward,
    // drop to the sand and tumble. Only once they are almost all down does the
    // heap underneath appear - so the player actually sees the castle collapse
    // rather than blink into a pile of sand.
    if (collapseT >= 0 && !revealed) {
      collapseT += delta;
      const shakeK = Math.min(1, collapseT / SHAKE_TIME);
      const collapseK = Math.max(0, (collapseT - SHAKE_TIME) / COLLAPSE_TIME);
      for (const a of pieceAnim) {
        const raw = (collapseK - a.delay) / (1 - a.delay);
        const t = Math.min(1, Math.max(0, raw));
        const e = t * t * (3 - 2 * t);   // smoothstep
        a.m.position.lerpVectors(a.from, a.to, e);
        // A judder that fades as the fall gets going, so the castle shudders on
        // the hit and then lets go.
        const shake = (1 - Math.min(1, collapseK * 2)) * shakeK * 0.16;
        a.m.position.x += Math.sin((collapseT + a.delay * 10) * 46) * shake;
        a.m.position.z += Math.cos((collapseT + a.delay * 10) * 39) * shake;
        a.m.quaternion.copy(a.fromQ).slerp(a.toQ, e);
      }
      // Sand kicks up out of the base as the walls come down, thickening as the
      // collapse builds.
      burstAcc += delta * 120 * collapseK;
      while (burstAcc >= 1) {
        burstAcc -= 1;
        const a = rnd() * Math.PI * 2;
        const r = rnd() * WALL_HALF;
        spawn(Math.cos(a) * r, 0.4 + rnd() * WALL_H * (1 - collapseK * 0.5), Math.sin(a) * r, 1.5);
      }
      if (collapseK >= REVEAL_AT) {
        revealed = true;
        collapsed = true;
        stand.visible = false;
        heap.visible = true;
        setSandPile(true);
        burstLeft = 1.4;
        flurryLeft = SAND_FLURRY_TIME;
      }
    }

    // Emit the big collapse cloud once the heap shows, then a long, thinning flurry.
    if (burstLeft > 0) {
      burstLeft -= delta;
      burstAcc += delta * 130;
      while (burstAcc >= 1) {
        burstAcc -= 1;
        const a = rnd() * Math.PI * 2;
        const r = rnd() * WALL_HALF;
        spawn(Math.cos(a) * r, 0.4 + rnd() * WALL_H * 0.8, Math.sin(a) * r, 1.9);
      }
    } else if (flurryLeft > 0) {
      flurryLeft -= delta;
      const rate = 9 * (flurryLeft / SAND_FLURRY_TIME) + 1.5;
      burstAcc += delta * rate;
      while (burstAcc >= 1) {
        burstAcc -= 1;
        const a = rnd() * Math.PI * 2;
        const r = rnd() * SAND_PILE_R;
        spawn(Math.cos(a) * r, 0.4 + rnd() * 2.2, Math.sin(a) * r, 0.7);
      }
    }

    // Integrate the pool. Sand is heavier than ash: it arcs and falls.
    for (const p of pool) {
      if (!p.sprite.visible) continue;
      p.life -= delta;
      if (p.life <= 0) { p.sprite.visible = false; continue; }
      p.vy -= 5.2 * delta;
      p.vx *= 1 - 1.4 * delta;
      p.vz *= 1 - 1.4 * delta;
      p.sprite.position.x += p.vx * delta;
      p.sprite.position.y += p.vy * delta;
      p.sprite.position.z += p.vz * delta;
      if (p.sprite.position.y < 0.15) { p.sprite.position.y = 0.15; p.vy = 0; }
      p.sprite.material.opacity = 0.9 * (p.life / p.maxLife);
    }
  };

  return {
    group,
    update,
    get collapsed() { return collapsed; },
    // One-frame flag: main.js reads it to coat the car in sand this frame.
    get justCollapsed() { return justCollapsed; },
    consumeCollapse() {
      const hit = justCollapsed;
      justCollapsed = false;
      return hit;
    },
  };
}
