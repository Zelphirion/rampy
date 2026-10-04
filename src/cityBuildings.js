import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { nearestRoadDistance } from './cityRoads.js';
import { outwardYaw } from './modules/heading.js';
import { addKnockable } from './physics.js';

// ===== The City Buildings =====
// The twelve landmark buildings that give the city its character, in place of
// the old field of identical brown boxes. Each is a real structure rather than
// a labelled cube: City Hall has a colonnade under a Capitol dome, the fire
// station has two bay doors rolled up into their hoods, the bank has a brass
// vault door you can see through its glazing, the school has a bell-and-clock
// tower over its doors, the power substation is fenced and transformer-striped,
// and so on.
//
// ---- Authoring convention ----
// Every builder works in LOCAL space: the origin sits at the middle of the
// building's footprint on the ground, and the FRONT faces +Z.
// `addCityBuildings` then drops the group at a world centre and turns it by a
// compass `face` (N = +Z, E = +X, S = -Z, W = -X). Because those are all
// quarter turns, a collider's world AABB is just its local half-extents with
// halfW/halfD swapped for the E/W facings — see `placeCollider`.
//
// A builder returns `{ group, colliders }` where each collider is a local rect
// `{ x, z, halfW, halfD, h }`; `h` is the rideable roof height, and the game
// adds its own +0.3 roof lip on top (see buildingTopAt in main.js). A collider
// tagged `fire: true` becomes a target for the flame lizard and the fire engine,
// which is how the burning-building effects are kept locked to a real roof.

// ============================================================================
// Materials
// ============================================================================
// The city is a night scene (see the fog in main.js), so anything that should
// read as lit from inside carries an emissive term. Everything else is plain
// rough standard material, which keeps the whole set cheap to render.
const M = {
  // Masonry
  limestone: new THREE.MeshStandardMaterial({ color: 0xd9d3c4, roughness: 0.85 }),
  limestoneDark: new THREE.MeshStandardMaterial({ color: 0xbdb5a4, roughness: 0.88 }),
  granite: new THREE.MeshStandardMaterial({ color: 0x8d8b86, roughness: 0.9 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x9b9c96, roughness: 0.95 }),
  concreteDark: new THREE.MeshStandardMaterial({ color: 0x6f716c, roughness: 0.95 }),
  whiteStucco: new THREE.MeshStandardMaterial({ color: 0xf2f1ea, roughness: 0.8 }),
  brickRed: new THREE.MeshStandardMaterial({ color: 0x9c4a38, roughness: 0.92 }),
  brickDark: new THREE.MeshStandardMaterial({ color: 0x74372c, roughness: 0.92 }),
  // Roofs and trim
  shingle: new THREE.MeshStandardMaterial({ color: 0x3a3e49, roughness: 0.95 }),
  shingleWarm: new THREE.MeshStandardMaterial({ color: 0x59463a, roughness: 0.95 }),
  flatRoof: new THREE.MeshStandardMaterial({ color: 0x53565c, roughness: 0.95 }),
  tar: new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 1 }),
  trimWhite: new THREE.MeshStandardMaterial({ color: 0xf6f5ef, roughness: 0.7 }),
  // Joinery
  wood: new THREE.MeshStandardMaterial({ color: 0x8a6136, roughness: 0.85 }),
  woodDark: new THREE.MeshStandardMaterial({ color: 0x54381f, roughness: 0.85 }),
  door: new THREE.MeshStandardMaterial({ color: 0x6b4026, roughness: 0.8 }),
  // Rear-elevation dressing. A service door reads as a flat dark hole in the
  // wall at any distance, which is exactly what a blank elevation needs.
  doorDark: new THREE.MeshStandardMaterial({ color: 0x2b2622, roughness: 0.85 }),
  ventDark: new THREE.MeshStandardMaterial({ color: 0x3c4148, roughness: 0.6, metalness: 0.4 }),
  stonePale: new THREE.MeshStandardMaterial({ color: 0xb9b3a6, roughness: 0.9 }),
  // Metal
  metal: new THREE.MeshStandardMaterial({ color: 0x8f96a0, roughness: 0.4, metalness: 0.7 }),
  metalDark: new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.5, metalness: 0.6 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.3, metalness: 0.85 }),
  // Fire station
  bayRed: new THREE.MeshStandardMaterial({ color: 0xb8231b, roughness: 0.55 }),
  // Glass + light
  windowLit: new THREE.MeshStandardMaterial({
    color: 0xffe9b8, emissive: 0xffcf7a, emissiveIntensity: 0.85, roughness: 0.25, metalness: 0.1,
  }),
  windowCool: new THREE.MeshStandardMaterial({
    color: 0x9fd4ff, emissive: 0x3a6f9c, emissiveIntensity: 0.7, roughness: 0.2, metalness: 0.2,
  }),
  storefront: new THREE.MeshStandardMaterial({
    color: 0xfff0cc, emissive: 0xffd489, emissiveIntensity: 1.15, roughness: 0.15, metalness: 0.1,
  }),
  // Emissive accents (several of these are animated — see blinkers)
  alarmRed: new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff1500, emissiveIntensity: 2.2, roughness: 0.3 }),
  signRed: new THREE.MeshStandardMaterial({ color: 0xff5a4a, emissive: 0xd41a00, emissiveIntensity: 1.5, roughness: 0.4 }),
  signGreen: new THREE.MeshStandardMaterial({ color: 0x66ffa8, emissive: 0x18c46a, emissiveIntensity: 1.4, roughness: 0.4 }),
  signAmber: new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xff9500, emissiveIntensity: 1.5, roughness: 0.4 }),
  medicalRed: new THREE.MeshStandardMaterial({ color: 0xd8232a, emissive: 0x8e0d12, emissiveIntensity: 0.35, roughness: 0.7 }),
  // Ground surfaces
  asphalt: new THREE.MeshStandardMaterial({ color: 0x2e3136, roughness: 1 }),
  paintWhite: new THREE.MeshStandardMaterial({ color: 0xe8e8e0, roughness: 0.9 }),
  // Planting
  hedge: new THREE.MeshStandardMaterial({ color: 0x2f6b34, roughness: 1 }),
  hedgeLight: new THREE.MeshStandardMaterial({ color: 0x3f8a42, roughness: 1 }),
  soil: new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 1 }),
  pot: new THREE.MeshStandardMaterial({ color: 0xa9603c, roughness: 0.9 }),
  // Misc
  cardboard: new THREE.MeshStandardMaterial({ color: 0xb08a5c, roughness: 0.95 }),
  warning: new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.6, emissive: 0x5a4400, emissiveIntensity: 0.4 }),
  porcelain: new THREE.MeshStandardMaterial({ color: 0xe9edf0, roughness: 0.4 }),
};

// Anything that pulses or blinks, driven by updateCityBuildings(t). Each entry
// is { light } or { mat, base, amp, speed, phase }; the driven value becomes
// base + amp * sin(t * speed + phase).
const blinkers = [];

// Set by houseStandard() in the open bay's own local space, then exported to the
// world by houseGarageTrigger() once the layout's origin and facing are known.
// This is the brown-roofed house's OPEN BAY. The grey-roofed house-with-garage
// next door used to set it, when its roller door was the way into the house; that
// door is shut and empty now, and the house is entered through the open bay.
let houseGarageLocal = null;

// That same open bay's slot in LAYOUT, filled in by addCityBuildings so the
// trigger can be rotated out of local space once its origin and facing are known.
let houseGarageEntry = null;

// Compass facing -> yaw. Every builder puts its front on local +Z, so this is
// the only mapping needed to drop a group into the world, and placeCollider
// uses the same table to rotate its colliders.
const FACE_YAW = { N: 0, E: Math.PI / 2, S: Math.PI, W: -Math.PI / 2 };

// ============================================================================
// Geometry cache
// ============================================================================
// A city this detailed is thousands of little boxes, and Three.js caches
// nothing for us — every BoxGeometry(0.4, 0.4, 0.4) call would allocate its own
// vertex buffers. Keying on the rounded dimensions collapses almost all of that
// onto a handful of shared buffers.
const geoCache = new Map();
function cached(key, make) {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
}
const boxGeo = (w, h, d) => cached(`b${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d));
const cylGeo = (rt, rb, h, seg) => cached(`c${rt}|${rb}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
const sphGeo = (r) => cached(`s${r}`, () => new THREE.SphereGeometry(r, 10, 8));
const coneGeo = (r, h, seg) => cached(`k${r}|${h}|${seg}`, () => new THREE.ConeGeometry(r, h, seg));
// A 4-sided cone, used as a hip / pyramid roof cap. The 45° turn puts its four
// faces on the diagonals, so scaling x/z to the footprint gives a true hip.
const hipGeo = () => cached('hip', () => {
  const c = new THREE.CylinderGeometry(0, 1, 1, 4, 1);
  c.rotateY(Math.PI / 4);
  return c;
});

// ============================================================================
// Primitive helpers
// ============================================================================
// Sizes are FULL dimensions and the position is the CENTRE, which is how the
// rest of the project authors geometry (see addRamps in map.js).
function box(parent, w, h, d, x, y, z, material, cast = true) {
  const m = new THREE.Mesh(boxGeo(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function cyl(parent, rt, rb, h, x, y, z, material, seg = 12, cast = true) {
  const m = new THREE.Mesh(cylGeo(rt, rb, h, seg), material);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function sph(parent, r, x, y, z, material, cast = true) {
  const m = new THREE.Mesh(sphGeo(r), material);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function cone(parent, r, h, x, y, z, material, seg = 10, cast = true) {
  const m = new THREE.Mesh(coneGeo(r, h, seg), material);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
// A 4-sided pyramid scaled to a footprint, apex up, base sitting on y = 0 of
// its own group.
function hip(parent, w, d, rise, material) {
  const m = new THREE.Mesh(hipGeo(), material);
  m.scale.set((w / 2) * Math.SQRT2, rise, (d / 2) * Math.SQRT2);
  m.position.y = rise / 2;
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// A flat quad. PlaneGeometry faces +Z, so `ry` turns it onto any of the four
// walls; flatPanel lays it face-up for signage and painted road markings.
function panel(parent, w, h, x, y, z, ry, material) {
  const m = new THREE.Mesh(cached(`p${w}|${h}`, () => new THREE.PlaneGeometry(w, h)), material);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function flatPanel(parent, w, d, x, y, z, material) {
  const m = panel(parent, w, d, x, y, z, 0, material);
  m.rotation.x = -Math.PI / 2;
  return m;
}

// ============================================================================
// Architecture helpers
// ============================================================================

// A row of window panes across one wall. `face` is a local compass direction,
// `spread` the total width the row covers, `y` the pane centre height. Panes sit
// just proud of the wall so they read as glazing rather than decals. `centre`
// slides the row sideways along the wall, for glazing that has to dodge a door.
function windowRow(parent, face, y, spread, count, paneW, paneH, material, centre = 0) {
  for (let i = 0; i < count; i++) {
    const t = centre + (count === 1 ? 0 : (i / (count - 1) - 0.5) * spread);
    if (face === 'N' || face === 'S') {
      panel(parent, paneW, paneH, t, y, face === 'N' ? 0.07 : -0.07, face === 'N' ? 0 : Math.PI, material);
    } else {
      panel(parent, paneW, paneH, face === 'E' ? 0.07 : -0.07, y, t, face === 'E' ? Math.PI / 2 : -Math.PI / 2, material);
    }
  }
}

// A stack of window rows on one wall — the workhorse for every two- and
// three-storey building here.
function windowGrid(parent, face, { rows, y0, rowH, spread, count, paneW, paneH, material }) {
  for (let r = 0; r < rows; r++) windowRow(parent, face, y0 + r * rowH, spread, count, paneW, paneH, material);
}

// A projecting cornice / string course: a thin slab slightly wider than the wall
// it caps. Cheap, and it is most of what stops a box reading as a box.
function cornice(parent, w, d, y, h, overhang, material) {
  return box(parent, w + overhang * 2, h, d + overhang * 2, 0, y, 0, material);
}

// A flat roof: a dark tar deck inside a raised parapet lip all the way round.
function flatRoof(parent, w, d, y, parapetH, overhang, material) {
  box(parent, w + overhang, 0.3, d + overhang, 0, y, 0, M.tar);
  const t = 0.28;
  box(parent, w + overhang, parapetH, t, 0, y + parapetH / 2, (d + overhang) / 2 - t / 2, material);
  box(parent, w + overhang, parapetH, t, 0, y + parapetH / 2, -(d + overhang) / 2 + t / 2, material);
  box(parent, t, parapetH, d + overhang - t * 2, (w + overhang) / 2 - t / 2, y + parapetH / 2, 0, material);
  box(parent, t, parapetH, d + overhang - t * 2, -(w + overhang) / 2 + t / 2, y + parapetH / 2, 0, material);
}

// A gabled (pitched) roof whose ridge runs along Z, rising `rise` above its
// eaves. Two slanted slabs plus a triangular gable end at each X edge, so there
// is no daylight gap between the wall top and the roof.
function gableRoof(parent, w, d, rise, overhang, material) {
  const halfD = d / 2 + overhang;
  const slopeLen = Math.hypot(halfD, rise);
  const angle = Math.atan2(rise, halfD);
  const slab = boxGeo(w + overhang * 2, 0.22, slopeLen);
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(slab, material);
    m.position.set(0, rise / 2, s * halfD / 2);
    m.rotation.x = s * angle;
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
  }
  box(parent, w + overhang * 2, 0.22, 0.34, 0, rise + 0.05, 0, material);   // ridge cap
  // Gable ends. The triangle lives in the YZ plane at each X edge, so it is
  // authored wide in shape-X (its depth after the quarter turn) and rotated on.
  const tri = new THREE.Shape();
  tri.moveTo(-halfD, 0);
  tri.lineTo(halfD, 0);
  tri.lineTo(0, rise);
  tri.closePath();
  const gable = new THREE.ExtrudeGeometry(tri, { depth: 0.22, bevelEnabled: false });
  gable.translate(0, 0, -0.11);
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(gable, material);
    m.position.set(s * (w / 2 + overhang), 0, 0);
    m.rotation.y = Math.PI / 2;
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
  }
}

// A run of steps climbing toward the front (+Z), starting at z0 and working
// back. Returns the z of the top tread.
function frontSteps(parent, width, steps, rise, run, z0, material) {
  for (let i = 0; i < steps; i++) {
    const h = (i + 1) * rise;
    box(parent, width, h, run, 0, h / 2, z0 - i * run, material, i >= steps - 3);
  }
  return z0 - (steps - 1) * run;
}

// A classical column: base, slightly tapered shaft, capital.
function column(parent, x, z, h, r, material) {
  cyl(parent, r * 1.35, r * 1.35, h * 0.05, x, h * 0.025, z, material, 10);
  cyl(parent, r * 0.92, r, h * 0.9, x, h * 0.5, z, material, 12);
  cyl(parent, r * 1.4, r * 1.0, h * 0.05, x, h * 0.975, z, material, 10);
}

// A low clipped hedge: a run of overlapping spheres.
function hedge(parent, x, z, len, axis, r = 0.55) {
  const n = Math.max(2, Math.round(len / (r * 1.3)));
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1) - 0.5) * len;
    sph(parent, r * (0.9 + (i % 2) * 0.2), axis === 'x' ? x + t : x, r * 0.72, axis === 'x' ? z : z + t,
      i % 2 ? M.hedge : M.hedgeLight, false);
  }
}

// A round planter with a small shrub, for porches and front steps.
function pottedPlant(parent, x, z, scale = 1) {
  cyl(parent, 0.3 * scale, 0.24 * scale, 0.34 * scale, x, 0.17 * scale, z, M.pot, 8);
  sph(parent, 0.32 * scale, x, 0.52 * scale, z, M.hedgeLight, false);
  sph(parent, 0.2 * scale, x + 0.12 * scale, 0.7 * scale, z - 0.06 * scale, M.hedge, false);
}

// A soft shrub cluster, used to soften building bases and corners.
function cornerBush(parent, x, z, r = 0.7) {
  sph(parent, r, x, r * 0.8, z, M.hedge, false);
  sph(parent, r * 0.7, x + r * 0.5, r * 0.6, z + r * 0.4, M.hedgeLight, false);
}

// A small planted bed: a soil box with a scatter of blooms.
function flowerBed(parent, x, z, w, d) {
  box(parent, w, 0.22, d, x, 0.11, z, M.soil, false);
  const cols = [0xe85d75, 0xf2c200, 0xffffff, 0xd94fe0];
  for (let i = 0; i < 7; i++) {
    const bx = x + (((i * 37) % 100) / 100 - 0.5) * w * 0.8;
    const bz = z + (((i * 61) % 100) / 100 - 0.5) * d * 0.8;
    const mat = cached(`bloom${cols[i % 4]}`, () => new THREE.MeshStandardMaterial({ color: cols[i % 4], roughness: 0.8 }));
    sph(parent, 0.11, bx, 0.26, bz, mat, false);
  }
}

// A bike rack hoop — reused by the apartments, the school and the library.
function bikeHoop(parent, x, z, ry = Math.PI / 2) {
  const m = new THREE.Mesh(
    cached('bikeHoop', () => new THREE.TorusGeometry(0.35, 0.05, 6, 12, Math.PI)),
    M.metal
  );
  m.position.set(x, 0.4, z);
  m.rotation.y = ry;
  parent.add(m);
  return m;
}

// A chain-link fence panel: posts plus a translucent diamond-weave plane. The
// weave is a canvas texture with alpha, so a compound reads as enclosed without
// paying for hundreds of thin bars.
let chainLinkTex = null;
function chainLinkMaterial() {
  if (!chainLinkTex) {
    const S = 64;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g2 = c.getContext('2d');
    g2.strokeStyle = 'rgba(200,205,210,0.85)';
    g2.lineWidth = 2;
    // Two sets of diagonals make the classic diamond weave.
    for (let i = -S; i < S * 2; i += 16) {
      g2.beginPath(); g2.moveTo(i, 0); g2.lineTo(i + S, S); g2.stroke();
      g2.beginPath(); g2.moveTo(i, S); g2.lineTo(i + S, 0); g2.stroke();
    }
    chainLinkTex = new THREE.CanvasTexture(c);
    chainLinkTex.wrapS = chainLinkTex.wrapT = THREE.RepeatWrapping;
    chainLinkTex.colorSpace = THREE.SRGBColorSpace;
  }
  return new THREE.MeshStandardMaterial({
    map: chainLinkTex, transparent: true, alphaTest: 0.28, side: THREE.DoubleSide,
    roughness: 0.5, metalness: 0.4,
  });
}

// A straight fence run between two local points, with evenly spaced posts. Each
// run gets its own material so the weave repeat can be set to keep the diamonds
// square whatever the run length.
function chainFence(parent, x1, z1, x2, z2, h = 2.2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const n = Math.max(2, Math.round(len / 3));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    cyl(parent, 0.07, 0.07, h, x1 + dx * t, h / 2, z1 + dz * t, M.metal, 6);
  }
  const mat = chainLinkMaterial();
  mat.map = mat.map.clone();
  mat.map.needsUpdate = true;
  mat.map.repeat.set(len / 2, h / 2);
  // The weave is a PlaneGeometry: its width runs along the panel's own local X
  // and its height up local Y. Ry(theta) sends local +X to (cos, 0, -sin), so
  // to lay the panel ALONG the run we need cos = dx/len and sin = -dz/len, i.e.
  // theta = atan2(-dz, dx). Using atan2(dx, dz) instead turns every north-south
  // run by 90 degrees, so the diamonds and the posts end up crossing each other.
  const mid = new THREE.Group();
  mid.position.set((x1 + x2) / 2, h / 2, (z1 + z2) / 2);
  mid.rotation.y = Math.atan2(-dz, dx);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(len, h), mat);
  mesh.receiveShadow = true;
  mid.add(mesh);
  parent.add(mid);
  // Top rail. A cylinder is built along +Y, so it has to be laid flat onto the X
  // axis first and only then swung round to the run's direction. Three.js applies
  // an 'XYZ' euler as Rx*Ry*Rz, so the Z turn happens FIRST and takes +Y to -X;
  // the Y turn then has to carry -X onto (dx, dz), which is the angle whose cosine
  // is -dx/len and whose sine is dz/len. Anything else leaves the rail sticking
  // out sideways, at right angles to the fence it is supposed to cap.
  const rail = cyl(parent, 0.05, 0.05, len, (x1 + x2) / 2, h, (z1 + z2) / 2, M.metal, 5);
  rail.rotation.z = Math.PI / 2;
  rail.rotation.y = Math.atan2(dz, -dx);
  // Make fence knockable by heavy vehicles only (monster truck/steamroller)
  addKnockable(mid, Math.max(1, len / 2), { mode: 'topple', toppleRadius: Math.max(1, len / 2), smashOnlyBy: 'monster' });
}

// ============================================================================
// 1. City Hall
// ============================================================================
// The showpiece. A limestone civic block on a raised podium, reached by a wide
// ceremonial staircase, fronted by a full colonnade carrying an entablature and
// a pediment, and crowned by a Capitol-style dome on a windowed drum.
function cityHall() {
  const g = new THREE.Group();
  const W = 28, D = 20, BODY = 12, PODIUM = 1.3;
  const colliders = [];
  const frontZ = D / 2;

  // Podium: a wider stone base the whole thing stands on.
  box(g, W + 4, PODIUM, D + 4, 0, PODIUM / 2, 0, M.granite);
  frontSteps(g, 15, 5, PODIUM / 5, 0.55, frontZ + 2, M.limestone);

  // Main block, set back from the podium edge, with an attic storey above a
  // deep cornice.
  box(g, W, BODY, D, 0, PODIUM + BODY / 2, -0.5, M.limestone);
  cornice(g, W, D, PODIUM + BODY, 0.55, 0.7, M.limestoneDark);
  box(g, W - 2, 1.6, D - 2, 0, PODIUM + BODY + 1.35, -0.5, M.limestone);
  cornice(g, W - 2, D - 2, PODIUM + BODY + 2.45, 0.4, 0.6, M.limestoneDark);

  // Tall window bays on the front, a plainer grid on the other three walls.
  windowGrid(g, 'N', {
    rows: 2, y0: PODIUM + 4.2, rowH: 4.4, spread: W - 12,
    count: 7, paneW: 1.7, paneH: 3.1, material: M.windowLit,
  });
  for (const f of ['E', 'W', 'S']) {
    windowGrid(g, f, {
      rows: 2, y0: PODIUM + 4.4, rowH: 4.4, spread: D - 8,
      count: 5, paneW: 1.5, paneH: 2.6, material: M.windowCool,
    });
  }

  // ---- Portico: six columns under an entablature and a pediment ----
  const colH = 9.5;
  for (let i = 0; i < 6; i++) column(g, (i / 5 - 0.5) * (W - 6), frontZ + 1.1, colH, 0.52, M.trimWhite);
  box(g, W - 2, 1.3, 2.6, 0, PODIUM + colH + 0.65, frontZ + 1.1, M.trimWhite);
  box(g, W - 2, 0.35, 3.2, 0, PODIUM + colH + 1.45, frontZ + 1.1, M.trimWhite);
  const ped = new THREE.Shape();
  ped.moveTo(-(W - 2) / 2, 0);
  ped.lineTo((W - 2) / 2, 0);
  ped.lineTo(0, 2.6);
  ped.closePath();
  const pedMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(ped, { depth: 0.5, bevelEnabled: false }), M.trimWhite);
  pedMesh.position.set(0, PODIUM + colH + 1.62, frontZ + 0.85);
  pedMesh.castShadow = true;
  g.add(pedMesh);

  // ---- Dome on a windowed drum ----
  const drumY = PODIUM + BODY + 2.85;
  const drumR = 6.2;
  cyl(g, drumR, drumR + 0.25, 3.4, 0, drumY + 1.7, -0.5, M.limestone, 24);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    panel(g, 1.5, 2.1, Math.sin(a) * (drumR + 0.06), drumY + 1.8, -0.5 + Math.cos(a) * (drumR + 0.06), a, M.windowLit);
  }
  const drumCornice = cornice(g, drumR * 2, drumR * 2, drumY + 3.4, 0.45, 0.7, M.limestoneDark);
  drumCornice.position.z = -0.5;
  const dome = new THREE.Mesh(
    cached('capitolDome', () => new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2)),
    new THREE.MeshStandardMaterial({ color: 0x6d7f92, roughness: 0.45, metalness: 0.35 })
  );
  dome.scale.setScalar(drumR * 0.98);
  dome.position.set(0, drumY + 3.6, -0.5);
  dome.castShadow = true;
  g.add(dome);
  // Lantern and finial on top.
  const domeTop = drumY + 3.6 + drumR * 0.98;
  cyl(g, 1.5, 1.7, 1.5, 0, domeTop + 0.4, -0.5, M.trimWhite, 14);
  cone(g, 1.1, 2.2, 0, domeTop + 2.2, -0.5, M.brass, 10);
  sph(g, 0.4, 0, domeTop + 3.5, -0.5, M.brass);

  // Beds and lamp standards flanking the ceremonial stair.
  const lampMat = cached('lampGlow', () => new THREE.MeshStandardMaterial({
    color: 0xfff2c2, emissive: 0xffd98a, emissiveIntensity: 1.5, roughness: 0.4,
  }));
  for (const s of [-1, 1]) {
    flowerBed(g, s * 10.5, frontZ + 1.2, 4, 1.4);
    cyl(g, 0.12, 0.16, 3.4, s * 13.5, PODIUM + 1.7, frontZ + 0.6, M.metalDark, 6);
    sph(g, 0.34, s * 13.5, PODIUM + 3.5, frontZ + 0.6, lampMat);
  }

  // One collider for the whole footprint. The podium is only 1.3 up, so the
  // ceremonial stair stays drivable and the collider top is the main roof.
  // Not a fire target: the dome and colonnade sit above the collider top, so
  // flames parked on this roof would be buried in the roof line.
  colliders.push({ x: 0, z: 0, halfW: (W + 4) / 2, halfD: (D + 4) / 2, h: PODIUM + BODY + 0.55 });
  return { group: g, colliders, h: PODIUM + BODY };
}

