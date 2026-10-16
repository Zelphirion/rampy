import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { RING_R, RING_W, RING_HALF_W, RING_LANE, RING_CIRC } from '../../spaceRing.js';
import { makeGalley, STATION_KITCHEN } from '../../kitchen.js?v=1799900000000';

// ===== The four rim sectors =====
//
// The wheel's inside is divided into four equal arcs, one per function of
// station life. Each builds its own floor, wall dressing, props and hazards so
// the drive reads as a tour through distinct rooms rather than one endless
// corridor:
//
//   0. CIVIC     world angle [0,   PI/2)  white molded polymer, red accents
//   1. HYDRO     world angle [PI/2, PI)   terraced soil, glass domes, grow lamps
//   2. REACTOR   world angle [PI,  3PI/2) grating, plasma conduits, geysers
//   3. WASTE     world angle [3PI/2, 2PI) hazard stripes, belts, the dock vent
//
// Everything is expressed in RING coordinates (s = arc length, w = axial offset)
// and oriented with `place`, which replicates the level's own orientFloor so a
// prop's local +X is the driving tangent, +Y points at the hub (up) and +Z is
// axial - exactly the frame the car drives in.
//
// Each distinct prop is ALSO an exported `make*` builder returning a fresh
// Object3D in local space (base near y=0, +Y up). The level composes them, and
// the object browser shows the very same models - so a tile in the catalogue is
// the real geometry, never a hand-made mini copy. Builders that the level
// animates attach their moving parts to `group.userData` (head, plate, slab,
// spark, jet, grate, arm, curtain, boom...) so the sector can drive them.
//
// The module returns plain data for main.js to act on:
//   zones   hazard / mechanic rectangles and points (s, w, type, state...)
//   knocks  light props the car can shove around (props.js-style local spring)
//   crane   the rescue gantry used by the airlock-vent cinematic
//   update  advances every animation and the knock-springs each frame

const TWO_PI = Math.PI * 2;
const B = THREE.BackSide;

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({
  color,
  roughness: o.roughness ?? 0.75,
  metalness: o.metalness ?? 0,
  emissive: o.emissive ?? 0x000000,
  emissiveIntensity: o.emissiveIntensity ?? 1,
  transparent: o.opacity !== undefined,
  opacity: o.opacity ?? 1,
  side: o.side ?? THREE.FrontSide,
  flatShading: !!o.flat,
});

const M = {
  steel: mat(0x8b929c, { roughness: 0.5, metalness: 0.6 }),
  steelDark: mat(0x3c434d, { roughness: 0.6, metalness: 0.5 }),
  dark: mat(0x1c222b, { roughness: 0.7, metalness: 0.4 }),
  glass: new THREE.MeshStandardMaterial({ color: 0xbfe0ff, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.32, side: THREE.DoubleSide, emissive: 0x2a6a8c, emissiveIntensity: 0.4 }),

  // 1. Civic
  civFloor: mat(0xe9edf3, { roughness: 0.28, metalness: 0.12, side: B }),
  civWall: mat(0xeef1f6, { roughness: 0.5 }),
  civDark: mat(0x2a303a, { roughness: 0.5, metalness: 0.4 }),
  civAccent: mat(0xf25a2a, { roughness: 0.5, emissive: 0x5a1c08, emissiveIntensity: 0.7 }),
  civLed: mat(0x9fd8ff, { emissive: 0x7fc4ff, emissiveIntensity: 2.0 }),
  eyeLens: mat(0xff2a2a, { emissive: 0xff2020, emissiveIntensity: 2.4 }),
  boost: mat(0x22509a, { emissive: 0x3f9dff, emissiveIntensity: 2.4, side: B, roughness: 0.35 }),

  // 2. Hydroponics
  hydFloor: mat(0x33402c, { roughness: 1, side: B }),
  hydSoil: mat(0x4a3526, { roughness: 1 }),
  hydLeaf: mat(0x3f9a46, { roughness: 0.85 }),
  hydLeafDark: mat(0x2c6e33, { roughness: 0.9 }),
  hydGlass: new THREE.MeshStandardMaterial({ color: 0xbfe6d0, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.24, side: THREE.DoubleSide, emissive: 0x2f6a4a, emissiveIntensity: 0.4 }),
  hydLampUv: mat(0x9a5cff, { emissive: 0x8a3fff, emissiveIntensity: 3.1 }),
  hydLampWarm: mat(0xffe08a, { emissive: 0xffcf5a, emissiveIntensity: 3.0 }),
  slick: mat(0x1f3a2c, { emissive: 0x103024, emissiveIntensity: 0.6, roughness: 0.04, metalness: 0.3, side: B }),

  // 3. Reactor
  rctFloor: mat(0x23282f, { roughness: 0.8, metalness: 0.45, side: B }),
  rctGrate: mat(0x33393f, { roughness: 0.7, metalness: 0.5 }),
  rctGlow: mat(0x39d7ff, { emissive: 0x39d7ff, emissiveIntensity: 2.2 }),
  rctWarn: mat(0xff8a00, { emissive: 0xff7a00, emissiveIntensity: 1.7 }),
  rctPlasma: mat(0xbfe8ff, { emissive: 0x8fdcff, emissiveIntensity: 2.8 }),

  // 4. Waste / docking
  wstFloor: mat(0x4a4636, { roughness: 0.95, side: B }),
  wstStripeA: mat(0xe8c020, { roughness: 0.7 }),
  wstStripeB: mat(0x201e18, { roughness: 0.8 }),
  wstRust: mat(0x7a5236, { roughness: 0.9, metalness: 0.3 }),
  wstSteel: mat(0x7d7a6a, { roughness: 0.7, metalness: 0.4 }),
  wstWarn: mat(0xffb020, { emissive: 0xffa000, emissiveIntensity: 1.7 }),
  beltFwd: mat(0x26262e, { emissive: 0x101014, emissiveIntensity: 0.4, side: B, roughness: 0.6 }),
  beltRev: mat(0x2e2a26, { emissive: 0x180f08, emissiveIntensity: 0.4, side: B, roughness: 0.6 }),
  tractor: new THREE.MeshStandardMaterial({ color: 0x1a4a5a, emissive: 0x39d7ff, emissiveIntensity: 2.0, transparent: true, opacity: 0.55, side: B }),
  vent: mat(0x0a2a3a, { emissive: 0x2f8fd0, emissiveIntensity: 1.4 }),
  rustCube: mat(0x8a5a34, { roughness: 0.9, metalness: 0.3, flat: true }),
};

// ---- Frame helpers --------------------------------------------------------
const _m = new THREE.Matrix4();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
function place(obj, s, w, r = RING_R) {
  const th = s / RING_R;
  const c = Math.cos(th), sn = Math.sin(th);
  _x.set(-sn, c, 0);     // tangent (ahead along +s)
  _y.set(-c, -sn, 0);    // inward (up on the rim)
  _z.set(0, 0, 1);       // axial (+w)
  _m.makeBasis(_x, _y, _z);
  obj.quaternion.setFromRotationMatrix(_m);
  obj.position.set(r * c, r * sn, w);
  return obj;
}

// A curved band of floor / lane: a partial cylinder at radius r, sitting over an
// arc of world angle [a0, a1] and `width` wide in the axial direction.
function band(r, a0, a1, width, cz, material, seg = 56) {
  const geo = new THREE.CylinderGeometry(r, r, width, seg, 1, true, a0 + Math.PI / 2, Math.max(0.002, a1 - a0));
  const m = new THREE.Mesh(geo, material);
  m.rotation.x = Math.PI / 2;
  m.position.z = cz;
  return m;
}

const wrapS = (d) => {
  let m = d % RING_CIRC;
  if (m > RING_CIRC / 2) m -= RING_CIRC;
  else if (m < -RING_CIRC / 2) m += RING_CIRC;
  return m;
};
const clampUnit = (x) => (x < -1 ? -1 : x > 1 ? 1 : x);

// ---- Tiny geometry makers (shared by the builders and the sector) ----------
// Each builder begins with `grp()`, which becomes the "current group"; the
// makers below then attach what they create to it and return it, so a builder
// reads as a flat list of shapes rather than a wall of `g.add(...)`. Calling
// `g.add(shape)` explicitly is still fine (a child is only ever parented once),
// and nested `grp()` calls retarget the current group for their own contents.
let _cur = null;
function grp(name) {
  const g = new THREE.Group();
  if (name) g.name = name;
  _cur = g;
  return g;
}
function attach(m) { if (_cur) _cur.add(m); return m; }
function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return attach(m);
}
function cyl(rt, rb, h, material, x = 0, y = 0, z = 0, seg = 14) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return attach(m);
}
function ball(r, material, x = 0, y = 0, z = 0, seg = 14) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 4)), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return attach(m);
}
function torus(r, tube, material, x = 0, y = 0, z = 0, seg = 10, arc = TWO_PI) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, seg, arc), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return attach(m);
}
function cone(r, h, material, x = 0, y = 0, z = 0, seg = 12, open = false) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg, 1, open), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return attach(m);
}
// A row of hazard bars (a "keep out" band). Local +X is the length.
function stripeRow(g, len, h, material, x, y, z, step = 0.7) {
  for (let i = -len / 2 + 0.35; i < len / 2; i += step) {
    const s = box(step * 0.62, h, 0.12, material, x + i, y, z);
    s.rotation.z = 0.5;
    g.add(s);
  }
}

// ==========================================================================
// EXPORTED PROP BUILDERS
// Every builder returns a fresh Object3D in local space (base at y ~ 0, +Y up).
// ==========================================================================

// ----- Civic & habitation -------------------------------------------------

export function makeCivicLoungeChair() {
  const g = grp('Lounge Chair');
  // Sled frame under the cushions.
  box(1.5, 0.12, 1.2, M.steel, 0, 0.14, 0);
  for (const sx of [-0.62, 0.62]) {
    const rail = box(0.1, 0.1, 1.25, M.civDark, sx, 0.2, 0);
    rail.rotation.x = 0.02;
    box(0.12, 0.14, 0.12, M.steelDark, sx, 0.1, 0.58);
    box(0.12, 0.14, 0.12, M.steelDark, sx, 0.1, -0.58);
  }
  // Seat and back cushions.
  box(1.42, 0.32, 1.18, M.civAccent, 0, 0.48, 0.06);
  box(1.34, 0.14, 1.05, M.civWall, 0, 0.66, 0.02);
  const back = box(1.42, 1.05, 0.3, M.civAccent, 0, 1.18, -0.5);
  back.rotation.x = -0.2;
  const head = box(1.1, 0.36, 0.22, M.civWall, 0, 1.72, -0.66);
  head.rotation.x = -0.2;
  // Armrests with a little trim.
  for (const sx of [-0.78, 0.78]) {
    box(0.14, 0.16, 1.0, M.civWall, sx, 0.86, 0);
    box(0.14, 0.34, 0.14, M.civAccent, sx, 0.62, -0.42);
  }
  // A drink perched on the side table.
  cyl(0.07, 0.06, 0.16, M.civLed, 0.82, 0.98, 0.3, 10);
  return g;
}

export function makeInfoKiosk() {
  const g = grp('Info Kiosk');
  box(1.0, 0.28, 0.8, M.civDark, 0, 0.14, 0);
  box(0.86, 1.7, 0.6, M.civWall, 0, 1.0, 0);
  // Glowing brand band low on the body.
  box(0.88, 0.08, 0.62, M.civAccent, 0, 0.42, 0);
  // Angled screen bezel + glass.
  const bez = box(0.9, 0.7, 0.14, M.civDark, 0, 1.72, 0.22);
  bez.rotation.x = -0.5;
  const scr = box(0.76, 0.56, 0.04, M.civLed, 0, 1.73, 0.29);
  scr.rotation.x = -0.5;
  // Header strip and a couple of interface pips.
  const hdr = box(0.7, 0.08, 0.02, M.civAccent, 0, 1.99, 0.3);
  hdr.rotation.x = -0.5;
  for (const sx of [-0.24, 0, 0.24]) {
    const p = box(0.12, 0.05, 0.02, M.civLed, sx, 1.52, 0.33);
    p.rotation.x = -0.5;
  }
  box(0.92, 0.12, 0.64, M.civAccent, 0, 1.94, 0);
  return g;
}

export function makeVendingPod() {
  const g = grp('Vending Pod');
  box(1.04, 1.92, 0.9, M.civAccent, 0, 0.96, 0);
  // Recessed glass front holding the goods.
  box(0.84, 1.42, 0.06, M.civDark, 0, 1.12, 0.44);
  box(0.8, 1.38, 0.03, M.glass, 0, 1.12, 0.48);
  const shelfCols = [0x7fd0ff, 0xffd36b, 0xff8f8f, 0x9affa0];
  for (let r = 0; r < 3; r++) {
    const y = 0.6 + r * 0.42;
    box(0.78, 0.04, 0.34, M.steelDark, 0, y - 0.04, 0.42);
    for (let i = 0; i < 4; i++) {
      cyl(0.07, 0.07, 0.28, mat(shelfCols[(i + r) % 4], { emissive: shelfCols[(i + r) % 4], emissiveIntensity: 0.5 }),
        -0.27 + i * 0.18, y + 0.12, 0.42, 8);
    }
  }
  // Button pad and coin slot on the flank.
  box(0.16, 1.0, 0.05, M.civDark, 0.38, 1.12, 0.47);
  for (let i = 0; i < 4; i++) box(0.07, 0.07, 0.02, M.civLed, 0.38, 0.7 + i * 0.24, 0.5);
  box(0.13, 0.05, 0.04, M.steel, 0.38, 0.5, 0.49);
  // Lit top sign.
  box(0.94, 0.3, 0.08, M.civDark, 0, 2.0, 0.42);
  box(0.82, 0.2, 0.03, M.civLed, 0, 2.0, 0.46);
  // Little feet.
  for (const sx of [-0.4, 0.4]) for (const sz of [-0.35, 0.35]) box(0.1, 0.08, 0.1, M.steelDark, sx, 0.04, sz);
  return g;
}

export function makeCleanerDrone() {
  const g = grp('Cleaner Drone');
  // body is the root here so the whole thing can spin
  const body = ball(0.42, M.civWall, 0, 0, 0, 16);
  g.add(body);
  g.add(ball(0.14, M.eyeLens, 0, 0.12, -0.34, 10));
  // Sensor ring + side thruster nubs.
  const ring = torus(0.44, 0.05, M.civDark, 0, 0, 0, 20);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  for (const sx of [-0.44, 0.44]) g.add(box(0.12, 0.1, 0.12, M.steel, sx, 0.02, 0));
  // Underside brush and skirt.
  g.add(cyl(0.42, 0.5, 0.1, M.civDark, 0, -0.42, 0, 16));
  const brush = cyl(0.16, 0.16, 0.1, M.steelDark, 0, -0.5, 0, 10);
  g.add(brush);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TWO_PI;
    g.add(box(0.16, 0.04, 0.04, M.civWall, Math.cos(a) * 0.15, -0.5, Math.sin(a) * 0.15));
  }
  // A little antenna with a beacon tip.
  g.add(cyl(0.02, 0.02, 0.3, M.steel, 0.22, 0.5, 0.1, 6));
  g.add(ball(0.05, M.civLed, 0.22, 0.66, 0.1, 8));
  g.userData.body = body;
  return g;
}

