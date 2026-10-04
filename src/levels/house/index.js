// ============================================================================
// The House - a giant interior you drive into through the suburban garage.
//
// The floor plan, room rectangles and dimensions all live in ./layout.js (pure
// numbers, unit-tested). This file is the builder: it turns that plan into
// geometry. See layout.js for the plan diagram and why each number is what it
// is.
//
// Nothing wraps. The city and ramp worlds are toruses; this one is a closed box,
// and main.js turns the wrap off while worldState is 'house'.
// ============================================================================

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { HOUSE, ROOMS, HOUSE_START, HOUSE_EXIT, HOUSE_WALLS, CAT_SPOTS, FRONT_DOOR, MAP_ITEMS, DRIVE, FIREPLACE } from './layout.js';
import { addKnockable } from '../../physics.js';

// Re-exported so main.js (and anyone poking at the level) has one import site.
export { HOUSE, ROOMS, HOUSE_START, HOUSE_EXIT, HOUSE_WALLS, CAT_SPOTS, FRONT_DOOR, MAP_ITEMS, DRIVE, FIREPLACE };

// ============================================================================
// Materials
// ============================================================================
const MAT = {
  plaster:   new THREE.MeshStandardMaterial({ color: 0xf0e7d8, roughness: 0.92 }),
  plasterHi: new THREE.MeshStandardMaterial({ color: 0xfbf5ea, roughness: 0.9 }),
  trim:      new THREE.MeshStandardMaterial({ color: 0xfdfcf7, roughness: 0.6 }),
  wainscot:  new THREE.MeshStandardMaterial({ color: 0xe4dccb, roughness: 0.7 }),
  ceil:      new THREE.MeshStandardMaterial({ color: 0xf7f2e8, roughness: 0.95 }),

  // Floors. Planks run along the room's long axis, which is why each is a
  // separate material rather than one tiled texture.
  plank:     new THREE.MeshStandardMaterial({ color: 0xb98d5c, roughness: 0.72 }),
  plankDark: new THREE.MeshStandardMaterial({ color: 0x9c7247, roughness: 0.74 }),
  tile:      new THREE.MeshStandardMaterial({ color: 0xdad7cd, roughness: 0.55 }),
  tileDark:  new THREE.MeshStandardMaterial({ color: 0x8f9aa0, roughness: 0.6 }),
  concrete:  new THREE.MeshStandardMaterial({ color: 0x9b9c96, roughness: 0.95 }),
  concreteDark: new THREE.MeshStandardMaterial({ color: 0x6f716c, roughness: 0.95 }),

  wood:      new THREE.MeshStandardMaterial({ color: 0x8a6136, roughness: 0.7 }),
  woodDark:  new THREE.MeshStandardMaterial({ color: 0x5c3f24, roughness: 0.7 }),
  woodPale:  new THREE.MeshStandardMaterial({ color: 0xd8bb8c, roughness: 0.68 }),
  metal:     new THREE.MeshStandardMaterial({ color: 0xb9c0c7, roughness: 0.32, metalness: 0.75 }),
  metalDark: new THREE.MeshStandardMaterial({ color: 0x59606a, roughness: 0.45, metalness: 0.6 }),

  // Fabric + soft goods.
  sofa:      new THREE.MeshStandardMaterial({ color: 0x4a6f7a, roughness: 0.95 }),
  cushion:   new THREE.MeshStandardMaterial({ color: 0x6d97a2, roughness: 0.95 }),
  quilt:     new THREE.MeshStandardMaterial({ color: 0xc9584f, roughness: 0.95 }),
  quilt2:    new THREE.MeshStandardMaterial({ color: 0x4b6fa8, roughness: 0.95 }),
  sheet:     new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.95 }),
  rugLiving: new THREE.MeshStandardMaterial({ color: 0xb8563f, roughness: 0.98 }),
  rugBed:    new THREE.MeshStandardMaterial({ color: 0x8a7fa8, roughness: 0.98 }),
  rugHall:   new THREE.MeshStandardMaterial({ color: 0x5c7a52, roughness: 0.98 }),

  // Fittings.
  cabinet:   new THREE.MeshStandardMaterial({ color: 0x3f4a52, roughness: 0.6 }),
  counter:   new THREE.MeshStandardMaterial({ color: 0x40474f, roughness: 0.42 }),
  counterTop:new THREE.MeshStandardMaterial({ color: 0x2f343a, roughness: 0.3 }),
  porcelain: new THREE.MeshStandardMaterial({ color: 0xf2f5f7, roughness: 0.22 }),
  chrome:    new THREE.MeshStandardMaterial({ color: 0xdfe6ec, roughness: 0.12, metalness: 0.9 }),
  rubber:    new THREE.MeshStandardMaterial({ color: 0x1e1e20, roughness: 1 }),
  warning:   new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.6, emissive: 0x5a4400, emissiveIntensity: 0.5 }),
  glass:     new THREE.MeshStandardMaterial({
    color: 0xcfe6f2, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22,
    side: THREE.DoubleSide,
  }),
  mirror:    new THREE.MeshStandardMaterial({ color: 0xcfe0ea, roughness: 0.04, metalness: 0.85 }),
  tv:        new THREE.MeshStandardMaterial({ color: 0x101418, roughness: 0.18 }),
  tvOn:      new THREE.MeshStandardMaterial({ color: 0x2a4a6a, emissive: 0x1d3f5e, emissiveIntensity: 1.2, roughness: 0.2 }),
  plant:     new THREE.MeshStandardMaterial({ color: 0x3f7f42, roughness: 0.95 }),
  pot:       new THREE.MeshStandardMaterial({ color: 0xb56a44, roughness: 0.9 }),
  soil:      new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 1 }),
  paper:     new THREE.MeshStandardMaterial({ color: 0xf5f2e8, roughness: 0.9 }),
  // The front door. It is a dark bottle green with darker recessed panels, which
  // is the colour a front door is that has been shut and locked for years, and
  // it has to read as SHUT at a glance from across a 38-wide foyer.
  door:      new THREE.MeshStandardMaterial({ color: 0x2f4a3c, roughness: 0.55 }),
  doorDark:  new THREE.MeshStandardMaterial({ color: 0x22392e, roughness: 0.5 }),
  lockRed:   new THREE.MeshStandardMaterial({ color: 0xc03a2e, roughness: 0.4, metalness: 0.3 }),
  // Tool colours for the dark garage, so the pegboard reads as a row of
  // implements rather than one grey smear when the beckoning lamp catches it.
  signAmber: new THREE.MeshStandardMaterial({ color: 0xd8912a, roughness: 0.55 }),
  signGreen: new THREE.MeshStandardMaterial({ color: 0x3f7f52, roughness: 0.6 }),

  // Lights you can see the source of.
  bulb:      new THREE.MeshStandardMaterial({ color: 0xfff0c8, emissive: 0xffd487, emissiveIntensity: 2.6 }),
  // The fire itself. `coal` is a lump of burnt-out wood that is still glowing in
  // the middle, so it is nearly black where you see it and bright orange where it
  // is hot; `flame` is the hot part of the flame, which has no surface at all and
  // so reads best as emissive with a little transparency.
  coal:      new THREE.MeshStandardMaterial({ color: 0x2a1a14, emissive: 0xff4a10, emissiveIntensity: 2.2, roughness: 1 }),
  flame:     new THREE.MeshStandardMaterial({ color: 0xffb14a, emissive: 0xff8c1a, emissiveIntensity: 2.8, roughness: 1, transparent: true, opacity: 0.72, depthWrite: false }),
  flameCore: new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffd24a, emissiveIntensity: 3.2, roughness: 1, transparent: true, opacity: 0.8, depthWrite: false }),
  shade:     new THREE.MeshStandardMaterial({ color: 0xf6efdd, emissive: 0xffe6b0, emissiveIntensity: 0.5, roughness: 0.8 }),
  screen:    new THREE.MeshStandardMaterial({ color: 0x9fd4ff, emissive: 0x5aa8e0, emissiveIntensity: 1.1 }),

  // Outside, seen through the windows.
  grass:     new THREE.MeshStandardMaterial({ color: 0x59a343, roughness: 1 }),
  grassDark: new THREE.MeshStandardMaterial({ color: 0x3f7a30, roughness: 1 }),
  bush:      new THREE.MeshStandardMaterial({ color: 0x357a35, roughness: 1 }),
  bushLight: new THREE.MeshStandardMaterial({ color: 0x4c9a3f, roughness: 1 }),
  trunk:     new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 1 }),
  sky:       new THREE.MeshBasicMaterial({ color: 0x86c8ef, side: THREE.BackSide }),
  sun:       new THREE.MeshBasicMaterial({ color: 0xfff6d0, side: THREE.DoubleSide }),
};

// ============================================================================
// Small geometry helpers
// ============================================================================
function box(g, w, h, d, x, y, z, mat, cast = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = cast;
  g.add(m);
  return m;
}
function cyl(g, rt, rb, h, x, y, z, mat, seg = 14, cast = true) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = cast;
  g.add(m);
  return m;
}
function sph(g, r, x, y, z, mat, cast = true) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = cast;
  g.add(m);
  return m;
}
function cone(g, r, h, x, y, z, mat, seg = 12, cast = true) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = cast;
  g.add(m);
  return m;
}
function flat(g, w, d, x, y, z, mat) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  g.add(m);
  return m;
}
function vert(g, w, h, x, y, z, ry, mat) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.rotation.y = ry;
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

// ============================================================================
// Walls
// ============================================================================
// A wall with an optional doorway cut out of it, plus the colliders for the two
// solid pieces either side of the gap.
//
// `axis` is the way the wall RUNS: 'x' for a wall stretching along X (so it
// stands at a constant z), 'z' for one along Z. `at` is its centre on the other
// axis. The gap, if any, is { a0, a1, top } measured along the run — the pieces
// either side are what actually block driving, and the lintel above the gap
// deliberately gets no collider so you can drive under it.
// `meshOnly` draws the piece but pushes no collider at all. That is what the
// garage doorway's lintel needs: it has to exist so the wall does not run
// unbroken over the opening, but a collider up there would still be read as a
// wall across the exit, because house collision ignores height entirely.
function wall(g, C, axis, at, a0, a1, y0, y1, thick, mat, gap, meshOnly = false) {
    const put = (s0, s1, yy0, yy1, solid = true) => {
      if (s1 - s0 <= 0.01 || yy1 - yy0 <= 0.01) return;
      if (axis === 'x') box(g, s1 - s0, yy1 - yy0, thick, (s0 + s1) / 2, (yy0 + yy1) / 2, at, mat);
      else box(g, thick, yy1 - yy0, s1 - s0, at, (yy0 + yy1) / 2, (s0 + s1) / 2, mat);
      if (!solid || meshOnly) return;
    // One collider per solid piece. A piece that runs the full height still
    // gets one — indoors you are never above it, and a tall rect in the
    // anti-stuck list is exactly what you want against an interior wall.
    // `noRoof` matters more here than anywhere else: main.js decides whether
    // the car may drive over a collider from its height, and a 26-tall house
    // wall would otherwise be read as a rooftop you could simply drive along.
    C.push(axis === 'x'
      ? { x: (s0 + s1) / 2, z: at, halfW: (s1 - s0) / 2, halfD: thick / 2, h: yy1, noRoof: true }
      : { x: at, z: (s0 + s1) / 2, halfW: thick / 2, halfD: (s1 - s0) / 2, h: yy1, noRoof: true });
  };

  if (!gap) { put(a0, a1, y0, y1); return; }
  put(a0, gap.a0, y0, y1);
  put(gap.a1, a1, y0, y1);
  // Lintel over the opening. Mesh only — no collider. House collision is flat
  // and does not consider height, so a collider here would wall the doorway
  // shut and the car could never reach the rooms beyond.
  if (gap.top < y1) put(gap.a0, gap.a1, gap.top, y1, false);
  // Architrave round the opening, purely decorative.
  const t = 0.5;
  if (axis === 'x') {
    box(g, gap.a1 - gap.a0 + t * 2, t, thick + 0.3, (gap.a0 + gap.a1) / 2, gap.top + t / 2, at, MAT.trim);
    for (const a of [gap.a0, gap.a1]) box(g, t, gap.top, thick + 0.3, a, gap.top / 2, at, MAT.trim);
  } else {
    box(g, thick + 0.3, t, gap.a1 - gap.a0 + t * 2, at, gap.top + t / 2, (gap.a0 + gap.a1) / 2, MAT.trim);
    for (const a of [gap.a0, gap.a1]) box(g, thick + 0.3, gap.top, t, at, gap.top / 2, a, MAT.trim);
  }
}

