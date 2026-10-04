// ===== The object catalogue =====
//
// Every level's stuff, broken into categories and turned into small standalone
// models you can spin round in the object browser.
//
// Two rules hold this file together:
//
// 1. THE COORDINATES ARE WORLD COORDINATES. Not minimap ones. The browser's
//    "view in context" link teleports the car to the x/z recorded here, so a
//    minimap number pasted in would drop you on the wrong side of the map. (See
//    AGENTS.md for the conversion; nothing in this file needs it.)
//
// 2. NOTHING HERE IS THE REAL MESH. Every builder returns a small, self-
//    contained model with its own materials and its own geometry, sized to sit
//    comfortably on the showroom stage. That is deliberate: pulling the actual
//    world geometry out of five level files would mean holding references to
//    meshes that are parented into scenes the browser has never seen, and a
//    "preview" that visibly breaks when you leave the tab is worse than one that
//    is simply a small model of the same thing. The names, the shapes and the
//    proportions are the same; the geometry is not.
//
// Every object is `{ name, build, x, z }`:
//   - `name`  the label under the tile and in the object title (also the value
//             pushed into the URL as ?objects=)
//   - `build` a zero-arg factory returning a fresh Object3D every call
//   - `x`, `z` where the thing lives in the world, for "view in context"
//
// Categories are `{ id, name, blurb, objects }`. The ids are also what goes into
// the URL as ?cat=, so they must stay stable.

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// ===== Primitives =====
// Small wrappers so each object below is a list of shapes rather than a wall of
// `new THREE.Mesh(new THREE.BoxGeometry(...), new THREE.MeshStandardMaterial({...}))`.

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.75,
    metalness: opts.metalness ?? 0,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: opts.opacity !== undefined,
    opacity: opts.opacity ?? 1,
    flatShading: !!opts.flat,
  });
}

function group(name) {
  const g = new THREE.Group();
  g.name = name;
  return g;
}

function box(g, w, h, d, color, x, y, z, opts = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
  m.position.set(x, y, z);
  if (opts.rx) m.rotation.x = opts.rx;
  if (opts.rz) m.rotation.z = opts.rz;
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}

function cyl(g, rt, rb, h, color, x, y, z, opts = {}) {
  const seg = opts.seg || 16;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color, opts));
  m.position.set(x, y, z);
  if (opts.rx) m.rotation.x = opts.rx;
  if (opts.rz) m.rotation.z = opts.rz;
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}

function cone(g, r, h, color, x, y, z, opts = {}) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, opts.seg || 12), mat(color, opts));
  m.position.set(x, y, z);
  if (opts.rx) m.rotation.x = opts.rx;
  if (opts.rz) m.rotation.z = opts.rz;
  m.castShadow = true;
  g.add(m);
  return m;
}

function ball(g, r, color, x, y, z, opts = {}) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, opts.seg || 14, opts.seg2 || 10), mat(color, opts));
  m.position.set(x, y, z);
  if (opts.sx || opts.sy || opts.sz) m.scale.set(opts.sx ?? 1, opts.sy ?? 1, opts.sz ?? 1);
  m.castShadow = true;
  g.add(m);
  return m;
}

function plane(g, w, d, color, x, y, z, opts = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color, opts));
  m.position.set(x, y, z);
  m.rotation.x = opts.rx ?? -Math.PI / 2;
  g.add(m);
  return m;
}

// A row of lit windows across a wall face. `face` is which way the wall looks
// ('+z', '-z', '+x', '-x') so the same helper serves every building in the city.
function windows(g, cols, rows, w, h, d, color, x0, y0, z0, face, opts = {}) {
  const step = opts.step ?? 2.2;
  const up = opts.up ?? 2.4;
  const panel = opts.panel ?? 0.24;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const off = (c - (cols - 1) / 2) * step;
      const y = y0 + r * up;
      const px = face === '+x' || face === '-x' ? x0 : x0 + off;
      const pz = face === '+x' || face === '-x' ? z0 + off : z0;
      const ww = face === '+x' || face === '-x' ? panel : w;
      const dd = face === '+x' || face === '-x' ? w : panel;
      box(g, ww, h, dd, color, px, y, pz, { emissive: color, emissiveIntensity: opts.glow ?? 0.9, roughness: 0.3 });
    }
  }
}

// A generic city block: a mass with a parapet, a band of windows and a door.
// Every building in the city catalogue is this plus its own hat, so they read as
// a street of related buildings rather than a box of unrelated solids.
function blockBuilding(name, o) {
  const g = group(name);
  const w = o.w, h = o.h, d = o.d;
  box(g, w, h, d, o.wall, 0, h / 2, 0);
  // Parapet / cornice, a touch wider than the mass so the roofline reads.
  box(g, w + 0.5, 0.5, d + 0.5, o.trim, 0, h + 0.2, 0);
  if (o.band) box(g, w + 0.2, 0.35, d + 0.2, o.band, 0, h * 0.62, 0);
  const rows = Math.max(1, Math.floor((h - 2.6) / 2.6));
  windows(g, Math.max(1, Math.floor(w / 3)), rows, 1.5, 1.4, 0, o.glass || 0x9fd8ff,
    0, 2.2, d / 2 + 0.06, '+z', { glow: o.glow ?? 0.7 });
  windows(g, Math.max(1, Math.floor(d / 3)), rows, 1.5, 1.4, 0, o.glass || 0x9fd8ff,
    w / 2 + 0.06, 2.2, 0, '+x', { glow: o.glow ?? 0.7 });
  // Doorway on the +Z face, centred.
  box(g, 2.4, 3.2, 0.3, o.door || 0x3a2b22, 0, 1.6, d / 2 + 0.1);
  box(g, 2.9, 0.35, 0.7, o.trim, 0, 3.4, d / 2 + 0.3);
  if (o.sign) {
    box(g, w * 0.7, 1.1, 0.22, o.sign, 0, h - 1.0, d / 2 + 0.2, { emissive: o.sign, emissiveIntensity: 1.1 });
  }
  return g;
}

function obj(name, x, z, build) {
  return { name, x, z, build };
}

// A generic van-and-box body, which is what half the drivable rides are: a cab
// at the front, a loadspace behind it, and wheels underneath. The per-ride
// details are switches rather than six near-identical builders, because what
// makes the engine read as an ENGINE is the ladder and the deck gun, not its
// silhouette - the silhouette is shared with the taco truck on purpose.
//
// `cab` and `box` are [x, halfHeight] pairs: how far forward the cab sits and
// how tall it is. Everything is built along -X, like the cars in the world.
function vehicle(color, o = {}) {
  const g = group(o.name || 'Vehicle');
  const dark = 0x1b1b1b;
  const cream = 0xf2ece0;
  const glass = 0x2b3f55;
  const steel = 0xc4cad4;
  const [cabX, cabH] = o.cab || [-1.6, 1.4];
  const [boxX, boxH] = o.box || [1.1, 1.5];
  const len = o.long ? 4.4 : 3.6;
  const bodyW = o.wheels && o.wheels > 1 ? 2.5 : 2.3;
  const lift = o.lift || 0;
  const wheelR = 0.62 * (o.wheels || 1);
  const deckY = wheelR * 2 + lift;

  // Wheels first, so the body sits on top of them.
  const axles = o.long ? [-2.5, -0.4, 1.6, 3.0] : [-2.2, 1.6];
  for (const ax of axles) {
    for (const sz of [-bodyW / 2, bodyW / 2]) {
      const w = cyl(g, wheelR, wheelR, 0.36, dark, ax, wheelR, sz, { seg: 18, rz: Math.PI / 2 });
      w.material = mat(0x151515, { roughness: 0.95 });
      const hub = cyl(g, wheelR * 0.45, wheelR * 0.45, 0.38, steel, ax, wheelR, sz, { seg: 12, rz: Math.PI / 2 });
      hub.material = mat(0xc4cad4, { roughness: 0.35, metalness: 0.4 });
    }
  }

  // Cab.
  box(g, 2.4, cabH * 2, bodyW - 0.2, color, cabX, deckY + cabH, 0);
  box(g, 2.3, 0.16, bodyW - 0.35, cream, cabX, deckY + cabH * 2, 0);
  box(g, 1.5, 0.55, bodyW - 0.32, glass, cabX - 0.5, deckY + cabH * 1.35, 0, { roughness: 0.25 });
  box(g, 0.22, 0.8, bodyW - 0.7, dark, cabX - 1.25, deckY + cabH * 0.55, 0);
  box(g, 0.18, 0.3, bodyW, steel, cabX - 1.35, deckY + 0.28, 0);

  if (o.openWheel) {
    // An open-wheel racer instead of a van: a low nose, an engine cowl behind
    // the seat and a wing at the back.
    box(g, 3.2, 0.5, 1.3, color, -1.0, deckY + 0.55, 0);
    box(g, 1.1, 0.7, 1.0, color, 0.5, deckY + 0.9, 0);
    box(g, 0.5, 0.5, 0.9, dark, -0.1, deckY + 1.05, 0);
    for (const sz of [-1.15, 1.15]) {
      for (const ax of [-1.6, 1.5]) {
        const w = cyl(g, 0.66, 0.66, 0.42, dark, ax, 0.66, sz, { seg: 16, rz: Math.PI / 2 });
        w.material = mat(0x151515, { roughness: 0.95 });
      }
    }
    if (o.spoiler) {
      box(g, 0.16, 0.7, 2.2, color, 2.5, deckY + 1.2, 0);
      box(g, 0.7, 0.12, 2.2, color, 2.6, deckY + 1.55, 0);
    }
    return g;
  }

  // Loadspace.
  box(g, len, boxH * 2, bodyW, color, boxX, deckY + boxH, 0);
  box(g, len + 0.1, 0.18, bodyW + 0.1, cream, boxX, deckY + boxH * 2, 0);
  if (o.windows) {
    // A bus's windows: a continuous band down each flank.
    for (const sz of [-1, 1]) {
      box(g, len - 0.9, 0.9, 0.1, glass, boxX, deckY + boxH * 1.35, sz * (bodyW / 2 + 0.02), { roughness: 0.25 });
    }
  }
  if (o.hatch) {
    // The taco truck's serving hatch, thrown up on its side.
    box(g, len - 1.2, 1.5, 0.12, cream, boxX, deckY + boxH * 1.25, bodyW / 2 + 0.06);
    box(g, len - 1.6, 0.9, 0.08, 0x1e1e1e, boxX, deckY + boxH * 1.15, bodyW / 2 + 0.14);
  }
  if (o.awning) {
    box(g, len - 0.6, 0.1, 1.1, 0x3f7d3a, boxX + 0.3, deckY + boxH * 2.2, bodyW / 2 + 0.55, { rx: 0.2 });
    for (const sz of [-0.45, 0.45]) {
      box(g, 0.08, 0.8, 0.08, steel, boxX + 0.3, deckY + boxH * 1.9, bodyW / 2 + sz + 0.6);
    }
  }
  if (o.sign) {
    // The roof sign, lit.
    box(g, 2.0, 0.7, 0.12, cream, boxX, deckY + boxH * 2 + 0.5, 0);
    box(g, 1.7, 0.42, 0.08, 0xfff3cf, boxX, deckY + boxH * 2 + 0.5, 0.1,
      { emissive: 0xffbb33, emissiveIntensity: 1.0 });
  }
  if (o.lightbar) {
    // The engine's beacons: red on the left, amber on the right, and the
    // white flashers in between.
    box(g, 1.5, 0.18, 1.0, dark, cabX + 0.5, deckY + cabH * 2 + 0.12, 0);
    box(g, 0.5, 0.22, 0.4, 0xff2a2a, cabX + 0.2, deckY + cabH * 2 + 0.28, -0.32,
      { emissive: 0xff2222, emissiveIntensity: 1.4 });
    box(g, 0.5, 0.22, 0.4, 0xffb020, cabX + 0.2, deckY + cabH * 2 + 0.28, 0.32,
      { emissive: 0xff9900, emissiveIntensity: 1.4 });
    box(g, 0.3, 0.18, 0.3, 0xf4f8ff, cabX + 0.85, deckY + cabH * 2 + 0.26, 0,
      { emissive: 0xeef4ff, emissiveIntensity: 1.2 });
  }
  if (o.ladder) {
    // The roof ladder: two rails and eight rungs, which is the whole reason
    // this silhouette reads as a fire engine.
    const ly = deckY + boxH * 2 + 0.18;
    for (const sz of [-0.45, 0.45]) {
      box(g, len + 0.6, 0.09, 0.09, 0xdfe3ea, boxX, ly, sz, { metalness: 0.3, roughness: 0.5 });
    }
    for (let i = 0; i < 8; i++) {
      box(g, 0.07, 0.07, 0.95, 0xdfe3ea, boxX - len / 2 + 0.3 + i * (len / 8), ly, 0,
        { metalness: 0.3, roughness: 0.5 });
    }
  }
  if (o.nozzle) {
    // The deck gun: a pedestal with a barrel laid back over the body.
    cyl(g, 0.22, 0.26, 0.5, steel, boxX - len / 2 + 0.9, deckY + boxH * 2 + 0.35, 0);
    const barrel = cyl(g, 0.12, 0.16, 1.5, 0xd8451f, boxX - len / 2 + 1.1, deckY + boxH * 2 + 1.0, 0,
      { rz: Math.PI / 2 });
    barrel.material = mat(0xc8202a, { metalness: 0.25, roughness: 0.5 });
    // The water tank and its gauge board, on the offside.
    box(g, 1.2, 0.9, 0.14, 0x8a9099, boxX + 0.9, deckY + boxH * 1.2, -bodyW / 2 - 0.06,
      { metalness: 0.35, roughness: 0.5 });
  }
  if (o.roller) {
    // The roller replaces the rear axle: one very wide drum.
    const drum = cyl(g, 1.15, 1.15, 2.6, 0xf2b705, 1.9, 1.15, 0, { seg: 20, rz: Math.PI / 2 });
    drum.material = mat(0xd8a520, { roughness: 0.6, metalness: 0.2 });
  }
  if (o.lift) {
    // The monster truck's lift: a visible gap between the body and the axles.
    for (const sz of [-bodyW / 2, bodyW / 2]) {
      box(g, len * 0.8, 0.16, 0.16, steel, boxX, deckY * 0.5, sz * 0.7, { metalness: 0.5, roughness: 0.4 });
    }
  }
  return g;
}

