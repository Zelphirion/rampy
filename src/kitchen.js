// ===== The shared kitchen kit =====
//
// One set of builders that both kitchens are assembled from: the house's big
// working galley and the space station's compact civic one. The geometry is
// identical between the two; only the PALETTE changes. That is the whole point
// of the module - a stove is a stove whether it is standing under a tiled house
// wall or bolted to the rim of a wheel, so it should be built once.
//
// Every builder returns a fresh THREE.Group in LOCAL space:
//   +X  the length of the run (right along the wall)
//   +Y  up (base sits at y = 0)
//   -Z  the wall side; the front faces +Z
//
// The scale is a NUMBER (0.8 for the station, 2.5 for the giant house), and it
// is baked into every geometry dimension rather than set on group.scale. The
// house's furniture audit measures raw geometry parameters and ignores a group
// scale, so a group.scale-based kitchen would measure as if it were full size
// and be reported as blocking the whole room.
//
// The countertop clutter (toaster oven, microwave, blender, jars...) is built
// INSIDE the counter run, not as separate units standing on it. The audit sees
// any two groups that overlap as an intersection, and a toaster sitting on a
// worktop is by definition overlapping it - so it has to be the same piece.
//
// Import the exact CDN specifier the rest of the project uses, so the headless
// shim that redirects three to the local copy catches this module too.

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------

// The house: dark painted cabinets, a stone worktop, brushed steel.
export const HOUSE_KITCHEN = {
  cabinet: 0x3f4a52,
  door: 0x2d363e,
  counter: 0x2f343a,
  steel: 0xb9c0c7,
  dark: 0x1b1e22,
  chrome: 0xdfe6ec,
  handle: 0xcdd5dc,
  ovenGlass: 0x10141a,
  screen: 0x243f5c,
  screenGlow: 0x1d3f5e,
  wood: 0xd8bb8c,
  woodDark: 0x9a7a4c,
  glass: 0xcfe6f2,
  ceramic: 0xf2f5f7,
  coffee: 0x2b2320,
  oil: 0xd9a441,
  tea: 0xb84a3f,
  plant: 0x3f7f42,
  cloth: 0xc9584f,
  soap: 0x8fb23f,
  light: 0xfff0d0,
};

// The station: pale molded polymer, cold steel, a cyan live panel.
export const STATION_KITCHEN = {
  cabinet: 0xd9dee6,
  door: 0xb4becb,
  counter: 0x8b929c,
  steel: 0xc4ccd6,
  dark: 0x2a3038,
  chrome: 0xe8eef5,
  handle: 0x9aa4b2,
  ovenGlass: 0x0e1a22,
  screen: 0x0e3a44,
  screenGlow: 0x2fe0ff,
  wood: 0xd8bb8c,
  woodDark: 0x9a7a4c,
  glass: 0xcfe6f2,
  ceramic: 0xf2f5f7,
  coffee: 0x2b2320,
  oil: 0xd9a441,
  tea: 0x2a9fb8,
  plant: 0x3fbf6a,
  cloth: 0xf25a2a,
  soap: 0x5fd0c0,
  light: 0xd8f6ff,
};

// ---------------------------------------------------------------------------
// Materials, cached per palette
// ---------------------------------------------------------------------------

function mk(color, o = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: o.roughness ?? 0.7,
    metalness: o.metalness ?? 0,
    emissive: o.emissive ?? 0x000000,
    emissiveIntensity: o.emissiveIntensity ?? 1,
  });
}