// A window opening in a shell wall: a real hole (so you can see out), with a
// frame, mullions and glass. The sill and header keep the wall from looking
// sliced, and the collider is the full wall panel — indoors you are never
// driving through a window, and leaving it solid stops the anti-stuck pass from
// trying to squeeze the car through the glass.
function window_(g, C, axis, at, a0, a1, y0, y1, thick) {
  const mid = (a0 + a1) / 2, my = (y0 + y1) / 2;
  const w = a1 - a0, h = y1 - y0;
  if (axis === 'x') {
    box(g, w + 1.2, 0.7, thick + 0.4, mid, y0 - 0.35, at, MAT.trim);         // sill
    box(g, w + 1.2, 0.7, thick + 0.4, mid, y1 + 0.35, at, MAT.trim);         // header
    for (const a of [a0, a1]) box(g, 0.6, h, thick + 0.4, a, my, at, MAT.trim);
    box(g, 0.45, h, thick + 0.4, mid, my, at, MAT.trim);                     // mullion
    box(g, w, h, 0.18, mid, my, at, MAT.glass, false);
    C.push({ x: mid, z: at, halfW: w / 2, halfD: thick / 2, h: HOUSE.ceil, noRoof: true });
  } else {
    box(g, thick + 0.4, 0.7, w + 1.2, at, y0 - 0.35, mid, MAT.trim);
    box(g, thick + 0.4, 0.7, w + 1.2, at, y1 + 0.35, mid, MAT.trim);
    for (const a of [a0, a1]) box(g, thick + 0.4, h, 0.6, at, my, a, MAT.trim);
    box(g, thick + 0.4, h, 0.45, at, my, mid, MAT.trim);
    box(g, 0.18, h, w, at, my, mid, MAT.glass, false);
    C.push({ x: at, z: mid, halfW: thick / 2, halfD: w / 2, h: HOUSE.ceil, noRoof: true });
  }
}

// ============================================================================
// Furniture
// ============================================================================
// Every piece is deliberately a little oversized — a bed 9 long against a 4.3
// car is what makes the house read as giant rather than the car as broken.

function bed(g, x, z, w, d, ry, quiltMat) {
  const b = new THREE.Group();
  b.name = 'bed';
  b.position.set(x, 0, z);
  b.rotation.y = ry;
  // Frame + mattress + pillows, then the quilt thrown over the lower two thirds.
  box(b, w, 1.6, d, 0, 1.6, 0, MAT.woodDark);
  box(b, w - 0.5, 1.5, d - 0.5, 0, 3.1, 0, MAT.sheet);
  box(b, w - 0.4, 0.9, d * 0.62, 0, 4.3, d * 0.18, quiltMat);
  for (const s of [-1, 1]) box(b, w * 0.36, 1.0, 2.2, s * w * 0.24, 4.35, -d * 0.32, MAT.sheet);
  // Headboard.
  box(b, w + 0.8, 9, 0.7, 0, 4.5, -d / 2 - 0.3, MAT.wood);
  g.add(b);
  return b;
}

function sofa(g, x, z, ry) {
  const s = new THREE.Group();
  s.name = 'sofa';
  s.position.set(x, 0, z);
  s.rotation.y = ry;
  box(s, 14, 2.2, 5, 0, 2.6, 0, MAT.sofa);                 // base
  box(s, 14, 5, 1.6, 0, 5.4, -2.0, MAT.sofa);              // back
  for (const e of [-1, 1]) box(s, 1.6, 4, 5, e * 6.2, 4.6, 0, MAT.sofa);   // arms
  for (let i = 0; i < 3; i++) box(s, 4, 1.2, 3.6, -4.4 + i * 4.4, 4.2, 0.4, MAT.cushion);
  box(s, 2.6, 2.6, 0.8, 4.6, 5.6, -1.2, MAT.quilt2).rotation.z = 0.3;    // a cushion, tipped
  for (const e of [-1, 1]) for (const f of [-1, 1]) cyl(s, 0.3, 0.3, 1.2, e * 6.4, 0.6, f * 2.1, MAT.woodDark, 8);
  g.add(s);
  return s;
}

function table(g, x, z, w, d, h, ry, topMat) {
  const t = new THREE.Group();
  t.name = 'table';
  t.position.set(x, 0, z);
  t.rotation.y = ry;
  box(t, w, 0.7, d, 0, h, 0, topMat || MAT.wood);
  for (const e of [-1, 1]) for (const f of [-1, 1]) {
    box(t, 0.8, h - 0.35, 0.8, e * (w / 2 - 0.9), (h - 0.35) / 2, f * (d / 2 - 0.9), MAT.woodDark);
  }
  g.add(t);
  return t;
}

function chair(g, x, z, ry) {
  const c = new THREE.Group();
  c.name = 'chair';
  c.position.set(x, 0, z);
  c.rotation.y = ry;
  box(c, 3, 0.5, 3, 0, 2.6, 0, MAT.wood);
  box(c, 3, 4, 0.5, 0, 4.5, -1.3, MAT.wood);
  for (const e of [-1, 1]) for (const f of [-1, 1]) box(c, 0.4, 2.4, 0.4, e * 1.2, 1.2, f * 1.2, MAT.woodDark);
  g.add(c);
  return c;
}

function wardrobe(g, x, z, w, ry) {
  const b = new THREE.Group();
  b.name = 'wardrobe';
  b.position.set(x, 0, z);
  b.rotation.y = ry;
  box(b, w, 14, 3, 0, 7, 0, MAT.wood);
  for (const s of [-1, 1]) {
    box(b, w / 2 - 0.4, 12, 0.4, s * w / 4, 7, 1.6, MAT.woodDark);
    sph(b, 0.35, s * 0.7, 7.4, 1.9, MAT.metal, false);
  }
  box(b, w + 0.8, 0.8, 3.6, 0, 14.2, 0, MAT.woodDark);
  g.add(b);
  return b;
}

function shelfRack(g, x, z, len, ry, axis = 'x') {
  // A garment rail: two uprights, a bar, and clothes hanging off it. In the
  // walk-in closet this is the whole point of the room, so the hanging things
  // are varied enough to read as a wardrobe rather than a row of planks.
  const b = new THREE.Group();
  b.name = 'shelfRack';
  b.position.set(x, 0, z);
  b.rotation.y = ry;
  const along = axis === 'x';
  for (const s of [-1, 1]) {
    box(b, along ? 0.7 : 3, 12, along ? 3 : 0.7, along ? s * len / 2 : 0, 6, along ? 0 : s * len / 2, MAT.metalDark);
  }
  const bar = cyl(b, 0.35, 0.35, len, 0, 11, 0, MAT.chrome, 10);
  if (!along) bar.rotation.x = Math.PI / 2;
  const clothMats = [MAT.quilt, MAT.quilt2, MAT.sofa, MAT.cushion, MAT.paper];
  const n = Math.max(4, Math.floor(len / 2.2));
  for (let i = 0; i < n; i++) {
    const t = -len / 2 + 1.2 + i * ((len - 2.4) / (n - 1));
    box(b, 2.6, 8, 1.6, along ? t : 0, 7, along ? 0 : t, clothMats[i % clothMats.length]);
  }
  // A low shelf of boxes underneath, so the floor is not empty.
  box(b, along ? len : 2.4, 0.5, along ? 2.4 : len, 0, 2.2, 0, MAT.woodPale);
  for (let i = 0; i < Math.max(2, Math.floor(len / 5)); i++) {
    const t = -len / 2 + 3 + i * 5;
    box(b, 3, 3, 2.2, along ? t : 0, 3.9, along ? 0 : t, i % 2 ? MAT.woodDark : MAT.paper);
  }
  g.add(b);
  return b;
}

function counterRun(g, x, z, len, ry, axis = 'x', sink = false) {
  const b = new THREE.Group();
  b.name = 'counterRun';
  b.position.set(x, 0, z);
  b.rotation.y = ry;
  const L = axis === 'x' ? len : 2.6;
  const D = axis === 'x' ? 2.6 : len;
  box(b, L, 5, D, 0, 2.5, 0, MAT.cabinet);
  box(b, L + 0.5, 0.6, D + 0.5, 0, 5.3, 0, MAT.counterTop);
  // Door lines + handles, stepping along the length of the run.
  //
  // Both of these have to be measured against the run's LENGTH, and the position
  // has to go on whichever axis that length is. It used to step along L (which
  // is 2.6 for a z-run) and then place the door 15 units out along x — so on the
  // kitchen's west run every door line floated in mid-air beside the cabinets.
  const n = Math.max(2, Math.round(len / 5));
  const step = len / n;
  for (let i = 0; i < n; i++) {
    const t = -len / 2 + (i + 0.5) * step;
    // On the face of the run, not down its length: the x-run's doors go at
    // z = D/2, the z-run's at x = L/2. Putting the z-run's doors at D/2 threw
    // them 15 units out into the room beside the cabinets.
    box(b,
      axis === 'x' ? step - 0.4 : 0.3, 4, axis === 'x' ? 0.3 : step - 0.4,
      axis === 'x' ? t : L / 2, 2.6, axis === 'x' ? D / 2 : t,
      MAT.metalDark, false);
  }
    if (sink) {
    // Two bowl-shaped basins like in ramp world
    try {
      if (typeof window !== 'undefined') {
        if (!window.__HOUSE_SURFACES) window.__HOUSE_SURFACES = [];
        // Left basin
        window.__HOUSE_SURFACES.push({
          kind: 'bowl',
          x: -1.75,
          z: 0,
          rx: 1.5,
          rz: 1.8,
          y: 5.8,
          depth: 1.8,
          steep: 0.9
        });
        // Right basin
        window.__HOUSE_SURFACES.push({
          kind: 'bowl',
          x: 1.75,
          z: 0,
          rx: 1.5,
          rz: 1.8,
          y: 5.8,
          depth: 1.8,
          steep: 0.9
        });
      }
    } catch (e) {}
    box(b, 7, 0.5, 4.4, 0, 5.45, 0, MAT.metal, false);
    cyl(b, 0.35, 0.35, 4, -3.2, 7.4, -1.4, MAT.chrome, 8);
    cyl(b, 0.28, 0.28, 1.8, -3.2, 9.2, -0.6, MAT.chrome, 8).rotation.x = Math.PI / 2.6;
    // Add knockable counter items
    try {
      const bread = box(b, 1, 0.3, 1.5, 2, 5.8, 0.5, MAT.wood, false);
      const dish = cyl(b, 0.8, 0.8, 0.2, -2, 5.8, 0.5, MAT.porcelain, 12, false);
      const fruit = sph(b, 0.4, 0, 5.8, 0.8, MAT.quilt2, false);
      const soap = box(b, 0.8, 0.4, 0.5, 0.5, 5.8, -0.5, MAT.plaster, false);
      addKnockable(bread, 0.8, { fallTime: 0.3 });
      addKnockable(dish, 0.9, { fallTime: 0.25 });
      addKnockable(fruit, 0.5, { fallTime: 0.2 });
      addKnockable(soap, 0.6, { fallTime: 0.2 });
    } catch (e) {}
  }
  g.add(b);
  return b;
}

