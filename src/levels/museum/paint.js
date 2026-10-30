// ============================================================================
// The Art Exhibit Room — two hundred ordinary A-frame ladders, each with a shelf
// holding a bucket of vivid rainbow paint, scattered over one giant white drop
// cloth that covers the floor of the exhibit hall.
//
// The ladders are ordinary knockables (physics.js), so they fall like any other
// prop. What makes them special lives here: a knocked ladder takes its can with
// it, the can spills a growing puddle of its colour, and driving through that
// wet paint draws a trail behind the car — a solid band first, then just two
// tyre tracks, then nothing. Drive back through a trail and the tyres pick that
// paint up again: a full-width band re-soaks them (band, then tracks), while
// crossing bare tyre tracks leaves tracks of that colour.
//
// The tracks keep the shape of the ride that pressed into them (see
// VEHICLE_TRACKS): each car has its own gauge and tread width, the steamroller
// leaves one unbroken drum ribbon, and the legged rides — above all the giant
// robot — leave alternating footprints instead of tyres.
//
// The module owns only presentation and paint state; the museum hands it the
// exhibit floor and the frame time.
// ============================================================================

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { addKnockable, knockAt } from '../../physics.js?v=1800000000006';

// Twelve vivid shades: one trip round the rainbow at full saturation, so the
// paint reads from the far end of the hall.
export const RAINBOW_PAINTS = [
  { name: 'red', color: 0xff0a1a },
  { name: 'vermilion', color: 0xff4d00 },
  { name: 'amber', color: 0xffc400 },
  { name: 'chartreuse', color: 0x9dff00 },
  { name: 'green', color: 0x00e63c },
  { name: 'emerald', color: 0x00ffa8 },
  { name: 'cyan', color: 0x00e0ff },
  { name: 'azure', color: 0x0084ff },
  { name: 'blue', color: 0x2a2aff },
  { name: 'violet', color: 0x8a00ff },
  { name: 'magenta', color: 0xff00c8 },
  { name: 'rose', color: 0xff0059 },
];

// Two hundred ladders, scattered across the drop cloth rather than lined up in
// rows: positions come from a seeded PRNG (so the room looks the same every
// load) with each new spot rejected if it lands on the ramp lane, off the cloth,
// or within MIN_GAP of a ladder already placed.
const _rand = (() => {
  let a = 0x5eed1234;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();

export const LADDER_SPOTS = (() => {
  const COUNT = 200;
  const X0 = -152, X1 = 152;
  const Z0 = 18, Z1 = -246;
  const spots = [];
  let minGap = 15;
  let attempts = 0;
  while (spots.length < COUNT) {
    attempts++;
    // The gap relaxes if the room ever gets tight, so the count is guaranteed.
    if (attempts % 4000 === 0) minGap = Math.max(8, minGap - 1);
    const x = X0 + _rand() * (X1 - X0);
    const z = Z1 + _rand() * (Z0 - Z1);
    // The ramp runs down the middle of the south end: keep its lane clear.
    if (Math.abs(x) < 34 && z > -44 && z < 62) continue;
    let clear = true;
    for (const s of spots) {
      const dx = s.x - x, dz = s.z - z;
      if (dx * dx + dz * dz < minGap * minGap) { clear = false; break; }
    }
    if (!clear) continue;
    spots.push({ x, z, yaw: (_rand() - 0.5) * Math.PI * 2 });
  }
  return spots;
})();

// Ladder proportions. Base at local y = 0 so the knockable pivots on the floor.
// The museum is built at human scale (the reception desk is 11 tall, the doors
// 26), so these are full-size A-frames: LADDER_SCALE turns the metre-ish
// proportions below into a 6-ft stepladder that stands taller than the desk.
const LADDER = { h: 9, w: 3, base: 3, steps: 5, shelfT: 0.58 };
const LADDER_SCALE = 2.6;

// Where a ladder is actually SOLID: four feet, one under each corner. Between
// them the frame is wide open — the steps are 4 units clear of the floor and the
// rails lean in over your head — so a car aimed carefully down the middle drives
// underneath it without touching anything, while a car that clips a foot brings
// the whole thing down. Measured from LADDER so it follows the model.
const LADDER_FOOT_X = (LADDER.w / 2) * LADDER_SCALE;
const LADDER_FOOT_Z = (LADDER.base / 2) * LADDER_SCALE;
const LADDER_FOOT_R = 1.0;     // the foot plate plus the bottom of its rail
// The car's body, for the ladder's hit test: a rectangle 8.6 long and 3.4 wide,
// sampled at its nose, middle and tail so no part of it is a ghost.
const CAR_HALF_W = 1.7;
const CAR_SAMPLE_D = 2.6;
// How far a colour change takes once the car drives into a puddle of different
// paint while it is already laying a trail: the old paint scrubs off as a pair
// of tyre tracks for two car lengths of the NEW paint before the new colour
// takes over. The countdown only runs while the car is in that paint, so leaving
// the puddle pauses it rather than switching the colour out on bare floor.
const CAR_LEN = CAR_SAMPLE_D * 2 + CAR_HALF_W * 2;   // 8.6, nose to tail
export const PAINT_SWAP_DIST = CAR_LEN * 2;

export const LADDER_FRAME = {
  footX: LADDER_FOOT_X,   // where the four feet sit, in the ladder's own frame
  footZ: LADDER_FOOT_Z,
  footR: LADDER_FOOT_R,   // each foot's solid radius
  carHalfW: CAR_HALF_W,   // half the car's body width, for the gap between them
};

// Paint trail tuning.
const MARK_SPACING = 0.42;   // world units between trail quads
const TRAIL_RUN = 90;        // how far a full load of paint lasts
const SOLID_LOAD = 0.55;     // above this the trail is a solid band
const TRACK_LOAD = 0.45;     // what crossing a tyre-track trail picks up
// Marks the car laid within this distance of travel are its OWN fresh paint:
// driving over them must not count as picking paint up, or the tyres would stay
// wet for ever and the trail would never wear off.
const SELF_PAINT_DIST = 3;
// How far above the floor the paint lies, and how far apart two cars' trails
// sit in depth. The lift has to clear the lobby runner's brass inlays, whose
// tops sit 0.22 above the atrium floor — paint laid on the rug was fighting
// them for the same depth.
const TRAIL_LIFT = 0.34;
const TRAIL_LAYER_GAP = 0.03;
// Puddles take the draw orders above 10, one per spill (they stack, newest on
// top). The tyres' trail is a single mesh, so it has to sit above that whole
// band to stay visible on paint it has been driven through.
const TRAIL_RENDER_ORDER = 100000;
const MAX_MARKS = 18000;     // pooled quads (about 45 full trails)
const WET_SECONDS = 45;      // the puddle keeps picking up on tyres this long
const PUDDLE_MIN = 2.2;      // radius it lands at
const PUDDLE_MAX = 16;       // radius it grows towards
const PUDDLE_TAU = 1.7;      // seconds; the spread slows as it goes
// The empty cans lying in the puddles are props too: drive into one and it
// skitters away, pouring out another puddle as it goes. Each can holds enough
// for a few more pours, then it really is empty.
const CAN_POURS = 3;

// ===== Per-vehicle tyre signatures =====
// Paint keeps the shape of whatever pressed into it, so each ride leaves its own
// marks: two parallel ribbons for a normal car, one wide drum for the
// steamroller (the drum can never split into a pair), fat knobby ruts for the
// monster truck, and separate boot prints for the legged rides (above all the
// giant robot, whose feet must never read as tyres). `track` is the half-gap
// between the twin tyres, `tread` the half-width of one tyre's contact patch and
// `band` the half-width of the full-width wash laid while the tyres are soaked.
// Distances are in the model's own units — the same numbers cars.js places the
// wheels at, so the marks line up with what you can see.
const DEFAULT_TRACK = { track: 0.95, tread: 0.46, band: 1.7 };
const VEHICLE_TRACKS = {
  classic: DEFAULT_TRACK,
  city: DEFAULT_TRACK,
  taxi: DEFAULT_TRACK,
  bug: { track: 0.92, tread: 0.42, band: 1.6 },
  jeep: { track: 0.98, tread: 0.34, band: 1.65 },
  little: { track: 0.55, tread: 0.26, band: 1.0 },
  // Four enormous knobby off-road tyres: wide gauge, huge contact patches.
  monstertruck: { track: 1.22, tread: 0.62, band: 2.6 },
  hotrod: { track: 1.0, tread: 0.45, band: 2.0 },
  bus: { track: 1.1, tread: 0.34, band: 2.05 },
  indy: { track: 0.9, tread: 0.24, band: 1.5 },
  taco: { track: 1.12, tread: 0.34, band: 1.85 },
  tractor: { track: 0.78, tread: 0.42, band: 1.8 },
  firetruck: { track: 1.18, tread: 0.34, band: 2.05 },
  train: { track: 1.05, tread: 0.22, band: 2.2 },
  // The road roller's front drum is 2.5 wide and one piece: a single unbroken
  // ribbon, whatever the paint load — it must NEVER separate into two tracks.
  steamroller: { single: true, track: 0, tread: 1.25, band: 1.25 },
  skateboarder: { track: 0.33, tread: 0.1, band: 0.8 },
  // Legged rides print feet, not tyres. `footAcross`/`footAlong` are the print's
  // full size, `footSpread` how far each foot sits off the centreline, and
  // `stride` the distance between one print and the next.
  robot: { feet: true, footAcross: 2.7, footAlong: 4.4, footSpread: 1.3, stride: 6.4 },
  tarantula: { feet: true, footAcross: 2.2, footAlong: 3.0, footSpread: 2.4, stride: 7.0 },
  crab: { feet: true, footAcross: 1.4, footAlong: 2.0, footSpread: 1.5, stride: 4.4 },
};
function trackProfile(kind) {
  return VEHICLE_TRACKS[kind] || DEFAULT_TRACK;
}
const CAN_HIT_R = 3.2;       // car centre to can: the car's flank + a can
const CAN_HIT_CD = 0.35;     // seconds between shoves of the same can
const CAN_DRAG = 0.06;       // per-second speed left after friction

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// ---- Shared geometry and material caches -----------------------------------
// A hundred ladders is a lot of parts, and every ladder is the same ladder in a
// different paint: they all share these, instead of building (and uploading) a
// private copy of every rail, step, foot and drip.
const _boxGeos = new Map();
function boxGeometry(w, h, d) {
  const key = `b${w}|${h}|${d}`;
  let g = _boxGeos.get(key);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); _boxGeos.set(key, g); }
  return g;
}
const _cylGeos = new Map();
function cylinderGeometry(rt, rb, h, seg) {
  const key = `c${rt}|${rb}|${h}|${seg}`;
  let g = _cylGeos.get(key);
  if (!g) { g = new THREE.CylinderGeometry(rt, rb, h, seg); _cylGeos.set(key, g); }
  return g;
}
const _torGeos = new Map();
function torusGeometry(r, tube, rs, ts, arc) {
  const key = `t${r}|${tube}|${rs}|${ts}|${arc}`;
  let g = _torGeos.get(key);
  if (!g) { g = new THREE.TorusGeometry(r, tube, rs, ts, arc); _torGeos.set(key, g); }
  return g;
}