export function makeSecurityBarrier() {
  const g = grp('Security Barrier');
  // End posts grip the deck; the glass slab rides between them.
  for (const sz of [-RING_HALF_W + 1.2, RING_HALF_W - 1.2]) {
    box(0.6, 5.0, 0.6, M.steelDark, 0, 2.5, sz);
    box(0.9, 0.3, 0.9, M.civDark, 0, 0.15, sz);
    box(0.12, 4.6, 0.12, M.civAccent, 0, 2.5, sz + 0.36);
  }
  box(0.6, 0.5, RING_W - 2.4, M.civDark, 0, 5.0, 0);
  const slab = box(0.35, 3.6, RING_W - 2.6, M.glass, 0, 5.4, 0);
  // A frame round the glass so it reads as a pane, not a fog.
  for (const sz of [-(RING_W - 2.6) / 2, (RING_W - 2.6) / 2]) {
    const f = box(0.42, 3.7, 0.16, M.steelDark, 0, 5.4, sz);
    g.add(f);
  }
  g.add(slab);
  g.userData.slab = slab;
  return g;
}

export function makeEyeTerminal() {
  const g = grp('Eye Terminal');
  box(0.7, 0.4, 0.5, M.civWall, 0, 1.9, 0);
  box(0.16, 0.8, 0.16, M.steel, 0, 2.4, 0);
  const head = grp();
  head.position.set(0, 2.95, 0);
  g.add(head);
  head.add(ball(0.4, M.civDark, 0, 0, 0, 18));
  // A collar and the glowing lens assembly.
  const collar = torus(0.42, 0.06, M.steelDark, 0, 0, 0, 18);
  collar.rotation.x = Math.PI / 2;
  head.add(collar);
  head.add(ball(0.18, M.eyeLens, 0, 0, -0.3, 12));
  const ring = torus(0.2, 0.05, M.eyeLens, 0, 0, -0.32, 20);
  head.add(ring);
  // Three little status studs on the housing.
  for (const sx of [-0.16, 0, 0.16]) head.add(box(0.05, 0.05, 0.02, M.civLed, sx, 0.36, -0.14));
  g.userData.head = head;
  return g;
}

export function makeBoostPad() {
  const g = grp('Boost Pad');
  const base = box(3.4, 0.12, 3.4, M.boost, 0, 0.06, 0);
  base.material = M.boost.clone();
  g.add(base);
  // Chevrons pointing "forward" (local +X).
  for (let i = 0; i < 3; i++) {
    const c = box(1.4, 0.06, 0.5, M.civLed, -0.9 + i * 0.9, 0.14, 0);
    c.rotation.z = -0.5;
    g.add(c);
    const c2 = box(1.4, 0.06, 0.5, M.civLed, -0.9 + i * 0.9, 0.14, 0);
    c2.rotation.z = 0.5;
    g.add(c2);
  }
  for (const sx of [-1.5, 1.5]) for (const sz of [-1.5, 1.5]) g.add(box(0.16, 0.16, 0.16, M.steelDark, sx, 0.08, sz));
  g.userData.base = base;
  return g;
}

// ----- Hydroponics --------------------------------------------------------

export function makeSoilBed() {
  const g = grp('Soil Bed');
  box(4.6, 0.9, 3.6, M.hydSoil, 0, 0.45, 0);
  box(4.4, 0.5, 3.4, M.hydLeafDark, 0, 1.05, 0);
  // A plank edge and a couple of irrigation pipes.
  box(4.7, 0.14, 0.2, M.wstRust, 0, 0.9, 1.75);
  box(4.7, 0.14, 0.2, M.wstRust, 0, 0.9, -1.75);
  for (const sz of [-1.4, 1.4]) cyl(0.08, 0.08, 4.5, M.steel, 0, 1.15, sz, 8).rotation.z = Math.PI / 2;
  // Leaf canopy: three shoots, each a couple of leaves.
  for (let i = 0; i < 3; i++) {
    const lx = -1.4 + i * 1.4;
    cyl(0.05, 0.05, 0.7, M.hydLeafDark, lx, 1.5, 0, 6);
    for (const off of [-0.3, 0.3]) {
      const leaf = ball(0.5, M.hydLeaf, lx + off, 1.55, (i % 2) * 0.5 - 0.25, 8);
      leaf.scale.set(1.3, 0.5, 1);
    }
    const top = ball(0.4, M.hydLeaf, lx, 1.95, 0, 8);
    top.scale.set(1, 1.5, 1);
  }
  // A couple of ripening pods.
  g.add(ball(0.16, M.civAccent, -1.0, 1.7, 0.2, 8));
  g.add(ball(0.16, M.civAccent, 1.1, 1.6, -0.2, 8));
  return g;
}

export function makeBioDome() {
  const g = grp('Bio-Dome');
  // A glass growing dome you can read at a glance: a plinth and a bed of soil,
  // an elongated glass shell over the crops, steel arches ribbing it, grow lamps
  // and a sprinkler line inside, an entrance airlock and a vent up top.
  const RX = 3.4, RY = 3.0, RZ = 5.0, BASE = 0.5;
  // Plinth + soil bed.
  box(7.8, 0.5, 11.0, M.steelDark, 0, 0.25, 0);
  box(6.8, 0.3, 9.8, M.hydSoil, 0, 0.62, 0);
  for (const sz of [-5.4, 5.4]) g.add(box(7.0, 0.16, 0.3, M.steel, 0, 0.5, sz));
  // Glass shell: a top hemisphere, scaled into a long vault.
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(1, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2), M.hydGlass);
  shell.scale.set(RX, RY, RZ);
  shell.position.y = BASE;
  shell.castShadow = false;
  g.add(shell);
  // Steel arches ribbing the shell at intervals along its length.
  for (const zc of [-3.6, -1.8, 0, 1.8, 3.6]) {
    const f = Math.sqrt(Math.max(0.2, 1 - (zc / RZ) ** 2));
    const rib = torus(RX * f, 0.09, M.steel, 0, BASE, zc, 22, Math.PI);
    rib.scale.y = RY / RX;
    g.add(rib);
  }
  // Runs of seedling clumps in the beds.
  for (let i = 0; i < 5; i++) {
    const z = -3.6 + i * 1.8;
    for (const sx of [-1.4, 1.4]) {
      cyl(0.05, 0.05, 0.5, M.hydLeafDark, sx, 0.95, z, 6);
      const leaf = ball(0.5, M.hydLeaf, sx, 1.22, z, 8);
      leaf.scale.set(1.3, 0.6, 1.3);
      const top = ball(0.34, M.hydLeaf, sx, 1.55, z, 8);
      top.scale.set(1, 1.3, 1);
    }
  }
  g.add(ball(0.16, M.civAccent, 1.4, 1.25, -3.6, 8));
  g.add(ball(0.16, M.civAccent, -1.4, 1.25, 0, 8));
  // Grow-lamp tubes under the ridge, and a sprinkler line with nozzles.
  for (const dx of [-1.1, 1.1]) {
    const tube = cyl(0.08, 0.08, 8.0, M.hydLampWarm, dx, BASE + RY * 0.72, 0, 10);
    tube.rotation.x = Math.PI / 2;
    g.add(tube);
  }
  const spk = cyl(0.06, 0.06, 8.4, M.steel, 0, BASE + RY * 0.9, 0, 8);
  spk.rotation.x = Math.PI / 2;
  g.add(spk);
  for (let i = -3; i <= 3; i += 1.5) g.add(ball(0.09, M.hydLampUv, 0, BASE + RY * 0.9 - 0.12, i, 8));
  // Entrance airlock at one end, with a door, step and a lit sign.
  box(2.8, 2.6, 2.2, M.steelDark, 0, 1.3, RZ + 0.8);
  box(1.2, 1.8, 0.14, M.steel, 0, 0.9, RZ + 1.92);
  box(0.7, 0.3, 0.7, M.steel, 0, 0.15, RZ + 2.2);
  g.add(ball(0.14, M.civLed, 0, 2.42, RZ + 1.92, 8));
  // Roof vent / fan.
  g.add(cyl(0.55, 0.6, 0.3, M.steelDark, 0, BASE + RY + 0.1, 0, 14));
  for (let i = 0; i < 3; i++) {
    const blade = box(0.08, 0.06, 1.0, M.steel, 0, BASE + RY + 0.28, 0);
    blade.rotation.y = (i / 3) * Math.PI;
  }
  return g;
}

export function makeHangingVine(h = 6) {
  const g = grp('Hanging Vine');
  // A long stalk from the ceiling anchor with a heavy knobbly leaf-club at the
  // tip - the club is the part that swings out into the car. The swinging node
  // is exposed as userData.club so the level can drive it per-vine.
  g.add(cyl(0.06, 0.11, h, M.hydLeafDark, 0, -h / 2, 0, 6));
  for (let i = 0; i < 4; i++) {
    const a = i * 1.5;
    const leaf = ball(0.32, M.hydLeaf, Math.cos(a) * 0.28, -h * 0.22 - i * (h / 5), Math.sin(a) * 0.28, 6);
    leaf.scale.set(1.2, 0.5, 0.7);
    g.add(leaf);
  }
  // The club: a dense knobbly mass of leaves at the end of the stalk.
  const club = grp();
  g.add(club);
  club.position.set(0, -h, 0);
  ball(0.5, M.hydLeafDark, 0, 0, 0, 10);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TWO_PI;
    const knob = ball(0.3, M.hydLeaf, Math.cos(a) * 0.42, Math.sin(a * 2) * 0.2, Math.sin(a) * 0.42, 8);
    knob.scale.set(1, 0.85, 1);
  }
  ball(0.13, M.civAccent, 0, 0.34, 0, 8);
  g.userData.club = club;
  return g;
}

export function makeSprinklerVent() {
  const g = grp('Sprinkler Vent');
  g.add(cyl(0.7, 0.9, 0.4, M.steelDark, 0, 0.2, 0, 14));
  g.add(cyl(0.5, 0.5, 0.16, M.steel, 0, 0.46, 0, 14));
  const mist = ball(1.6, M.hydGlass.clone(), 0, 1.6, 0, 10);
  mist.scale.set(1, 0.6, 1);
  g.add(mist);
  g.userData.mist = mist;
  return g;
}

export function makePollinationPod() {
  const g = grp('Pollination Pod');
  const pod = ball(1.1, M.hydLeaf, 0, 0, 0, 16);
  g.add(pod);
  const ring = torus(1.12, 0.08, M.hydLeafDark, 0, 0, 0, 20);
  g.add(ring);
  g.add(ball(0.9, M.hydLampUv, 0, 0, 0, 10));
  // Little fins around the pod.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TWO_PI;
    const fin = box(0.5, 0.5, 0.08, M.hydLeafDark, Math.cos(a) * 1.05, 0, Math.sin(a) * 1.05);
    fin.rotation.y = -a;
    g.add(fin);
  }
  return g;
}

export function makeSunLampArm() {
  const g = grp('Sun-Lamp Arm');
  // A fixed mount post with a bolted base plate; the whole boom pivots on `arm`
  // (userData.arm) so the level can swing the lamp over the beds.
  g.add(cyl(0.5, 0.6, 1.6, M.steelDark, 0, 0.8, 0, 14));           // mount post
  g.add(cyl(0.85, 0.95, 0.24, M.steel, 0, 0.12, 0, 16));           // base plate
  for (let i = 0; i < 6; i++) {                                    // base bolts
    const a = (i / 6) * TWO_PI;
    g.add(cyl(0.11, 0.11, 0.22, M.steelDark, Math.cos(a) * 0.72, 0.28, Math.sin(a) * 0.72, 6));
  }
  g.add(torus(0.55, 0.09, M.civAccent, 0, 1.5, 0, 18).rotateX(Math.PI / 2));  // slew collar

  const arm = grp();
  arm.position.y = 1.6;
  g.add(arm);
  arm.add(box(0.6, 0.6, 0.6, M.steelDark, 0, 0, 0));               // shoulder block
  const boomLen = 7;
  arm.add(box(boomLen, 0.3, 0.4, M.steelDark, boomLen / 2, 0, 0)); // boom
  // Truss rungs + a diagonal brace along the boom.
  for (let i = 1; i < 6; i++) arm.add(box(0.06, 0.34, 0.06, M.steel, i * 1.1, 0.3, 0));
  for (let i = 0; i < 5; i++) {
    const brace = box(1.35, 0.06, 0.06, M.steel, i * 1.1 + 0.9, 0.16, 0.13);
    brace.rotation.z = (i % 2 ? 1 : -1) * 0.5;
    arm.add(brace);
  }
  // Warning stripe band near the base and a cable festoon loop under the boom.
  arm.add(box(0.5, 0.34, 0.44, M.rctWarn, 0.6, 0, 0));
  for (let i = 1; i <= 4; i++) arm.add(cyl(0.05, 0.05, 0.24, M.steelDark, i * 1.4, -0.22, -0.16, 6).rotateZ(Math.PI / 2));
  // A hydraulic actuator ram tucked under the boom.
  arm.add(cyl(0.11, 0.11, 2.2, M.steel, 2.2, -0.28, 0.16, 8).rotateZ(1.35));
  arm.add(cyl(0.16, 0.16, 0.5, M.steelDark, 3.2, -0.42, 0.16, 8).rotateZ(1.35));
  // Head: a ribbed shade hood carrying the UV lamp and the warm beam.
  const hood = cyl(1.35, 1.55, 0.45, M.steelDark, boomLen, -0.4, 0, 16);
  arm.add(hood);
  for (let i = 0; i < 8; i++) {                                   // shade ribs
    const a = (i / 8) * TWO_PI;
    arm.add(box(0.5, 0.1, 0.1, M.steel, boomLen + Math.cos(a) * 1.0, -0.2, Math.sin(a) * 1.0).rotateY(-a));
  }
  arm.add(torus(1.45, 0.07, M.steel, boomLen, -0.62, 0, 20).rotateX(Math.PI / 2));  // hood lip
  arm.add(cyl(1.1, 1.3, 0.5, M.hydLampUv, boomLen, -0.6, 0, 14));                   // UV ring
  arm.add(ball(0.5, M.hydLampWarm, boomLen, -0.72, 0, 10));                          // filament
  // Small aiming sensor perched on the hood.
  arm.add(cyl(0.08, 0.08, 0.4, M.steel, boomLen - 0.9, -0.05, 0, 6));
  arm.add(box(0.28, 0.2, 0.3, M.steelDark, boomLen - 0.9, 0.2, 0));
  arm.add(ball(0.08, M.hydLampUv, boomLen - 0.9, 0.2, 0.16, 8));
  const lampCone = cone(2.6, 4.0, M.hydLampWarm, boomLen, -2.6, 0, 16, true);
  lampCone.rotation.x = Math.PI;
  arm.add(lampCone);
  g.userData.arm = arm;
  g.userData.boomLen = boomLen;
  return g;
}

