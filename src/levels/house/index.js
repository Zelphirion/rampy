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
import { HOUSE, ROOMS, ROOM_LABELS, HOUSE_START, HOUSE_EXIT, HOUSE_WALLS, CAT_SPOTS, FRONT_DOOR, BACK_DOOR, MAP_ITEMS, DRIVE, FIREPLACE, CAR_RADIUS } from './layout.js?v=1800000000001';
import { addKnockable } from '../../physics.js?v=1800000000002';
import { pad, bowl, wedge } from './surfaces.js';
import { makeGalley, HOUSE_KITCHEN } from '../../kitchen.js?v=1799900000000';
import {
  makePlayTrain, makeRedHorse, makeLegoBox, makeHangingRocket,
  makeXylophone, makeBlockCastle, makeMagnetCity, makeHotWheels, makeJackInTheBox,
  makeTerrarium,
} from './playroom.js';
import { playTrainPoints } from './playtrain.mjs';

// Re-exported so main.js (and anyone poking at the level) has one import site.
export { HOUSE, ROOMS, ROOM_LABELS, HOUSE_START, HOUSE_EXIT, HOUSE_WALLS, CAT_SPOTS, FRONT_DOOR, BACK_DOOR, MAP_ITEMS, DRIVE, FIREPLACE };

// ============================================================================
// Materials
// ============================================================================
const MAT = {
  plaster:   new THREE.MeshStandardMaterial({ color: 0xf0e7d8, roughness: 0.92 }),
  plasterHi: new THREE.MeshStandardMaterial({ color: 0xfbf5ea, roughness: 0.9 }),
  trim:      new THREE.MeshStandardMaterial({ color: 0xfdfcf7, roughness: 0.6 }),
  wainscot:  new THREE.MeshStandardMaterial({ color: 0xe4dccb, roughness: 0.7 }),
  // The ceiling plane is built by `flat()`, whose normal points straight up so
  // it reads as a roof from above. That leaves its underside as a back face and
  // a single-sided material would CULL it from inside the house — looking up
  // from the elevated playroom track showed bare sky through the missing roof.
  // Double-sided keeps it a real roof above AND a real ceiling below.
  ceil:      new THREE.MeshStandardMaterial({ color: 0xf7f2e8, roughness: 0.95, side: THREE.DoubleSide }),

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
  // The oriental rug: madder ground, gold field, indigo guard band. Three flat
  // colours is all a woven pattern can be here — there are no textures in this
  // house — and it is the banding that reads as a rug rather than as a painted
  // rectangle from the far side of the room.
  rugOrient: new THREE.MeshStandardMaterial({ color: 0x7d2f2a, roughness: 0.98 }),
  rugGold:   new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.98 }),
  rugGuard:  new THREE.MeshStandardMaterial({ color: 0x2f4f4a, roughness: 0.98 }),

  // Fittings.
  cabinet:   new THREE.MeshStandardMaterial({ color: 0x3f4a52, roughness: 0.6 }),
  counter:   new THREE.MeshStandardMaterial({ color: 0x40474f, roughness: 0.42 }),
  counterTop:new THREE.MeshStandardMaterial({ color: 0x2f343a, roughness: 0.3 }),
  porcelain: new THREE.MeshStandardMaterial({ color: 0xf2f5f7, roughness: 0.22 }),
  // The tub's end skins are open half cylinders: one face is the outside of the
  // bath and the other the inside of the bowl, so both have to draw.
  porcelainSkin: new THREE.MeshStandardMaterial({ color: 0xf2f5f7, roughness: 0.22, side: THREE.DoubleSide }),
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
  // Architrave round the opening, purely decorative. The head trim is skipped
  // when the opening is full height (gap.top === y1): there is no head to case,
  // and a bar at y1 + t/2 would hang in the roof void above the ceiling.
  const t = 0.5;
  if (axis === 'x') {
    if (gap.top < y1) box(g, gap.a1 - gap.a0 + t * 2, t, thick + 0.3, (gap.a0 + gap.a1) / 2, gap.top + t / 2, at, MAT.trim);
    for (const a of [gap.a0, gap.a1]) box(g, t, gap.top, thick + 0.3, a, gap.top / 2, at, MAT.trim);
  } else {
    if (gap.top < y1) box(g, thick + 0.3, t, gap.a1 - gap.a0 + t * 2, at, gap.top + t / 2, (gap.a0 + gap.a1) / 2, MAT.trim);
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
  // The shell run cuts out the WHOLE span (floor to ceiling), so the sill/header
  // alone leave a real hole in the wall: a floor-to-waist gap under each window
  // you can see straight out of, and another above the header. Fill the masonry
  // back in below the sill and above the header so a window is a window and not
  // an opening. The collider pushed below is still the full panel — see the
  // C.push at the end, which is the invisible barrier that keeps the car in.
  if (axis === 'x') {
    box(g, w, y0, thick, mid, y0 / 2, at, MAT.plaster).userData.structure = true;                       // wall under the sill
    box(g, w, HOUSE.ceil - y1, thick, mid, (y1 + HOUSE.ceil) / 2, at, MAT.plaster).userData.structure = true; // wall over the header
  } else {
    box(g, thick, y0, w, at, y0 / 2, mid, MAT.plaster).userData.structure = true;
    box(g, thick, HOUSE.ceil - y1, w, at, (y1 + HOUSE.ceil) / 2, mid, MAT.plaster).userData.structure = true;
  }
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
        // Two bowl-shaped basins like in ramp world, placed in WORLD space by
        // running each basin's local offset through the run's own yaw. (They
        // used to be pushed at their LOCAL coordinates, which dropped a pair of
        // invisible counter-height dishes in the middle of the living room.)
        const c = Math.cos(ry), s = Math.sin(ry);
        for (const f of [-1, 1]) {
          window.__HOUSE_SURFACES.push(bowl(
            x + f * 1.75 * c, z - f * 1.75 * s, 1.5, 1.8, 5.8, 1.8, { steep: 0.9 }));
        }
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
  // A deep freestanding bath on a stadium plan: straight sides, rounded ends,
  // an open top so the water is actually visible, and the taps at the FOOT end
  // instead of on the long side. R is the end radius and S the straight run, so
  // the bowl is S + 2R long and 2R across — 16 x 8, big enough that a car can
  // actually drive into it and sit down in the bowl.
  const R = 4, S = 8, H = 5.5, T = 0.4;
  // The two straight sides, standing on the outer line.
  for (const f of [-1, 1]) box(b, S, H, T, 0, H / 2, f * (R - T / 2), MAT.porcelain);
  // The two rounded ends: a half cylinder each, open-ended so the bowl is a bowl.
  for (const e of [-1, 1]) {
    const arc = new THREE.Mesh(
      new THREE.CylinderGeometry(R, R, H, 22, 1, true, e > 0 ? 0 : Math.PI, Math.PI),
      MAT.porcelainSkin);
    arc.position.set(e * S / 2, H / 2, 0);
    arc.castShadow = arc.receiveShadow = true;
    b.add(arc);
  }
  // Floor and water, each a straight slab with a disc under each rounded end so
  // the plan matches the walls all the way round.
  box(b, S, 0.5, 2 * (R - 0.1), 0, 0.3, 0, MAT.porcelain);
  for (const e of [-1, 1]) cyl(b, R - 0.1, R - 0.1, 0.5, e * S / 2, 0.3, 0, MAT.porcelain, 22);
  box(b, S, 3.4, 2 * (R - 0.4), 0, 2.0, 0, MAT.tile, false);
  for (const e of [-1, 1]) cyl(b, R - 0.4, R - 0.4, 3.4, e * S / 2, 2.0, 0, MAT.tile, 22, false);
  // The rim: a rail down each straight side and a rounded cap over each end,
  // both on the same line, so the two meet instead of stepping.
  for (const f of [-1, 1]) box(b, S + 0.4, 0.5, 0.9, 0, H, f * R, MAT.porcelain, false);
  for (const e of [-1, 1]) {
    const geo = new THREE.TorusGeometry(R, 0.45, 8, 20, Math.PI);
    geo.rotateZ(e > 0 ? -Math.PI / 2 : Math.PI / 2);   // the arc faces outward
    const cap = new THREE.Mesh(geo, MAT.porcelain);
    cap.rotation.x = -Math.PI / 2;
    cap.position.set(e * S / 2, H, 0);
    cap.castShadow = true;
    b.add(cap);
  }
  // The taps, at the foot end: a riser out of the rim and a spout turned down
  // into the bowl. They sit on the arc of the rim, not over the water.
  cyl(b, 0.3, 0.3, 3.4, -S / 2 - 3.2, H + 1.7, 0, MAT.chrome, 8);
  const spout = cyl(b, 0.26, 0.26, 1.6, -S / 2 - 2.5, H + 3.1, 0, MAT.chrome, 8);
  spout.rotation.z = -Math.PI / 2 - 0.5;
  g.add(b);
  return b;
}

function toilet(g, x, z, ry) {
  const b = new THREE.Group();
  b.name = 'toilet';
  b.position.set(x, 0, z);
  b.rotation.y = ry;
  // Rounded, in three parts that say so from across the room: a foot on the
  // floor, a bowl swelling out of it, and a ring lying over the top. The bowl is
  // a squashed sphere and the ring a torus — three flat boxes in a row read as a
  // crate, not a WC. The plate under everything is what gives the piece a real
  // floor footprint; the bowl and the ring are not boxes and so are invisible to
  // the furniture audit.
  box(b, 5, 0.8, 7.4, 0, 0.4, 0.6, MAT.porcelain, false);
  const pedestal = cyl(b, 1.7, 2.2, 2.6, 0, 1.5, 1.4, MAT.porcelain, 20);
  pedestal.scale.x = 1.15;
  const bowl = sph(b, 2.5, 0, 3.1, 1.4, MAT.porcelain);
  bowl.scale.set(1, 0.66, 1.42);
  const seat = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.4, 8, 26), MAT.porcelain);
  seat.rotation.x = -Math.PI / 2;
  seat.position.set(0, 4.5, 1.4);
  seat.scale.set(1, 1.45, 1);
  seat.castShadow = true;
  b.add(seat);
  box(b, 5, 7.6, 1.8, 0, 4.6, -3.0, MAT.porcelain);            // the cistern
  box(b, 5.4, 0.5, 2.2, 0, 8.6, -3.0, MAT.porcelain, false);   // its lid
  cyl(b, 0.5, 0.5, 0.3, 0, 8.95, -3.0, MAT.chrome, 12, false);  // the flush button
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
  // A small ROUND mirror on the wall above the basin (its centre sits clear of
  // the counter, so it never reaches the floor). A chrome ring frames the glass.
  const frame = cyl(b, 3.4, 3.4, 0.24, 0, 10, -1.02, MAT.chrome, 26, false);
  frame.rotation.x = Math.PI / 2;
  const glass = cyl(b, 3.05, 3.05, 0.3, 0, 10, -1.0, MAT.mirror, 26, false);
  glass.rotation.x = Math.PI / 2;
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
  // Rugs are THIN: kept under the play train's sleepers (whose underside sits at
  // y ~0.055) so the track reads as resting ON the carpet rather than sinking
  // into it and losing its cross planks.
  return flat(g, w, d, x, 0.04, z, mat);
}

