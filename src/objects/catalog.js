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
// 2. BUILDERS ARE THE REAL GEOMETRY. Every `build` is a zero-arg factory that
//    delegates to the very builder the level uses - nothing here is a hand-made
//    mini model. The game modules expose pure `build*`/`create*`/`make*`
//    factories (geometry only, no world registration) precisely so the browser
//    can construct the true object; the side effects that are part of the world
//    (knockables, blinker lights) are suppressed for previews so the standing
//    copy stays at its world spot. X/Z are REAL world positions.
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
import { buildCityBuilding, frontYard, kerbMailbox, newspaperRack } from '../cityBuildings.js';
import { buildTree, buildLampPost, buildTrafficLight, buildFireHydrant, buildBench, buildParkingMeter, buildPhoneBooth, makeClamShell } from '../props.js';
import { createFiretruck, createTacoTruck, createMonsterTruck, createSteamroller, createSchoolBus, createIndyCar } from '../cars.js';
import { createVortex, createWheelOfDeath, buildHammers, createTrebuchet, createRollingBoulder } from '../levels/rampworld/index.js';
import { makePalm, makeRock, makeBeachShell, makeCampfire, BEACH_SHELL } from '../levels/beach/index.js';
import { buildBoat, BOAT_SPOT } from '../levels/beach/boat.js';
import { makeCrab, makeMermaid } from '../levels/beach/critters.js';
import { buildCoralHead } from '../levels/beach/reefs.js';
import { createGulls } from '../levels/beach/seagulls.js';
import { makeTower, makeCitadelSpire, makeOrchardPlaza, makeTableauShop, makeGhost } from '../glasscity.js?v=1791396329761';
import {
  MAT, bed, sofa, table, chair, wardrobe, counterRun, tub, toilet, sinkUnit,
  fridge, rug, ceilingLight, tableLamp,
  buildFireplace, buildBookcase, buildSideboard, buildFrontDoor,
  buildCoatRack, buildWorkbench, buildTyreStack, buildWallMirror,
  HOUSE, ROOMS, FIREPLACE,
} from '../levels/house/index.js';

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