// ===== The levels =====
// Order is the order the Levels tab lists them in. `id` must match `worldState`
// in main.js, because that is how the teleport knows where to put you.

export const LEVELS = [
  { id: 'city', label: 'City', blurb: 'The town: shops, a school, the fire station.' },
  { id: 'underground', label: 'Underground', blurb: 'The neon cavern under the world, and the Glass City.' },
  { id: 'ramp', label: 'Rampworld', blurb: 'The rolling hills, the velodrome, the wheel of death.' },
  { id: 'house', label: 'Rampworld House', blurb: 'Every room of the house, one category at a time.' },
  { id: 'beach', label: 'Beach', blurb: 'The cove: the campfire, the palms, the reefs.' },
];

// ===== CITY =====
// Categories are the buildings, then the street furniture, because that is the
// shape of the level: a ring of named blocks you drive between, with the
// ordinary town clutter on the sidewalks.

function cityCategories() {
  return [
    {
      id: 'shops', name: 'Shops & Civic', blurb: 'The middle of town.',
      objects: [
        obj('Bodega', -22.5, 19.6, () => {
          const g = blockBuilding('Bodega', {
            w: 11, h: 8.5, d: 10, wall: 0xc9a06a, trim: 0xe8dcc0, band: 0x9c3b2e,
            glass: 0xffe9b0, sign: 0xd8451f, door: 0x2f6b4a, glow: 1.0,
          });
          // The awning over the door, and crates out front.
          box(g, 7, 0.2, 1.8, 0x9c3b2e, 0, 3.7, 5.6, { rx: 0.22 });
          box(g, 1.4, 1.2, 1.4, 0x8a6b46, -3.4, 0.6, 6.0);
          box(g, 1.1, 0.9, 1.1, 0x7a5c3c, -2.1, 0.45, 6.4);
          return g;
        }),
        obj('School', 34.5, 27, () => {
          const g = blockBuilding('School', {
            w: 20, h: 11, d: 13, wall: 0xb4643c, trim: 0xe4d6c0, band: 0x8c4a2c,
            glass: 0xfff2cc, sign: 0x2f5fa8, glow: 0.5,
          });
          // Clock tower on the roof.
          box(g, 4, 6, 4, 0x9c5a34, -6, 14, 0);
          box(g, 4.4, 0.5, 4.4, 0xe4d6c0, -6, 17.2, 0);
          cone(g, 2.6, 3.4, 0x2f3a4a, -6, 19, 0);
          const face = cyl(g, 1.3, 1.3, 0.3, 0xf5f0e0, -6, 15, 2.1, { rx: Math.PI / 2 });
          face.rotation.x = Math.PI / 2;
          box(g, 0.14, 1.0, 0.1, 0x2b2b2b, -6, 15.5, 2.3);
          box(g, 0.7, 0.14, 0.1, 0x2b2b2b, -6, 15, 2.3);
          // Flagpole.
          cyl(g, 0.1, 0.1, 6, 0xd8d8d8, 8, 3, 0);
          box(g, 1.6, 1.0, 0.08, 0xc03a3a, 8.8, 5.4, 0);
          return g;
        }),
        obj('Library', 40, 54, () => {
          const g = blockBuilding('Library', {
            w: 15, h: 14, d: 14, wall: 0xd9cdb4, trim: 0xf2ece0, band: 0x8a7a5c,
            glass: 0xe8f4ff, door: 0x6b4a2c, glow: 0.4,
          });
          // Six big columns down the front.
          for (let i = 0; i < 6; i++) cyl(g, 0.55, 0.62, 9, 0xf2ece0, -6 + i * 2.4, 4.5, 7.4);
          box(g, 16, 1.2, 2.2, 0xf2ece0, 0, 9.6, 7.4);
          // Pediment.
          cone(g, 8.2, 3.2, 0xe6dcc6, 0, 11.6, 0, { seg: 4, rz: Math.PI / 4 });
          return g;
        }),
        obj('City Hall', -49.5, 92, () => {
          const g = blockBuilding('City Hall', {
            w: 17, h: 12, d: 12, wall: 0xe6e0cf, trim: 0xfffdf5, band: 0x9a927e,
            glass: 0xfff6d8, door: 0x4a5f3a, glow: 0.5,
          });
          // Dome on a drum.
          cyl(g, 3.4, 3.6, 2.2, 0xf2ecdd, 0, 13.4, 0);
          const dome = ball(g, 3.6, 0xb08d4a, 0, 16, 0, { sy: 0.85 });
          dome.material.metalness = 0.4;
          cyl(g, 0.14, 0.14, 2.4, 0xd8b45a, 0, 18.6, 0);
          ball(g, 0.4, 0xd8b45a, 0, 19.9, 0);
          return g;
        }),
        obj('Bank', -24, 92, () => {
          const g = blockBuilding('Bank', {
            w: 14, h: 10, d: 12, wall: 0xded6c4, trim: 0xf6f2e6, band: 0xb0a68e,
            glass: 0xe0f0ff, door: 0x2a3f5a, glow: 0.4,
          });
          // Four fat columns and a pediment, the classic bank front.
          for (let i = 0; i < 4; i++) cyl(g, 0.8, 0.9, 8, 0xf6f2e6, -5 + i * 3.4, 4, 6.6);
          box(g, 15, 1.3, 2.4, 0xf6f2e6, 0, 8.7, 6.6);
          cone(g, 7.4, 2.8, 0xece4d2, 0, 10.6, 0, { seg: 4, rz: Math.PI / 4 });
          return g;
        }),
        obj('Hospital', 26, 95, () => {
          const g = blockBuilding('Hospital', {
            w: 18, h: 16, d: 14, wall: 0xf0f2f4, trim: 0xd8dee4, band: 0xb0c0cc,
            glass: 0xdcf2ff, door: 0x4a90c8, glow: 0.6,
          });
          // The big red cross on the tower face.
          box(g, 14, 2.6, 0.3, 0xded6c4, 0, 8.5, 7.1);
          box(g, 2.6, 2.6, 0.3, 0xd8323c, 0, 12, 7.2, { emissive: 0xd8323c, emissiveIntensity: 0.7 });
          box(g, 2.6, 2.6, 0.3, 0xd8323c, 0, 12, 7.25);
          box(g, 1.0, 6.4, 0.3, 0xd8323c, 0, 12, 7.2, { emissive: 0xd8323c, emissiveIntensity: 0.7 });
          box(g, 6.4, 1.0, 0.3, 0xd8323c, 0, 12, 7.2);
          return g;
        }),
        obj('Fire Station', 64, -39.5, () => {
          const g = blockBuilding('Fire Station', {
            w: 14, h: 8, d: 11, wall: 0xc4382f, trim: 0xf0e8dc, band: 0x8f2620,
            glass: 0xffe0b0, door: 0x8f2620, glow: 0.8,
          });
          // Two tall engine-bay doors.
          for (let i = 0; i < 2; i++) {
            box(g, 4.4, 5.0, 0.3, 0x2a2a2a, -3.4 + i * 6.8, 2.5, 5.6);
            for (let b = 0; b < 4; b++) box(g, 4.2, 0.1, 0.34, 0x8a8a8a, -3.4 + i * 6.8, 1.0 + b * 1.2, 5.65);
          }
          // The hose-drying tower.
          cyl(g, 1.4, 1.6, 9, 0xc4382f, 5.4, 12.5, -2.5);
          cyl(g, 1.7, 1.7, 0.4, 0xf0e8dc, 5.4, 17.2, -2.5);
          // Warning light.
          ball(g, 0.4, 0xff3020, -5, 9.2, 5.4, { emissive: 0xff3020, emissiveIntensity: 2.0 });
          return g;
        }),
        obj('Gas Station', 44, -42, () => {
          const g = group('Gas Station');
          // The shop.
          box(g, 9, 5, 7, 0xf0ead8, -4, 2.5, 0);
          box(g, 9.6, 0.4, 7.6, 0xd8451f, -4, 5.2, 0);
          box(g, 6, 2.2, 0.3, 0x9fd8ff, -4, 3.0, 3.6, { emissive: 0x9fd8ff, emissiveIntensity: 0.5 });
          // The canopy on two posts.
          box(g, 12, 0.7, 9, 0xf0ead8, 5, 5.0, 0);
          box(g, 12.4, 0.3, 9.4, 0xd8451f, 5, 5.45, 0);
          for (const pz of [-3.2, 3.2]) {
            cyl(g, 0.35, 0.4, 4.8, 0xc8ccd4, 1.5, 2.4, pz);
            cyl(g, 0.35, 0.4, 4.8, 0xc8ccd4, 8.5, 2.4, pz);
          }
          // Two pumps.
          for (const px of [3.5, 7]) {
            box(g, 0.9, 1.9, 0.6, 0xd8d8d8, px, 1.0, 0);
            box(g, 1.0, 0.6, 0.7, 0xd8451f, px, 2.1, 0);
          }
          // The price pylon.
          box(g, 1.2, 7, 0.5, 0xf0ead8, -8.5, 3.5, -3.0);
          box(g, 1.0, 3.2, 0.3, 0x1a1a1a, -8.5, 6.2, -3.0, { emissive: 0xff8a2a, emissiveIntensity: 0.8 });
          return g;
        }),
      ],
    },
    {
      id: 'homes', name: 'Homes & Yards', blurb: 'Where people live.',
      objects: [
        obj('Apartment Block', -58, -22, () => {
          const g = blockBuilding('Apartment Block', {
            w: 16, h: 22, d: 13, wall: 0xc09070, trim: 0xe8d8c0, band: 0x8a5a44,
            glass: 0xffe0a0, door: 0x5a4632, glow: 0.7,
          });
          // Balconies stacked up two faces.
          for (let r = 0; r < 6; r++) {
            box(g, 16.6, 0.25, 1.5, 0xe8d8c0, 0, 4 + r * 3.2, 7.2);
            box(g, 1.5, 0.25, 13.6, 0xe8d8c0, 8.4, 4 + r * 32, 0);
          }
          return g;
        }),
        obj('Suburban House', -22, -68, () => {
          const g = group('Suburban House');
          box(g, 11, 5, 9, 0xe8d8c0, 0, 2.5, 0);
          // Hipped roof in two slopes.
          const roof = box(g, 12, 0.7, 10, 0x8a4a3a, 0, 5.4, 0, { rz: 0.0 });
          cone(g, 8.0, 3.4, 0x8a4a3a, 0, 6.6, 0, { seg: 4, rz: Math.PI / 4, sy: 0.6 });
          box(g, 1.2, 3.2, 1.2, 0x9a5a48, 3.5, 7.6, -2);
          box(g, 2.0, 2.4, 0.3, 0xbfe0ff, -3, 3.0, 4.6, { emissive: 0xbfe0ff, emissiveIntensity: 0.5 });
          box(g, 1.4, 2.6, 0.3, 0x5a4632, 1.5, 1.3, 4.6);
          // Shrubs.
          ball(g, 1.0, 0x4a7a3a, -4.5, 0.9, 5.2, { sy: 0.8 });
          ball(g, 0.8, 0x4a7a3a, 4.0, 0.8, 5.0, { sy: 0.8 });
          return g;
        }),
        obj('House Garage', -22, -49, () => {
          const g = group('House Garage');
          box(g, 9, 4.5, 8, 0xdad0bc, 0, 2.25, 0);
          box(g, 9.6, 0.5, 8.6, 0x6a6a6a, 0, 4.7, 0);
          // The roller door, in four slats.
          for (let i = 0; i < 4; i++) box(g, 6.4, 0.7, 0.3, 0xc0c8d0, 0, 0.5 + i * 0.8, 4.1);
          box(g, 7.0, 0.4, 0.5, 0x8a929a, 0, 4.2, 4.2);
          // The little lamp over it.
          ball(g, 0.28, 0xffe0a0, 0, 4.4, 4.5, { emissive: 0xffe0a0, emissiveIntensity: 1.6 });
          return g;
        }),
        obj('Front Lawn Set', -22, -62, () => {
          const g = group('Front Lawn Set');
          plane(g, 12, 8, 0x5a8a44, 0, 0.02, 0);
          // Hedge, mailbox, a tree.
          box(g, 12, 1.0, 0.7, 0x3f6b33, 0, 0.5, -3.6);
          cyl(g, 0.1, 0.1, 1.2, 0x6a4a2c, 4.5, 0.6, 3.4);
          box(g, 0.5, 0.4, 0.9, 0x3a5a8a, 4.5, 1.3, 3.4);
          cyl(g, 0.35, 0.5, 2.4, 0x6a4a2c, -3.5, 1.2, 2.6);
          ball(g, 1.9, 0x4a7a3a, -3.5, 3.4, 2.6, { sy: 0.9 });
          ball(g, 1.3, 0x5a8a44, -3.2, 4.4, 2.8, { sy: 0.9 });
          return g;
        }),
      ],
    },
    {
      id: 'street', name: 'Street Furniture', blurb: 'The ordinary town clutter.',
      objects: [
        obj('Street Lamp', 6, -20, () => {
          const g = group('Street Lamp');
          cyl(g, 0.5, 0.7, 0.4, 0x4a4a4a, 0, 0.2, 0);
          cyl(g, 0.16, 0.2, 6.4, 0x3a4048, 0, 3.4, 0);
          box(g, 1.4, 0.16, 0.16, 0x3a4048, 0.6, 6.6, 0);
          box(g, 0.9, 0.3, 0.5, 0xf0e8d0, 1.2, 6.4, 0, { emissive: 0xffe0a0, emissiveIntensity: 1.8 });
          return g;
        }),
        obj('Traffic Light', 11, 11, () => {
          const g = group('Traffic Light');
          cyl(g, 0.45, 0.6, 0.4, 0x4a4a4a, 0, 0.2, 0);
          cyl(g, 0.18, 0.22, 5.4, 0x2f3438, 0, 2.9, 0);
          box(g, 0.7, 1.9, 0.6, 0x24282c, 0, 5.9, 0);
          const cols = [0xff3b30, 0xffcc00, 0x34c759];
          for (let i = 0; i < 3; i++) {
            ball(g, 0.2, cols[i], 0, 6.6 - i * 0.6, 0.33, { emissive: cols[i], emissiveIntensity: i === 2 ? 1.8 : 0.15 });
          }
          box(g, 0.7, 0.16, 0.7, 0x24282c, 0, 5.0, 0);
          return g;
        }),
        obj('Fire Hydrant', -12, 8, () => {
          const g = group('Fire Hydrant');
          cyl(g, 0.34, 0.4, 0.9, 0xd8323c, 0, 0.45, 0);
          ball(g, 0.34, 0xd8323c, 0, 0.95, 0, { sy: 0.7 });
          cyl(g, 0.1, 0.12, 0.3, 0x9a2020, 0, 1.2, 0);
          cyl(g, 0.12, 0.12, 0.5, 0xb02a2a, 0, 0.6, 0, { rz: Math.PI / 2 });
          cyl(g, 0.3, 0.34, 0.16, 0x8a1a1a, 0, 0.08, 0);
          return g;
        }),
        obj('Bench', -8, 24, () => {
          const g = group('Bench');
          for (const sx of [-1.2, 1.2]) {
            box(g, 0.2, 0.6, 0.7, 0x3a4048, sx, 0.3, 0);
            box(g, 0.16, 1.1, 0.16, 0x3a4048, sx, 0.95, -0.3, { rz: 0.2 });
          }
          for (let i = 0; i < 3; i++) box(g, 3.0, 0.12, 0.24, 0x8a5a34, 0, 0.62, -0.24 + i * 0.26);
          for (let i = 0; i < 3; i++) box(g, 3.0, 0.12, 0.2, 0x8a5a34, 0, 1.0 + i * 0.26, -0.34, { rx: 0.18 });
          return g;
        }),
        obj('Mailbox', 16, 30, () => {
          const g = group('Mailbox');
          cyl(g, 0.08, 0.1, 1.1, 0x6a6a6a, 0, 0.55, 0);
          box(g, 0.1, 0.1, 0.6, 0x6a6a6a, 0, 1.1, 0.3);
          box(g, 0.6, 0.5, 1.1, 0x2a5fa8, 0, 1.3, 0.6);
          const lid = cyl(g, 0.3, 0.3, 0.6, 0x2a5fa8, 0, 1.55, 0.6, { rx: Math.PI / 2 });
          lid.scale.set(1, 1, 1);
          box(g, 0.5, 0.12, 0.06, 0x1a3f78, 0, 1.5, 1.16);
          return g;
        }),
        obj('Parking Meter', 14, 6, () => {
          const g = group('Parking Meter');
          cyl(g, 0.22, 0.28, 0.16, 0x4a4a4a, 0, 0.08, 0);
          cyl(g, 0.09, 0.1, 1.3, 0x555a60, 0, 0.75, 0);
          box(g, 0.4, 0.6, 0.3, 0x6a7078, 0, 1.6, 0);
          box(g, 0.28, 0.2, 0.06, 0xbfe0ff, 0, 1.72, 0.17, { emissive: 0x9fd8ff, emissiveIntensity: 0.6 });
          return g;
        }),
        obj('Newspaper Box', -14, 20, () => {
          const g = group('Newspaper Box');
          box(g, 1.0, 1.4, 0.7, 0x2a6a4a, 0, 0.7, 0);
          box(g, 0.8, 0.5, 0.1, 0x101418, 0, 1.05, 0.37);
          box(g, 0.5, 0.2, 0.06, 0xf0e8d0, 0, 1.05, 0.42, { emissive: 0xf0e8d0, emissiveIntensity: 0.3 });
          box(g, 1.2, 0.1, 0.9, 0x1e4a34, 0, 1.45, 0);
          return g;
        }),
        obj('Phone Booth', 30, 40, () => {
          const g = group('Phone Booth');
          box(g, 1.4, 0.15, 1.4, 0x2a3038, 0, 0.08, 0);
          for (const [sx, sz] of [[-0.65, -0.65], [0.65, -0.65], [-0.65, 0.65], [0.65, 0.65]]) {
            box(g, 0.14, 2.4, 0.14, 0x2a3038, sx, 1.2, sz);
          }
          box(g, 1.5, 0.2, 1.5, 0x2a3038, 0, 2.5, 0);
          box(g, 1.36, 2.0, 0.1, 0x9fd8ff, 0, 1.3, -0.66, { opacity: 0.5, emissive: 0x9fd8ff, emissiveIntensity: 0.3 });
          box(g, 1.2, 0.4, 0.06, 0xf0e8d0, 0, 2.2, 0.7, { emissive: 0xf0e8d0, emissiveIntensity: 0.5 });
          return g;
        }),
        obj('Road Barrel', 4, -46, () => {
          const g = group('Road Barrel');
          cyl(g, 0.5, 0.62, 1.5, 0xe86a1e, 0, 0.75, 0);
          cyl(g, 0.54, 0.54, 0.24, 0xf0f0f0, 0, 0.95, 0);
          cyl(g, 0.58, 0.58, 0.18, 0xf0f0f0, 0, 0.45, 0);
          cyl(g, 0.56, 0.56, 0.1, 0x2a2a2a, 0, 1.54, 0);
          return g;
        }),
        obj('City Tree', 20, 8, () => {
          const g = group('City Tree');
          plane(g, 3.4, 3.4, 0x4a5a3a, 0, 0.02, 0);
          cyl(g, 0.22, 0.4, 3.0, 0x5a3f28, 0, 1.5, 0);
          ball(g, 1.7, 0x3f7a3a, 0, 4.0, 0, { sy: 0.85 });
          ball(g, 1.2, 0x4a8a44, 0.7, 4.6, 0.4, { sy: 0.9 });
          ball(g, 1.1, 0x4a8a44, -0.8, 4.4, -0.5, { sy: 0.9 });
          return g;
        }),
      ],
    },
  ];
}