// A piece of furniture that is not one of the helpers above — a hutch, a
// bookcase, a fireplace, a workbench — built straight out of `box()` calls.
//
// These used to be loose boxes added straight to the house group, which means
// the layout audit could not see them at all: a bookcase across a doorway was
// invisible, because the audit only looked at the things the furniture helpers
// returned. Putting the panels in a named group fixes that AND stops the audit
// reporting a cabinet's own shelves as furniture intersecting its own carcass.
//
// `x`/`z` is where the piece stands; everything inside is placed relative to
// that, exactly like the other helpers.
function unit(g, name, x, z) {
  const b = new THREE.Group();
  b.name = name;
  b.position.set(x, 0, z);
  g.add(b);
  return b;
}

function tub(g, x, z, ry) {
  const b = new THREE.Group();
  b.name = 'tub';
  b.position.set(x, 0, z);
  b.rotation.y = ry;
  box(b, 12, 5, 7, 0, 2.5, 0, MAT.porcelain);
  box(b, 10.4, 4, 5.4, 0, 4.2, 0, MAT.tile);          // the water, a little low
  box(b, 12.6, 0.6, 7.6, 0, 5.2, 0, MAT.porcelain);   // rim
  cyl(b, 0.3, 0.3, 2.6, 0, 6.4, -3.2, MAT.chrome, 8);
  cyl(b, 0.26, 0.26, 1.6, 0, 7.5, -2.6, MAT.chrome, 8).rotation.x = Math.PI / 2.4;
  g.add(b);
  return b;
}

function toilet(g, x, z, ry) {
  const b = new THREE.Group();
  b.name = 'toilet';
  b.position.set(x, 0, z);
  b.rotation.y = ry;
  box(b, 5, 2.4, 6.5, 0, 1.2, 0.4, MAT.porcelain);
  box(b, 4.2, 1.2, 4.6, 0, 2.7, 1.2, MAT.porcelain);
  box(b, 5, 8, 1.4, 0, 4, -2.9, MAT.porcelain);
  g.add(b);
  return b;
}

function sinkUnit(g, x, z, ry) {
  const b = new THREE.Group();
  b.name = 'sinkUnit';
  b.position.set(x, 0, z);
  b.rotation.y = ry;
  box(b, 6, 4, 2, 0, 2, 0, MAT.woodPale);
  box(b, 6.4, 0.5, 2.4, 0, 4.2, 0, MAT.counterTop);
  box(b, 4, 0.6, 1.6, 0, 4.4, 0, MAT.porcelain, false);
  cyl(b, 0.22, 0.22, 1.6, 0, 5.2, -0.6, MAT.chrome, 8);
  box(b, 7, 12, 0.4, 0, 6, -1.1, MAT.mirror, false);
  g.add(b);
  return b;
}

function fridge(g, x, z, ry) {
  const b = new THREE.Group();
  b.name = 'fridge';
  b.position.set(x, 0, z);
  b.rotation.y = ry;
  box(b, 7, 20, 6, 0, 10, 0, MAT.metal);
  box(b, 7.2, 0.4, 6.2, 0, 12, 0, MAT.metalDark);
  for (const s of [-1, 1]) box(b, 0.4, 3, 0.5, s * 2.4, 15, 3.1, MAT.metalDark, false);
  g.add(b);
  return b;
}

function stove(g, x, z, ry) {
  const b = new THREE.Group();
  b.name = 'stove';
  b.position.set(x, 0, z);
  b.rotation.y = ry;
  box(b, 7, 5, 5, 0, 2.5, 0, MAT.metalDark);
  box(b, 7.2, 0.4, 5.2, 0, 5.2, 0, MAT.counterTop);
  for (const e of [-1, 1]) for (const f of [-1, 1]) {
    cyl(b, 1.1, 1.1, 0.2, e * 1.6, 5.5, f * 1.1, MAT.metal, 10, false);
  }
  box(b, 6, 3, 0.4, 0, 3, 2.6, MAT.screen, false);
  g.add(b);
  return b;
}

function tvUnit(g, x, z, ry) {
  const b = new THREE.Group();
  b.name = 'tvUnit';
  b.position.set(x, 0, z);
  b.rotation.y = ry;
  box(b, 18, 3, 3, 0, 1.5, 0, MAT.wood);
  box(b, 20, 0.4, 3.6, 0, 3.1, 0, MAT.woodDark);
  box(b, 1.2, 5, 1.2, 0, 5.6, 0, MAT.metalDark);          // stand
  box(b, 17, 10, 0.8, 0, 12, 0, MAT.tv);
  box(b, 16, 9, 0.3, 0, 12, 0.5, MAT.tvOn, false);         // the picture
  g.add(b);
  return b;
}

function rug(g, x, z, w, d, mat) {
  return flat(g, w, d, x, 0.12, z, mat);
}

function pottedPlant(g, x, z, s = 1) {
  cyl(g, 2.4 * s, 1.8 * s, 3.4 * s, x, 1.7 * s, z, MAT.pot, 12);
  cyl(g, 2.1 * s, 2.1 * s, 0.4 * s, x, 3.4 * s, z, MAT.soil, 12, false);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const leaf = sph(g, 1.5 * s, x + Math.cos(a) * 1.5 * s, 4.6 * s + (i % 3) * 0.7 * s, z + Math.sin(a) * 1.5 * s, MAT.plant);
    leaf.scale.y = 1.5;
  }
  sph(g, 1.7 * s, x, 5.2 * s, z, MAT.plant).scale.y = 1.3;
}

// A ceiling fitting with a real light under it. `h` is the drop from the
// ceiling; the shade is emissive so the fitting itself reads as the source.
function ceilingLight(g, lights, x, z, h, intensity = 26, dist = 46) {
  cyl(g, 0.3, 0.3, h, x, HOUSE.ceil - h / 2, z, MAT.metalDark, 8, false);
  const s = cone(g, 2.6, 2.2, x, HOUSE.ceil - h - 1.1, z, MAT.shade, 14, false);
  s.rotation.x = Math.PI;   // shade opening downward, over the bulb
  sph(g, 1.0, x, HOUSE.ceil - h - 1.9, z, MAT.bulb, false);
  const L = new THREE.PointLight(0xffe6bb, intensity, dist, 2);
  L.position.set(x, HOUSE.ceil - h - 3.2, z);
  g.add(L);
  lights.push(L);
  return L;
}

function tableLamp(g, lights, x, y, z, intensity = 14) {
  cyl(g, 0.7, 1.1, 0.8, x, y + 0.4, z, MAT.woodDark, 10, false);
  cyl(g, 0.22, 0.22, 4, x, y + 2.4, z, MAT.metalDark, 8, false);
  cone(g, 1.9, 2.4, x, y + 5.4, z, MAT.shade, 12, false);
  sph(g, 0.7, x, y + 4.6, z, MAT.bulb, false);
  const L = new THREE.PointLight(0xffdca8, intensity, 26, 2);
  L.position.set(x, y + 4.6, z);
  g.add(L);
  lights.push(L);
  return L;
}

// ============================================================================
// Outside — only ever seen through the windows, so it is a painted set rather
// than a place you could drive in. A wide grass apron, a hedge line, a few
// trees and a bright sky, all well clear of the walls so the depth through a
// window reads correctly.
// ============================================================================
function buildOutside(g) {
  // Big grass apron, sunk slightly so the sill has something to sit above.
  flat(g, 900, 900, 0, -0.6, 0, MAT.grass);
  // A mown stripe pattern, which is what stops a huge flat green plane from
  // looking like a green plane.
  for (let i = -9; i <= 9; i++) {
    flat(g, 900, 16, 0, -0.55, i * 22, i % 2 ? MAT.grassDark : MAT.grass);
  }
  // Hedge ring just outside the walls on all four sides, broken by the driveway
  // where the roller door is: the hedge is 4.4 across and would otherwise stand
  // squarely across the exit run and stop the car on its way out of the yard.
  const hx = HOUSE.maxX + 12, hz0 = HOUSE.minZ - 12, hz1 = HOUSE.maxZ + 12;
  const onDrive = (z) => z > DRIVE.z0 - 6 && z < DRIVE.z1 + 6;
  for (let z = hz0; z <= hz1; z += 7) {
    for (const s of [-1, 1]) {
      if (s < 0 && onDrive(z)) continue;   // west side only
      const b = sph(g, 4.4, s * hx, 2.4, z, MAT.bush);
      b.scale.set(1, 0.85, 1.15);
    }
  }
  for (let x = HOUSE.minX - 12; x <= HOUSE.maxX + 12; x += 7) {
    for (const s of [-1, 1]) {
      const b = sph(g, 4.4, x, 2.4, s > 0 ? hz1 : hz0, MAT.bushLight);
      b.scale.set(1.15, 0.85, 1);
    }
  }
  // The driveway out of the roller door. This is not dressing - it is the last
  // thing the car is standing on before the cut back to the city, so it is a real
  // surface at floor height rather than a decal. It starts at the shell's outer
  // face and runs out past the hedge line, which is why the drive is also the one
  // place the grass apron does not show.
  const driveW = DRIVE.x1 - DRIVE.x0, driveD = DRIVE.z1 - DRIVE.z0;
  const driveCx = (DRIVE.x0 + DRIVE.x1) / 2, driveCz = (DRIVE.z0 + DRIVE.z1) / 2;
  flat(g, driveW, driveD, driveCx, -0.2, driveCz, MAT.concrete);
  // Tyre-worn tracks either side of the centreline, which is what stops a big
  // grey rectangle from reading as a big grey rectangle.
  for (const s of [-1, 1]) {
    flat(g, driveW - 3, 4.5, driveCx, -0.12, driveCz + s * 5.4, MAT.concreteDark);
  }
  // A kerb along each side, so the drive has edges and the grass sits behind it.
  for (const s of [-1, 1]) {
    const kz = driveCz + s * (driveD / 2 - 0.6);
    const k = box(g, driveW, 0.5, 1.2, driveCx, 0.1, kz, MAT.concreteDark);
    k.receiveShadow = true;
  }
  // Trees, scattered far enough out to read as a backdrop.
  const spots = [
    [-150, -60], [-190, 40], [-140, 150], [-60, 190], [60, 200], [150, 150],
    [190, 40], [160, -70], [120, -150], [-130, -150], [220, 120], [-220, 120],
  ];
  for (const [x, z] of spots) {
    cyl(g, 2.4, 3.4, 22, x, 11, z, MAT.trunk, 9);
    for (let i = 0; i < 4; i++) {
      const b = sph(g, 13 - i * 2.2, x, 24 + i * 7, z, i % 2 ? MAT.bush : MAT.bushLight);
      b.scale.y = 0.8;
    }
  }
  // The sun, a soft disc high in the south-east, plus a bright sky dome. The
  // dome is BackSide so it reads as sky from inside the house looking out.
  const dome = new THREE.Mesh(new THREE.SphereGeometry(600, 24, 16), MAT.sky);
  dome.position.y = 0;
  g.add(dome);
  const sun = new THREE.Mesh(new THREE.CircleGeometry(34, 24), MAT.sun);
  sun.position.set(300, 210, 260);
  sun.lookAt(0, 0, 0);
  g.add(sun);
}