// `build` is either a zero-arg factory or the name of one of the city's LAYOUT
// buildings (which builds the real thing via buildCityBuilding).
function obj(name, x, z, build) {
  if (typeof build === 'string') {
    const id = build;
    return { name, x, z, build: () => buildCityBuilding(id) };
  }
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
  { id: 'house', label: 'House', blurb: 'Every room of the house, one category at a time.' },
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
        obj('Bodega', -22.5, 19.6, 'bodega'),
        obj('School', 34.5, 27, 'school'),
        obj('Library', 40, 54, 'library'),
        obj('City Hall', -49.5, 92, 'cityHall'),
        obj('Bank', -24, 92, 'bank'),
        obj('Hospital', 26, 95, 'hospital'),
        obj('Fire Station', 64, -39.5, 'fireStation'),
        obj('Gas Station', 44, -42, 'gasStation'),
      ],
    },
    {
      id: 'homes', name: 'Homes & Yards', blurb: 'Where people live.',
      objects: [
        obj('Apartment Block', -58, -22, 'apartments'),
        obj('Suburban House', -22, -68, 'houseStandard'),
        obj('House Garage', -22, -49, 'houseGarage'),
        obj('Front Lawn Set', -22, -67, () => {
          const g = group('Front Lawn Set');
          frontYard(g, 11, 10);
          return g;
        }),
      ],
    },
    {
      id: 'street', name: 'Street Furniture', blurb: 'The ordinary town clutter.',
      objects: [
        obj('Street Lamp', -14.5, -51.0, () => buildLampPost(-14.5, -51.0)),
        obj('Traffic Light', 13.5, 13.5, () => buildTrafficLight(13.5, 13.5)),
        obj('Fire Hydrant', -46, 14, () => buildFireHydrant(-46, 14)),
        obj('Bench', 16, 60, () => buildBench(16, 60, 0)),
        obj('Mailbox', -12.5, -54.25, () => {
          const g = group('Mailbox');
          kerbMailbox(g, 0, 0);
          return g;
        }),
        obj('Parking Meter', -47, -32, () => buildParkingMeter(-47, -32, Math.atan2(32, 47))),
        obj('Newspaper Box', -25.9, 13.7, () => {
          const g = group('Newspaper Box');
          newspaperRack(g, 0, 0);
          return g;
        }),
        obj('Phone Booth', -27, 20, () => buildPhoneBooth(-27, 20, 0)),
        obj('City Tree', 24, -74, () => buildTree(24, -74)),
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
        obj('Fireplace', FIREPLACE.x, FIREPLACE.z, () => {
          const g = group('Fireplace');
          buildFireplace(g, []);
          return g;
        }),
        obj('Sofa', -72, 24, () => {
          const g = group('Sofa');
          sofa(g, -72, 24, -Math.PI / 2);
          return g;
        }),
        obj('Coffee Table', -50, 14, () => {
          const g = group('Coffee Table');
          table(g, -50, 14, 20, 15, 2.2, 0, MAT.woodDark);
          return g;
        }),
        obj('Bookcase', -42, -16, () => {
          const g = group('Bookcase');
          buildBookcase(g, -42, -16);
          return g;
        }),
        obj('Area Rug', -50, 16, () => {
          const g = group('Area Rug');
          rug(g, -50, 16, 74, 50, MAT.rugLiving);
          return g;
        }),
      ],
    },
    {
      id: 'kitchen', name: 'Kitchen', blurb: 'Counters down two walls and a table in the middle.',
      objects: [
        obj('Counter Run', -22, 92, () => {
          const g = group('Counter Run');
          counterRun(g, -22, 92.45, 20, 0, 'x', false);
          return g;
        }),
        obj('Cupboard', ROOMS.kitchen.x0 + 3.1, 54, () => {
          const g = group('Cupboard');
          counterRun(g, ROOMS.kitchen.x0 + 3.1, 54, 12, 0, 'z', false);
          return g;
        }),
        obj('Fridge', -40, 92, () => {
          const g = group('Fridge');
          fridge(g, -40.5, 90.5, Math.PI);
          return g;
        }),
        obj('Kitchen Table', -19, 64, () => {
          const g = group('Kitchen Table');
          table(g, -19, 64, 20, 16, 4.6, 0, MAT.woodPale);
          for (let i = 0; i < 3; i++) chair(g, -26 + i * 7, 53, 0);
          return g;
        }),
      ],
    },
    {
      id: 'dining', name: 'Dining Room', blurb: 'A long table and a good lamp.',
      objects: [
        obj('Dining Table', 27, 70, () => {
          const g = group('Dining Table');
          table(g, 27, 70, 24, 16, 4.4, 0, MAT.wood);
          for (const s of [-1, 1]) {
            for (let i = 0; i < 2; i++) chair(g, 27 + s * 14, 62 + i * 8, s > 0 ? -Math.PI / 2 : Math.PI / 2);
          }
          for (let i = 0; i < 2; i++) chair(g, 21 + i * 12, 82, Math.PI);
          return g;
        }),
        obj('Sideboard', 45.5, 87, () => {
          const g = group('Sideboard');
          buildSideboard(g, 45.5, 87);
          return g;
        }),
        obj('Chandelier', 27, 70, () => {
          const g = group('Chandelier');
          ceilingLight(g, [], 27, 70, 9, 30, 60);
          return g;
        }),
      ],
    },
    {
      id: 'foyer', name: 'Foyer', blurb: 'Where you come in. The front door is locked.',
      objects: [
        obj('Front Door', 90, 68, () => {
          const g = group('Front Door');
          buildFrontDoor(g, HOUSE.wall);
          return g;
        }),
        obj('Hall Table', 83, 70, () => {
          const g = group('Hall Table');
          table(g, 83, 70, 8, 30, 3.4, 0, MAT.wood);
          return g;
        }),
        obj('Coat Rack', 68, 53, () => {
          const g = group('Coat Rack');
          buildCoatRack(g, 68, 53);
          return g;
        }),
      ],
    },
    {
      id: 'bedrooms', name: 'Bedrooms', blurb: 'Two beds either side of the walk-in.',
      objects: [
        obj('Bed', -68, -58, () => {
          const g = group('Bed');
          bed(g, -68, -58, 16, 22, 0, MAT.quilt);
          return g;
        }),
        obj('Wardrobe', -85.5, -70, () => {
          const g = group('Wardrobe');
          wardrobe(g, -85.5, -70, 12, Math.PI / 2);
          return g;
        }),
        obj('Bedroom Desk', -66, -34, () => {
          const g = group('Bedroom Desk');
          table(g, -66, -34, 10, 16, 3.2, 0, MAT.wood);
          tableLamp(g, [], -70, 3.2, -34, 14);
          return g;
        }),
        obj('Bedroom Chair', 30, -35, () => {
          const g = group('Bedroom Chair');
          chair(g, 30, -35, Math.PI);
          return g;
        }),
      ],
    },
    {
      id: 'bathroom', name: 'Bathroom', blurb: 'Tub, sink, and a mirror.',
      objects: [
        obj('Bathtub', 74.5, 30, () => {
          const g = group('Bathtub');
          tub(g, 74.5, 30, Math.PI / 2);
          return g;
        }),
        obj('Sink', 87, 4, () => {
          const g = group('Sink');
          sinkUnit(g, 87, 4, -Math.PI / 2);
          return g;
        }),
        obj('Mirror', 66, -10, () => {
          const g = group('Mirror');
          buildWallMirror(g, 66, -10);
          return g;
        }),
        obj('Toilet', 87, -13, () => {
          const g = group('Toilet');
          toilet(g, 87, -13, Math.PI);
          return g;
        }),
      ],
    },
    {
      id: 'garage', name: 'Dark Garage', blurb: 'Pitch dark, and the only way out.',
      objects: [
        obj('Workbench', -66, 52, () => {
          const g = group('Workbench');
          buildWorkbench(g, -66, 52);
          return g;
        }),
        obj('Tyre Stack', -54, 53, () => {
          const g = group('Tyre Stack');
          buildTyreStack(g, -54, 53);
          return g;
        }),
      ],
    },
    // The rides. Every one of these is a shape you can pick from the gear menu
    // and drive, which is why they are here rather than filed under traffic: the
    // point of browsing them is to see what you are allowed to get into. Each
    // build is the REAL garage vehicle from cars.js.
    {
      id: 'rides', name: 'Rides', blurb: 'Everything you can climb into and drive.',
      objects: [
        obj('Fire Truck', 45, 0, () => createFiretruck()),
        obj('Taco Truck', -22, 6, () => createTacoTruck()),
        obj('Monster Truck', 0, 0, () => createMonsterTruck()),
        obj('Steamroller', 0, 0, () => createSteamroller()),
        obj('School Bus', 0, 0, () => createSchoolBus()),
        obj('Indy 500', 0, 0, () => createIndyCar()),
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
        obj('Glass Tower', -126, 152, () => {
          const g = group('Glass Tower');
          makeTower(g, -126, 152, 7, 24, 1);
          return g;
        }),
        obj('Citadel Spire', 4, 152, () => {
          const g = group('Citadel Spire');
          makeCitadelSpire(g, 4, 152);
          return g;
        }),
        obj('Balloon Plaza', 44, 154, () => {
          const g = group('Balloon Plaza');
          makeOrchardPlaza(g, 44, 154);
          return g;
        }),
        obj('Tableau Shop', -96, 143, () => {
          const g = group('Tableau Shop');
          makeTableauShop(g, -96, 143, 0x4a7fd4, [0xe8d3a0, 0xb0c4e8, 0xe8a0b4]);
          return g;
        }),
        // Named by their colour, and they have to be: `?objects=<name>` identifies an
        // object by its name, so two ghosts both called "Street Ghost" would make
        // the back button and a refresh ambiguous about which one you were
        // looking at.
        obj('Blue Street Ghost', -36, 143, () => {
          const g = group('Blue Street Ghost');
          makeGhost(g, -36, 143, 0x9fd8ff);
          return g;
        }),
        obj('Pink Street Ghost', 44, 143, () => {
          const g = group('Pink Street Ghost');
          makeGhost(g, 44, 143, 0xffb0e0);
          return g;
        }),
      ],
    },
  ];
}