// One material per paint colour, shared by every bucket, puddle and droplet of
// that colour (the paint on the buckets is the paint on the floor).
const _paintMats = new Map();
function paintMaterial(color) {
  let m = _paintMats.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, roughness: 0.4, metalness: 0.04,
      emissive: color, emissiveIntensity: 0.08,
    });
    _paintMats.set(color, m);
  }
  return m;
}
const _puddleMats = new Map();
function puddleMaterial(color) {
  let m = _puddleMats.get(color);
  if (!m) {
    // Lit paint, not glowing paint: the trail the tyres leave is lit by the same
    // lights and tinted the same colour, so the two match exactly. Transparent
    // with no depth write, so overlapping puddles blend in draw order — newest
    // on top — instead of fighting for the same depth.
    m = new THREE.MeshStandardMaterial({
      color, roughness: 0.3, metalness: 0.02,
      transparent: true, depthWrite: false,
    });
    _puddleMats.set(color, m);
  }
  return m;
}
const _dropMats = new Map();
function dropMaterial(color) {
  let m = _dropMats.get(color);
  if (!m) { m = new THREE.MeshBasicMaterial({ color }); _dropMats.set(color, m); }
  return m;
}

// Concatenate a list of { geo, x, y, z, rx, ry, rz } into one BufferGeometry.
// Only the browser needs this: the headless stub keeps sizes in `params` and has
// no vertices, so there it hands back an empty geometry and the build still runs
// (the build tests count ladders, not triangles).
function mergeParts(parts) {
  const first = parts.find((p) => p.geo && p.geo.attributes && p.geo.attributes.position);
  if (!first) return new THREE.BufferGeometry();

  const prepared = [];
  let count = 0;
  const m4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const pos3 = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  for (const p of parts) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    quat.setFromEuler(euler.set(p.rx, p.ry, p.rz));
    g.applyMatrix4(m4.compose(pos3.set(p.x, p.y, p.z), quat, one));
    prepared.push(g);
    count += g.attributes.position.count;
  }

  const pos = new Float32Array(count * 3);
  const nrm = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  let o = 0;
  for (const g of prepared) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nrm.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += n;
    g.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  merged.computeBoundingSphere();
  return merged;
}

// ---- Procedural textures ---------------------------------------------------
function canvasTexture(draw, w = 256, h = 256, rx = 1, ry = 1) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) return null;
  draw(g, w, h);
  const tex = new THREE.CanvasTexture(c);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  if (THREE.RepeatWrapping) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(rx, ry);
  tex.anisotropy = 4;
  return tex;
}