// ============================================================================
// 2. Fire Station
// ============================================================================
// Two-storey red brick whose ground floor is genuinely HOLLOW: two big apparatus
// bays, both drive-in (the fire engine starts parked nose-out in the right-hand
// one and reverses back into it after every call), an entrance on the pier
// between them, a radio mast and a blinking red alarm light on the flat roof.
//
// Two things here are load-bearing gameplay, not decoration:
//   * The bays are open in the COLLIDER set as well as in the mesh set. A
//     footprint collider would seal the ground floor back up (collider blocking
//     is 2D — it ignores height entirely), so the station reports thin wall
//     colliders only, exactly like the open house garage next door. The cost is
//     that the second-storey roof is not a drivable surface, which is the same
//     trade the house garage already makes.
//   * The building IS a `fire: true` target, and it burns like anything else.
//     An earlier version opted out, on the grounds that a station on fire while
//     its own truck is parked inside reads as a bug. That was true of the first
//     attempt, which used a solid footprint collider: the 2D blocking test
//     ignores height, so the rect sealed the apparatus bays and the engine could
//     not get out to answer the call it was sitting in. The fire collider is now
//     `soft`, so it feeds the fire/lizard/engine queries without blocking the
//     car, and the engine backs out of the bay, turns on the apron and goes to
//     fight the fire in its own station. Which is the joke.
const FIRE_STATION = { W: 20, D: 14, BODY: 7, GROUND: 3.9, WALL: 0.5, BAY_W: 7.4, BAY_H: 3.6, BAY_X: 4.9 };
// Where the truck parks, in LOCAL space (x = bay centre, z = nose just inside
// the door). Read back out through cityFireStationBay() once the group has been
// dropped into the world and turned.
let fireStationBayLocal = null;
// The same spot in WORLD space, filled in by addCityBuildings. Null until the
// city is built, and null again if the station ever drops out of the layout.
let fireStationBayWorld = null;

function fireStation() {
  const g = new THREE.Group();
  const { W, D, BODY, GROUND, WALL, BAY_W, BAY_H, BAY_X } = FIRE_STATION;
  const colliders = [];
  const frontZ = D / 2;
  const wallZ = frontZ - WALL / 2;      // centre plane of the front wall
  const UP = BODY - GROUND;             // the second storey, the main mass

  // ---- Second storey: the main mass, so measureWalls() dresses the rears ----
  box(g, W, UP, D, 0, GROUND + UP / 2, 0, M.brickRed);
  cornice(g, W, D, BODY, 0.4, 0.5, M.limestone);
  flatRoof(g, W, D, BODY + 0.4, 0.75, 0.5, M.brickDark);

  // ---- Ground floor: a shell, not a block ----
  // Back wall runs the full width; the side walls tuck inside it.
  box(g, W, GROUND, WALL, 0, GROUND / 2, -(D / 2 - WALL / 2), M.brickRed);
  for (const s of [-1, 1]) {
    box(g, WALL, GROUND, D - WALL * 2, s * (W / 2 - WALL / 2), GROUND / 2, 0, M.brickRed);
  }
  // Front piers: the two outer corners and the entrance pier between the bays.
  // Whatever is left over is the aperture you drive through, so the pier widths
  // fall out of BAY_X / BAY_W rather than being authored twice.
  const pierOuter = (W / 2) - (BAY_X + BAY_W / 2);          // 1.4
  for (const s of [-1, 1]) {
    box(g, pierOuter, GROUND, WALL, s * (BAY_X + BAY_W / 2 + pierOuter / 2), GROUND / 2, wallZ, M.brickRed);
  }
  box(g, BAY_X - BAY_W / 2, GROUND, WALL, 0, GROUND / 2, wallZ, M.brickRed);   // entrance pier
  // Lintel band over each aperture — the brick that closes the wall off above
  // the opening. No collider: the bays are full-height slots as far as driving
  // is concerned, which is the whole point of them being open.
  for (const s of [-1, 1]) {
    box(g, BAY_W, GROUND - BAY_H, WALL, s * BAY_X, BAY_H + (GROUND - BAY_H) / 2, wallZ, M.brickRed);
  }

  // ---- Bay doors, coiled in their hoods above the openings ----
  for (const s of [-1, 1]) {
    const bx = s * BAY_X;
    // Dark reveal set back inside the aperture, so the bay reads as a hole in a
    // wall rather than a hole in a void.
    box(g, BAY_W, BAY_H, 0.3, bx, BAY_H / 2, frontZ - WALL - 0.15, M.woodDark, false);
    cyl(g, 0.34, 0.34, BAY_W, bx, BAY_H + 0.34, frontZ + 0.1, M.bayRed, 10).rotation.z = Math.PI / 2;
    box(g, BAY_W + 0.6, 0.24, 0.4, bx, BAY_H + 0.74, frontZ + 0.12, M.metalDark);
    for (const g2 of [-1, 1]) {
      box(g, 0.18, BAY_H, 0.34, bx + g2 * (BAY_W / 2 + 0.1), BAY_H / 2, frontZ + 0.06, M.metalDark, false);
    }
    // A red "APPARATUS BAY" strip light over the lintel, one per bay.
    box(g, BAY_W - 1.0, 0.16, 0.14, bx, GROUND - 0.28, frontZ - WALL + 0.1, M.signRed, false);
  }

  // ---- Bay interiors ----
  // Painted apron inside each bay so the open floor is not a grey void, and a
  // bay outline marking where the engine belongs.
  flatPanel(g, W - WALL * 2, D - WALL * 2, 0, 0.03, 0, M.concrete);
  for (const s of [-1, 1]) {
    const bx = s * BAY_X;
    // Ceiling lamp panel (the underside of the second storey, lit).
    flatPanel(g, BAY_W - 1.2, D - 3.0, bx, GROUND - 0.06, 0, lampMatOf());
    // Painted bay box: two rails and a stop line, the way a depot floor is marked.
    for (const e of [-1, 1]) flatPanel(g, 0.14, D - 2.4, bx + e * 2.4, 0.05, 0, M.paintWhite);
    flatPanel(g, 4.8, 0.16, bx, 0.05, -(D / 2 - 2.0), M.signAmber);
    // A real light per bay, so the open doors throw light onto the forecourt.
    const bayLight = new THREE.PointLight(0xfff0cf, 5.5, 22, 2);
    bayLight.position.set(bx, GROUND - 0.5, 1.0);
    g.add(bayLight);
  }

  // Right bay = the engine's home. It gets the hose reel, the lockers and the
  // bench; the left bay is dressed as a second appliance bay with a spare wheel
  // and a hose cart, so the two do not read as copy-paste.
  const HX = BAY_X;
  const backZ = -(D / 2 - WALL) + 0.1;
  // Locker bank along the back wall of the engine bay.
  for (let i = 0; i < 5; i++) {
    box(g, 0.85, 1.9, 0.6, HX - 2.6 + i * 1.0, 0.95, backZ - 0.3, i % 2 ? M.metalDark : M.bayRed, false);
    box(g, 0.7, 0.06, 0.1, HX - 2.6 + i * 1.0, 1.55, backZ - 0.02, M.metal, false);
  }
  // Hose reel on the pier side of the engine bay, fed from the drying hatch.
  cyl(g, 0.72, 0.72, 0.34, HX + 2.6, 1.9, backZ - 0.3, M.signRed, 14).rotation.x = Math.PI / 2;
  cyl(g, 0.2, 0.2, 0.5, HX + 2.6, 1.9, backZ - 0.3, M.metalDark, 10).rotation.x = Math.PI / 2;
  box(g, 1.2, 1.2, 0.24, HX + 2.6, 3.2, backZ - 0.42, M.metalDark, false);   // drying hatch
  // Work bench with a vice.
  box(g, 3.0, 0.14, 0.8, HX, 0.95, backZ - 0.4, M.wood, false);
  for (const s of [-1, 1]) box(g, 0.14, 0.9, 0.7, HX + s * 1.35, 0.47, backZ - 0.4, M.woodDark, false);
  box(g, 0.4, 0.34, 0.3, HX + 1.1, 1.19, backZ - 0.4, M.metalDark, false);
  // Breathing-air cylinders racked on the other pier.
  for (let i = 0; i < 4; i++) cyl(g, 0.19, 0.19, 1.5, HX - 3.5, 0.78, -3.0 + i * 0.5, M.brass, 8, false);
  // Left bay: a spare wheel leaning on the wall and a hose cart.
  const tyreMat = cached('spareTyre', () => new THREE.MeshStandardMaterial({ color: 0x1e1e20, roughness: 1 }));
  cyl(g, 0.8, 0.8, 0.4, -BAY_X + 2.7, 0.9, backZ - 0.5, tyreMat, 16, false).rotation.z = Math.PI / 2;
  box(g, 1.6, 0.5, 1.0, -BAY_X - 1.4, 0.45, backZ - 0.6, M.metalDark, false);
  for (const s of [-1, 1]) cyl(g, 0.22, 0.22, 0.16, -BAY_X - 1.4 + s * 0.6, 0.22, backZ - 0.6, M.metalDark, 10, false).rotation.z = Math.PI / 2;
  cyl(g, 0.55, 0.55, 0.9, -BAY_X - 2.8, 0.45, -1.5, M.signRed, 12, false).rotation.x = Math.PI / 2;

  // The engine's parking spot, in local space. `x`/`z` is nose-first just inside
  // the door; `roadZ` is the centre line of the street it works from; and
  // roadMinX/roadMaxX are that street's own extent, so when the engine is out
  // among the buildings it stays on tarmac instead of wandering onto grass.
  //
  // The station is at world z -39.5 facing north, and south-main runs z -30..-16,
  // so its centre line is world z -23 — local z 16.5. roadMinX/roadMaxX are the
  // x range of that street, in WORLD x, which for a north-facing building is the
  // same axis its local x runs along. The far end is 88 rather than the street's
  // real 90 because world x wraps at +/-90: the engine works its position
  // through wrapCoordX, and clamping to exactly 90 would snap it across the
  // world seam to -90.
  fireStationBayLocal = { x: HX, z: frontZ - 5.1, roadZ: 16.5, roadMinX: -45, roadMaxX: 88 };

  // Upper-floor sash windows, with one over each bay.
  windowGrid(g, 'N', { rows: 1, y0: BODY - 1.8, rowH: 1, spread: W - 4, count: 5, paneW: 1.5, paneH: 1.7, material: M.windowLit });
  for (const f of ['E', 'W', 'S']) {
    windowGrid(g, f, { rows: 1, y0: BODY - 1.8, rowH: 1, spread: D - 4, count: 3, paneW: 1.4, paneH: 1.7, material: M.windowCool });
  }

  // ---- Entrance with the alarm light above it (on the pier between the bays) ----
  box(g, 2.0, 2.6, 0.35, 0, 1.3, frontZ + 0.05, M.woodDark, false);
  box(g, 1.4, 2.1, 0.16, 0, 1.05, frontZ + 0.22, M.door, false);
  box(g, 3.2, 0.22, 1.2, 0, 2.9, frontZ + 0.5, M.metalDark);
  for (const s of [-1, 1]) cyl(g, 0.07, 0.07, 2.8, s * 1.3, 1.4, frontZ + 1.0, M.metalDark, 6);
  const alarm = sph(g, 0.34, 0, 3.35, frontZ + 0.45, M.alarmRed, false);
  alarm.scale.y = 0.8;
  cyl(g, 0.16, 0.16, 0.3, 0, 3.1, frontZ + 0.45, M.metalDark, 8, false);
  const alarmLight = new THREE.PointLight(0xff2a10, 6, 16, 2);
  alarmLight.position.set(0, 3.4, frontZ + 0.6);
  g.add(alarmLight);
  blinkers.push({ light: alarmLight, base: 2, amp: 7, speed: 5.5, phase: 0 });
  panel(g, 5.2, 0.9, 0, 4.6, frontZ + 0.12, 0, M.signRed);

  // ---- Radio mast: four splayed legs with cross bracing, which reads as a
  // lattice mast at distance for a fraction of a solid cylinder's geometry ----
  const mastX = W / 2 - 2.2, mastZ = -D / 2 + 2.2, mastH = 7.5;
  box(g, 1.6, 0.5, 1.6, mastX, BODY + 0.9, mastZ, M.concreteDark);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = cyl(g, 0.07, 0.09, mastH, mastX + sx * 0.4, BODY + 1.15 + mastH / 2, mastZ + sz * 0.4, M.metal, 5);
      leg.rotation.z = -sx * 0.035;
      leg.rotation.x = sz * 0.035;
    }
  }
  for (let i = 0; i < 6; i++) {
    const y = BODY + 1.6 + i * 1.15;
    for (const sz of [-1, 1]) box(g, 0.9, 0.07, 0.07, mastX, y, mastZ + sz * 0.4, M.metal, false);
    for (const sx of [-1, 1]) box(g, 0.07, 0.07, 0.9, mastX + sx * 0.4, y, mastZ, M.metal, false);
  }
  const mastTop = BODY + 1.15 + mastH;
  cyl(g, 0.05, 0.05, 1.6, mastX, mastTop + 0.8, mastZ, M.metal, 5);
  sph(g, 0.2, mastX, mastTop + 1.6, mastZ, M.alarmRed, false);
  const beaconLight = new THREE.PointLight(0xff3020, 4, 12, 2);
  beaconLight.position.set(mastX, mastTop + 1.6, mastZ);
  g.add(beaconLight);
  blinkers.push({ light: beaconLight, base: 1, amp: 5, speed: 3.2, phase: 1.4 });

  // Hydrants out front, one per bay, because it is a fire station.
  for (const s of [-1, 1]) {
    cyl(g, 0.16, 0.2, 0.8, s * (BAY_X + BAY_W / 2 + pierOuter / 2), 0.4, frontZ + 1.4, M.signRed, 8);
    sph(g, 0.19, s * (BAY_X + BAY_W / 2 + pierOuter / 2), 0.85, frontZ + 1.4, M.signRed, false);
  }
  // Tarmac apron running out of both bays and on to the kerb. It is 10 deep, not
  // 6, so it reaches local z = 17 — which is world z -29.5, just past the
  // south-main kerb at z -30. The engine's bay is at local x 4.9, well off to
  // the side of the doorway ribbon map.js lays down the front door, so without
  // this the run from the bay to the street would cross bare grass for the last
  // few metres. A station apron runs to the road anyway.
  flatPanel(g, W - 2, 10.0, 0, 0.02, frontZ + 5.0, M.asphalt);
  for (const s of [-1, 1]) {
    flatPanel(g, 0.14, 9.0, s * (BAY_X + BAY_W / 2 - 0.4), 0.04, frontZ + 4.5, M.paintWhite);
  }

  // Colliders: the shell only. There is deliberately no collider over the bays,
  // over the interior floor, or over the second-storey roof — a single 2D
  // footprint rect would wall the ground floor back up and there is no height
  // term in the blocking test to let you drive underneath one.
  for (const s of [-1, 1]) {
    colliders.push({ x: s * (W / 2 - WALL / 2), z: 0, halfW: WALL / 2, halfD: D / 2, h: BODY });
  }
  colliders.push({ x: 0, z: -(D / 2 - WALL / 2), halfW: W / 2, halfD: WALL / 2, h: BODY });
  for (const s of [-1, 1]) {
    colliders.push({
      x: s * (BAY_X + BAY_W / 2 + pierOuter / 2), z: wallZ,
      halfW: pierOuter / 2, halfD: WALL / 2, h: BODY,
    });
  }
  colliders.push({ x: 0, z: wallZ, halfW: (BAY_X - BAY_W / 2) / 2, halfD: WALL / 2, h: BODY });

  // The station is a `fire: true` target after all — it is a building, and
  // buildings in this city burn.
  //
  // It carries `soft` so it does NOT block driving. Every other fire target is
  // a plain solid footprint, but a solid footprint here would seal the two
  // apparatus bays shut: collision is 2D and ignores height, so a rect over the
  // whole 20 x 14 ground floor would wall the bays back up and the engine could
  // never drive out of its own garage. `soft` is already the established way to
  // ship a collider that feeds a query without blocking the car (staircase
  // steps, ceilings), and cityFireSpots reads the footprint off the same list,
  // so the fire still lands exactly over the building.
  colliders.push({ x: 0, z: 0, halfW: W / 2, halfD: D / 2, h: BODY + 0.5, fire: true, soft: true });

  return { group: g, colliders, h: BODY };
}

