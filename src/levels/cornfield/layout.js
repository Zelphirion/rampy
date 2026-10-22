// Pure layout + logic for the cornfield level. No THREE import, so this module
// can be unit-tested directly (same pattern as levels/house/layout.js).
// levels/cornfield/index.js turns all of this into meshes.

// ===== Spawn / return =====
export const CORN_GROUND = 0;
// Spawn just south of the cornfield, facing +Z (north) straight into the rows.
export const CORN_SPAWN = { x: -38, z: -62, yaw: Math.PI / 2 };
// The hollow tree you drive back into (behind the spawn, facing +Z).
export const CORN_RETURN = { x: -38, z: -97, halfW: 3.4, halfD: 5.5 };

// ===== Barn =====
// A big working barn (~5x the old footprint, x0..48 z-20..20) with a tall
// drive-up hayloft.
export const BARN = {
  x: 24, z: 0,
  halfW: 24, halfD: 20,    // footprint x 0..48, z -20..20
  wallH: 12,
  loftY: 7.5,
  doorHalf: 5,             // doorway half-width (along x) in the south wall
  doorX: 36.5,             // doorway centre on the south wall (loft centre)
  loftWest: 0,             // hayloft spans the full width...
  loftSouth: 0,            // ...from z 0 (barn centre) to the north (back) wall
};
// The hayloft ramp runs along the EAST SIDE WALL, not across the doorway: it
// starts in the south-east corner, just inside the side wall, and climbs north
// to the back-half loft, so it is out of the way the moment you drive in. Narrow
// (3.6) and built of old boards rather than a solid wedge (see buildBarn).
export const BARN_RAMP = {
  x: BARN.x + BARN.halfW - 2.3, z: -BARN.halfD + 0.8, runX: 0, runZ: 1,
  len: 21, width: 3.6, height: BARN.loftY, baseY: 0, boost: 0,
};

// ===== Silo =====
// Closed SCENERY: a full banded-metal cylinder with a conical roof cap. No
// door, no gap, no interior spiral — the colliders ring it solid at full
// height and nothing opens into it. Stands on flat ground west of the barnyard
// in a clearing of the corn (the north-side plateau swallowed its old spot by
// the corn rows).
export const SILO = { x: -30, z: 8, r: 6, h: 14 };

// ===== Water tower =====
// A steel tank on four braced legs, standing well south of the barn (clear of
// the new south-side hayloft ramp) and east of the farmhouse.
// `legBase` is the foot half-spacing; the legs lean in to `legTop` where
// they meet the platform at `legH`. The tank sits well overhead, so the car can
// thread between the legs.
export const WATER_TOWER = {
  x: 34, z: -70,
  legH: 10,
  tankR: 3.4, tankH: 4.6,
  roofH: 1.8,
  legBase: 2.8, legTop: 1.9,
};
export function waterTowerColliders() {
  const { x, z, legBase, legH } = WATER_TOWER;
  return [
    { x: x - legBase, z: z - legBase, halfW: 0.4, halfD: 0.4, h: legH, top: legH },
    { x: x + legBase, z: z - legBase, halfW: 0.4, halfD: 0.4, h: legH, top: legH },
    { x: x - legBase, z: z + legBase, halfW: 0.4, halfD: 0.4, h: legH, top: legH },
    { x: x + legBase, z: z + legBase, halfW: 0.4, halfD: 0.4, h: legH, top: legH },
  ];
}

// ===== Field footprints =====
// A wider field at a looser spacing: more stalks than before, but each plant is
// a detailed multi-part model with room to be seen, so the rows read as rows
// instead of a solid block of green. The north edge stops short of the
// plateau's toe (HILL.zNear) so no stalks grow out of the rising mound.
export const CORNFIELD_RECT = { x0: -70, x1: -14, z0: -54, z1: 42 };
// The pumpkin patch rides the LEVEL top of the north plateau, inside the flat
// crown band (HILL.zTop..HILL.zFar), so every pumpkin rests on flat high
// ground and rolls off the lip when knocked.
export const PUMPKIN_PATCH = { x0: -8, x1: 32, z0: 84, z1: 119 };

export const CORN = {
  spacing: 2.6,
  stalkH: 5.4,             // double-height stalks; the leaves ride up with it
  knockR: 1.7,
  minSpeed: 0.35,
  fallTime: 0.22,
};