// Heavy white canvas, stitched into panels and a little creased.
function dropClothTexture() {
  return canvasTexture((g, w, h) => {
    g.fillStyle = '#f6f3ea';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5200; i++) {
      g.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(120,112,98,0.06)';
      g.fillRect(Math.random() * w, Math.random() * h, 2, 1);
    }
    // Stitched seams dividing the drop cloth into panels.
    g.strokeStyle = 'rgba(196,188,172,0.7)';
    g.lineWidth = 2;
    for (let x = 0; x <= w; x += w / 8) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + 5, h);
      g.stroke();
    }
    for (let y = 0; y <= h; y += h / 12) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y + 4);
      g.stroke();
    }
    // A few soft creases so the huge cloth is not a flat white sheet.
    g.strokeStyle = 'rgba(210,204,190,0.45)';
    g.lineWidth = 7;
    for (let i = 0; i < 7; i++) {
      const x = Math.random() * w;
      g.beginPath();
      g.moveTo(x, 0);
      g.bezierCurveTo(x + 60, h * 0.35, x - 70, h * 0.7, x + 30, h);
      g.stroke();
    }
  }, 1024, 1024, 7, 7);
}

// The trail's texture: an unbroken band, fully opaque across the middle and
// feathering only at the two long edges. A radial splat per quad scalloped the
// edges (every quad bulged and faded at its own ends); a band that is constant
// along the direction of travel joins its neighbours into one smooth-edged
// stroke.
function paintBandTexture() {
  return canvasTexture((g, w, h) => {
    g.clearRect(0, 0, w, h);
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.06, 'rgba(255,255,255,0)');
    grad.addColorStop(0.16, 'rgba(255,255,255,1)');
    grad.addColorStop(0.84, 'rgba(255,255,255,1)');
    grad.addColorStop(0.94, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  }, 8, 64, 1, 1);
}

const _rgbCache = new Map();
function rgbOf(hex) {
  let c = _rgbCache.get(hex);
  if (!c) {
    const col = new THREE.Color(hex);
    c = {
      r: Number.isFinite(col.r) ? col.r : ((hex >> 16) & 255) / 255,
      g: Number.isFinite(col.g) ? col.g : ((hex >> 8) & 255) / 255,
      b: Number.isFinite(col.b) ? col.b : (hex & 255) / 255,
    };
    _rgbCache.set(hex, c);
  }
  return c;
}