// ============================================================================
// The level
// ============================================================================
export async function addHouse(parent, opts = {}) {
  const g = new THREE.Group();
  parent.add(g);
  const C = [];        // colliders
  const lights = [];  // PointLights, for :debug
  // The fire is built deep inside the living-room block but has to be reachable
  // from the return, so it is declared here and filled in down there. main.js
  // drives its flicker off the clock every frame.
  let fireplace = null;
  // NB: the shell thickness is `shellT`, not `wall`. There is a module-level
  // `function wall(...)` that builds the wall meshes, and destructuring it in
  // as `wall` would shadow that with a number — every wall() call below would
  // then be `3(...)`, which is a TypeError at build time, not a lint warning.
  const { minX, maxX, minZ, maxZ, ceil } = HOUSE;
  const shellT = HOUSE.wall;   // shell wall thickness
  const T = shellT;            // interior wall thickness (same as the shell)

  const phase = async (frac, label) => {
    if (typeof opts.onHousePhase === 'function') {
      try { opts.onHousePhase(frac, label); } catch (e) { /* progress is cosmetic */ }
    }
    await new Promise((res) => {
      if (window.requestAnimationFrame) window.requestAnimationFrame(() => window.requestAnimationFrame(res));
      else setTimeout(res, 0);
    });
  };

  // ---- Sky + light -------------------------------------------------------
  // The background is the sunny sky, so every window frames the same blue.
  g.add(new THREE.HemisphereLight(0xdff0ff, 0xb9a98c, 1.15));
  const sun = new THREE.DirectionalLight(0xfff2d4, 1.5);
  sun.position.set(160, 220, 180);
  g.add(sun);
  const bounce = new THREE.DirectionalLight(0xffe9c8, 0.35);
  bounce.position.set(-140, 60, -120);
  g.add(bounce);

  await phase(0.05, 'the view outside');

  // ---- Outside ------------------------------------------------------------
  buildOutside(g);

  await phase(0.2, 'the shell');

  // ---- Ceiling ------------------------------------------------------------
  // A soft slab, and a collider so the physics pass knows the roof is there.
  // `ceiling` keeps it out of the wall-blocking path (main.js checks that flag).
  // Kept as a reference so the top-down camera can hide it as a cutaway: its
  // normal points up, so from above the slab is opaque and would hide the house.
  const ceilingMesh = flat(g, (maxX - minX) + shellT * 2 + 8, (maxZ - minZ) + shellT * 2 + 8, 0, ceil, 0, MAT.ceil);
  C.push({ x: 0, z: (minZ + maxZ) / 2, halfW: (maxX - minX) / 2 + shellT, halfD: (maxZ - minZ) / 2 + shellT,
    h: ceil, ceiling: true, soft: true, noRoof: true });

  // ---- Shell walls, with the windows and the roller door cut out ---------
  // Each side is built as a run of panels between its openings. Panels are
  // colliders; the window gaps are glazing, which is glass you cannot drive
  // through, so each window also pushes a solid collider over its own span.
  //
  // There is exactly ONE opening in the entire shell, and it is the dark
  // garage's roller door on the west wall. The house used to have its only hole
  // in the east wall, right where the front door is, which meant a cat swat
  // could fire you through it onto the grass and a "closed" front door was
  // really a hole with a door drawn over it. The east wall is now continuous
  // masonry with a locked door drawn on the room side of it, and the only way
  // out of this building is 90 metres of dark garage away.
  const WIN_Y0 = 10, WIN_Y1 = 22;
  const OPEN_TOP = 4.6;   // clear height under the dark garage's roller door
  // `inward` is which way the room side faces, so the skirting can be pushed
  // onto the wall's inner face instead of being buried inside it.
  //
  // The DARK GARAGE gets no windows at all, on either of its two shell sides.
  // It is the way out of the house and it is meant to be pitch black in there;
  // a row of windows along the north and west would light it like a room and
  // take the whole effect away. The west side has the roller door instead.
  const shellWalls = [
    // East: bathroom, then the foyer with the locked front door. The door is
    // NOT an opening - see above - so this side is one unbroken wall.
    { axis: 'z', at: maxX + shellT / 2, a0: minZ - shellT, a1: maxZ + shellT, inward: -1,
      wins: [[-12, 2], [26, 40], [86, 95]] },
    // West: bedrooms and the living room, then the dark garage (z 46..94) with
    // no windows and the roller door in it.
    { axis: 'z', at: minX - shellT / 2, a0: minZ - shellT, a1: maxZ + shellT, inward: 1,
      wins: [[-78, -62], [-44, -28], [0, 16], [30, 44]],
      opening: { a0: HOUSE_EXIT.z0, a1: HOUSE_EXIT.z1 } },
    // North: dark garage (blank), kitchen, dining, foyer.
    { axis: 'x', at: maxZ + shellT / 2, a0: minX - shellT, a1: maxX + shellT, inward: -1,
      wins: [[-40, -24], [-8, 8], [22, 38], [62, 78]] },
    // South: both bedrooms, the walk-in and the main closet.
    { axis: 'x', at: minZ - shellT / 2, a0: minX - shellT, a1: maxX + shellT, inward: 1,
      wins: [[-80, -64], [-36, -20], [16, 32], [62, 78]] },
  ];
  for (const w of shellWalls) {
    // Windows and the roller door are walked in order and the wall is filled in
    // between them.
    const spans = w.wins.map((s) => ({ kind: 'win', a0: s[0], a1: s[1] }));
    if (w.opening) spans.push({ kind: 'open', a0: w.opening.a0, a1: w.opening.a1 });
    spans.sort((p, q) => p.a0 - q.a0);
    let cursor = w.a0;
    for (const s of spans) {
      if (s.a0 > cursor) wall(g, C, w.axis, w.at, cursor, s.a0, 0, ceil, shellT, MAT.plaster);
      if (s.kind === 'win') {
        window_(g, C, w.axis, w.at, s.a0, s.a1, WIN_Y0, WIN_Y1, shellT);
      } else {
        // The roller door's opening. A genuine hole this time - the car drives
        // out through it - so the wall either side is a real collider and the
        // lintel over the top is drawn mesh-only. House collision is flat and
        // ignores height, so a collider on that lintel would wall the door shut.
        wall(g, C, w.axis, w.at, s.a0, s.a1, OPEN_TOP, ceil, shellT, MAT.plaster, null, true);
      }
      cursor = s.a1;
    }
    if (cursor < w.a1) wall(g, C, w.axis, w.at, cursor, w.a1, 0, ceil, shellT, MAT.plaster);
    // Skirting all the way along the inner face, broken at the windows the same
    // way the wall is. Cheap, but it is the single detail that makes a big
    // plaster panel read as a room rather than a wall.
    const off = w.inward * (shellT / 2 + 0.3);
    const skirt = (s0, s1) => {
      if (s1 - s0 <= 0.01) return;
      if (w.axis === 'x') box(g, s1 - s0, 2.4, 0.6, (s0 + s1) / 2, 1.2, w.at + off, MAT.wainscot, false);
      else box(g, 0.6, 2.4, s1 - s0, w.at + off, 1.2, (s0 + s1) / 2, MAT.wainscot, false);
    };
    let sc = w.a0;
    for (const s of spans) { skirt(sc, s.a0); sc = s.a1; }
    skirt(sc, w.a1);
  }

  await phase(0.34, 'the floors');

  // ---- Floors -------------------------------------------------------------
  // Each room gets its own floor, which is how the material change under your
  // wheels tells you which room you have walked into.
  const floorOf = (r, mat) => flat(g, r.x1 - r.x0, r.z1 - r.z0, (r.x0 + r.x1) / 2, 0, (r.z0 + r.z1) / 2, mat);
  floorOf(ROOMS.darkGarage, MAT.concrete);
  floorOf(ROOMS.kitchen, MAT.tile);
  floorOf(ROOMS.dining, MAT.plank);
  floorOf(ROOMS.foyer, MAT.concrete);
  floorOf(ROOMS.living, MAT.plankDark);
  floorOf(ROOMS.hall, MAT.plank);
  floorOf(ROOMS.bathroom, MAT.tile);
  floorOf(ROOMS.bed1, MAT.plank);
  floorOf(ROOMS.bed2, MAT.plank);
  floorOf(ROOMS.walkin, MAT.plank);
  // A tiled border in the kitchen and bathroom so the floor is not one slab.
  for (const r of [ROOMS.kitchen, ROOMS.bathroom]) {
    for (let x = r.x0 + 3; x < r.x1; x += 6) {
      flat(g, 0.35, r.z1 - r.z0 - 6, x, 0.03, (r.z0 + r.z1) / 2, MAT.tileDark, false);
    }
  }
  // Rugs. The living room is enormous now, so its rug is enormous too — it is
  // what stops 90x60 of bare floorboards reading as a car park.
  rug(g, -50, 16, 74, 50, MAT.rugLiving);
  rug(g, 27, 70, 34, 26, MAT.rugLiving);
  rug(g, 70, 70, 22, 30, MAT.rugHall);
  rug(g, 22, 6, 30, 24, MAT.rugHall);
  rug(g, -68, -58, 34, 40, MAT.rugBed);
  rug(g, 28, -58, 34, 40, MAT.rugBed);
  rug(g, -20, -58, 30, 34, MAT.rugBed);

  await phase(0.44, 'the doors');

  // ---- Interior walls -----------------------------------------------------
  // One entry per room boundary. The run is the full extent of the two rooms
  // either side, so the wall closes the boundary completely apart from its
  // doorway, and the lintel over that doorway gets no collider so the car can
  // drive under it.
  for (const w of HOUSE_WALLS) {
    wall(g, C, w.axis, w.at, w.run0, w.run1, 0, ceil, T, MAT.plasterHi, w.gap || null);
  }

  // ---- The front door: SHUT, and locked ------------------------------------
  // This used to be a roller door wound open, with a hole cut in the east shell
  // and a trigger box in it. There is no hole and no trigger any more — the
  // house is a closed box, and this door is the visible proof of it. You can
  // stand in the foyer and look at a front door that is very obviously a front
  // door, with the deadbolt thrown, and there is nothing on the other side of
  // it but solid plaster.
  //
  // Everything here is decoration drawn on the room side of a wall that is
  // already solid. `box()`'s last argument is `cast`, not a collider flag, so
  // none of it blocks anything, and the shell panel behind it is one continuous
  // collider from the skirting to the ceiling. The only way out of this house
  // is the dark garage off the kitchen.
  {
    const f = FRONT_DOOR;
    const dw = f.z1 - f.z0, dc = (f.z0 + f.z1) / 2;
    // `face` is the room-side plane of the wall; everything hangs off that.
    const face = f.at - shellT / 2;          // the inner face, at maxX
    const leaf = face - 0.35;               // the door itself, proud of the plaster
    // Architrave round the opening, then the panelled leaf. Four panels, which
    // at this scale is what makes it read as a front door rather than a hatch.
    box(g, 0.7, f.h + 1.6, dw + 2.4, face - 0.2, (f.h + 1.6) / 2, dc, MAT.trim);
    box(g, 0.9, f.h, dw, leaf, f.h / 2, dc, MAT.door);
    for (const s of [-1, 1]) {
      box(g, 0.5, f.h + 1.2, 1.1, face - 0.3, (f.h + 1.2) / 2, dc + s * (dw / 2 + 0.4), MAT.trim, false);
    }
    for (let r = 0; r < 2; r++) {
      for (let c2 = 0; c2 < 2; c2++) {
        box(g, 0.4, f.h * 0.3, dw * 0.34, leaf - 0.35, f.h * (0.2 + r * 0.42), dc + (c2 - 0.5) * dw * 0.42,
          MAT.doorDark, false);
      }
    }
    // Fanlight over the door, glazed, so the light from outside stops there.
    box(g, 0.5, 5, dw * 0.8, leaf, f.h + 2.6, dc, MAT.glass, false);
    for (let i = 0; i < 4; i++) {
      box(g, 0.55, 5, 0.45, leaf - 0.1, f.h + 2.6, dc - dw * 0.3 + i * (dw * 0.2), MAT.trim, false);
    }
    // ---- The hardware, which is the whole point ---------------------------
    // A ring knocker high up, a letterbox, a knob, and then a row of things
    // that all say the same message in different ways: this door does not open.
    const knobX = leaf - 1.1;
    sph(g, 0.9, knobX, 9, dc - dw / 2 + 2.6, MAT.metal);
    box(g, 1.2, 2.4, 5.5, knobX, 9, dc + 2, MAT.metalDark, false);      // letterbox
    box(g, 0.5, 0.5, 5.5, knobX - 0.5, 11.4, dc + 2, MAT.metal, false);
    // Deadbolt: a big sliding bolt, thrown.
    box(g, 0.9, 1.6, 2.6, knobX - 0.3, 6, dc - dw / 2 + 2.6, MAT.metal, false);
    box(g, 0.6, 1.2, 1.4, knobX - 0.9, 6, dc - dw / 2 + 2.6, MAT.chrome, false);
    // Hasp and staple with a padlock hanging shut through them.
    box(g, 0.8, 1.2, 3.2, knobX - 0.3, 3.4, dc + dw / 2 - 2.6, MAT.metal, false);
    box(g, 1.1, 3.2, 1.1, knobX - 0.7, 2.4, dc + dw / 2 - 2.6, MAT.lockRed, false);
    // A security chain, drawn across the opening, permanently on.
    for (let i = 0; i < 7; i++) {
      box(g, 0.5, 0.5, 2.2, knobX - 0.4 - i * 0.35, 17.5 - i * 0.55,
        dc - dw / 2 + 2.6 + i * 2.4, MAT.metal, false);
    }
    // Outside face: a porch light over the door and a step, so the door has an
    // outside to be a door to.
    box(g, 2.2, 2.2, 2.2, f.at + shellT / 2 + 1.1, f.h + 3, dc, MAT.metalDark, false);
    sph(g, 0.7, f.at + shellT / 2 + 1.1, f.h + 1.7, dc, MAT.bulb, false);
    box(g, 4, 1.2, dw + 5, f.at + shellT / 2 + 2, 0.6, dc, MAT.counter, false);
    box(g, 6, 0.6, dw + 9, f.at + shellT / 2 + 4.5, 0.3, dc, MAT.concrete, false);
  }

  await phase(0.5, 'the kitchen');

  // ---- The roller door: the only way out ----------------------------------
  // Wound OPEN in its hood, in the west wall of the dark garage. It has to be
  // open, because this is the one hole in the building and the car goes out
  // through it; it is drawn high and dark because there is no light out there
  // to see it by. Everything here is decoration on the opening cut above - the
  // shell is what actually seals the sides of the hole, and the lintel over the
  // top is mesh-only so the car can pass under it.
  {
    const o = { a0: HOUSE_EXIT.z0, a1: HOUSE_EXIT.z1 };
    const ow = o.a1 - o.a0, oc = (o.a0 + o.a1) / 2;
    const ox = minX - shellT / 2;
    // A steel hood sitting proud of the plaster lintel.
    box(g, 1.6, 2.6, ow + 2.6, ox, OPEN_TOP + 1.3, oc, MAT.metalDark, false);
    // Guide rails down both sides of the opening, in the reveals.
    for (const s of [-1, 1]) {
      box(g, 0.5, OPEN_TOP, 0.5, ox + shellT / 2, OPEN_TOP / 2, oc + s * (ow / 2 - 0.1), MAT.metal, false);
    }
    // The coiled-up door: stacked slats in the hood, with the bottom one hanging
    // slightly proud the way a door does when it is not wound quite tight.
    for (let i = 0; i < 4; i++) {
      box(g, 1.2, 0.55, ow - 0.4, ox, OPEN_TOP - 0.4 + i * 0.6, oc,
        i % 2 ? MAT.metal : MAT.metalDark, false);
    }
    // Hazard tape on the threshold, because you drive over this one.
    box(g, 1.4, 0.12, ow, ox + shellT / 2 - 0.2, 0.06, oc, MAT.warning, false);
    // The control box and its lamp, on the wall beside the door at hand height.
    box(g, 1.4, 3, 2.4, ox + shellT / 2, 6, o.a1 + 4, MAT.metalDark, false);
    sph(g, 0.6, ox + shellT / 2 + 1.2, 6.4, o.a1 + 4, MAT.bulb, false);
  }

  // ---- Kitchen ------------------------------------------------------------
  // 52 x 48, which is four times the floor area of the old one. The run of
  // units is along the north wall and down the west end, and the island in the
  // middle is big enough to drive around, which is the point of all of it.
  {
    const r = ROOMS.kitchen;
    // Everything that stands on a wall in here stands FLUSH with it. A wall is
    // recorded by its centre line, so its inner face is 1.5 in from that, and
    // the old placements were measured off the centre line — which is how the
    // hutch ended up inside the plaster and the stove straddled the kitchen|living
    // opening instead of standing beside it.
    //
    // The kitchen's four walls and what is left of each:
    //   north shell  x -46..6     all of it, which is where the appliances go
    //   west  x=-46 z 47.5..62 and 82..94   (the garage doorway is z 62..82)
    //   east  x=6   z 47.5..54 and 84..94   (the dining opening is z 54..84)
    //   south z=46  x -44.5..-36 and -10..4.5 (the living opening is x -36..-10)
    //
    // The north face is the shell, whose inner face IS the room's z1, so there
    // is no half-thickness to allow for on that side — only on the interior
    // walls, which are recorded by their centre line.
    //
    // ---- North wall: the working run -------------------------------------
    // The fridge is 7.2 wide, so its west edge has to be clear of the west
    // wall's inner face at x=-44.5 — at -42 it was 1.1 inside the plaster.
    fridge(g, -40.5, 90.5, Math.PI);
    counterRun(g, -22, 92.45, 20, 0, 'x', true);
    stove(g, -4, 91.4, 0);
    // Add dark mouse hole in kitchen floor
    try {
      if (typeof window !== 'undefined') {
        if (!window.__HOUSE_SURFACES) window.__HOUSE_SURFACES = [];
        // Mouse hole - a small dark depression in floor? But surfaces handle height; hole in floor might need collider
      }
    } catch (e) {}
    // Visual mouse hole
    const mouseHole = cyl(g, 1.2, 1.2, 0.1, -22, 0.05, 88, new THREE.MeshStandardMaterial({ color: 0x111111 }), 12, false);
    mouseHole.receiveShadow = true;
    // ---- West wall: a short run, stopping short of the garage doorway -----
    counterRun(g, r.x0 + 3.1, 54, 12, 0, 'z', false);
    // ---- South wall: the hutch, east of the living-room opening ------------
    // Measured off the wall's FACE at z=47.5, not its centre line at 46.
    {
      const hutch = unit(g, 'hutch', -3, 49.2);
      box(hutch, 13, 14, 2, 0, 7, 0, MAT.woodPale);
      box(hutch, 13.6, 0.6, 2.6, 0, 14.2, 0, MAT.wood);
      for (let i = 0; i < 4; i++) box(hutch, 3, 2.6, 0.3, -4.5 + i * 3, 9, 1.2, MAT.metal, false);
    }
    // ---- The island, with stools down the kitchen side of it -------------
    // The stools sit clear of the island's edge rather than tucked under it —
    // tucked-under seating is intentional, a stool half inside the worktop it
    // belongs to is not.
    table(g, -19, 64, 20, 16, 4.6, 0, MAT.woodPale);
    for (let i = 0; i < 3; i++) chair(g, -26 + i * 7, 53, 0);
    sph(g, 2.4, -19, 5.8, 64, MAT.quilt).scale.y = 0.5;     // fruit bowl
    // ---- East wall: a dresser in the solid stretch below the dining opening -
    // x=4.5 is that wall's inner face; the dresser is 3.1 wide with its handles
    // on the left, so it has to start at 9.6 to clear it.
    {
      const dr = unit(g, 'dresser', 2.8, 89);
      box(dr, 2, 12, 8, 0, 6, 0, MAT.woodPale);
      box(dr, 2.6, 0.6, 8.6, 0, 12.2, 0, MAT.wood, false);
      for (let i = 0; i < 2; i++) box(dr, 1, 1, 5, -1.3, 4 + i * 4, 0, MAT.metalDark, false);
    }
    pottedPlant(g, r.x0 + 7, r.z0 + 8, 1.2);
    pottedPlant(g, -14, r.z1 - 7, 1.0);
    ceilingLight(g, lights, -19, 84, 8, 34, 70);
    ceilingLight(g, lights, -19, 62, 8, 30, 64);
    ceilingLight(g, lights, -30, 76, 7, 24, 48);
  }

  await phase(0.58, 'the dining room');

  // ---- Dining room --------------------------------------------------------
  // A new room, off the kitchen through a 30-wide cased opening. It is the only
  // thing between the foyer and the kitchen, which is what makes leaving feel
  // like a journey rather than a step.
  {
    const r = ROOMS.dining;
    // The table and its chairs. The chairs sit BESIDE the table, not tucked under
    // it: a chair pushed 3 in under a worktop is seating, a chair pushed 3 in
    // under a dining table just intersects it, and the house's own rule is that
    // nothing overlaps anything.
    table(g, 27, 70, 24, 16, 4.4, 0, MAT.wood);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      chair(g, 27 + s * 14, 62 + i * 8, s > 0 ? -Math.PI / 2 : Math.PI / 2);
    }
    for (let i = 0; i < 2; i++) chair(g, 21 + i * 12, 82, Math.PI);
    // A fruit bowl and a candle on the table, because someone eats here.
    sph(g, 2.6, 27, 5.8, 70, MAT.quilt2).scale.y = 0.5;
    cyl(g, 0.5, 0.5, 3, 27, 6.2, 70, MAT.porcelain, 10, false);
    sph(g, 0.6, 27, 8.2, 70, MAT.bulb, false);
    // Sideboard on the east wall, with a mirror over it. It has to sit north of
    // z=80: the dining|foyer opening is z 60..80, and a 22-long sideboard
    // centred on z=60 stood straight across the middle of it. It also has to
    // clear that wall's inner face at x=50.5 — it is 9.8 wide with the doors on
    // the left, so x=45.5 is as far east as it goes.
    {
      const sb = unit(g, 'sideboard', 45.5, 87);
      box(sb, 9, 9, 13, 0, 4.5, 0, MAT.woodPale);
      box(sb, 9.6, 0.6, 13.6, 0, 9.3, 0, MAT.wood, false);
      for (let i = 0; i < 2; i++) box(sb, 0.5, 4, 5, -4.8, 5, -3.5 + i * 7, MAT.woodDark, false);
    }
    vert(g, 16, 12, r.x1 - 0.6, 15, 86, -Math.PI / 2, MAT.mirror);
    // A dresser/hutch on the west side, facing the cased opening — and clear of
    // it. The kitchen|dining opening is z 54..84, so this has to start at z=84.
    // It is 2.8 wide with the handles on the right, and that wall's inner face
    // is x=7.5, so it can only start at x=8.0.
    {
      const hw = unit(g, 'dresser', r.x0 + 3.2, 89);
      box(hw, 2, 16, 9, 0, 8, 0, MAT.woodPale);
      for (let s = 0; s < 3; s++) {
        box(hw, 2.4, 0.5, 8, 0, 4 + s * 5, 0, MAT.wood, false);
        for (let i = 0; i < 3; i++) box(hw, 1.6, 2.4, 2, 1.2, 6 + s * 5, -3 + i * 3,
          [MAT.paper, MAT.quilt, MAT.woodDark][i], false);
      }
    }
    pottedPlant(g, 14, 52, 1.1);
    ceilingLight(g, lights, 27, 70, 9, 30, 60);
    ceilingLight(g, lights, 27, 54, 7, 22, 42);
  }

  await phase(0.64, 'the foyer');

  // ---- Foyer: where you arrive, and the locked front door -----------------
  // You are put down here facing west, with the front door at your back. The
  // only way on is through the dining room, so the first thing you see is how
  // much house there is.
  {
    const r = ROOMS.foyer;
    // A console table under the fanlight, and a long runner.
    table(g, 83, 70, 8, 30, 3.4, 0, MAT.wood);
    for (let i = 0; i < 3; i++) sph(g, 0.7, 83, 5, 60 + i * 10, MAT.quilt2, false);
    vert(g, 14, 12, r.x1 - 0.6, 16, 70, -Math.PI / 2, MAT.mirror);
    // A boot bench, a coat rack with coats, and an umbrella stand.
    table(g, 68, 53, 20, 8, 2.6, 0, MAT.woodPale);
    for (const s of [-1, 1]) box(g, 3, 4, 1, 68 + s * 7, 2, 53, MAT.wood, false);
    for (let i = 0; i < 4; i++) {
      box(g, 2, 11, 3, 74 + i * 3, 11, 90, [MAT.quilt, MAT.sofa, MAT.cushion, MAT.quilt2][i], false);
    }
    cyl(g, 0.5, 0.5, 10, 58, 5, 52, MAT.woodDark, 8, false);
    cyl(g, 1.2, 1.2, 4, 58, 2, 52, MAT.metalDark, 10, false);
    pottedPlant(g, 60, 87, 1.3);
    // A mat inside the door, and the house number on the wall.
    rug(g, 70, 66, 22, 18, MAT.rugHall);
    box(g, 0.4, 3, 5, r.x1 - 0.5, 8, 88, MAT.lockRed, false);
    ceilingLight(g, lights, 72, 70, 8, 28, 56);
    ceilingLight(g, lights, 72, 52, 6, 22, 42);
  }

  await phase(0.7, 'the living room');

  // ---- Living room --------------------------------------------------------
  // 96 x 66. This is the single biggest room in the house and it is the reason
  // the plan is a square: at the old 58 x 98 the seating group and the fireplace
  // were fighting each other for floor.
  {
    const r = ROOMS.living;
    // Seating group, all facing the TV. The TV is on the EAST wall's solid
    // stretch, not on the north one: the north wall (z=46) is cut through by the
    // open-plan kitchen/living divide at x -36..-10, and a 20-wide TV unit
    // standing against it was sitting in that opening. Turned 90 degrees it is a
    // 3.6-wide, 20-deep cabinet running down the wall from z=22 to z=42, which
    // also puts it clear of the hall doorway at z -6..18.
    sofa(g, -72, 24, -Math.PI / 2);
    sofa(g, -72, 2, Math.PI / 2);
    sofa(g, -30, 34, 0);
    table(g, -50, 14, 20, 15, 2.2, 0, MAT.woodDark);
    tvUnit(g, 2.5, 32, Math.PI / 2);
    // A stone fireplace on the west wall, with a real fire in it. One `unit`,
    // because the boxes that make it up overlap each other by design — two jambs,
    // a header, a back and a lintel around a recess — and the audit reads a group
    // as a single piece of furniture, so it is checked as one thing.
    //
    // The recess is modelled as a gap between boxes rather than as a hole cut
    // through them: the stone is built as the pieces that would be LEFT once the
    // firebox is removed. That way the firebox is genuinely open towards the room
    // and the fire and its light actually come out of it, instead of glowing out
    // of the side of a solid block.
    fireplace = (() => {
      const fp = unit(g, 'fireplace', FIREPLACE.x, FIREPLACE.z);
      fp.rotation.y = Math.PI; // Face into the room (east)
      const H = FIREPLACE.hearth;
      // Two jambs either side of the opening, the stone above it, the back of the
      // recess, and the slab across the bottom of it. 24 deep in z, 18 tall.
      box(fp, 5, 18, 5, 0, 9, -9.5, MAT.counter);
      box(fp, 5, 18, 5, 0, 9, 9.5, MAT.counter);
      box(fp, 5, 6, 14, 0, 15, 0, MAT.counter);          // over the opening
      box(fp, 1, 12, 14, 1.5, 6, 0, MAT.porcelain);      // the back of the firebox
      box(fp, 4, 0.7, 14, 0, 0.35, 0, MAT.counter);       // its floor
      box(fp, 7, 1.4, 26, 0.5, 19, 0, MAT.woodDark);     // the mantel
      // Soot up the back of the recess, so the firebox reads as a firebox.
      box(fp, 0.2, 8, 11, 0.95, 4.5, 0, MAT.rubber, false);
      // The stone apron on the floor in front of it — the bit you park on.
      flat(g, H.x1 - H.x0, H.z1 - H.z0, (H.x0 + H.x1) / 2, 0.06, (H.z0 + H.z1) / 2, MAT.counter);
      // A log basket beside it, because a fire that eats nothing is a hologram.
      cyl(g, 2.1, 1.7, 3.2, H.x1 - 1.6, 1.6, H.z1 + 3.4, MAT.pot, 12);
      for (let i = 0; i < 3; i++) {
        cyl(fp, 0.5, 0.5, 3.6, 0.2, 1.6 + i * 0.9, 0, MAT.trunk, 8).rotation.z = Math.PI / 2 + (i - 1) * 0.3;
      }
      // The fire: a bed of coals with two logs lying across it, then flames.
      const coals = [];
      for (let i = 0; i < 9; i++) {
        const t = i / 8;
        coals.push(sph(fp, 0.75 + (i % 3) * 0.22, 0.1 + ((i * 7) % 3) * 0.4, 1.05, -4.6 + t * 9.2, MAT.coal, false));
      }
      for (let i = 0; i < 2; i++) {
        const log = cyl(fp, 0.62, 0.62, 8, 0, 2 + i * 1.1, -1 + i * 2, MAT.trunk, 10);
        log.rotation.x = Math.PI / 2;
        log.rotation.y = (i - 0.5) * 0.24;
      }
      // Flames: a ring of tall ones with a shorter, brighter core inside them.
      const flames = [];
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const tall = cone(fp, 1.15, 4.4, 1 + Math.cos(a) * 1.5, 3.6, Math.sin(a) * 3.4, MAT.flame, 10, false);
        const core = cone(fp, 0.7, 2.6, 1 + Math.cos(a) * 0.7, 2.6, Math.sin(a) * 1.6, MAT.flameCore, 10, false);
        flames.push({ tall, core, a, h: 4.4 });
      }
      // The light of it, thrown out into the room and flickering.
      const fireLight = new THREE.PointLight(0xff9436, 30, 40, 2);
      fireLight.position.set(2.5, 4.5, 0);
      fp.add(fireLight);
      lights.push(fireLight);
      // The flicker is deterministic (a sum of three sines off the clock) so it
      // looks the same on every machine, and so a test can drive it.
      return {
        light: fireLight,
        update(elapsed) {
          const f = Math.sin(elapsed * 11) * 0.5 + Math.sin(elapsed * 17.3) * 0.3 + Math.sin(elapsed * 29.7) * 0.2;
          fireLight.intensity = 26 + f * 9;
          MAT.coal.emissiveIntensity = 2.1 + f * 0.35;
          for (const fl of flames) {
            // Each flame breathes on its own phase so they do not pulse in unison.
            const p = Math.sin(elapsed * (7 + fl.a * 2.2)) * 0.5 + 0.5;
            const s = 0.78 + p * 0.42 + f * 0.06;
            fl.tall.scale.set(1 + p * 0.12, s, 1 + p * 0.12);
            fl.tall.position.y = 1.4 + (fl.h * s) / 2;
            fl.core.scale.set(1 + p * 0.16, 0.8 + p * 0.4, 1 + p * 0.16);
          }
        },
      };
    })();
    // Bookcase along the south wall. It was 40 long, which is longer than the
    // stretch of that wall between the two doorways — it ran across both of
    // them. 22 wide fits the gap between them with room to spare, and it stands
    // against the wall's FACE (z -18.5) rather than its centre line (z -20):
    // 3.4 deep centred on -17.5 put its back edge inside the plaster.
    {
      const bc = unit(g, 'bookcase', -42, -16);
      box(bc, 22, 18, 3, 0, 9, 0, MAT.woodPale);
      for (let s = 0; s < 3; s++) {
        box(bc, 21, 0.5, 3.4, 0, 3.5 + s * 5.5, 0, MAT.wood, false);
        for (let i = 0; i < 10; i++) {
          box(bc, 1.5, 3.8, 2.4, -9 + i * 2, 5.4 + s * 5.5, 0,
            [MAT.quilt, MAT.quilt2, MAT.wood, MAT.paper][i % 4], false);
        }
      }
    }
    // A grand piano in the corner nobody sits in. Pulled in off both the solid
    // darkGarage|living wall at z=46 and the sofa to its east.
    {
      const pi = unit(g, 'piano', -82, 34);
      box(pi, 12, 4, 18, 0, 3, 0, MAT.woodDark);
      box(pi, 12.6, 0.5, 18.6, 0, 5.2, 0, MAT.paper, false);
      for (let i = 0; i < 5; i++) box(pi, 0.5, 0.4, 3, -5 + i * 2.4, 5.6, -8, MAT.trim, false);
    }
    pottedPlant(g, -80, 38, 1.3);
    pottedPlant(g, -8, 0, 1.1);
    pottedPlant(g, 0, 40, 1.0);
    ceilingLight(g, lights, -50, 20, 9, 34, 76);
    ceilingLight(g, lights, -24, 34, 7, 26, 52);
    ceilingLight(g, lights, -70, -6, 7, 24, 48);
    tableLamp(g, lights, -84, 4, -10, 18);
  }

  await phase(0.76, 'the bedrooms');

  // ---- Bedroom 1 ----------------------------------------------------------
  // The big bed stays where it was. The small one goes up onto the west wall,
  // turned 90 degrees: lying across the south strip it ran straight through the
  // garment rail below it, and there is no room in that corner for both.
  {
    bed(g, -68, -58, 16, 22, 0, MAT.quilt);
    bed(g, -81, -33, 11, 14, Math.PI / 2, MAT.quilt2);
    // Wardrobes belong ON a wall: this one is 3.6 deep turned 90 degrees, so it
    // has to come back to x=-85.5 to be within 3.5 of the west wall at -90.
    wardrobe(g, -85.5, -70, 12, Math.PI / 2);
    // The rail runs along the room's long axis against the south wall, and stops
    // short of the wall at x=-46, which it used to poke straight through.
    shelfRack(g, -70, -83, 26, 0, 'x');
    // ry stays 0: the table is authored 10 wide by 16 deep, and rotating it put
    // the 16 across the wall it is supposed to be standing against. It is on the
    // west wall now, clear of the small bed.
    table(g, -66, -34, 10, 16, 3.2, 0, MAT.wood);
    tableLamp(g, lights, -70, 3.2, -34, 14);
    pottedPlant(g, -52, -30, 1.1);
    ceilingLight(g, lights, -68, -54, 7, 26, 56);
    ceilingLight(g, lights, -68, -76, 6, 20, 42);
    // Piano mat in child's room
    try {
      if (typeof window !== 'undefined') {
        if (!window.__HOUSE_SURFACES) window.__HOUSE_SURFACES = [];
        // Create 8 piano keys as pads at slightly different heights/colors conceptually
        const keyMat = new THREE.Group();
        keyMat.name = 'pianoMat';
        // On the floor at the foot of the piano, flush to its south face. On top
        // of the case they would read fine but share its footprint, and the
        // audit holds furniture to the same rule as everything else: two pieces
        // of furniture never intersect, in plan or out of it.
        keyMat.position.set(-65.85, 0.01, -44.5);
        const whiteKeys = 8;
        const keyWidth = 1.2, keyDepth = 4, spacing = 0.1;
        for (let i = 0; i < whiteKeys; i++) {
          const key = box(keyMat, keyWidth, 0.1, keyDepth, -((whiteKeys-1)/2) + i*(keyWidth+spacing), 0.05, 0, MAT.trim, false);
        }
        g.add(keyMat);
        window.__HOUSE_SURFACES.push(pad(-55, -50, (keyWidth+spacing)*8, keyDepth, 0.05));
      }
    } catch (e) {}
    // Children's room: add toys, castle, giant balls, train set
    try {
      // Giant balls
      const ball1 = sph(g, 3, -60, 1, -40, MAT.quilt, false);
      const ball2 = sph(g, 3.5, -50, 1, -45, MAT.quilt2, false);
      addKnockable(ball1, 3, { fallTime: 0.4, mode: 'slide', slideDistance: 8 });
      addKnockable(ball2, 3.5, { fallTime: 0.4, mode: 'slide', slideDistance: 10 });
      // Toys scattered
      for (let i = 0; i < 6; i++) {
        const toy = box(g, 0.8, 0.8, 1.2, -75 + i*3, 0.4, -45 + i*2, [MAT.wood, MAT.paper, MAT.plaster][i%3], false);
        addKnockable(toy, 0.8, { fallTime: 0.25 });
      }
      // Block castle - thin blocks stacked
      const castleX = -80, castleZ = -70;
      for (let level = 0; level < 3; level++) {
        box(g, 4, 0.4, 0.8, castleX, 0.2 + level*1.5, castleZ-2, MAT.woodPale, false);
        box(g, 0.8, 0.4, 4, castleX, 0.2 + level*1.5, castleZ, MAT.woodPale, false);
      }
      box(g, 2, 0.8, 2, castleX, 0.2 + 4.5, castleZ, MAT.woodPale, false); // cupola
      // Make castle blocks knockable
      for (let level = 0; level < 3; level++) {
        const b1 = box(g, 4, 0.4, 0.8, castleX, 0.2 + level*1.5, castleZ-2, MAT.woodPale, false);
        const b2 = box(g, 0.8, 0.4, 4, castleX, 0.2 + level*1.5, castleZ, MAT.woodPale, false);
        addKnockable(b1, 2.5, { fallTime: 0.3 });
        addKnockable(b2, 2.5, { fallTime: 0.3 });
      }
      const cup = box(g, 2, 0.8, 2, castleX, 0.2 + 4.5, castleZ, MAT.woodPale, false);
      addKnockable(cup, 1.5, { fallTime: 0.3 });
      // Train set - simple circular track
      const trackGroup = new THREE.Group();
      trackGroup.position.set(-50, 0.01, -65);
      g.add(trackGroup);
      for (let i = 0; i < 8; i++) {
        const ang = i*Math.PI/4;
        const tr = box(trackGroup, 1.5, 0.05, 0.8, Math.cos(ang)*4, 0.02, Math.sin(ang)*4, MAT.woodDark, false);
        tr.rotation.y = ang;
      }
      // Red switch
      box(trackGroup, 0.5, 0.1, 0.5, 0, 0.05, 0, MAT.lockRed, false);
    } catch (e) {}
  }

  // ---- Bedroom 2 ----------------------------------------------------------
  {
    bed(g, 28, -58, 16, 22, 0, MAT.quilt2);
    // The wardrobe is in the south-east corner. It cannot stand on that wall
    // anywhere north of z=-70: the bed2|closetA opening is z -70..50 and the car
    // needs 3.7 of clear floor each side of the wall's centre line to swing
    // through it, so the south strip is the only place on this wall it fits.
    wardrobe(g, 48.2, -78, 12, -Math.PI / 2);
    // Add a dresser against the east wall in bedroom 2
    {
      const dr = unit(g, 'dresser_bed2', 48, -34);
      const dresserHeight = 7;
      box(dr, 2.5, dresserHeight, 10, 0, dresserHeight/2, 0, MAT.woodPale);
      box(dr, 3.1, 0.6, 10.6, 0, dresserHeight + 0.2, 0, MAT.wood, false);
      for (let i = 0; i < 3; i++) {
        box(dr, 1.2, 1.2, 6, -1.3, 2 + i * 2, 0, MAT.metalDark, false);
      }
      // Make dresser top knockable items
      const topY = dresserHeight + 0.5;
      // Mini figurines
      const fig1 = sph(dr, 0.4, -0.5, topY, 2, MAT.quilt, false);
      const fig2 = sph(dr, 0.35, -0.3, topY, -1, MAT.quilt2, false);
      const book = box(dr, 1.5, 0.4, 2, 0.2, topY + 0.2, 0.5, MAT.paper, false);
      const lamp = cyl(dr, 0.25, 0.4, 1.2, 0.5, topY + 0.6, -1.5, MAT.wood, 8, false);
      const jewelry = cyl(dr, 0.1, 0.1, 0.8, -0.2, topY + 0.4, -2, MAT.metalDark, 6, false);
      const clock = cyl(dr, 0.8, 0.8, 0.3, 0, topY + 0.15, 1.5, MAT.woodDark, 12, false);
      const keys = box(dr, 0.3, 0.1, 0.6, -0.8, topY + 0.05, 0, MAT.metalDark, false);
      // Register knockable items on top
      try {
        addKnockable(fig1, 0.5, { fallTime: 0.3 });
        addKnockable(fig2, 0.4, { fallTime: 0.25 });
        addKnockable(book, 1.0, { fallTime: 0.3 });
        addKnockable(lamp, 0.5, { fallTime: 0.4 });
        addKnockable(jewelry, 0.3, { fallTime: 0.2 });
        addKnockable(clock, 0.9, { fallTime: 0.35 });
        addKnockable(keys, 0.4, { fallTime: 0.2 });
      } catch (e) {}
      // Add guitar leaning against dresser as a ramp
      const guitarGroup = new THREE.Group();
      guitarGroup.position.set(45, 0, -34);
      // Guitar body
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(1.2, 12, 8),
        new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.8 })
      );
      body.scale.set(1.2, 0.4, 1);
      body.position.set(0, dresserHeight * 0.3, 0);
      guitarGroup.add(body);
      // Guitar neck - long
      const neck = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.2, 6, 8),
        new THREE.MeshStandardMaterial({ color: 0xdaa520, roughness: 0.7 })
      );
      neck.rotation.z = Math.PI / 6; // leaning up
      neck.position.set(2.5, dresserHeight * 0.8, 0);
      guitarGroup.add(neck);
      // Headstock
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.6, 0.4),
        new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.8 })
      );
      head.position.set(5, dresserHeight * 1.3, 0);
      guitarGroup.add(head);
      g.add(guitarGroup);
    }
    // Turned on its side and stood along the north wall's south face, which is
    // where a desk belongs. Authored 16 wide by 10 deep for it: centred on z=-20
    // at its old 16-deep it straddled the bed2|hall wall outright.
    table(g, 30, -27, 16, 10, 3.2, 0, MAT.wood);
    chair(g, 30, -35, Math.PI);
    // Guitar ramp leaning against the dresser to reach the top - create surface for ramp
    try {
      if (typeof window !== 'undefined') {
        if (!window.__HOUSE_SURFACES) window.__HOUSE_SURFACES = [];
        // Ramp from floor up to dresser top along the guitar
        window.__HOUSE_SURFACES.push(wedge(46.5, -34, 0, 8, 4, 7, 0));
      }
    } catch (e) {}
    // Shortened, and moved in off the south wall, which it was crossing.
    shelfRack(g, 32, -82, 20, 0, 'x');
    pottedPlant(g, 12, -28, 1.0);
    ceilingLight(g, lights, 28, -54, 7, 26, 56);
    ceilingLight(g, lights, 28, -78, 6, 20, 42);
  }

  // ---- The walk-in closet: the room that joins the two bedrooms ----------
  // 52 x 66, and the two long runs of wardrobes either side of the aisle are
  // the whole point of it. The aisle is wide enough to drive down.
  {
    const r = ROOMS.walkin;
    // The room's two centres, kept separate. `mid` used to be the X centre and
    // was passed as the Z coordinate, which put both runs of wardrobes outside
    // the room — one of them ended up in the living room, across the wall.
    const mx = (r.x0 + r.x1) / 2, mz = (r.z0 + r.z1) / 2;
    // `axis` already decides which way the rail runs, so `ry` stays 0 — passing
    // both rotates the rack a second time and it ends up across the room.
    //
    // Both rails are in the NORTH half of the room, and 22 long rather than 26.
    // At 26 they cannot fit: the bed1|walkin and walkin|bed2 doorways are z
    // -70..-50, and the car needs 3.7 of clear floor each side of the z=-20 wall
    // to get through into the living room, which leaves a 25-deep slot. 22 fits
    // it with room to spare, and 3.5 in from the side wall so it counts as being
    // against one.
    shelfRack(g, r.x0 + 3.5, -36.7, 22, 0, 'z');
    shelfRack(g, r.x1 - 3.5, -36.7, 22, 0, 'z');
    // Island: a low table with folded piles and a couple of open boxes.
    box(g, 24, 4, 9, mx, 2, mz, MAT.woodPale);
    box(g, 25, 0.5, 10, mx, 4.2, mz, MAT.wood);
    for (let i = 0; i < 4; i++) {
      box(g, 5, 2, 5, mx - 9 + i * 6, 5.4, mz, [MAT.quilt, MAT.sheet, MAT.quilt2, MAT.cushion][i], false);
    }
    for (const s of [-1, 1]) box(g, 6, 5, 6, mx + s * 19, 2.5, mz, MAT.paper, false);
    // Full-length mirrors on the ends, which is what a walk-in closet has.
    vert(g, 14, 18, r.x0 + 0.6, 9, mz, Math.PI / 2, MAT.mirror);
    vert(g, 14, 18, r.x1 - 0.6, 9, mz, -Math.PI / 2, MAT.mirror);
    ceilingLight(g, lights, mx, -50, 7, 24, 54);
    ceilingLight(g, lights, mx, -74, 6, 22, 46);
  }

  await phase(0.82, 'the bathroom');

  // ---- Bathroom -----------------------------------------------------------
  {
    const r = ROOMS.bathroom;
    // Place tub against the east wall (room.x1 = 90), leaving clearance
    tub(g, 74.5, 30, Math.PI / 2);
    // Both of these are on the EAST wall, and neither can be on the south one:
    // the wall at z=-20 runs the full width of the room, so anything within 1.5
    // of its centre line is inside it — doorway or not.
    toilet(g, 87, -13, Math.PI);
    sinkUnit(g, 87, 4, -Math.PI / 2);
    // A big mirror wall and a towel rail, so the room is not just appliances.
    box(g, 30, 16, 0.5, 70, 10, r.z1 - 0.5, MAT.mirror, false);
    for (let i = 0; i < 3; i++) box(g, 5, 13, 0.8, 60 + i * 10, 8, -20, [MAT.paper, MAT.cushion, MAT.paper][i], false);
    box(g, 0.6, 0.6, 18, r.x0 + 0.6, 9, 12, MAT.chrome, false);
    // A bath mat by the tub, because someone uses it.
    rug(g, 76, 30, 16, 20, MAT.rugHall);
    ceilingLight(g, lights, 72, 28, 7, 28, 58);
    ceilingLight(g, lights, 72, -6, 6, 22, 44);
    // Bathroom surfaces: tiled deck around the tub and the tub bowl itself
    // (colliders provide the vertical walls). A surfboard ramp is added as a wedge.
    const TILE_Y = 0.6;
    try {
      if (typeof window !== 'undefined') {
        if (!window.__HOUSE_SURFACES) window.__HOUSE_SURFACES = [];
        window.__HOUSE_SURFACES.push(
          pad(64.5, 30, 10, 30, TILE_Y),
          pad(84.5, 30, 10, 30, TILE_Y),
          pad(74.5, 17.5, 20, 5, TILE_Y),
          pad(74.5, 42.5, 20, 5, TILE_Y),
          bowl(74.5, 30, 5.5, 13, TILE_Y, 4.5, { steep: 0.9 }),
          wedge(68.5, 30, 0, 12, 5, TILE_Y + 0.4, 0)
        );
      }
    } catch (e) {}
  }

  await phase(0.86, 'the main closet');

  // ---- Main closet --------------------------------------------------------
  {
    const r = ROOMS.closetA;
    // Two centres again, not one: `mid` as the Z coordinate put both runs of
    // wardrobes out in the foyer.
    const mx = (r.x0 + r.x1) / 2, mz = (r.z0 + r.z1) / 2;
    shelfRack(g, r.x0 + 4, -36.7, 22, 0, 'z');
    shelfRack(g, r.x1 - 4, -36.7, 22, 0, 'z');
    // A dressing table with a mirror — the reason a main closet has a corner
    // you can actually stand in. z=-29 rather than -28: the table is 9 deep, and
    // at -28 its north edge sat 3.7 from the wall's centre line, which is the
    // car radius plus half the wall — i.e. in the closet|bathroom doorway.
    table(g, mx, r.z1 - 9, 20, 9, 3.2, 0, MAT.woodPale);
    vert(g, 18, 14, mx, 9, r.z1 - 0.6, Math.PI, MAT.mirror);
    chair(g, mx, r.z1 - 18, 0);
    // A chest of drawers down the middle of the aisle. One `unit`, because the
    // drawer fronts are 12.4 across a 12 carcass and hang 0.2 proud of each end —
    // left as separate boxes the audit reads them as two pieces of furniture
    // stacked inside each other.
    {
      const chest = unit(g, 'chestOfDrawers', mx, mz);
      box(chest, 12, 7, 20, 0, 3.5, 0, MAT.wood);
      for (let i = 0; i < 4; i++) box(chest, 12.4, 1.2, 4.4, 0, 1.5 + i * 2, 0, MAT.woodDark, false);
    }
    ceilingLight(g, lights, mx, mz, 7, 24, 48);
  }

  await phase(0.9, 'the dark garage');

  // ---- The DARK GARAGE: the way out ---------------------------------------
  // Pitch black. There are no windows on either of its shell sides, no ceiling
  // lights, and the only source in the room is one clamp lamp on a tripod at
  // the far end. It is the only way out of the house, and it is deliberately
  // the last place you want to be.
  {
    const r = ROOMS.darkGarage;
    // The floor is bare, oil-stained concrete, and the whole room is kept
    // clear down the middle so the car can run the length of it into the exit.
    flat(g, r.x1 - r.x0 - 2, r.z1 - r.z0 - 2, (r.x0 + r.x1) / 2, 0.02, (r.z0 + r.z1) / 2, MAT.concrete);
    for (let i = 0; i < 5; i++) {
      flat(g, 6 + i * 3, 4 + (i % 2) * 3, -78 + i * 5, 0.04, 62 + (i % 3) * 9, MAT.rubber, false);
    }
    // The workbenches, hard against the north and south walls.
    box(g, 14, 3, 4, -58, 1.5, 88.5, MAT.woodDark);
    box(g, 15, 0.6, 5, -58, 3.3, 88.5, MAT.woodPale, false);
    box(g, 20, 3, 5, -66, 1.5, 52, MAT.woodDark);
    box(g, 21, 0.6, 6, -66, 3.3, 52, MAT.woodPale, false);
    for (let i = 0; i < 4; i++) {
      box(g, 3, 2, 3, -73 + i * 5, 4.6, 52, i % 2 ? MAT.paper : MAT.woodDark, false);
    }
    // A stack of tyres, and a drum.
    for (let i = 0; i < 3; i++) cyl(g, 3.6, 3.6, 1.7, -54, 0.9 + i * 1.7, 53, MAT.rubber, 16, false);
    cyl(g, 2.6, 2.6, 6, -76, 3, 50, MAT.signAmber, 14, false);
    // ---- The beckoning light ------------------------------------------------
    // A clamp lamp on a tripod at the BACK of the garage, aimed at the wall. It
    // is the whole reason you drive in there, and the only thing you can see
    // when you do. The tools on the board behind it are silhouettes in it.
    const lampX = -84, lampZ = 88;
    cyl(g, 0.5, 0.5, 13, lampX, 6.5, lampZ, MAT.metalDark, 6, false);
    for (let i = 0; i < 3; i++) {
      const leg = cyl(g, 0.4, 0.4, 10, lampX, 4, lampZ, MAT.metalDark, 5, false);
      leg.rotation.z = 0.55; leg.rotation.y = (i / 3) * Math.PI * 2;
    }
    const shade = cone(g, 3.4, 4, lampX, 14, lampZ, MAT.metal, 10, false);
    shade.rotation.x = 0.3;
    sph(g, 1.2, lampX, 12.6, lampZ + 0.5, MAT.bulb, false);
    // Warm, short-range, and the only light in the room. The falloff does the
    // work: you can see about 40 of the way into the garage and no further.
    const beckon = new THREE.PointLight(0xffd9a0, 90, 78, 2);
    beckon.position.set(lampX, 12, lampZ + 1);
    g.add(beckon);
    lights.push(beckon);
    // The pegboard of tools, caught in the lamp. It is on the NORTH wall, not
    // the west one: the west wall is the exit, and the whole of z 58..86 on it
    // has to stay clear for the car to run out of.
    box(g, 18, 9, 0.6, -79, 7, r.z1 - 1, MAT.woodDark, false);
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 9; i++) {
        cyl(g, 0.3, 0.3, 0.2, -86 + i * 2, 4 + row * 3, r.z1 - 1.3, MAT.wood, 5, false)
          .rotation.x = Math.PI / 2;
      }
    }
    const toolZ = r.z1 - 1.6;
    box(g, 1, 5, 1, -86, 6, toolZ, MAT.wood, false);                  // hammer handle
    box(g, 1.2, 2.4, 1, -86, 9, toolZ, MAT.metalDark, false);          // hammer head
    const saw = box(g, 9, 2.6, 0.4, -78, 7.5, toolZ, MAT.metal, false);
    saw.rotation.z = 0.1;
    box(g, 2.6, 2, 1.2, -71, 6.5, toolZ, MAT.woodDark, false);
    box(g, 0.8, 4.4, 1, -68, 6, toolZ, MAT.metal, false);              // spanner
    for (let i = 0; i < 3; i++) {
      box(g, 0.7, 3, 0.7, -65 + i * 1.6, 8, toolZ, i % 2 ? MAT.signAmber : MAT.signGreen, false);
    }
    // A coiled hose on the wall by the door, so it reads as a garage.
    for (let i = 0; i < 3; i++) {
      cyl(g, 3.6 - i * 0.5, 3.6 - i * 0.5, 0.8, -50, 3 + i * 0.3, 88, MAT.signGreen, 12, false)
        .rotation.z = Math.PI / 2;
    }
    // A painted bay outline, so the dark has something to give the eye scale.
    for (const s of [-1, 1]) flat(g, 0.4, 26, -62 + s * 11, 0.05, 70, MAT.warning, false);
  }

  await phase(0.96, 'the hall');

  // ---- Hall ----------------------------------------------------------------
  // The spine of the house: 46 x 66 running from the dining room down to the
  // bedrooms, and the room you are in for a good part of any run to the door.
  {
    const r = ROOMS.hall;
    // Coat hooks and a bench in the mudroom at the north end.
    box(g, 0.6, 0.6, 14, r.x0 + 0.9, 14, 38, MAT.wood, false);
    for (let i = 0; i < 5; i++) {
      box(g, 1.4, 11, 3, r.x0 + 1.8, 9, 32 + i * 3, [MAT.quilt, MAT.sofa, MAT.cushion, MAT.quilt2, MAT.paper][i], false);
    }
    table(g, 22, 36, 20, 10, 2.6, 0, MAT.woodPale);
    for (const s of [-1, 1]) box(g, 3, 4, 1, 22 + s * 7, 2, 36, MAT.wood, false);
    // Shoe rack and a console table further down. The console is authored 7
    // wide by 26 deep and stands against the hall's east wall at x=52, so ry
    // stays 0 — rotating it put the 26 straight through that wall. It is at
    // x=44 rather than 45.5 because that wall's face is at 50.5 and the car
    // needs 3.7 of clear floor off the centre line to get through the bathroom
    // doorway beside it.
    for (let s = 0; s < 2; s++) box(g, 5, 0.5, 20, r.x0 + 2.5, 2 + s * 4.5, 6, MAT.woodPale, false);
    table(g, 44, 10, 7, 26, 3.2, 0, MAT.wood);
    pottedPlant(g, 45.5, -4, 1.1);
    pottedPlant(g, 14, 38, 1.0);
    // A big painting on the hall's east wall, and a runner rug.
    vert(g, 20, 15, r.x1 - 0.4, 15, 24, -Math.PI / 2, MAT.quilt2);
    rug(g, 22, 6, 26, 20, MAT.rugHall);
    ceilingLight(g, lights, 28, 38, 7, 26, 52);
    ceilingLight(g, lights, 28, 12, 7, 24, 50);
    ceilingLight(g, lights, 28, -12, 6, 22, 44);
  }
  await phase(1, 'the house');

  // Tag every mesh in the house as something the camera may have to see
  // THROUGH. The house is a closed box of shared materials, so a chase cam that
  // clips behind a wall or a wardrobe loses the car completely; main.js
  // raycasts from the car to the lens and fades whatever it hits. Tagging all of
  // them — walls, floors, and furniture alike — is the point: any object between
  // you and the car has to be able to get out of the way.
  //
  // Only meshes built here are tagged, and only within this group, so the car,
  // the cat and anything else parented to the house root is never a candidate.
  g.traverse((o) => {
    if (o.isMesh) o.userData.houseOccluder = true;
  });
  if (typeof window !== 'undefined') window.__HOUSE_SURFACES = window.__HOUSE_SURFACES || [];

  return {
    group: g,
    colliders: C,
    lights,
    ceilingMesh,   // hidden by the top-down camera so you can see into the house
    start: HOUSE_START,
    exit: HOUSE_EXIT,
    rooms: ROOMS,
    // Where the cat may choose to fall asleep, and the spots it wanders between
    // while it is awake. CAT_SPOTS is defined once in layout.js so the builder
    // and any test read the same list.
    catSpots: CAT_SPOTS,
    // The fire: the ash trigger box and the flicker, which needs the clock.
    hearth: FIREPLACE.hearth,
    fireplace,
    surfaces: (typeof window !== 'undefined' && window.__HOUSE_SURFACES) || [],
  };
}