const matCache = new WeakMap();
function kit(pal) {
  let m = matCache.get(pal);
  if (m) return m;
  m = {
    cabinet: mk(pal.cabinet, { roughness: 0.6 }),
    door: mk(pal.door, { roughness: 0.5 }),
    counter: mk(pal.counter, { roughness: 0.3 }),
    steel: mk(pal.steel, { roughness: 0.4, metalness: 0.5 }),
    dark: mk(pal.dark, { roughness: 0.6, metalness: 0.3 }),
    chrome: mk(pal.chrome, { roughness: 0.15, metalness: 0.9 }),
    handle: mk(pal.handle, { roughness: 0.3, metalness: 0.6 }),
    ovenGlass: mk(pal.ovenGlass, { roughness: 0.2, emissive: 0xff7a2a, emissiveIntensity: 0.3 }),
    screen: mk(pal.screen, { roughness: 0.3, emissive: pal.screenGlow, emissiveIntensity: 1.3 }),
    wood: mk(pal.wood, { roughness: 0.8 }),
    woodDark: mk(pal.woodDark, { roughness: 0.8 }),
    glass: mk(pal.glass, { roughness: 0.08, emissive: pal.glass, emissiveIntensity: 0.15 }),
    ceramic: mk(pal.ceramic, { roughness: 0.25 }),
    coffee: mk(pal.coffee, { roughness: 0.9 }),
    oil: mk(pal.oil, { roughness: 0.4, emissive: pal.oil, emissiveIntensity: 0.12 }),
    tea: mk(pal.tea, { roughness: 0.35 }),
    plant: mk(pal.plant, { roughness: 0.9 }),
    cloth: mk(pal.cloth, { roughness: 0.95 }),
    soap: mk(pal.soap, { roughness: 0.35 }),
    light: mk(pal.light, { roughness: 0.4, emissive: pal.light, emissiveIntensity: 0.6 }),
  };
  matCache.set(pal, m);
  return m;
}

// ---------------------------------------------------------------------------
// Local primitives - every dimension is scaled by `s` on the way in
// ---------------------------------------------------------------------------

function grp(name) {
  const g = new THREE.Group();
  g.name = name;
  return g;
}

function bx(g, w, h, d, x, y, z, material, s) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w * s, h * s, d * s), material);
  m.position.set(x * s, y * s, z * s);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}

function cy(g, rt, rb, h, x, y, z, material, s, seg = 14) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt * s, rb * s, h * s, seg), material);
  m.position.set(x * s, y * s, z * s);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}

function sp(g, r, x, y, z, material, s, seg = 14) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r * s, seg, Math.max(6, seg - 4)), material);
  m.position.set(x * s, y * s, z * s);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}

function cn(g, r, h, x, y, z, material, s, seg = 10) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r * s, h * s, seg), material);
  m.position.set(x * s, y * s, z * s);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}

function tr(g, r, tube, x, y, z, material, s, seg = 10, arc = Math.PI * 2) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r * s, tube * s, 8, seg, arc), material);
  m.position.set(x * s, y * s, z * s);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}

// ---------------------------------------------------------------------------
// Counter run
// ---------------------------------------------------------------------------

const WORKTOP = 2.2;    // canonical height of the worktop surface
const DEPTH = 1.3;      // canonical depth of a counter, wall to front edge

// A run of base cabinets with a worktop. `len` is the run length in canonical
// units; `sink` drops a basin and a mixer tap in at `sinkX`.
export function makeCounterRun(o = {}) {
  const pal = o.pal || HOUSE_KITCHEN;
  const s = o.s ?? 1;
  const len = o.len ?? 6;
  const M = kit(pal);
  const g = grp('Counter Run');
  const H = 2.04;

  bx(g, len - 0.35, 0.15, 1.0, 0, 0.075, 0.05, M.dark, s);            // plinth
  bx(g, len, 2.0, 1.3, 0, 1.15, 0, M.cabinet, s);                     // carcass
  bx(g, len + 0.1, 0.16, 1.4, 0, 2.12, 0, M.counter, s);             // worktop
  bx(g, len, 0.5, 0.08, 0, 2.45, -0.61, M.counter, s);              // upstand

  // Door fronts with a handle near the top of each.
  const n = Math.max(2, Math.round(len / 1.3));
  const step = len / n;
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + (i + 0.5) * step;
    bx(g, step - 0.09, 1.55, 0.05, x, 1.2, 0.675, M.door, s);
    bx(g, Math.min(0.6, step * 0.6), 0.08, 0.09, x, 1.78, 0.74, M.handle, s);
  }

  if (o.sink) addSink(g, M, s, o.sinkX ?? -len / 2 + 1.1);
  return g;
}