// ============================================================================
// 3. Bank
// ============================================================================
// A heavy stone block: full-height pillars marching across the front, glazing
// between them, and a great brass vault door visible right through that
// glazing. An ATM is recessed into the flank wall.
function bank() {
  const g = new THREE.Group();
  const W = 20, D = 14, BODY = 11;
  const colliders = [];
  const frontZ = D / 2;

  box(g, W, BODY, D, 0, BODY / 2, 0, M.limestoneDark);
  // A heavier base course and a deep cornice: the two things that make stone
  // read as stone rather than as concrete.
  box(g, W + 0.6, 1.4, D + 0.6, 0, 0.7, 0, M.granite);
  cornice(g, W, D, BODY - 0.8, 0.5, 0.6, M.granite);
  cornice(g, W, D, BODY, 0.7, 0.9, M.limestone);
  flatRoof(g, W, D, BODY + 0.7, 0.8, 0.7, M.limestoneDark);

  // ---- Front: pillars with glazed bays between them ----
  const bays = 5;
  const pillarW = 1.1;
  const pitch = (W - 2) / bays;
  for (let i = 0; i <= bays; i++) {
    const x = -(W - 2) / 2 + i * pitch;
    box(g, pillarW, BODY - 1.4, 1.0, x, 1.4 + (BODY - 1.4) / 2, frontZ + 0.4, M.limestone);
    box(g, pillarW + 0.5, 0.4, 1.3, x, 1.6, frontZ + 0.45, M.granite);
    box(g, pillarW + 0.5, 0.5, 1.3, x, BODY - 1.1, frontZ + 0.45, M.granite);
  }
  for (let i = 0; i < bays; i++) {
    const x = -(W - 2) / 2 + (i + 0.5) * pitch;
    panel(g, pitch - pillarW - 0.3, BODY - 4.2, x, 1.4 + (BODY - 1.4) / 2, frontZ + 0.12, 0, M.storefront);
    // Decorative glazing bars, so it reads as a divided-light window.
    box(g, 0.09, BODY - 4.2, 0.1, x, 1.4 + (BODY - 1.4) / 2, frontZ + 0.2, M.brass, false);
    box(g, pitch - pillarW - 0.3, 0.09, 0.1, x, 1.4 + (BODY - 1.4) / 2, frontZ + 0.2, M.brass, false);
  }

  // ---- The vault door, seen through the middle bay ----
  const vaultY = 4.0;
  box(g, 5.4, 6.2, 0.4, 0, vaultY, frontZ - 1.4, M.metalDark, false);      // recess behind the glass
  cyl(g, 1.7, 1.7, 0.5, 0, vaultY, frontZ - 1.0, M.brass, 20).rotation.x = Math.PI / 2;
  // The wheel: a rim with four spokes — the detail that says "vault".
  const rim = new THREE.Mesh(cached('vaultRim', () => new THREE.TorusGeometry(0.9, 0.11, 8, 24)), M.metalDark);
  rim.position.set(0, vaultY, frontZ - 0.72);
  g.add(rim);
  for (let i = 0; i < 4; i++) {
    box(g, 1.7, 0.13, 0.13, 0, vaultY, frontZ - 0.72, M.metalDark, false).rotation.z = (i / 4) * Math.PI;
  }
  // Hinge blocks around the door's edge.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    box(g, 0.3, 0.3, 0.3, Math.cos(a) * 1.85, vaultY + Math.sin(a) * 1.85, frontZ - 0.85, M.metalDark, false);
  }

  // Side and rear fenestration: tall, narrow, evenly spaced.
  for (const f of ['E', 'W']) {
    windowGrid(g, f, { rows: 2, y0: 4.4, rowH: 4.2, spread: D - 3, count: 5, paneW: 1.1, paneH: 2.8, material: M.windowCool });
  }
  windowGrid(g, 'S', { rows: 2, y0: 4.4, rowH: 4.2, spread: W - 4, count: 7, paneW: 1.1, paneH: 2.8, material: M.windowCool });

  // ---- ATM recessed into the +X flank ----
  box(g, 0.5, 2.3, 1.5, W / 2 - 0.1, 1.5, -3.2, M.metalDark, false);
  box(g, 0.3, 1.1, 0.9, W / 2 + 0.05, 1.7, -3.2, M.signGreen, false);
  box(g, 0.55, 0.16, 1.0, W / 2 + 0.12, 1.2, -3.2, M.metal, false);
  panel(g, 1.0, 0.4, W / 2 + 0.12, 2.45, -3.2, Math.PI / 2, M.signAmber);

  frontSteps(g, 6, 3, 0.18, 0.4, frontZ + 0.7, M.granite);
  pottedPlant(g, -3.4, frontZ + 1.4, 1.3);
  pottedPlant(g, 3.4, frontZ + 1.4, 1.3);

  colliders.push({ x: 0, z: 0, halfW: (W + 0.6) / 2, halfD: (D + 0.6) / 2, h: BODY + 0.7, fire: true });
  return { group: g, colliders, h: BODY + 0.7 };
}

// ============================================================================
// 4. Corner Convenience Store / Bodega
// ============================================================================
// Single storey, flat roof, and a fully glazed shopfront with bright promo
// posters hung inside the glass — which is what a bodega window actually looks
// like from the street. An HVAC unit sits on the roof, the bins round the side.
function bodega() {
  const g = new THREE.Group();
  const W = 12, D = 10, BODY = 4.5;
  const colliders = [];
  const frontZ = D / 2;

  box(g, W, BODY, D, 0, BODY / 2, 0, M.whiteStucco);
  // The painted band under the roofline that corner stores are always banded with.
  box(g, W + 0.15, 0.9, D + 0.15, 0, BODY - 0.75, 0, M.signGreen, false);
  flatRoof(g, W, D, BODY, 0.6, 0.45, M.trimWhite);

  // ---- Shopfront: one big glass plane broken by slim mullions ----
  const glassH = 2.9;
  box(g, W - 0.8, glassH, 0.16, 0, 0.2 + glassH / 2, frontZ + 0.02, M.storefront, false);
  for (let i = 0; i <= 4; i++) {
    box(g, 0.16, glassH, 0.26, -(W - 0.8) / 2 + i * ((W - 0.8) / 4), 0.2 + glassH / 2, frontZ + 0.06, M.trimWhite, false);
  }
  box(g, W - 0.8, 0.2, 0.3, 0, 0.2 + glassH, frontZ + 0.06, M.trimWhite, false);    // transom
  box(g, W - 0.8, 0.22, 0.3, 0, 0.24, frontZ + 0.06, M.trimWhite, false);           // stall riser
  // Promotional posters on the inside of the upper glass.
  const posters = [M.signRed, M.signAmber, M.signGreen];
  for (let i = 0; i < 3; i++) panel(g, 1.5, 1.1, (i - 1) * 2.6, 0.2 + glassH - 0.85, frontZ - 0.14, Math.PI, posters[i]);
  // Hanging neon sign under the fascia.
  box(g, 5.0, 0.5, 0.12, 0, 3.55, frontZ + 0.35, M.signAmber, false);
  // Glazing on both returns, so the corner reads as glazed from either street.
  panel(g, 3.2, glassH, W / 2 + 0.02, 0.2 + glassH / 2, 1.6, Math.PI / 2, M.storefront);
  panel(g, 2.4, glassH, -W / 2 - 0.02, 0.2 + glassH / 2, 2.4, -Math.PI / 2, M.storefront);

  // ---- Roof HVAC ----
  box(g, 2.2, 1.1, 1.8, -3, BODY + 1.15, -1.5, M.metal, false);
  cyl(g, 0.55, 0.55, 0.16, -3, BODY + 1.78, -1.5, M.metalDark, 12, false);
  box(g, 1.0, 0.5, 1.0, 2.5, BODY + 0.85, -2.5, M.metal, false);
  cyl(g, 0.16, 0.16, 1.0, 4.2, BODY + 1.1, 1.0, M.metalDark, 8, false);

  // ---- Side dumpster area ----
  const dx = -W / 2 - 1.6;
  box(g, 2.4, 1.2, 1.3, dx, 0.6, -2.4, M.hedge, true);
  box(g, 2.5, 0.14, 1.4, dx, 1.24, -2.4, M.hedgeLight, false);
  box(g, 0.9, 0.8, 0.9, dx + 0.2, 0.4, -0.6, M.metalDark, true);
  for (let i = 0; i < 3; i++) sph(g, 0.3, dx - 1.5 + i * 0.7, 0.3, -4.2, M.cardboard, false);
  // Bollards and a newspaper rack by the door.
  for (const s of [-1, 1]) cyl(g, 0.13, 0.13, 0.9, s * 1.2, 0.45, frontZ + 1.3, M.metalDark, 8, false);
  box(g, 0.7, 0.9, 0.5, 3.4, 0.45, frontZ + 0.9, M.metalDark, false);

  colliders.push({ x: 0, z: 0, halfW: W / 2, halfD: D / 2, h: BODY });
  // The bin area is solid too, so you cannot drive through the dumpster.
  colliders.push({ x: dx + 0.1, z: -2, halfW: 1.6, halfD: 2.2, h: 1.2 });
  return { group: g, colliders, h: BODY };
}