export function makeSlickPatch() {
  const g = grp('Slick Patch');
  const m = cyl(2.2, 2.4, 0.08, M.slick, 0, 0.04, 0, 22);
  g.add(m);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TWO_PI;
    const blob = cyl(0.7, 0.9, 0.06, M.slick, Math.cos(a) * 1.6, 0.05, Math.sin(a) * 1.6, 10);
    g.add(blob);
  }
  return g;
}

// ----- Reactor ------------------------------------------------------------

export function makeGratedBay() {
  const g = grp('Grated Bay');
  // A raised pit kerb carrying a cross-hatched grating stillage.
  box(4.4, 0.5, 2.4, M.steelDark, 0, 0.25, 0);
  box(4.2, 0.2, 2.2, M.rctGrate, 0, 0.52, 0);
  for (let i = -1.8; i <= 1.8; i += 0.5) g.add(box(0.14, 0.12, 2.1, M.steelDark, i, 0.66, 0));
  for (let i = -0.9; i <= 0.9; i += 0.45) g.add(box(3.9, 0.1, 0.1, M.steel, 0, 0.68, i));
  // A hinged access hatch, propped open on the near side.
  box(1.4, 0.1, 1.4, M.rctGrate, -1.0, 1.05, 0.7).rotation.set(-0.9, 0, 0.1);
  // Bolt pads on the kerb corners.
  for (const sx of [-2.0, 2.0]) for (const sz of [-1.0, 1.0]) g.add(box(0.3, 0.18, 0.3, M.steel, sx, 0.6, sz));
  // Exposed conduit with collars, valves and pressure gauges.
  const pipe = cyl(0.28, 0.28, 4.2, M.rctGlow, 0, 1.9, 0.7, 10);
  pipe.rotation.z = Math.PI / 2;
  g.add(pipe);
  for (const sx of [-1.7, -0.4, 0.9, 1.7]) g.add(cyl(0.34, 0.34, 0.2, M.steelDark, sx, 1.9, 0.7, 12).rotateZ(Math.PI / 2));
  for (const sx of [-1.95, 1.95]) {
    g.add(cyl(0.16, 0.16, 0.5, M.steelDark, sx, 2.2, 0.7, 10));
    g.add(torus(0.24, 0.06, M.civAccent, sx, 2.5, 0.7, 16).rotateX(Math.PI / 2));
  }
  // Warning brow with hazard chevrons, flanked by upright truss posts.
  box(4.4, 0.24, 0.34, M.rctWarn, 0, 3.7, 0);
  stripeRow(g, 3.6, 0.14, M.steelDark, 0, 3.7, 0.24);
  for (const sx of [-1.8, 1.8]) {
    g.add(box(0.14, 3.6, 0.14, M.steel, sx, 1.8, 0));
    for (let i = 0; i < 6; i++) g.add(box(0.46, 0.08, 0.08, M.steel, sx + (sx < 0 ? 0.3 : -0.3), 0.7 + i * 0.5, 0));
  }
  return g;
}

export function makePlasmaConduit() {
  const g = grp('Plasma Conduit');
  // A glowing tube bridging the corridor along the axial (+Z) direction.
  const tube = cyl(0.26, 0.26, RING_W - 2, M.rctGlow, 0, 0, 0, 12);
  tube.rotation.x = Math.PI / 2;
  g.add(tube);
  for (const sz of [-(RING_W - 2) / 2 + 0.6, (RING_W - 2) / 2 - 0.6]) {
    g.add(cyl(0.4, 0.4, 0.5, M.steelDark, 0, 0, sz, 12).rotateX(Math.PI / 2));
  }
  const spark = ball(0.5, M.rctPlasma.clone(), 0, -1.4, 0, 10);
  g.add(spark);
  // Danger collars around the bridge.
  g.add(box(0.5, 0.5, RING_W - 2.4, M.rctWarn, 0, -0.4, 0));
  g.userData.spark = spark;
  return g;
}

// A wall-mounted coolant vent. The housing is bolted flat against the wall
// (behind the model, at -Z) and the steam fires ACROSS the corridor along +Z, so
// the model's local +Z is its "out" direction; the sector rotates it about Y to
// aim that out into the lane. The plume is a translucent cone (plus a few puffs)
// in a `jet` group the sector scales to fire it.
export function makeSteamGeyser() {
  const g = grp('Steam Geyser');
  // Heavy mounting plate bolted to the wall.
  box(2.2, 2.6, 0.4, M.steelDark, 0, 1.5, -1.0);
  for (const sx of [-0.85, 0.85]) for (const sy of [0.55, 2.45]) g.add(box(0.26, 0.26, 0.26, M.steel, sx, sy, -0.82));
  // Main housing drum, axis along Z.
  const drum = cyl(0.8, 0.9, 1.3, M.steel, 0, 1.5, -0.35, 18);
  drum.rotation.x = Math.PI / 2;
  g.add(drum);
  // Reinforcing ribs around the drum.
  for (const zz of [-0.75, -0.35, 0.05]) {
    const rib = torus(0.86, 0.07, M.steelDark, 0, 1.5, zz, 20);
    rib.rotation.x = Math.PI / 2;
    g.add(rib);
  }
  // Flared nozzle mouth pointing +Z (across the corridor).
  const noz = cyl(1.0, 0.65, 0.55, M.steel, 0, 1.5, 0.4, 18);
  noz.rotation.x = Math.PI / 2;
  g.add(noz);
  const lip = torus(1.0, 0.1, M.steelDark, 0, 1.5, 0.66, 20);
  lip.rotation.x = Math.PI / 2;
  g.add(lip);
  // Valve wheel on top and supply pipes down the back.
  g.add(cyl(0.07, 0.07, 0.55, M.steel, 0, 2.05, -0.5, 8));
  const wheel = torus(0.42, 0.08, M.civAccent, 0, 2.35, -0.5, 20);
  wheel.rotation.x = Math.PI / 2;
  g.add(wheel);
  for (const sx of [-0.6, 0.6]) g.add(cyl(0.16, 0.16, 2.2, M.steelDark, sx, 1.0, -1.05, 10).rotateX(Math.PI / 2));
  // Warning band on the housing.
  box(1.7, 0.18, 0.1, M.rctWarn, 0, 2.55, -0.2);
  // ---- Steam plume, firing along +Z ----
  const jet = new THREE.Group();
  jet.position.set(0, 1.5, 0.7);
  g.add(jet);
  const plume = cone(1.0, 3.4, M.hydGlass.clone(), 0, 0, 1.7, 18, true);
  plume.rotation.x = Math.PI / 2;
  plume.material.opacity = 0.5;
  jet.add(plume);
  const parts = [plume];
  for (let i = 0; i < 3; i++) {
    const puff = ball(0.55 - i * 0.08, M.hydGlass.clone(), 0, 0, 1.2 + i * 0.9, 10);
    puff.material.opacity = 0.4 - i * 0.08;
    jet.add(puff);
    parts.push(puff);
  }
  g.userData.jet = jet;
  g.userData.parts = parts;
  return g;
}

// A telescopic lift: a fixed base and shroud with two hydraulic pistons that
// rise to carry the deck. The sector drives `plate.position.y` and
// `riser.scale.y` together (risers originate at their base so they grow upward).
export function makeLiftPlatform() {
  const g = grp('Lift Platform');
  // Fixed base pad. The hazard flange is WIDER than the pad and sits low inside
  // its height, and the corner feet stand proud above and below it, so no face
  // of either is coplanar with the pad (which is what caused the z-fighting).
  box(5.2, 0.5, 4.8, M.rctGrate, 0, 0.25, 0);
  box(5.5, 0.16, 5.1, M.rctWarn, 0, 0.30, 0);
  for (const sx of [-2.55, 2.55]) for (const sz of [-2.35, 2.35]) g.add(box(0.18, 0.1, 0.18, M.steel, sx, 0.40, sz));
  for (const sx of [-2.4, 2.4]) for (const sz of [-2.2, 2.2]) g.add(box(0.34, 0.78, 0.34, M.steelDark, sx, 0.24, sz));
  // Central fixed shroud barrel with reinforcing rings and surface trim.
  const shroud = cyl(1.2, 1.35, 1.45, M.steelDark, 0, 0.975, 0, 22);
  g.add(shroud);
  for (let i = 0; i < 3; i++) {
    const ring = torus(1.245, 0.08, M.steel, 0, 0.62 + i * 0.48, 0, 24);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
  }
  box(1.4, 0.2, 0.1, M.rctWarn, 0, 1.42, 1.3);
  box(0.9, 0.9, 0.12, M.steel, 0, 0.9, 1.3);
  // Two telescoping pistons, anchored at the base and extending up with the deck.
  const risers = [];
  for (const sx of [-1.3, 1.3]) {
    const geo = new THREE.CylinderGeometry(0.32, 0.4, 1, 14);
    geo.translate(0, 0.5, 0);
    const riser = new THREE.Mesh(geo, M.steel);
    riser.position.set(sx, 0.52, 0);   // 0.02 proud of the deck underside
    riser.scale.y = 1.3;
    riser.castShadow = true;
    g.add(riser);
    risers.push(riser);
  }
  // The rising deck: a group so the sector moves the plate, treads and lamps
  // together (its origin is the plate's centre).
  const deck = new THREE.Group();
  deck.position.y = 2.0;
  g.add(deck);
  const plate = box(4.8, 0.4, 4.4, M.rctGrate, 0, 0, 0);
  deck.add(plate);
  for (let i = -1.6; i <= 1.6; i += 0.8) deck.add(box(0.12, 0.44, 4.0, M.steelDark, i, 0, 0));
  for (const sz of [-2.1, 2.1]) deck.add(box(4.6, 0.2, 0.3, M.rctWarn, 0, 0.22, sz));
  for (const sx of [-2.2, 2.2]) deck.add(box(0.3, 0.2, 4.2, M.rctWarn, sx, 0.22, 0));
  for (const sx of [-2.1, 2.1]) for (const sz of [-1.9, 1.9]) deck.add(ball(0.16, M.rctGlow, sx, 0.24, sz, 8));
  // Control pedestal beside the lift.
  g.add(box(0.7, 1.3, 0.7, M.steelDark, 2.95, 0.65, 1.95));
  g.add(box(0.6, 0.4, 0.1, M.rctGlow, 2.95, 1.2, 2.3));
  box(0.5, 0.12, 0.4, M.rctWarn, 2.95, 1.45, 1.95);
  g.userData = { plate: deck, risers };
  return g;
}

export function makeTowCrane() {
  const g = grp('Tow Crane');
  // A gantry: a bolted base with a four-post lattice mast offset to one side, a
  // head beam cantilevered back over the lane, and the hoist line dropping clean
  // at x = 0 (clear of the base) to the magnet head. Every hazard band stands
  // proud of the base so no face is coplanar with it (the old z-fighting).
  const mx = 1.4;
  box(2.2, 0.8, 2.4, M.steelDark, mx, 0, 0);
  for (const sz of [-1.05, 1.05]) g.add(box(2.3, 0.84, 0.4, M.rctWarn, mx, 0, sz));
  for (const sx of [-1.05, 1.05]) g.add(box(0.4, 0.84, 2.5, M.rctWarn, mx + sx, 0, 0));
  for (const sx of [-0.45, 0.45]) for (const sz of [-0.55, 0.55]) g.add(box(0.18, 4.4, 0.18, M.steel, mx + sx, 2.2, sz));
  for (let i = 1; i <= 4; i++) {
    const y = i * 0.9;
    g.add(box(1.06, 0.1, 0.1, M.steel, mx, y, 0.55));
    g.add(box(1.06, 0.1, 0.1, M.steel, mx, y, -0.55));
    g.add(box(0.1, 0.1, 1.16, M.steel, mx + 0.45, y, 0));
    g.add(box(0.1, 0.1, 1.16, M.steel, mx - 0.45, y, 0));
  }
  // Head beam out over the lane, ribbed cap and a warning lamp.
  box(2.8, 0.4, 0.7, M.steelDark, mx / 2, 4.4, 0);
  box(1.2, 0.22, 0.8, M.steelDark, mx, 4.7, 0);
  g.add(ball(0.16, M.rctWarn.clone(), 0, 4.6, 0.5, 8));
  // Trolley carrying the hoist at x = 0, the cable, spreader and magnet head.
  g.add(box(0.8, 0.4, 0.8, M.steel, 0, 4.05, 0));
  g.add(cyl(0.06, 0.06, 5.6, M.steel, 0, 1.1, 0, 6));
  box(1.5, 0.16, 0.5, M.steel, 0, -1.72, 0);
  const magnet = cyl(0.9, 0.7, 0.6, M.rctGlow, 0, -2.2, 0, 16);
  g.add(magnet);
  const rim = torus(1.0, 0.07, M.steel, 0, -1.88, 0, 20);
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  g.userData.magnet = magnet;
  return g;
}

export function makeOverridePlate() {
  const g = grp('Override Plate');
  box(3.4, 0.3, 3.0, M.rctWarn, 0, 0.15, 0);
  const panel = box(2.6, 0.16, 2.2, M.rctGlow, 0, 0.32, 0);
  g.add(panel);
  for (const sx of [-1.2, 1.2]) for (const sz of [-1.0, 1.0]) g.add(box(0.3, 0.3, 0.3, M.steelDark, sx, 0.28, sz));
  // A little console post beside it.
  g.add(box(0.3, 1.0, 0.3, M.steelDark, 1.7, 0.5, 0));
  g.add(box(0.5, 0.3, 0.1, M.rctGlow, 1.7, 1.05, 0.1));
  g.userData.panel = panel;
  return g;
}

// ----- Waste & docking ----------------------------------------------------

export function makeConveyorBelt(len = 4.6) {
  const g = grp('Conveyor Belt');
  // Belt surface with chevron treads.
  const surface = box(len, 0.16, 3.0, M.beltFwd.clone(), 0, 0.25, 0);
  g.add(surface);
  for (let i = -len / 2 + 0.4; i < len / 2; i += 0.55) {
    const t = box(0.12, 0.06, 2.8, M.steelDark, i, 0.35, 0);
    t.rotation.z = 0.5;
    g.add(t);
  }
  // Side frames and rollers. The frames straddle the belt's side edges (their
  // inner faces buried inside the surface, outer faces proud) and the rollers
  // stop short of the belt ends, so no face lines up with the surface end - that
  // flush contact was the conveyor's z-fighting.
  for (const sz of [-1.55, 1.55]) box(len, 0.44, 0.3, M.wstSteel, 0, 0.22, sz);
  for (let i = -len / 2 + 0.5; i < len / 2; i += 1.0) {
    const roll = cyl(0.14, 0.14, 2.8, M.steel, i, 0.16, 0, 10);
    roll.rotation.x = Math.PI / 2;
    g.add(roll);
  }
  // Legs.
  for (const sx of [-len / 2 + 0.5, len / 2 - 0.5]) for (const sz of [-1.5, 1.5]) g.add(box(0.16, 0.3, 0.16, M.wstSteel, sx, 0.0, sz));
  g.userData.surface = surface;
  return g;
}