// ===== HOUSE =====
// The categories ARE the rooms, because that is what the house is: eleven rooms
// and a plan. Every object's x/z is inside the room it is named for, so
// "view in context" lands you in the right room.

function houseCategories() {
  return [
    {
      id: 'living', name: 'Living Room', blurb: 'The long west room. The fireplace is on the far wall.',
      objects: [
        obj('Fireplace', -85.5, 8, () => {
          const g = group('Fireplace');
          box(g, 5, 18, 5, 0x8a7a6a, -2, 9, -9.5);
          box(g, 5, 18, 5, 0x8a7a6a, -2, 9, 9.5);
          box(g, 5, 6, 14, 0x8a7a6a, -2, 15, 0);
          box(g, 1, 12, 14, 0xd8d0c4, 0.5, 6, 0);
          box(g, 7, 1.4, 26, 0x4a3020, -1.5, 19, 0);
          // Coals and two logs, then the flame.
          for (let i = 0; i < 9; i++) ball(g, 0.5, 0x2a1a12, 0.5, 0.2 + ((i * 3) % 2) * 0.2, -4 + (i / 8) * 8, { flat: true });
          for (let i = 0; i < 2; i++) cyl(g, 0.6, 0.6, 8, 0x5a3f28, 0, 2 + i * 1.1, -1 + i * 2, { rx: Math.PI / 2 });
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2;
            cone(g, 1.1, 4.4, 0xff8a1e, 1 + Math.cos(a) * 1.5, 3.6, Math.sin(a) * 3.4,
              { emissive: 0xff7a10, emissiveIntensity: 2.4, opacity: 0.9 });
          }
          box(g, 14, 0.14, 18, 0x8a7a6a, 5.5, 0.07, 0);
          return g;
        }),
        obj('Sofa', -60, 2, () => {
          const g = group('Sofa');
          box(g, 9, 1.6, 4.0, 0x6a4a5a, 0, 0.9, 0);
          box(g, 9, 1.8, 1.0, 0x7a5a6a, 0, 1.5, -1.5);
          box(g, 1.2, 2.4, 4.0, 0x7a5a6a, -3.9, 1.3, 0);
          box(g, 1.2, 2.4, 4.0, 0x7a5a6a, 3.9, 1.3, 0);
          for (const sx of [-4.2, 4.2]) for (const sz of [-1.7, 1.7]) cyl(g, 0.14, 0.14, 0.4, 0x4a3020, sx, 0.2, sz);
          box(g, 2.4, 0.4, 2.4, 0x8a6a7a, -1.2, 1.9, 0.4, { rx: 0.1 });
          return g;
        }),
        obj('Armchair', -50, 12, () => {
          const g = group('Armchair');
          box(g, 3.2, 1.4, 3.0, 0x4a5a6a, 0, 0.9, 0);
          box(g, 3.2, 2.2, 0.9, 0x5a6a7a, 0, 1.6, -1.05);
          box(g, 0.8, 1.8, 3.0, 0x5a6a7a, -1.2, 1.4, 0);
          box(g, 0.8, 1.8, 3.0, 0x5a6a7a, 1.2, 1.4, 0);
          for (const sx of [-1.3, 1.3]) for (const sz of [-1.2, 1.2]) cyl(g, 0.12, 0.12, 0.35, 0x4a3020, sx, 0.17, sz);
          return g;
        }),
        obj('Coffee Table', -55, 12, () => {
          const g = group('Coffee Table');
          box(g, 5.0, 0.24, 3.0, 0x8a6a44, 0, 1.3, 0);
          box(g, 4.4, 0.16, 2.4, 0x6a4a2c, 0, 1.05, 0);
          for (const sx of [-2.1, 2.1]) for (const sz of [-1.2, 1.2]) cyl(g, 0.14, 0.16, 1.2, 0x6a4a2c, sx, 0.6, sz);
          // A mug and a magazine on top.
          cyl(g, 0.22, 0.2, 0.3, 0xf0f0f0, 1.2, 1.57, 0.4);
          box(g, 0.9, 0.06, 0.7, 0xd8451f, -1.0, 1.45, -0.3, { rz: 0.06 });
          return g;
        }),
        obj('Bookcase', -30, -17.5, () => {
          const g = group('Bookcase');
          box(g, 6.0, 11.0, 1.4, 0x5a3f28, 0, 5.5, 0);
          box(g, 5.4, 10.4, 0.2, 0x3a2a1c, 0, 5.6, 0.75);
          // Four shelves of books, in a repeating colour run.
          const cols = [0xa63a3a, 0x3a6aa6, 0x3a8a5a, 0xc8a83a, 0x8a3aa6];
          for (let s = 0; s < 4; s++) {
            box(g, 5.4, 0.16, 1.2, 0x4a3020, 0, 1.6 + s * 2.6, 0.5);
            for (let i = 0; i < 16; i++) {
              box(g, 0.22, 1.5 + ((i * 3) % 3) * 0.2, 0.9, cols[(i + s) % cols.length],
                -2.5 + i * 0.33, 2.4 + s * 2.6, 0.5);
            }
          }
          return g;
        }),
        obj('Standing Lamp', -34, 4, () => {
          const g = group('Standing Lamp');
          cyl(g, 0.5, 0.6, 0.16, 0x3a3038, 0, 0.08, 0);
          cyl(g, 0.09, 0.11, 6.2, 0x6a5a48, 0, 3.2, 0);
          cone(g, 1.3, 1.8, 0xf0e4c4, 0, 7.1, 0, { emissive: 0xffe0a0, emissiveIntensity: 1.4, opacity: 0.95 });
          return g;
        }),
        obj('Area Rug', -60, 12, () => {
          const g = group('Area Rug');
          plane(g, 16, 10, 0x8a4a3a, 0, 0.03, 0);
          plane(g, 13, 7.4, 0xc8a06a, 0, 0.04, 0);
          plane(g, 10, 5.0, 0x6a3a5a, 0, 0.05, 0);
          return g;
        }),
      ],
    },
    {
      id: 'kitchen', name: 'Kitchen', blurb: 'Counters down two walls and a table in the middle.',
      objects: [
        obj('Counter Run', -30, 92, () => {
          const g = group('Counter Run');
          box(g, 22, 3.0, 2.6, 0xd8d0c4, 0, 1.5, 0);
          box(g, 22.4, 0.24, 2.9, 0x3a3a3a, 0, 3.1, 0);
          // Doors and drawers.
          for (let i = 0; i < 8; i++) box(g, 2.4, 2.2, 0.12, 0xc0b8ac, -9.5 + i * 2.7, 1.4, 1.36);
          for (let i = 0; i < 4; i++) box(g, 0.16, 0.5, 0.14, 0x8a8a8a, -9.5 + i * 2.7 * 2 + 1.35, 1.9, 1.44);
          // The sink and a tap.
          box(g, 3.4, 0.3, 1.8, 0xc0c8d0, 4, 3.2, 0);
          cyl(g, 0.1, 0.1, 1.0, 0xc0c8d0, 4, 3.6, -0.6);
          box(g, 0.1, 0.1, 0.7, 0xc0c8d0, 4, 4.0, -0.3);
          return g;
        }),
        obj('Fridge', -40, 92, () => {
          const g = group('Fridge');
          box(g, 3.2, 7.0, 2.8, 0xe8e8e8, 0, 3.5, 0);
          box(g, 3.3, 0.14, 2.9, 0xc0c0c0, 0, 4.4, 0);
          box(g, 0.14, 1.8, 0.16, 0x9a9a9a, 1.3, 5.6, 1.45);
          box(g, 0.14, 1.2, 0.16, 0x9a9a9a, 1.3, 2.6, 1.45);
          box(g, 1.2, 1.0, 0.06, 0xf0e8d0, -0.6, 5.4, 1.42, { emissive: 0xff5533, emissiveIntensity: 0.4 });
          return g;
        }),
        obj('Kitchen Table', -20, 70, () => {
          const g = group('Kitchen Table');
          box(g, 9.0, 0.3, 5.0, 0xc0a878, 0, 3.0, 0);
          box(g, 8.4, 0.2, 4.4, 0xa08858, 0, 2.6, 0);
          for (const [sx, sz] of [[-3.8, -2.0], [3.8, -2.0], [-3.8, 2.0], [3.8, 2.0]]) {
            box(g, 0.4, 2.9, 0.4, 0xa08858, sx, 1.45, sz);
          }
          // Four chairs, two a side.
          for (const [cx, cz, ry] of [[-2.6, -3.4, 0], [0, -3.4, 0], [-2.6, 3.4, Math.PI], [0, 3.4, Math.PI]]) {
            const ch = group('chair');
            box(ch, 1.5, 0.16, 1.5, 0xa08858, 0, 1.5, 0);
            box(ch, 1.5, 2.0, 0.16, 0xa08858, 0, 2.5, -0.7);
            for (const [lx, lz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) {
              box(ch, 0.16, 1.5, 0.16, 0x8a7048, lx, 0.75, lz);
            }
            ch.position.set(cx, 0, cz);
            ch.rotation.y = ry;
            g.add(ch);
          }
          return g;
        }),
        obj('Cupboard', -12, 92, () => {
          const g = group('Cupboard');
          box(g, 5.0, 8.0, 2.4, 0xc0b090, 0, 4, 0);
          box(g, 4.6, 7.4, 0.16, 0xa89070, 0, 4.1, 1.26);
          for (let i = 0; i < 3; i++) {
            box(g, 4.6, 0.14, 0.2, 0x8a7050, 0, 2.4 + i * 2.4, 1.3);
            cyl(g, 0.12, 0.12, 0.5, 0xc0c0c0, -0.7, 2.4 + i * 2.4, 1.36, { rz: Math.PI / 2 });
            cyl(g, 0.12, 0.12, 0.5, 0xc0c0c0, 0.7, 2.4 + i * 2.4, 1.36, { rz: Math.PI / 2 });
          }
          return g;
        }),
      ],
    },
    {
      id: 'dining', name: 'Dining Room', blurb: 'A long table and a good lamp.',
      objects: [
        obj('Dining Table', 28, 70, () => {
          const g = group('Dining Table');
          box(g, 14.0, 0.36, 5.4, 0x6a4a2c, 0, 3.0, 0);
          box(g, 13.0, 0.24, 4.6, 0x5a3f24, 0, 2.6, 0);
          for (const sx of [-5.6, 5.6]) box(g, 1.0, 2.9, 4.4, 0x5a3f24, sx, 1.45, 0);
          // Six chairs, three a side.
          for (let i = 0; i < 3; i++) {
            for (const sz of [-3.5, 3.5]) {
              const ch = group('chair');
              box(ch, 1.6, 0.16, 1.6, 0x5a3f24, 0, 1.6, 0);
              box(ch, 1.6, 2.2, 0.16, 0x5a3f24, 0, 2.7, -0.72);
              for (const [lx, lz] of [[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]]) {
                box(ch, 0.18, 1.6, 0.18, 0x4a3320, lx, 0.8, lz);
              }
              ch.position.set(-4.6 + i * 4.6, 0, sz);
              ch.rotation.y = sz > 0 ? Math.PI : 0;
              g.add(ch);
            }
          }
          // A fruit bowl in the middle.
          cyl(g, 1.4, 0.8, 0.5, 0xd8c8a0, 0, 3.4, 0);
          for (let i = 0; i < 5; i++) ball(g, 0.35, i % 2 ? 0xd8451f : 0xe0b02a, (i - 2) * 0.5, 3.7, ((i * 3) % 2) * 0.5);
          return g;
        }),
        obj('Sideboard', 48, 92, () => {
          const g = group('Sideboard');
          box(g, 8.0, 4.0, 2.2, 0x5a3f24, 0, 2.0, 0);
          box(g, 8.4, 0.24, 2.5, 0x4a3320, 0, 4.1, 0);
          for (let i = 0; i < 3; i++) {
            box(g, 2.3, 2.6, 0.14, 0x4a3320, -2.6 + i * 2.6, 1.9, 1.16);
            box(g, 0.14, 0.5, 0.16, 0xc0a860, -2.6 + i * 2.6, 2.6, 1.24);
          }
          cyl(g, 0.9, 1.1, 0.7, 0x3a6a4a, -2.4, 4.6, 0);
          ball(g, 0.5, 0x4a8a5a, -2.4, 5.4, 0);
          ball(g, 0.4, 0x5a9a6a, -1.7, 5.2, 0.3);
          return g;
        }),
        obj('Chandelier', 28, 70, () => {
          const g = group('Chandelier');
          cyl(g, 0.05, 0.05, 3.0, 0xc0a860, 0, 1.5, 0);
          cyl(g, 1.5, 0.4, 0.5, 0xc0a860, 0, 4.0, 0);
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            ball(g, 0.28, 0xfff0c0, Math.cos(a) * 1.5, 4.4, Math.sin(a) * 1.5,
              { emissive: 0xffd06a, emissiveIntensity: 1.6 });
          }
          return g;
        }),
      ],
    },
    {
      id: 'foyer', name: 'Foyer', blurb: 'Where you come in. The front door is locked.',
      objects: [
        obj('Front Door', 90, 68, () => {
          const g = group('Front Door');
          box(g, 0.6, 12.0, 20.0, 0xd8cdb8, 0, 6, 0);
          box(g, 0.4, 10.0, 16.0, 0x6a4a2c, -0.2, 5, 0);
          box(g, 0.5, 0.5, 17.0, 0x4a3320, -0.2, 9.6, 0);
          // Deadbolt, hasp and padlock: it is shut, and that is the point of it.
          cyl(g, 0.3, 0.3, 0.4, 0xc0c0c0, -0.45, 6.5, 4.0, { rz: Math.PI / 2 });
          box(g, 0.3, 1.0, 1.6, 0x9aa0a8, -0.4, 4.2, -5.0);
          box(g, 0.5, 0.9, 0.7, 0xc8ccd0, -0.6, 3.6, -5.0);
          ball(g, 0.22, 0x8a8a8a, -0.85, 3.4, -5.0);
          return g;
        }),
        obj('Hall Table', 70, 92, () => {
          const g = group('Hall Table');
          box(g, 4.0, 0.2, 1.8, 0x6a4a2c, 0, 2.4, 0);
          box(g, 3.6, 0.3, 1.4, 0x5a3f24, 0, 2.1, 0);
          for (const sx of [-1.6, 1.6]) box(g, 0.24, 2.3, 1.4, 0x5a3f24, sx, 1.15, 0);
          cyl(g, 0.5, 0.7, 0.9, 0x3a6a7a, -1.0, 3.0, 0);
          for (let i = 0; i < 4; i++) ball(g, 0.3, 0x4a8a5a, -1.3 + i * 0.2, 3.9, (i % 2) * 0.3);
          cyl(g, 0.3, 0.35, 0.5, 0xf0f0f0, 1.2, 2.8, 0.2);
          return g;
        }),
        obj('Coat Rack', 60, 50, () => {
          const g = group('Coat Rack');
          cyl(g, 0.5, 0.6, 0.2, 0x5a3f24, 0, 0.1, 0);
          cyl(g, 0.14, 0.16, 5.0, 0x5a3f24, 0, 2.5, 0);
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2;
            cyl(g, 0.08, 0.08, 0.6, 0x5a3f24, Math.cos(a) * 0.4, 4.7, Math.sin(a) * 0.4, { rz: Math.cos(a) * 0.8, rx: Math.sin(a) * 0.8 });
          }
          // Two coats hanging.
          for (const [ca, col] of [[0.6, 0x3a5a8a], [3.4, 0x8a3a3a]]) {
            box(g, 1.2, 3.0, 0.5, col, Math.cos(ca) * 0.9, 2.9, Math.sin(ca) * 0.9);
          }
          return g;
        }),
      ],
    },
    {
      id: 'bedrooms', name: 'Bedrooms', blurb: 'Two beds either side of the walk-in.',
      objects: [
        obj('Bed', -66, -50, () => {
          const g = group('Bed');
          box(g, 8.0, 1.4, 10.0, 0x5a3f24, 0, 0.7, 0);
          box(g, 8.6, 1.2, 10.6, 0xf0ece4, 0, 1.7, 0);
          box(g, 8.8, 3.0, 0.6, 0x4a3320, 0, 2.4, -5.2);
          box(g, 7.4, 0.6, 2.4, 0xf0ece4, 0, 2.5, -3.4);
          box(g, 7.8, 0.3, 6.0, 0x6a8ab4, 0, 2.4, 1.4);
          return g;
        }),
        obj('Bedroom Desk', -80, -50, () => {
          const g = group('Bedroom Desk');
          box(g, 6.0, 0.24, 3.0, 0x8a6a44, 0, 3.0, 0);
          box(g, 1.6, 2.6, 2.6, 0x7a5a38, 2.0, 1.3, 0);
          for (let i = 0; i < 3; i++) box(g, 1.4, 0.7, 0.14, 0x6a4a2c, 2.0, 0.6 + i * 0.9, 1.36);
          cyl(g, 0.5, 0.5, 0.1, 0x2a3038, -1.2, 3.2, 0, { rx: -0.4 });
          cyl(g, 0.1, 0.14, 0.6, 0x2a3038, -1.2, 2.9, 0.4);
          box(g, 1.2, 0.1, 1.0, 0xf0e8d0, 1.0, 3.15, 0.4);
          return g;
        }),
        obj('Bedroom Chair', -70, -44, () => {
          const g = group('Bedroom Chair');
          box(g, 1.8, 0.2, 1.8, 0x8a6a44, 0, 1.6, 0);
          box(g, 1.8, 2.4, 0.2, 0x8a6a44, 0, 2.8, -0.8);
          for (const [lx, lz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) {
            box(g, 0.18, 1.6, 0.18, 0x7a5a38, lx, 0.8, lz);
          }
          return g;
        }),
        obj('Wardrobe', -86, -70, () => {
          const g = group('Wardrobe');
          box(g, 7.0, 12.0, 2.6, 0x6a4a2c, 0, 6, 0);
          for (const sx of [-1.7, 1.7]) {
            box(g, 3.2, 11.0, 0.16, 0x5a3f24, sx, 6, 1.36);
            cyl(g, 0.1, 0.1, 0.8, 0xc0a860, sx * 0.3, 6, 1.46);
          }
          box(g, 7.4, 0.5, 2.9, 0x5a3f24, 0, 12.2, 0);
          return g;
        }),
        obj('Nightstand', -58, -55, () => {
          const g = group('Nightstand');
          box(g, 2.2, 3.0, 2.0, 0x6a4a2c, 0, 1.5, 0);
          for (let i = 0; i < 2; i++) {
            box(g, 1.8, 1.0, 0.14, 0x5a3f24, 0, 0.9 + i * 1.4, 1.06);
            box(g, 0.5, 0.16, 0.18, 0xc0a860, 0, 0.9 + i * 1.4, 1.16);
          }
          cyl(g, 0.4, 0.5, 0.7, 0xf0e8d0, 0, 3.4, 0, { emissive: 0xffe0a0, emissiveIntensity: 1.2 });
          return g;
        }),
      ],
    },
    {
      id: 'bathroom', name: 'Bathroom', blurb: 'Tub, sink, and a mirror.',
      objects: [
        obj('Bathtub', 80, 8, () => {
          const g = group('Bathtub');
          box(g, 4.0, 2.6, 9.0, 0xf0f0ec, 0, 1.3, 0);
          box(g, 3.2, 2.2, 8.0, 0xd8e4ec, 0, 1.5, 0);
          cyl(g, 0.12, 0.12, 1.2, 0xc0c8d0, 0, 3.0, -4.0);
          box(g, 0.12, 0.12, 0.8, 0xc0c8d0, 0, 3.5, -3.6);
          for (const sz of [-3.4, 0, 3.4]) cyl(g, 0.09, 0.09, 0.6, 0xa8b0b8, 1.6, 3.0, sz);
          return g;
        }),
        obj('Sink', 60, -10, () => {
          const g = group('Sink');
          cyl(g, 0.4, 0.45, 3.2, 0x6a4a2c, 0, 1.6, 0);
          cyl(g, 1.4, 0.9, 0.9, 0xf0f0ec, 0, 3.6, 0);
          cyl(g, 1.1, 0.7, 0.5, 0xd8e4ec, 0, 3.9, 0);
          cyl(g, 0.1, 0.1, 0.7, 0xc0c8d0, 0, 4.3, -0.7);
          box(g, 0.1, 0.1, 0.5, 0xc0c8d0, 0, 4.6, -0.5);
          return g;
        }),
        obj('Mirror', 66, -10, () => {
          const g = group('Mirror');
          box(g, 4.0, 6.0, 0.3, 0x8a6a44, 0, 4.5, 0);
          box(g, 3.4, 5.4, 0.16, 0xd8ecf4, 0, 4.5, 0.2, { metalness: 0.7, roughness: 0.06 });
          return g;
        }),
        obj('Toilet', 86, -12, () => {
          const g = group('Toilet');
          cyl(g, 1.2, 1.0, 3.0, 0xf0f0ec, 0, 1.5, -0.8);
          cyl(g, 1.4, 1.1, 0.9, 0xf0f0ec, 0, 0.9, 0.6);
          cyl(g, 1.25, 1.0, 0.24, 0xd8e4ec, 0, 1.45, 0.6);
          box(g, 1.9, 1.0, 0.7, 0xf0f0ec, 0, 3.4, -1.4);
          return g;
        }),
      ],
    },
    {
      id: 'garage', name: 'Dark Garage', blurb: 'Pitch dark, and the only way out.',
      objects: [
        obj('Workbench', -70, 88, () => {
          const g = group('Workbench');
          box(g, 10.0, 0.4, 3.0, 0x8a6a44, 0, 3.0, 0);
          box(g, 9.4, 0.3, 2.6, 0x6a4a2c, 0, 2.5, 0);
          for (const sx of [-4.2, 4.2]) {
            box(g, 0.4, 3.0, 0.4, 0x6a4a2c, sx, 1.5, -1.1);
            box(g, 0.4, 3.0, 0.4, 0x6a4a2c, sx, 1.5, 1.1);
          }
          // A vice and a scatter of tools on the top.
          box(g, 0.9, 0.6, 0.6, 0x4a4a4a, -3.0, 3.5, 0);
          box(g, 1.6, 0.3, 0.4, 0x8a9098, -3.0, 3.4, 0.5);
          for (let i = 0; i < 4; i++) box(g, 0.16, 0.1, 1.2, 0x9aa0a8, 1.0 + i * 0.4, 3.25, 0.4);
          // Pegboard behind, hung with spanners.
          box(g, 9.0, 4.0, 0.2, 0x7a6a52, 0, 5.4, -1.6);
          for (let i = 0; i < 8; i++) box(g, 0.3, 1.0, 0.1, 0xb0b6bc, -3.4 + i * 0.95, 5.6, -1.48);
          return g;
        }),
        obj('Tool Chest', -84, 84, () => {
          const g = group('Tool Chest');
          box(g, 4.0, 5.0, 2.2, 0xc03a2a, 0, 2.5, 0);
          for (let i = 0; i < 5; i++) {
            box(g, 3.6, 0.7, 0.14, 0xa02a1a, 0, 0.8 + i * 0.9, 1.16);
            box(g, 1.4, 0.16, 0.18, 0xc8ccd0, 0, 0.8 + i * 0.9, 1.26);
          }
          for (const sx of [-1.6, 1.6]) for (const sz of [-0.8, 0.8]) cyl(g, 0.22, 0.22, 0.3, 0x2a2a2a, sx, 0.15, sz, { rx: Math.PI / 2 });
          return g;
        }),
        obj('Car Jack', -60, 60, () => {
          const g = group('Car Jack');
          box(g, 3.4, 0.5, 1.2, 0x2a3a4a, 0, 0.4, 0);
          box(g, 1.6, 0.9, 1.0, 0x3a4a5a, 0, 1.0, 0, { rz: 0.3 });
          cyl(g, 0.1, 0.1, 1.6, 0xc0c8d0, 1.2, 1.0, 0, { rz: 0.6 });
          box(g, 0.6, 0.16, 0.16, 0xc0c8d0, 1.9, 1.4, 0);
          for (const sz of [-0.7, 0.7]) for (const sx of [-1.4, 1.4]) cyl(g, 0.4, 0.4, 0.3, 0x2a2a2a, sx, 0.2, sz, { rx: Math.PI / 2 });
          return g;
        }),
        obj('Paint Cans', -50, 50, () => {
          const g = group('Paint Cans');
          const cols = [0x3a6aa6, 0xa63a3a, 0x3a8a5a, 0xc8a83a];
          cols.forEach((c, i) => {
            cyl(g, 1.0, 1.0, 1.8, 0xd0d0d0, (i % 2) * 2.4, 0.9, Math.floor(i / 2) * 2.4);
            cyl(g, 1.02, 1.02, 0.2, c, (i % 2) * 2.4, 1.7, Math.floor(i / 2) * 2.4);
          });
          return g;
        }),
        obj('Tyre Stack', -84, 60, () => {
          const g = group('Tyre Stack');
          for (let i = 0; i < 4; i++) {
            const t = cyl(g, 1.6, 1.6, 0.9, 0x1a1a1a, 0, 0.5 + i * 0.95, 0);
            t.material = mat(0x1a1a1a, { roughness: 0.95 });
          }
          cyl(g, 0.7, 0.7, 0.2, 0x8a8a8a, 0, 0.9, 0);
          return g;
        }),
      ],
    },
    // The rides. Every one of these is a shape you can pick from the gear menu
    // and drive, which is why they are here rather than filed under traffic: the
    // point of browsing them is to see what you are allowed to get into.
    {
      id: 'rides', name: 'Rides', blurb: 'Everything you can climb into and drive.',
      objects: [
        obj('Fire Truck', 45, 0, () => vehicle(0xc8202a, {
          cab: [-1.9, 1.5], box: [1.1, 1.9], ladder: true, lightbar: true, nozzle: true,
        })),
        obj('Taco Truck', -22, 6, () => vehicle(0xd8451f, {
          cab: [-1.9, 1.45], box: [1.1, 1.85], hatch: true, sign: true, awning: true,
        })),
        obj('Monster Truck', 0, 0, () => vehicle(0x7b2fbf, {
          cab: [-1.3, 1.3], box: [1.1, 1.0], wheels: 1.15, lift: 0.55,
        })),
        obj('Steamroller', 0, 0, () => vehicle(0xf2b705, {
          cab: [-1.5, 1.7], box: [1.0, 1.2], roller: true,
        })),
        obj('School Bus', 0, 0, () => vehicle(0xf5a623, {
          cab: [-2.3, 1.5], box: [1.2, 1.8], long: true, windows: true,
        })),
        obj('Indy 500', 0, 0, () => vehicle(0x1f5af5, {
          cab: [-0.4, 0.75], openWheel: true, spoiler: true,
        })),
      ],
    },
  ];
}