// ===== Spiral ramp generator =====
// A chain of short straight ramp defs whose ends meet exactly, forming a helix
// the car can drive up. Returns defs shaped like the underground ramp defs:
// { x, z, runX, runZ, len, width, height, baseY, boost }.
export function spiralRampSegments({ cx, cz, startAngle = 0, r = 3, y0 = 0, y1 = 12, turns = 2.2, segsPerTurn = 18, width = 3 } = {}) {
  const total = Math.max(1, Math.round(turns * segsPerTurn));
  const segs = [];
  let px = cx + r * Math.cos(startAngle);
  let pz = cz + r * Math.sin(startAngle);
  let py = y0;
  for (let k = 1; k <= total; k++) {
    const t = k / total;
    const phi = startAngle + t * turns * Math.PI * 2;
    const nx = cx + r * Math.cos(phi);
    const nz = cz + r * Math.sin(phi);
    const dx = nx - px, dz = nz - pz;
    const len = Math.hypot(dx, dz) || 0.001;
    const y = y0 + (y1 - y0) * t;
    const runX = dx / len, runZ = dz / len;
    segs.push({
      x: (px + nx) / 2, z: (pz + nz) / 2,
      runX, runZ, len, width,
      height: y - py, baseY: py, boost: 0,
    });
    px = nx; pz = nz; py = y;
  }
  return segs;
}

// ===== Barn colliders =====
// Walls only. The hayloft is NOT a collider: it is a soft surface handled by the
// cornfield's own Y branch (index.js `loftTopAt`), so a car on the ground floor
// under it is never lifted onto it. Every wall carries `top = wallH`, so a car
// up at loft height is still contained until it drives off the open west edge.
export function barnColliders() {
  const w = 0.5;   // wall half-thickness
  const westEnd = BARN.x - BARN.halfW;
  const eastEnd = BARN.x + BARN.halfW;
  const doorL = BARN.doorX - BARN.doorHalf;
  const doorR = BARN.doorX + BARN.doorHalf;
  return [
    // East wall (solid, full height).
    { x: eastEnd, z: BARN.z, halfW: w, halfD: BARN.halfD, h: BARN.wallH, top: BARN.wallH },
    // North wall.
    { x: BARN.x, z: BARN.z + BARN.halfD, halfW: BARN.halfW, halfD: w, h: BARN.wallH, top: BARN.wallH },
    // South wall, split around the doorway.
    { x: (westEnd + doorL) / 2, z: BARN.z - BARN.halfD, halfW: (doorL - westEnd) / 2, halfD: w, h: BARN.wallH, top: BARN.wallH },
    { x: (doorR + eastEnd) / 2, z: BARN.z - BARN.halfD, halfW: (eastEnd - doorR) / 2, halfD: w, h: BARN.wallH, top: BARN.wallH },
    // West wall (solid now).
    { x: westEnd, z: BARN.z, halfW: w, halfD: BARN.halfD, h: BARN.wallH, top: BARN.wallH },
  ];
}

export function siloColliders() {
  const n = 20;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push({
      x: SILO.x + SILO.r * Math.cos(a),
      z: SILO.z + SILO.r * Math.sin(a),
      halfW: 0.75, halfD: 0.75,
      h: SILO.h, top: SILO.h,
    });
  }
  return out;
}

// ===== Corn grid =====
export function cornGrid(rect = CORNFIELD_RECT, spacing = CORN.spacing) {
  const pts = [];
  const nx = Math.floor((rect.x1 - rect.x0) / spacing);
  const nz = Math.floor((rect.z1 - rect.z0) / spacing);
  const ox = (rect.x0 + rect.x1) / 2 - (nx * spacing) / 2;
  const oz = (rect.z0 + rect.z1) / 2 - (nz * spacing) / 2;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const x = ox + i * spacing + Math.sin(i * 1.7 + j * 0.9) * 0.35;
      const z = oz + j * spacing + Math.cos(i * 0.8 - j * 1.3) * 0.35;
      pts.push({ x, z });
    }
  }
  return pts;
}

// Does a car at (carX, carZ) moving at `speed` bend this stalk over?
export function shouldKnockStalk(carX, carZ, speed, stalk, radius = CORN.knockR) {
  if (Math.abs(speed) < CORN.minSpeed) return false;
  const dx = carX - stalk.x, dz = carZ - stalk.z;
  return dx * dx + dz * dz < radius * radius;
}

// ===== Pumpkin rolling =====
// Mutates a plain {x,z,vx,vz,spin,radius}. Returns the pre-friction speed so
// the caller knows whether it is still rolling. Pure enough to unit-test.
export function stepPumpkin(p, dt, drag = 1.8) {
  const sp = Math.hypot(p.vx, p.vz);
  if (sp < 0.02) { p.vx = 0; p.vz = 0; return 0; }
  p.x += p.vx * dt;
  p.z += p.vz * dt;
  p.spin += (sp * dt) / Math.max(0.2, p.radius || 1);
  const f = Math.max(0, 1 - drag * dt);
  p.vx *= f;
  p.vz *= f;
  return sp;
}