// ============================================================================
// 5. Gas Station
// ============================================================================
// An open-air canopy on four columns over two fuel-pump islands, with the
// cashier office bolted onto one end and an ice chest standing outside it.
// The canopy roof is deliberately NOT a collider — you drive under it. What
// blocks you is the furniture: the four columns, the office block, the kiosk and
// the price pylon, plus the pump cabinets themselves. The cabinets are marked
// aiOnly, so traffic cars steer round them but the player glides straight
// through, which is what makes the forecourt forgiving to drive.
function gasStation() {
  const g = new THREE.Group();
  const CW = 16, CD = 12, CANOPY_Y = 4.6;
  const OX = -10, OW = 6, OD = 8, OH = 3.6;
  const colliders = [];
  const cx = 3;   // canopy centre in local x

  // ---- Canopy ----
  box(g, CW, 0.7, CD, cx, CANOPY_Y, 0, M.trimWhite);
  box(g, CW + 0.8, 0.35, CD + 0.8, cx, CANOPY_Y - 0.5, 0, M.signRed, false);   // fascia band
  box(g, CW - 1.2, 0.14, CD - 1.2, cx, CANOPY_Y - 0.42, 0, M.metalDark, false); // soffit
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      cyl(g, 0.28, 0.34, CANOPY_Y - 0.7, cx + sx * (CW / 2 - 1.2), (CANOPY_Y - 0.7) / 2, sz * (CD / 2 - 1.2), M.metal, 10);
    }
  }
  // Canopy downlights on the soffit.
  const lampMat = cached('canopyLamp', () => new THREE.MeshStandardMaterial({
    color: 0xfff4d0, emissive: 0xffd98a, emissiveIntensity: 1.6, roughness: 0.4,
  }));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) flatPanel(g, 1.1, 1.1, cx + sx * 3.6, CANOPY_Y - 0.52, sz * 2.6, lampMat);
  }
  // The price pylon, the way a filling station announces itself.
  const px = cx + CW / 2 - 0.8, pz = -CD / 2 - 0.6;
  box(g, 0.7, 6.5, 0.5, px, 3.25, pz, M.trimWhite);
  panel(g, 1.9, 2.4, px, 5.0, pz + 0.3, 0, M.signRed);
  panel(g, 1.5, 0.5, px, 2.4, pz + 0.3, 0, M.signAmber);

  // ---- Two fuel-pump islands, two pumps each ----
  for (const s of [-1, 1]) {
    const ix = cx + s * 3.6;
    box(g, 1.5, 0.28, 7.4, ix, 0.14, 0, M.concrete, false);
    for (const pz2 of [-2, 2]) {
      box(g, 0.9, 1.9, 0.7, ix, 1.2, pz2, M.whiteStucco, false);
      box(g, 0.95, 0.5, 0.75, ix, 1.85, pz2, M.signRed, false);
      panel(g, 0.5, 0.3, ix, 1.9, pz2 + 0.38, 0, M.signGreen);
      cyl(g, 0.06, 0.06, 1.1, ix + 0.55, 1.1, pz2, M.metalDark, 6, false);
      sph(g, 0.12, ix + 0.55, 0.55, pz2, M.metalDark, false);
    }
  }
  // Bollards protecting the pump ends.
  for (const s of [-1, 1]) {
    for (const sz of [-1, 1]) cyl(g, 0.14, 0.14, 0.95, cx + s * (CW / 2 - 0.6), 0.48, sz * (CD / 2 - 0.6), M.signAmber, 8, false);
  }

  // ---- Cashier office ----
  box(g, OW, OH, OD, OX, OH / 2, 0, M.limestone);
  box(g, OW + 0.5, 0.3, OD + 0.5, OX, OH + 0.15, 0, M.flatRoof);
  // Serving window with a shutter hood, facing the pumps.
  box(g, 0.3, 1.2, 3.0, OX + OW / 2 + 0.02, 2.0, 0, M.storefront, false);
  box(g, 0.8, 0.2, 3.4, OX + OW / 2 + 0.35, 2.75, 0, M.trimWhite, false);
  panel(g, 2.2, 1.8, OX - 1.2, 1.9, OD / 2 + 0.03, 0, M.storefront);
  box(g, 1.0, 2.1, 0.2, OX + 1.8, 1.05, OD / 2 + 0.05, M.door, false);

  // ---- Ice chest outside the office ----
  box(g, 1.3, 0.9, 0.9, OX - 2.2, 0.45, OD / 2 + 0.9, M.porcelain, false);
  box(g, 1.35, 0.1, 0.95, OX - 2.2, 0.95, OD / 2 + 0.9, M.signAmber, false);
  box(g, 0.5, 0.6, 0.2, OX - 0.9, 0.3, OD / 2 + 1.1, M.porcelain, false);

  // ---- Drive-in forecourt -------------------------------------------------
  // Two slabs of asphalt butted edge to edge, so the whole station is ONE
  // continuous drivable surface instead of a pad in front of the roof with
  // grass under the pumps:
  //     front apron  z   4..12   (meets the south-main kerb at z = 12)
  //     rear loop    z -14..4    (runs back under the canopy and round the far
  //                               side, dead-ending clear of the substation)
  // The apron reaches the office door at z = 4, so the shopfront is on tarmac
  // too rather than on a lawn.
  //
  // The route through the station is the 5.7-wide gap BETWEEN the two pump
  // islands, local x 0.15..5.85. It is the only genuinely car-width run in the
  // building: the four canopy columns sit outboard of the islands, and the
  // lane the old comment used to advertise (office to first island) is pinched
  // to 2.75 and 2.0 by those columns, which is narrower than a car. In off the
  // street, up between the pumps under the roof, round the back of the canopy
  // and out again without reversing.
  const FZ0 = 4, FZ1 = 12, FX0 = -13.5, FX1 = 11;        // front apron, local
  const RZ0 = -14, RZ1 = 4, RX0 = -7, RX1 = 11;         // rear loop, local
  const LX0 = 0.15, LX1 = 5.85;                         // through lane, local x
  const fx = (FX0 + FX1) / 2, fw = FX1 - FX0;
  const fz = (FZ0 + FZ1) / 2, fd = FZ1 - FZ0;
  const rx = (RX0 + RX1) / 2, rw = RX1 - RX0;
  const rz = (RZ0 + RZ1) / 2, rd = RZ1 - RZ0;
  box(g, fw, 0.12, fd, fx, 0.06, fz, M.asphalt, false);
  box(g, rw, 0.12, rd, rx, 0.06, rz, M.asphalt, false);
  // Painted edge line where the apron meets the street.
  flatPanel(g, fw - 0.6, 0.18, fx, 0.125, FZ1 - 0.5, M.paintWhite);
  // Lane edge lines and a dashed centre line, but ONLY out on the open apron in
  // front of the canopy. Under the roof the tarmac is left completely plain:
  // paint running the length of the forecourt turns a filling station into a
  // striped car park, and a real forecourt is bare tarmac once you are under
  // cover. So the paint stops at the canopy's front columns (local z = 6) and
  // the whole rear loop is bare asphalt too.
  for (const lx of [LX0, LX1]) flatPanel(g, 0.16, 5.4, lx, 0.125, 9.3, M.paintWhite);
  for (let z = 10.6; z > 6; z -= 2.6) flatPanel(g, 0.16, 1.4, (LX0 + LX1) / 2, 0.125, z, M.paintWhite);
  // Parking bays: three across the office frontage, two out by the vacuum point.
  for (let i = 0; i < 3; i++) flatPanel(g, 0.16, 4.6, -11.6 + i * 3.2, 0.125, 8.8, M.paintWhite);
  for (let i = 0; i < 2; i++) flatPanel(g, 0.16, 4.6, 7.6 + i * 3.2, 0.125, 8.8, M.paintWhite);
  // Hatched keep-clear strip in front of the office door (local x -8.2). The
  // hatch is 2.2 deep, so its centre has to sit at z >= 7.1 for the whole strip
  // to clear the canopy edge at z=6 — at 6.6 the first 0.5 hung under the roof.
  for (let i = 0; i < 5; i++) flatPanel(g, 0.14, 2.2, -9.2 + i * 0.85, 0.125, 7.4, M.paintWhite);
  // Vacuum point: a small kiosk with a hose bay, out by the east kerb, clear of
  // the through lane.
  box(g, 1.6, 2.4, 1.6, 10.0, 1.2, 10.6, M.whiteStucco, false);
  box(g, 1.8, 0.2, 1.8, 10.0, 2.5, 10.6, M.signRed, false);
  panel(g, 1.2, 0.7, 10.0, 1.5, 9.77, Math.PI, M.storefront);
  // Bollards either side of the two lane mouths, and two apron lamps.
  for (const s of [-1, 1]) cyl(g, 0.16, 0.16, 1.0, fx + s * (fw / 2 - 0.6), 0.5, FZ1 - 0.8, M.signAmber, 8, false);
  for (const s of [-1, 1]) {
    cyl(g, 0.12, 0.16, 5.2, fx + s * (fw / 2 - 1.2), 2.6, 10.8, M.metal, 8);
    box(g, 0.9, 0.3, 0.5, fx + s * (fw / 2 - 1.2), 5.3, 10.6, M.metalDark, false);
    flatPanel(g, 0.8, 0.8, fx + s * (fw / 2 - 1.2), 5.14, 10.6, lampMat);
  }

  // Colliders. The canopy is a ROOF on four slim columns, so it must not be a
  // solid block: the old single 16x12 collider made the whole forecourt
  // undriveable, which is the opposite of a filling station. Only the columns
  // and the pump islands stop you, and the deck itself is a low, thin collider
  // you can drive under - exactly like the fire station's canopy.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      colliders.push({
        x: cx + sx * (CW / 2 - 1.2), z: sz * (CD / 2 - 1.2),
        halfW: 0.45, halfD: 0.45, h: CANOPY_Y,
      });
    }
  }
  for (const s of [-1, 1]) {
    // The pump islands are aiOnly, exactly like the mine pit: traffic steers
    // around them, but the player car glides straight over the concrete pad and
    // the cabinets without snagging. A filling station you can get wedged on is
    // worse than useless, and the old hard colliders trapped the nose between a
    // cabinet and a column with no way to recover. Passing over them costs
    // nothing and you simply drive out the far side.
    colliders.push({ x: cx + s * 3.6, z: -2, halfW: 0.7, halfD: 0.55, h: 1.9, aiOnly: true });
    colliders.push({ x: cx + s * 3.6, z: 2, halfW: 0.7, halfD: 0.55, h: 1.9, aiOnly: true });
  }
  colliders.push({ x: OX, z: 0, halfW: OW / 2, halfD: OD / 2, h: OH });
  // Forecourt furniture, so a car bumps the kiosk and the price pylon instead of
  // driving through them. Both stand outboard of the through lane (x 0.15..5.85).
  colliders.push({ x: 10.0, z: 10.6, halfW: 0.8, halfD: 0.8, h: 2.4 });          // vacuum kiosk
  colliders.push({ x: px, z: pz, halfW: 0.35, halfD: 0.3, h: 6.5 });              // price pylon
  return { group: g, colliders, h: CANOPY_Y };
}

// ============================================================================
// 6. Hospital
// ============================================================================
// A white-and-glass slab. The red cross panel is the one that does the work —
// it goes on a short projecting sign box at the entrance, big enough to read
// from across the plaza, with a matching cross in the paving below it. An
// ambulance canopy projects over the set-down bay.
function hospital() {
  const g = new THREE.Group();
  const W = 20, D = 14, BODY = 12;
  const colliders = [];
  const frontZ = D / 2;

  // Podium block, then a glazed upper slab that overhangs it.
  box(g, W, 5.5, D, 0, 2.75, 0, M.whiteStucco);
  cornice(g, W, D, 5.5, 0.3, 0.4, M.concrete);
  box(g, W - 0.8, BODY - 5.5, D - 0.8, 0, 5.5 + (BODY - 5.5) / 2, 0, M.whiteStucco);
  // Two ward floors of glazing on the upper slab, not one tall band: the gap
  // between the rows is what makes it read as a storey height.
  for (const f of ['N', 'S', 'E', 'W']) {
    const isNS = f === 'N' || f === 'S';
    const spread = isNS ? W - 2.4 : D - 2.4;
    const count = isNS ? 8 : 5;
    windowGrid(g, f, {
      rows: 2, y0: 6.9, rowH: 3.2, spread, count,
      paneW: (spread / count) * 0.8, paneH: 1.9, material: M.windowCool,
    });
  }
  // Glazed stair tower, so the end of the slab is not a blank white wall.
  windowGrid(g, 'W', { rows: 3, y0: 6.6, rowH: 1.8, spread: D - 4, count: 3, paneW: 1.2, paneH: 1.1, material: M.windowLit });
  // Glass corner columns, so the slab reads as a pavilion rather than a box.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) box(g, 0.35, BODY - 5.5, 0.35, sx * (W / 2 - 0.4), 5.5 + (BODY - 5.5) / 2, sz * (D / 2 - 0.4), M.concrete, false);
  }
  box(g, W + 0.6, 0.5, D + 0.6, 0, BODY + 0.25, 0, M.trimWhite);
  // Plant enclosure and vents on the roof.
  box(g, 4.5, 1.3, 3.5, -5, BODY + 1.15, -1.5, M.metal, false);
  for (let i = 0; i < 3; i++) box(g, 1.2, 0.7, 1.2, 4 + i * 2, BODY + 0.85, -2.5, M.metal, false);
  box(g, 2.0, 0.25, 2.0, 5, BODY + 0.62, 2.5, M.metalDark, false);

  // ---- Podium glazing -----------------------------------------------------
  // The ground floor is what people actually walk past, so it gets real
  // windows on three sides. The front (local S) is left to the entrance and the
  // ambulance bay, and only glazed in the two gaps between them.
  for (const f of ['N', 'E', 'W']) {
    const isNS = f === 'N';
    const spread = isNS ? W - 2.4 : D - 2.4;
    const count = isNS ? 8 : 5;
    windowGrid(g, f, {
      rows: 2, y0: 1.9, rowH: 2.3, spread, count,
      paneW: (spread / count) * 0.78, paneH: 1.35, material: M.windowCool,
    });
  }
  // Front gaps only: two panes west of the entrance, two in the strip between
  // the entrance and the ambulance bay.
  windowRow(g, 'S', 1.9, 3.4, 2, 1.2, 1.35, M.windowCool, -8.1);
  windowRow(g, 'S', 1.9, 3.2, 2, 1.2, 1.35, M.windowLit, 0.1);
  // Spandrel band between the two podium rows, tying the glazing together. It
  // stops short of the entrance recess on the front so it does not spear it.
  box(g, W - 1.2, 0.22, 0.12, 0, 3.05, frontZ + 0.04, M.trimWhite, false);
  box(g, 0.12, 0.22, D - 1.2, W / 2 + 0.04, 3.05, 0, M.trimWhite, false);
  box(g, 0.12, 0.22, D - 1.2, -W / 2 - 0.04, 3.05, 0, M.trimWhite, false);

  // ---- Entrance: recessed doors under a projecting red-cross sign box ----
  const entX = -4;
  box(g, 4.6, 3.0, 0.5, entX, 1.5, frontZ - 0.1, M.metalDark, false);          // recess
  for (const s of [-1, 1]) box(g, 1.9, 2.5, 0.16, entX + s * 1.0, 1.25, frontZ - 0.28, M.windowCool, false);
  box(g, 5.4, 0.3, 1.8, entX, 3.25, frontZ + 0.7, M.trimWhite);                 // canopy
  for (const s of [-1, 1]) cyl(g, 0.09, 0.09, 3.1, entX + s * 2.4, 1.55, frontZ + 1.4, M.metal, 6);
  // The cross panel: two crossed bars, on both faces of the sign box.
  const signBox = 2.0;
  for (const side of [1, -1]) {
    const zf = frontZ + 1.5 + side * 0.12;
    box(g, signBox * 0.32, signBox, 0.1, entX, 4.5, zf, M.medicalRed, false);
    box(g, signBox, signBox * 0.32, 0.1, entX, 4.5, zf, M.medicalRed, false);
  }
  box(g, 1.0, 0.9, 0.9, entX, 4.5, frontZ + 1.5, M.medicalRed, false);
  // The same cross inlaid in the paving, so it reads from above too.
  flatPanel(g, 3.4, 1.1, entX, 0.03, frontZ + 4.2, M.medicalRed);
  flatPanel(g, 1.1, 3.4, entX, 0.035, frontZ + 4.2, M.medicalRed);
  // Painted bay markings either side of the cross.
  for (const s of [-1, 1]) flatPanel(g, 0.14, 5.0, entX + s * 3.0, 0.03, frontZ + 4.0, M.paintWhite);

  // ---- Ambulance canopy over the set-down bay ----
  const bayX = 5.6, bayZ = frontZ + 4.6;
  box(g, 7.2, 0.3, 6.4, bayX, 3.3, bayZ, M.trimWhite);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    cyl(g, 0.16, 0.18, 3.15, bayX + sx * 3.2, 1.58, bayZ + sz * 2.8, M.metal, 8);
  }
  for (const sx of [-1, 1]) flatPanel(g, 1.2, 1.2, bayX + sx * 2.0, 3.13, bayZ, lampMatOf());
  // Bay outline painted on the ground.
  flatPanel(g, 7.0, 0.16, bayX, 0.03, bayZ - 3.0, M.paintWhite);
  flatPanel(g, 7.0, 0.16, bayX, 0.03, bayZ + 3.0, M.paintWhite);
  // Wheeled stretcher and two bollards.
  box(g, 1.9, 0.12, 0.7, bayX - 2.2, 0.9, bayZ + 1.6, M.porcelain, false);
  for (const sx of [-1, 1]) sph(g, 0.14, bayX - 2.2 + sx * 0.8, 0.16, bayZ + 1.6, M.metalDark, false);
  for (const sx of [-1, 1]) cyl(g, 0.15, 0.15, 1.0, bayX + sx * 3.9, 0.5, bayZ + 3.4, M.signAmber, 8, false);

  colliders.push({ x: 0, z: 0, halfW: W / 2, halfD: D / 2, h: BODY + 0.5, fire: true });
  // The canopy over the bay needs its own collider, otherwise you land through it.
  colliders.push({ x: bayX, z: bayZ, halfW: 3.6, halfD: 3.2, h: 3.3 });
  return { group: g, colliders, h: BODY + 0.5 };
}

// Shared soffit-lamp material for canopies.
function lampMatOf() {
  return cached('canopyLamp', () => new THREE.MeshStandardMaterial({
    color: 0xfff4d0, emissive: 0xffd98a, emissiveIntensity: 1.6, roughness: 0.4,
  }));
}