// ===== UNDERGROUND =====
// The course features. Glass City gets its own category because it is a whole
// district rather than one machine.

function undergroundCategories() {
  return [
    {
      id: 'machines', name: 'Machines', blurb: 'The things that try to squash you.',
      objects: [
        obj('Candy Waterfall Ramp', 24, 65, () => {
          const g = group('Candy Waterfall Ramp');
          // The stair itself: a wedge rising away from the viewer.
          const shape = new THREE.Shape();
          shape.moveTo(-17, 0); shape.lineTo(17, 0); shape.lineTo(17, 31.3); shape.closePath();
          const geo = new THREE.ExtrudeGeometry(shape, { depth: 12, bevelEnabled: false });
          geo.translate(0, 0, -6);
          const m = new THREE.Mesh(geo, mat(0x2a1a30, { roughness: 0.6 }));
          m.castShadow = true;
          g.add(m);
          // Neon rails up both flanks.
          for (const sx of [-6, 6]) {
            box(g, 0.4, 32, 0.4, 0x9dff3f, sx, 16, -17, { emissive: 0x9dff3f, emissiveIntensity: 1.6 });
          }
          // Gems sliding down it.
          const cols = [0x35f0ff, 0x9dff3f, 0xffb84d, 0xff3fd8];
          for (let i = 0; i < 10; i++) {
            const t = i / 10;
            ball(g, 0.7, cols[i % 4], -4 + (i % 5) * 2, 1 + t * 28, 12 - t * 34,
              { emissive: cols[i % 4], emissiveIntensity: 1.4 });
          }
          return g;
        }),
        obj('Steam Press', 74, 0, () => {
          const g = group('Steam Press');
          // Two columns and a sliding head.
          for (const sx of [-4.2, 4.2]) {
            cyl(g, 0.7, 0.8, 8.2, 0x4a4a52, sx, 4.1, 0);
            box(g, 1.6, 0.5, 1.6, 0x6a6a72, sx, 0.25, 0);
          }
          box(g, 11.0, 1.4, 3.0, 0x6a6a72, 0, 8.6, 0);
          box(g, 9.0, 1.6, 2.4, 0x8a8a92, 0, 4.5, 0);
          box(g, 8.4, 0.5, 2.0, 0xff6a3a, 0, 3.6, 0, { emissive: 0xff6a3a, emissiveIntensity: 0.7 });
          // The anvil below.
          box(g, 11.0, 1.15, 5.5, 0x4a4a52, 0, 0.58, 0);
          for (let i = 0; i < 5; i++) box(g, 10.0, 0.1, 0.3, 0x9a9aa2, 0, 0.2 + i * 0.2, 1.8);
          return g;
        }),
        obj('Car Wash', 21, -30, () => {
          const g = group('Car Wash');
          // Lattice walls and a spinning brush barrel.
          for (const sz of [-4, 4]) {
            for (let i = 0; i < 8; i++) box(g, 0.2, 6.0, 0.2, 0x9fd8ff, -16 + i * 4.4, 3, sz,
              { emissive: 0x35f0ff, emissiveIntensity: 0.6 });
          }
          box(g, 36, 0.4, 9.0, 0x3a4a58, 0, 6.4, 0);
          for (let i = 0; i < 5; i++) cyl(g, 0.9, 0.9, 8.0, 0xd84a8a, -12 + i * 6, 3.4, 0, { rx: Math.PI / 2 });
          // Foam on the floor.
          plane(g, 34, 8, 0xf0f8ff, 0, 0.05, 0);
          return g;
        }),
        obj('Conveyor Belt', 74, 0, () => {
          const g = group('Conveyor Belt');
          box(g, 66, 0.8, 9.0, 0x3a3a42, 0, 0.4, 0);
          box(g, 64, 0.2, 7.4, 0x24242a, 0, 0.9, 0);
          // The slats, and the rollers at each end.
          for (let i = 0; i < 22; i++) box(g, 0.5, 0.24, 7.4, 0x4a4a52, -31 + i * 2.9, 1.0, 0);
          for (const sx of [-33, 33]) cyl(g, 1.0, 1.0, 9.0, 0x8a8a92, sx, 1.0, 0, { rx: Math.PI / 2 });
          // A few candies riding it.
          const cols = [0xff3fd8, 0x35f0ff, 0xffb84d];
          for (let i = 0; i < 8; i++) ball(g, 0.6, cols[i % 3], -24 + i * 7, 1.7, ((i * 5) % 3) - 1.5,
            { emissive: cols[i % 3], emissiveIntensity: 1.2 });
          return g;
        }),
        obj('Trampoline Pad', 60, 20, () => {
          const g = group('Trampoline Pad');
          cyl(g, 3.4, 3.7, 0.5, 0x203a2f, 0, 0.25, 0);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(3.25, 0.16, 10, 32), mat(0x9dff3f, { emissive: 0x9dff3f, emissiveIntensity: 2.0 }));
          ring.rotation.x = Math.PI / 2;
          ring.position.y = 0.55;
          g.add(ring);
          for (let i = 0; i < 4; i++) {
            box(g, 5.8, 0.08, 0.24, i % 2 ? 0x35f0ff : 0x9dff3f, 0, 0.52, -2 + i * 1.4,
              { emissive: i % 2 ? 0x35f0ff : 0x9dff3f, emissiveIntensity: 1.6 });
          }
          return g;
        }),
        obj('Disco Ball', 58, 37, () => {
          const g = group('Disco Ball');
          cyl(g, 0.05, 0.05, 10.0, 0x9a9aa2, 0, 5.0, 0);
          const b = ball(g, 4.0, 0xdfe8f4, 0, 9.0, 0, { metalness: 0.9, roughness: 0.12 });
          b.material.emissive = 0x9fd8ff;
          b.material.emissiveIntensity = 0.25;
          for (let i = 0; i < 24; i++) {
            const a = (i / 24) * Math.PI * 2;
            const p = (i % 5 - 2) * 1.6;
            ball(g, 0.16, 0xffffff, Math.cos(a) * 3.2, 9.0 + p, Math.sin(a) * 3.2, { emissive: 0xffffff, emissiveIntensity: 1.4 });
          }
          return g;
        }),
        obj('The Magnet', 30, -70, () => {
          const g = group('The Magnet');
          box(g, 16.0, 3.0, 6.0, 0xc03a2a, 0, 18.0, 0);
          box(g, 16.4, 1.0, 6.4, 0xe8e8ee, 0, 16.2, 0);
          box(g, 16.4, 1.0, 6.4, 0xe8e8ee, 0, 19.8, 0);
          for (const sz of [-1.6, 1.6]) {
            box(g, 2.0, 3.2, 3.2, 0x3a6ad8, -6.0, 18.0, sz);
            box(g, 2.0, 3.2, 3.2, 0x3a6ad8, 6.0, 18.0, sz);
          }
          cyl(g, 0.4, 0.4, 14.0, 0x9a9aa2, 0, 25.0, 0);
          // The field lines under it.
          for (let i = 0; i < 5; i++) {
            box(g, 13.0 - i * 1.6, 0.12, 0.12, 0x35f0ff, 0, 12.0 - i * 2.0, 0,
              { emissive: 0x35f0ff, emissiveIntensity: 1.6 });
          }
          return g;
        }),
      ],
    },
    {
      id: 'candy', name: 'Candy & Checkers', blurb: 'The reward for getting that far.',
      objects: [
        obj('Rainbow Checker Tile', 0, 0, () => {
          const g = group('Rainbow Checker Tile');
          const cols = [0x35f0ff, 0x9dff3f, 0xffb84d, 0xff3fd8, 0xff3b3b];
          cols.forEach((c, i) => {
            box(g, 1.9, 1.15, 1.9, c, 0, 0.58, 0, { emissive: c, emissiveIntensity: 1.5 });
          });
          return g;
        }),
        obj('Candy Gem', 0, 0, () => {
          const g = group('Candy Gem');
          const m = ball(g, 1.5, 0xff3fd8, 0, 1.5, 0, { emissive: 0xff3fd8, emissiveIntensity: 1.8, flat: true });
          m.geometry = new THREE.OctahedronGeometry(1.5);
          const wrap = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.2, 8, 20), mat(0xf0f0f0, { emissive: 0xffffff, emissiveIntensity: 0.6 }));
          wrap.rotation.x = 0.6;
          wrap.position.y = 1.5;
          g.add(wrap);
          return g;
        }),
        obj('Big Heavy Gem', 24, 52, () => {
          const g = group('Big Heavy Gem');
          const m = new THREE.Mesh(new THREE.OctahedronGeometry(2.4), mat(0xff3b3b, { emissive: 0xff3b3b, emissiveIntensity: 1.6, flat: true }));
          m.position.y = 2.4;
          g.add(m);
          for (let i = 0; i < 3; i++) {
            const w = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.24, 8, 22), mat(0xf0f0f0, { emissive: 0xffffff, emissiveIntensity: 0.5 }));
            w.rotation.set(i * 1.05, i * 0.7, 0);
            w.position.y = 2.4;
            g.add(w);
          }
          return g;
        }),
        obj('Taffy Puller', 100, -20, () => {
          const g = group('Taffy Puller');
          for (const sx of [-5, 5]) {
            box(g, 1.2, 8.0, 1.2, 0x4a3a5a, sx, 4.0, 0);
            box(g, 1.8, 0.6, 1.8, 0x6a5a7a, sx, 0.3, 0);
          }
          box(g, 11.0, 1.2, 3.0, 0xff3fd8, 0, 8.4, 0, { emissive: 0xff3fd8, emissiveIntensity: 1.4 });
          // The stretching sheet of taffy hanging between them.
          box(g, 9.0, 6.0, 0.4, 0xff8ad8, 0, 4.4, 0, { emissive: 0xff3fd8, emissiveIntensity: 0.8, opacity: 0.85 });
          return g;
        }),
      ],
    },
    {
      id: 'holy', name: 'The Holy Mountain', blurb: 'The one place with daylight in it.',
      objects: [
        obj('Holy Mountain', -100, 8, () => {
          const g = group('Holy Mountain');
          // The cone, in two bands: rock below the snowline, snow above.
          const lower = new THREE.Mesh(new THREE.CylinderGeometry(24, 34, 7.5, 40, 1, true), mat(0x6a5a4a, { roughness: 1, flat: true }));
          lower.position.y = 3.75;
          g.add(lower);
          const upper = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 24, 10, 40, 1, true), mat(0xe8eef4, { roughness: 0.9 }));
          upper.position.y = 12.5;
          g.add(upper);
          const cap = new THREE.Mesh(new THREE.CylinderGeometry(9.9, 6.4, 9, 40, 1, true), mat(0xf4f8fc, { roughness: 0.85 }));
          cap.position.y = 22;
          g.add(cap);
          // The flat summit pad and its skylight rim.
          cyl(g, 9.9, 9.9, 0.6, 0xf4f8fc, 0, 26.7, 0);
          const rim = new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.5, 10, 28), mat(0xd8b45a, { metalness: 0.4 }));
          rim.rotation.x = Math.PI / 2;
          rim.position.y = 27.2;
          g.add(rim);
          // The road spiralling up the flank.
          for (let i = 0; i < 40; i++) {
            const t = i / 40;
            const a = t * Math.PI * 5;
            const r = 34 - t * 24;
            box(g, 5.0, 0.5, 2.4, 0xc0b090, Math.cos(a) * r, t * 26, Math.sin(a) * r, { ry: -a });
          }
          return g;
        }),
        obj('Summit Skylight', -100, 8, () => {
          const g = group('Summit Skylight');
          cyl(g, 4.5, 4.5, 0.5, 0xfff4d0, 0, 27.0, 0, { emissive: 0xfff0c0, emissiveIntensity: 1.2 });
          const shaft = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 8, 28, 1, true),
            mat(0xfff4d0, { emissive: 0xffe8a0, emissiveIntensity: 0.9, opacity: 0.5 }));
          shaft.position.y = 31.0;
          g.add(shaft);
          return g;
        }),
        obj('Stone Statue', -96, 16, () => {
          const g = group('Stone Statue');
          box(g, 3.0, 1.4, 3.0, 0x8a8078, 0, 0.7, 0);
          box(g, 2.0, 6.0, 2.0, 0x9a9088, 0, 4.0, 0);
          ball(g, 1.0, 0xa8a098, 0, 7.5, 0, { sy: 1.2 });
          box(g, 2.4, 0.5, 2.4, 0x7a7068, 0, 8.4, 0);
          return g;
        }),
      ],
    },
    {
      id: 'glasscity', name: 'The Glass City', blurb: 'The neon towers on the far north strip.',
      objects: [
        obj('Glass Tower', 0, 152, () => {
          const g = group('Glass Tower');
          const h = 20;
          box(g, 7, h, 7, 0x7fd0ff, 0, h / 2, 0, { opacity: 0.55, metalness: 0.2, roughness: 0.1 });
          box(g, 4.6, h - 2, 4.6, 0x9fe4ff, 0, h / 2, 0, { emissive: 0x2f8fe0, emissiveIntensity: 1.2, opacity: 0.7 });
          box(g, 7.6, 0.8, 7.6, 0xbfe8ff, 0, h + 0.4, 0, { emissive: 0x2f8fe0, emissiveIntensity: 0.8 });
          for (let i = 1; i < 5; i++) box(g, 7.4, 0.2, 7.4, 0xdff2ff, 0, i * 4, 0, { emissive: 0x2f8fe0, emissiveIntensity: 0.6 });
          return g;
        }),
        obj('Citadel Spire', 4, 152, () => {
          const g = group('Citadel Spire');
          const spire = new THREE.Mesh(new THREE.OctahedronGeometry(2.6), mat(0xbfe8ff, { emissive: 0x2f8fe0, emissiveIntensity: 1.6 }));
          spire.scale.set(1, 4.4, 1);
          spire.position.y = 11.5;
          g.add(spire);
          cyl(g, 2.6, 3.4, 1.2, 0x9fe4ff, 0, 0.6, 0, { emissive: 0x2f8fe0, emissiveIntensity: 0.7 });
          const halo = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.14, 8, 32), mat(0x7fd0ff, { emissive: 0x7fd0ff, emissiveIntensity: 2.0 }));
          halo.rotation.x = Math.PI / 2;
          halo.position.y = 1.4;
          g.add(halo);
          return g;
        }),
        obj('Balloon Plaza', 34, 154, () => {
          const g = group('Balloon Plaza');
          box(g, 34, 0.25, 22, 0xe6e2d8, 0, 0.12, 0);
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2;
            const x = Math.cos(a) * 11, z = Math.sin(a) * 8;
            const col = [0x3a8ad8, 0xd84a8a, 0xd8a83a, 0x3ad88a][i % 4];
            const b = ball(g, 2.6, col, x, 5.0, z, { sy: 1.25, emissive: col, emissiveIntensity: 0.35 });
            cyl(g, 0.08, 0.08, 3.0, 0xf0f0f0, x, 1.6, z);
            void b;
          }
          return g;
        }),
        obj('Tableau Dancers', -96, 143, () => {
          const g = group('Tableau Dancers');
          box(g, 7, 0.4, 7, 0x3a4a6a, 0, 0.2, 0);
          box(g, 6.4, 6.0, 0.3, 0x7fc0ff, 0, 3.2, -3.2, { emissive: 0x2f6fbf, emissiveIntensity: 0.7, opacity: 0.6 });
          for (let i = 0; i < 3; i++) {
            const x = -2 + i * 2;
            cyl(g, 0.5, 0.4, 3.0, 0xd8c0a8, x, 1.8, 0);
            ball(g, 0.45, 0xe8d0b8, x, 3.6, 0);
            box(g, 1.6, 0.2, 0.4, 0xd84a8a, x, 2.6, 0.6, { rx: 0.5 });
            cyl(g, 0.16, 0.16, 2.2, 0xe8d0b8, x - 0.5, 4.4, 0.6, { rz: 0.8 });
            cyl(g, 0.16, 0.16, 2.2, 0xe8d0b8, x + 0.5, 4.4, 0.6, { rz: -0.8 });
          }
          return g;
        }),
        // Named by their colour, and they have to be: `?objects=<name>` identifies an
        // object by its name, so two ghosts both called "Street Ghost" would make
        // the back button and a refresh ambiguous about which one you were
        // looking at.
        obj('Red Street Ghost', 0, 152, () => buildGhostFigure(0xff4d4d)),
        obj('Green Street Ghost', -60, 152, () => buildGhostFigure(0x4dff9c)),
      ],
    },
  ];
}