// A hit pumpkin keeps its stem and drags its vine runner along; travel this far
// from its home stem base and the vine tears off (the stem sheds, the pumpkin
// rolls free).
export const PUMPKIN_VINE_BREAK = 5.5;

// ===== Barrel rolling =====
// Barrels lie on their sides like logs, so a barrel only rolls BROADSIDE: the
// hit that knocks one into the field is the car measured perpendicular to its
// long axis. Mutates a plain {x,z,vx,vz,roll,axis,radius}; `axis` is the yaw of
// the long axis (world direction (cos axis, 0, -sin axis)) and the roll rate is
// the velocity component along the perpendicular (sin axis, 0, cos axis), over
// the radius — a no-slip wheel (v = ω·r). Any along-axis part just skids.
// Returns the pre-friction speed so the caller knows whether it is still moving.
// Low drag so a knocked barrel keeps going like a ramp-world tire instead of
// dying in the first yard.
export function stepBarrel(b, dt, drag = 1.0) {
  const sp = Math.hypot(b.vx, b.vz);
  if (sp < 0.02) { b.vx = 0; b.vz = 0; return 0; }
  b.x += b.vx * dt;
  b.z += b.vz * dt;
  const perp = b.vx * Math.sin(b.axis) + b.vz * Math.cos(b.axis);
  b.roll += (perp / Math.max(0.2, b.radius || 0.5)) * dt;
  const f = Math.max(0, 1 - drag * dt);
  b.vx *= f;
  b.vz *= f;
  return sp;
}

// ===== Apple orchard =====
// A neat east-side block of apple trees. The squirrel runs here.
export const ORCHARD = { x0: 56, x1: 106, z0: -70, z1: 2 };
export const APPLE_TREE = { trunkH: 3.4, canopyR: 2.7, apples: 10, spacing: 13 };

// Tree positions on a staggered grid inside `rect`.
export function orchardGrid(rect = ORCHARD, spacing = APPLE_TREE.spacing) {
  const pts = [];
  const nx = Math.max(1, Math.floor((rect.x1 - rect.x0) / spacing));
  const nz = Math.max(1, Math.floor((rect.z1 - rect.z0) / spacing));
  const ox = (rect.x0 + rect.x1) / 2 - ((nx - 1) * spacing) / 2;
  const oz = (rect.z0 + rect.z1) / 2 - ((nz - 1) * spacing) / 2;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const stagger = (j % 2) * spacing * 0.5;
      pts.push({ x: ox + i * spacing + stagger, z: oz + j * spacing });
    }
  }
  return pts;
}

// ===== Squirrel =====
// Runs about the orchard; when the car comes near it bolts up a tree, plucks an
// apple and hurls it at you. It is an expert marksman: exactly one throw in
// three lands — deterministic, so the "1 in 3" is real and not a coin flip.
export const SQUIRREL = {
  home: { x: (ORCHARD.x0 + ORCHARD.x1) / 2, z: (ORCHARD.z0 + ORCHARD.z1) / 2 },
  runSpeed: 7.5,        // units/s on the ground
  throwRange: 28,       // car must be this close to the ORCHARD edge to draw a shot
  climbTime: 0.8,       // seconds to scale a tree
  throwInterval: 2.2,   // seconds between apples
  shots: 3,             // apples per climb before it comes back down
  appleSpeed: 24,       // thrown apple speed
  appleHitRadius: 1.9,  // how close an apple must pass to hit the car
};

// Expert marksman: the 1st, 4th, 7th … throw is a true hit — one in three,
// deterministically (a `% 3 === 0` cycle), so the odds are exactly as promised
// and never streak unluckily.
export function squirrelThrowHits(throwIndex) {
  return throwIndex % 3 === 0;
}

// ===== The AI tractor: a slow loop around the (bigger) barnyard =====
// The north leg of the lane runs just clear of the barn's back wall, well
// south of the river leg; the east leg threads the gap between the barn and
// the orchard.
export const TRACTOR = {
  speed: 5,                              // slow farm pace
  path: [[-12, -60], [51, -60], [51, 24], [-12, 24]],
};

// ===== Corn stooks and barrels =====
// Barrel stacks: pyramids of barrels lying on their sides. Two in the
// barnyard, two out by the river bank clear of the tractor lane.
export const BARREL_STACKS = [
  { x: -6, z: -18, rows: 4, alongX: true },
  { x: 42, z: -28, rows: 3, alongX: true },
  { x: 40, z: 30, rows: 3, alongX: true },
  { x: 58, z: 26, rows: 4, alongX: false },
];