// A worktop sink: a recessed steel basin, a drainer groove, a mixer tap.
function addSink(g, M, s, sx) {
  bx(g, 1.1, 0.2, 0.72, sx, 2.04, 0, M.steel, s);
  bx(g, 0.9, 0.2, 0.54, sx, 2.0, 0, M.dark, s);
  cy(g, 0.03, 0.03, 0.34, sx - 0.18, 2.32, -0.24, M.chrome, s, 8);
  cy(g, 0.03, 0.03, 0.32, sx + 0.03, 2.5, -0.1, M.chrome, s, 8).rotation.z = Math.PI / 2;
  const spout = bx(g, 0.32, 0.05, 0.05, sx + 0.14, 2.47, -0.1, M.chrome, s);
  void spout;
}

// ---------------------------------------------------------------------------
// The range: four burners, a control panel and a real oven
// ---------------------------------------------------------------------------

export function makeStove(o = {}) {
  const pal = o.pal || HOUSE_KITCHEN;
  const s = o.s ?? 1;
  const M = kit(pal);
  const g = grp('Range Stove');
  const W = 2.4, D = 1.5, TOP = 2.2;

  bx(g, W - 0.3, 0.15, D - 0.3, 0, 0.075, 0.05, M.dark, s);
  bx(g, W, TOP - 0.34, D, 0, (0.15 + TOP - 0.34) / 2, 0, M.steel, s);
  bx(g, W + 0.06, 0.14, D + 0.08, 0, TOP - 0.07, 0, M.dark, s);
  bx(g, W, 0.05, D, 0, TOP, 0, M.dark, s);

  for (const cx of [-0.6, 0.6]) for (const cz of [-0.4, 0.4]) {
    cy(g, 0.28, 0.28, 0.05, cx, TOP + 0.03, cz, M.steel, s, 16);
    cy(g, 0.08, 0.08, 0.05, cx, TOP + 0.05, cz, M.chrome, s, 10);
    for (let k = 0; k < 4; k++) {
      const bar = bx(g, 0.5, 0.03, 0.05, cx, TOP + 0.05, cz, M.dark, s);
      bar.rotation.y = k * Math.PI / 4;
    }
  }

  // Control panel: four knobs and a little live readout.
  bx(g, W, 0.5, 0.06, 0, TOP - 0.62, D / 2 + 0.02, M.dark, s);
  for (let i = 0; i < 4; i++) cy(g, 0.09, 0.09, 0.07, -0.75 + i * 0.5, TOP - 0.62, D / 2 + 0.06, M.chrome, s, 10);
  bx(g, 0.44, 0.16, 0.03, 0.78, TOP - 0.62, D / 2 + 0.06, M.screen, s);

  // Oven door with a dark glass window and a long handle.
  bx(g, W, 1.0, 0.06, 0, 0.95, D / 2 + 0.02, M.dark, s);
  bx(g, W - 0.5, 0.62, 0.03, 0, 0.98, D / 2 + 0.05, M.ovenGlass, s);
  bx(g, W - 0.3, 0.1, 0.14, 0, 1.5, D / 2 + 0.09, M.chrome, s);
  return g;
}

// ---------------------------------------------------------------------------
// Countertop appliances
// ---------------------------------------------------------------------------