// The two street ghosts, as they appear in the Glass City: a dome, a scalloped
// skirt and two big eyes. Shared by the catalogue and (in its own colours) by
// the real ones in the level.
function buildGhostFigure(color) {
  const g = group('Street Ghost');
  const body = mat(color, { emissive: color, emissiveIntensity: 0.9, opacity: 0.85 });
  const head = ball(g, 2.0, color, 0, 3.0, 0, { sy: 1.05, emissive: color, emissiveIntensity: 0.9, opacity: 0.85 });
  head.material = body;
  // The scalloped skirt: five lobes around the bottom.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    ball(g, 1.5, color, Math.cos(a) * 1.5, 0.9, Math.sin(a) * 1.5, { sy: 0.8, emissive: color, emissiveIntensity: 0.9, opacity: 0.85 });
  }
  // Two eyes and a mouth.
  for (const sx of [-0.72, 0.72]) {
    const e = ball(g, 0.52, 0xffffff, sx, 3.5, 1.75);
    e.material = mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.6 });
    ball(g, 0.24, 0x101018, sx, 3.45, 2.1);
  }
  box(g, 1.3, 0.34, 0.2, 0x101018, 0, 2.2, 1.9);
  return g;
}

// ===== RAMPWORLD =====

function rampCategories() {
  return [
    {
      id: 'course', name: 'The Course', blurb: 'The hills and the big set pieces.',
      objects: [
        obj('Velodrome Bowl', -48, 5, () => {
          const g = group('Velodrome Bowl');
          // A banked oval: a torus squashed flat and banked round its rim.
          const bowl = new THREE.Mesh(new THREE.TorusGeometry(34, 7, 16, 64), mat(0x9c6b38, { roughness: 0.9 }));
          bowl.rotation.x = Math.PI / 2;
          bowl.scale.set(1, 1, 0.62);
          bowl.position.y = 2.6;
          bowl.castShadow = true;
          g.add(bowl);
          const lip = new THREE.Mesh(new THREE.TorusGeometry(41, 0.8, 8, 72), mat(0x6a4a2c, { roughness: 0.85 }));
          lip.rotation.x = Math.PI / 2;
          lip.scale.set(1, 1, 0.62);
          lip.position.y = 8.6;
          g.add(lip);
          // The flat infield.
          plane(g, 74, 46, 0xb8895a, 0, 0.05, 0);
          return g;
        }),
        obj('Wheel of Death', 35, -5, () => {
          const g = group('Wheel of Death');
          const rim = new THREE.Mesh(new THREE.TorusGeometry(9.5, 0.5, 10, 48), mat(0xc03a2a, { roughness: 0.6 }));
          g.add(rim);
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            cyl(g, 0.22, 0.22, 19, 0xd8d8d8, 0, 0, 0).rotation.z = 0;
            const spoke = cyl(g, 0.22, 0.22, 19, 0xd8d8d8, 0, 0, 0);
            spoke.rotation.z = a;
            g.add(spoke);
          }
          // Four paddles on the rim, the bits that fling you.
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 + 0.4;
            box(g, 2.6, 0.8, 1.6, 0xf0a020, Math.cos(a) * 9.5, Math.sin(a) * 9.5, 0, { rz: a + Math.PI / 2 });
          }
          // The A-frame legs.
          for (const sx of [-4, 4]) {
            box(g, 0.7, 14.0, 0.7, 0x8a8a92, sx, 0, -6, { rx: 0.3 });
            box(g, 0.7, 14.0, 0.7, 0x8a8a92, sx, 0, 6, { rx: -0.3 });
          }
          g.rotation.x = -Math.PI / 2;
          const inner = group('inner');
          g.add(inner);
          return g;
        }),
        obj('Trebuchet', -50, 70, () => {
          const g = group('Trebuchet');
          // Base frame.
          for (const sz of [-3, 3]) {
            box(g, 1.0, 12.0, 1.0, 0x6a4a2c, -4, 6, sz, { rx: 0.28 });
            box(g, 1.0, 12.0, 1.0, 0x6a4a2c, 4, 6, sz, { rx: -0.28 });
          }
          box(g, 12.0, 1.0, 8.0, 0x5a3f24, 0, 0.5, 0);
          // The throwing arm, cocked back over the top.
          box(g, 0.7, 15.0, 0.7, 0x4a3320, 0, 12.0, 0, { rz: 0.7 });
          box(g, 2.6, 2.0, 2.6, 0x8a8a92, -6.0, 16.5, 0);
          // The sling and its stone.
          box(g, 0.14, 7.0, 0.14, 0xd8c8a0, -6.5, 19.5, 0, { rz: 0.4 });
          box(g, 0.14, 7.0, 0.14, 0xd8c8a0, -6.5, 19.5, 0, { rz: -0.4 });
          ball(g, 1.6, 0x8a8a92, -7.6, 22.5, 0, { flat: true });
          return g;
        }),
        obj('Giant Boulder', 78, 42, () => {
          const g = group('Giant Boulder');
          const b = ball(g, 6.0, 0x7a7068, 0, 6.0, 0, { flat: true, seg: 16 });
          b.rotation.set(0.4, 0.9, 0.2);
          for (let i = 0; i < 7; i++) {
            const a = i * 1.7;
            ball(g, 1.6, 0x6a6058, Math.cos(a) * 4.4, 6 + Math.sin(i) * 2.4, Math.sin(a) * 4.4, { flat: true });
          }
          return g;
        }),
        obj('Hammer Gauntlet', 0, 70, () => {
          const g = group('Hammer Gauntlet');
          for (const sz of [-6, 6]) {
            box(g, 1.4, 9.0, 1.4, 0x8a8a92, 0, 4.5, sz);
            box(g, 2.6, 0.6, 2.6, 0x5a5a62, 0, 0.3, sz);
          }
          box(g, 2.0, 2.0, 14.0, 0x6a6a72, 0, 9.0, 0);
          // The swinging head itself.
          box(g, 3.0, 3.0, 8.0, 0xc03a2a, 0, 6.0, 0);
          for (const sz of [-3.2, 3.2]) box(g, 2.4, 2.4, 1.6, 0x8a2a1a, 0, 6.0, sz);
          return g;
        }),
        obj('Vortex Cloud', 0, 45, () => {
          const g = group('Vortex Cloud');
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2;
            const r = 10 - i * 1.0;
            ball(g, 4.0 + (i % 3), 0xd8e4f0, Math.cos(a) * r, 12 + i * 1.2, Math.sin(a) * r, { sy: 0.7, opacity: 0.85 });
          }
          cyl(g, 6.0, 1.0, 8.0, 0xbfd0e0, 0, 6.0, 0, { opacity: 0.6 });
          return g;
        }),
      ],
    },
    {
      id: 'park', name: 'Ramps & Park', blurb: 'The skatepark furniture.',
      objects: [
        obj('Half Pipe', 10, -30, () => {
          const g = group('Half Pipe');
          // Two facing quarter-pipes, drawn as extruded L shapes.
          for (const sx of [-9, 9]) {
            const s = new THREE.Shape();
            s.moveTo(0, 0); s.lineTo(0, 8); s.lineTo(-8, 0); s.closePath();
            const geo = new THREE.ExtrudeGeometry(s, { depth: 16, bevelEnabled: false });
            geo.translate(sx, 0, -8);
            const m = new THREE.Mesh(geo, mat(0x4a6a8a, { roughness: 0.8 }));
            m.castShadow = true;
            g.add(m);
            box(g, 0.6, 0.6, 16, 0xd8d8d8, sx - Math.sign(sx) * 8, 8, 0);
          }
          plane(g, 10, 16, 0x6a5a4a, 0, 0.05, 0);
          return g;
        }),
        obj('Fun Box', -20, -50, () => {
          const g = group('Fun Box');
          box(g, 10, 4.0, 8.0, 0x8a6a44, 0, 2.0, 0);
          box(g, 10.4, 0.4, 8.4, 0x6a4a2c, 0, 4.2, 0);
          // The rail across the top.
          cyl(g, 0.14, 0.14, 12.0, 0xc0c8d0, 0, 5.4, 0, { rz: Math.PI / 2 });
          for (const sx of [-5.4, 5.4]) box(g, 0.24, 1.4, 0.24, 0xc0c8d0, sx, 4.9, 0);
          // A bank off one end.
          box(g, 5.0, 0.5, 8.0, 0x8a6a44, 7.5, 1.2, 0, { rz: -0.4 });
          return g;
        }),
        obj('Quarter Pipe', 30, -60, () => {
          const g = group('Quarter Pipe');
          const s = new THREE.Shape();
          s.moveTo(0, 0); s.lineTo(0, 9); s.lineTo(-9, 0); s.closePath();
          const geo = new THREE.ExtrudeGeometry(s, { depth: 14, bevelEnabled: false });
          geo.translate(0, 0, -7);
          const m = new THREE.Mesh(geo, mat(0x5a7a9a, { roughness: 0.8 }));
          m.castShadow = true;
          g.add(m);
          box(g, 0.7, 0.7, 14, 0xd8d8d8, -9, 9, 0);
          return g;
        }),
        obj('Bumpy Object', -40, -20, () => {
          const g = group('Bumpy Object');
          // The humps: half-spheres in a loose field.
          const pts = [[0, 0], [7, 3], [-6, 5], [4, -7], [-5, -6], [12, -3], [-12, 2]];
          for (const [x, z] of pts) {
            const b = ball(g, 4.0, 0x9c6b38, x, 0, z, { sy: 0.6, flat: true });
            b.castShadow = true;
          }
          plane(g, 40, 30, 0xb8895a, 0, 0.05, 0);
          return g;
        }),
        obj('Skate Bowl', -60, 20, () => {
          const g = group('Skate Bowl');
          const bowl = new THREE.Mesh(new THREE.SphereGeometry(14, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(0xc0a878, { roughness: 0.85 }));
          bowl.scale.set(1, 0.5, 1);
          g.add(bowl);
          const lip = new THREE.Mesh(new THREE.TorusGeometry(14, 0.5, 8, 48), mat(0x8a6a44));
          lip.rotation.x = Math.PI / 2;
          lip.position.y = 0.1;
          g.add(lip);
          return g;
        }),
      ],
    },
  ];
}