// Stack a triangular pile of barrels LYING ON THEIR SIDES, the way a yard
// stacks them. Every barrel's long axis is horizontal (the `alongX` direction)
// and all the barrels in a stack share that axis; they lie SIDE BY SIDE along
// the perpendicular ground axis and stack upward in tiers. Each tier has one
// fewer barrel than the one below and nests in the valley between two barrels
// of the tier beneath it (hex packing), so the pile is a true pyramid: a wide
// bottom row shrinking to a single barrel on top. The bottom tier rests on the
// ground at y = radius (its side down). Bump one and it rolls away broadside.
export function barrelPyramid({ x, z, rows, alongX = true, radius = 0.55, length = 1.3 }) {
  const out = [];
  const pitch = radius * 2.04;            // side-by-side spacing (perpendicular to the axis)
  const tierH = radius * Math.sqrt(3);    // vertical rise between tiers (hex valley)
  for (let k = 0; k < rows; k++) {
    const n = rows - k;
    const rowW = (n - 1) * pitch;
    const y = radius + k * tierH;
    for (let i = 0; i < n; i++) {
      const o = -rowW / 2 + i * pitch;    // spread along the perpendicular ground axis
      out.push({
        x: alongX ? x : x + o,
        y,
        z: alongX ? z + o : z,
        alongX, length, radius,
      });
    }
  }
  return out;
}

// ===== The hill, the river bend, and the runaway farm truck =====
// The WHOLE north side of the farm is one raised plateau, spanning the full
// property width: a smooth cosine rise from the river bank (z = zNear, where
// the river leg turns the corner at the plateau's SOUTH toe) up to a level
// crown at zTop, which stays flat all the way to the north boundary fence at
// zFar. Past the fence a shoulder keeps easing DOWN toward the rolling ridges,
// so from the farm the plateau reads as the near end of a longer ridge system,
// not a lone mesa. The 1940s farm truck is parked up on the crown at the edge;
// bump it and it rolls off through the lip fence, all the way down the long
// south face, and splashes into the river at the bottom.
export const HILL = {
  x0: -118, x1: 126,        // the plateau spans the whole property width
  zNear: 44, zTop: 76, zFar: 126,   // zFar is the north fence line itself
  topY: 13,
  zBack: 158,          // the shoulder scenery runs out here, buried in the ridges
};
// Faces -Z (down the long south face toward the farm centre): forward is
// (-cos yaw, sin yaw), so yaw -PI/2.
export const FARM_TRUCK = { x: 76, z: 119, yaw: -Math.PI / 2 };

// ===== Bull pasture =====
// A fenced paddock on the LEVEL top of the north plateau, clear of the corn,
// the lip fence and the pumpkin patch. The bull inside is docile until someone
// smashes a fence bay down; then it charges whoever did it, up to `maxCharges`
// times.
export const PASTURE = { x0: -112, x1: -66, z0: 86, z1: 120 };
export const PASTURE_FENCE_H = 1.9;
export const BULL = {
  home: { x: (PASTURE.x0 + PASTURE.x1) / 2, z: (PASTURE.z0 + PASTURE.z1) / 2 },
  walkSpeed: 2.2,
  chargeSpeed: 16,
  chargeRadius: 3.4,
  maxCharges: 3,
  breakSpeed: 3.0,      // ram the fence at least this fast to smash it
  // After a fling he backs off and paces until you are back on the ground, then
  // waits `flingRecovery` seconds before walking over and going again — so the
  // three flings land one at a time instead of all mid-air. `recoverTimeout`
  // is the safety net if the flung car never comes back down to his level.
  flingRecovery: 2.0,   // seconds grounded before he charges again
  recoverTimeout: 8.0,  // give up waiting after this long and charge anyway
  recoverPace: 4.5,     // how far he wanders off between flings
};
export function pastureAt(x, z) {
  return x >= PASTURE.x0 && x <= PASTURE.x1 && z >= PASTURE.z0 && z <= PASTURE.z1;
}
// The paddock fence is drawn and collided as individual BAYS (a post-and-panel
// stretch per bay), so a hard hit only drops the bays it actually smashes —
// the rest of the run stays standing. Both the meshes (buildPasture) and the
// colliders iterate this one list so they stay in lockstep, bay for bay.
export const PASTURE_BAY = 5.2;   // target bay length; sides snap to whole bays
export function pastureFenceBayDefs() {
  const { x0, x1, z0, z1 } = PASTURE;
  const out = [];
  const pushSide = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(2, Math.round(len / PASTURE_BAY));
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      out.push({
        ax: ax + (bx - ax) * t0, az: az + (bz - az) * t0,
        bx: ax + (bx - ax) * t1, bz: az + (bz - az) * t1,
        cx: ax + (bx - ax) * (t0 + t1) / 2, cz: az + (bz - az) * (t0 + t1) / 2,
        len: len / n,
        runsAlongX: Math.abs(bz - az) < Math.abs(bx - ax),
      });
    }
  };
  pushSide(x0, z0, x1, z0);   // south
  pushSide(x0, z1, x1, z1);   // north
  pushSide(x0, z0, x0, z1);   // west
  pushSide(x1, z0, x1, z1);   // east
  return out;
}
export function pastureFenceColliders() {
  const t = 0.4, h = PASTURE_FENCE_H;
  // The paddock stands ON the plateau, so its fences start at plateau height:
  // a car down on the farm ground can never clip them from below, and the
  // collider tops reject a car clipping over at any reasonable height.
  return pastureFenceBayDefs().map((b, i) => ({
    x: b.cx, z: b.cz,
    halfW: b.runsAlongX ? b.len / 2 : t,
    halfD: b.runsAlongX ? t : b.len / 2,
    h, top: HILL.topY + h, pastureFence: true, bay: i,
  }));
}