// ===== RAMPWORLD =====

function rampCategories() {
  // The velodrome, the skatepark and the bumpy-object field are pure terrain
  // (height functions in rampworld/index.js), and the half-pipe / quarter-pipe /
  // fun-box ramps are terrain too. They are not objects you can stand next to, so
  // they are not in the browser. Everything that IS a real machine delegates to
  // the rampworld builders, which are given a throwaway Group as their scene and
  // a flat height function so they build exactly what the world builds.
  const fresh = () => new THREE.Group();
  const flat = () => 0;
  return [
    {
      id: 'course', name: 'The Course', blurb: 'The hills and the big set pieces.',
      objects: [
        obj('Wheel of Death', 35, -5, () => {
          const s = fresh();
          createWheelOfDeath(s, 35, -5, flat);
          return s;
        }),
        obj('Trebuchet', -50, 70, () => {
          const s = fresh();
          createTrebuchet(s, -50, 70, flat);
          return s;
        }),
        obj('Giant Boulder', 78, 42, () => {
          const s = fresh();
          createRollingBoulder(s, 78, 42, flat);
          return s;
        }),
        obj('Hammer Gauntlet', 0, 70, () => {
          const s = fresh();
          buildHammers(s, flat);
          return s;
        }),
        obj('Vortex Cloud', 40, 40, () => {
          const s = fresh();
          createVortex(s, 40, 40, flat);
          return s;
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
        obj('Campfire', -14, 22, () => makeCampfire(0).group),
        obj('Giant Scallop', 22, 26, () => makeClamShell(new THREE.Group(), BEACH_SHELL).group),
        obj('Beach Boat', BOAT_SPOT.x, BOAT_SPOT.z, () => buildBoat()),
      ],
    },
    {
      id: 'shore', name: 'Shore & Cliffs', blurb: 'What the cove is made of.',
      objects: [
        obj('Palm Tree', -36, 34, () => makePalm(-36, 34, 1.05, -0.74).group),
        obj('Beach Rock', 12, 30, () => {
          const g = group('Beach Rock');
          g.add(makeRock(12, 30, 1.15, 2));
          return g;
        }),
        obj('Coral Head', -38, -22, () => {
          const g = group('Coral Head');
          g.add(buildCoralHead(0));
          return g;
        }),
        obj('Washed-Up Shell', -14, 30, () => makeBeachShell(-14, 30, 1.4, 0.7)),
      ],
    },
    {
      id: 'wildlife', name: 'Wildlife', blurb: 'What lives down here.',
      objects: [
        obj('Beach Crab', 8.6, 28.4, () => makeCrab(8.6, 28.4, { x: 12, z: 30 }).group),
        obj('Seagull', 60, 30, () => createGulls(0).group),
        obj('Mermaid', 60, -70, () => makeMermaid(0x2f8f7a, 0x7fdcc0, 0xc4622f).group),
        obj('Park Clam', 22, 60, () => makeClamShell(new THREE.Group()).group),
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