// ============================================================================
// 7. Suburban House — with attached open garage
// ============================================================================
// A gabled house with a lean-to garage whose front wall is genuinely missing,
// so you can drive straight in. The garage keeps its own pitched roof, and the
// interior is dressed as somewhere you would actually want to spend time: a
// pegboard of tools nailed to the back wall, a workbench under a clamp lamp,
// and a warm work light at the far end that pulls you in off the street. Drive
// to the back of it and the level takes you inside the house.
//
// GW is 7 rather than the 5 it used to be. Collider blocking is 2D, so a garage
// 5 wide minus its 0.4 walls left a 4.6 slot for a 4.4-diameter collision
// circle — 0.1 either side, which is not drivable without grinding both walls.
// At 7 the interior is 6.6 and the car has a unit of slack each way.
function houseWithGarage() {
  const g = new THREE.Group();
  const MAIN_X = 2.25, W = 9, D = 9, BODY = 3.4;   // main block sits right of centre
  const GW = 7, GH = 2.9;                            // garage, attached on -X
  const colliders = [];

  // ---- Main house ----
  box(g, W, BODY, D, MAIN_X, BODY / 2, 0, M.limestoneDark);
  const mainRoof = new THREE.Group();
  mainRoof.position.set(MAIN_X, BODY, 0);
  gableRoof(mainRoof, W, D, 2.3, 0.5, M.shingle);
  g.add(mainRoof);
  // A dormer, because a gable alone is a bit plain.
  box(g, 2.0, 1.4, 2.0, MAIN_X, BODY + 1.1, 0.6, M.limestoneDark, false);
  const dormerRoof = new THREE.Group();
  dormerRoof.position.set(MAIN_X, BODY + 1.8, 0.6);
  gableRoof(dormerRoof, 2.2, 2.2, 0.9, 0.3, M.shingle);
  g.add(dormerRoof);
  panel(g, 0.9, 0.9, MAIN_X, BODY + 1.2, 1.62, 0, M.windowLit);
  // Brick chimney.
  box(g, 0.9, 5.6, 0.9, MAIN_X + W / 2 - 0.8, 2.8, -D / 2 + 1.0, M.brickRed, false);
  box(g, 1.1, 0.25, 1.1, MAIN_X + W / 2 - 0.8, 5.7, -D / 2 + 1.0, M.concreteDark, false);

  // Front door, porch, and windows facing +Z.
  box(g, 1.0, 2.1, 0.16, MAIN_X + 1.5, 1.05, D / 2 + 0.02, M.door, false);
  box(g, 2.4, 0.16, 1.2, MAIN_X + 1.5, 2.3, D / 2 + 0.6, M.trimWhite, false);
  for (const s of [-1, 1]) cyl(g, 0.09, 0.09, 2.2, MAIN_X + 1.5 + s * 1.0, 1.1, D / 2 + 1.0, M.trimWhite, 6, false);
  for (const s of [-1, 1]) panel(g, 1.2, 1.2, MAIN_X + 1.5 + s * 2.4, 1.6, D / 2 + 0.03, 0, M.windowLit);
  // Driveway-side window and a rear one.
  panel(g, 1.2, 1.2, MAIN_X - 2.4, 1.6, D / 2 + 0.03, 0, M.windowLit);
  panel(g, 1.6, 1.2, MAIN_X, 1.6, -D / 2 - 0.03, Math.PI, M.windowCool);
  for (const s of [-1, 1]) panel(g, 1.1, 1.1, s === 1 ? MAIN_X + W / 2 + 0.03 : MAIN_X - W / 2 - 0.03, 1.7, 0, s * Math.PI / 2, M.windowCool);

  // ---- Attached garage: three walls, and a roller door SHUT on the front ----
  const gx = MAIN_X - W / 2 - GW / 2;
  const gBackZ = 0.3 - (D - 0.6) / 2 + 0.2;
  const gFrontZ = 0.3 + (D - 0.6) / 2;   // the shut door's face, on the street
  box(g, GW, GH, D - 0.6, gx, GH / 2, 0.3, M.limestoneDark, false);
  box(g, 0.4, GH, D - 0.6, gx - GW / 2 + 0.2, GH / 2, 0.3, M.limestoneDark, false);
  box(g, GW, GH, 0.4, gx, GH / 2, gBackZ, M.limestoneDark, false);
  // Its own low-pitch roof, leaning back to meet the main eaves.
  const gr = new THREE.Group();
  gr.position.set(gx, GH, 0.3);
  gableRoof(gr, GW + 0.4, D - 0.2, 1.1, 0.3, M.shingle);
  g.add(gr);
  // A bare concrete floor inside. There used to be a lit ceiling panel, a
  // beckoning lamp, a pegboard of tools and a workbench in here, because this
  // garage was the way into the house. It is not any more: the house is entered
  // through the brown-roofed open bay next door, and this one is shut, so there
  // is nothing in it and nothing lighting it.
  flatPanel(g, GW - 0.6, D - 1.0, gx, 0.03, 0.3, M.concrete);

  // ---- The roller door, SHUT ---------------------------------------------
  // This used to be wound up, with its three slats coiled in a hood over the
  // mouth, and it was the house entrance. It is now closed, and the three slats
  // are the same three slats hung out flat from the head to the floor. It keeps
  // its panelled style, so from the street it reads as the same door the
  // brown-roofed house has just finished putting away.
  const GDW = GW - 0.8;                 // clear width of the opening
  const gDoorTop = 2.55;                // top of the shut door
  // Header, sitting proud of the elevation across the whole mouth.
  box(g, GW, 0.5, 0.5, gx, (gDoorTop + GH) / 2, gFrontZ, M.trimWhite, false);
  // Guide rails down each side of the reveal.
  for (const s of [-1, 1]) {
    box(g, 0.22, GH - 0.3, 0.34, gx + s * (GDW / 2 + 0.11), (GH - 0.3) / 2, gFrontZ + 0.05, M.metalDark, false);
  }
  // The three slats, each a painted leaf with a band across it, hung from the
  // head down to the concrete.
  const slatH = gDoorTop / 3;
  for (let i = 0; i < 3; i++) {
    const sy = slatH * (i + 0.5);
    box(g, GDW, slatH - 0.03, 0.26, gx, sy, gFrontZ + 0.02, M.trimWhite, false);
    box(g, GDW - 0.55, 0.11, 0.1, gx, sy + slatH / 2 - 0.2, gFrontZ + 0.17, M.concrete, false);
  }
  // Weather seal brush and a threshold strip on the apron, so the opening has a
  // bottom edge instead of just stopping.
  box(g, GDW, 0.14, 0.3, gx, 0.07, gFrontZ, M.metalDark, false);
  // A padlock and a hasp on the bottom slat, matching the front door inside:
  // this one is shut because it is meant to be shut, not because it is broken.
  box(g, 0.16, 0.3, 0.2, gx + GDW / 2 - 0.5, slatH * 0.5, gFrontZ + 0.22, M.metalDark, false);
  box(g, 0.2, 0.26, 0.1, gx + GDW / 2 - 0.5, slatH * 0.5 + 0.1, gFrontZ + 0.32, M.signRed, false);
  // A lamp over the door, because it is a door somebody once used.
  box(g, 0.5, 0.16, 0.3, gx, gDoorTop + 0.75, gFrontZ + 0.2, M.metalDark, false);
  sph(g, 0.13, gx, gDoorTop + 0.62, gFrontZ + 0.24, lampMatOf(), false);

  // Painted apron and parking bay in front of the open door.
  flatPanel(g, GW - 0.4, 4.2, gx, 0.03, D / 2 + 1.6, M.asphalt);
  for (const s of [-1, 1]) flatPanel(g, 0.12, 3.6, gx + s * (GW / 2 - 0.6), 0.04, D / 2 + 1.6, M.paintWhite);
  // House number by the door.
  panel(g, 0.5, 0.3, MAIN_X + 0.75, 1.8, D / 2 + 0.05, 0, M.signAmber);

  // ---- Yard ----
  hedge(g, MAIN_X + 1.5, D / 2 + 1.4, 5.0, 'x');
  cornerBush(g, MAIN_X + W / 2 + 0.8, D / 2 - 0.6, 0.6);
  cornerBush(g, MAIN_X - W / 2 - 0.6, -D / 2 + 0.8, 0.55);
  pottedPlant(g, MAIN_X + 2.4, D / 2 + 0.9, 1.0);
  // Mailbox at the kerb.
  cyl(g, 0.07, 0.07, 1.1, MAIN_X + 3.0, 0.55, D / 2 + 5.0, M.wood, 6, false);
  box(g, 0.4, 0.3, 0.5, MAIN_X + 3.0, 1.2, D / 2 + 5.0, M.metal, false);

  // Colliders: the main house as a solid block, and the garage as a closed box.
  // The garage's front used to be left deliberately open so the drive-in gap
  // stayed drivable; now that the door is shut there is a collider across the
  // whole mouth, which is the point of a shut door. Anything that tries to drive
  // into it stops at the tarmac.
  colliders.push({ x: MAIN_X, z: 0, halfW: W / 2, halfD: D / 2, h: BODY + 0.6 });
  colliders.push({ x: gx, z: gBackZ, halfW: GW / 2, halfD: 0.2, h: GH });
  colliders.push({ x: gx - GW / 2 + 0.2, z: 0.3, halfW: 0.2, halfD: (D - 0.6) / 2, h: GH });
  colliders.push({ x: gx, z: gFrontZ, halfW: GW / 2, halfD: 0.3, h: GH });

  // No trigger is exported from here any more. `houseGarageTrigger()` reads
  // `houseGarageLocal`, which is set by the brown-roofed open bay instead - that
  // is the way into the house now, and this is a shut door on the street.
  return { group: g, colliders, h: BODY + 0.6 };
}


// ============================================================================
// 8. Suburban House — standard
// ============================================================================
// A compact gabled house with a garage door on the end wall, a dormer, a front
// path and a picket-fenced lawn. The fence is low and its gate is left open.
function houseStandard() {
  const g = new THREE.Group();
  const W = 11, D = 10, BODY = 3.6;
  // The garage here is a ROOM, not a door: an open bay in the front elevation
  // with a floor, a back wall and a ceiling that you drive into. GX/GW2/GH2
  // describe that opening. 5.5 wide is the most the 11-wide elevation gives up
  // once the front door and its two windows keep the west end, and it leaves
  // 0.55 either side of the 2.2-radius car, which is tight but drivable.
  const GX = 2.25, GW2 = 5.5, GH2 = 2.6;
  const gx0 = GX - GW2 / 2, gx1 = GX + GW2 / 2;   // opening edges in x
  const gz1 = D / 2, gz0 = 0;                    // mouth at the front, back wall at z 0
  const colliders = [];

  // The shell is built in pieces AROUND the bay void rather than as one solid
  // block, because the bay has to be a hole you can drive through: west end,
  // east end, the rear block behind the bay, and a lintel band over the mouth.
  box(g, gx0 + W / 2, BODY, D, (gx0 - W / 2) / 2, BODY / 2, 0, M.whiteStucco);
  box(g, W / 2 - gx1, BODY, D, (gx1 + W / 2) / 2, BODY / 2, 0, M.whiteStucco);
  box(g, GW2, BODY, gz0 + D / 2, GX, BODY / 2, (gz0 - D / 2) / 2, M.whiteStucco);
  box(g, GW2, BODY - GH2, 0.6, GX, GH2 + (BODY - GH2) / 2, gz1 - 0.3, M.whiteStucco);
  const roof = new THREE.Group();
  roof.position.y = BODY;
  gableRoof(roof, W, D, 2.6, 0.5, M.shingleWarm);
  g.add(roof);
  // Front dormer, over the front door rather than over the garage gable.
  box(g, 2.4, 1.5, 2.2, -3.2, BODY + 1.1, D / 2 - 1.4, M.whiteStucco, false);
  const dRoof = new THREE.Group();
  dRoof.position.set(-3.2, BODY + 1.85, D / 2 - 1.4);
  gableRoof(dRoof, 2.6, 2.4, 1.0, 0.3, M.shingleWarm);
  g.add(dRoof);
  panel(g, 1.0, 1.0, -3.2, BODY + 1.2, D / 2 - 0.28, 0, M.windowLit);

  // ---- Garage: an open bay built into the front elevation ----
  // It used to sit on the +X end wall, which meant the roller door pointed at
  // the side boundary and the only way in was on foot. Both the front door and
  // the garage now share the street elevation, so the house reads as one thing
  // addressing the road: door on the left, bay on the right, both on tarmac.
  //
  // There is no roller door here at all. It is an open garage — a room you
  // drive into — so the mouth is clear from the floor to the lintel and the bay
  // is fitted out like a workshop rather than panelled over. The grey-roofed
  // house next door is the one with the panelled door on it.
  //
  // Its own little gable, turned so the triangle faces the street.
  const gRoof = new THREE.Group();
  gRoof.position.set(GX, BODY, D / 2 - 0.6);
  gableRoof(gRoof, 5.8, 3.0, 1.2, 0.3, M.shingleWarm);
  gRoof.rotation.y = Math.PI / 2;
  g.add(gRoof);
  // Driveway apron from the bay out to the kerb, with a bay line each side.
  flatPanel(g, GW2 + 0.6, 4.4, GX, 0.03, D / 2 + 2.4, M.asphalt);
  for (const s of [-1, 1]) flatPanel(g, 0.12, 4.0, GX + s * (GW2 / 2 - 0.3), 0.04, D / 2 + 2.4, M.paintWhite);
  // A strip light over the mouth, so the bay reads as lit from the street.
  box(g, GW2 - 1.2, 0.16, 0.2, GX, GH2 - 0.2, gz1 - 0.35, lampMatOf(), false);

  // ---- The bay interior: a room, not a recess ----
  // Concrete floor, a ceiling over the void, and a back wall you can see. The
  // floor is deliberately a different material from the apron outside, because
  // "paved" and "inside" reading the same is what makes a garage look like a
  // hole cut in a wall.
  flatPanel(g, GW2 - 0.5, gz1 - gz0 - 0.3, GX, 0.04, (gz0 + gz1) / 2, M.concrete);
  flatPanel(g, GW2 - 0.4, gz1 - gz0 - 0.2, GX, GH2 - 0.06, (gz0 + gz1) / 2, lampMatOf());
  // Painted band round the inside of the bay at bumper height.
  for (const s of [-1, 1]) box(g, 0.1, 0.5, gz1 - gz0 - 0.6, GX + s * (GW2 / 2 - 0.35), 0.55, (gz0 + gz1) / 2, M.paintWhite, false);
  box(g, GW2 - 0.5, 0.5, 0.1, GX, 0.55, gz0 + 0.35, M.paintWhite, false);
  // Workbench along the back wall and a shelf above it — enough to say
  // "somebody works in here" without turning it into a showroom.
  box(g, 0.7, 0.12, 2.6, gx0 + 0.55, 0.95, gz0 + 1.5, M.wood, false);
  box(g, 0.7, 0.9, 0.12, gx0 + 0.55, 0.45, gz0 + 0.3, M.woodDark, false);
  box(g, 0.6, 0.1, 2.4, gx0 + 0.5, 2.15, gz0 + 1.5, M.woodPale, false);
  for (let i = 0; i < 3; i++) box(g, 0.4, 0.34, 0.3, gx0 + 0.5, 2.37, gz0 + 0.7 + i * 0.8, i % 2 ? M.paper : M.woodDark, false);
  // Bicycle on the far wall, hung rather than stood, so the floor stays clear
  // for the car.
  cyl(g, 0.42, 0.42, 0.1, gx1 - 0.5, 1.15, gz0 + 1.1, M.metalDark, 14, false);
  cyl(g, 0.42, 0.42, 0.1, gx1 - 0.5, 1.15, gz0 + 2.1, M.metalDark, 14, false);
  box(g, 0.08, 0.08, 1.1, gx1 - 0.5, 1.15, gz0 + 1.6, M.signRed, false);
  // Oil cans and a stack of tyres in the corner, out of the driving line.
  for (let i = 0; i < 2; i++) cyl(g, 0.16, 0.16, 0.34, gx0 + 0.5, 0.17 + i * 0.34, gz0 + 3.4, M.signRed, 8, false);
  for (let i = 0; i < 2; i++) cyl(g, 0.5, 0.5, 0.22, gx1 - 0.7, 0.12 + i * 0.24, gz0 + 3.6, M.rubber, 14, false);

  // ---- The beckoning light, and the tools it is there to light -----------
  // This bay is the way into the house now. It used to be the neighbour's job:
  // the grey-roofed house next door had a clamp lamp on a tripod at the back of
  // a dark garage and a pegboard of tools in silhouette behind it, and that was
  // the whole invitation to pull off the street. It has moved here, to the
  // brown-roofed open bay, because the house you can now get into is entered
  // through this door and no other.
  const lampX = GX + 0.5, lampZ = gz0 + 1.3;
  cyl(g, 0.06, 0.06, 1.7, lampX, 0.85, lampZ, M.metalDark, 6, false);      // tripod mast
  for (let i = 0; i < 3; i++) {
    const leg = cyl(g, 0.05, 0.05, 1.3, lampX, 0.5, lampZ, M.metalDark, 5, false);
    leg.rotation.z = 0.5; leg.rotation.y = (i / 3) * Math.PI * 2;
  }
  const shade = cone(g, 0.42, 0.5, lampX, 1.78, lampZ, M.metal, 10, false);
  shade.rotation.x = 0.34;   // tipped to throw light down onto the back wall
  sph(g, 0.16, lampX, 1.66, lampZ + 0.06, lampMatOf(), false);
  const workLight = new THREE.PointLight(0xffd9a0, 16, 17, 2);
  workLight.position.set(lampX, 1.55, lampZ + 0.2);
  g.add(workLight);
  blinkers.push({ light: workLight, base: 13, amp: 2.4, speed: 2.1, phase: 0.7 });

  // Tools on the back wall of the bay, in silhouette against that glow: claw
  // hammer, handsaw, spanner, screwdrivers, a shovel, a paint roller and a
  // coiled hose. Small boxes and cylinders only - at this distance the shape is
  // the whole point.
  const pegW = 4.0, pegH = 1.4, pegY = 1.4;
  box(g, pegW, pegH, 0.08, GX - 0.5, pegY, gz0 + 0.06, M.woodDark, false);
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 8; i++) {
      cyl(g, 0.05, 0.05, 0.03, GX - 2.2 + i * 0.5, pegY - 0.45 + r * 0.45, gz0 + 0.12, M.wood, 5, false)
        .rotation.x = Math.PI / 2;
    }
  }
  const toolZ = gz0 + 0.16;
  box(g, 0.12, 0.68, 0.12, GX - 2.2, pegY - 0.1, toolZ, M.wood, false);            // hammer handle
  box(g, 0.32, 0.16, 0.14, GX - 2.2, pegY + 0.3, toolZ, M.metalDark, false);      // hammer head
  const baySaw = box(g, 1.1, 0.32, 0.05, GX - 1.25, pegY + 0.05, toolZ, M.metal, false);
  baySaw.rotation.z = 0.12;                                                         // handsaw blade
  box(g, 0.32, 0.22, 0.11, GX - 0.6, pegY + 0.15, toolZ, M.woodDark, false);       // saw grip
  box(g, 0.13, 0.58, 0.1, GX - 0.3, pegY + 0.02, toolZ, M.metal, false);          // spanner
  box(g, 0.25, 0.15, 0.1, GX - 0.3, pegY + 0.34, toolZ, M.metal, false);
  for (let i = 0; i < 2; i++) {
    box(g, 0.09, 0.38, 0.09, GX + 0.5, pegY + 0.15, toolZ, M.signAmber, false);     // screwdrivers
    box(g, 0.05, 0.22, 0.05, GX + 0.5, pegY - 0.13, toolZ, M.metal, false);
  }
  box(g, 0.07, 0.48, 0.07, GX + 0.72, pegY + 0.05, toolZ, M.wood, false);          // paint roller
  cyl(g, 0.09, 0.09, 0.48, GX + 0.72, pegY + 0.4, toolZ, M.trimWhite, 8, false).rotation.z = Math.PI / 2;
  const bayShovel = box(g, 0.11, 1.7, 0.09, GX + 1.35, 0.9, toolZ + 0.1, M.wood, false);
  bayShovel.rotation.z = 0.22;                                                      // shovel, leaning
  box(g, 0.32, 0.38, 0.06, GX + 1.55, 0.2, toolZ + 0.1, M.metalDark, false);
  for (let i = 0; i < 3; i++) {
    cyl(g, 0.46 - i * 0.05, 0.46 - i * 0.05, 0.1, gx0 + 0.45, 0.5 + i * 0.04, gz0 + 0.6, M.signGreen, 12, false)
      .rotation.x = Math.PI / 2;                                                    // coiled hose
  }

  // Front: door with a canopy, two windows, a path to the kerb. All on the west
  // half of the elevation, clear of the garage.
  box(g, 1.0, 2.1, 0.16, -3.2, 1.05, D / 2 + 0.02, M.door, false);
  box(g, 1.8, 0.14, 0.9, -3.2, 2.3, D / 2 + 0.45, M.trimWhite, false);
  for (const s of [-1, 1]) cyl(g, 0.07, 0.07, 2.2, -3.2 + s * 0.75, 1.1, D / 2 + 0.8, M.trimWhite, 6, false);
  // The west window sits at -1.4, not -1.0. The garage bay's west edge is at
  // -0.5, and a 1.3-wide window centred on -1.0 would run to -0.35 and hang
  // 0.15 into the opening — glass across the corner of a driveable bay.
  for (const x of [-1.4, -4.4]) panel(g, 1.3, 1.3, x, 1.7, D / 2 + 0.03, 0, M.windowLit);
  flatPanel(g, 1.1, 4.0, -3.2, 0.03, D / 2 + 2.2, M.concrete);
  // Windows on the returns and the rear.
  for (const s of [-1, 1]) panel(g, 1.1, 1.1, s * (W / 2 + 0.03), 1.8, -2.0, s * Math.PI / 2, M.windowCool);
  for (const s of [-1, 1]) panel(g, 1.2, 1.2, s * 2.4, 1.7, -D / 2 - 0.03, Math.PI, M.windowCool);
  // Brick chimney on the -X flank.
  box(g, 0.8, 5.2, 0.8, -W / 2 + 0.6, 2.6, -2.0, M.brickRed, false);
  box(g, 1.0, 0.2, 1.0, -W / 2 + 0.6, 5.25, -2.0, M.concreteDark, false);

  // ---- Picket-fenced lawn with an open gate ----
  const picketMat = cached('picket', () => new THREE.MeshStandardMaterial({ color: 0xf0efe6, roughness: 0.8 }));
  const picketLine = (z, from, to) => {
    const n = Math.max(2, Math.round(Math.abs(to - from) / 0.5));
    for (let i = 0; i <= n; i++) {
      const x = from + ((to - from) * i) / n;
      box(g, 0.12, 0.85, 0.12, x, 0.42, z, picketMat, false);
    }
    box(g, Math.abs(to - from), 0.1, 0.07, (from + to) / 2, 0.62, z, picketMat, false);
  };
  picketLine(-D / 2 - 2.5, -W / 2 - 1, W / 2 + 1);
  picketLine(-D / 2 - 2.5, -W / 2 - 1, -W / 2 - 1);
  // Side runs, with the gate left as a gap on the -X side.
  for (const sz of [-1, 1]) {
    for (let i = 0; i < 5; i++) box(g, 0.12, 0.85, 0.12, W / 2 + 1, 0.42, -D / 2 - 2.5 + (i * (D + 5) / 4), picketMat, false);
  }
  // Garden: everything is kept to the WEST half now. The east half of the front
  // is the garage apron, and a flower bed parked on a driveway is exactly the
  // kind of thing that reads as broken rather than quaint. (A full-height front
  // tree was tried here and had to go too - the plot is only 11 wide and its
  // canopy reached straight into the next building.)
  cornerBush(g, -W / 2 + 0.9, D / 2 + 1.0, 0.5);
  cornerBush(g, -W / 2 + 0.8, -D / 2 - 1.6, 0.55);
  cornerBush(g, W / 2 - 0.7, D / 2 + 1.1, 0.55);
  pottedPlant(g, -3.2, D / 2 + 0.5, 1.0);
  flowerBed(g, -1.4, D / 2 + 1.1, 1.8, 1.0);
  flowerBed(g, -4.4, D / 2 + 1.1, 1.6, 1.0);
  // Air-con unit on the rear wall.
  box(g, 0.8, 0.6, 0.8, 3.0, 0.5, -D / 2 - 0.3, M.metal, false);

  // Colliders follow the shell pieces exactly, and there is deliberately NONE
  // over the garage bay — that gap is the way in. Collision is a flat 2D rect
  // test with no height term, so these three are what enclose the room on three
  // sides and the mouth is simply the space between them. The lintel over the
  // opening needs no collider either: one there would stop the car dead even
  // though it is 2.6 up, which is the same trap that sealed the house interior's
  // own garage exit.
  const H = BODY + 0.6;
  colliders.push({ x: (gx0 - W / 2) / 2, z: 0, halfW: (gx0 + W / 2) / 2, halfD: D / 2, h: H });
  colliders.push({ x: (gx1 + W / 2) / 2, z: 0, halfW: (W / 2 - gx1) / 2, halfD: D / 2, h: H });
  colliders.push({ x: GX, z: (gz0 - D / 2) / 2, halfW: GW2 / 2, halfD: (gz0 + D / 2) / 2, h: H });

  // The drive-in trigger, in local space. It used to be exported by the
  // grey-roofed house's open roller door; that door is shut now, so the trigger
  // lives here, in the brown-roofed open bay, which is the way into the house.
  // main.js reads it through houseGarageTrigger() and turns it into world
  // coordinates, so it is authored here in the same local frame as the geometry.
  //
  // It is a box set back inside the mouth, short of the back wall, so clipping
  // the threshold on the apron does not fire it - you have to actually be in the
  // bay before the world changes.
  houseGarageLocal = {
    x0: gx0 + 0.4, x1: gx1 - 0.4,
    z0: gz0 + 0.5, z1: gz1 - 0.7,
    // The mouth centre and the apron point just beyond it. main.js drops the
    // returning car here rather than hard-coding a spot in the street, so it
    // stays correct if this garage is ever moved or re-faced. Coming out of the
    // house's dark garage, the car emerges from THIS bay.
    mouthX: GX, mouthZ: gz1,
    apronX: GX, apronZ: gz1 + 6,
    // Where the watch camera stands while you drive in: out on the driveway, off
    // to one side and above the roofline, so the bay's own gable never gets
    // between it and the car.
    camX: GX + 3.6, camY: 5.0, camZ: gz1 + 8.5,
  };
  return { group: g, colliders, h: BODY + 0.6 };
}