// Cosine ease for the slope: gentle at the toe, gentle at the crest, steepest
// in the middle — a natural hill profile rather than a flat incline.
export const HILL_PROFILE_STEPS = 12;
export function hillProfileY(t) {
  const u = Math.min(1, Math.max(0, t));
  return (HILL.topY * (1 - Math.cos(Math.PI * u))) / 2;
}
// The shoulder beyond the north fence: from the lip the land keeps easing DOWN
// toward the rolling ridges. Absolute height (not normalized) — monotonic and
// gentle at the lip, so the plateau reads as the near end of a longer ridge
// system rather than a lone mesa.
export const HILL_SHOULDER_END_Y = 4;    // buried in the backing ridge at zBack
export function hillShoulderY(t) {
  const u = Math.min(1, Math.max(0, t));
  return HILL.topY + (HILL_SHOULDER_END_Y - HILL.topY) * (1 - Math.cos(Math.PI * u)) / 2;
}

// The two faces, as chains of short straight ramp defs whose ends meet
// exactly (same trick as the silo spiral), sampling hillProfileY on the way
// up the south face and hillShoulderY along the shoulder past the fence.
// Kept for reference / tests — the live physics now rides `hillHeightAt`,
// a genuine 2-D plateau.
export function hillRamp() {
  const n = HILL_PROFILE_STEPS;
  const cx = (HILL.x0 + HILL.x1) / 2;
  const width = HILL.x1 - HILL.x0;
  const segs = [];
  // South face: zNear -> zTop, rising.
  {
    const run = HILL.zTop - HILL.zNear;
    for (let k = 0; k < n; k++) {
      const z0 = HILL.zNear + (run * k) / n;
      const z1 = HILL.zNear + (run * (k + 1)) / n;
      segs.push({
        x: cx, z: (z0 + z1) / 2,
        runX: 0, runZ: 1,
        len: z1 - z0, width,
        height: hillProfileY((k + 1) / n) - hillProfileY(k / n),
        baseY: hillProfileY(k / n), boost: 0,
      });
    }
  }
  // Shoulder: zFar -> zBack, climbing over the fence line to the far crest.
  {
    const run = HILL.zBack - HILL.zFar;
    for (let k = 0; k < n; k++) {
      const z0 = HILL.zFar + (run * k) / n;
      const z1 = HILL.zFar + (run * (k + 1)) / n;
      segs.push({
        x: cx, z: (z0 + z1) / 2,
        runX: 0, runZ: 1,
        len: z1 - z0, width,
        height: hillShoulderY((k + 1) / n) - hillShoulderY(k / n),
        baseY: hillShoulderY(k / n), boost: 0,
      });
    }
  }
  return segs;
}

// ===== The plateau surface =====
// A genuine 2-D plateau: a cosine rise across the south face, a level crown
// spanning the full property width, then a shoulder easing down past the north
// fence. No x-falloff — the top is uniformly flat, which is the whole point of
// the ranch end. The live hill surface main.js rides (up AND down).
export function hillHeightAt(x, z) {
  if (x < HILL.x0 || x > HILL.x1 || z <= HILL.zNear || z > HILL.zBack) return 0;
  if (z < HILL.zTop) return hillProfileY((z - HILL.zNear) / (HILL.zTop - HILL.zNear));
  if (z <= HILL.zFar) return HILL.topY;
  return hillShoulderY((z - HILL.zFar) / (HILL.zBack - HILL.zFar));
}