// ============================================================================
// buildPaintExhibit(parentGroup, { floorY, bounds, preview })
// ============================================================================
export function buildPaintExhibit(parent, options = {}) {
  const floorY = options.floorY ?? -36;
  const bounds = options.bounds ?? { x0: -167.5, x1: 167.5, z0: -265.5, z1: 69 };
  const preview = !!options.preview;
  // The floor height at a point. Paint follows whatever the car is driving on,
  // so a trail left with paint on the tyres runs up the ramp and into the lobby
  // instead of being pinned to the exhibit floor.
  const surfaceAt = options.surfaceAt || (() => floorY);
  // The room's ladder plan. Overridable so a test (or the object browser) can
  // stand one ladder up on its own.
  const spots = options.spots ?? LADDER_SPOTS;

  const group = new THREE.Group();
  group.name = 'museumPaintExhibit';
  parent.add(group);

  const sizeX = bounds.x1 - bounds.x0;
  const sizeZ = bounds.z1 - bounds.z0;
  const midX = (bounds.x0 + bounds.x1) / 2;
  const midZ = (bounds.z0 + bounds.z1) / 2;

  // ---- The giant white drop cloth -----------------------------------------
  const clothMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0 });
  const clothTex = dropClothTexture();
  if (clothTex) {
    clothMat.map = clothTex;
    clothMat.needsUpdate = true;
  }
  const cloth = new THREE.Mesh(new THREE.BoxGeometry(sizeX, 0.12, sizeZ), clothMat);
  cloth.position.set(midX, floorY + 0.06, midZ);
  cloth.receiveShadow = true;
  group.add(cloth);

  // ---- Shared materials and geometry --------------------------------------
  // Low metalness: the deep hall is lit by a handful of point lights, and a
  // shiny metal surface with no environment map just reads as black. Two greys
  // are enough now that each ladder's parts are merged by material: the light
  // frame (rails, steps, shelf) and the darker fittings (feet, bars, hinge).
  const railMat = new THREE.MeshStandardMaterial({ color: 0xcbd2d8, roughness: 0.5, metalness: 0.15 });
  const handleMat = new THREE.MeshStandardMaterial({ color: 0x99a1a8, roughness: 0.55, metalness: 0.2 });
  const bucketMat = new THREE.MeshStandardMaterial({ color: 0xe8eaed, roughness: 0.45, metalness: 0.2 });

  const dropGeo = new THREE.SphereGeometry(0.3, 6, 6);
  const canGeo = new THREE.CylinderGeometry(0.78, 0.62, 1.5, 16);
  const canRimGeo = new THREE.TorusGeometry(0.78, 0.13, 8, 18);
  const puddleGeoBase = new THREE.CircleGeometry(1, 44);
  puddleGeoBase.rotateX(-Math.PI / 2);

  // ---- One ladder, with its shelf, bucket and drips -----------------------
  // A hundred ladders is more than the renderer can pay for as thirty separate
  // meshes each, so the parts are merged by material into five meshes and — as
  // every ladder is the same ladder — those five geometries are built once and
  // shared by all of them.
  const ladderGeos = (() => {
    const H = LADDER.h;
    const W = LADDER.w;
    const halfD = LADDER.base / 2;
    const legAngle = Math.atan2(halfD, H);
    const legLen = Math.hypot(H, halfD);
    const shelfY = H * LADDER.shelfT;
    const shelfZ = halfD * (1 - LADDER.shelfT) + 0.95;
    const metal = [];        // rails, steps, shelf
    const dark = [];         // feet, back bars, hinge
    const bucketBody = [];
    const bucketPaint = [];  // the band, the paint surface and the drips
    const bucketBail = [];
    const at = (list, geo, x, y, z, rx = 0, ry = 0, rz = 0) =>
      list.push({ geo, x, y, z, rx, ry, rz });

    const railGeo = boxGeometry(0.34, legLen, 0.5);
    const footGeo = boxGeometry(0.55, 0.18, 0.7);
    for (const s of [-1, 1]) {
      // Front (steps) legs lean in from +z; rear (bars) legs mirror them.
      at(metal, railGeo, s * (W / 2), H / 2, halfD / 2, -legAngle, 0, 0);
      at(metal, railGeo, s * (W / 2), H / 2, -halfD / 2, legAngle, 0, 0);
      // Feet.
      at(dark, footGeo, s * (W / 2), 0.09, halfD);
      at(dark, footGeo, s * (W / 2), 0.09, -halfD);
    }

    // Flat steps on the front, bars on the back.
    const stepGeo = boxGeometry(W - 0.35, 0.17, 0.95);
    const barGeo = cylinderGeometry(0.09, 0.09, W - 0.3, 8);
    for (let i = 1; i <= LADDER.steps; i++) {
      const t = i / (LADDER.steps + 1);
      const y = H * t;
      at(metal, stepGeo, 0, y, halfD * (1 - t));
      at(dark, barGeo, 0, y, -halfD * (1 - t), 0, 0, Math.PI / 2);
    }

    // Top cap / hinge platform.
    at(metal, boxGeometry(W + 0.25, 0.28, 1.05), 0, H + 0.05, 0);
    at(dark, cylinderGeometry(0.13, 0.13, W + 0.1, 8), 0, H + 0.23, 0, 0, 0, Math.PI / 2);

    // Shelf with a bucket of paint on it, sticking out over the steps.
    at(metal, boxGeometry(2.7, 0.16, 1.7), 0, shelfY, shelfZ);
    at(metal, boxGeometry(2.7, 0.34, 0.12), 0, shelfY + 0.24, shelfZ + 0.83);
    for (const s of [-1, 1]) {
      at(metal, boxGeometry(0.14, 0.95, 0.14), s * 1.1, shelfY - 0.48, shelfZ - 0.45);
    }

    // The bucket, in its own little space (the group a spill hides).
    at(bucketBody, cylinderGeometry(0.78, 0.62, 1.5, 16), 0, 0.75, 0);
    // A fat band of paint round the rim — this is what reads as "full of
    // colour" from any angle.
    at(bucketPaint, cylinderGeometry(0.83, 0.81, 0.44, 16), 0, 1.28, 0);
    at(bucketPaint, cylinderGeometry(0.72, 0.72, 0.05, 16), 0, 1.51, 0);
    // Drips running down the outside, longest under the band.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + (i % 2) * 0.22;
      const len = 0.4 + ((i * 37) % 10) / 10 * 1.2;
      const r = 0.82;
      at(bucketPaint, cylinderGeometry(0.07, 0.045, len, 6),
        Math.cos(a) * r, 1.5 - len / 2 - 0.1, Math.sin(a) * r);
    }
    // Bail handle.
    at(bucketBail, torusGeometry(0.6, 0.05, 6, 14, Math.PI), 0, 1.46, 0);

    return {
      metal: mergeParts(metal),
      dark: mergeParts(dark),
      bucketBody: mergeParts(bucketBody),
      bucketPaint: mergeParts(bucketPaint),
      bucketBail: mergeParts(bucketBail),
      shelfY,
      shelfZ,
    };
  })();

  const buildLadder = (paint) => {
    const g = new THREE.Group();
    const add = (geo, mat, parent = g) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    add(ladderGeos.metal, railMat);
    add(ladderGeos.dark, handleMat);

    const bucket = new THREE.Group();
    bucket.position.set(0, ladderGeos.shelfY + 0.08, ladderGeos.shelfZ);
    g.add(bucket);
    add(ladderGeos.bucketBody, bucketMat, bucket);
    add(ladderGeos.bucketPaint, paintMaterial(paint.color), bucket);
    add(ladderGeos.bucketBail, handleMat, bucket);

    return { group: g, bucket };
  };

  // ---- Stand the two hundred ladders up ----------------------------------
  // A ladder is an open frame, so it answers the car with its own shape: the
  // four feet are solid, the middle is not. `point` is one sample of the car's
  // body, `radius` its half-width; the answer is the offset from that sample to
  // the foot that was touched (which is also the direction to push it).
  const ladderHitTest = (point, radius, k, worldPos) => {
    // The hall floor and the ramp above it share this x/z, so never knock a prop
    // on the other storey.
    if (Math.abs(point.y - worldPos.y) > 4) return null;
    if (k.state === 'standing') {
      const yaw = k.group.rotation.y;
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const dx = point.x - worldPos.x;
      const dz = point.z - worldPos.z;
      // Into the ladder's own frame: its feet are the four corners of the frame.
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      let best = Infinity;
      let hit = null;
      for (const fx of [-1, 1]) {
        for (const fz of [-1, 1]) {
          const ax = lx - fx * LADDER_FOOT_X;
          const az = lz - fz * LADDER_FOOT_Z;
          const d = Math.hypot(ax, az);
          if (d > radius + LADDER_FOOT_R || d >= best) continue;
          best = d;
          // Back out of the ladder's frame, pointing at the foot.
          const ox = -ax, oz = -az;
          hit = { dx: ox * c + oz * s, dz: -ox * s + oz * c };
        }
      }
      return hit;
    }
    // Down and lying: the body is a strip from the pivot out along pushDir.
    let dx = worldPos.x - point.x;
    let dz = worldPos.z - point.z;
    const along = -(dx * k.pushDir.x + dz * k.pushDir.z);
    const t = clamp(along, 0, k.lyingReach);
    dx += k.pushDir.x * t;
    dz += k.pushDir.z * t;
    return Math.hypot(dx, dz) <= radius + k.radius ? { dx, dz } : null;
  };

  const ladders = spots.map((spot, i) => {
    const paint = RAINBOW_PAINTS[i % RAINBOW_PAINTS.length];
    const built = buildLadder(paint);
    built.group.position.set(spot.x, floorY, spot.z);
    built.group.rotation.y = spot.yaw;
    built.group.scale.setScalar(LADDER_SCALE);
    group.add(built.group);
    // Previews (the object browser) must not register live props. Once a ladder
    // is down it stays a physical prop: drive into it and it skitters out of the
    // way like a traffic car. It is a long prop lying out from its foot, so the
    // hit test has to reach the whole length (lyingReach), and it is light.
    const knock = preview
      ? null
      : addKnockable(built.group, 2.0 * LADDER_SCALE, {
        mode: 'fall', fallTime: 0.85, slideDistance: 0.7,
        shovePower: 16, shoveSpinPower: 3.2,
        lyingReach: LADDER.h * LADDER_SCALE,
        hitTest: ladderHitTest,
      });
    return { spot, paint, group: built.group, bucket: built.bucket, knock, spilled: false };
  });

  // ---- The paint trail pool ----------------------------------------------
  const markVerts = MAX_MARKS * 6;
  const trailGeo = new THREE.BufferGeometry();
  // Float32BufferAttribute COPIES the array it is given, so write into the
  // attribute's own buffers — not the temporaries we handed it.
  const posAttr = new THREE.Float32BufferAttribute(new Float32Array(markVerts * 3), 3);
  const colAttr = new THREE.Float32BufferAttribute(new Float32Array(markVerts * 4), 4);
  const uvAttr = new THREE.Float32BufferAttribute(new Float32Array(markVerts * 2), 2);
  // Every mark lies flat on the floor and is lit like the puddle it came from,
  // so the normals are simply up. Without them the lit material renders the
  // trail almost black.
  const nrmArr = new Float32Array(markVerts * 3);
  for (let i = 0; i < markVerts; i++) nrmArr[i * 3 + 1] = 1;
  const nrmAttr = new THREE.Float32BufferAttribute(nrmArr, 3);
  trailGeo.setAttribute('position', posAttr);
  trailGeo.setAttribute('color', colAttr);
  trailGeo.setAttribute('uv', uvAttr);
  trailGeo.setAttribute('normal', nrmAttr);
  const posArr = posAttr.array;
  const colArr = colAttr.array;
  const uvArr = uvAttr.array;
  const setDrawCount = (verts) => {
    if (typeof trailGeo.setDrawRange === 'function') trailGeo.setDrawRange(0, verts);
    else trailGeo.drawRange = { start: 0, count: verts };
  };
  setDrawCount(0);
  const band = paintBandTexture();
  // Lit exactly like the puddle it came from, and tinted by the puddle's own
  // colour, so the trail is the same paint on the floor — not a brighter,
  // washed-out stripe.
  const trailMat = new THREE.MeshStandardMaterial({
    map: band || undefined,
    vertexColors: true,
    roughness: 0.3,
    metalness: 0.02,
    transparent: true,
    depthWrite: false,
    // Lift the paint off the surface in depth space as well as in world space:
    // the lobby's crimson runner sits a hair under the trail, and without this
    // the two fight for the same depth across the room.
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    side: THREE.DoubleSide,
  });
  const trail = new THREE.Mesh(trailGeo, trailMat);
  trail.frustumCulled = false;
  // Puddles are transparent with no depth write, so whatever is drawn LAST wins
  // outright — the depth buffer cannot settle it. The tyres' paint is the newest
  // paint on the floor (it is laid on top of whatever pool it drives through), so
  // the trail has to be drawn after every puddle: pulling a fresh puddle over an
  // old trail would otherwise wipe the tracks straight off it.
  trail.renderOrder = TRAIL_RENDER_ORDER;
  group.add(trail);

  // A parallel record of every mark, so the car can drive back through its own
  // paint: where it is, how wide (a band or just a tyre track) and in what
  // colour. Plain typed arrays — this is scanned once per frame.
  const markX = new Float32Array(MAX_MARKS);
  const markZ = new Float32Array(MAX_MARKS);
  const markY = new Float32Array(MAX_MARKS);
  const markR = new Float32Array(MAX_MARKS);
  const markOdo = new Float32Array(MAX_MARKS);
  const markCol = new Uint32Array(MAX_MARKS);
  const markSolid = new Uint8Array(MAX_MARKS);

  let markCount = 0;
  let dirty = false;
  // How many marks each car has laid, so the multiplayer / chase-car behaviour
  // can be checked rather than guessed at.
  const marksBy = new Map();
  // Counter-clockwise seen from above, so the marks' faces point at the sky
  // (and at the lights) like the puddle's do: addQuad's corners are already in
  // that order, so the triangles take them as they come.
  const markOrder = [0, 1, 2, 0, 2, 3];

  // One trapezoid of the stroke, from its near edge (p0, p3) to its far edge
  // (p1, p2). The ribbon's quads SHARE those edges, so consecutive quads tile
  // exactly and the stroke's sides are one unbroken line — overlapping quads
  // each blending their own soft edge is what scalloped the old trail. `odo` is
  // the drawing car's travel distance, recorded so it can ignore its own fresh
  // paint when it picks paint back up.
  const addQuad = (p0, p1, p2, p3, hex, alpha, solid, odo, painterId, paintY, refY) => {
    if (markCount >= MAX_MARKS) return;
    const corners = [
      [p0[0], p0[1], 0, 0],
      [p1[0], p1[1], 1, 0],
      [p2[0], p2[1], 1, 1],
      [p3[0], p3[1], 0, 1],
    ];
    const { r, g, b } = rgbOf(hex);
    for (let v = 0; v < 6; v++) {
      const c = corners[markOrder[v]];
      const vi = markCount * 6 + v;
      posArr[vi * 3] = c[0];
      // Each corner sits on the floor under it, so a trail laid with paint on
      // the tyres climbs the ramp and runs out into the lobby with the car. The
      // lift clears the runner it crosses on the lobby floor; paintY adds this
      // car's own layer so two cars' trails never share a depth. `refY` is the
      // car's own height, which is what tells the level whether the corner is
      // under the ramp or on it.
      posArr[vi * 3 + 1] = surfaceAt(c[0], c[1], refY) + paintY;
      posArr[vi * 3 + 2] = c[1];
      colArr[vi * 4] = r;
      colArr[vi * 4 + 1] = g;
      colArr[vi * 4 + 2] = b;
      colArr[vi * 4 + 3] = alpha;
      uvArr[vi * 2] = c[2];
      uvArr[vi * 2 + 1] = c[3];
    }
    // The pickup record: where the paint is, how wide it is and its colour.
    const cx = (p0[0] + p1[0] + p2[0] + p3[0]) / 4;
    const cz = (p0[1] + p1[1] + p2[1] + p3[1]) / 4;
    let far = 0;
    for (const p of [p0, p1, p2, p3]) {
      far = Math.max(far, Math.hypot(p[0] - cx, p[1] - cz));
    }
    markX[markCount] = cx;
    markZ[markCount] = cz;
    markY[markCount] = surfaceAt(cx, cz, refY) + 0.14;
    markR[markCount] = far + 0.6;
    markOdo[markCount] = odo;
    markCol[markCount] = hex;
    markSolid[markCount] = solid ? 1 : 0;
    markCount++;
    marksBy.set(painterId, (marksBy.get(painterId) || 0) + 1);
    dirty = true;
  };

  // ---- Spills -------------------------------------------------------------
  const spills = [];
  // Newest puddle on top: each spill takes the next draw order, so where two
  // of them overlap the later one wins instead of the pair z-fighting.
  let spillOrder = 10;

  // One puddle of paint on the floor. `maxR` is the radius it spreads to; a can
  // that gets knocked about pours a smaller, fresher one each time.
  const addPuddle = (cx, cz, color, maxR) => {
    // The puddle is lit paint, not a glowing one: the trail the tyres leave is
    // lit by the same lights and tinted the same colour, so the two match.
    // Puddles are stacked, newest on top: they all lie flat on the same floor,
    // so without an order two of them at the same depth z-fight into a mess.
    const puddleMat = puddleMaterial(color);
    const mesh = new THREE.Mesh(puddleGeoBase, puddleMat);
    mesh.position.set(cx, floorY + 0.24, cz);
    mesh.scale.set(PUDDLE_MIN, 1, PUDDLE_MIN);
    mesh.renderOrder = ++spillOrder;
    group.add(mesh);
    const s = {
      x: cx, z: cz, color, mesh, can: null, maxR,
      radius: PUDDLE_MIN, age: 0, drops: [],
    };
    spills.push(s);
    return s;
  };

  // A quick burst of droplets, thrown up out of the can as it goes over.
  const addDrops = (s, n, spread) => {
    const dropMat = dropMaterial(s.color);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (2 + Math.random() * 5) * spread;
      const d = new THREE.Mesh(dropGeo, dropMat);
      d.position.set(s.x, floorY + 2.9 + Math.random() * 2.0, s.z);
      group.add(d);
      s.drops.push({
        mesh: d,
        vx: Math.cos(a) * sp,
        vz: Math.sin(a) * sp,
        vy: 7 + Math.random() * 9,
      });
    }
  };

  const startSpill = (L) => {
    L.spilled = true;
    const k = L.knock;
    const dirX = k && k.pushDir ? k.pushDir.x : 0;
    const dirZ = k && k.pushDir ? k.pushDir.z : 1;
    const bx = k && k.basePos ? k.basePos.x : L.spot.x;
    const bz = k && k.basePos ? k.basePos.z : L.spot.z;
    const cx = clamp(bx + dirX * 1.9 * LADDER_SCALE, bounds.x0 + PUDDLE_MAX * 0.55, bounds.x1 - PUDDLE_MAX * 0.55);
    const cz = clamp(bz + dirZ * 1.9 * LADDER_SCALE, bounds.z0 + PUDDLE_MAX * 0.55, bounds.z1 - PUDDLE_MAX * 0.55);

    const s = addPuddle(cx, cz, L.paint.color, PUDDLE_MAX);

    // The can lies on its side by the spreading puddle, empty. It is a prop of
    // its own from here on: hit it and it skitters away, pouring out more paint
    // as it goes (see `updateCans` below).
    const can = new THREE.Group();
    const body = new THREE.Mesh(canGeo, bucketMat);
    body.rotation.z = Math.PI / 2;
    can.add(body);
    const rim = new THREE.Mesh(canRimGeo, puddleMaterial(L.paint.color));
    rim.position.set(0.72, 0, 0);
    rim.rotation.y = Math.PI / 2;
    can.add(rim);
    can.scale.setScalar(LADDER_SCALE);
    can.position.set(cx + dirX * 1.3 * LADDER_SCALE, floorY + 0.78 * LADDER_SCALE, cz + dirZ * 1.3 * LADDER_SCALE);
    can.rotation.y = Math.atan2(dirX, dirZ);
    group.add(can);
    s.can = can;
    Object.assign(s, { canVx: 0, canVz: 0, canSpin: 0, canCd: 0, canPours: CAN_POURS });

    addDrops(s, 12, LADDER_SCALE);

    // The can that rode the ladder down is gone; the spilled one replaces it.
    L.bucket.visible = false;
  };

  // More paint out of a can that just got hit: a fresh, smaller puddle where the
  // can now lies, plus another burst of droplets. A can only holds so much, so
  // the extra pour runs out after CAN_POURS hits.
  const canPour = (s) => {
    if (s.canPours <= 0) return;
    s.canPours--;
    const cx = clamp(s.can.position.x, bounds.x0 + 1, bounds.x1 - 1);
    const cz = clamp(s.can.position.z, bounds.z0 + 1, bounds.z1 - 1);
    addDrops(addPuddle(cx, cz, s.color, PUDDLE_MAX * 0.55), 8, LADDER_SCALE * 0.7);
  };

  // ---- The cars' paint trails ---------------------------------------------
  // Every car that can carry paint keeps its own stroke: the player, the
  // split-screen twin (P2) and the blue chase car all lay paint independently,
  // so one car's wet tyres never top up another's.
  const painters = new Map();
  const painterFor = (id) => {
    let p = painters.get(id);
    if (!p) {
      p = {
        id,
        // Each car paints at its own hair's-breadth height, so one car's trail
        // crossing another's does not z-fight: the paint always reads as paint.
        layer: painters.size,
        lastX: null,
        lastZ: null,
        load: 0,          // 0..1 paint carried on the tyres
        color: 0,
        // Which ride is painting: picks this vehicle's tyre signature (or its
        // feet), so a monster truck and a steamroller do not leave the same
        // pair of ribbons as a hatchback.
        kind: 'classic',
        // True while the tyres carry enough to lay the full-width band; paint
        // picked up from a tyre-track mark only ever leaves tyre tracks.
        solid: false,
        odometer: 0,
        // Set when the car drives into a puddle of a DIFFERENT colour while it
        // is already wearing paint: the old colour scrubs off as a pair of tyre
        // tracks for PAINT_SWAP_DIST of the new paint, then this switches it.
        wear: null,
        // Each stroke is a ribbon: `edge` is where the previous quad ended, so
        // the next quad starts from exactly there and the two share their edge.
        bandEdge: null,
        trackEdgeL: null,
        trackEdgeR: null,
        // Footprints (the legged rides) step along instead of drawing ribbons.
        footAcc: 0,       // distance since the last print
        footSide: 1,      // which foot is next: +1 or -1
      };
      painters.set(id, p);
    }
    return p;
  };
  const p1 = painterFor('p1');

  const clearStroke = (pa) => {
    pa.bandEdge = null;
    pa.trackEdgeL = null;
    pa.trackEdgeR = null;
    pa.footAcc = 0;
    // A half-done colour change dies with the stroke: the next stroke starts on
    // clean tyres, not mid-scrub.
    pa.wear = null;
  };

  const extendRibbon = (edge, fromX, fromZ, toX, toZ, halfWid, hex, alpha, solid, odo, painterId, paintY, refY) => {
    const dx = toX - fromX, dz = toZ - fromZ;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len, nz = dx / len;
    const near = edge || {
      l: [fromX + nx * halfWid, fromZ + nz * halfWid],
      r: [fromX - nx * halfWid, fromZ - nz * halfWid],
    };
    const far = {
      l: [toX + nx * halfWid, toZ + nz * halfWid],
      r: [toX - nx * halfWid, toZ - nz * halfWid],
    };
    addQuad(near.l, far.l, far.r, near.r, hex, alpha, solid, odo, painterId, paintY, refY);
    return far;
  };

  // One boot print's pad: a rectangle `halfAcross` wide and `halfAlong` long,
  // centred at (cx, cz) and squared to the direction of travel.
  const emitFootPad = (cx, cz, dirX, dirZ, halfAcross, halfAlong, pa, alpha, paintY, refY) => {
    const ax = dirX * halfAlong, az = dirZ * halfAlong;
    const bx = -dirZ * halfAcross, bz = dirX * halfAcross;
    addQuad(
      [cx - ax + bx, cz - az + bz],
      [cx + ax + bx, cz + az + bz],
      [cx + ax - bx, cz + az - bz],
      [cx - ax - bx, cz - az - bz],
      pa.color, alpha, false, pa.odometer, pa.id, paintY, refY,
    );
  };

  // One footprint: alternate feet left and right of the centreline, each print a
  // broad toe pad plus a narrower heel pad, so the mark reads as a boot rather
  // than a tyre segment. Sized from the ride's own profile (the giant robot's
  // is 2.7 x 4.4).
  const addFootprint = (pa, cx, cz, dirX, dirZ, prof, alpha, paintY, refY) => {
    pa.footSide = -(pa.footSide || 1);
    const latX = -dirZ, latZ = dirX;
    const fx = cx + latX * (prof.footSpread || 0) * pa.footSide;
    const fz = cz + latZ * (prof.footSpread || 0) * pa.footSide;
    const W = prof.footAcross, L = prof.footAlong;
    // Toe: the wide front of the foot.
    emitFootPad(fx + dirX * L * 0.26, fz + dirZ * L * 0.26, dirX, dirZ,
      W * 0.5, L * 0.26, pa, alpha, paintY, refY);
    // Heel: narrower and set back.
    emitFootPad(fx - dirX * L * 0.24, fz - dirZ * L * 0.24, dirX, dirZ,
      W * 0.33, L * 0.22, pa, alpha, paintY, refY);
  };

  const layTrail = (pa, x0, z0, x1, z1, dist, refY) => {
    const prof = trackProfile(pa.kind);
    const dirX = (x1 - x0) / dist;
    const dirZ = (z1 - z0) / dist;
    const steps = Math.max(1, Math.ceil(dist / MARK_SPACING));
    const stepDist = dist / steps;
    const paintY = TRAIL_LIFT + pa.layer * TRAIL_LAYER_GAP;
    let fx = x0, fz = z0;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const px = x0 + (x1 - x0) * t;
      const pz = z0 + (z1 - z0) * t;
      const alpha = Math.min(1, pa.load / 0.14);
      if (prof.feet) {
        // Stepping marks: no ribbons at all.
        pa.bandEdge = null;
        pa.trackEdgeL = null;
        pa.trackEdgeR = null;
        pa.footAcc = (pa.footAcc || 0) + stepDist;
        if (pa.footAcc >= prof.stride) {
          pa.footAcc -= prof.stride;
          addFootprint(pa, px, pz, dirX, dirZ, prof, alpha, paintY, refY);
        }
      } else if (prof.single) {
        // One piece of rubber on the road (the steamroller's drum): a single
        // wide ribbon that stays whole however thin the paint gets.
        pa.trackEdgeL = null;
        pa.trackEdgeR = null;
        pa.bandEdge = extendRibbon(pa.bandEdge, fx, fz, px, pz, prof.tread, pa.color, alpha, true, pa.odometer, pa.id, paintY, refY);
      } else if (pa.solid && pa.load > SOLID_LOAD) {
        // Full-width band while the tyres are soaked.
        pa.trackEdgeL = null;
        pa.trackEdgeR = null;
        pa.bandEdge = extendRibbon(pa.bandEdge, fx, fz, px, pz, prof.band, pa.color, alpha, true, pa.odometer, pa.id, paintY, refY);
      } else {
        // Thinning out: just the two tyre tracks, at this vehicle's gauge and
        // tread width.
        pa.bandEdge = null;
        const ox = -dirZ * prof.track;
        const oz = dirX * prof.track;
        pa.trackEdgeL = extendRibbon(pa.trackEdgeL, fx + ox, fz + oz, px + ox, pz + oz, prof.tread, pa.color, alpha, false, pa.odometer, pa.id, paintY, refY);
        pa.trackEdgeR = extendRibbon(pa.trackEdgeR, fx - ox, fz - oz, px - ox, pz - oz, prof.tread, pa.color, alpha, false, pa.odometer, pa.id, paintY, refY);
      }
      fx = px;
      fz = pz;
      pa.load -= stepDist / TRAIL_RUN;
      if (pa.load <= 0) {
        pa.load = 0;
        clearStroke(pa);
        break;
      }
    }
  };

  // `others` is any extra car in the room this frame: { id, pos, speed, knock }.
  // The split-screen twin passes knock: true; the chase car passes knock: false
  // so it can lay paint but never topple the exhibit. `carYaw` is the player's
  // heading, which the ladder hit test needs to know where their body is.
  const update = (delta, carPos, speed = 0, others = null, carYaw = null, carKind = null) => {
    // Spills spread and their droplets settle.
    for (const s of spills) {
      s.age += delta;
      const r = PUDDLE_MIN + (s.maxR - PUDDLE_MIN) * (1 - Math.exp(-s.age / PUDDLE_TAU));
      s.radius = r;
      s.mesh.scale.set(r, 1, r);
      for (let i = s.drops.length - 1; i >= 0; i--) {
        const d = s.drops[i];
        d.vy -= 30 * delta;
        d.mesh.position.x += d.vx * delta;
        d.mesh.position.z += d.vz * delta;
        d.mesh.position.y += d.vy * delta;
        if (d.mesh.position.y <= floorY + 0.3 || s.age > 1.8) {
          group.remove(d.mesh);
          s.drops.splice(i, 1);
        }
      }
    }

    // A ladder that is no longer standing spills its can.
    for (const L of ladders) {
      if (!L.spilled && L.knock && L.knock.state !== 'standing') startSpill(L);
    }

    if (dirty) {
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      uvAttr.needsUpdate = true;
      setDrawCount(markCount * 6);
      dirty = false;
    }

    // Then every car lays its own paint: the player first, then whoever else is
    // in the room (P2, and the chase car, which may not touch the exhibit).
    updatePainter(p1, carPos, speed, true, carYaw, carKind);
    if (others) {
      for (const o of others) {
        if (!o || !o.pos) continue;
        updatePainter(painterFor(o.id || 'other'), o.pos, o.speed || 0, o.knock !== false, o.yaw ?? null, o.kind || null);
      }
    }

    updateCans(delta, carPos, speed, others);
  };

  // The empty cans lying in the puddles: slide them along the floor when a car
  // hits them, and let them pour out more paint as they go. They are not part of
  // the ladder system (a can is already down), so their slide is a little
  // self-contained bit of physics: hit it and it skids away and spins to a stop.
  function updateCans(delta, carPos, speed, others) {
    const cars = [];
    if (carPos) cars.push({ pos: carPos, speed: Math.abs(speed) });
    if (others) {
      for (const o of others) if (o && o.pos) cars.push({ pos: o.pos, speed: Math.abs(o.speed || 0) });
    }

    for (const s of spills) {
      if (!s.can) continue;
      if (s.canCd > 0) s.canCd -= delta;

      // Slide, with the same per-second damping whatever the frame rate.
      if (s.canVx || s.canVz || s.canSpin) {
        s.can.position.x += s.canVx * delta;
        s.can.position.z += s.canVz * delta;
        s.can.rotation.y += s.canSpin * delta;
        const damp = Math.pow(CAN_DRAG, delta);
        s.canVx *= damp;
        s.canVz *= damp;
        s.canSpin *= damp;
        if (Math.hypot(s.canVx, s.canVz) < 0.12) {
          s.canVx = 0;
          s.canVz = 0;
          s.canSpin = 0;
        }
        s.can.position.x = clamp(s.can.position.x, bounds.x0 + 1, bounds.x1 - 1);
        s.can.position.z = clamp(s.can.position.z, bounds.z0 + 1, bounds.z1 - 1);
      }

      // Hit it and it goes: shoved away from the car, spinning, and pouring
      // another puddle out where it lands.
      if (s.canCd > 0) continue;
      for (const c of cars) {
        if (Math.abs(s.can.position.y - c.pos.y) > 4) continue;   // other storey
        const dx = s.can.position.x - c.pos.x;
        const dz = s.can.position.z - c.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > CAN_HIT_R) continue;
        const nx = d > 1e-4 ? dx / d : 1;
        const nz = d > 1e-4 ? dz / d : 0;
        const push = 3 + c.speed * 0.55;
        s.canVx = nx * push;
        s.canVz = nz * push;
        s.canSpin = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 3);
        s.canCd = CAN_HIT_CD;
        canPour(s);
        break;
      }
    }
  }


  // One car's frame: knock over what it runs into (if it is allowed to), then
  // pick paint up and lay it back down.
  function updatePainter(pa, carPos, speed, canKnock, carYaw = null, kind = null) {
    if (kind) pa.kind = kind;
    if (!carPos) {
      pa.lastX = null;
      pa.lastZ = null;
      return;
    }

    // Paint only while the car is actually riding a floor of the museum — the
    // atrium, the ramp, a balcony or the exhibit floor. The test is against the
    // floor under the car, not against the exhibit floor, so paint carried up
    // the ramp keeps laying (and an airborne car mid-drop lays nothing).
    if (Math.abs(carPos.y - surfaceAt(carPos.x, carPos.z, carPos.y)) > 4) {
      pa.lastX = null;
      pa.lastZ = null;
      pa.load = 0;
      pa.solid = false;
      clearStroke(pa);
      return;
    }

    if (pa.lastX === null) {
      pa.lastX = carPos.x;
      pa.lastZ = carPos.z;
      return;
    }

    const dx = carPos.x - pa.lastX;
    const dz = carPos.z - pa.lastZ;
    const dist = Math.hypot(dx, dz);
    if (dist > 26) {
      // Teleport / respawn: do not drag a stripe across the room.
      pa.lastX = carPos.x;
      pa.lastZ = carPos.z;
      clearStroke(pa);
      return;
    }

    // Run into a ladder and it topples — unless this car may not touch the
    // exhibit at all (the chase car). The ladder answers with its own shape, so
    // the body is sampled at the nose, the middle and the tail: clipping any of
    // its feet knocks it over, and threading the gap between them does not.
    if (canKnock) {
      const yaw = carYaw === null ? 0 : carYaw;
      const fx = -Math.cos(yaw), fz = Math.sin(yaw);
      for (const d of [-CAR_SAMPLE_D, 0, CAR_SAMPLE_D]) {
        knockAt({ x: carPos.x + fx * d, y: carPos.y, z: carPos.z + fz * d }, CAR_HALF_W, 0, 0, speed, null);
      }
    }

    if (dist > 0.02) {
      pa.odometer += dist;
      // Wet paint sticks to the tyres — a puddle soaks them, and so does
      // driving back through a trail already on the floor. The NEWEST puddle the
      // car is standing in is the paint under it.
      let puddle = null;
      for (const s of spills) {
        if (s.age >= WET_SECONDS) continue;
        const sx = carPos.x - s.x;
        const sz = carPos.z - s.z;
        const reach = s.radius + 0.4;
        if (sx * sx + sz * sz <= reach * reach) puddle = s;
      }
      // Paint under the wheels. A puddle of the colour already on the tyres just
      // tops them up; a puddle of a DIFFERENT colour has to walk the old paint
      // off first — two car lengths of it, laid as a pair of tyre tracks — and
      // only then does the new colour take. Both only happen while the car is in
      // that paint, so leaving the puddle pauses the change instead of switching
      // the colour out on bare floor.
      if (puddle) {
        if (pa.load > 0 && pa.color !== puddle.color) {
          // ONE budget for the whole scrub, not one per puddle: if the car
          // crosses from one colour's paint into another's, the old paint keeps
          // coming off onto the same two car lengths' worth of track instead of
          // starting the count again. Only the colour that will take over
          // follows the paint under the wheels.
          if (!pa.wear) pa.wear = { color: puddle.color, remaining: PAINT_SWAP_DIST };
          else pa.wear.color = puddle.color;
          pa.wear.remaining -= dist;
          pa.load = Math.max(pa.load, TRACK_LOAD);
          pa.solid = false;
          if (pa.wear.remaining <= 0) {
            pa.color = pa.wear.color;
            pa.load = 1;
            pa.solid = true;
            pa.wear = null;
          }
        } else {
          pa.wear = null;
          pa.load = 1;
          pa.color = puddle.color;
          pa.solid = true;
        }
      }
      // Back over paint already on the floor: the newest mark under the car —
      // ignoring the few it laid itself a moment ago — is what is actually
      // there. A full-width band re-soaks the tyres (band, then tracks as it
      // wears off); a pair of tyre tracks only wets them, so they keep leaving
      // tracks of that colour. (Not while the old colour is still scrubbing off
      // — that is the paint currently on the tyres.)
      if (!pa.wear) for (let i = markCount - 1; i >= 0; i--) {
        if (pa.odometer - markOdo[i] < SELF_PAINT_DIST) continue;
        const mdx = carPos.x - markX[i];
        const mdz = carPos.z - markZ[i];
        const mr = markR[i];
        if (mdx * mdx + mdz * mdz > mr * mr) continue;
        // A mark on the ramp is not the same paint as the floor beneath it.
        if (Math.abs(carPos.y - markY[i]) > 5) continue;
        if (markSolid[i]) {
          pa.load = 1;
          pa.color = markCol[i];
          pa.solid = true;
        } else if (!pa.solid || pa.load <= 0) {
          pa.load = Math.max(pa.load, TRACK_LOAD);
          pa.color = markCol[i];
          pa.solid = false;
        }
        break;
      }
      if (pa.load > 0) layTrail(pa, pa.lastX, pa.lastZ, carPos.x, carPos.z, dist, carPos.y);
      pa.lastX = carPos.x;
      pa.lastZ = carPos.z;
    }
  }

  const reset = () => {
    // The puddle and droplet materials are shared per colour across the whole
    // exhibit, so the meshes are removed but the materials stay alive.
    for (const s of spills) {
      group.remove(s.mesh);
      if (s.can) group.remove(s.can);
      for (const d of s.drops) group.remove(d.mesh);
    }
    spills.length = 0;
    for (const L of ladders) {
      L.spilled = false;
      L.bucket.visible = true;
    }
    for (const pa of painters.values()) {
      pa.lastX = null;
      pa.lastZ = null;
      pa.load = 0;
      pa.solid = false;
      clearStroke(pa);
    }
    markCount = 0;
    marksBy.clear();
    dirty = false;
    setDrawCount(0);
  };

  const stats = () => ({
    ladders: ladders.map((L) => ({
      x: L.spot.x, z: L.spot.z, state: L.knock ? L.knock.state : 'standing', spilled: L.spilled,
    })),
    spills: spills.map((s) => ({
      x: s.x, z: s.z, radius: s.radius, color: s.color, age: s.age, maxR: s.maxR,
      order: s.mesh.renderOrder,
      transparent: !!s.mesh.material.transparent,
      depthWrite: s.mesh.material.depthWrite !== false,
    })),
    // The empty cans lying in the puddles, and how much paint each has left.
    cans: spills.filter((s) => s.can).map((s) => ({
      x: s.can.position.x, z: s.can.position.z, pours: s.canPours,
    })),
    marks: markCount,
    load: p1.load,
    solid: p1.solid,
    // The tyre signature currently in use (cars.js kind id), for tests.
    profile: p1.kind,
    // A colour change in progress: how much of the old paint is still to scrub
    // off, and which colour is waiting to take over.
    wear: p1.wear ? { color: p1.wear.color, remaining: +p1.wear.remaining.toFixed(2) } : null,
    // What each car is carrying, for the multiplayer / chase-car tests.
    loads: Object.fromEntries([...painters].map(([id, pa]) => [id, pa.load])),
    // How many marks each car has laid.
    marksBy: Object.fromEntries(marksBy),
    // The newest mark, so a test can say what the car is laying down.
    lastMark: markCount > 0
      ? { color: markCol[markCount - 1], solid: markSolid[markCount - 1] === 1 }
      : null,
    // The most recent marks (newest last), so a test can inspect the shape the
    // ride is leaving — two ribbons, one drum, or a pair of footprints.
    lastMarks: (n = 8) => {
      const out = [];
      for (let i = Math.max(0, markCount - n); i < markCount; i++) {
        out.push({ x: markX[i], z: markZ[i], r: markR[i], solid: markSolid[i] === 1 });
      }
      return out;
    },
    // Draw order of the trail mesh: above every puddle, or the paint the tyres
    // lay would be hidden under the pool they drove through.
    trailOrder: trail.renderOrder,
  });

  return { group, update, reset, stats, ladders, spots, paints: RAINBOW_PAINTS };
}