// ===== BEACH =====

function beachCategories() {
  return [
    {
      id: 'camp', name: 'The Camp', blurb: 'The fire, and the way home.',
      objects: [
        obj('Campfire', -14, 22, () => {
          const g = group('Campfire');
          plane(g, 7.0, 7.0, 0x3b2f26, 0, 0.03, 0);
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            const r = 2.55;
            const s = 0.52 + ((i * 5) % 4) * 0.09;
            const st = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), mat(0x8d8b84, { roughness: 0.95, flat: true }));
            st.position.set(Math.cos(a) * r, s * 0.62, Math.sin(a) * r);
            st.scale.y = 0.8;
            st.castShadow = true;
            g.add(st);
          }
          for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2 + 0.5;
            cyl(g, 0.19, 0.24, 3.1, 0x6b4a2c, Math.cos(a) * 1.0, 1.25, Math.sin(a) * 1.0,
              { rx: Math.sin(a) * 0.72, rz: -Math.cos(a) * 0.72 });
          }
          for (let i = 0; i < 11; i++) {
            const a = i * 2.4, r = 0.35 + ((i * 7) % 5) * 0.22;
            const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2 + ((i * 3) % 3) * 0.07, 0), mat(0x241c18, { roughness: 1, flat: true }));
            c.position.set(Math.cos(a) * r, 0.16, Math.sin(a) * r);
            g.add(c);
          }
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            cone(g, 0.5, 2.5, 0xff8a1e, Math.cos(a) * 0.5, 1.35, Math.sin(a) * 0.5,
              { emissive: 0xff7a10, emissiveIntensity: 2.4, opacity: 0.9 });
            cone(g, 0.28, 1.5, 0xffe9a8, Math.cos(a) * 0.3, 0.85, Math.sin(a) * 0.3,
              { emissive: 0xffd05a, emissiveIntensity: 3.0, opacity: 0.95 });
          }
          for (const [sx, sz] of [[-16.4, 27.6], [-11.6, 27.6]]) {
            const seat = new THREE.Mesh(new THREE.DodecahedronGeometry(1.05, 0), mat(0x8d8b84, { roughness: 0.95, flat: true }));
            seat.position.set(sx - (-14), 0.42, sz - 22);
            seat.scale.set(1.3, 0.55, 1.05);
            g.add(seat);
          }
          return g;
        }),
        obj('Giant Scallop', 22, 26, () => {
          const g = group('Giant Scallop');
          // The lower valve, bedded in the sand.
          const lower = new THREE.Mesh(new THREE.SphereGeometry(14, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xf0e4d0, { roughness: 0.6 }));
          lower.scale.set(1, 0.4, 1);
          lower.position.y = 0.4;
          g.add(lower);
          // The ribs.
          for (let i = 0; i < 11; i++) {
            const a = -Math.PI * 0.92 + (i / 10) * Math.PI * 0.84;
            const r = new THREE.Mesh(new THREE.TorusGeometry(13.6, 0.28, 6, 24, Math.PI * 0.5), mat(0xd8c8ac, { roughness: 0.7 }));
            r.rotation.set(-Math.PI / 2, 0, a);
            r.position.y = 0.5;
            r.scale.set(1, 0.4, 1);
            g.add(r);
          }
          // The upper valve, thrown open.
          const upper = new THREE.Mesh(new THREE.SphereGeometry(14, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xfaeedc, { roughness: 0.55 }));
          upper.scale.set(1, 0.34, 1);
          upper.position.set(0, 6.0, -3.0);
          upper.rotation.x = -1.15;
          g.add(upper);
          for (let i = 0; i < 11; i++) {
            const a = -Math.PI * 0.92 + (i / 10) * Math.PI * 0.84;
            const r = new THREE.Mesh(new THREE.TorusGeometry(13.6, 0.26, 6, 24, Math.PI * 0.5), mat(0xe0d0b4, { roughness: 0.65 }));
            r.rotation.set(-Math.PI / 2, 0, a);
            r.position.set(0, 6.0, -3.0);
            r.rotation.x = -1.15 - Math.PI / 2;
            r.scale.set(1, 0.34, 1);
            g.add(r);
          }
          // The pearl in the dish.
          ball(g, 2.2, 0xfdf6e8, 0, 2.4, 1.0, { metalness: 0.3, roughness: 0.15 });
          return g;
        }),
        obj('Beach Boat', 60, -60, () => {
          const g = group('Beach Boat');
          const hull = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 2.2, 12, 24, 1, true), mat(0xf0e4d0, { roughness: 0.7 }));
          hull.scale.set(1, 1, 0.55);
          hull.position.y = 1.6;
          g.add(hull);
          box(g, 6.4, 0.4, 2.2, 0x8a6a44, 0, 0.4, 0);
          for (const sx of [-1.6, 1.6]) {
            box(g, 0.3, 8.0, 0.3, 0x8a6a44, sx, 4.4, 0);
          }
          box(g, 4.0, 0.3, 2.6, 0x8a6a44, 0, 8.2, 0);
          // A furled sail.
          cyl(g, 0.5, 0.4, 4.0, 0xe8dcc0, 0, 6.2, 0, { rx: 0.2 });
          return g;
        }),
      ],
    },
    {
      id: 'shore', name: 'Shore & Cliffs', blurb: 'What the cove is made of.',
      objects: [
        obj('Palm Tree', 30, 30, () => {
          const g = group('Palm Tree');
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 14, 10), mat(0x8a6a44, { roughness: 0.95 }));
          trunk.position.set(0, 7, 0);
          trunk.rotation.z = 0.16;
          g.add(trunk);
          for (let i = 0; i < 5; i++) {
            trunk.position.y = 7;
            void i;
          }
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2;
            const frond = box(g, 0.9, 0.16, 9.0, 0x3f7a3a, Math.cos(a) * 4.0, 13.6, Math.sin(a) * 4.0, { ry: -a, rx: 0.3 });
            frond.castShadow = true;
          }
          for (let i = 0; i < 4; i++) {
            ball(g, 0.7, 0x8a6a2a, Math.cos(i * 1.6) * 1.2, 13.0, Math.sin(i * 1.6) * 1.2);
          }
          return g;
        }),
        obj('Beach Rock', 12, 30, () => {
          const g = group('Beach Rock');
          const b = new THREE.Mesh(new THREE.DodecahedronGeometry(2.4, 0), mat(0x8a8880, { roughness: 1, flat: true }));
          b.scale.set(1.2, 0.8, 1);
          b.position.y = 1.4;
          b.castShadow = true;
          b.receiveShadow = true;
          g.add(b);
          for (let i = 0; i < 3; i++) {
            const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7 + i * 0.2, 0), mat(0x7a7870, { roughness: 1, flat: true }));
            s.position.set(Math.cos(i * 2.1) * 1.8, 0.5, Math.sin(i * 2.1) * 1.8);
            g.add(s);
          }
          return g;
        }),
        obj('Coral Head', 20, -30, () => {
          const g = group('Coral Head');
          const base = new THREE.Mesh(new THREE.DodecahedronGeometry(3.0, 0), mat(0x6a5a4a, { roughness: 1, flat: true }));
          base.scale.set(1.3, 0.6, 1.1);
          base.position.y = 0.9;
          g.add(base);
          const cols = [0xd84a8a, 0x4ad8c8, 0xd8c84a, 0x8a4ad8];
          for (let i = 0; i < 9; i++) {
            const a = i * 1.3, r = 0.6 + (i % 3) * 0.9;
            const br = cyl(g, 0.28, 0.42, 2.0 + (i % 4) * 0.7, cols[i % 4],
              Math.cos(a) * r, 1.6 + (i % 3) * 0.6, Math.sin(a) * r,
              { rz: Math.cos(a) * 0.4, rx: Math.sin(a) * 0.4 });
            br.castShadow = true;
            ball(g, 0.36, cols[(i + 1) % 4], Math.cos(a) * r * 1.4, 2.8 + (i % 4) * 0.7, Math.sin(a) * r * 1.4);
          }
          return g;
        }),
        obj('Cliff Stack', -70, 80, () => {
          const g = group('Cliff Stack');
          for (let i = 0; i < 4; i++) {
            const b = new THREE.Mesh(new THREE.DodecahedronGeometry(5.0 - i * 0.7, 0), mat(i % 2 ? 0x9a9080 : 0x8a8070, { roughness: 1, flat: true }));
            b.position.set(Math.sin(i * 1.7) * 2.2, 2.0 + i * 4.2, Math.cos(i * 1.7) * 2.0);
            b.scale.set(1.2, 0.7, 1.1);
            b.castShadow = true;
            g.add(b);
          }
          return g;
        }),
        obj('Washed-Up Shell', -14, 30, () => {
          const g = group('Washed-Up Shell');
          const s = new THREE.Mesh(new THREE.SphereGeometry(1.6, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xfaf0e0, { roughness: 0.5 }));
          s.scale.set(1, 0.45, 1.15);
          s.position.y = 0.1;
          g.add(s);
          for (let i = 0; i < 9; i++) {
            const a = -Math.PI * 0.9 + (i / 8) * Math.PI * 0.8;
            const r = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.07, 6, 18, Math.PI * 0.5), mat(0xe8d8c0, { roughness: 0.6 }));
            r.rotation.set(-Math.PI / 2, 0, a);
            r.scale.set(1, 0.45, 1.15);
            r.position.y = 0.12;
            g.add(r);
          }
          return g;
        }),
        obj('Starfish', -20, 26, () => {
          const g = group('Starfish');
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            const arm = cone(g, 0.5, 2.2, 0xe08a3a, Math.cos(a) * 0.9, 0.2, Math.sin(a) * 0.9, { rx: Math.PI / 2, ry: -a });
            arm.rotation.set(Math.PI / 2, -a, 0);
          }
          ball(g, 0.7, 0xf0a050, 0, 0.25, 0, { sy: 0.5 });
          return g;
        }),
      ],
    },
    {
      id: 'wildlife', name: 'Wildlife', blurb: 'What lives down here.',
      objects: [
        obj('Beach Crab', -14, 20, () => {
          const g = group('Beach Crab');
          const shell = ball(g, 1.5, 0xd9502f, 0, 0.72, 0, { sx: 1.15, sy: 0.5, sz: 0.82 });
          shell.castShadow = true;
          ball(g, 1.32, 0xf0b48a, 0, 0.5, 0, { sx: 1.14, sy: 0.34, sz: 0.8 });
          for (const sz of [0.42, -0.42]) {
            cyl(g, 0.08, 0.1, 0.5, 0xb03a1e, 1.02, 1.16, sz, { rz: -0.34 });
            ball(g, 0.19, 0xffffff, 1.14, 1.42, sz);
            ball(g, 0.1, 0x14100e, 1.28, 1.44, sz);
          }
          for (const sz of [1.35, -1.35]) {
            const arm = group('claw');
            arm.position.set(0.85, 0.78, sz);
            const upper = cyl(g, 0.19, 0.16, 0.95, 0xb03a1e, 0, 0, 0, { rz: -1.05 });
            upper.position.set(0.42, 0.08, 0);
            arm.add(upper);
            const palm = ball(g, 0.42, 0xe0603a, 0, 0, 0, { sx: 1.15, sy: 0.85, sz: 0.8 });
            palm.position.set(1.05, 0.24, 0);
            arm.add(palm);
            for (const jy of [0.16, -0.16]) {
              const jaw = group('jaw');
              jaw.position.set(1.4, 0.24, 0);
              const tip = cone(g, 0.15, 0.5, 0xe0603a, 0.22, 0, 0, { rz: -Math.PI / 2 });
              jaw.add(tip);
              arm.add(jaw);
              void jy;
            }
            g.add(arm);
          }
          for (let i = 0; i < 8; i++) {
            const sz = i < 4 ? 1 : -1, idx = i % 4;
            const pivot = new THREE.Group();
            pivot.position.set(0.6 - idx * 0.62, 0.66, sz * 1.12);
            const thigh = cyl(g, 0.11, 0.09, 0.78, 0xb03a1e, 0, 0, 0, { rx: sz * 1.15 });
            thigh.position.set(0, -0.1, sz * 0.32);
            pivot.add(thigh);
            const shin = cone(g, 0.09, 0.62, 0xb03a1e, 0, 0, 0);
            shin.position.set(0, -0.5, sz * 0.62);
            shin.rotation.x = sz * 0.5;
            pivot.add(shin);
            g.add(pivot);
          }
          return g;
        }),
        obj('Seagull', -40, 20, () => {
          const g = group('Seagull');
          const body = ball(g, 0.8, 0xf0f0ec, 0, 0, 0, { sx: 1.4, sy: 0.9, sz: 0.9 });
          body.castShadow = true;
          for (const sz of [0.7, -0.7]) {
            const wing = box(g, 2.6, 0.12, 0.9, 0xf8f8f4, -0.2, 0.1, sz, { rz: 0.1 });
            wing.castShadow = true;
          }
          ball(g, 0.45, 0xf8f8f4, 1.0, 0.5, 0);
          cone(g, 0.2, 0.8, 0xe0a020, 1.5, 0.45, 0, { rz: -Math.PI / 2 });
          box(g, 1.6, 0.1, 0.5, 0xf8f8f4, -1.4, 0.1, 0, { rz: 0.3 });
          return g;
        }),
        obj('Mermaid', 60, -70, () => {
          const g = group('Mermaid');
          const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.1, 4.0, 6, 14), mat(0xf0c8a8, { roughness: 0.8 }));
          body.position.y = 6.0;
          g.add(body);
          ball(g, 1.0, 0xf0c8a8, 0, 9.2, 0);
          // The hair, and the tail instead of legs.
          ball(g, 1.2, 0x4a8a5a, 0, 9.4, -0.2, { sy: 1.0 });
          const tail = new THREE.Mesh(new THREE.ConeGeometry(2.2, 7.0, 14), mat(0x3a7a6a, { roughness: 0.6 }));
          tail.position.y = 1.6;
          g.add(tail);
          const fin = new THREE.Mesh(new THREE.CircleGeometry(3.2, 16, 0, Math.PI), mat(0x4a9a8a, { roughness: 0.6, opacity: 0.9 }));
          fin.position.y = -1.4;
          fin.rotation.x = -Math.PI / 2;
          g.add(fin);
          // Arms out along the body.
          for (const sz of [1.2, -1.2]) cyl(g, 0.3, 0.24, 4.4, 0xf0c8a8, 0.4, 6.4, sz, { rz: -0.9 });
          return g;
        }),
        obj('Clam', 20, 22, () => {
          const g = group('Clam');
          // A small bivalve half-buried in the sand: one valve bedded down, the
          // other tipped up and open, ribs fanning the same way as the scallop.
          const lower = new THREE.Mesh(
            new THREE.SphereGeometry(3.0, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
            mat(0xd8c8ac, { roughness: 0.7 }));
          lower.scale.set(1, 0.34, 1);
          lower.position.y = 0.1;
          lower.receiveShadow = true;
          g.add(lower);
          const upper = new THREE.Mesh(
            new THREE.SphereGeometry(2.7, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
            mat(0xe8dcc4, { roughness: 0.6 }));
          upper.scale.set(1, 0.3, 1);
          upper.position.set(0, 2.4, -0.7);
          upper.rotation.x = -1.05;
          upper.castShadow = true;
          g.add(upper);
          for (let i = 0; i < 9; i++) {
            const a = -Math.PI * 0.9 + (i / 8) * Math.PI * 0.8;
            for (const [px, py, pz, tilt] of [[0, 0.28, 0, 0], [0, 2.4, -0.7, -1.05]]) {
              const rib = new THREE.Mesh(new THREE.TorusGeometry(2.85, 0.09, 5, 16, Math.PI * 0.5), mat(0xc8b89c, { roughness: 0.75 }));
              rib.rotation.set(-Math.PI / 2 + tilt, 0, a);
              rib.position.set(px, py, pz);
              rib.scale.set(1, 0.32, 1);
              g.add(rib);
            }
          }
          // The soft body in the gap, and the wet sand ring around it.
          ball(g, 1.7, 0xf2ddc0, 0, 0.5, 0.2, { sy: 0.4, sz: 1.1 });
          const ring = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.22, 5, 20), mat(0xb9a184, { roughness: 0.95 }));
          ring.rotation.x = -Math.PI / 2;
          ring.position.y = -0.06;
          ring.scale.set(1, 1, 0.7);
          g.add(ring);
          return g;
        }),
      ],
    },
  ];
}