// ============================================================================
// 9. Apartment Block
// ============================================================================
// Three storeys of repeated balcony bays. The balconies are the point: a slab,
// a railing, and occasionally a washing line or a planter, which is what makes
// a walk-up look inhabited. A bike rack and a bin store sit at ground level.
function apartments() {
  const g = new THREE.Group();
  const W = 20, D = 12, BODY = 9.5, FLOORS = 3, FH = 3.0;
  const colliders = [];
  const frontZ = D / 2;
  const BAYS = 5;

  box(g, W, BODY, D, 0, BODY / 2, 0, M.brickRed);
  box(g, W + 0.4, 0.8, D + 0.4, 0, 0.4, 0, M.concreteDark, false);       // plinth
  cornice(g, W, D, BODY, 0.5, 0.6, M.concrete);
  flatRoof(g, W, D, BODY + 0.5, 0.85, 0.6, M.concreteDark);

  const pitch = (W - 1.6) / BAYS;
  for (let i = 0; i < BAYS; i++) {
    const x = -(W - 1.6) / 2 + (i + 0.5) * pitch;
    // Ground floor: a door on some bays, a window on the rest.
    if (i % 2 === 0) {
      box(g, 1.0, 2.1, 0.16, x, 1.05, frontZ + 0.03, M.door, false);
      flatPanel(g, 1.4, 1.0, x, 0.03, frontZ + 0.7, M.concrete);
    } else {
      panel(g, 1.4, 1.4, x, 1.7, frontZ + 0.03, 0, M.windowCool);
    }
    // Upper floors: a window behind a balcony.
    for (let f = 1; f < FLOORS; f++) {
      const y = f * FH + 0.5;
      panel(g, 1.5, 1.7, x, y, frontZ + 0.03, 0, f === 1 ? M.windowLit : M.windowCool);
      // Balcony slab, railing, and a soffit under it.
      box(g, pitch - 0.35, 0.16, 1.5, x, y - 1.1, frontZ + 0.75, M.concrete, false);
      for (let r = 0; r < 7; r++) {
        box(g, 0.07, 0.85, 0.07, x - (pitch - 0.5) / 2 + r * ((pitch - 0.5) / 6), y - 0.7, frontZ + 1.45, M.metal, false);
      }
      box(g, pitch - 0.35, 0.09, 0.12, x, y - 0.25, frontZ + 1.45, M.metal, false);
      // A prop or two of life on the balcony.
      if ((i + f) % 2 === 0) pottedPlant(g, x - 0.5, frontZ + 0.75, 0.8);
      if ((i * 2 + f) % 3 === 0) box(g, 1.0, 0.5, 0.5, x + 0.4, y - 0.75, frontZ + 0.75, M.metalDark, false);
    }
  }
  // Rear and side fenestration.
  for (let f = 0; f < FLOORS; f++) {
    const y = f * FH + (f === 0 ? 1.7 : 0.5);
    windowRow(g, 'S', y, W - 3, 6, 1.3, f === 0 ? 1.3 : 1.6, M.windowCool);
    for (const s of ['E', 'W']) windowRow(g, s, y, D - 3, 3, 1.2, f === 0 ? 1.3 : 1.6, M.windowCool);
  }
  // Stairwell bulkhead, water tank and vents on the roof.
  box(g, 4.0, 2.4, 3.4, -4.5, BODY + 1.7, -1.0, M.concrete, false);
  box(g, 4.3, 0.2, 3.7, -4.5, BODY + 3.0, -1.0, M.concreteDark, false);
  cyl(g, 1.3, 1.3, 1.8, 5.0, BODY + 1.4, -1.5, M.metal, 12, false);
  cyl(g, 0.12, 0.12, 1.6, 5.0, BODY + 3.0, -1.5, M.metal, 6, false);
  for (let i = 0; i < 3; i++) box(g, 1.1, 0.6, 1.1, 1.5 + i * 1.6, BODY + 0.8, 3.0, M.metal, false);

  // Ground level: bike hoops by the kerb, a bin store against the flank.
  for (let i = 0; i < 4; i++) bikeHoop(g, -4.5 + i * 1.1, frontZ + 2.2, Math.PI / 2);
  box(g, 1.6, 1.6, 3.0, W / 2 + 0.9, 0.8, -1.0, M.woodDark, false);
  box(g, 1.8, 0.14, 3.2, W / 2 + 0.9, 1.66, -1.0, M.wood, false);
  hedge(g, -6.0, -D / 2 - 1.2, 6.0, 'x');
  // Entry canopy and a mailbox bank.
  box(g, 4.0, 0.22, 1.6, 4.0, 2.7, frontZ + 0.8, M.concrete, false);
  for (const s of [-1, 1]) cyl(g, 0.08, 0.08, 2.6, 4.0 + s * 1.7, 1.3, frontZ + 1.4, M.metal, 6, false);
  box(g, 1.2, 0.7, 0.2, -1.0, 1.3, frontZ + 0.06, M.metal, false);

  colliders.push({ x: 0, z: 0, halfW: W / 2, halfD: D / 2, h: BODY + 0.5, fire: true });
  colliders.push({ x: W / 2 + 0.9, z: -1.0, halfW: 0.9, halfD: 1.6, h: 1.6 });
  return { group: g, colliders, h: BODY + 0.5 };
}

// ============================================================================
// 10. School
// ============================================================================
// A long two-storey range with a bell-and-clock tower over the entrance, a
// canopy out to the dropoff, and a hard-surfaced yard on the far side that is
// deliberately NOT collided so you can play basketball on it. The yard gets its
// own low fence and hoops.
function school() {
  const g = new THREE.Group();
  const W = 13, D = 22, BODY = 7.5;
  const colliders = [];
  const frontZ = D / 2;
  // The yard sits off local +X, so the whole building turns to face the road
  // while the yard opens away from it. With the 'E' facing in the layout that
  // puts the yard to the south (-Z), which is how the school is sited: building
  // on the north edge of its plot, playground filling the ground in front.
  //
  // The range and the yard are sized to the plot the map actually leaves: the
  // strip west of the mine adit is only 30 wide (world x -90..-60) and the road
  // starts at z = 12, so a longer building or a deeper yard would hang off the
  // edge of the world and put its tarmac on the carriageway.
  const YARD_W = 14, YARD_D = 18;

  box(g, W, BODY, D, 0, BODY / 2, 0, M.brickRed);
  box(g, W + 0.3, 1.6, D + 0.3, 0, 0.8, 0, M.granite, false);            // plinth
  box(g, W + 0.4, 0.45, D + 0.4, 0, BODY + 0.22, 0, M.trimWhite, false); // eaves band
  flatRoof(g, W, D, BODY + 0.45, 0.7, 0.5, M.concreteDark);
  // A shallow roof lantern along the ridge.
  box(g, 4.0, 1.0, D - 8, 0, BODY + 0.95, 0, M.metal, false);
  panel(g, 3.4, 0.3, 0, BODY + 1.0, (D - 8) / 2, 0, M.windowCool);
  panel(g, 3.4, 0.3, 0, BODY + 1.0, -(D - 8) / 2, Math.PI, M.windowCool);

  // Classroom window bays: big, regular, with a transom over each.
  for (let i = 0; i < 5; i++) {
    const z = -(D - 6) / 2 + i * ((D - 6) / 4);
    for (const s of [-1, 1]) {
      const face = s === 1 ? 'N' : 'S';
      for (let f = 0; f < 2; f++) {
        const y = 2.2 + f * 3.1;
        panel(g, 2.6, 2.1, 0, y, z, 0, M.windowCool);
        const gx = s === 1 ? W / 2 + 0.03 : -W / 2 - 0.03;
        panel(g, 2.4, 2.0, gx, y, z, s * Math.PI / 2, M.windowCool);
      }
    }
  }
  // The E/W faces are short and plain — a chimney and a downpipe only.
  box(g, 0.9, 4.5, 0.9, W / 2 - 0.5, BODY + 2.0, -D / 2 + 3.0, M.brickDark, false);
  cyl(g, 0.08, 0.08, BODY, W / 2 + 0.1, BODY / 2, D / 2 - 4.0, M.metalDark, 6, false);

  // ---- Entrance: double doors, canopy, and the bell-and-clock tower ----
  box(g, 3.0, 2.8, 0.5, 0, 1.4, frontZ - 0.1, M.metalDark, false);
  for (const s of [-1, 1]) box(g, 1.3, 2.4, 0.16, s * 0.72, 1.2, frontZ - 0.28, M.door, false);
  box(g, 5.0, 0.22, 2.2, 0, 3.0, frontZ + 1.0, M.trimWhite, false);
  for (const s of [-1, 1]) cyl(g, 0.09, 0.09, 2.9, s * 2.2, 1.45, frontZ + 1.8, M.metal, 6, false);
  // Tower: square, rising well past the roof, with a clock on both visible faces.
  const TW = 4.4, TH = 11.5;
  const tower = new THREE.Group();
  tower.position.set(0, 0, frontZ - 1.5);
  g.add(tower);
  box(tower, TW, TH, TW, 0, TH / 2, 0, M.brickRed);
  box(tower, TW + 0.5, 0.5, TW + 0.5, 0, TH - 0.2, 0, M.trimWhite, false);
  for (const [ry, zf] of [[0, TW / 2 + 0.03], [Math.PI, -TW / 2 - 0.03]]) {
    cyl(tower, 1.35, 1.35, 0.16, 0, TH - 3.2, zf, M.porcelain, 20, false).rotation.x = Math.PI / 2;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      box(tower, 0.07, 0.2, 0.06, Math.sin(a) * 1.15, TH - 3.2 + Math.cos(a) * 1.15, zf + (ry ? -0.09 : 0.09), M.metalDark, false);
    }
    box(tower, 0.08, 1.0, 0.06, 0, TH - 3.2, zf + (ry ? -0.1 : 0.1), M.metalDark, false).rotation.z = 0.7;
    box(tower, 0.75, 0.08, 0.06, 0.3, TH - 2.9, zf + (ry ? -0.1 : 0.1), M.metalDark, false);
  }
  // Belfry: open arches, and the bell itself.
  box(tower, TW + 0.4, 0.4, TW + 0.4, 0, TH + 0.4, 0, M.trimWhite, false);
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    cyl(tower, 0.22, 0.22, 2.2, sx * (TW / 2 - 0.4), TH + 1.5, sz * (TW / 2 - 0.4), M.trimWhite, 8);
  }
  const belfryRoof = new THREE.Group();
  belfryRoof.position.y = TH + 0.6;   // the hip sits on the belfry floor, not the ground
  tower.add(belfryRoof);
  hip(belfryRoof, TW + 1.0, TW + 1.0, 2.6, M.shingle);
  const bell = cyl(tower, 0.28, 0.55, 0.8, 0, TH + 1.5, 0, M.brass, 12, false);
  box(tower, 0.1, 0.5, 0.1, 0, TH + 2.0, 0, M.metalDark, false);
  // School name board over the doors.
  panel(g, 3.6, 0.6, 0, 3.6, frontZ - 0.32, 0, M.signGreen);
  // Flagpole with a lazy pennant.
  cyl(g, 0.06, 0.06, 5.0, -4.5, 2.5, frontZ + 2.2, M.porcelain, 6, false);
  box(g, 0.06, 0.6, 1.4, -4.5, 4.6, frontZ + 2.9, M.signRed, false);

  // ---- Yard on local +X: hard surface, fence, hoops, no collider ----
  const yx = W / 2 + YARD_W / 2;
  flatPanel(g, YARD_W, YARD_D, yx, 0.02, 0, M.asphalt);
  // Painted court lines and a key.
  for (const s of [-1, 1]) flatPanel(g, 0.16, YARD_D - 3, yx + s * (YARD_W / 2 - 1.5), 0.035, 0, M.paintWhite);
  flatPanel(g, YARD_W - 3, 0.16, yx, 0.035, 0, M.paintWhite);
  for (const s of [-1, 1]) {
    flatPanel(g, 3.0, 0.14, yx, 0.035, s * (YARD_D / 2 - 6), M.paintWhite);
    flatPanel(g, 3.0, 0.14, yx, 0.035, s * (YARD_D / 2 - 3.5), M.paintWhite);
    // Hoop at each end, facing back down the court.
    const hz = s * (YARD_D / 2 - 1.2);
    box(g, 0.22, 3.4, 0.22, yx, 1.7, hz, M.metal, false);
    box(g, 1.8, 1.05, 0.12, yx, 3.1, hz - s * 0.2, M.porcelain, false);
    box(g, 1.2, 0.75, 0.06, yx, 2.95, hz - s * 0.3, M.woodDark, false);
    const rim = new THREE.Mesh(cached('hoopRim', () => new THREE.TorusGeometry(0.32, 0.04, 6, 14)), M.signRed);
    rim.position.set(yx, 2.7, hz - s * 0.55);
    g.add(rim);
    box(g, 0.05, 0.4, 0.5, yx, 2.7, hz - s * 0.35, M.signRed, false);
  }
  chainFence(g, W / 2 + YARD_W / 2, -YARD_D / 2, W / 2 + YARD_W / 2, YARD_D / 2, 2.4);
  chainFence(g, W / 2 + YARD_W / 2, YARD_D / 2, W / 2, YARD_D / 2, 2.4);
  // Benches and bike hoops along the edge facing the school.
  for (const s of [-1, 1]) {
    box(g, 0.5, 0.12, 1.8, W / 2 + 0.6, 0.5, s * 6, M.wood, false);
    for (const l of [-1, 1]) box(g, 0.12, 0.5, 0.12, W / 2 + 0.6, 0.25, s * 6 + l * 0.7, M.metalDark, false);
    for (let i = 0; i < 3; i++) bikeHoop(g, W / 2 + 1.4 + i * 0.9, s * (YARD_D / 2 - 1), 0);
  }

  // Colliders: the school block and the tower only. The yard is left open on
  // purpose — it is a playground, not a wall. Not a fire target either: the
  // tower and its hip roof rise past the collider top, so flames would clip
  // through them.
  colliders.push({ x: 0, z: 0, halfW: W / 2, halfD: D / 2, h: BODY + 0.45 });
  colliders.push({ x: 0, z: frontZ - 1.5, halfW: TW / 2, halfD: TW / 2, h: TH + 0.4 });
  return { group: g, colliders, h: BODY + 0.45 };
}