// A lozenge: a square lying on the floor with one corner turned to the room.
// Spun in GEOMETRY space, not with `rotation.z` — the object Euler order is
// XYZ, so an object-level Z rotation is applied before the lay-down rotation
// and the shape would end up standing on edge instead of lying flat.
function lozenge(g, size, x, y, z, mat) {
  const m = flat(g, size, size, x, y, z, mat);
  m.geometry.rotateZ(Math.PI / 4);
  return m;
}

// The living room's oriental rug. Stacked flat panels a hair apart in y, from
// the ground up: madder border, gold field, indigo guard band, gold centre, and
// a medallion with a motif in each corner of the border. Every inset is taken
// off the SHORT side and kept under a fifth of it, so the bands still fit on
// whatever rug is passed in.
function orientalRug(g, x, z, w, d) {
  const r = unit(g, 'orientalRug', x, z);
  const m = Math.min(w, d);
  const b1 = m * 0.10, b2 = m * 0.055, b3 = m * 0.05;
  // The whole stack is kept under y=0.05 (the play train's sleepers start at
  // ~0.055) so the train's cross planks stay visible where it crosses the rug.
  //
  // A stack of planes this big (74x50) is only ~0.01 apart in y, which is below
  // the depth buffer's precision at camera distance, so the layers z-fight. Each
  // layer gets a progressively larger negative polygonOffset to bias it toward
  // the camera, which keeps the stacking stable however far away it is viewed.
  const edge = (base, layer) => {
    const mtl = base.clone();
    mtl.polygonOffset = true;
    mtl.polygonOffsetFactor = -layer;
    mtl.polygonOffsetUnits = -layer;
    return mtl;
  };
  flat(r, w, d, 0, 0.010, 0, edge(MAT.rugOrient, 1));
  flat(r, w - b1 * 2, d - b1 * 2, 0, 0.020, 0, edge(MAT.rugGold, 2));
  flat(r, w - (b1 + b2) * 2, d - (b1 + b2) * 2, 0, 0.030, 0, edge(MAT.rugGuard, 3));
  flat(r, w - (b1 + b2 + b3) * 2, d - (b1 + b2 + b3) * 2, 0, 0.040, 0, edge(MAT.rugGold, 4));
  lozenge(r, m * 0.16, 0, 0.050, 0, edge(MAT.rugOrient, 6));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    // The corner motifs sit on the gold band, not on the guard band they share a
    // y with, so they get their own offset to stay on top of it.
    lozenge(r, b1 * 0.9, sx * (w / 2 - b1), 0.045, sz * (d / 2 - b1), edge(MAT.rugGold, 5));
  }
  return r;
}

function pottedPlant(g, x, z, s = 1) {
  // A plant is one piece of furniture on one patch of floor, so it is wrapped
  // in a unit and returned — which is also what lets the caller make the whole
  // thing jiggle as a single object instead of seven leaves drifting apart.
  const p = unit(g, 'pottedPlant', x, z);
  cyl(p, 2.4 * s, 1.8 * s, 3.4 * s, 0, 1.7 * s, 0, MAT.pot, 12);
  cyl(p, 2.1 * s, 2.1 * s, 0.4 * s, 0, 3.4 * s, 0, MAT.soil, 12, false);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const leaf = sph(p, 1.5 * s, Math.cos(a) * 1.5 * s, 4.6 * s + (i % 3) * 0.7 * s, Math.sin(a) * 1.5 * s, MAT.plant);
    leaf.scale.y = 1.5;
  }
  sph(p, 1.7 * s, 0, 5.2 * s, 0, MAT.plant).scale.y = 1.3;
  return p;
}