// The plateau top, for a car already up on it (mirrors barn loftTopAt so a
// ground-floor car at the foot is never teleported onto the crown).
export function plateauTopAt(x, z, carY) {
  if (carY <= HILL.topY - 2.5) return 0;
  return hillHeightAt(x, z);
}

// The mound has no colliders at all: every side is a gentle slope, and the lip
// fence is scenery the runaway truck crashes through. The old full-width fence
// collider read as an invisible wall across the hill.
export function hillColliders() {
  return [];
}

// ===== The river =====
// An L-shaped watercourse: it comes in along the east side (the channel),
// and at the plateau's SOUTH toe it turns the corner and runs WEST the whole
// width of the property and out under the west fence to a spring mound beyond
// it — the mill's wheel dips into that leg near the spring end. The bed sits
// below ground, but the banks slope down into it over `bankW`, so you can
// drive in and climb out anywhere — no trench walls.
// The current still wins out in the middle: along the channel it shoves you
// south (-Z), in the leg it shoves you east (+X) toward the bend, and it
// bleeds throttle throughout.
export const RIVER = {
  x0: 107, x1: 117,      // the channel (north-south)
  legX0: -130,           // the leg runs west out under the fence to the spring
  legZ0: 34, legZ1: 44,  // legZ1 is the plateau's south toe
  bedY: -2.5, waterY: -0.6,
  bankW: 4,              // width of the drivable slope up out of the water
  flowSpeed: 11,         // u/s
  flowDrag: 1.2,         // per-second throttle bleed while afloat
};
export function riverAt(x, z) {
  const inChannel = x >= RIVER.x0 && x <= RIVER.x1 && z <= RIVER.legZ1;
  const inLeg = z >= RIVER.legZ0 && z <= RIVER.legZ1 && x >= RIVER.legX0 && x <= RIVER.x1;
  return inChannel || inLeg ? RIVER : null;
}
// Height of the river surface: flush with the grass at every bank, sloping down
// to the bed over `bankW`, flat at the bed in the middle. This is what the car
// rides, so it can enter and leave anywhere on the perimeter.
export function riverSurfaceY(x, z) {
  const inChannel = x >= RIVER.x0 && x <= RIVER.x1 && z <= RIVER.legZ1;
  const inLeg = z >= RIVER.legZ0 && z <= RIVER.legZ1 && x >= RIVER.legX0 && x <= RIVER.x1;
  if (!inChannel && !inLeg) return null;
  const west = x - (z >= RIVER.legZ0 ? RIVER.legX0 : RIVER.x0);
  const east = RIVER.x1 - x;
  const north = RIVER.legZ1 - z;
  // The leg's south bank exists only west of the channel; the channel is open
  // into the leg along its whole width.
  const south = x < RIVER.x0 ? z - RIVER.legZ0 : Infinity;
  const d = Math.max(0, Math.min(west, east, north, south));
  const k = Math.min(1, d / RIVER.bankW);
  return k === 0 ? 0 : RIVER.bedY * k;
}
// The push, when the car is afloat. The channel flows south, the leg flows
// east into the corner; in the corner itself the water is already turning
// south. `y > 1` means flying well clear of the river — leave that alone.
export function riverFlowAt(x, z, y) {
  if (y > 1) return null;
  const r = riverAt(x, z);
  if (!r) return null;
  if (x < r.x0) return { dx: r.flowSpeed, dz: 0, drag: r.flowDrag };   // the leg runs east
  return { dx: 0, dz: -r.flowSpeed, drag: r.flowDrag };                 // the channel runs south
}
// No trench walls any more: the banks slope on every side, so the car can drive
// in and climb out anywhere. Kept as a function because the level still asks for
// the (empty) list alongside its other colliders.
export function riverWallColliders() {
  return [];
}