// ============================================================================
// 11. Library
// ============================================================================
// A squat, wide, deliberately solid building: deep window reveals, a projecting
// entrance porch, a flat roof with a parapet, and a sign board. The money is
// in the two rows of reading-room windows on the returns.
function library() {
  const g = new THREE.Group();
  const W = 16, D = 9, BODY = 5;
  const colliders = [];
  const frontZ = D / 2;

  box(g, W, BODY, D, 0, BODY / 2, 0, M.limestone);
  box(g, W + 0.5, 1.1, D + 0.5, 0, 0.55, 0, M.granite, false);
  cornice(g, W, D, BODY, 0.45, 0.7, M.limestoneDark);
  flatRoof(g, W, D, BODY + 0.45, 0.7, 0.6, M.limestoneDark);
  // A raised clerestory on the roof: two bands of north-light glazing.
  box(g, W - 6, 1.0, D - 4, 0, BODY + 0.95, 0, M.limestone, false);
  for (const s of [-1, 1]) panel(g, W - 7, 0.5, 0, BODY + 1.0, s * ((D - 4) / 2 + 0.02), s > 0 ? 0 : Math.PI, M.windowLit);

  // ---- Reading-room windows: tall, deeply recessed ----
  for (let i = 0; i < 3; i++) {
    const x = -4.6 + i * 4.6;
    for (let f = 0; f < 2; f++) {
      const y = 1.7 + f * 1.8;
      box(g, 1.7, 1.5, 0.4, x, y, frontZ + 0.1, M.limestoneDark, false);   // reveal
      panel(g, 1.35, 1.2, x, y, frontZ + 0.04, 0, f ? M.windowLit : M.windowCool);
      box(g, 1.5, 0.12, 0.34, x, y - 0.72, frontZ + 0.16, M.limestone, false); // sill
      box(g, 1.7, 0.16, 0.4, x, y + 0.78, frontZ + 0.14, M.limestone, false);  // lintel
    }
  }
  for (const f of ['E', 'W']) {
    windowGrid(g, f, { rows: 2, y0: 1.9, rowH: 1.9, spread: D - 2, count: 3, paneW: 1.1, paneH: 1.4, material: M.windowLit });
  }
  windowGrid(g, 'S', { rows: 2, y0: 1.9, rowH: 1.9, spread: W - 3, count: 6, paneW: 1.1, paneH: 1.4, material: M.windowCool });

  // ---- Entrance porch ----
  const px = 0;
  box(g, 4.4, 3.0, 0.4, px, 1.5, frontZ + 0.1, M.limestoneDark, false);
  for (const s of [-1, 1]) box(g, 1.1, 2.4, 0.18, px + s * 0.85, 1.2, frontZ - 0.05, M.door, false);
  box(g, 3.2, 0.3, 1.8, px, 3.2, frontZ + 1.0, M.limestone);
  for (const s of [-1, 1]) column(g, px + s * 1.35, frontZ + 1.6, 3.0, 0.2, M.limestone);
  // Sign board over the porch.
  panel(g, 3.2, 0.5, px, 3.75, frontZ + 0.32, 0, M.signGreen);
  box(g, 3.4, 0.6, 0.2, px, 3.75, frontZ + 0.24, M.limestoneDark, false);
  frontSteps(g, 4.6, 2, 0.2, 0.45, frontZ + 1.9, M.granite);
  pottedPlant(g, px - 2.2, frontZ + 1.2, 1.2);
  pottedPlant(g, px + 2.2, frontZ + 1.2, 1.2);

  // Book-drop box and a pair of bike hoops by the door.
  box(g, 0.8, 1.1, 0.5, px + 2.8, 0.55, frontZ + 0.4, M.woodDark, false);
  panel(g, 0.6, 0.2, px + 2.8, 0.85, frontZ + 0.68, 0, M.signAmber);
  for (let i = 0; i < 3; i++) bikeHoop(g, px - 5.5 - i * 1.0, frontZ + 2.6, Math.PI / 2);
  // Two planters flanking the steps, and a lamp either side.
  for (const s of [-1, 1]) {
    cyl(g, 0.1, 0.13, 3.0, px + s * 4.2, 1.5, frontZ + 1.4, M.metalDark, 6, false);
    sph(g, 0.28, px + s * 4.2, 3.2, frontZ + 1.4, M.signAmber, false);
  }
  hedge(g, px, -D / 2 - 1.4, 12, 'x', 0.5);

  colliders.push({ x: 0, z: 0, halfW: W / 2, halfD: D / 2, h: BODY + 0.45 });
  return { group: g, colliders, h: BODY + 0.45 };
}

// ============================================================================
// 12. Power Substation
// ============================================================================
// All transformer and switchgear, no building: a gravel yard inside a chain
// fence, a transformer with cooling fins and a striped hazard band, an A-frame
// gantry with insulators, and a control cabinet. Everything sits low, so the
// silhouette you get is poles and cables.
function substation() {
  const g = new THREE.Group();
  const W = 14, D = 12;
  const colliders = [];

  // Gravel yard.
  flatPanel(g, W, D, 0, 0.02, 0, M.concreteDark);
  box(g, W, 0.1, D, 0, 0.05, 0, M.concrete, false);
  // Gravel patches, so it is not a flat plate.
  for (let i = 0; i < 10; i++) {
    const px = ((i * 47) % 100) / 100 * (W - 2) - (W - 2) / 2;
    const pz = ((i * 73) % 100) / 100 * (D - 2) - (D - 2) / 2;
    sph(g, 0.5, px, 0.06, pz, M.concrete, false).scale.y = 0.2;
  }

  // ---- Perimeter fence with a gate on the +Z side ----
  chainFence(g, -W / 2, -D / 2, W / 2, -D / 2, 2.6);
  chainFence(g, -W / 2, D / 2, -1.2, D / 2, 2.6);
  chainFence(g, 1.2, D / 2, W / 2, D / 2, 2.6);
  chainFence(g, -W / 2, -D / 2, -W / 2, D / 2, 2.6);
  chainFence(g, W / 2, -D / 2, W / 2, D / 2, 2.6);
  // Warning signs on the gate posts.
  for (const s of [-1, 1]) {
    box(g, 0.14, 1.5, 0.14, s * 1.4, 1.3, D / 2, M.metal, false);
    panel(g, 1.0, 0.8, s * 1.4, 1.9, D / 2 + 0.08, 0, M.warning);
    cone(g, 0.3, 0.6, s * 1.4, 0.3, D / 2 + 0.4, M.signRed, 8, false);
  }

  // ---- Main transformer ----
  const tx = -2.0, tz = 0;
  box(g, 5.0, 0.4, 4.0, tx, 0.2, tz, M.concrete, false);
  const xfmr = new THREE.Group();
  xfmr.position.set(tx, 0, tz);
  box(xfmr, 3.6, 2.6, 3.0, 0, 1.9, 0, M.metal, false);
  // Cooling fins down both sides.
  for (let i = 0; i < 9; i++) {
    box(xfmr, 0.1, 2.2, 0.5, 0 - 1.9 + i * 0.475, 1.9, 0 - 1.6, M.metalDark, false);
    box(xfmr, 0.1, 2.2, 0.5, 0 - 1.9 + i * 0.475, 1.9, 0 + 1.6, M.metalDark, false);
  }
  // Bushings on top, each a stack of insulator discs.
  for (let i = 0; i < 3; i++) {
    const bx = -1.1 + i * 1.1;
    cyl(xfmr, 0.14, 0.18, 1.5, bx, 4.0, 0, M.metalDark, 8, false);
    for (let d = 0; d < 5; d++) cyl(xfmr, 0.3, 0.3, 0.1, bx, 3.5 + d * 0.28, 0, M.porcelain, 10, false);
  }
  g.add(xfmr);
  addKnockable(xfmr, 3, { mode: 'topple', toppleRadius: 3, smashOnlyBy: 'monster' });
  // The hazard band: the one piece of graphic that identifies a substation.
  box(g, 3.7, 0.5, 3.1, tx, 0.75, tz, M.warning, false);
  for (let i = 0; i < 5; i++) {
    const stripe = box(g, 0.45, 0.55, 0.1, tx - 1.5 + i * 0.75, 0.75, tz + 1.58, M.metalDark, false);
    stripe.rotation.z = 0.6;
  }
  // Gauges and a valve wheel on the tank face.
  for (const s of [-1, 1]) cyl(g, 0.22, 0.22, 0.12, tx + s * 0.9, 2.6, tz + 1.52, M.brass, 12, false).rotation.x = Math.PI / 2;

  // ---- A-frame gantry carrying the outgoing lines ----
  const gx = 4.6;
  for (const sz of [-1, 1]) {
    for (const s of [-1, 1]) {
      const leg = cyl(g, 0.1, 0.14, 6.4, gx + s * 0.9, 3.2, sz * 1.8, M.metal, 6);
      leg.rotation.z = -s * 0.14;
    }
  }
  box(g, 2.6, 0.18, 0.18, gx, 5.4, -1.8, M.metal, false);
  box(g, 2.6, 0.18, 0.18, gx, 5.4, 1.8, M.metal, false);
  for (const sz of [-1, 1]) {
    const cross = box(g, 2.9, 0.16, 0.16, gx, 6.3, sz * 1.8, M.metal, false);
    cross.rotation.z = 0.0;
    // Cross-bracing between the legs.
    for (const s of [-1, 1]) {
      const br = box(g, 2.3, 0.09, 0.09, gx, 3.0, sz * 1.8, M.metal, false);
      br.rotation.z = s * 0.5;
    }
    // Insulator strings hanging off the crossarm.
    for (let i = 0; i < 3; i++) {
      const ix = gx - 0.9 + i * 0.9;
      for (let d = 0; d < 3; d++) cyl(g, 0.22, 0.22, 0.08, ix, 5.6 - d * 0.22, sz * 1.8, M.porcelain, 8, false);
      cyl(g, 0.05, 0.05, 1.4, ix, 4.5, sz * 1.8, M.metalDark, 5, false);
    }
  }

  // ---- Switchgear cabinets and the control kiosk ----
  for (let i = 0; i < 3; i++) {
    const cx2 = -5.2 + i * 1.5;
    box(g, 1.2, 2.2, 1.0, cx2, 1.1, -4.0, M.metal, false);
    panel(g, 0.9, 1.2, cx2, 1.3, -3.48, 0, M.metalDark);
    box(g, 0.5, 0.16, 0.06, cx2, 2.05, -3.46, M.signAmber, false);
  }
  box(g, 2.4, 2.6, 2.0, -4.4, 1.3, 3.4, M.whiteStucco, false);
  box(g, 2.6, 0.16, 2.2, -4.4, 2.68, 3.4, M.shingle, false);
  panel(g, 1.4, 1.0, -4.4, 1.5, 4.42, 0, M.windowCool);
  box(g, 0.9, 2.0, 0.12, -3.2, 1.0, 4.42, M.metalDark, false);

  // Cable trench covers, so you can see where the underground runs go.
  for (let i = 0; i < 6; i++) box(g, 0.8, 0.08, 0.6, 0.4 + i * 0.9, 0.1, 2.0, M.concrete, false);
  // A row of bollards along the front inside the fence.
  for (let i = 0; i < 5; i++) cyl(g, 0.12, 0.12, 1.0, -5.0 + i * 2.2, 0.5, D / 2 - 0.6, M.warning, 8, false);

  colliders.push({ x: 0, z: 0, halfW: W / 2, halfD: D / 2, h: 0.35 });
  colliders.push({ x: tx, z: tz, halfW: 2.5, halfD: 2.0, h: 3.2 });
  colliders.push({ x: gx, z: 0, halfW: 1.4, halfD: 2.0, h: 6.4 });
  colliders.push({ x: -4.4, z: 3.4, halfW: 1.3, halfD: 1.1, h: 2.6 });
  return { group: g, colliders, h: 0.35 };
}

// ============================================================================
// Layout
// ============================================================================
// Twelve landmark buildings on their own footprints, with the two retained old
// blocks dropped in alongside. Positions are WORLD (x, z) centres on the
// ground plane; `face` is the compass direction the building's front looks.
//
// Placement is driven by the street plan in cityRoads.js. Everything sits in a
// block bounded by roads on at least two sides, so every front door has a
// driveway:
//
//   block  x -72..-45, z  12..39   bodega              (clear of the mine adit)
//   block  x -31..-12, z  12..39   fountain plaza      (a square on the drag)
//   block  x  12..48, z  12..39   school              (the big civic block)
//   block  x  12..48, z  43..65   park + library      (off park-spine)
//   block  x -72..-12, z  79..106  city hall + bank    (the far-north civic row)
//   block  x   6..48, z  79..106  hospital
//   block  x  62..72, z  79..106  retained block
//   block  x -72..-45, z -72..-48  parking lot
//   block  x -72..-45, z -34..-12  block of flats      (off the residential street)
//   block  x -31..-12, z -72..-16  the two houses + the low retained block
//   block  x  30..72, z -72..-16  substation, fire station, filling station
//
// The school is the only landmark that needs a 30 x 26 footprint, and the only
// block with room for it is the civic block on arterial-ew — hence the long
// frontage there rather than in the quieter far north.

const LAYOUT = [
  // The bodega fronts the main drag from the block between west-spine and the
  // main street, with the fountain plaza behind it. It used to sit south of the
  // mine shaft, directly in the line of the drive-in, which is why the shaft
  // could not be seen from the road.
  { name: 'bodega',        build: bodega,        x: -22.5, z: 19.6, face: 'S' },
  { name: 'school',        build: school,        x: 34.5,  z: 27,   face: 'S' },
  { name: 'library',       build: library,       x: 40,    z: 54,   face: 'W' },
  // The bank is turned side-on: rotated 90 degrees it is 17 wide instead of 22,
  // which is what lets the city hall and the bank share the far-north block.
  { name: 'cityHall',      build: cityHall,      x: -49.5, z: 92,   face: 'S' },
  { name: 'bank',          build: bank,          x: -24,   z: 92,   face: 'E' },
  { name: 'hospital',      build: hospital,      x: 26,    z: 95,   face: 'S' },
  { name: 'apartments',    build: apartments,    x: -58,   z: -22,  face: 'N' },
  // Both houses turn EAST onto arterial-ns. They used to face north, which put
  // their front doors on an empty lawn with the tarmac off to one side; facing
  // the street means the door, the path and the garage apron all land on the
  // road. The garage house has its bay open, so you can drive in off the drag.
  { name: 'houseStandard', build: houseStandard, x: -22,   z: -68,  face: 'E' },
  // The house-with-garage sits 2.5 further south than it used to (z -49, not
  // -46.5) because its garage went from 5 wide to 7. The garage is hung on the
  // house's -X side, which after the E facing lands on world -Z, so every extra
  // unit of width pushes the whole building 1 further south. At -46.5 the widened
  // garage's outer wall would have run into the retained block at z -36.2; at
  // -49 it clears it by 1.6 and still leaves 4.6 between the two houses.
  { name: 'houseGarage',   build: houseGarage,   x: -22,   z: -49,  face: 'E' },
  // The substation fills the far corner and the two public buildings face the
  // street. The gas station sits back from south-main so its drive-in forecourt
  // has room: its canopy starts 6 south of the kerb. The substation is pushed
  // 5 further south (z -64, not -59) to clear the back of the station's new
  // forecourt loop, which reaches z = -56. The substation's fenced footprint
  // (W 14 x D 12 plus the hazard band) runs to z = -57.6, so -59 would have put
  // its fence inside the loop; -64 leaves a 1.6 gap of open ground.
  { name: 'substation',    build: substation,    x: 48,    z: -64,  face: null },
  { name: 'gasStation',    build: gasStation,    x: 44,    z: -42,  face: 'N' },
  // The fire station was widened from 16 x 13 to 20 x 14 to give its apparatus
  // bays a 7.4-wide aperture each. The player car is a 2.2-radius circle, so a
  // 4.4 bay left only half a unit of slack on centre — technically passable
  // through the wall-slide, but it read as a brick wall. The footprint now runs
  // x 54..74, z -46.5..-32.5, which still clears the gas canopy (x ..52), the
  // vacuum kiosk (z ..-32.2) and the price pylon (z -48.6).
  { name: 'fireStation',   build: fireStation,   x: 64,    z: -39.5, face: 'N' },
];

// The two old blocks that survive from the previous city, unchanged.
const RETAINED = [
  { x: 67, z: 88, w: 9, d: 9, h: 11 },
  { x: -22, z: -33.2, w: 9, d: 6, h: 7 },
];

// Rotates a local (x, z) into world space for a given compass facing.
function placeCollider(c, originX, originZ, yaw, name) {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const wx = originX + c.x * cos + c.z * sin;
  const wz = originZ - c.x * sin + c.z * cos;
  // Quarter turns only, so the world AABB is either as-given or with the
  // half-extents swapped. Anything else would need a rotated OBB.
  const swap = Math.abs(Math.sin(yaw)) > 0.5;
  const out = {
    x: wx,
    z: wz,
    halfW: swap ? c.halfD : c.halfW,
    halfD: swap ? c.halfW : c.halfD,
    h: c.h,
    fire: !!c.fire,
      // Which building this collider belongs to. Carried purely so the layout
      // can be audited for inter-building overlaps.
      b: name,
  };
  // Pass the collision-kind flags straight through. `aiOnly` (the pump islands)
  // is the whole reason the forecourt is drivable, and it is read by
  // isPositionBlocked in main.js - dropping it here would silently turn the
  // islands back into hard obstacles for the player.
  if (c.aiOnly) out.aiOnly = true;
  if (c.soapy) out.soapy = true;
  if (c.soft) out.soft = true;
  if (c.ceiling) out.ceiling = true;
  if (c.bridge) out.bridge = true;
  return out;
}

// ===== Rear elevations =====
// Every builder in this file puts its effort into the FRONT: shopfronts, canopies,
// porches, name boards. The back of each block is a blank extruded rectangle, and
// because the town is walked from every direction (and the camera can be behind
// any building) that blank wall is most of what you actually look at. This pass
// dresses the rear of every building from its own footprint, so the detail lands
// on the wall that faces away from the street rather than being hand-placed in
// eleven separate builders.
//
// The two walls either side get a lighter treatment than the rear, because those
// are the gables and a plain gable with a vent and a downpipe reads correctly.

// The compass face opposite a front, i.e. the rear wall.
const REAR_OF = { N: 'S', S: 'N', E: 'W', W: 'E' };