// A ceiling fitting with a real light under it. `h` is the drop from the
// ceiling; the shade is emissive so the fitting itself reads as the source.
// The fittings ride the ceiling (see HOUSE.ceil), so when the roof was raised
// the bulbs went up with it and every pool of light grew fainter against the
// floor. Scale the point light's reach and power to the taller room so the
// rooms keep roughly the brightness the values were tuned for.
const CEIL_LIGHT_REF = 30;                 // the ceiling those values were tuned at
const CEIL_LIGHT_K = HOUSE.ceil / CEIL_LIGHT_REF;
function ceilingLight(g, lights, x, z, h, intensity = 26, dist = 46) {
  cyl(g, 0.3, 0.3, h, x, HOUSE.ceil - h / 2, z, MAT.metalDark, 8, false);
  const s = cone(g, 2.6, 2.2, x, HOUSE.ceil - h - 1.1, z, MAT.shade, 14, false);
  s.rotation.x = Math.PI;   // shade opening downward, over the bulb
  sph(g, 1.0, x, HOUSE.ceil - h - 1.9, z, MAT.bulb, false);
  const L = new THREE.PointLight(0xffe6bb, intensity * CEIL_LIGHT_K * CEIL_LIGHT_K, dist * CEIL_LIGHT_K, 2);
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

// The one-off pieces below (fireplace, front door, bookcase...) used to be
// blocks of `box()` calls inside addHouse. They are lifted out here so the
// object browser can construct the same piece without rebuilding the house,
// and so there is still exactly one copy of each piece's geometry. Each is
// authored exactly as it was inline: `g` is the caller's root group, and the
// piece places itself at its real world spot.

// The living room fireplace, with a real fire in it. Returns the controller
// the world animates (`light`, `update`); the geometry hangs off `g`. The
// `lights` list is optional so the object browser can construct the same fire
// without a scene to publish the light to.
function buildFireplace(g, lights) {
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
  // The stone apron on the floor in front of it — the bit you park on. The
  // living room's oriental rug runs UNDER the whole hearth, and its top band
  // sits at y=0.05 with a negative polygon offset; an apron only a hair above
  // that z-fights the rug at any distance. So the apron is lifted a clear
  // 0.06 above the rug AND given its own stronger negative offset, which keeps
  // it drawn on top of every rug band however far away it is viewed.
  const apronMat = MAT.counter.clone();
  apronMat.polygonOffset = true;
  apronMat.polygonOffsetFactor = -10;
  apronMat.polygonOffsetUnits = -10;
  flat(g, H.x1 - H.x0, H.z1 - H.z0, (H.x0 + H.x1) / 2, 0.115, (H.z0 + H.z1) / 2, apronMat);
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
  if (lights) lights.push(fireLight);
  // The flicker is deterministic (a sum of three sines off the clock) so it
  // looks the same on every machine, and so a test can drive it.
  return {
    light: fireLight,
    unit: fp,
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
}

// The hall's grandfather clock. Returns { group, update(elapsed) }: `update`
// sets the three hands to the ACTUAL time of day (read off a live Date) and
// swings the heavy GOLDEN pendulum, so the clock reads as a running clock
// rather than a frozen prop. It is built with its dial on local +Z and the
// caller turns it to face into the hall.
function buildGrandfatherClock(parent, x, z) {
  const clk = unit(parent, 'grandfatherClock', x, z);
  clk.rotation.y = -Math.PI / 2;
  const W = 4.6, D = 3.2;              // case footprint, local (x, z)
  const zFace = D / 2;                 // the front face plane

  // Plinth and its mouldings.
  box(clk, W + 0.4, 1.8, D + 0.4, 0, 0.9, 0, MAT.wood);
  box(clk, W, 0.9, D, 0, 2.2, 0, MAT.woodDark);

  // The waist: a narrower case carrying the long glazed door.
  box(clk, W - 1.0, 11.4, D - 0.6, 0, 8.4, 0, MAT.woodDark);
  for (const s of [-1, 1]) {
    box(clk, 0.5, 11.0, 0.5, s * (W / 2 - 0.7), 8.4, zFace - 0.5, MAT.wood, false);
  }
  box(clk, W - 2.2, 9.6, 0.18, 0, 8.4, zFace - 0.32, MAT.glass, false);   // waist door glass

  // The pendulum: a pivot near the top of the waist, a slim rod and a heavy
  // GOLDEN bob — the swinging ballast. `update` rocks it on the clock.
  const pend = new THREE.Group();
  pend.position.set(0, 13.2, -0.2);
  clk.add(pend);
  cyl(pend, 0.11, 0.11, 8.0, 0, -4.0, 0, MAT.metal, 8, false);           // rod
  cyl(pend, 0.34, 0.34, 0.5, 0, -0.2, 0, MAT.metalDark, 10, false);      // suspension block
  const bob = sph(pend, 0.85, 0, -8.1, 0, MAT.rugGold);
  bob.scale.set(1, 1.12, 1);                                             // gold bob
  sph(pend, 0.22, 0, -8.1, 0.72, MAT.metalDark, false);                  // boss on the face

  // The hood: a wider trunk over the waist, cornice and a shallow arch.
  box(clk, W, 0.7, D, 0, 14.35, 0, MAT.wood);
  box(clk, W + 0.3, 6.4, D + 0.2, 0, 17.6, 0, MAT.woodDark);
  box(clk, W + 0.7, 0.8, D + 0.6, 0, 21.0, 0, MAT.wood);
  box(clk, W - 1.4, 1.4, D - 0.4, 0, 21.9, 0.3, MAT.wood);
  sph(clk, 0.55, 0, 22.9, 0.3, MAT.rugGold);

  // The dial: face, roman-style marks, seconds subdial, over glass.
  const face = cyl(clk, 2.0, 2.0, 0.24, 0, 17.6, zFace + 0.02, MAT.paper, 28);
  face.rotation.x = Math.PI / 2;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    box(clk, 0.16, 0.5, 0.14, Math.sin(a) * 1.65, 17.6 + Math.cos(a) * 1.65, zFace + 0.16, MAT.metalDark, false);
  }
  const sec = cyl(clk, 0.42, 0.42, 0.14, 0, 17.0, zFace + 0.15, MAT.paper, 16);
  sec.rotation.x = Math.PI / 2;

  // The hands on their own pivots, so `update` can turn them. Each hand is a
  // slim bar built OUT along +Y from a pivot at the dial centre, which puts it
  // at 12 o'clock at rest; the update rotates it clockwise from there.
  const handMat = MAT.metalDark;
  const hourPivot = new THREE.Group();
  hourPivot.position.set(0, 17.6, zFace + 0.26);
  clk.add(hourPivot);
  box(hourPivot, 0.20, 1.05, 0.12, 0, 0.50, 0, handMat, false);
  const minPivot = new THREE.Group();
  minPivot.position.set(0, 17.6, zFace + 0.32);
  clk.add(minPivot);
  box(minPivot, 0.14, 1.55, 0.12, 0, 0.72, 0, handMat, false);
  const secPivot = new THREE.Group();
  secPivot.position.set(0, 17.6, zFace + 0.38);
  clk.add(secPivot);
  box(secPivot, 0.06, 1.35, 0.10, 0, 0.58, 0, MAT.lockRed, false);
  cyl(clk, 0.12, 0.12, 0.2, 0, 17.6, zFace + 0.34, MAT.metal, 10, false);   // centre boss

  box(clk, W - 1.2, 5.6, 0.16, 0, 17.6, zFace + 0.06, MAT.glass, false);    // dial glass
  for (const s of [-1, 1]) {
    cyl(clk, 0.22, 0.22, 5.8, s * (W / 2 - 0.5), 17.6, zFace - 0.2, MAT.wood, 10, false);
  }

  const TAU = Math.PI * 2;
  return {
    group: clk,
    update(elapsed) {
      // The real time of day, so the clock is always right.
      const now = new Date();
      const secs = now.getSeconds() + now.getMilliseconds() / 1000;
      const mins = now.getMinutes() + secs / 60;
      const hrs = (now.getHours() % 12) + mins / 60;
      // Clockwise on the dial is a NEGATIVE rotation about the +Z face normal.
      hourPivot.rotation.z = -(hrs / 12) * TAU;
      minPivot.rotation.z = -(mins / 60) * TAU;
      secPivot.rotation.z = -(secs / 60) * TAU;
      // The pendulum swings on the clock, eased so it reads as a running beat.
      pend.rotation.z = Math.sin(elapsed * 2.0) * 0.12;
    },
  };
}

// The living room's big bookcase. 22 wide fits the gap between the two
// bookcase-side doorways, and it stands against the wall's face rather than
// its centre line, so its back edge is not inside the plaster.
//
// The carcass used to be ONE solid 22 x 18 x 3 block, with the shelves and the
// books drawn inside the same block — so from the room you saw a blank board
// and never a single spine. It is now a back panel, two cheeks, a top and a
// base with the FRONT left open, and the books stand in the opening where you
// can see them, just proud of the back panel.
function buildBookcase(g, x, z) {
  const bc = unit(g, 'bookcase', x, z);
  const W = 22, D = 3, T = 0.6, H = 18;
  box(bc, W, H, T, 0, H / 2, -D / 2 + T / 2, MAT.woodPale);                 // back
  for (const s of [-1, 1]) box(bc, T, H, D, s * (W / 2 - T / 2), H / 2, 0, MAT.woodPale);
  box(bc, W, T, D, 0, H - T / 2, 0, MAT.woodPale);                          // top
  box(bc, W, T, D, 0, T / 2, 0, MAT.woodPale);                              // base
  for (let s = 0; s < 3; s++) {
    const sy = 3.5 + s * 5;
    box(bc, W - T * 2, 0.5, D - T, 0, sy, T / 2, MAT.wood, false);          // shelf
    for (let i = 0; i < 10; i++) {
      box(bc, 1.5, 3.4, 2.4, -9 + i * 2, sy + 1.95, T / 2,
        [MAT.quilt, MAT.quilt2, MAT.wood, MAT.paper][i % 4], false);
    }
  }
  return bc;
}

// The dining room sideboard on the east wall.
function buildSideboard(g, x, z) {
  const sb = unit(g, 'sideboard', x, z);
  box(sb, 9, 9, 13, 0, 4.5, 0, MAT.woodPale);
  box(sb, 9.6, 0.6, 13.6, 0, 9.3, 0, MAT.wood, false);
  for (let i = 0; i < 2; i++) box(sb, 0.5, 4, 5, -4.8, 5, -3.5 + i * 7, MAT.woodDark, false);
  return sb;
}

// The front door: SHUT, and locked. All decoration on the room side of a wall
// that is already solid, plus the porch light and step that give it an outside.
function buildFrontDoor(g, shellT) {
  const f = FRONT_DOOR;
  const dw = f.z1 - f.z0, dc = (f.z0 + f.z1) / 2;
  // The door faces INTO the house. `inw` is +1 for a west wall (room side faces
  // +X) and -1 for an east one; every offset off the wall face is multiplied by
  // it, so the leaf, the hardware and the porch all flip together.
  const inw = f.inward;
  // `face` is the room-side plane of the wall; everything hangs off that.
  const face = f.at + inw * shellT / 2;
  const leaf = face + inw * 0.35;          // the door itself, proud of the plaster
  const out = f.at - inw * shellT / 2;     // the outer face, for the porch outside
  // Architrave round the opening, then the panelled leaf. Four panels, which
  // at this scale is what makes it read as a front door rather than a hatch.
  box(g, 0.7, f.h + 1.6, dw + 2.4, face + inw * 0.2, (f.h + 1.6) / 2, dc, MAT.trim);
  box(g, 0.9, f.h, dw, leaf, f.h / 2, dc, MAT.door);
  for (const s of [-1, 1]) {
    box(g, 0.5, f.h + 1.2, 1.1, face + inw * 0.3, (f.h + 1.2) / 2, dc + s * (dw / 2 + 0.4), MAT.trim, false);
  }
  for (let r = 0; r < 2; r++) {
    for (let c2 = 0; c2 < 2; c2++) {
      box(g, 0.4, f.h * 0.3, dw * 0.34, leaf + inw * 0.35, f.h * (0.2 + r * 0.42), dc + (c2 - 0.5) * dw * 0.42,
        MAT.doorDark, false);
    }
  }
  // Fanlight over the door, glazed, so the light from outside stops there.
  box(g, 0.5, 5, dw * 0.8, leaf, f.h + 2.6, dc, MAT.glass, false);
  for (let i = 0; i < 4; i++) {
    box(g, 0.55, 5, 0.45, leaf + inw * 0.1, f.h + 2.6, dc - dw * 0.3 + i * (dw * 0.2), MAT.trim, false);
  }
  // ---- The hardware, which is the whole point ---------------------------
  // A ring knocker high up, a letterbox, a knob, and then a row of things
  // that all say the same message in different ways: this door does not open.
  const knobX = leaf + inw * 1.1;
  sph(g, 0.9, knobX, 9, dc - dw / 2 + 2.6, MAT.metal);
  box(g, 1.2, 2.4, 5.5, knobX, 9, dc + 2, MAT.metalDark, false);      // letterbox
  box(g, 0.5, 0.5, 5.5, knobX + inw * 0.5, 11.4, dc + 2, MAT.metal, false);
  // Deadbolt: a big sliding bolt, thrown.
  box(g, 0.9, 1.6, 2.6, knobX + inw * 0.3, 6, dc - dw / 2 + 2.6, MAT.metal, false);
  box(g, 0.6, 1.2, 1.4, knobX + inw * 0.9, 6, dc - dw / 2 + 2.6, MAT.chrome, false);
  // Hasp and staple with a padlock hanging shut through them.
  box(g, 0.8, 1.2, 3.2, knobX + inw * 0.3, 3.4, dc + dw / 2 - 2.6, MAT.metal, false);
  box(g, 1.1, 3.2, 1.1, knobX + inw * 0.7, 2.4, dc + dw / 2 - 2.6, MAT.lockRed, false);
  // A security chain, drawn across the opening, permanently on.
  for (let i = 0; i < 7; i++) {
    box(g, 0.5, 0.5, 2.2, knobX + inw * (0.4 + i * 0.35), 17.5 - i * 0.55,
      dc - dw / 2 + 2.6 + i * 2.4, MAT.metal, false);
  }
  // Outside face: a porch light over the door and a step, so the door has an
  // outside to be a door to.
  box(g, 2.2, 2.2, 2.2, out - inw * 1.1, f.h + 3, dc, MAT.metalDark, false);
  sph(g, 0.7, out - inw * 1.1, f.h + 1.7, dc, MAT.bulb, false);
  box(g, 4, 1.2, dw + 5, out - inw * 2, 0.6, dc, MAT.counter, false);
  box(g, 6, 0.6, dw + 9, out - inw * 4.5, 0.3, dc, MAT.concrete, false);
}

// The back door: SHUT, and locked, with a glazed panel in its top. The same
// trick as the front door, one room over — all decoration on the room side of a
// shell wall that is already solid, with no trigger and no opening cut in it.
// It hangs on the foyer's NORTH wall, which is the only plain exterior wall the
// foyer has (the east one carries its window), so the glass reads as a real
// window you can see the sky through while the leaf stays shut.
function buildBackDoor(g, shellT) {
  const b = BACK_DOOR;
  const dw = b.x1 - b.x0, dc = (b.x0 + b.x1) / 2;
  // +1 for a west wall, -1 for an east one; -1 here, so the room side faces -Z.
  const inw = b.inward;
  const face = b.at + inw * shellT / 2;    // the room-side plane of the wall
  const leaf = face + inw * 0.35;          // the door itself, proud of the plaster
  const out = b.at - inw * shellT / 2;     // the outer face, for the step outside
  // Architrave round the opening, then the panelled leaf.
  box(g, dw + 2.4, b.h + 1.6, 0.7, dc, (b.h + 1.6) / 2, face + inw * 0.2, MAT.trim);
  box(g, dw, b.h, 0.9, dc, b.h / 2, leaf, MAT.door);
  for (const s of [-1, 1]) {
    box(g, dw * 0.34, b.h * 0.3, 0.4, dc + s * dw * 0.2, b.h * 0.22, leaf + inw * 0.35, MAT.doorDark, false);
  }
  // ---- The glazed top: a window set in the upper third of the leaf --------
  const gy = b.h * 0.78, gh = b.h * 0.34;
  box(g, dw * 0.88, gh, 0.3, dc, gy, leaf + inw * 0.25, MAT.glass, false);
  box(g, dw * 0.94, 0.6, 0.5, dc, gy + gh / 2, leaf + inw * 0.22, MAT.trim, false);  // head rail
  box(g, dw * 0.94, 0.6, 0.5, dc, gy - gh / 2, leaf + inw * 0.22, MAT.trim, false);  // sill rail
  box(g, dw * 0.94, 0.5, 0.5, dc, gy, leaf + inw * 0.22, MAT.trim, false);          // cross rail
  box(g, 0.5, gh + 1.2, 0.5, dc, gy, leaf + inw * 0.22, MAT.trim, false);           // centre mullion
  // ---- The hardware: it does not open -------------------------------------
  const knobZ = leaf + inw * 1.1;
  sph(g, 0.9, dc - dw * 0.36, 9, knobZ, MAT.metal);
  box(g, 2.6, 1.6, 0.9, dc + dw * 0.28, 8, knobZ + inw * 0.3, MAT.metal, false);     // deadbolt, thrown
  box(g, 1.4, 1.2, 0.6, dc + dw * 0.34, 8, knobZ + inw * 0.9, MAT.chrome, false);
  box(g, 3.2, 1.2, 0.8, dc + dw * 0.28, 3.4, knobZ + inw * 0.3, MAT.metal, false);  // hasp
  box(g, 1.1, 3.2, 1.1, dc + dw * 0.34, 2.4, knobZ + inw * 0.7, MAT.lockRed, false);// padlock
  // A step outside, so the door has an outside to be a door to.
  box(g, dw + 5, 1.2, 4, dc, 0.6, out - inw * 2, MAT.counter, false);
  box(g, dw + 9, 0.6, 6, dc, 0.3, out - inw * 4.5, MAT.concrete, false);
}

// The foyer's boot bench with the coat hooks on the wall above it and the
// umbrella stand at the door end.
//
// The coats used to be pinned at `z + 37` — 37 units north of the bench, which
// is through the shell and out of the house. They hang here instead: on pegs at
// the foyer's south wall, in the strip between the plaster and the back of the
// bench, which is where coat hooks go.
function buildCoatRack(g, x, z) {
  table(g, x, z, 20, 8, 2.6, 0, MAT.woodPale);
  for (const s of [-1, 1]) box(g, 3, 4, 1, x + s * 7, 2, z, MAT.wood, false);
  const wz = 48.25;                    // the strip between wall face and bench
  for (let i = 0; i < 4; i++) {
    const coat = unit(g, 'coat', x - 7.5 + i * 5, wz);
    const fabric = [MAT.quilt, MAT.sofa, MAT.cushion, MAT.quilt2][i];
    // The peg, going back into the wall it is screwed to. A cylinder, so the
    // furniture audit — which measures boxes — never sees it inside the plaster.
    const peg = cyl(coat, 0.3, 0.3, 2.4, 0, 15.6, -1.2, MAT.metal, 8, false);
    peg.rotation.x = Math.PI / 2;
    // Shoulders, body and sleeves: a coat, not a slab on a hook. 4.9 wide on a
    // 5 pitch so no two of them touch, and 1.4 deep because the strip they hang
    // in is only 1.5 deep.
    box(coat, 4.4, 1.4, 1.4, 0, 14.4, 0, MAT.metalDark, false);
    box(coat, 3.6, 11, 1.4, 0, 8.6, 0, fabric, false);
    for (const s of [-1, 1]) box(coat, 1.1, 6.5, 1.4, s * 1.9, 10.4, 0, fabric, false);
  }
  cyl(g, 0.5, 0.5, 10, x - 10, 5, z - 1, MAT.woodDark, 8, false);
  cyl(g, 1.2, 1.2, 4, x - 10, 2, z - 1, MAT.metalDark, 10, false);
}

// A stack of three tyres in the dark garage.
function buildTyreStack(g, x, z) {
  for (let i = 0; i < 3; i++) cyl(g, 3.6, 3.6, 1.7, x, 0.9 + i * 1.7, z, MAT.rubber, 16, false);
}

// The garage's workbench, with the shelf of tools above it and the tyre stack
// and drum standing against it. `ry` turns the whole piece: the dark garage's is
// rotated a quarter turn onto its EAST wall so it runs north-south and leaves the
// way-in lane down the middle clear. Built into a `unit` group so the furniture
// audit measures it as one piece instead of four loose boxes.
function buildWorkbench(g, x, z, ry = 0) {
  const wb = unit(g, 'workbench', x, z);
  wb.rotation.y = ry;
  box(wb, 20, 3, 5, 0, 1.5, 0, MAT.woodDark);
  box(wb, 21, 0.6, 6, 0, 3.3, 0, MAT.woodPale, false);
  for (let i = 0; i < 4; i++) {
    box(wb, 3, 2, 3, -7 + i * 5, 4.6, 0, i % 2 ? MAT.paper : MAT.woodDark, false);
  }
  buildTyreStack(wb, 12, 1);
  cyl(wb, 2.6, 2.6, 6, -10, 3, -2, MAT.signAmber, 14, false);
  return wb;
}

// A wall mirror: the framed reflecting pane the house hangs on walls. The
// dining room's mirror is the real one; the frame is the `vert` pane.
function buildWallMirror(g, x, z) {
  vert(g, 16, 12, x - 0.6, 15, z, -Math.PI / 2, MAT.mirror);
  return g;
}

// A single push door in a doorway that runs along Z (a constant-x wall). ONE
// opaque leaf hangs on the `a0` jamb and spans the whole opening when shut, so
// it blocks the view into the room. There is no collider — the car drives
// straight through — and the leaf is pushed by contact: it swings AWAY from
// whichever side the car is on, opening further the closer the car gets and
// falling shut behind it. Which way it swings is latched while it is open and
// only re-chosen once it is nearly shut again, so it does not flip back and
// forth as the car drives past. The whole rig is one `structure` group, so the
// furniture audit steps over it.
//
// `f` is { at, a0, a1, h }: the doorway's constant x, its z span, and its head
// height — the same shape the wall() gap uses.
function buildPushDoor(g, f) {
  const root = new THREE.Group();
  root.userData.structure = true;
  g.add(root);
  const width = f.a1 - f.a0;          // the one leaf spans the whole opening
  const H = f.h;                      // head height — for the bathroom, the ceiling
  const hinge = new THREE.Group();
  hinge.position.set(f.at, 0, f.a0);  // hung on the a0 jamb
  root.add(hinge);

  // A panelled interior door, not a slab: a frame of stiles (the two vertical
  // edges) and rails (top, bottom and a mid rail) standing proud, with recessed
  // panels set back between them on BOTH faces. The frame is the full leaf
  // thickness; the panels are thinner and centred, so each face reads as a pair
  // of inset sections — which is what makes it look like a real door head-on.
  const DOOR_T = 1.0;                 // the frame's thickness (proud of the panel)
  const PANEL_T = 0.4;                // the recessed panel stock
  const SW = Math.min(1.7, width * 0.16);   // stile width
  const RAIL_BOT = 2.6, RAIL_TOP = 1.6, RAIL_MID = 1.5;
  const innerW = width - 2 * SW;      // the panel field between the stiles
  const midY = H * 0.5;               // centre line of the mid rail
  const lower0 = RAIL_BOT, lower1 = midY - RAIL_MID / 2;
  const upper0 = midY + RAIL_MID / 2, upper1 = H - RAIL_TOP;
  const face = (w, h, d, y, z, mat) => box(hinge, w, h, d, 0, y, z, mat);

  // Stiles: full height, one at each edge.
  for (const z of [SW / 2, width - SW / 2]) face(DOOR_T, H, SW, H / 2, z, MAT.door);
  // Rails: top, bottom, and the mid rail that splits the two panels.
  face(DOOR_T, RAIL_TOP, innerW, H - RAIL_TOP / 2, width / 2, MAT.door);
  face(DOOR_T, RAIL_BOT, innerW, RAIL_BOT / 2, width / 2, MAT.door);
  face(DOOR_T, RAIL_MID, innerW, midY, width / 2, MAT.door);
  // Recessed panels, set back to PANEL_T, darker so the relief is visible.
  face(PANEL_T, lower1 - lower0, innerW, (lower0 + lower1) / 2, width / 2, MAT.doorDark);
  face(PANEL_T, upper1 - upper0, innerW, (upper0 + upper1) / 2, width / 2, MAT.doorDark);

  // A doorknob on the leading (free) stile, both faces. A chrome rose and ball;
  // the cylinders lie along X (across the door) so they read as a knob, not a pin.
  const knobY = H * 0.42;
  for (const s of [1, -1]) {
    const rose = cyl(hinge, 0.7, 0.7, 0.5, s * (DOOR_T / 2 + 0.25), knobY, width - SW / 2, MAT.chrome, 12, false);
    rose.rotation.z = Math.PI / 2;
    sph(hinge, 0.62, s * (DOOR_T / 2 + 0.85), knobY, width - SW / 2, MAT.chrome, false);
  }

  // Proportional, position-driven push: `press` ramps 0->1 as the car closes on
  // the doorway plane, reaching full as it crosses. REACH is about a car radius
  // so the swing starts at contact, not from across the room.
  const REACH = CAR_RADIUS + 0.8;
  const OPEN_ANGLE = 1.25;            // how far a full press swings the leaf
  let angle = 0;                      // current hinge rotation
  let swing = 0;                      // latched -1/+1 push direction
  const update = (carPos, delta) => {
    const dx = carPos.x - f.at;
    const inZ = carPos.z > f.a0 - 4 && carPos.z < f.a1 + 4;
    const press = inZ ? Math.max(0, Math.min(1, (REACH - Math.abs(dx)) / REACH)) : 0;
    let goal;
    if (press > 0.02) {
      // Away from the car: a car on +x pushes the leaf toward -x.
      if (swing === 0 || Math.abs(angle) < 0.04) swing = dx >= 0 ? -1 : 1;
      goal = swing * OPEN_ANGLE * press;
    } else {
      goal = 0;
      if (Math.abs(angle) < 0.04) swing = 0;   // free to re-latch once shut
    }
    angle += (goal - angle) * Math.min(1, 8 * delta);
    hinge.rotation.y = angle;
  };
  return { group: root, update };
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
  // One unmarked slab of the same cement as the garage floor, so the drive and
  // the floor read as a single surface running out from the roller door rather
  // than a marked-up apron butted onto a plainer interior.
  flat(g, driveW, driveD, driveCx, -0.2, driveCz, MAT.concrete);
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
// The playroom Hot Wheels track
// ============================================================================
// The geometry is the SAME shared builder the object explorer shows
// (playroom.js `makeHotWheels`), so the two can never drift. It is ONE group
// tagged `userData.structure`, so the furniture audit skips it — a loop-the-loop
// is not a wardrobe, and the rails would otherwise be measured as furniture.
// It carries no colliders: the drive is main.js's job, and a collider here would
// wall the playroom off.
function buildHotwheels(g) {
  const hw = makeHotWheels();
  hw.group.userData.structure = true;
  g.add(hw.group);
  return hw;
}

// ============================================================================
// The level
// ============================================================================
export async function addHouse(parent, opts = {}) {
  const g = new THREE.Group();
  parent.add(g);
  const C = [];        // colliders
  const lights = [];  // PointLights, for :debug
  // Start the driveable-surface list clean, so a second build (a restart, a hot
  // reload) does not stack a duplicate deck, dish and ramp on top of the first.
  if (typeof window !== 'undefined') window.__HOUSE_SURFACES = [];
  // The fire is built deep inside the living-room block but has to be reachable
  // from the return, so it is declared here and filled in down there. main.js
  // drives its flicker off the clock every frame.
  let fireplace = null;
  // The hall grandfather clock: { group, update(elapsed) }. main.js advances it
  // every house frame so its hands read the real time and its pendulum swings.
  let clock = null;
  // The playroom Lego box's spill controller: { tub, bricks, done }. main.js
  // watches `tub` topple and aims the bricks out in the tub's fall direction.
  let legoSpill = null;
  // The playroom Hot Wheels track: filled in by the playroom block, returned so
  // main.js can drive the car along it. See buildHotwheels above.
  let hotwheels = null;
  let playTrain = null;
  let playXylophone = null;
  let jackInTheBox = null;
  let terrarium = null;
  // The bathroom's push door (built with the interior walls, below).
  // main.js advances it each house frame; see buildPushDoor.
  let bathroomDoor = null;
  // NB: the shell thickness is `shellT`, not `wall`. There is a module-level
  // `function wall(...)` that builds the wall meshes, and destructuring it in
  // as `wall` would shadow that with a number — every wall() call below would
  // then be `3(...)`, which is a TypeError at build time, not a lint warning.
  const { minX, maxX, minZ, maxZ, ceil } = HOUSE;
  const shellT = HOUSE.wall;   // shell wall thickness
  const T = shellT;            // interior wall thickness (same as the shell)
  // No window sill sits below a grown-up's waist. The house's people stand 7-8
  // tall and their waist is around 4, so the sills start at 13 — high on the
  // wall, where a window belongs — and the glass runs up to 24, leaving plaster
  // under the ceiling for the header.
  const WIN_Y0 = 13, WIN_Y1 = 24;

  const phase = async (frac, label) => {
    if (typeof opts.onHousePhase === 'function') {
      try { opts.onHousePhase(frac, label); } catch (e) { /* progress is cosmetic */ }
    }
    await new Promise((res) => {
      if (window.requestAnimationFrame) window.requestAnimationFrame(() => window.requestAnimationFrame(res));
      else setTimeout(res, 0);
    });
  };

  // The house's furniture jiggles on a bump, exactly like the little shops in
  // the city: it rocks around the axis of the hit and springs back upright,
  // never falling. `r` is the collision reach of the piece, so driving down
  // the middle of a room rattles the things you graze and nothing further.
  const jiggle = (piece, r) => addKnockable(piece, r, {
    mode: 'wobble', wobbleAmp: 0.3, wobbleFreq: 8, wobbleDamping: 5,
  });

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
  // right where the front door is, which meant a cat swat could fire you through
  // it onto the grass and a "closed" front door was really a hole with a door
  // drawn over it. The shell is now continuous masonry with a locked door drawn
  // on the room side of it, and the only way out of this building is 90 metres
  // of dark garage away.
  const OPEN_TOP = 20;    // clear height under the dark garage's roller door
  // `inward` is which way the room side faces, so the skirting can be pushed
  // onto the wall's inner face instead of being buried inside it.
  //
  // The DARK GARAGE gets no windows at all, on either of its two shell sides.
  // It is the way out of the house and it is meant to be pitch black in there;
  // a row of windows along the north and west would light it like a room and
  // take the whole effect away. The west side has the roller door instead.
  const shellWalls = [
    // East: bathroom, then the foyer. No opening at all - the whole east side
    // is one unbroken wall.
    { axis: 'z', at: maxX + shellT / 2, a0: minZ - shellT, a1: maxZ + shellT, inward: -1,
      wins: [[-12, 2], [26, 40], [63, 77], [86, 95]] },
    // West: bedrooms and the living room, then the dark garage (z 46..94) with
    // no windows and the roller door in it. The window that used to sit at z
    // 30..44 is gone: the locked front door hangs there now, in solid masonry.
    { axis: 'z', at: minX - shellT / 2, a0: minZ - shellT, a1: maxZ + shellT, inward: 1,
      wins: [[-78, -62], [-44, -28], [0, 16]],
      opening: { a0: HOUSE_EXIT.z0, a1: HOUSE_EXIT.z1 } },
    // North: dark garage (blank), kitchen, dining, foyer. The foyer stretch is
    // plain masonry — its daylight comes from the back door's glazed top and
    // the east window, not from a window punched through behind the door.
    { axis: 'x', at: maxZ + shellT / 2, a0: minX - shellT, a1: maxX + shellT, inward: -1,
      wins: [[-40, -24], [-8, 8], [22, 38]] },
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
  orientalRug(g, -50, 16, 74, 50);
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
  // This used to be a roller door wound open, with a hole cut in the shell and a
  // trigger box in it. There is no hole and no trigger any more — the house is a
  // closed box, and this door is the visible proof of it. It hangs on the WEST
  // shell wall beside the roller door, so you can see a front door that is very
  // obviously a front door, with the deadbolt thrown, and there is nothing on
  // the other side of it but solid plaster.
  //
  // Everything here is decoration drawn on the room side of a wall that is
  // already solid. `box()`'s last argument is `cast`, not a collider flag, so
  // none of it blocks anything, and the shell panel behind it is one continuous
  // collider from the skirting to the ceiling. The only way out of this house
  // is the dark garage's roller door.
  {
    buildFrontDoor(g, shellT);
  }

  // ---- The back door: SHUT, locked, and glazed -----------------------------
  // The front door's twin, in the foyer: another locked door drawn on solid
  // masonry, this one with a clear glass panel in its top third so the sky shows
  // through while the leaf stays shut. Hangs on the foyer's north wall.
  {
    buildBackDoor(g, shellT);
  }

  // ---- The bathroom's push door --------------------------------------------
  // The bathroom has exactly one entrance, the doorway off the hall, and this is
  // the door in it: one opaque leaf that is pushed open by contact as the car
  // goes through, and falls shut to block the view into the room. main.js
  // advances it each house frame, the way it does the fireplace.
  {
    const w = HOUSE_WALLS.find((q) => q.axis === 'z' && q.at === 52 && q.gap);
    bathroomDoor = buildPushDoor(g, { at: w.at, a0: w.gap.a0, a1: w.gap.a1, h: w.gap.top });
  }

  await phase(0.5, 'the kitchen');

  // ---- The roller door: the only way out ----------------------------------
  // Drawn SHUT, in the west wall of the dark garage. The opening is a real hole
  // in the shell (the car leaves through it), but it must not read as one: the
  // garage is meant to be a sealed, pitch-black box, and a hole you can see the
  // street through ruins that. So the door is rolled all the way down over the
  // opening, filling it with slats. The car still gets out - the exit is a
  // scripted roll (see main.js) that passes through the door and then cuts - so
  // the door is decorative glass-none: it blocks the view, not the shot. The
  // lintel over the top is mesh-only so house collision (which ignores height)
  // never walls the opening shut.
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
    // The door itself, rolled all the way DOWN: a full-height ribbed roller
    // door filling the whole opening, so no daylight and no outside shows
    // through the hole behind it. Alternating shades read as the ribs, twin
    // horizontal rails break it into panels the way a real sectional door is
    // built, and a row of dark lites near the top finishes the inside face.
    const n = Math.ceil(OPEN_TOP / 0.75);
    const sh = OPEN_TOP / n;
    for (let i = 0; i < n; i++) {
      box(g, 1.1, sh * 0.98, ow - 0.3, ox, (i + 0.5) * sh, oc,
        i % 2 ? MAT.metal : MAT.metalDark, false);
    }
    // Horizontal rails, so the inside face reads as panelled rather than striped.
    for (const y of [OPEN_TOP * 0.5, OPEN_TOP - 1.1]) {
      box(g, 1.24, 0.6, ow - 0.2, ox, y, oc, MAT.metal, false);
    }
    // A row of lites across the top panel, framed in metal, dark so the sealed
    // garage never shows the outside through them.
    {
      const winN = 4;
      const ww = 3.2, wh = 2.2, wy = OPEN_TOP - 3.4;
      for (let k = 0; k < winN; k++) {
        const wz = oc + (k - (winN - 1) / 2) * (ow / winN);
        box(g, 1.3, wh + 0.5, ww + 0.5, ox, wy, wz, MAT.metal, false);
        box(g, 1.34, wh, ww, ox, wy, wz, MAT.tv, false);
      }
    }
    // A rubber bottom seal, because you drive over this one.
    box(g, 1.4, 0.5, ow - 0.1, ox + 0.1, 0.32, oc, MAT.rubber, false);
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
    // The kitchen's remaining walls and what is left of each:
    //   north shell  x -46..6     all of it, which is where the appliances go
    //   west  x=-46 z 47.5..62 and 82..94   (the garage doorway is z 62..82)
    //   east  x=6   z 47.5..54 and 84..94   (the dining opening is z 54..84)
    //   south z=46  OPEN: the whole kitchen|living boundary is gone (open plan)
    //
    // The north face is the shell, whose inner face IS the room's z1, so there
    // is no half-thickness to allow for on that side — only on the interior
    // walls, which are recorded by their centre line.
    //
    // ---- North wall: the working run -------------------------------------
    // The fridge is 7.2 wide, so its west edge has to be clear of the west
    // wall's inner face at x=-44.5 — at -42 it was 1.1 inside the plaster.
    jiggle(fridge(g, -40.5, 90.5, Math.PI), 4.6);
    // The whole working run is built as ONE piece by the shared kitchen kit: a
    // counter with a sink, a range with a real oven, the countertop clutter and
    // the wall tools. It is turned 180 so its back faces the north shell, and set
    // so the deepest fitting just reaches the shell's inner face at z=94. Built
    // as one group because the audit reads overlapping groups as intersecting
    // furniture, and a toaster standing on a counter overlaps it by definition.
    const galley = makeGalley({ pal: HOUSE_KITCHEN, s: 2.5 });
    galley.rotation.y = Math.PI;
    galley.position.set(-17.5, 0, 92.28);
    g.add(galley);
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
    jiggle(counterRun(g, r.x0 + 3.1, 54, 12, 0, 'z', false), 7);
    // ---- South side: the hutch, now freestanding on the open plan ------------
    // The kitchen|living wall is gone, so this stands as a low divider between
    // the two rooms rather than a cabinet against a wall.
    {
      const hutch = unit(g, 'hutch', -3, 49.2);
      box(hutch, 13, 14, 2, 0, 7, 0, MAT.woodPale);
      box(hutch, 13.6, 0.6, 2.6, 0, 14.2, 0, MAT.wood);
      for (let i = 0; i < 4; i++) box(hutch, 3, 2.6, 0.3, -4.5 + i * 3, 9, 1.2, MAT.metal, false);
      jiggle(hutch, 6);
    }
    // The island (and the stools and fruit bowl that went with it) has been
    // taken out: the kitchen keeps its wall runs, the hutch and the dresser, and
    // the middle of the floor is left open.
    // ---- East wall: a dresser in the solid stretch below the dining opening -
    // x=4.5 is that wall's inner face; the dresser is 3.1 wide with its handles
    // on the left, so it has to start at 9.6 to clear it.
    {
      const dr = unit(g, 'dresser', 2.8, 89);
      box(dr, 2, 12, 8, 0, 6, 0, MAT.woodPale);
      box(dr, 2.6, 0.6, 8.6, 0, 12.2, 0, MAT.wood, false);
      for (let i = 0; i < 2; i++) box(dr, 1, 1, 5, -1.3, 4 + i * 4, 0, MAT.metalDark, false);
      jiggle(dr, 3.5);
    }
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
    const dt = table(g, 27, 70, 24, 16, 4.4, 0, MAT.wood);
    jiggle(dt, 5.5);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const dc = chair(g, 27 + s * 14, 62 + i * 8, s > 0 ? -Math.PI / 2 : Math.PI / 2);
      jiggle(dc, 2.2);
    }
    for (let i = 0; i < 2; i++) {
      const dc2 = chair(g, 21 + i * 12, 82, Math.PI);
      jiggle(dc2, 2.2);
    }
    // A fruit bowl and a candle on the table, because someone eats here.
    sph(g, 2.6, 27, 5.8, 70, MAT.quilt2).scale.y = 0.5;
    cyl(g, 0.5, 0.5, 3, 27, 6.2, 70, MAT.porcelain, 10, false);
    sph(g, 0.6, 27, 8.2, 70, MAT.bulb, false);
    // Sideboard on the east wall. It has to sit north of z=80: the dining|foyer
    // opening is z 60..80, and a 22-long sideboard centred on z=60 stood
    // straight across the middle of it. It also has to clear that wall's inner
    // face at x=50.5 — it is 9.8 wide with the doors on the left, so x=45.5 is
    // as far east as it goes. (There is deliberately NO mirror hung here: the
    // dining|foyer boundary is an open cased opening with no wall above z=80, so
    // a mirror at r.x1 floated in mid-air between the two rooms.)
    const sb = buildSideboard(g, 45.5, 87);
    jiggle(sb, 3.6);
    // A dresser/hutch on the west side, facing the cased opening — and clear of
    // it. The kitchen|dining opening is z 54..84, so this has to start at z=84.
    // It is 2.8 wide with the handles on the right, and that wall's inner face
    // is x=7.5, so it can only start at x=8.0.
    {
      const hw = unit(g, 'dresser', r.x0 + 3.2, 89);
      box(hw, 2, 16, 9, 0, 8, 0, MAT.woodPale);
      for (let s = 0; s < 3; s++) {
        box(hw, 2.4, 0.5, 8, 0, 4 + s * 5, 0, MAT.wood, false);
        for (let i = 0; i < 3; i++) {
          box(hw, 1.6, 2.4, 2, 1.2, 6 + s * 5, -3 + i * 3,
            [MAT.paper, MAT.quilt, MAT.woodDark][i], false);
        }
      }
      jiggle(hw, 3);
    }
    const dp = pottedPlant(g, 14, 52, 1.1);
    jiggle(dp, 1.6);
  }

  await phase(0.64, 'the foyer');

  // ---- Foyer: the locked front door, and where you USED to arrive -------------
  // The arrival point moved to the dark garage, so this is the first room you
  // reach on foot rather than the one you are dropped in. The door still reads
  // as a front door, and it still does not open; there is solid plaster behind
  // it.
  {
    const r = ROOMS.foyer;
    // A console table under the fanlight, and a long runner.
    const foyerTable = table(g, 83, 70, 8, 30, 3.4, 0, MAT.wood);
    jiggle(foyerTable, 5);
    for (let i = 0; i < 3; i++) {
      const orb = sph(g, 0.7, 83, 5, 60 + i * 10, MAT.quilt2, false);
      jiggle(orb, 0.9);
    }
    // A real window in the east shell wall over the console table, where a
    // decorative mirror used to be pasted on the plaster (see the east wall's
    // `wins` list). It is a genuine opening with a frame and glass, so the foyer
    // gets daylight instead of a reflected panel.
    buildCoatRack(g, 68, 53);
    const fp = pottedPlant(g, 60, 87, 1.3);
    jiggle(fp, 1.6);
    // A mat inside the door, and the house number on the wall.
    rug(g, 70, 66, 22, 18, MAT.rugHall);
    box(g, 0.4, 3, 5, r.x1 - 0.5, 8, 88, MAT.lockRed, false);
  }

  await phase(0.7, 'the living room');

  // ---- Living room --------------------------------------------------------
  // 96 x 66. This is the single biggest room in the house and it is the reason
  // the plan is a square: at the old 58 x 98 the seating group and the fireplace
  // were fighting each other for floor.
  {
    const r = ROOMS.living;
    // The TV is on the EAST wall's solid stretch, not on the north one. The
    // north side (z=46) is fully open to the kitchen now, so a TV unit standing
    // against it would float in the opening.  Turned 90 degrees it is a
    // 3.6-wide, 20-deep cabinet running down the wall from z=22 to z=42, which
    // also puts it clear of the hall doorway at z -6..18.
    // Two couches facing each other across the coffee table, on the north and
    // south sides of it, so the fireplace on the west wall stays open and both
    // seats look across the table (and, off to the side, at the fire).
    const s1 = sofa(g, -46, -2, 0);
    jiggle(s1, 5);
    const s2 = sofa(g, -46, 30, Math.PI);
    jiggle(s2, 5);
    const lt = table(g, -46, 14, 20, 15, 2.2, 0, MAT.woodDark);
    jiggle(lt, 4.5);
    const tv = tvUnit(g, 2.5, 32, Math.PI / 2);
    jiggle(tv, 4.6);
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
    fireplace = buildFireplace(g, lights);
    // Bookcase along the south wall. It was 40 long, which is longer than the
    // stretch of that wall between the two doorways — it ran across both of
    // them. 22 wide fits the gap between them with room to spare, and it stands
    // against the wall's FACE (z -18.5) rather than its centre line (z -20):
    // 3.4 deep centred on -17.5 put its back edge inside the plaster.
    const bc = buildBookcase(g, -42, -16);
    jiggle(bc, 5);
    // A grand piano in the corner nobody sits in. Pulled in off both the solid
    // darkGarage|living wall at z=46 and the sofa to its east.
    {
      const pi = unit(g, 'piano', -82, 31);
      box(pi, 12, 4, 18, 0, 3, 0, MAT.woodDark);
      box(pi, 12.6, 0.5, 18.6, 0, 5.2, 0, MAT.paper, false);
      for (let i = 0; i < 5; i++) box(pi, 0.5, 0.4, 3, -5 + i * 2.4, 5.6, -8, MAT.trim, false);
      jiggle(pi, 5);
    }
    const pp1 = pottedPlant(g, -80, 38, 1.3);
    jiggle(pp1, 1.6);
    const pp2 = pottedPlant(g, -8, 0, 1.1);
    jiggle(pp2, 1.5);
    const pp3 = pottedPlant(g, 0, 40, 1.0);
    jiggle(pp3, 1.4);
    tableLamp(g, lights, -84, 4, -10, 18);
  }

  await phase(0.76, 'the bedrooms');

  // ---- Bedroom 1 ----------------------------------------------------------
  // The big bed stays where it was. The small one goes up onto the west wall,
  // turned 90 degrees: lying across the south strip it ran straight through the
  // garment rail below it, and there is no room in that corner for both.
  {
    const b1 = bed(g, -68, -58, 16, 22, 0, MAT.quilt);
    jiggle(b1, 5.2);
    const b2 = bed(g, -81, -33, 11, 14, Math.PI / 2, MAT.quilt2);
    jiggle(b2, 4.2);
    // Wardrobes belong ON a wall: this one is 3.6 deep turned 90 degrees, so it
    // has to come back to x=-85.5 to be within 3.5 of the west wall at -90.
    const w1 = wardrobe(g, -85.5, -70, 12, Math.PI / 2);
    jiggle(w1, 3.6);
    // The rail runs along the room's long axis against the south wall, and stops
    // short of the wall at x=-46, which it used to poke straight through.
    const sr1 = shelfRack(g, -70, -83, 26, 0, 'x');
    jiggle(sr1, 6);
    // ry stays 0: the table is authored 10 wide by 16 deep, and rotating it put
    // the 16 across the wall it is supposed to be standing against. It is on the
    // west wall now, clear of the small bed.
    const nt = table(g, -66, -34, 10, 16, 3.2, 0, MAT.wood);
    jiggle(nt, 3.6);
    tableLamp(g, lights, -70, 3.2, -34, 14);
    pottedPlant(g, -52, -30, 1.1);
    // (The toys live in the walk-in playroom next door. See that room below.)
    }

  // ---- Bedroom 2 ----------------------------------------------------------
  {
    const b3 = bed(g, 28, -58, 16, 22, 0, MAT.quilt2);
    jiggle(b3, 5.2);
    // The wardrobe is in the south-east corner. It cannot stand on that wall
    // anywhere north of z=-70: the bed2|closetA opening is z -70..50 and the car
    // needs 3.7 of clear floor each side of the wall's centre line to swing
    // through it, so the south strip is the only place on this wall it fits.
    const w2 = wardrobe(g, 48.2, -78, 12, -Math.PI / 2);
    jiggle(w2, 3.6);
    // Add a dresser against the east wall in bedroom 2
    {
      const dr = unit(g, 'dresser_bed2', 48, -34);
      const dresserHeight = 7;
      box(dr, 2.5, dresserHeight, 10, 0, dresserHeight/2, 0, MAT.woodPale);
      box(dr, 3.1, 0.6, 10.6, 0, dresserHeight + 0.2, 0, MAT.wood, false);
      for (let i = 0; i < 3; i++) {
        box(dr, 1.2, 1.2, 6, -1.3, 2 + i * 2, 0, MAT.metalDark, false);
      }
      jiggle(dr, 3.5);
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
    const dt2 = table(g, 30, -27, 16, 10, 3.2, 0, MAT.wood);
    jiggle(dt2, 3.6);
    const dc3 = chair(g, 30, -35, Math.PI);
    jiggle(dc3, 2.2);
    // Shortened, and moved in off the south wall, which it was crossing.
    const sr2 = shelfRack(g, 32, -82, 20, 0, 'x');
    jiggle(sr2, 5.2);
    pottedPlant(g, 12, -28, 1.0);
  }

  // ---- Children's playroom: reworked walk-in between the two bedrooms ---
  {
    const r = ROOMS.walkin;
    const mx = (r.x0 + r.x1) / 2, mz = (r.z0 + r.z1) / 2;
    // The toys are the SAME real models the object explorer shows: each one is a
    // builder from ./playroom.js, placed in a `unit()` group here so it is named
    // for the furniture audit. Nothing ad-hoc.
    //
    // Scatter toys (lego, castle, magnet) register every loose piece as its own
    // knockable in 'scatter' mode and cross-link them, so ONE hit bursts the whole
    // pile apart (like the town's fruit stalls). None of them push a collider:
    // they are toys you smash through, not walls.

    // The toy train: the real locomotive + the whole town consist, running ON
    // THE FLOOR all the way round a wall-hugging loop that threads EVERY room of
    // the house except the bathroom. The route itself lives in ./playtrain.mjs
    // (pure geometry, checked headless by ./playtrain.test.mjs); here we just
    // hand its dense point list to the track builder. It is one structure group,
    // so the furniture audit skips it, and it is NOT the Hot Wheels line.
    try {
      const pt = makePlayTrain({
        scale: 0.75,
        trestle: false,
        points: playTrainPoints(),
      });
      pt.group.userData.structure = true;
      const trainUnit = unit(g, 'play_train', 0, 0);
      trainUnit.userData.structure = true;
      trainUnit.add(pt.group);
      playTrain = pt;
    } catch (e) {}

    // ONE big bright-red rocking horse, on its own rocker rails.
    try {
      const horse = unit(g, 'play_horse', -30, -27);
      horse.add(makeRedHorse());
      // A rocking horse ROCKS on its rails when hit and springs back upright —
      // it never topples over, so it uses the wobble mode rather than a fall.
      addKnockable(horse, 1.6, {
        mode: 'wobble', wobbleAmp: 0.5, wobbleFreq: 5.5, wobbleDamping: 2.2,
      });
    } catch (e) {}

    // One clear Lego tub BURSTING with bricks. The tub is a wide, top-heavy box,
    // so it TOPPLES onto its side when hit (mode 'topple': it pivots about its
    // base edge and lies flat, never sinking into the floor). The bricks are
    // reparented OUT of the tub to the house group — same world spot, but no
    // longer riding the box — and registered as DORMANT scatter pieces: the car
    // cannot scatter them on its own. main.js watches the tub topple and then
    // releases the whole pile in the tub's fall direction (triggerKnockable), so
    // the box goes over FIRST and only then do the bricks come pouring out.
    try {
      const lego = unit(g, 'play_legobox', -3, -46);
      const lb = makeLegoBox();
      lego.add(lb.group);
      const legoTub = addKnockable(lego, 2.6, {
        mode: 'topple', toppleRadius: 2.0, fallTime: 0.55,
      });
      const bricks = [];
      for (const b of lb.bricks) {
        // Preserve the brick's world transform as it leaves the tub group, so
        // it still reads as sitting in the box until the box tips away.
        g.attach(b);
        bricks.push(addKnockable(b, 0.7, {
          mode: 'scatter', slideDistance: 3.0, flyHeight: 0.7, dormant: true,
        }));
      }
      legoSpill = { tub: legoTub, bricks, done: false };
    } catch (e) {}

    // The rocket: the actual spaceport lander, hung from the ceiling.
    try {
      const rocket = unit(g, 'play_rocket', 2, -64);
      rocket.add(makeHangingRocket({ scale: 0.62, hang: 14 }));
      rocket.position.y = 12;
    } catch (e) {}

    // The xylophone: rainbow metal bars, low enough to drive over.
    try {
      const xy = unit(g, 'play_xylophone', -12, -41);
      const xyl = makeXylophone();
      xy.add(xyl.group);
      // World positions + pitches of each bar, so main.js can ring a note as the
      // car rolls over it.
      playXylophone = {
        bars: xyl.bars.map((b) => ({ x: -12 + b.mesh.position.x, z: -41, freq: b.freq, len: b.len, w: b.w })),
      };
    } catch (e) {}

    // The block castle: a real little castle built block by block on a grass
    // mat. The grass is a mat (drive over it); every block is a linked scatter
    // piece, so ramming the castle brings the whole thing down in a heap.
    try {
      const castle = unit(g, 'play_castle', -1, -30);
      const cc = makeBlockCastle();
      castle.add(cc.group);
      const cs = [];
      for (const p of cc.pieces) cs.push(addKnockable(p, 1.0, { mode: 'scatter', slideDistance: 4, flyHeight: 0.5 }));
      for (const p of cs) p.linked = cs;
    } catch (e) {}

    // The magnet-tile parking structure. Every tile is a linked scatter piece.
    try {
      const mag = unit(g, 'play_magnettiles', -33, -66);
      const mc = makeMagnetCity();
      mag.add(mc.group);
      const ms = [];
      for (const p of mc.pieces) ms.push(addKnockable(p, 1.0, { mode: 'scatter', slideDistance: 3.5, flyHeight: 0.5 }));
      for (const p of ms) p.linked = ms;
    } catch (e) {}

    // The Hot Wheels track.
    try { hotwheels = buildHotwheels(g); } catch (e) {}

    // The pet lizard's glass terrarium, standing on its own cabinet on the
    // playroom floor at the north wall. The lizard turns to watch the car;
    // main.js advances it each house frame.
    try {
      const TX = -34.5, TZ = -80;
      const tj = makeTerrarium({ x: TX, z: TZ });
      const terrUnit = unit(g, 'play_terrarium', TX, TZ);
      terrUnit.position.y = 0.0;
      terrUnit.add(tj.group);
      terrarium = tj;
    } catch (e) {}

    // The Jack-in-the-box. Touch it and it winds itself up on the side, then a
    // clown on a giant spring flies out to surprise you before it is drawn
    // slowly back in. It is a toy you smash through, not a wall, so it carries
    // no collider - only a wobble, so it shrugs when the car hits it. main.js
    // reads the handle each frame to look for the touch and to run the gag.
    try {
      const JX = -38, JZ = -40;
      const jb = makeJackInTheBox({ x: JX, z: JZ });
      const jackUnit = unit(g, 'play_jackinthebox', JX, JZ);
      jackUnit.add(jb.group);
      addKnockable(jackUnit, 4.2, {
        mode: 'wobble', wobbleAmp: 0.16, wobbleFreq: 15, wobbleDamping: 4.5,
      });
      jackInTheBox = jb;
    } catch (e) {}

  }

  await phase(0.82, 'the bathroom');

  // ---- Bathroom -----------------------------------------------------------
  {
    const r = ROOMS.bathroom;
    // A proper drive-in bath: big enough to sit a car in (16 x 8), hard against
    // the east wall (room.x1 = 90) so the whole west half of the room stays a
    // lane. The tub's vertical porcelain is a ring of colliders below; its
    // driveable shape — the tiled deck, the dish and the surfboard ramp that
    // carries you up to the rim — is the surface list at the bottom of this block.
    const TUB = { x: 85.5, z: 28, R: 4, S: 8, H: 5.5 };
    tub(g, TUB.x, TUB.z, Math.PI / 2);
    // A ring of colliders around the rim with a gap on the WEST face, aligned
    // with the surfboard. House collision is 2D — a heightfield has no vertical
    // (see house/surfaces.js) — so these ARE the tub's walls: the car can only
    // get into the bath where the ramp meets the rim, which is the whole point.
    const gap = 3.5;                                        // the ramp is 7 wide
    const tubCollider = (cx, cz, hw, hd) =>
      C.push({ x: cx, z: cz, halfW: hw, halfD: hd, h: TUB.H, noRoof: true });
    tubCollider(TUB.x, TUB.z + TUB.R, TUB.R, 1);                    // north cap
    tubCollider(TUB.x, TUB.z + TUB.R + 1.5, TUB.R - 1.5, 0.8);      // ...its rounded end
    tubCollider(TUB.x, TUB.z - TUB.R, TUB.R, 1);                    // south cap
    tubCollider(TUB.x, TUB.z - TUB.R - 1.5, TUB.R - 1.5, 0.8);      // ...its rounded end
    // The surfboard's two rails, running west from the rim, so the only way onto
    // it is up its foot. These also close the last of the west face either side
    // of the ramp gap.
    tubCollider(79.25, TUB.z - gap, 4.25, 0.3);
    tubCollider(79.25, TUB.z + gap, 4.25, 0.3);
    // The toilet is on the east wall but turned to FACE INTO the room, its
    // cistern against the wall (it used to sit side-on, facing along the wall).
    toilet(g, 85.8, -13, -Math.PI / 2);
    sinkUnit(g, 87, 4, -Math.PI / 2);
    // A big mirror wall and a towel rail, so the room is not just appliances.
    box(g, 30, 16, 0.5, 70, 10, r.z1 - 0.5, MAT.mirror, false);
    for (let i = 0; i < 3; i++) {
      const rl = box(g, 5, 13, 0.8, 60 + i * 10, 8, -20, [MAT.paper, MAT.cushion, MAT.paper][i], false);
      jiggle(rl, 2.6);
    }
    box(g, 0.6, 0.6, 18, r.x0 + 0.6, 9, 12, MAT.chrome, false);
    // A bath mat on the open deck, because someone uses it.
    rug(g, 68, 42, 14, 8, MAT.rugHall);
    // The tiled surround, raised a low kerb so it reads as a deck: three flat
    // boxes, plus the driveable surfaces that match them. Keyed off house
    // bounds so the deck only exists where the car can actually reach it.
    const TILE_Y = 0.5;
    for (const [cx, cz, w, d] of [[70.5, 28, 21, 36], [85.5, 41, 9, 10], [85.5, 15, 9, 10]]) {
      box(g, w, TILE_Y, d, cx, TILE_Y / 2, cz, MAT.tile).userData.structure = true;
    }
    try {
      if (typeof window !== 'undefined') {
        if (!window.__HOUSE_SURFACES) window.__HOUSE_SURFACES = [];
        window.__HOUSE_SURFACES.push(
          pad(70.5, 28, 21, 36, TILE_Y),           // deck west of the tub
          pad(85.5, 41, 9, 10, TILE_Y),            // deck north of the tub
          pad(85.5, 15, 9, 10, TILE_Y),            // deck south of the tub
          // The dish inside the tub: rim level with the porcelain, floor just
          // above the bath's own base, steep enough to climb back out.
          bowl(TUB.x, TUB.z, TUB.R - 0.4, TUB.S / 2 + TUB.R - 0.4, TUB.H - 0.3, TUB.H - 0.9, { steep: 1.0 }),
          // The surfboard: a ramp leaning on the west rim, climbing from the
          // deck to the rim. Its top just reaches the dish so there is no seam,
          // but it does not run far over the dish — otherwise driving back out
          // would pop the car up onto the board's top edge.
          wedge(79.8, TUB.z, 0, 4.8, 7, (TUB.H - 0.3) - TILE_Y, TILE_Y)
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
    const mr1 = shelfRack(g, r.x0 + 4, -36.7, 22, 0, 'z');
    jiggle(mr1, 5);
    const mr2 = shelfRack(g, r.x1 - 4, -36.7, 22, 0, 'z');
    jiggle(mr2, 5);
    // A dressing table with a mirror — the reason a main closet has a corner
    // you can actually stand in. z=-29 rather than -28: the table is 9 deep, and
    // at -28 its north edge sat 3.7 from the wall's centre line, which is the
    // car radius plus half the wall — i.e. in the closet|bathroom doorway.
    const mdt = table(g, mx, r.z1 - 9, 20, 9, 3.2, 0, MAT.woodPale);
    jiggle(mdt, 3.8);
    vert(g, 18, 14, mx, 9, r.z1 - 0.6, Math.PI, MAT.mirror);
    const mdc = chair(g, mx, r.z1 - 18, 0);
    jiggle(mdc, 2.2);
    // A chest of drawers down the middle of the aisle. One `unit`, because the
    // drawer fronts are 12.4 across a 12 carcass and hang 0.2 proud of each end —
    // left as separate boxes the audit reads them as two pieces of furniture
    // stacked inside each other.
    {
      const chest = unit(g, 'chestOfDrawers', mx, mz);
      box(chest, 12, 7, 20, 0, 3.5, 0, MAT.wood);
      for (let i = 0; i < 4; i++) box(chest, 12.4, 1.2, 4.4, 0, 1.5 + i * 2, 0, MAT.woodDark, false);
      jiggle(chest, 5.2);
    }
  }

  await phase(0.9, 'the dark garage');

  // ---- The DARK GARAGE: the way out ---------------------------------------
  // Pitch black. There are no windows on either of its shell sides, no ceiling
  // lights, and the only source in the room is one clamp lamp on a tripod at
  // the far end. It is the only way out of the house, and it is deliberately
  // the last place you want to be.
  {
    const r = ROOMS.darkGarage;
    // The floor is one bare, unbroken slab of concrete: no stains, no patches,
    // nothing on it to catch the eye, and the whole room is kept clear down the
    // middle so the car can run the length of it into the exit. It is the same
    // cement the city's garage floor is, so both worlds' garages read alike.
    flat(g, r.x1 - r.x0 - 2, r.z1 - r.z0 - 2, (r.x0 + r.x1) / 2, 0.02, (r.z0 + r.z1) / 2, MAT.concrete);
    // The workbenches, hard against the north and south walls.
    const g1 = unit(g, 'bench', -58, 88.5);
    box(g1, 14, 3, 4, 0, 1.5, 0, MAT.woodDark);
    box(g1, 15, 0.6, 5, 0, 3.3, 0, MAT.woodPale, false);
    jiggle(g1, 4);
    // The workbench runs along the SOUTH wall, so the straight lane west along
    // z=72 from the kitchen doorway to the roller door stays clear.
    buildWorkbench(g, -66, 52);
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
    // Coat hooks in the mudroom at the north end.
    box(g, 0.6, 0.6, 14, r.x0 + 0.9, 14, 38, MAT.wood, false);
    for (let i = 0; i < 5; i++) {
      const hk = box(g, 1.4, 11, 3, r.x0 + 1.8, 9, 32 + i * 3, [MAT.quilt, MAT.sofa, MAT.cushion, MAT.quilt2, MAT.paper][i], false);
      jiggle(hk, 2);
    }
    // The old shoe rack here was two thin boards floating in mid-air with no
    // uprights; it read as a glitch, so it is gone.
    const hp1 = pottedPlant(g, 45.5, -4, 1.1);
    jiggle(hp1, 1.5);
    const hp2 = pottedPlant(g, 14, 38, 1.0);
    jiggle(hp2, 1.4);
    // A big painting on the hall's east wall, and a runner rug.
    vert(g, 20, 15, r.x1 - 0.4, 15, 24, -Math.PI / 2, MAT.quilt2);
    rug(g, 22, 6, 26, 20, MAT.rugHall);
    // A big grandfather clock standing against the hall's east wall, north of the
    // painting and clear of the bathroom's push door (z 4..16) and the bed2
    // doorway. Deliberately CHUNKY: a fat moulded plinth, a waist with a glazed
    // door over the swinging golden pendulum, and a hooded dial whose hands
    // track the real time of day.
    const gc = buildGrandfatherClock(g, r.x1 - 3.7, 38);
    clock = gc;
    jiggle(gc.group, 2.4);
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
  //
  // EXCEPT the play train and the Hot Wheels track. Everything else in the
  // house is allowed to go see-through when the chase cam would otherwise be
  // behind it, but these two are solid toys the player wants to watch: the
  // train chugging along the floor, and the orange track threading the whole
  // route. A track that faded like a wall read as a bug — it looked like it was
  // going transparent and blinking out of existence mid-run — so its meshes are
  // collected first and skipped by the tagging sweep, exactly like the train.
  const fadeExempt = new Set();
  if (playTrain) playTrain.group.traverse((o) => { if (o.isMesh) fadeExempt.add(o); });
  if (hotwheels) hotwheels.group.traverse((o) => { if (o.isMesh) fadeExempt.add(o); });
  g.traverse((o) => {
    if (o.isMesh && !fadeExempt.has(o)) o.userData.houseOccluder = true;
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
    // The hall grandfather clock: { group, update(elapsed) }. Its hands read
    // the real time of day and its golden pendulum swings.
    clock,
    // The playroom Lego box's spill controller: { tub, bricks, done }.
    legoSpill,
    // The playroom Hot Wheels track: { group, nodes, track } or null. main.js
    // captures the car onto `track` when it drives at the rails.
    hotwheels,
    // The playroom's animated toy train (the real locomotive on its little
    // circular track). main.js advances it each house frame.
    playTrain,
    // The xylophone's bars as world (x, z) + pitch, for the drive-over chime.
    playXylophone,
    // The Jack-in-the-box handle: touch() to start its gag, update() each house
    // frame. See playroom.js makeJackInTheBox / jack.mjs.
    jackInTheBox,
    // The playroom terrarium handle: update(delta, x, z) each house frame to idle
    // the lizard's tail and turn its head toward the car. See makeTerrarium.
    terrarium,
    // The bathroom's push door; main.js needs the car's position each frame so
    // it knows which way the leaf is being pushed.
    bathroomDoor,
    surfaces: (typeof window !== 'undefined' && window.__HOUSE_SURFACES) || [],
  };
}

// The object browser builds the house's furniture from these same builders, so
// a preview is the real geometry rather than a miniature. The furniture helpers
// take (g, x, z, ...) and place themselves at their real world spots; the
// build* pieces above are the lifted one-off blocks (fireplace, front door...).
export {
  MAT,
  bed, sofa, table, chair, wardrobe,
  shelfRack, counterRun, tub, toilet, sinkUnit,
  fridge, stove, tvUnit, rug,   pottedPlant,
  ceilingLight, tableLamp,
  buildFireplace, buildBookcase, buildSideboard, buildFrontDoor,
  buildCoatRack, buildWorkbench, buildTyreStack, buildWallMirror,
};


export function setMirrorEnv(tex) { if (MAT && MAT.mirror) { MAT.mirror.envMap = tex || null; MAT.mirror.needsUpdate = true; } }