// A floor-level conveyor: the belt climbs up out of a recessed hole in the deck,
// so bins read as surfacing from an under-floor loop (or, flipped, sliding back
// down into one) instead of being parked on the floor. `flip` tips the belt the
// other way so the two ends of a loop face each other.
export function makeGroundConveyor(flip = false) {
  const g = grp('Ground Conveyor');
  const holeX = -1.9;
  // The hole: a recessed collar sunk into the deck with a hazard lip.
  g.add(cyl(2.5, 2.6, 0.6, M.steelDark, holeX, -0.3, 0, 20));
  const collar = torus(2.5, 0.16, M.wstWarn, holeX, 0.06, 0, 26);
  collar.rotation.x = Math.PI / 2;
  g.add(collar);
  // The belt, tipped so its low end sinks into the hole and its high end meets
  // the deck, standing on a short trestle.
  const belt = makeConveyorBelt(4.6);
  belt.rotation.z = (flip ? 1 : -1) * 0.3;
  belt.position.set(1.4, 0.6, 0);
  g.add(belt);
  for (const sz of [-1.3, 1.3]) g.add(box(0.2, 1.1, 0.2, M.wstSteel, 2.6, 0.55, sz));
  g.userData.belt = belt;
  g.userData.flip = flip;
  return g;
}

export function makeCargoContainer() {
  const g = grp('Cargo Container');
  box(3.2, 2.4, 2.6, M.wstSteel, 0, 1.2, 0);
  // Corrugated ribs down both long faces.
  for (let i = -1.3; i <= 1.3; i += 0.36) {
    for (const sz of [-1.32, 1.32]) box(0.18, 2.1, 0.1, M.rustCube, i, 1.2, sz);
  }
  // Corner posts and roof cap.
  for (const sx of [-1.5, 1.5]) for (const sz of [-1.2, 1.2]) box(0.24, 2.5, 0.24, M.wstRust, sx, 1.25, sz);
  box(3.3, 0.2, 2.7, M.wstRust, 0, 2.5, 0);
  // End door with handles and a placard.
  box(0.08, 2.2, 2.4, M.rustCube, -1.62, 1.2, 0);
  for (const sz of [-0.7, 0.7]) {
    const h = box(0.08, 1.4, 0.1, M.wstSteel, -1.7, 1.2, sz);
    g.add(h);
  }
  box(0.05, 0.5, 1.0, M.wstStripeA, -1.7, 1.9, 0);
  // Feet so stacked containers lock.
  for (const sx of [-1.4, 1.4]) for (const sz of [-1.1, 1.1]) box(0.3, 0.12, 0.3, M.wstRust, sx, 0.06, sz);
  return g;
}

export function makeTrashCube() {
  const g = grp('Trash Cube');
  // A proper open-top waste container, not a bale: four clean, panelled walls
  // with corner posts and a rolled rim, and the trash is piled ONLY above the
  // brim so every side reads as a tidy bin. userData.lamp is kept.
  const HALF = 1.5;       // footprint half-width
  const T = 0.16;         // wall thickness
  const H = 2.0;          // wall height
  const inner = HALF - T; // inside half-width

  // Base plate with a recessed foot.
  g.add(box(HALF * 2, 0.18, HALF * 2, M.wstSteel, 0, 0.09, 0));
  g.add(box(HALF * 1.8, 0.14, HALF * 1.8, M.wstRust, 0, 0.22, 0));
  // The four walls (front/back along Z, left/right along X).
  const wallY = 0.18 + H / 2;
  g.add(box(HALF * 2, H, T, M.wstRust, 0, wallY, inner));
  g.add(box(HALF * 2, H, T, M.wstRust, 0, wallY, -inner));
  g.add(box(T, H, HALF * 2, M.wstRust, inner, wallY, 0));
  g.add(box(T, H, HALF * 2, M.wstRust, -inner, wallY, 0));
  // Corner posts, proud of the walls.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(box(0.24, H + 0.12, 0.24, M.wstSteel, sx * HALF, wallY, sz * HALF));
  }
  // A rolled rim cap on each wall top.
  const rimY = 0.18 + H + 0.02;
  g.add(box(HALF * 2 + 0.2, 0.16, 0.3, M.wstSteel, 0, rimY, inner));
  g.add(box(HALF * 2 + 0.2, 0.16, 0.3, M.wstSteel, 0, rimY, -inner));
  g.add(box(0.3, 0.16, HALF * 2 + 0.2, M.wstSteel, inner, rimY, 0));
  g.add(box(0.3, 0.16, HALF * 2 + 0.2, M.wstSteel, -inner, rimY, 0));
  // Panel ribs across each wall face.
  for (const [ax, sign] of [['x', 1], ['x', -1], ['z', 1], ['z', -1]]) {
    for (const o of [-0.7, 0, 0.7]) {
      const rib = ax === 'z'
        ? box(HALF * 2, 0.08, 0.06, M.wstSteel, o, wallY, sign * (inner + T / 2))
        : box(0.06, 0.08, HALF * 2, M.wstSteel, sign * (inner + T / 2), wallY, o);
      g.add(rib);
    }
  }
  // Hazard placard and a couple of bolts on the outside.
  g.add(box(0.7, 0.7, 0.08, M.wstStripeA, -0.5, 0.9, HALF + 0.02));
  g.add(box(0.7, 0.08, 0.08, M.wstStripeB, -0.5, 0.9, HALF + 0.05));
  for (const sx of [-0.9, 0.9]) g.add(box(0.12, 0.12, 0.12, M.wstSteel, sx, 1.55, HALF + 0.02));

  // The trash: a jumble of chunks sitting ABOVE the brim, all kept within the
  // inner footprint so nothing pokes through a side wall. Everything edible is
  // grouped as `pile`, so the waste sector can hide it and reuse the very same
  // mesh as the EMPTY bin that is carried back to the floor loop.
  const pile = grp('Trash Pile');
  const chunks = [
    [1.7, 1.1, 1.5, M.rustCube, 0.00, 2.55, 0.00, 0.00, 0.20, 0.05],
    [1.2, 0.9, 1.1, M.wstSteel, 0.35, 2.45, -0.35, 0.12, -0.25, 0.12],
    [1.3, 0.8, 1.2, M.wstRust, -0.40, 2.42, 0.30, -0.14, 0.18, -0.10],
    [1.5, 0.7, 1.0, M.wstSteel, 0.10, 3.05, 0.10, 0.20, 0.30, 0.08],
    [0.9, 1.0, 0.9, M.rustCube, -0.30, 2.95, -0.30, -0.18, 0.12, 0.22],
    [1.0, 0.7, 1.1, M.wstRust, 0.35, 2.90, 0.30, 0.16, -0.14, -0.16],
  ];
  for (const [w, h, d, m, x, y, z, rx, ry, rz] of chunks) {
    box(w, h, d, m, x, y, z).rotation.set(rx, ry, rz);
  }
  // A crushed drum and a folded sheet crowning the pile.
  const drum = cyl(0.42, 0.42, 1.3, M.wstSteel, -0.45, 3.35, 0.45, 12);
  drum.rotation.z = Math.PI / 2 - 0.3;
  const sheet = box(1.1, 0.1, 0.9, M.wstRust, 0.5, 3.4, -0.4);
  sheet.rotation.set(0.95, 0.4, 0.2);
  // Bent rebar poking up out of the pile.
  const rod = cyl(0.06, 0.06, 1.8, M.steel, 0.25, 3.5, 0.1, 6);
  rod.rotation.set(0.5, 0, 0.7);
  const rod2 = cyl(0.05, 0.05, 1.5, M.steel, -0.4, 3.4, -0.2, 6);
  rod2.rotation.set(0.6, 0.3, -0.4);
  g.add(pile);
  // A small blinking beacon on a corner post (outside the pile).
  const lamp = ball(0.14, M.wstWarn.clone(), HALF, 0.18 + H + 0.2, -HALF, 8);
  g.add(lamp);
  g.userData = { lamp, pile };
  return g;
}

export function makeCompactor() {
  const g = grp('Compactor');
  g.add(box(6.0, 1.0, 1.6, M.wstSteel, 0, 0, 0));
  // Piston cylinder with rings.
  g.add(cyl(0.5, 0.5, 5, M.wstRust, 0, 2.6, 0, 12));
  for (const y of [1.2, 2.6, 4.0]) g.add(cyl(0.62, 0.62, 0.2, M.wstSteel, 0, y, 0, 12));
  const head = box(5.6, 2.0, 3.4, M.wstStripeA, 0, 4.2, 0);
  g.add(head);
  // Teeth under the head.
  for (let i = -2.2; i <= 2.2; i += 0.9) {
    const tooth = cone(0.22, 0.5, M.wstSteel, i, 3.2, 0, 8);
    tooth.rotation.x = Math.PI;
    g.add(tooth);
  }
  g.add(box(5.6, 0.4, 3.4, M.wstStripeB, 0, 5.4, 0));
  // Guide rails.
  for (const sx of [-2.9, 2.9]) g.add(box(0.3, 5.4, 0.3, M.wstSteel, sx, 2.7, 0));
  g.userData.head = head;
  return g;
}

// A tracked industrial loader bot: the little waste-handler that ferries trash
// cubes to the decon airlock and tips them into the throat to be fired out with
// the trash. Geometry only; the waste sector grabs `arm` / `scoop` / `eye` /
// `beacon` from userData and drives the pick-and-shove cycle.
export function makeLoaderBot() {
  const g = grp('Loader Bot');
  // Tracked chassis: a low hull between two treads with road wheels.
  g.add(box(3.4, 1.0, 4.4, M.wstSteel, 0, 0.75, 0));
  g.add(box(3.0, 0.4, 4.0, M.wstRust, 0, 1.32, 0));
  for (const sx of [-1, 1]) {
    g.add(box(0.8, 1.3, 4.8, M.dark, sx * 1.75, 0.75, 0));
    for (let i = -1; i <= 1; i++) g.add(box(0.86, 0.5, 0.5, M.wstSteel, sx * 1.75, 0.75, i * 1.4));
  }
  // Body block with side panels and hazard flashes front and back.
  g.add(box(2.8, 1.9, 3.2, M.wstRust, 0, 2.35, -0.1));
  g.add(box(2.5, 0.5, 0.14, M.wstStripeA, 0, 2.9, 1.52));
  g.add(box(2.5, 0.5, 0.14, M.wstStripeA, 0, 1.9, 1.52));
  for (const sx of [-1, 1]) g.add(box(0.14, 1.6, 3.0, M.wstSteel, sx * 1.44, 2.35, -0.1));
  // Sensor head with a scanning eye.
  g.add(box(1.7, 1.1, 1.6, M.steelDark, 0, 3.55, 0.3));
  const eye = ball(0.3, M.civLed, 0, 3.55, 1.15, 12);
  g.add(eye);
  g.add(box(1.9, 0.18, 0.34, M.wstSteel, 0, 3.12, 1.1));
  // Warning beacon on the roof corner.
  const beacon = ball(0.2, M.wstWarn.clone(), 0.95, 4.15, -0.3, 10);
  g.add(beacon);
  // The front-end scoop on a lifting arm (pivots about local X).
  const arm = new THREE.Group();
  arm.position.set(0, 2.0, 1.6);
  g.add(arm);
  [box(0.55, 0.55, 2.4, M.wstSteel, -0.75, 0, 1.1),
    box(0.55, 0.55, 2.4, M.wstSteel, 0.75, 0, 1.1)].forEach((m) => arm.add(m));
  const scoop = new THREE.Group();
  scoop.position.set(0, 0, 2.4);
  arm.add(scoop);
  [box(2.4, 0.3, 1.9, M.wstSteel, 0, -0.55, 0.15),
    box(2.4, 1.1, 0.25, M.wstSteel, 0, -0.15, -0.85),
    box(0.25, 1.3, 1.9, M.wstRust, -1.1, -0.15, 0.1),
    box(0.25, 1.3, 1.9, M.wstRust, 1.1, -0.15, 0.1)].forEach((m) => scoop.add(m));
  g.userData = { arm, scoop, eye, beacon };
  return g;
}

export function makeTractorPad() {
  const g = grp('Tractor Pad');
  g.add(cyl(2.2, 2.2, 0.2, M.steelDark, 0, 0.1, 0, 22));
  // Coil rings.
  for (const r of [0.7, 1.3, 1.9]) {
    const ring = torus(r, 0.08, M.rctGlow, 0, 0.2, 0, 24);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
  }
  const beam = cyl(1.8, 1.4, 5.0, M.tractor.clone(), 0, 2.6, 0, 20);
  g.add(beam);
  g.userData.beam = beam;
  return g;
}

export function makeVentGrate() {
  const g = grp('Vent Grate');
  g.add(cyl(3.2, 3.4, 0.5, M.wstSteel, 0, 0.25, 0, 26));
  const grate = box(4.6, 0.2, 4.0, M.vent.clone(), 0, 0.55, 0);
  g.add(grate);
  // Louver slats.
  for (let i = -1.5; i <= 1.5; i += 0.5) g.add(box(4.4, 0.06, 0.18, M.wstStripeB, 0, 0.68, i));
  for (const sz of [-2.2, 2.2]) g.add(box(5.0, 0.3, 0.3, M.wstWarn, 0, 0.7, sz));
  for (const sx of [-2.4, 2.4]) g.add(box(0.3, 0.3, 4.2, M.wstWarn, sx, 0.7, 0));
  g.userData.grate = grate;
  return g;
}