// One rear wall: a run of windows in the storey band, a service door, a downpipe
// and a vent.
//
// Everything is positioned from absolute measured wall planes (`at.face`, the
// signed distance from the group origin to the wall, and `at.centre`, the wall's
// midpoint along its own axis). Deriving the axis per face is the whole point:
// the previous version took a single "halfDepth" and an if/else that only
// handled N and S, so the E and W gables were placed at offset 0 - i.e. in the
// middle of the building - and every window, door, pipe and plinth on the two
// short walls of each building was buried inside the brickwork.
function dressRearWall(g, face, at, h, glass) {
  const f = at.face;      // signed: +ve on the far side of the origin
  const c = at.centre;    // wall midpoint along the wall's own axis
  const out = f > 0 ? 1 : -1;

  // A panel flush on the wall face. `along` runs along the wall, the 0.07 is a
  // stand-off so it does not z-fight with the wall itself, and the rotation
  // turns the quad to face outwards from the building.
  const put = (w, hh, along, y, mat) => {
    if (face === 'N' || face === 'S') panel(g, w, hh, c + along, y, f + 0.07, face === 'N' ? 0 : Math.PI, mat);
    else panel(g, w, hh, f + 0.07, y, c + along, face === 'E' ? Math.PI / 2 : -Math.PI / 2, mat);
  };
  // A box standing proud of the wall, its inner face on the wall plane:
  // downpipes, vents, door surrounds, the lintel band.
  const cube = (w, hh, dd, along, y, proud, mat) => {
    if (face === 'N' || face === 'S') box(g, w, hh, dd, c + along, y, f + (out * proud) / 2, mat);
    else box(g, dd, hh, w, f + (out * proud) / 2, y, c + along, mat);
  };
  // A box on the wall plane, for the flat plinth course.
  const flat = (w, hh, dd, along, y, mat) => {
    if (face === 'N' || face === 'S') box(g, w, hh, dd, c + along, y, f, mat, false);
    else box(g, dd, hh, w, f, y, c + along, mat, false);
  };

  // Window band. Two rows on anything tall enough, one on a squat block, with the
  // count scaled to the wall length so a long gable does not get three lonely
  // panes and a short one does not get seven.
  const rows = h > 9 ? 2 : 1;
  const count = Math.max(2, Math.min(6, Math.round((at.span) / 4)));
  const spread = Math.max(1, at.span - 3);
  for (let r = 0; r < rows; r++) {
    const y = h * (rows === 1 ? 0.55 : 0.32 + r * 0.36);
    for (let i = 0; i < count; i++) {
      const t = (i / (count - 1) - 0.5) * spread;
      put(1.2, 1.5, t, y, glass);
    }
  }
  // A lintel band over the top row, the same trick the fronts use, so the rear
  // has a horizontal to catch the light the same way the front does.
  if (rows === 2) cube(spread + 1.5, 0.28, 0.3, 0, h * 0.68, 0.3, M.trimWhite);

  // Service door at one end: a recessed dark panel with a surround. It gives the
  // eye something at ground level, which is the flattest part of a blank wall.
  // The door is inset into the wall, so it sits slightly inside the face rather
  // than proud of it - otherwise it reads as a slab glued on the brick.
  const doorAt = -at.halfSpan + 1.6;
  if (face === 'N' || face === 'S') {
    box(g, 1.5, 2.6, 0.22, c + doorAt, 1.3, f - 0.11, M.doorDark, false);
    cube(1.9, 3.0, 0.14, doorAt, 1.5, 0.14, M.trimWhite);
    box(g, 2.1, 0.22, 0.7, c + doorAt, 0.11, f + out * 0.35, M.stonePale, false);
  } else {
    box(g, 0.22, 2.6, 1.5, f - 0.11, 1.3, c + doorAt, M.doorDark, false);
    cube(0.14, 3.0, 1.9, doorAt, 1.5, 0.14, M.trimWhite);
    box(g, 0.7, 0.22, 2.1, f + out * 0.35, 0.11, c + doorAt, M.stonePale, false);
  }

  // Downpipe in the far corner, running the full height. This is the single
  // cheapest thing that stops a wall reading as a texture-less slab. cyl() takes
  // its position as a centre, so the pipe is lifted to half its length or it
  // spends most of itself underground.
  const pipeAt = at.halfSpan - 0.7;
  const pipeH = h * 0.94;
  const slot = (y) => (face === 'N' || face === 'S'
    ? [c + pipeAt, y, f + 0.18]
    : [f + 0.18, y, c + pipeAt]);
  cyl(g, 0.11, 0.11, pipeH, ...slot(pipeH / 2), M.metalDark, 8);
  // A hopper head at the top and a shoe at the bottom, so the pipe reads as
  // drainage rather than as a stripe of pipe stuck to the brick.
  sph(g, 0.2, ...slot(pipeH - 0.1), M.metalDark, 8);
  cyl(g, 0.16, 0.16, 0.4, ...slot(0.2), M.metalDark, 8);

  // A louvred vent high on the wall, and a low brick plinth along the base.
  put(1.4, 0.9, at.halfSpan * 0.35, h * 0.86, M.ventDark);
  flat(at.span, 0.7, 0.16, 0, 0.35, M.brickDark);
}

// Measures a building's real wall planes from its own meshes.
//
// This deliberately does NOT use built.colliders. Colliders are inflated for
// gameplay: most builders report halfW/halfD 0.3 larger than the visible wall,
// and cityHall reports its *podium* (W+4 x D+4) rather than the main block
// (W x D, itself offset 0.5 in z). Hanging windows off a collider therefore
// floated them up to 2.5 units off the wall, or buried them inside it.
//
// Instead the largest BOX mesh is found and used, since that is the main mass
// in every one of these builders. Volume beats area: cityHall's podium is
// broader (32x24) than its block (28x20) but far shorter (1.3 vs 12), so on
// area alone the podium wins and the walls float; on volume the block wins.
// A slender tower standing on a block (the school's belfry) is excluded by the
// footprint test, and low slabs (the gas forecourt, kerbs) by the height test.
function measureWalls(g) {
  let main = null, bestVol = -1;
  for (const child of g.children) {
    const geo = child.geometry;
    if (!geo || geo.w === undefined || geo.d === undefined) continue;
    const w = geo.w, d = geo.d, h = geo.h;
    if (h < 2.5) continue;                       // slab / kerb / plinth
    if (w < 3 || d < 3) continue;                // chimney, belfry, kiosk
    const vol = w * h * d;
    if (vol > bestVol) { bestVol = vol; main = child; }
  }
  if (!main) return null;
  const p = main.position;
  return {
    // The wall planes are the main mass's faces, offset by the mass's own centre.
    x0: p.x - main.geometry.w / 2,
    x1: p.x + main.geometry.w / 2,
    z0: p.z - main.geometry.d / 2,
    z1: p.z + main.geometry.d / 2,
    h: p.y + main.geometry.h / 2,                // wall top
  };
}

// Dresses all three non-front walls of a building, measured off the real meshes.
function dressRear(g, entry, built) {
  const walls = measureWalls(g);
  if (!walls) return;                      // nothing worth dressing (a shed)
  // Wall height is the measured wall top. `built.h` is ignored on purpose: it is
  // the tallest thing on the roof (spire, gantry, water tank), not the wall, and
  // using it ran the window band up past the parapet into thin air. The substation
  // measures as a yard rather than a building, so it correctly dresses nothing.
  const h = Math.min(walls.h, 24);
  if (h < 2.5) return;
  const cx = (walls.x0 + walls.x1) / 2, cz = (walls.z0 + walls.z1) / 2;
  // The wall is not always centred on the group origin (cityHall's block sits at
  // z -0.5), so the per-face offset is measured from the wall's own centre.
  const toFace = { N: walls.z1, S: walls.z0, E: walls.x1, W: walls.x0 };
  const glass = entry.name === 'fireStation' || entry.name === 'hospital'
    ? M.windowLit : M.windowCool;

  // The rear, then both gables. A front of null means the building is not
  // oriented to a street, so all four faces are treated as rear.
  const faces = entry.face === null
    ? ['N', 'S', 'E', 'W']
    : [REAR_OF[entry.face], ...(['N', 'S', 'E', 'W'].filter((f) =>
        f !== entry.face && f !== REAR_OF[entry.face]))];
  for (const face of faces) {
    // Each face gets its own absolute wall description. A N/S wall's length runs
    // along x and its plane is a z; an E/W wall's length runs along z and its
    // plane is an x. The wall is not always centred on the group origin, so
    // `centre` carries the measured midpoint as well as the signed face position.
    const alongX = face === 'N' || face === 'S';
    const at = {
      face: alongX ? (face === 'N' ? walls.z1 : walls.z0) : (face === 'E' ? walls.x1 : walls.x0),
      centre: alongX ? cx : cz,
      span: alongX ? walls.x1 - walls.x0 : walls.z1 - walls.z0,
      halfSpan: (alongX ? walls.x1 - walls.x0 : walls.z1 - walls.z0) / 2,
    };
    dressRearWall(g, face, at, h, glass);
  }
}

// Builds the city and returns the world colliders. There is no shadow-capping
// hook here on purpose: main.js already runs capShadowCasters() over the whole
// city scene once everything is added, and doing it per building here would
// just traverse the same meshes twice.
export function addCityBuildings(scene, colliders) {
  blinkers.length = 0;
  doorTargets.length = 0;
  fireStationBayWorld = null;
  houseGarageLocal = null;
  houseGarageEntry = null;

  for (const entry of LAYOUT) {
    const built = entry.build();
    const yaw = entry.face === null ? 0 : FACE_YAW[entry.face];
    const g = built.group;
    dressRear(g, entry, built);
    g.position.set(entry.x, 0, entry.z);
    g.rotation.y = yaw;
    scene.add(g);
    for (const c of built.colliders) {
      colliders.push(placeCollider(c, entry.x, entry.z, yaw, entry.name));
    }
    // Where the front door ends up in world space, so map.js can run a
    // driveway ribbon from it to the nearest street.
    doorTargets.push({ name: entry.name, ...doorPoint(entry, built) });
    // The fire station's apparatus bay is a spawn point, not a doorway: the
    // engine starts parked in it and reverses back into it after every call.
    if (entry.name === 'fireStation' && fireStationBayLocal) {
      const yaw = FACE_YAW[entry.face] ?? 0;
      const cos = Math.cos(yaw), sin = Math.sin(yaw);
      fireStationBayWorld = {
        x: entry.x + fireStationBayLocal.x * cos + fireStationBayLocal.z * sin,
        z: entry.z - fireStationBayLocal.x * sin + fireStationBayLocal.z * cos,
        // The engine's nose points out of the bay (+Z in local space), and the
        // model faces -X, so a quarter turn puts it nose-out.
        yaw: yaw + Math.PI / 2,
        // The lane it works from: the centre line of the street the station
        // fronts. Expressed in world space so the firetruck can line up on it
        // without knowing anything about the building.
        roadZ: entry.z + (fireStationBayLocal.roadZ) * cos,
        // ...and that street's own extent, so the engine stays on tarmac instead
        // of wandering off the end of it. These describe the STREET, not the
        // building, so they are already world x and are passed straight through
        // — south-main runs along world x, which a north-facing building's local
        // x axis also runs along, so no rotation is wanted here anyway.
        roadMinX: fireStationBayLocal.roadMinX,
        roadMaxX: fireStationBayLocal.roadMaxX,
      };
    }
    // The brown-roofed house's open bay is the opposite case: not a spawn point
    // but a door you drive through into another level, so main.js only needs to
    // know where the trigger sits and which way the car was pointing when it
    // left. It is the bay, not the neighbouring house-with-garage, because that
    // one's roller door is shut and empty now.
    if (entry.name === 'houseStandard') {
      houseGarageEntry = { x: entry.x, z: entry.z, yaw: FACE_YAW[entry.face] ?? 0 };
    }
  }

  // The two retained blocks, drawn as plain masses exactly as before so the
  // old skyline still reads in the gaps between the new landmarks.
  for (const b of RETAINED) {
    const g = new THREE.Group();
    box(g, b.w, b.h, b.d, 0, b.h / 2, 0, M.brickDark);
    // The capping band stands PROUD of the wall rather than flush with its top:
    // ending it level with the roof would put two coplanar faces over the whole
    // roof and make the deck flicker.
    box(g, b.w + 0.3, 0.4, b.d + 0.3, 0, b.h + 0.1, 0, M.trimWhite, false);
    for (let f = 0; f < 2; f++) {
      windowRow(g, 'N', 2.6 + f * 3.0, b.w - 2, 3, 1.2, 1.3, M.windowCool);
      windowRow(g, 'S', 2.6 + f * 3.0, b.w - 2, 3, 1.2, 1.3, M.windowCool);
    }
    g.position.set(b.x, 0, b.z);
    scene.add(g);
    colliders.push({ x: b.x, z: b.z, halfW: b.w / 2, halfD: b.d / 2, h: b.h, b: 'retained' });
    const rd = facingDoor(b.x, b.z, b.d / 2, nearestFace(b.x, b.z));
    doorTargets.push({ name: `retained@${b.x},${b.z}`, ...rd });
  }

  return colliders;
}

// ===== Doorways, for the driveways =====

// The doorway of a finished building, in world space. The wall we knock a door
// into is the front face: the body is whichever collider has the biggest
// footprint (awnings, bins and masts are all much smaller), and the door is the
// middle of that face, pushed clear of the wall so the ribbon starts on grass.
const doorTargets = [];

function facingDoor(x, z, halfD, face) {
  // The builders all put their front on local +Z, so the door is a fixed local
  // offset and the compass facing only decides the yaw. Rotating (0, 1) by
  // 0/90/180/-90 lands on N/E/S/W, which is why we do not flip the offset for
  // the southern and western facings as well.
  const yaw = { N: 0, E: Math.PI / 2, S: Math.PI, W: -Math.PI / 2 }[face];
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  // Same local -> world rotation as placeCollider.
  return { x: x + sin * (halfD + 1.5), z: z + cos * (halfD + 1.5) };
}

// Which way a doorless building should turn its door: straight at whichever
// street is closest. The substation is the only one built without a facade.
function nearestFace(x, z) {
  const n = nearestRoadDistance(x, z);
  if (Math.abs(n.x - x) > Math.abs(n.z - z)) return n.x > x ? 'E' : 'W';
  return n.z > z ? 'N' : 'S';
}

function doorPoint(entry, built) {
  let body = null;
  for (const c of built.colliders) {
    if (!body || c.halfW * c.halfD > body.halfW * body.halfD) body = c;
  }
  const face = entry.face === null ? nearestFace(entry.x, entry.z) : entry.face;
  return facingDoor(entry.x + body.x, entry.z + body.z, body.halfD, face);
}

// The list `addCityBuildings` filled in, for map.js to hand to the driveway
// builder. Empty before the city is built.
export function cityDoorTargets() {
  return doorTargets;
}

// Per-frame city animation, so every blinking beacon in the set shares one clock
// and stays in step. Right now that is just the fire station: the red alarm over
// its door and the beacon on its radio mast, both of which are also real
// PointLights so they throw a glow onto the brickwork around them. A builder
// joins in by pushing { light } or { mat, base, amp, speed, phase } onto
// `blinkers`; everything else in the city is lit by emissive materials that
// simply stay on.
export function updateCityBuildings(t) {
  for (const b of blinkers) {
    const v = b.base + b.amp * Math.sin(t * b.speed + b.phase);
    if (b.light) b.light.intensity = v;
    if (b.mat) b.mat.emissiveIntensity = v;
  }
}

// Every world collider flagged `fire`, as a flat list the firetruck can consume.
// Derived from the same data the colliders come from, so a building can never
// be a fire target without a roof for the fire to stand on. The fire station is
// deliberately NOT in this list — see the builder's comment — so the engine
// never has to douse the building it is parked inside.
export function cityFireSpots(colliders) {
  return colliders
    .filter((c) => c.fire)
    .map((c) => ({ x: c.x, z: c.z, w: c.halfW * 2, d: c.halfD * 2, h: c.h }));
}

// Where the engine's home bay is, in world space: { x, z, yaw }. `yaw` already
// includes the building's own facing, so the caller can assign it straight to
// the truck. Null if the city hasn't been built yet, which the firetruck treats
// as "no station" and falls back to plain road patrol.
export function cityFireStationBay() {
  return fireStationBayWorld;
}

// The suburban house's drive-in garage, in world space:
//   { x0, x1, z0, z1, cx, cz, camX, camY, camZ, yaw }
//
// x0..x1 / z0..z1 is the trigger rectangle — get the car anywhere inside it and
// the level takes you into the house. cx/cz is its middle, which is where the
// car is placed on arrival. cam* is the fixed spot the watch camera stands at
// while you drive in, and yaw is the house's facing so the caller can turn the
// car to match the garage it came out of. Null before the city is built.
//
// This is a plain AABB rather than the rotated rectangle because every house in
// the set faces a compass point, so its local axes always land on world X and Z
// one way or the other: the corners can simply be rotated and min/max'd.
export function houseGarageTrigger() {
  if (!houseGarageLocal || !houseGarageEntry) return null;
  const l = houseGarageLocal;
  const e = houseGarageEntry;
  const cos = Math.cos(e.yaw), sin = Math.sin(e.yaw);
  // Same convention as placeCollider: a local (lx, lz) lands at
  // (x + lx*cos + lz*sin, z - lx*sin + lz*cos).
  const toWorld = (lx, lz) => ({ x: e.x + lx * cos + lz * sin, z: e.z - lx * sin + lz * cos });
  const corners = [toWorld(l.x0, l.z0), toWorld(l.x1, l.z0), toWorld(l.x1, l.z1), toWorld(l.x0, l.z1)];
  const cam = toWorld(l.camX, l.camZ);
  // The mouth is the open local +Z face, on the building's centreline. This is
  // where the car is handed BACK to the city after the house, so main.js never
  // has to know the garage's local geometry to place it — it just drops the car
  // a car-length short of the mouth, on the axis, facing back out into the street.
  const mouth = toWorld(l.mouthX, l.mouthZ);
  const apron = toWorld(l.apronX, l.apronZ);
  return {
    x0: Math.min(...corners.map((c) => c.x)), x1: Math.max(...corners.map((c) => c.x)),
    z0: Math.min(...corners.map((c) => c.z)), z1: Math.max(...corners.map((c) => c.z)),
    // The box's centre in WORLD space, matching the x0..x1/z0..z1 above. A
    // rotated trigger is not axis-aligned in local space, so this has to come
    // from the world corners — taking the mean of the local numbers would hand
    // main.js a point somewhere near the origin instead.
    cx: (Math.min(...corners.map((c) => c.x)) + Math.max(...corners.map((c) => c.x))) / 2,
    cz: (Math.min(...corners.map((c) => c.z)) + Math.max(...corners.map((c) => c.z))) / 2,
    camX: cam.x, camY: l.camY, camZ: cam.z,
    // The open face, and a point out on the apron in front of it.
    //
    // `exitYaw` is the car heading that points back OUT of the mouth, which is
    // NOT the building's own yaw: the car and the building use different yaw
    // conventions. See modules/heading.js — in short, a car's forward is
    // (-cos ry, sin ry) while a building's front is (sin yaw, cos yaw), so the
    // outward heading is the building yaw plus a quarter turn. Using e.yaw
    // directly made the car come out of the garage sideways.
    mouthX: mouth.x, mouthZ: mouth.z,
    apronX: apron.x, apronZ: apron.z,
    exitYaw: outwardYaw(e.yaw),
    yaw: e.yaw,
  };
}

// ---- named builder aliases, so the layout table reads as a list of places ----
function houseGarage() { return houseWithGarage(); }