// ===== Mill house =====
// A wide mill on the north bank of the river's east-west leg, near its spring
// end at the west edge of the property (the current runs east past it toward
// the bend): stone footing, timber walls, gable roof, windows on every face,
// doorway on the south (farm) side. The water wheel hangs on the north wall,
// dips into the current, and drives the threshing machinery inside — a shaft
// down the long axis, meshed gears, a crank and a toothed drum. Clear of the
// corn, the plateau toe and the barnyard.
export const MILL = {
  x: -96, z: 18,
  halfW: 16, halfD: 14, wallH: 12,
  doorHalf: 3.0,             // doorway half-width (along x) in the south wall
  loftY: 8,                  // gantry walkway around the machinery
  wheel: { x: -96, y: 1.4, z: 38.5, r: 4, halfW: 4.5 },   // spans the river; spins about Z
  drum: { x: -101.5, y: 2.6, z: 14, r: 1.0, len: 3.0 },
};
export function millColliders() {
  const w = 0.5;
  const { x, z, halfW, halfD, wallH, doorHalf, wheel, drum } = MILL;
  const machine = { x: drum.x, z: drum.z, halfW: 1.7, halfD: 2.2, h: 3.8, top: 3.8 };
  // The heavy timber mill train (hurst frame + stones) and the copper distillery
  // (mash tuns, fermentation vats, the pot-still furnace, the worm box and the
  // cask ricks) are solid: the car stops against the equipment, not just the
  // walls. Kept as separate boxes so the gaps between them stay drivable.
  const millTrain = [
    { x: x - 6, z: z - 4, halfW: 4.0, halfD: 3.4, h: 3.2, top: 3.2 },   // hurst frame/stones
    { x: x + 1, z: z - 2, halfW: 0.9, halfD: 0.9, h: 9.8, top: 9.8 },   // elevator legs
    { x: x + 11, z: z + 2.5, halfW: 1.8, halfD: 1.8, h: 3.2, top: 3.2 }, // pot still + furnace
    { x: x + 11, z: z + 11, halfW: 2.4, halfD: 1.7, h: 2.2, top: 2.2 },  // worm box
    { x: x + 8.5, z: z - 6, halfW: 2.2, halfD: 2.2, h: 2.6, top: 2.6 },  // mash tun
    { x: x + 8.5, z: z - 1, halfW: 2.2, halfD: 2.2, h: 2.6, top: 2.6 },  // mash tun
    { x: x + 8.5, z: z + 5.6, halfW: 2.2, halfD: 2.0, h: 2.4, top: 2.4 },// fermenter
    { x: x + 13, z: z - 10.5, halfW: 2.6, halfD: 1.4, h: 2.6, top: 2.6 },// cask rick
    { x: x + 15, z: z + 6, halfW: 0.8, halfD: 3.4, h: 1.4, top: 1.4 }, // standing casks
    { x: x - halfW + 1.6, z: z - 4, halfW: 0.9, halfD: 2.3, h: 2.0, top: 2.0 }, // flour bins (west wall)
  ];
  return [
    // Walls (doorway gap in the south face).
    { x: x + halfW, z, halfW: w, halfD, h: wallH, top: wallH },
    { x: x - halfW, z, halfW: w, halfD, h: wallH, top: wallH },
    { x, z: z + halfD, halfW, halfD: w, h: wallH, top: wallH },
    { x: x - (halfW + doorHalf) / 2, z: z - halfD, halfW: (halfW - doorHalf) / 2, halfD: w, h: wallH, top: wallH },
    { x: x + (halfW + doorHalf) / 2, z: z - halfD, halfW: (halfW - doorHalf) / 2, halfD: w, h: wallH, top: wallH },
    // The water wheel, spanning the leg where it sweeps the current.
    { x: wheel.x, z: wheel.z, halfW: wheel.r + 0.3, halfD: wheel.halfW, h: 7, top: 7 },
    // The threshing machine, solid so you stop short of the moving parts.
    machine,
    ...millTrain,
  ];
}

// ===== Farmhouse =====
// A new clapboard house west of the barnyard, between the corn and the water
// tower. Solid walls — the door and windows are for looking at, not driving in.
export const FARM_HOUSE = {
  x: 8, z: -46,
  halfW: 7, halfD: 5, wallH: 5,
  doorHalf: 1.6,
};
export function farmHouseColliders() {
  const w = 0.6;
  const { x, z, halfW, halfD, wallH } = FARM_HOUSE;
  return [
    { x: x + halfW, z, halfW: w, halfD, h: wallH, top: wallH },
    { x: x - halfW, z, halfW: w, halfD, h: wallH, top: wallH },
    { x, z: z - halfD, halfW, halfD: w, h: wallH, top: wallH },
    { x, z: z + halfD, halfW, halfD: w, h: wallH, top: wallH },
  ];
}