export function makeToasterOven(o = {}) {
  const s = o.s ?? 1;
  const M = kit(o.pal || HOUSE_KITCHEN);
  const g = grp('Toaster Oven');
  bx(g, 1.3, 0.78, 0.9, 0, 0.39, 0, M.steel, s);
  bx(g, 1.32, 0.1, 0.92, 0, 0.83, 0, M.dark, s);
  bx(g, 1.02, 0.5, 0.04, 0, 0.4, 0.45, M.ovenGlass, s);
  bx(g, 0.9, 0.07, 0.09, 0, 0.16, 0.5, M.chrome, s);
  cy(g, 0.06, 0.06, 0.06, -0.42, 0.12, 0.46, M.chrome, s, 10);
  cy(g, 0.06, 0.06, 0.06, 0.42, 0.12, 0.46, M.chrome, s, 10);
  return g;
}

export function makeMicrowave(o = {}) {
  const s = o.s ?? 1;
  const M = kit(o.pal || HOUSE_KITCHEN);
  const g = grp('Microwave');
  bx(g, 1.6, 0.9, 1.0, 0, 0.45, 0, M.steel, s);
  bx(g, 0.94, 0.62, 0.03, -0.16, 0.46, 0.5, M.ovenGlass, s);
  bx(g, 0.12, 0.62, 0.07, 0.44, 0.46, 0.52, M.dark, s);
  bx(g, 0.05, 0.5, 0.05, 0.32, 0.46, 0.55, M.chrome, s);
  bx(g, 0.08, 0.12, 0.03, 0.44, 0.66, 0.55, M.screen, s);
  for (let i = 0; i < 3; i++) bx(g, 0.05, 0.05, 0.03, 0.44, 0.44 - i * 0.1, 0.55, M.chrome, s);
  return g;
}

export function makeBlender(o = {}) {
  const s = o.s ?? 1;
  const M = kit(o.pal || HOUSE_KITCHEN);
  const g = grp('Blender');
  bx(g, 0.5, 0.12, 0.5, 0, 0.06, 0, M.dark, s);
  bx(g, 0.46, 0.34, 0.46, 0, 0.3, 0, M.steel, s);
  for (let i = 0; i < 3; i++) bx(g, 0.08, 0.05, 0.04, -0.1 + i * 0.1, 0.22, 0.24, i === 1 ? M.screen : M.chrome, s);
  cy(g, 0.02, 0.02, 0.12, 0, 0.5, 0, M.chrome, s, 8);
  cy(g, 0.26, 0.2, 0.7, 0, 0.88, 0, M.glass, s, 18);
  cy(g, 0.28, 0.28, 0.06, 0, 1.25, 0, M.dark, s, 18);
  cy(g, 0.12, 0.16, 0.1, 0, 1.33, 0, M.dark, s, 14);
  return g;
}

export function makeCoffeeMaker(o = {}) {
  const s = o.s ?? 1;
  const M = kit(o.pal || HOUSE_KITCHEN);
  const g = grp('Coffee Maker');
  bx(g, 0.74, 0.14, 0.72, 0, 0.07, 0, M.dark, s);
  bx(g, 0.72, 0.98, 0.3, 0, 0.62, -0.2, M.steel, s);
  bx(g, 0.7, 0.16, 0.28, 0, 1.02, -0.19, M.screen, s);
  cy(g, 0.05, 0.05, 0.4, 0, 0.72, -0.02, M.chrome, s, 8);
  cy(g, 0.24, 0.2, 0.5, 0, 0.42, 0.12, M.glass, s, 16);
  cy(g, 0.26, 0.26, 0.06, 0, 0.7, 0.12, M.dark, s, 16);
  const handle = tr(g, 0.15, 0.035, 0.22, 0.42, 0.12, M.dark, s, 10, Math.PI);
  handle.rotation.y = Math.PI / 2;
  return g;
}

// ---------------------------------------------------------------------------
// Countertop pottery and bottles
// ---------------------------------------------------------------------------