// The rescue gantry the airlock cinematic uses. Geometry only; the sector wraps
// it with the setReach / setClaw / spinBeacon API. The tower stands OFF to one
// side (MAST_X) so the whole rig can sit beside / behind the decon airlock, and a
// horizontal jib carries the hoist line back over the bay mouth at x = 0 — so the
// claw descends exactly where the car was flung out. The hoist line is a `rope`
// (a chain of unit-length cable segments) that the sector lays out along the
// pivot->claw axis and flexes into a wave, so it unwinds like a real cable and
// pulls taut when it takes hold; the claw itself is a two-prong grip (a palm
// plate with two jaws) that closes around the car.
const RESCUE_MAST_X = 5.2;
export function makeRescueCrane() {
  const g = grp('Rescue Crane');
  const mx = RESCUE_MAST_X;
  // The tower is built along the local Z axis and slid out to z = mx, so that
  // once the mount is turned a quarter turn (mount.rotateY(-PI/2)) the lattice
  // stands to the SIDE of the bay (off along +/-s) rather than out in the +w
  // ejection lane the trash and the car both travel down. Only the jib reaches
  // back over the bay mouth at (0, 0).
  const tower = grp('Crane Tower');
  tower.position.z = mx;
  g.add(tower);
  // Bolted base block with hazard skirts and corner bolts (under the mast).
  tower.add(box(3.2, 0.7, 3.2, M.wstSteel, 0, 0.35, 0));
  for (const sz of [-1.35, 1.35]) tower.add(box(3.34, 0.72, 0.56, M.wstStripeA, 0, 0.35, sz));
  for (const sx of [-1.4, 1.4]) for (const sz of [-1.4, 1.4]) tower.add(box(0.28, 0.28, 0.28, M.steel, sx, 0.72, sz));
  // Turntable and a lattice mast of four posts with rungs.
  tower.add(cyl(1.1, 1.2, 0.35, M.steelDark, 0, 0.85, 0, 20));
  for (const sx of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) tower.add(box(0.16, 7.0, 0.16, M.wstRust, sx, 4.4, sz));
  for (let i = 0; i < 7; i++) {
    const y = 1.2 + i * 1.0;
    // Rungs run slightly past the posts so no end face is coplanar with one.
    tower.add(box(1.3, 0.1, 0.1, M.steel, 0, y, 0.5));
    tower.add(box(1.3, 0.1, 0.1, M.steel, 0, y, -0.5));
    tower.add(box(0.1, 0.1, 1.3, M.steel, 0.5, y, 0));
    tower.add(box(0.1, 0.1, 1.3, M.steel, -0.5, y, 0));
  }
  // Counterweight, a small cab with a lit window, and a top light bar.
  tower.add(box(1.6, 1.6, 1.6, M.wstRust, 0, 1.4, 1.6));
  tower.add(box(1.6, 1.4, 1.4, M.steelDark, 0, 3.4, 1.2));
  tower.add(box(1.2, 1.2, 0.1, M.rctGlow, 0, 3.4, 1.92));
  tower.add(box(5.0, 0.14, 0.14, M.steel, 0, 7.0, 0));
  tower.add(box(4.0, 0.3, 0.2, M.wstStripeA, 0, 7.4, 0));
  // The jib beam reaching from the mast top across to the hoist line over the bay.
  g.add(box(0.5, 0.5, mx, M.steel, 0, 7.2, mx / 2));
  // Jib pivot with a pulley, directly over the bay mouth (x = 0).
  const boomPivot = new THREE.Group();
  boomPivot.position.set(0, 7.2, 0);
  g.add(boomPivot);
  boomPivot.add(box(1.8, 0.9, 1.8, M.wstSteel, 0, 0, 0));
  const pulley = torus(0.35, 0.12, M.steel, 0, 0, 0, 16);
  pulley.rotation.y = Math.PI / 2;
  boomPivot.add(pulley);
  // The hoist line. It is NOT a rigid truss (that read as a big straight rod):
  // it is a flexible cable built from a chain of short segments, so the sector
  // can flex it into a travelling wave. Paying it out makes it unwind and ripple
  // like a rope; once the claw takes hold and hauls the car home the wave dies
  // away and the line pulls taut. Geometry only here - the sector's `setReach`
  // re-lays the segments every frame.
  const rope = new THREE.Group();
  boomPivot.add(rope);
  const ropeSegGeo = new THREE.CylinderGeometry(0.14, 0.14, 1, 6);
  const ropeMat = M.wstStripeA;                        // bright hazard-yellow cable
  for (let i = 0; i < 24; i++) {
    const seg = new THREE.Mesh(ropeSegGeo, ropeMat);
    seg.castShadow = true;
    rope.add(seg);
  }
  // A keeper ferrule where the line leaves the drum, so it reads as paid off a
  // spool rather than sprouting from nothing.
  boomPivot.add(cyl(0.2, 0.2, 0.5, M.steelDark, 0, -0.1, 0, 10));
  // The grip: a broad palm plate that sits INBOARD of the car (the side the cable
  // comes down on) and two jaws that hang DOWN and OUTWARD, wrapping the car's
  // flanks. The grip centre is the claw origin, so the sector can drop the claw
  // straight onto the stranded car. Jaw tips are wide plates so the grip visibly
  // encircles the body, not pokes it.
  const claw = new THREE.Group();
  boomPivot.add(claw);
  claw.add(box(2.8, 0.6, 2.4, M.wstSteel, 0, 1.7, 0));        // palm / backing plate (top)
  claw.add(cyl(0.5, 0.5, 0.5, M.steel, 0, 2.3, 0, 14));       // wrist collar (to the cable)
  const fingers = [];
  for (const sx of [-1, 1]) {
    const finger = box(0.5, 3.6, 2.4, M.steel, sx * 1.35, -0.7, 0);
    finger.rotation.z = sx * -0.1;                            // tip curls inward around the car
    claw.add(finger);
    fingers.push(finger);
  }
  const beacon = ball(0.3, M.wstWarn.clone(), 0, 7.9, mx, 10);
  g.add(beacon);
  g.userData = { boomPivot, rope, claw, beacon, fingers };
  return g;
}

// A decon airlock gate: two pylon consoles, a heavy gantry, and three
// concentric scanner rings with inward nozzles that the sector spins / pulses.
// It reads as a machine that grabs and scrubs you as you pass through.
export function makeDeconAirlock() {
  const g = grp('Decon Airlock');
  const halfW = RING_HALF_W - 1.4;
  // Two pylons: stacked housings, louvres and control screens.
  for (const side of [-1, 1]) {
    const z = side * halfW;
    box(1.6, 0.9, 2.2, M.steelDark, 0, 0.45, z);
    box(1.4, 7.6, 1.9, M.steel, 0, 4.6, z);
    for (let i = 0; i < 3; i++) box(1.5, 0.18, 2.0, M.steelDark, 0, 1.7 + i * 2.2, z);
    // Louvres on the inward face.
    for (let i = 0; i < 5; i++) g.add(box(0.12, 0.35, 1.3, M.wstStripeB, -side * 0.78, 2.4 + i * 0.75, z));
    // Console screen and buttons on the outward face.
    box(0.14, 1.1, 1.3, M.rctGlow, side * 0.76, 4.6, z);
    for (let i = 0; i < 4; i++) g.add(ball(0.09, i % 2 ? M.civLed : M.wstWarn, side * 0.78, 2.2 + i * 0.3, z, 6));
    box(0.5, 0.2, 2.3, M.wstStripeA, 0, 8.65, z);
  }
  // Overhead gantry beam with a warning sign and a row of strobes.
  box(1.3, 0.9, RING_W - 1.4, M.steel, 0, 9.0, 0);
  box(0.35, 0.9, RING_W - 1.8, M.wstStripeA, 0, 9.55, 0);
  for (const sz of [-3.2, 0, 3.2]) g.add(box(0.5, 0.35, 0.5, M.civLed, 0.7, 9.0, sz));
  // Three concentric ring frames the car drives through (axis = local X). Each
  // ring sits on the floor (centre y = its radius) so it reads as an arch.
  const jets = [];
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const cx = -2.4 + i * 2.4;
    const R = 4.8 - i * 0.4;
    const frame = torus(R, 0.45, M.steel, cx, R, 0, 26);
    frame.rotation.y = Math.PI / 2;
    g.add(frame);
    const inner = torus(R - 0.55, 0.16, M.rctGlow, cx, R, 0, 26);
    inner.rotation.y = Math.PI / 2;
    g.add(inner);
    // Nozzle clusters aiming inward around each frame.
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const r = R - 0.55;
      const ny = R + Math.sin(a) * r, nz = Math.cos(a) * r;
      const nz_ = cone(0.16, 0.5, M.steelDark, cx + 0.3, ny, nz, 8);
      nz_.geometry.rotateX(Math.PI / 2);   // cone axis -> local +Z
      nz_.lookAt(cx, ny - Math.sin(a) * 1.0, nz - Math.cos(a) * 1.0);
      g.add(nz_);
      const jet = cone(0.12, 0.7, M.hydGlass.clone(), cx + 0.3, ny, nz, 8);
      jet.geometry.rotateX(Math.PI / 2);
      jet.material.opacity = 0.0;
      jet.lookAt(cx, ny - Math.sin(a) * 1.2, nz - Math.cos(a) * 1.2);
      g.add(jet);
      jets.push(jet);
    }
  }
  // Two spinning scanner rings with radial blades.
  for (let i = 0; i < 2; i++) {
    const R = 4.2;
    const ring = new THREE.Group();
    ring.position.set(-1.2 + i * 2.4, R, 0);
    g.add(ring);
    const band = torus(R, 0.18, M.steelDark, 0, 0, 0, 30);
    band.rotation.y = Math.PI / 2;
    ring.add(band);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const blade = box(0.5, 0.22, 1.4, M.rctGlow, 0, Math.sin(a) * R, Math.cos(a) * R);
      blade.rotation.x = a;
      ring.add(blade);
    }
    rings.push(ring);
  }
  // Floor grate with a central drain and vented treads.
  box(5.6, 0.3, RING_W - 3.0, M.rctGrate, 0, 0.15, 0);
  g.add(cyl(0.9, 0.9, 0.32, M.steelDark, 0, 0.2, 0, 16));
  for (let i = -2.2; i <= 2.2; i += 0.55) g.add(box(0.12, 0.34, RING_W - 3.4, M.steel, i, 0.18, 0));
  // A translucent suction throat the sector pulses.
  const curtain = cyl(4.8, 3.0, 3.0, M.glass.clone(), 0, 4.2, 0, 24);
  curtain.rotation.z = Math.PI / 2;
  curtain.material = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x5fb8ff, emissiveIntensity: 1.4, transparent: true, opacity: 0.14, side: THREE.DoubleSide });
  g.add(curtain);
  g.userData = { rings, jets, curtain };
  return g;
}

// The shoulder-side decontamination AIRLOCK BAY: an open-fronted chamber the car
// drives straight into, sitting beside the lane instead of spanning it. The mouth
// faces local -X (down the road) so the approach is wide open; inside are hazard
// consoles, spinning scanner rings, inward nozzles and a translucent suction
// throat. This is where the depressurization cinematic is armed -- the sector
// pulses it and main.js flings the car out through its outer wall.
export function makeDeconBay() {
  const g = grp('Decon Bay');
  const D = 7.0;          // depth along the road (local X)
  const W = 6.4;          // width across the road (local Z)
  const H = 5.0;          // interior height
  const xBack = D / 2;    // +X = solid back wall
  const xMouth = -D / 2;  // -X = open mouth the car enters
  // Floor: grated treads, a central drain, and chevrons leading into the mouth.
  box(D, 0.3, W, M.rctGrate, 0, 0.15, 0);
  box(D, 0.08, 0.5, M.wstStripeA, 0, 0.32, 0);
  for (const sz of [-1, 1]) for (let i = 0; i < 4; i++) {
    g.add(box(0.5, 0.06, 0.9, M.wstStripeA, xBack - 1.0 - i * 1.1, 0.33, sz * 1.4));
  }
  g.add(cyl(0.7, 0.7, 0.34, M.steelDark, 0, 0.2, 0, 16));
  for (let i = 0; i < 3; i++) g.add(box(0.9, 0.06, W - 1.6, M.wstStripeA, xMouth - 0.7 - i * 0.9, 0.33, 0));
  // Side walls with louvres and inward nozzle / jet rows.
  const jets = [];
  for (const sz of [-1, 1]) {
    const zc = sz * (W / 2 - 0.25);
    box(D, H, 0.5, M.steelDark, 0, H / 2, zc);
    box(D, 0.5, 0.6, M.wstStripeA, 0, H - 0.4, zc);
    for (let i = -2; i <= 2; i++) {
      g.add(box(0.8, 0.5, 0.14, M.wstStripeB, i * 1.3, 1.5, sz * (W / 2 - 0.5)));
      const nz = cone(0.14, 0.5, M.steelDark, i * 1.3, 3.0, sz * (W / 2 - 0.5), 8);
      nz.geometry.rotateX(sz > 0 ? -Math.PI / 2 : Math.PI / 2);
      g.add(nz);
      const jet = cone(0.1, 0.7, M.hydGlass.clone(), i * 1.3, 3.0, sz * (W / 2 - 0.5), 8);
      jet.geometry.rotateX(sz > 0 ? -Math.PI / 2 : Math.PI / 2);
      jet.material.opacity = 0.0;
      g.add(jet);
      jets.push(jet);
    }
  }
  // Far end: the blast port the car is fired through, open to the void. A heavy
  // frame with a glowing rim and a hazard collar, so it reads as the barrel mouth
  // the chamber shoots from rather than a solid back wall.
  const port = torus(2.7, 0.4, M.steel, xBack - 0.15, 2.7, 0, 22);
  port.rotation.y = Math.PI / 2;
  g.add(port);
  const portGlow = torus(2.35, 0.16, M.rctGlow, xBack - 0.15, 2.7, 0, 22);
  portGlow.rotation.y = Math.PI / 2;
  g.add(portGlow);
  box(0.5, 0.5, W, M.wstStripeA, xBack - 0.4, H - 0.2, 0);
  // A lit status panel beside the port.
  box(0.18, 1.2, 1.4, M.rctGlow, xBack - 0.5, 1.2, W / 2 - 1.3);
  for (const sz of [-W / 2 + 0.4, W / 2 - 0.4]) g.add(box(0.5, 4.6, 0.35, M.steelDark, xBack - 0.35, H / 2, sz));
  // Overhead lintel / roof, a warning sign and strobes over the mouth.
  box(D, 0.9, W, M.steel, 0, H + 0.2, 0);
  box(D, 0.3, W - 0.6, M.wstStripeA, 0, H + 0.75, 0);
  box(0.5, 1.0, 1.8, M.rctGlow, xMouth + 0.4, H + 0.2, 0);
  for (const sz of [-2.0, 0, 2.0]) g.add(box(0.5, 0.35, 0.5, M.civLed, xMouth + 0.4, H - 0.2, sz));
  // The big glowing threshold arch the car drives through (axis = local X).
  const arch = torus(2.6, 0.4, M.steel, xMouth + 0.1, 2.6, 0, 26);
  arch.rotation.y = Math.PI / 2;
  g.add(arch);
  const archGlow = torus(2.3, 0.16, M.rctGlow, xMouth + 0.1, 2.6, 0, 26);
  archGlow.rotation.y = Math.PI / 2;
  g.add(archGlow);
  // Two spinning scanner rings inside (axis = local X).
  const rings = [];
  for (let i = 0; i < 2; i++) {
    const R = 2.3 - i * 0.1;
    const ring = new THREE.Group();
    ring.position.set(xMouth + 2.2 + i * 2.0, R + 0.3, 0);
    g.add(ring);
    const band = torus(R, 0.18, M.steelDark, 0, 0, 0, 30);
    band.rotation.y = Math.PI / 2;
    ring.add(band);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const blade = box(0.5, 0.22, 1.2, M.rctGlow, 0, Math.sin(a) * R, Math.cos(a) * R);
      blade.rotation.x = a;
      ring.add(blade);
    }
    rings.push(ring);
  }
  // A translucent suction throat the sector pulses.
  const curtain = cyl(3.0, 2.0, D * 0.7, M.glass.clone(), xMouth + D * 0.42, 2.6, 0, 24);
  curtain.rotation.z = Math.PI / 2;
  curtain.material = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x5fb8ff, emissiveIntensity: 1.4, transparent: true, opacity: 0.14, side: THREE.DoubleSide });
  g.add(curtain);
  g.userData = { rings, jets, curtain, archGlow, portGlow };
  return g;
}