// ===== Dispatch =====
// One place that knows which builder belongs to which level id, so the browser
// never has to care that 'ramp' is called rampworld.js somewhere else.

const CATEGORY_BUILDERS = {
  city: cityCategories,
  house: houseCategories,
  underground: undergroundCategories,
  ramp: rampCategories,
  beach: beachCategories,
};

const categoryCache = new Map();

// Every category for a level id, built once and cached. An unknown id (or an id
// that is still mid-edit in a hot reload) returns an empty list rather than
// throwing, because this is read straight off a URL parameter.
export function categoriesForLevel(levelId) {
  const builder = CATEGORY_BUILDERS[levelId];
  if (!builder) return [];
  if (!categoryCache.has(levelId)) categoryCache.set(levelId, builder());
  return categoryCache.get(levelId);
}

export function levelLabel(levelId) {
  return LEVELS.find((l) => l.id === levelId)?.label ?? null;
}

// Look an object up by the name that goes into the URL. Returns the level and
// category alongside it, because the browser needs both to rebuild the screen
// the player was looking at.
export function findObject(name) {
  if (!name) return null;
  const want = String(name).toLowerCase();
  for (const level of LEVELS) {
    for (const cat of categoriesForLevel(level.id)) {
      for (const o of cat.objects) {
        if (o.name.toLowerCase() === want) return { level, category: cat, object: o };
      }
    }
  }
  return null;
}