export function makeTeapot(o = {}) {
  const s = o.s ?? 1;
  const M = kit(o.pal || HOUSE_KITCHEN);
  const g = grp('Teapot');
  cy(g, 0.26, 0.24, 0.1, 0, 0.05, 0, M.tea, s, 18);
  const body = sp(g, 0.28, 0, 0.32, 0, M.tea, s, 18);
  body.scale.set(1, 0.85, 1);
  cy(g, 0.17, 0.2, 0.09, 0, 0.62, 0, M.tea, s, 18);
  sp(g, 0.05, 0, 0.7, 0, M.dark, s, 10);
  const spout = cy(g, 0.05, 0.075, 0.34, 0.28, 0.42, 0, M.tea, s, 10);
  spout.rotation.z = -0.9;
  const handle = tr(g, 0.15, 0.035, -0.3, 0.4, 0, M.tea, s, 12, Math.PI);
  handle.rotation.y = Math.PI / 2;
  return g;
}

export function makeOilBottle(o = {}) {
  const s = o.s ?? 1;
  const M = kit(o.pal || HOUSE_KITCHEN);
  const g = grp('Oil Bottle');
  cy(g, 0.1, 0.12, 0.42, 0, 0.21, 0, M.oil, s, 14);
  cy(g, 0.05, 0.05, 0.16, 0, 0.5, 0, M.glass, s, 12);
  cy(g, 0.035, 0.035, 0.07, 0, 0.61, 0, M.wood, s, 10);
  bx(g, 0.14, 0.2, 0.02, 0, 0.2, 0.1, M.ceramic, s);
  return g;
}

export function makeUtensilJar(o = {}) {
  const s = o.s ?? 1;
  const M = kit(o.pal || HOUSE_KITCHEN);
  const g = grp('Utensil Jar');
  cy(g, 0.15, 0.13, 0.36, 0, 0.18, 0, M.glass, s, 16);
  cy(g, 0.16, 0.16, 0.06, 0, 0.34, 0, M.steel, s, 16);
  const heads = [M.wood, M.steel, M.woodDark, M.steel, M.wood];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const dx = Math.cos(a) * 0.05, dz = Math.sin(a) * 0.05;
    const rod = cy(g, 0.025, 0.025, 0.5, dx, 0.6, dz, heads[i], s, 8);
    rod.rotation.z = Math.cos(a) * 0.16;
    rod.rotation.x = Math.sin(a) * 0.16;
    if (i % 2 === 0) {
      const head = sp(g, 0.07, dx * 1.4, 0.84, dz * 1.4, heads[i], s, 10);
      head.scale.set(1, 0.45, 1.35);
    }
  }
  return g;
}

export function makeCuttingBoard(o = {}) {
  const s = o.s ?? 1;
  const M = kit(o.pal || HOUSE_KITCHEN);
  const g = grp('Cutting Boards');
  bx(g, 0.9, 0.09, 0.62, 0, 0.045, 0, M.wood, s);
  bx(g, 0.78, 0.09, 0.5, 0.04, 0.14, 0.04, M.woodDark, s);
  const upright = bx(g, 0.5, 0.72, 0.06, -0.42, 0.36, -0.12, M.wood, s);
  upright.rotation.x = -0.22;
  return g;
}

// ---------------------------------------------------------------------------
// Wall dressing
// ---------------------------------------------------------------------------

export function makeKnifeStrip(o = {}) {
  const s = o.s ?? 1;
  const M = kit(o.pal || HOUSE_KITCHEN);
  const g = grp('Knife Strip');
  const len = o.len ?? 1.6;
  bx(g, len, 0.12, 0.05, 0, 0, 0, M.steel, s);
  cy(g, 0.04, 0.04, 0.05, -len / 2 + 0.12, 0, -0.02, M.dark, s, 8);
  cy(g, 0.04, 0.04, 0.05, len / 2 - 0.12, 0, -0.02, M.dark, s, 8);
  const n = o.count ?? 5;
  for (let i = 0; i < n; i++) {
    const kx = -len / 2 + 0.28 + i * (len - 0.56) / (n - 1);
    bx(g, 0.08, 0.3, 0.05, kx, -0.24, 0.01, M.dark, s);       // handle
    bx(g, 0.13, 0.5, 0.02, kx, -0.66, 0.01, M.steel, s);      // blade
    cn(g, 0.075, 0.16, kx, -0.98, 0.01, M.steel, s, 6);       // tip
  }
  return g;
}