// ---- the wrap-around porch ----
// The deck is drivable (porchTopAt lifts the car onto it), so it is NOT in
// farmHouseColliders — that list is pinned at exactly four solid walls by
// layout.test.mjs. The railing that keeps the car from simply ploughing
// sideways off the deck lives here as its own list: three solid runs, with a
// gap on the south aligned to the front door so you can drive up the steps,
// onto the deck, and back off. `doorX` is the door's x relative to the house
// centre (buildFarmhouse draws the door at cx + doorX).
export const PORCH = {
  w: 3.4,             // how far the deck reaches out from each wall
  deck: 0.35,         // deck top height above ground
  doorX: 3.0,         // door x offset — the entry gap lines up with the steps
  gap: 4.4,           // south rail opening (car width + slack)
  railTop: 1.3,       // railing height above ground
};
export function farmPorchColliders() {
  const t = 0.15;
  const { w, doorX, gap, railTop } = PORCH;
  const { x: cx, z: cz, halfW: hw, halfD: hd } = FARM_HOUSE;
  // Rail centrelines — match the posts/rails buildFarmhouse draws (ox/oz there).
  const ox = hw + w - 0.15, oz = hd + w - 0.15;
  const gx0 = cx + doorX - gap / 2, gx1 = cx + doorX + gap / 2;
  const segL = (ox + (gx0 - cx)) / 2;   // half-width of the west-of-gap run
  const segR = (ox - (gx1 - cx)) / 2;   // half-width of the east-of-gap run
  return [
    // South, flanking the door gap.
    { x: cx + (gx0 - cx - ox) / 2, z: cz - oz, halfW: segL, halfD: t, h: railTop, top: railTop },
    { x: cx + (ox + gx1 - cx) / 2, z: cz - oz, halfW: segR, halfD: t, h: railTop, top: railTop },
    // North: full run.
    { x: cx, z: cz + oz, halfW: ox, halfD: t, h: railTop, top: railTop },
    // East / west: full runs.
    { x: cx + ox, z: cz, halfW: t, halfD: oz, h: railTop, top: railTop },
    { x: cx - ox, z: cz, halfW: t, halfD: oz, h: railTop, top: railTop },
  ];
}
// The surface function main.js feeds into its ground chain: the deck top inside
// the porch ring (the outer house rectangle grown by w, minus the house
// footprint itself), ground everywhere else.
export function porchTopAt(x, z) {
  const { w, deck } = PORCH;
  const { x: cx, z: cz, halfW: hw, halfD: hd } = FARM_HOUSE;
  const dx = Math.abs(x - cx), dz = Math.abs(z - cz);
  return (dx <= hw + w && dz <= hd + w && (dx > hw || dz > hd)) ? deck : 0;
}

// ===== Outward landscape =====
// Low grass ridges beyond the property fences that continue the hill's mass,
// so the mound reads as part of a longer landform rather than a lone hump.
// Mesh-only scenery — the boundary keeps cars inside. `axis` is the long
// direction; `len` runs along it, `halfW` is the half-extent across it.
export const ROLLING = [
  { x: 30, z: 155, len: 180, halfW: 28, h: 5.0, axis: 'x' },   // backing ridge north of the river leg
  { x: -60, z: 152, len: 90, halfW: 26, h: 3.6, axis: 'x' },   // north-west shoulder
  { x: -148, z: 90, len: 48, halfW: 40, h: 4.0, axis: 'z' },   // west ridge, clear of the stream band
  { x: 157, z: -30, len: 46, halfW: 30, h: 3.5, axis: 'z' },   // east ridge beyond the channel
  { x: -20, z: -130, len: 150, halfW: 22, h: 3.4, axis: 'x' }, // south of the brick wall
];

// ===== Farm boundary =====
// Three sides are a wooden perimeter fence (the rails are drawn in index.js).
// The fourth — the south run, facing the city — is a tall brick wall, the
// same style as the city's boundary wall, because that is the side the
// portal tree stands against. Returned as wall colliders.
export const FARM_BOUNDS = { x0: -118, x1: 126, z0: -104, z1: 126 };
export const BRICK_WALL = { z: -104, h: 5.2, capH: 0.6, color: 0x8a3b2e, capColor: 0xb9b1a3 };
// The drawn walls and fences are short, but their COLLIDERS are invisible
// towers: the bull's horn hit throws a car hundreds of feet straight up, and a
// hilltop launch can sail over the north fence, so every boundary run rejects
// the car at any height and bounces it back inside the farm. (Cornfield forces
// elevated=false, so the walls apply while the car is airborne.)
export const FARM_WALL_TOP = 9999;
export function farmBoundsColliders() {
  const t = 0.5, h = FARM_WALL_TOP;
  const { x0, x1, z0, z1 } = FARM_BOUNDS;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  return [
    { x: x0, z: cz, halfW: t, halfD: (z1 - z0) / 2, h, top: h },
    { x: x1, z: cz, halfW: t, halfD: (z1 - z0) / 2, h, top: h },
    // The south run is the brick wall (drawn tall in index.js).
    { x: cx, z: z0, halfW: (x1 - x0) / 2, halfD: t, h, top: h },
    { x: cx, z: z1, halfW: (x1 - x0) / 2, halfD: t, h, top: h },
  ];
}