export function makeHazardPanel() {
  const g = grp('Hazard Panel');
  const plate = box(2.0, 0.9, 0.12, M.wstStripeB, 0, 0.45, 0);
  g.add(plate);
  stripeRow(g, 1.8, 0.7, M.wstStripeA, 0, 0.45, 0.08);
  return g;
}

// ==========================================================================
export function buildSpaceSectors() {
  const group = new THREE.Group();
  const zones = [];
  const knocks = [];
  const vines = [];
  const dynamics = [];
  const state = { hazardsOff: 0 };

  // A shoved prop: a cell on the rim holding a mesh that springs around.
  function knockable(s, w, o) {
    const cell = new THREE.Group();
    place(cell, s, w);
    group.add(cell);
    const node = o.make(cell);
    node.position.set(0, o.baseY ?? 0, 0);
    knocks.push({
      node, s, w, bx: 0, by: o.baseY ?? 0, bz: 0,
      dx: 0, dz: 0, vx: 0, vz: 0, radius: o.radius ?? 3.4, mass: o.mass ?? 1,
    });
    return cell;
  }

  // A tracked eye terminal whose head yaws to follow the car.
  function eye(s, w) {
    const cell = new THREE.Group();
    place(cell, s, w);
    group.add(cell);
    const model = makeEyeTerminal();
    cell.add(model);
    const head = model.userData.head;
    dynamics.push((dt, t, car) => {
      if (!car) return;
      const th = s / RING_R, c = Math.cos(th), sn = Math.sin(th);
      const ex = RING_R * c, ey = RING_R * sn, ez = w;
      const tc = car.s / RING_R;
      const cx = RING_R * Math.cos(tc), cy = RING_R * Math.sin(tc), cz = car.w;
      const dx = cx - ex, dy = cy - ey, dz = cz - ez;
      const dxl = dx * -sn + dy * c;
      const dyl = dx * -c + dy * -sn;
      const dzl = dz;
      head.rotation.y = Math.atan2(-dxl, -dzl);
      head.rotation.x = Math.max(-0.6, Math.min(0.6, Math.atan2(-dyl, Math.hypot(dxl, dzl))));
    });
  }

  // A hazard stripe decal band on the side walls, tiled from hazard panels.
  function hazardWall(a0, a1, w, skip) {
    for (let s = a0 * RING_R + 1; s < a1 * RING_R - 1; s += 2.0) {
      if (skip && skip(s, w)) continue;
      const seg = new THREE.Group();
      place(seg, s, w);
      seg.add(makeHazardPanel());
      // Panels alternate so the stripe reads as a continuous chevron band.
      if (Math.floor(s / 2) % 2) seg.children[0].rotation.y = Math.PI;
      group.add(seg);
    }
  }

  // ========================================================================
  // 1. PRISTINE CIVIC & HABITATION
  // ========================================================================
  {
    const a0 = 0, a1 = Math.PI / 2;
    group.add(band(RING_R - 0.02, a0, a1, RING_W - 0.2, 0, M.civFloor));

    // Wall wainscot + LED strip both sides, following the curve.
    // The civic galley occupies the +Z wall over the arc below, so the wall
    // dressing, eye terminals and furniture loops all skip that stretch on the
    // +Z side to leave it clear for the kitchen.
    const GAL_S0 = 23, GAL_S1 = 37;
    for (let s = a0 * RING_R + 3; s < a1 * RING_R - 3; s += 6.5) {
      for (const side of [-1, 1]) {
        if (side > 0 && s > GAL_S0 && s < GAL_S1) continue;
        const p = new THREE.Group();
        place(p, s, side * (RING_HALF_W - 0.55));
        p.add(box(6.0, 1.5, 0.7, M.civWall, 0, 0.75, 0));
        p.add(box(5.6, 0.12, 0.12, M.civLed, 0, 1.5, -0.4 * side));
        p.add(box(6.0, 0.16, 0.9, M.civAccent, 0, 0.08, 0));
        group.add(p);
      }
    }

    // The civic galley: the SAME kitchen kit the house uses, in the station's
    // pale palette, bolted against the +Z wall. It is one group (counter, range,
    // clutter, wall tools) turned 180 so its back faces the wall, standing on
    // the rim floor just inside the wall.
    {
      const cell = new THREE.Group();
      place(cell, 30, RING_HALF_W - 0.55);
      const galley = makeGalley({ pal: STATION_KITCHEN, s: 0.8 });
      galley.rotation.y = Math.PI;
      cell.add(galley);
      group.add(cell);
    }

    // Monorail / passenger boost lanes down the middle, tiled from pads.
    for (const cz of [-6.5, 6.5]) {
      for (let s = (a0 + 0.16) * RING_R; s < (a1 - 0.14) * RING_R; s += 3.6) {
        const cell = new THREE.Group();
        place(cell, s, cz);
        cell.add(makeBoostPad());
        group.add(cell);
      }
      zones.push({ type: 'boost', s0: (a0 + 0.16) * RING_R, s1: (a1 - 0.14) * RING_R, w0: cz - 2, w1: cz + 2, add: 16 });
    }

    // Tracking eye terminals on the +Z wall.
    for (let s = a0 * RING_R + 9; s < a1 * RING_R - 6; s += 13) {
      if (s > GAL_S0 && s < GAL_S1) continue;
      eye(s, RING_HALF_W - 1.1);
    }

    // Retro furniture: lounge pods, kiosks and vending units, all shovable.
    const chairs = [makeCivicLoungeChair, makeInfoKiosk, makeVendingPod];
    for (let s = a0 * RING_R + 6; s < a1 * RING_R - 6; s += 5.5) {
      let side = Math.random() < 0.5 ? -1 : 1;
      if (side > 0 && s > GAL_S0 && s < GAL_S1) side = -1;   // keep the galley's wall clear
      const w = side * (RING_HALF_W - 2.6 - Math.random() * 2.2);
      const kind = Math.random() < 0.4 ? 0 : (Math.random() < 0.5 ? 1 : 2);
      knockable(s, w, {
        baseY: 0,
        radius: 3.2,
        make: (cell) => {
          const model = chairs[kind]();
          cell.add(model);
          return model;
        },
      });
    }

    // Autonomous cleaning drones darting across the lanes.
    for (let i = 0; i < 5; i++) {
      const sMid = a0 * RING_R + 12 + i * 12;
      const cell = new THREE.Group();
      group.add(cell);
      const drone = makeCleanerDrone();
      cell.add(drone);
      const body = drone.userData.body;
      const phase = i * 1.7, speed = 0.7 + i * 0.13;
      dynamics.push((dt, t) => {
        const s = sMid + Math.sin(t * speed + phase) * 9;
        const k = (Math.sin(t * speed * 0.8 + phase * 1.7) + 1) / 2;
        const w = -8 + 16 * k;
        place(cell, s, w, RING_R - 1.5);
        body.rotation.y = t * 5 + phase;
      });
    }

    // Retractable glass security barriers sealing the VIP corridor.
    for (const s of [a0 * RING_R + 22, a1 * RING_R - 22]) {
      const cell = new THREE.Group();
      place(cell, s, 0);
      group.add(cell);
      const barrier = makeSecurityBarrier();
      cell.add(barrier);
      const slab = barrier.userData.slab;
      const zone = { type: 'barrier', s, w0: -RING_LANE, w1: RING_LANE, state: 0 };
      zones.push(zone);
      const bias = s * 0.017;
      dynamics.push((dt, t) => {
        const cycle = (t * 0.16 + bias) % 1;
        const down = Math.max(0, Math.min(1, (cycle - 0.1) / 0.12)) * (1 - Math.max(0, Math.min(1, (cycle - 0.62) / 0.12)));
        slab.position.y = 2.0 + (1 - down) * 3.4;
        zone.state = down;
      });
    }
  }

  // ========================================================================
  // 2. HYDROPONICS & BIO-DOME
  // ========================================================================
  {
    const a0 = Math.PI / 2, a1 = Math.PI;
    group.add(band(RING_R - 0.02, a0, a1, RING_W - 0.2, 0, M.hydFloor));

    // Terraced soil beds down both sides.
    for (let s = a0 * RING_R + 3; s < a1 * RING_R - 3; s += 4.5) {
      for (const side of [-1, 1]) {
        const p = new THREE.Group();
        place(p, s, side * (RING_HALF_W - 2.4));
        p.add(makeSoilBed());
        group.add(p);
      }
    }

    // Translucent glass domes down the two edges, small enough to drive between.
    // They used to arch at the lane centre on the roof where nobody could see
    // them; now they sit on the floor at the sides with a clear lane up the
    // middle. Shrunk to 0.5 so a car passes easily between the left and right.
    for (let s = a0 * RING_R + 7; s < a1 * RING_R - 7; s += 13) {
      for (const side of [-1, 1]) {
        const dome = new THREE.Group();
        place(dome, s, side * (RING_HALF_W - 4.0));
        dome.add(makeBioDome());
        dome.scale.setScalar(0.5);
        group.add(dome);
      }
    }

    // A dense curtain of hanging bio-vines across the whole lane: ~100 of them in
    // a staggered grid, each a stalk with a heavy club at the tip. They swing
    // like pendulums and get knocked flying as the car ploughs through, and
    // brushing the curtain drags on you a little (see the vine pass in update).
    {
      const anchorR = RING_R - 8.2;
      const cols = [-9.6, -4.8, 0, 4.8, 9.6];
      let row = 0;
      for (let s = a0 * RING_R + 3; s < a1 * RING_R - 3; s += 3.15, row++) {
        for (let c = 0; c < cols.length; c++) {
          const w = cols[c] + ((row & 1) ? 1.6 : -1.6);   // stagger alternate rows
          const cell = new THREE.Group();
          place(cell, s, w, anchorR);
          group.add(cell);
          // The vine hangs from a swing pivot whose base orientation is identity,
          // so rotating it swings a proper pendulum. Rotating the placed cell
          // itself would overwrite the place() basis (local Y = hub-ward) and tip
          // the vine sideways instead of letting it hang. The swing pivot sits at
          // the FIXED ceiling anchor and only ever rotates - the anchor never
          // translates, so the vine stays pinned to the ceiling as it swings.
          const stem = new THREE.Group();
          cell.add(stem);
          const swing = new THREE.Group();
          stem.add(swing);
          const len = 7.4 + (c % 3) * 0.5;
          swing.add(makeHangingVine(len));
          vines.push({
            s, w, stem, node: swing, len,
            dw: 0, vw: 0,
            ang: 0, vel: 0, phase: Math.random() * TWO_PI,
          });
        }
      }
    }

    // Sprinkler / irrigation jet vents in the floor (periodic mist shove).
    for (const baseS of [a0 * RING_R + 14, a0 * RING_R + 36, a1 * RING_R - 16]) {
      const cell = new THREE.Group();
      place(cell, baseS, 0);
      group.add(cell);
      const vent = makeSprinklerVent();
      cell.add(vent);
      const mist = vent.userData.mist;
      const zone = { type: 'geyser', s: baseS, w: 0, r: 4.2, period: 3.4, phase: baseS * 0.05, push: 9, state: 0 };
      zones.push(zone);
      dynamics.push((dt, t) => {
        const p = (t + zone.phase) % zone.period;
        const burst = p < 0.5 ? Math.sin((p / 0.5) * Math.PI) : 0;
        zone.state = burst;
        mist.scale.set(1 + burst * 1.6, 0.6 + burst * 1.4, 1 + burst * 1.6);
        mist.material.opacity = (0.24 * burst);
      });
    }

    // Floating pollination / harvest pods (low-g spheres you can nudge).
    for (let i = 0; i < 6; i++) {
      const s = a0 * RING_R + 8 + i * 10;
      const w = (i % 2 ? -1 : 1) * (2 + (i % 3) * 2.5);
      knockable(s, w, {
        baseY: 2.2,
        radius: 3.6,
        mass: 0.5,
        make: (cell) => {
          const model = makePollinationPod();
          cell.add(model);
          return model;
        },
      });
    }

    // Muddy / hydro-slick patches (reduced traction).
    for (const [s0, s1, cz] of [[a0 * RING_R + 10, a0 * RING_R + 26, -4], [a0 * RING_R + 34, a1 * RING_R - 8, 4]]) {
      group.add(band(RING_R - 0.035, s0 / RING_R, s1 / RING_R, 6.5, cz, M.slick));
      zones.push({ type: 'slick', s0, s1, w0: cz - 3.2, w1: cz + 3.2 });
    }

    // Rotating sun-lamp arms: overhead UV lamps sweeping a heat hazard.
    for (const baseS of [a0 * RING_R + 20, a1 * RING_R - 20]) {
      const pivot = new THREE.Group();
      place(pivot, baseS, 0, RING_R - 7);
      group.add(pivot);
      const model = makeSunLampArm();
      pivot.add(model);
      const arm = model.userData.arm;
      const boomLen = model.userData.boomLen;
      const zone = { type: 'plasma', s: baseS, w: 0, r: 3.0, period: 4, phase: 0, state: 0 };
      zones.push(zone);
      dynamics.push((dt, t) => {
        const ang = t * 0.5;
        arm.rotation.y = ang;
        zone.s = baseS + Math.sin(ang) * boomLen;
        zone.w = Math.cos(ang) * boomLen;
        zone.state = 1;   // live whenever the sector is not overridden
      });
    }

    // Grow lights: lamps bathing the beds so the whole greenhouse reads as
    // actively cultivated rather than a dim corridor. Three of them span the
    // quadrant (a green, a warm, and a cool UV-ish one), each breathing gently
    // out of phase the way a real grow array cycles.
    const growCols = [0xbfe08f, 0xffe0a0, 0x9ad0ff];
    const span = (a1 - a0) * RING_R;
    for (let i = 0; i < 3; i++) {
      const s = a0 * RING_R + 14 + i * (span - 28) / 2;
      const a = s / RING_R;
      const gl = new THREE.PointLight(growCols[i], 1.25, 72, 2);
      gl.position.set(Math.cos(a) * (RING_R - 11), Math.sin(a) * (RING_R - 11), 0);
      group.add(gl);
      const phase = i * 2.1;
      dynamics.push((dt, t) => {
        gl.intensity = 1.15 + Math.sin(t * 0.9 + phase) * 0.25;
      });
    }
  }

  // ========================================================================
  // 3. REACTOR CORE & ENGINE MAINTENANCE
  // ========================================================================
  {
    const a0 = Math.PI, a1 = 3 * Math.PI / 2;
    group.add(band(RING_R - 0.02, a0, a1, RING_W - 0.2, 0, M.rctFloor));

    // Grated side bays + exposed conduits.
    for (let s = a0 * RING_R + 3; s < a1 * RING_R - 3; s += 4.5) {
      for (const side of [-1, 1]) {
        const p = new THREE.Group();
        place(p, s, side * (RING_HALF_W - 1.2));
        p.add(makeGratedBay());
        group.add(p);
      }
    }

    // Overhead plasma conduits bridging the corridor (arcing hazards).
    for (const baseS of [a0 * RING_R + 12, a0 * RING_R + 32, a1 * RING_R - 12]) {
      const cell = new THREE.Group();
      place(cell, baseS, 0, RING_R - 6);
      group.add(cell);
      const conduit = makePlasmaConduit();
      cell.add(conduit);
      const spark = conduit.userData.spark;
      const zone = { type: 'plasma', s: baseS, w: 0, r: 3.4, period: 2.6, phase: baseS * 0.03, state: 0 };
      zones.push(zone);
      dynamics.push((dt, t) => {
        const p = (t + zone.phase) % zone.period;
        const on = p < 0.6;
        zone.state = on ? 1 : 0;
        spark.visible = on;
        spark.material.emissiveIntensity = 2.2 + Math.sin(t * 40) * 1.2;
      });
    }

    // Steam / coolant geysers sticking out of the walls (sideways shove).
    for (const baseS of [a0 * RING_R + 18, a0 * RING_R + 40, a1 * RING_R - 18]) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const cell = new THREE.Group();
      place(cell, baseS, side * (RING_HALF_W - 1.6));
      group.add(cell);
      const geyser = makeSteamGeyser();
      // Face the nozzle across the corridor (plume fires along local +Z).
      geyser.rotation.y = side > 0 ? Math.PI : 0;
      cell.add(geyser);
      const jet = geyser.userData.jet;
      const parts = geyser.userData.parts;
      const zone = { type: 'geyser', s: baseS, w: side * 2, r: 4.0, period: 3.0, phase: baseS * 0.07, push: 11, dirW: -side, state: 0 };
      zones.push(zone);
      dynamics.push((dt, t) => {
        const p = (t + zone.phase) % zone.period;
        const burst = p < 0.45 ? Math.sin((p / 0.45) * Math.PI) : 0;
        zone.state = burst;
        jet.scale.set(0.85 + burst * 0.3, 0.85 + burst * 0.3, 0.12 + burst * 1.05);
        for (let i = 0; i < parts.length; i++) parts[i].material.opacity = (0.5 - i * 0.08) * (0.25 + burst * 0.75);
      });
    }

    // Pneumatic lift platforms (jump ramps).
    for (const s of [a0 * RING_R + 24, a1 * RING_R - 24]) {
      knockable(s, 0, {
        baseY: 0,
        radius: 0.001,   // not shoved
        make: (cell) => {
          const model = makeLiftPlatform();
          cell.add(model);
          const plate = model.userData.plate;
          const risers = model.userData.risers;
          const zone = { type: 'lift', s, w: 0, r: 2.6, state: 0 };
          zones.push(zone);
          dynamics.push((dt, t) => {
            const h = (Math.sin(t * 0.55 + s * 0.05) + 1) / 2 * 2.6;
            plate.position.y = 2.0 + h;
            for (const r of risers) r.scale.y = 1.3 + h;
            zone.state = h / 2.6;
          });
          return model;
        },
      });
    }

    // Magnetic tow crane hooks overhead (brief upward tug).
    for (const s of [a0 * RING_R + 16, a0 * RING_R + 38]) {
      const cell = new THREE.Group();
      place(cell, s, 0, RING_R - 7);
      group.add(cell);
      cell.add(makeTowCrane());
      const zone = { type: 'tug', s, w: 0, r: 3.6, period: 4.5, phase: s * 0.04, state: 0 };
      zones.push(zone);
      dynamics.push((dt, t) => {
        const p = (t + zone.phase) % zone.period;
        zone.state = p < 1.4 ? Math.sin((p / 1.4) * Math.PI) : 0;
      });
    }

    // A pressure-plate override that kills the hazards ahead for a beat.
    {
      const s = a0 * RING_R + 8;
      const cell = new THREE.Group();
      place(cell, s, 0);
      group.add(cell);
      cell.add(makeOverridePlate());
      zones.push({ type: 'override', s, w: 0, r: 2.4 });
    }

    const l = new THREE.PointLight(0x3f9dff, 0.6, 90, 2);
    l.position.set(Math.cos(Math.PI * 1.25) * (RING_R - 10), Math.sin(Math.PI * 1.25) * (RING_R - 10), 0);
    group.add(l);
  }

  // ========================================================================
  // 4. INDUSTRIAL WASTE, SORTING & DOCKING
  // ========================================================================
  let crane = null;
  let decon = null;
  let trashBot = null;
  {
    const a0 = 3 * Math.PI / 2, a1 = TWO_PI;
    group.add(band(RING_R - 0.02, a0, a1, RING_W - 0.2, 0, M.wstFloor));

    // The side decon airlock BAY hangs off the +w edge of the ship, past the
    // window wall, so it never blocks the lane: the car has to steer off the road
    // and drive into the chamber mouth. Everything else keeps this stretch of the
    // +w shoulder clear so its approach and ejection path read unobstructed.
    const bayS = a1 * RING_R - 14;
    const bayW = RING_HALF_W + 3.0;
    const bayClear = (s, w) => w > 2 && Math.abs(wrapS(s - bayS)) < 6;

    hazardWall(a0, a1, RING_HALF_W - 0.5, bayClear);
    hazardWall(a0, a1, -(RING_HALF_W - 0.5));

    // Conveyor belt roadways baked into the floor, tiled from belt segments.
    for (const [s0, s1, cz, dir] of [
      [a0 * RING_R + 6, a0 * RING_R + 26, -5, 1],
      [a0 * RING_R + 30, a0 * RING_R + 38, 5, -1],
      [a1 * RING_R - 18, a1 * RING_R - 8, -5, 1],
    ]) {
      for (let s = s0 + 2.36; s < s1; s += 4.72) {
        if (bayClear(s, cz)) continue;
        const seg = new THREE.Group();
        place(seg, s, cz);
        const belt = makeConveyorBelt();
        if (dir < 0) belt.userData.surface.material = M.beltRev.clone();
        seg.add(belt);
        group.add(seg);
      }
      // A running belt flings the car hard along s: the zone both advances the
      // arc position directly (add) and pumps the car's speed (see main.js), so
      // it properly launches you across the room the way the belt runs.
      zones.push({ type: 'conveyor', s0, s1, w0: cz - 2.5, w1: cz + 2.5, add: dir * 30, dir });
    }

    // Stacked cargo containers lining the sides.
    for (let s = a0 * RING_R + 4; s < a1 * RING_R - 4; s += 7) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const w = side * (RING_HALF_W - 2.6);
      if (bayClear(s, w)) continue;
      const cell = new THREE.Group();
      place(cell, s, w);
      group.add(cell);
      cell.add(makeCargoContainer());
      if (Math.random() < 0.5) {
        const upper = makeCargoContainer();
        upper.position.y = 2.6;
        upper.rotation.y = (Math.random() - 0.5) * 0.2;
        cell.add(upper);
      }
    }

    // Magnetic trash cubes you can shove to clear the path.
    for (let i = 0; i < 8; i++) {
      const s = a0 * RING_R + 8 + i * 9;
      const w = (i % 2 ? -1 : 1) * (1.5 + (i % 3) * 2.5);
      if (bayClear(s, w)) continue;
      knockable(s, w, {
        baseY: 1.0,
        radius: 3.4,
        mass: 2.2,
        make: (cell) => {
          const model = makeTrashCube();
          cell.add(model);
          return model;
        },
      });
    }

    // Automated trash compactor pistons slamming on a rhythm.
    for (const baseS of [a0 * RING_R + 20, a0 * RING_R + 42]) {
      const cell = new THREE.Group();
      place(cell, baseS, 0, RING_R - 6);
      group.add(cell);
      const compactor = makeCompactor();
      cell.add(compactor);
      const head = compactor.userData.head;
      const zone = { type: 'compactor', s: baseS, w: 0, r: 3.2, period: 3.2, phase: baseS * 0.02, state: 0 };
      zones.push(zone);
      dynamics.push((dt, t) => {
        const p = (t + zone.phase) % zone.period;
        // fast slam then slow retract
        let k;
        if (p < 0.35) k = Math.min(1, p / 0.35 * 1.4);
        else k = Math.max(0, 1 - (p - 0.35) / 0.6);
        head.position.y = 4.2 - k * 3.2;
        zone.state = k;
      });
    }

    // Tractor-beam pads pulling loose things toward them.
    for (const s of [a0 * RING_R + 12, a0 * RING_R + 34, a1 * RING_R - 30]) {
      const cell = new THREE.Group();
      place(cell, s, 0);
      group.add(cell);
      cell.add(makeTractorPad());
      zones.push({ type: 'tractor', s, w: 0, r: 2.6, pull: 6 });
    }

    // ---- The side decon airlock: the depressurization trigger ----
    // The chamber hangs off the +w edge, beyond the window wall, with its mouth
    // turned to face back across the road (-w), so the car drives in off its side
    // rather than down the lane. The lane widens here (see main.js) so the car can
    // leave the road for the mouth; its seat (s, w) is also where the crane hoist
    // drops, so the car is flung out along the crane's own radial.
    {
      const cell = new THREE.Group();
      place(cell, bayS, bayW);
      group.add(cell);
      const bay = makeDeconBay();
      bay.rotation.y = -Math.PI / 2;   // turn the mouth to face the road (-w)
      cell.add(bay);
      // An apron bridging the corridor floor to the bay mouth, so there is a
      // surface under the car the whole way it drives off the lane.
      cell.add(box(6.4, 0.3, 5.4, M.steelDark, 0, 0.15, -6.1));
      const { rings, jets, curtain, archGlow, portGlow } = bay.userData;
      const zone = {
        type: 'vent',
        s0: bayS - 3.6, s1: bayS + 3.6,
        w0: RING_HALF_W - 2, w1: bayW + 3.6,
        s: bayS, w: bayW,
        // How near the bay the lane opens, and how far out the car may drive.
        arc: 5.5, lane: bayW + 3.6,
      };
      zones.push(zone);
      // The depressurization cinematic drives `charge` from 0 to 1 while the car
      // sits in the throat, so the chamber visibly winds up before it fires.
      decon = { s: bayS, arc: 5.5, lane: bayW + 3.6, charge: 0 };
      dynamics.push((dt, t) => {
        // Live-look: arch glow breathes, rings spin, nozzles spit, throat ripples.
        // `charge` (set by main.js during the vent) blows every one of those up.
        const heat = 0.6 + Math.sin(t * 2.4) * 0.4;
        const ch = decon.charge || 0;
        const boost = 1 + ch * 9;             // it gets brighter and brighter...
        archGlow.material.emissiveIntensity = (1.2 + heat * 0.9) * boost;
        portGlow.material.emissiveIntensity = (1.1 + heat * 0.8) * boost;
        for (const r of rings) r.rotation.x += dt * (2.0 + heat * 4 + ch * 40);   // ...and spins faster and faster
        for (let i = 0; i < jets.length; i++) jets[i].material.opacity = Math.min(1, (0.2 + 0.4 * (0.6 + 0.4 * Math.sin(t * 6 + i))) * (1 + (decon.charge || 0) * 1.5));
        curtain.material.opacity = 0.1 + heat * 0.16 + (decon.charge || 0) * 0.5;
      });
    }

    // ---- The rescue crane: mounted at the bay, jib over the bay mouth ----
    {
      const mount = makeRescueCrane();
      place(mount, bayS, bayW);
      // Spin the rig about its own radial so its mast stands behind the bay the
      // same way the (now side-facing) chamber is turned; that turn also points the
      // jib's local +X out along +w, so `setReach` runs the claw out over the
      // chamber and into the void the car is fired through.
      mount.rotateY(-Math.PI / 2);
      group.add(mount);
      const { boomPivot, rope, claw, beacon, fingers } = mount.userData;
      const drop = 4.5;                         // pivot down to the grip: lands the claw's
                                                // centre on the car's centre (2.7 above the
                                                // deck), not on the deck under it
      const wrist = 2.5;                        // claw's wrist collar sits this high above its grip centre
      let ropeDrop = drop - wrist;              // the line ends at the wrist, not down through the grip
      const CRANE_PARK_LIFT = 2.0;              // how far up the claw tucks when the rig is idle
                                                // (kept <= drop - wrist so the line never runs uphill)
      const nSeg = rope.children.length;
      // Scratch for the per-frame rope layout (allocated once, not per segment).
      const _dir = new THREE.Vector3();
      const _ref = new THREE.Vector3();
      const _p1 = new THREE.Vector3();
      const _p2 = new THREE.Vector3();
      const _a = new THREE.Vector3();
      const _b = new THREE.Vector3();
      const _seg = new THREE.Vector3();
      const _mid = new THREE.Vector3();
      const _up = new THREE.Vector3(0, 1, 0);
      // A point along the hoist line: `u` runs 0 (pivot) -> 1 (claw). Waviness
      // (0 = taut, 1 = fully unruly) bows it into a travelling helix that is
      // pinned at both ends, so the line snakes but still meets drum and claw.
      const ropePoint = (u, reach, waviness, phase, out) => {
        out.set(reach * u, -ropeDrop * u, 0);
        if (waviness <= 1e-4) return out;
        const env = Math.sin(Math.PI * u);            // 0 at both ends, 1 mid-span
        const amp = waviness * (0.4 + 1.9 * env) * env;
        const s1 = Math.sin(u * 5.2 * Math.PI - phase);
        const s2 = Math.cos(u * 5.2 * Math.PI - phase);
        return out.addScaledVector(_p1, s1 * amp).addScaledVector(_p2, s2 * amp * 0.7);
      };
      crane = {
        mount, boomPivot, rope, claw, beacon,
        s: bayS, w: bayW,
        parkLift: CRANE_PARK_LIFT,
        // `reach` = how far the claw has run out along +w from the bay. The rig is
        // turned so its local +X points along +w (the way the chamber fires the
        // car), so the jib swings from the pivot out over the chamber and beyond,
        // dropping `drop` back down onto the car's centre. `waviness` and `phase`
        // flex the rope (see ropePoint); the sector passes 0/0 for a taut line.
        // `lift` retracts the hoist: the claw tucks up `lift` toward the pivot and
        // the line shortens to match, so the idle rig parks clear of the bay.
        setReach(reach, heading = 0, waviness = 0, phase = 0, lift = 0) {
          const d = drop - lift;
          ropeDrop = d - wrist;
          // Perpendicular basis to the pivot->wrist axis, for the rope's wave.
          _dir.set(reach, -ropeDrop, 0);
          const len = _dir.length() || 1;
          _dir.multiplyScalar(1 / len);
          _p1.crossVectors(_dir, _ref.set(0, 0, 1));
          if (_p1.lengthSq() < 1e-6) _p1.set(0, 0, 1);
          _p1.normalize();
          _p2.crossVectors(_dir, _p1).normalize();
          // Re-lay the segment chain along the (possibly wavy) line.
          ropePoint(0, reach, waviness, phase, _a);
          for (let i = 0; i < nSeg; i++) {
            ropePoint((i + 1) / nSeg, reach, waviness, phase, _b);
            const seg = rope.children[i];
            _seg.subVectors(_b, _a);
            const sl = _seg.length() || 1e-6;
            seg.position.copy(_mid.addVectors(_a, _b).multiplyScalar(0.5));
            seg.scale.set(1, sl * 1.15, 1);           // slight overlap hides the joints
            seg.quaternion.setFromUnitVectors(_up, _seg.multiplyScalar(1 / sl));
            _a.copy(_b);
          }
          claw.position.set(reach, -d, 0);
          // Turn the grip to match the car's heading, so the jaws close on its
          // flanks (across the car) no matter which way it is pointing.
          claw.rotation.y = Math.PI - heading;
        },
        // k = 1 -> jaws wide, k = 0 -> shut around a car of half-width `half`.
        setClaw(open, half) {
          const k = Math.max(0, Math.min(1, open));
          const shut = Math.max(0.75, half ?? 1.35);
          const x = shut + k * 1.0;
          fingers[0].position.x = -x;
          fingers[1].position.x = x;
        },
        spinBeacon(t) { beacon.material.emissiveIntensity = 1.2 + Math.sin(t * 8) * 0.8; },
      };
      // Idle: the rig parks its claw up and clear of the bay until the vent needs it.
      crane.setReach(0, 0, 0, 0, CRANE_PARK_LIFT);
      crane.setClaw(1);
    }

    // ---- The trash loader: a bot ferrying bins around a closed floor loop ----
    // While the car is near the airlock a little tracked loader runs a loop: it
    // takes a full bin off the intake belt (which climbs up out of a hole in the
    // deck), carries it around the ship to the airlock mouth, tips the waste in
    // to be fired out the far port, then carries the emptied bin on to the
    // return belt, which slopes back down into a second floor hole. The bin
    // vanishes underground and re-emerges full at the intake, so nothing is ever
    // parked across the lane and nothing is fired back through the bay the car
    // rescues from. The loop freezes (cube stowed) when nobody is near, and
    // stands down completely while the car's own vent cinematic runs.
    {
      const intS = bayS - 12, intW = 6;       // intake belt, along the lane
      const mouthS = bayS, mouthW = 12.5;     // where the bot tips into the airlock
      const retS = bayS + 12, retW = -6;      // return belt, other side of the lane

      const beltIn = makeGroundConveyor(false);
      place(beltIn, intS, intW);
      group.add(beltIn);
      const beltOut = makeGroundConveyor(true);
      place(beltOut, retS, retW);
      group.add(beltOut);

      const bot = makeLoaderBot();
      group.add(bot);
      const cube = makeTrashCube();
      cube.visible = false;
      group.add(cube);

      // Phase timings, in seconds.
      const T_OUT = 1.5, T_LOAD = 0.8, T_HAUL = 2.5, T_DUMP = 1.2;
      const T_BACK = 2.5, T_CHUTE = 1.2, T_HOME = 2.5;
      const TRASH_CYCLE = T_OUT + T_LOAD + T_HAUL + T_DUMP + T_BACK + T_CHUTE + T_HOME;
      const b1 = T_OUT, b2 = b1 + T_LOAD, b3 = b2 + T_HAUL;
      const b4 = b3 + T_DUMP, b5 = b4 + T_BACK, b6 = b5 + T_CHUTE;
      const TRASH_NEAR = 46;      // how close the car must be for the loop to run
      const CUBE_SCALE = 0.72;

      const smooth = (k) => k * k * (3 - 2 * k);
      const lerp = (a, b, k) => a + (b - a) * k;
      const faceTo = (a, b) => Math.atan2(b.s - a.s, b.w - a.w);
      const A = { s: intS, w: intW }, M = { s: mouthS, w: mouthW }, R = { s: retS, w: retW };

      let clock = 0;
      trashBot = { bot, cube, near: false, clock: 0, suppress: false, intake: beltIn, return: beltOut };

      dynamics.push((dt, t, car) => {
        const near = !!(car && car.s !== undefined)
          && Math.hypot(wrapS(car.s - bayS), (car.w || 0) - bayW) < TRASH_NEAR;
        trashBot.near = near;
        const active = near && !trashBot.suppress;
        if (active) clock += dt;
        trashBot.clock = clock;
        const started = clock > 0.001;

        const p = clock % TRASH_CYCLE;
        const { arm, eye, beacon } = bot.userData;

        let bs = intS, bw = intW, phi = faceTo(A, M), armX = 0, spin = 0;
        let cs = intS, cw = intW, cy = 0.15, show = false, full = true;

        if (p < b1) {
          // The bin rides up out of the intake hole while the bot waits for it.
          cy = lerp(-1.4, 1.1, smooth(p / T_OUT));
          show = true;
        } else if (p < b2) {
          // The scoop dips and takes the bin off the belt.
          const k = (p - b1) / T_LOAD;
          armX = Math.sin(k * Math.PI) * 0.5;
          cy = 1.1;
          spin = k * 1.4;
          show = true;
        } else if (p < b3) {
          // Carry the full bin around the ship to the airlock mouth.
          const k = smooth((p - b2) / T_HAUL);
          bs = lerp(A.s, M.s, k); bw = lerp(A.w, M.w, k);
          phi = faceTo(A, M);
          armX = 0.2;
          cs = bs; cw = bw; cy = 1.9;
          show = true;
        } else if (p < b4) {
          // Tip the waste into the chamber; the bin comes back empty.
          const k = (p - b3) / T_DUMP;
          bs = mouthS; bw = mouthW; phi = 0;             // face the airlock (+w)
          armX = -0.8 * Math.sin(k * Math.PI);
          cs = mouthS; cw = lerp(mouthW, mouthW + 1.0, smooth(k));
          cy = 1.9 + Math.sin(k * Math.PI) * 0.9;
          spin = k * 1.8;
          show = true; full = k < 0.5;
        } else if (p < b5) {
          // Carry the emptied bin round to the return belt.
          const k = smooth((p - b4) / T_BACK);
          bs = lerp(M.s, R.s, k); bw = lerp(M.w, R.w, k);
          phi = faceTo(M, R);
          armX = 0.2;
          cs = bs; cw = bw; cy = 1.9;
          show = true; full = false;
        } else if (p < b6) {
          // The empty bin slides down the sloped belt and into the floor hole.
          const k = smooth((p - b5) / T_CHUTE);
          bs = retS; bw = retW; phi = faceTo(R, A);
          armX = 0.4;
          cy = lerp(1.1, -1.4, k);
          spin = k * 1.2;
          show = k < 0.85; full = false;
        } else {
          // Drive back to the intake for the next bin.
          const k = smooth((p - b6) / T_HOME);
          bs = lerp(R.s, A.s, k); bw = lerp(R.w, A.w, k);
          phi = faceTo(R, A);
        }

        place(bot, bs, bw);
        bot.rotateY(phi);

        arm.rotation.x = armX + Math.sin(t * 1.6) * 0.03;
        eye.rotation.y = Math.sin(t * 0.9) * 0.5;
        beacon.material.emissiveIntensity = (active ? 1.7 : 0.5) + Math.sin(t * 6) * 0.6;

        cube.visible = show && started;
        if (cube.visible) {
          place(cube, cs, cw, RING_R - cy);
          cube.rotateY(spin);
          cube.rotateX(spin * 0.5);
          cube.scale.setScalar(CUBE_SCALE);
          cube.userData.pile.visible = full;
        }
        if (cube.userData.lamp) {
          cube.userData.lamp.material.emissiveIntensity = 1.0 + Math.sin(t * 5) * 0.6;
        }
      });
    }

    const l = new THREE.PointLight(0xffb060, 0.6, 90, 2);
    l.position.set(Math.cos(Math.PI * 1.75) * (RING_R - 10), Math.sin(Math.PI * 1.75) * (RING_R - 10), 0);
    group.add(l);
  }

  // ---- Knock-spring integration -----------------------------------------
  function updateKnocks(dt, car) {
    for (const k of knocks) {
      if (car && k.radius > 0.01) {
        const ds = wrapS(k.s - car.s);
        const dz = k.w - car.w;
        const d = Math.hypot(ds, dz);
        if (d < k.radius + 2.2) {
          const inv = 1 / (d + 0.4);
          const push = (6 / k.mass) * dt;
          k.vx += ds * inv * push;
          k.vz += dz * inv * push;
        }
      }
      k.vx += -k.dx * 14 * dt - k.vx * 4 * dt;
      k.vz += -k.dz * 14 * dt - k.vz * 4 * dt;
      k.dx += k.vx * dt;
      k.dz += k.vz * dt;
      const l = Math.hypot(k.dx, k.dz);
      const max = 2.0;
      if (l > max) { k.dx *= max / l; k.dz *= max / l; }
      k.node.position.set(k.bx + k.dx, k.by, k.bz + k.dz);
    }
  }

  // The hanging vines are SOLID props, not a decorative swing trigger. Each vine
  // hangs from a FIXED point on the ceiling and swings about it like a real
  // pendulum - the anchor itself never moves. Driving into one parts it around
  // the car: the club is thrown across the lane (always AWAY from the car) and
  // batted along the car's heading, then swings back to hang plumb. The car is
  // solid to it, so the returning club bounces off rather than passing through.
  // The car only feels drag while its body is actually on top of a club, so the
  // curtain never slows you from a distance.
  const VINE_CONTACT = 2.4;   // (s,w) distance at which a club touches the car
  const VINE_SHOVE_MAX = 7.0; // how far the club may be swung off straight-down
                              // (safely inside the shortest stem's 7.4 reach)
  const _vineDown = new THREE.Vector3(0, -1, 0);   // a vine hanging plumb
  const _vineDir = new THREE.Vector3();            // where the club actually points
  function updateVines(dt, t, car) {
    const hasCar = !!(car && car.speed !== undefined);
    for (const v of vines) {
      const hs0 = Math.sin(v.ang) * v.len;   // the club's own swing offset along s
      if (hasCar) {
        // Where the club actually hangs right now (anchor + swing), so a car
        // already pushing one along keeps contact.
        const vs = v.s + hs0;
        const vw = v.w + v.dw;
        const ds = wrapS(vs - car.s);
        const dw = vw - car.w;
        const dist = Math.hypot(ds, dw);
        if (dist < VINE_CONTACT) {
          const speed = Math.abs(car.speed || 0);
          const square = 1 - dist / VINE_CONTACT;             // 0 at the edge, 1 dead-centre
          const grit = 0.85 + (v.phase / TWO_PI) * 0.3;        // a little per-vine variation
          // Outward normal: from the car THROUGH the club, so the vine is always
          // thrown AWAY from the car, whichever side it hangs on. A dead-centre
          // hit picks a side off the vine's own phase so it never jitters about
          // zero - and always parts ACROSS the lane, the way a car slices through.
          let ns, nw;
          if (dist > 1e-4) { ns = ds / dist; nw = dw / dist; }
          else { ns = 0; nw = v.phase < Math.PI ? 1 : -1; }
          const push = (8 + speed * 1.6) * (0.4 + square) * grit;
          // The s-part drives the pendulum (angular), the w-part the cross swing.
          v.vel += (ns * push / v.len) * dt;
          v.vw += nw * push * dt;
          // Bat the club along the way the car is going, and ring it aside.
          const dir = Math.sign(car.speed || 0) || Math.sign(ds) || 1;
          v.vel += (dir * (0.8 + speed * 1.1) * (0.4 + square) * grit / v.len) * dt;
          car.speed *= Math.max(0, 1 - 0.5 * dt);   // drag, only while actually raking
        }
      }
      // The club swings on its pendulum about the fixed anchor: restore to plumb,
      // softly along s, a touch stiffer across the lane, both lightly damped so
      // the vine recovers visibly.
      v.vel += -v.ang * 9 * dt - v.vel * 1.15 * dt;
      v.ang += v.vel * dt;
      if (v.ang > 1.15) v.ang = 1.15;
      else if (v.ang < -1.15) v.ang = -1.15;
      v.vw += -v.dw * 20 * dt - v.vw * 5.5 * dt;
      v.dw += v.vw * dt;

      // Never let the club be swung further than the stem can reach.
      const hs = Math.sin(v.ang) * v.len;
      const reach = Math.hypot(hs, v.dw);
      if (reach > VINE_SHOVE_MAX) {
        const k = VINE_SHOVE_MAX / reach;
        v.ang = Math.asin(clampUnit((hs * k) / v.len));
        v.dw *= k;
      }

      // ---- Hard stop: the vine is a SOLID prop, never a ghost. If the swing is
      // carrying the club back through the car it stops dead on the car's surface
      // and BOUNCES off, so the car can never be inside a vine. This runs LAST so
      // it always wins: no clamp below can pull the club back inside the car.
      if (hasCar) {
        const clubS = Math.sin(v.ang) * v.len;
        const px = clubS - wrapS(car.s - v.s);
        const py = v.dw - (car.w - v.w);
        const dist = Math.hypot(px, py);
        if (dist < VINE_CONTACT) {
          let ns, nw;
          if (dist > 1e-4) { ns = px / dist; nw = py / dist; }
          else { ns = 0; nw = v.phase < Math.PI ? 1 : -1; }
          // Put the club exactly on the surface (swing angle + cross offset).
          const clubS2 = wrapS(car.s - v.s) + ns * VINE_CONTACT;
          v.ang = Math.asin(clampUnit(clubS2 / v.len));
          v.dw = (car.w - v.w) + nw * VINE_CONTACT;
          // Reflect the inward swing velocity about the surface normal: a damped
          // bounce, not a pass-through.
          const vsS = v.vel * v.len;
          const vn = vsS * ns + v.vw * nw;
          if (vn < 0) { v.vel -= (1.6 * vn * ns) / v.len; v.vw -= 1.6 * vn * nw; }
        }
      }

      // Render: the anchor is FIXED; the whole vine pivots so its club tip lands
      // at (swing, cross). Built as a quaternion so both axes compose cleanly and
      // the top never drifts.
      const hsR = Math.sin(v.ang) * v.len + Math.sin(t * 1.1 + v.phase) * 0.05 * v.len;
      const hwR = v.dw + Math.sin(t * 0.9 + v.phase * 1.3) * 0.04 * v.len;
      let drop = v.len * v.len - hsR * hsR - hwR * hwR;
      if (drop < 0.04) drop = 0.04;
      _vineDir.set(hsR, -Math.sqrt(drop), hwR).normalize();
      v.node.quaternion.setFromUnitVectors(_vineDown, _vineDir);
    }
  }

  function update(dt, t, car) {
    state.hazardsOff = Math.max(0, state.hazardsOff - dt);
    for (const d of dynamics) d(dt, t, car);
    if (crane) crane.spinBeacon(t);
    // Hazard gating: while the override is active, live hazards read as off.
    const off = state.hazardsOff > 0;
    for (const z of zones) {
      z.off = off && (z.type === 'plasma' || z.type === 'geyser' || z.type === 'compactor' || z.type === 'tractor' || z.type === 'tug');
    }
    updateKnocks(dt, car);
    updateVines(dt, t, car);
  }

  return {
    group,
    zones,
    knocks,
    vines,
    state,
    crane,
    decon,
    trashBot,
    update,
    mapFeatures: [],
  };
}