export function makeSpiceRack(o = {}) {
  const s = o.s ?? 1;
  const M = kit(o.pal || HOUSE_KITCHEN);
  const g = grp('Spice Rack');
  const W = 1.6, H = 1.2;
  bx(g, W, H, 0.06, 0, 0, 0, M.wood, s);
  const caps = [M.tea, M.soap, M.oil, M.plant];
  for (let row = 0; row < 2; row++) {
    const y = -H / 2 + 0.22 + row * 0.55;
    bx(g, W, 0.06, 0.32, 0, y - 0.16, 0.16, M.wood, s);
    for (let i = 0; i < 4; i++) {
      const x = -W / 2 + 0.24 + i * (W - 0.48) / 3;
      cy(g, 0.1, 0.1, 0.3, x, y + 0.02, 0.17, M.glass, s, 12);
      cy(g, 0.105, 0.105, 0.07, x, y + 0.2, 0.17, caps[(i + row) % 4], s, 12);
    }
  }
  bx(g, W, 0.06, 0.32, 0, H / 2 - 0.03, 0.16, M.wood, s);
  return g;
}

// ---------------------------------------------------------------------------
// The galley: a counter run, a stove, the clutter and the wall tools, as ONE
// group. Assembling them here (rather than placing each in the level) is what
// keeps the audit happy - it sees a single piece of furniture, not a dozen
// objects overlapping the counter they stand on.
// ---------------------------------------------------------------------------

export function makeGalley(o = {}) {
  const pal = o.pal || HOUSE_KITCHEN;
  const s = o.s ?? 1;
  const len = o.len ?? 13;
  const M = kit(pal);
  const g = grp('Galley Kitchen');
  const SW = 2.4;
  const cLen = len - SW;
  const TOP = 2.2;

  const counter = makeCounterRun({ pal, s, len: cLen, sink: true, sinkX: -cLen / 2 + 1.0 });
  counter.position.x = (-SW / 2) * s;
  g.add(counter);

  const stove = makeStove({ pal, s });
  stove.position.x = (len / 2 - SW / 2) * s;
  stove.position.z = 0.14 * s;   // back flush with the counter run, not proud of the wall
  g.add(stove);

  // Countertop clutter. Each item's base sits on the worktop, so y = TOP.
  const place = (item, cx, cz) => {
    item.position.set(cx * s, TOP * s, cz * s);
    g.add(item);
  };
  place(makeBlender({ pal, s }), -4.4, -0.15);
  place(makeCoffeeMaker({ pal, s }), -3.2, -0.1);
  place(makeToasterOven({ pal, s }), -1.9, 0.0);
  place(makeMicrowave({ pal, s }), -0.4, 0.0);
  place(makeUtensilJar({ pal, s }), 0.9, -0.28);
  place(makeTeapot({ pal, s }), 2.0, -0.1);
  place(makeOilBottle({ pal, s }), 3.0, -0.22);
  place(makeCuttingBoard({ pal, s }), 3.9, 0.08);

  // Wall tools, hung on the back (local -Z) above the worktop.
  const knife = makeKnifeStrip({ pal, s });
  knife.position.set(-2.6 * s, 3.5 * s, -0.66 * s);
  g.add(knife);
  const spice = makeSpiceRack({ pal, s });
  spice.position.set(1.0 * s, 3.3 * s, -0.66 * s);
  g.add(spice);

  // A strip of under-cabinet light so the worktop reads at night.
  bx(g, cLen, 0.05, 0.06, 0, 4.0, -0.6, M.light, s);
  return g;
}
