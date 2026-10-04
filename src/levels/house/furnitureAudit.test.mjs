// An audit of the house's interior furniture, measured off the ACTUAL built
// geometry rather than off a list somebody wrote down.
//
// This exists because "there is a lot of random stuff blocking doorways" is not
// a bug you can see by reading the code. The builder places furniture with bare
// numbers — `shelfRack(g, -55, -80, 26, 0, 'x')` — spread over ~200 lines and
// eleven rooms, and nothing anywhere checks that the result is a room you can
// walk through. MAP_ITEMS was supposed to be that check, but it is a parallel
// hand-maintained description of the furniture and it has already drifted from
// what the builder actually makes: it claims a 26x32 bed where the builder
// builds a 16x22 one, and it never sees the rotators at all.
//
// So the source of truth here is the geometry. Every furniture helper returns one
// Group, and every helper adds it straight to the house group, so the direct
// non-mesh children of that group with box meshes in them ARE the furniture.
//
// Run: node --test src/levels/house/furnitureAudit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HOUSE, ROOMS, HOUSE_WALLS, HOUSE_START, CAT_SPOTS, CAR_RADIUS } from './layout.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// The real builder, loaded by the shared harness: CDN three swapped for the stub
// in both index.js and the physics.js it imports.
const { addHouse } = await import('./houseHarness.mjs');

// ---------------------------------------------------------------------------
// Measuring
// ---------------------------------------------------------------------------

// The world footprint of one furniture group: every box mesh inside it, with the
// group's position AND its Y rotation applied.
//
// The rotation is not a detail. Every piece of furniture in the house is authored
// axis-aligned and then turned — a sofa rotated 90 degrees is 5 wide and 14 deep
// on the plan, not 14 wide and 5 deep — so an AABB that ignores ry is a different
// shape for nearly every object in the building, and an audit built on it would
// pass while the real thing sat in a doorway. Every ry in the house is a multiple
// of 90 degrees, so snapping to the nearest quadrant is exact, not an
// approximation.
function footprint(group) {
  const q = Math.round(group.rotation.y / (Math.PI / 2)) * (Math.PI / 2);
  const cos = Math.cos(q), sin = Math.sin(q);
  const gx = group.position.x, gz = group.position.z;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  // h1 is how tall the piece is. The tests use it to tell a wardrobe from a rug:
  // the wall-facing rules are about things you would bump into, and a rug or a
  // bath mat belongs in the middle of the floor whatever it looks like.
  let h1 = 0, meshes = 0;
  // `lx`/`lz` are offsets INSIDE the group. The group's own position is added
  // after the rotation, not before it: rotating a position as if it were an
  // offset spins the whole piece around the house origin instead of around its
  // own centre, which is the classic way to get a kitchen counter reported at
  // x=80 when the builder put it at x=-43.
  const add = (lx, lz, w, d) => {
    const rx = lx * cos + lz * sin;
    const rz = -lx * sin + lz * cos;
    const hw = (Math.abs(w * cos) + Math.abs(d * sin)) / 2;
    const hd = (Math.abs(w * sin) + Math.abs(d * cos)) / 2;
    x0 = Math.min(x0, gx + rx - hw); x1 = Math.max(x1, gx + rx + hw);
    z0 = Math.min(z0, gz + rz - hd); z1 = Math.max(z1, gz + rz + hd);
  };
  group.traverse((o) => {
    if (!o.isMesh || o.geometry?.kind !== 'box') return;
    meshes++;
    const [w, h, d] = o.geometry.params.map(Number);
    h1 = Math.max(h1, o.position.y + h / 2);
    // Offsets of this mesh inside the group, so the rotation above is about the
    // group's own centre. No helper nests a further group, so this only has to
    // accumulate position, never rotation. Starting at -gx/-gz cancels the
    // group's own position so the offsets come out relative to its centre.
    const walk = (n, ax, az) => {
      const px = ax + n.position.x, pz = az + n.position.z;
      if (n === o) { add(px, pz, w, d); return; }
      for (const c of n.children) walk(c, px, pz);
    };
    walk(group, -gx, -gz);
  });
  if (!meshes) return null;
  return { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2,
    w: x1 - x0, d: z1 - z0, h1 };
}

let cached = null;
async function furniture() {
  if (cached) return cached;
  const world = await addHouse({ add() {} }, {});
  const all = [];
  for (const child of world.group.children) {
    if (child.isMesh) {
      // A box standing on the floor that is not inside a named piece of
      // furniture. The builder has a good number of these — a bookcase, a
      // hutch, a workbench — and each one should have been wrapped in a `unit()`
      // group. This branch is the safety net that says so out loud instead of
      // quietly ignoring them, which is how a bookcase sitting across a doorway
      // went unnoticed. Structure is filtered out by height: a wall reaches the
      // ceiling, and nothing on the floor does.
      const geo = child.geometry;
      if (!geo || geo.kind !== 'box') continue;
      const [bw, bh, bd] = geo.params.map(Number);
      if (bh > 20 || bh < 1) continue;
      if (child.position.y - bh / 2 > 2) continue;      // not standing on the floor
      const fp = boxFootprint(child, bw, bd);
      if (!fp) continue;
      if (fp.x1 < HOUSE.minX - 4 || fp.x1 > HOUSE.maxX + 4) continue;
      if (fp.z1 < HOUSE.minZ - 4 || fp.z1 > HOUSE.maxZ + 4) continue;
      if (fp.w < 2 || fp.d < 2) continue;
      fp.kind = 'unwrapped box';
      all.push(fp);
      continue;
    }
    if (!child.children.some((c) => c.isMesh)) continue;
    const fp = footprint(child);
    // Only things standing in the house. The builder also makes the world
    // outside the windows — trees, hedges, the driveway — and those are scenery,
    // not furniture, and are not subject to any of this.
    if (!fp) continue;
    if (fp.x1 < HOUSE.minX - 4 || fp.x1 > HOUSE.maxX + 4) continue;
    if (fp.z1 < HOUSE.minZ - 4 || fp.z1 > HOUSE.maxZ + 4) continue;
    if (fp.cx < HOUSE.minX || fp.cx > HOUSE.maxX || fp.cz < HOUSE.minZ || fp.cz > HOUSE.maxZ) continue;
    if (fp.w < 2 && fp.d < 2) continue;
    // The furniture helper that made it, e.g. 'wardrobe'. This is what lets the
    // tests below apply per-kind rules instead of inferring intent from a
    // bounding box, which is how a coffee table ends up flagged as furniture
    // floating in the middle of a room.
    fp.kind = child.name || 'unnamed';
    all.push(fp);
  }
  cached = all;
  return all;
}

// The footprint of a single mesh hanging straight off the house group, with no
// rotation of its own to worry about.
function boxFootprint(mesh, w, d) {
  const hw = w / 2, hd = d / 2;
  const x0 = mesh.position.x - hw, x1 = mesh.position.x + hw;
  const z0 = mesh.position.z - hd, z1 = mesh.position.z + hd;
  return { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, h1: 0 };
}

const show = (p) => `x${p.x0.toFixed(1)}..${p.x1.toFixed(1)} z${p.z0.toFixed(1)}..${p.z1.toFixed(1)}`;
const label = (p) => `${p.kind} at ${show(p)}`;

// How far a wall extends either side of the line it is recorded on. `HOUSE_Wall`
// is the wall's centre, so a piece of furniture is allowed to reach the wall's
// inner FACE and no further — which is what this is. Testing with a bigger
// margin than this reports every wardrobe in the house as being inside a wall.
const WALL_HALF = HOUSE.wall / 2;

// Every doorway in the house, as a rectangle the car has to get through. Built
// from HOUSE_WALLS rather than listed separately, so a new doorway is audited the
// moment it is added to the plan.
//
// NOTE the axis convention, which is the builder's: `axis` is the way the wall
// RUNS, so 'x' is a wall standing at a constant z, and 'z' is one at a constant
// x. The gap is measured along the run. Getting this backwards reports every
// doorway as clear and every wall as empty, which is worse than no test at all.
function doorways() {
  const out = [];
  for (const w of HOUSE_WALLS) {
    if (!w.gap) continue;
    out.push({
      axis: w.axis, at: w.at, a0: w.gap.a0, a1: w.gap.a1,
      // How far out from the wall the car has to be able to get. A car drives
      // THROUGH a doorway, so it needs the wall's own thickness plus a radius
      // of clear floor on each side.
      reach: WALL_HALF + CAR_RADIUS,
    });
  }
  return out;
}

// Does a footprint straddle the line a wall stands on?
// 'x' -> the wall is at a constant z; 'z' -> at a constant x.
const straddles = (p, axis, at, slack) => (axis === 'x'
  ? p.z1 > at - slack && p.z0 < at + slack
  : p.x1 > at - slack && p.x0 < at + slack);

// Does a footprint overlap the span along the wall's run?
// 'x' -> measure along x; 'z' -> along z.
const alongRun = (p, axis, lo, hi) => (axis === 'x'
  ? p.x1 > lo && p.x0 < hi
  : p.z1 > lo && p.z0 < hi);

// The rectangle a piece of furniture occupies in plan, inflated.
const inflate = (p, by) => ({ x0: p.x0 - by, x1: p.x1 + by, z0: p.z0 - by, z1: p.z1 + by });

const overlaps = (a, b, pad = 0) => {
  const ox = Math.min(a.x1, b.x1 + pad) - Math.max(a.x0, b.x0 - pad);
  const oz = Math.min(a.z1, b.z1 + pad) - Math.max(a.z0, b.z0 - pad);
  return ox > 0 && oz > 0 ? { ox, oz } : null;
};

// ---------------------------------------------------------------------------
// 1. Nothing stands in a doorway
// ---------------------------------------------------------------------------

test('no piece of furniture stands in a doorway', async () => {
  const pieces = await furniture();
  const offenders = [];
  for (const p of pieces) {
    for (const d of doorways()) {
      // Inside the opening itself — NOT padded along the wall. A run of cabinets
      // standing against the same wall, two short of the door frame, is not in
      // the doorway: the car goes through the opening sideways to it, not along
      // the wall. Padding the gap made every counter in the kitchen a blockage.
      if (!alongRun(p, d.axis, d.a0, d.a1)) continue;
      // ...and close enough to the wall that the car has no room to swing it.
      if (!straddles(p, d.axis, d.at, d.reach)) continue;
      offenders.push(`${label(p)} blocks the doorway at ${d.axis}=${d.at}, ${d.a0}..${d.a1}`);
    }
  }
  assert.equal(offenders.length, 0, `furniture in doorways:\n    ${offenders.join('\n    ')}`);
});

// ---------------------------------------------------------------------------
// 2. Nothing stands in a wall
// ---------------------------------------------------------------------------

test('no piece of furniture stands inside a wall', async () => {
  const pieces = await furniture();
  const offenders = [];
  for (const p of pieces) {
    for (const w of HOUSE_WALLS) {
      // Half the wall's thickness either side of its centre line: a piece that
      // reaches exactly the inner face is flush against the wall, not in it.
      if (!straddles(p, w.axis, w.at, WALL_HALF)) continue;
      if (alongRun(p, w.axis, w.run0, w.run1)) {
        offenders.push(`${label(p)} is in the wall along ${w.axis} at ${w.at}, run ${w.run0}..${w.run1}`);
      }
    }
  }
  assert.equal(offenders.length, 0, `furniture in walls:\n    ${offenders.join('\n    ')}`);
});

// ---------------------------------------------------------------------------
// 3. Nothing straddles a room boundary
// ---------------------------------------------------------------------------
// A separate test from the wall one on purpose. Some room boundaries have no wall
// in them — the shell, and the open-plan kitchen/living divide — and a piece of
// furniture half in one room and half in another reads as a mistake even where
// nothing is technically blocking.

test('no piece of furniture straddles a room boundary', async () => {
  const pieces = await furniture();
  const names = Object.keys(ROOMS);
  const offenders = [];
  for (const p of pieces) {
    const inRooms = names.filter((n) => p.x1 > ROOMS[n].x0 + 0.5 && p.x0 < ROOMS[n].x1 - 0.5
      && p.z1 > ROOMS[n].z0 + 0.5 && p.z0 < ROOMS[n].z1 - 0.5);
    if (inRooms.length > 1) offenders.push(`${label(p)} spans ${inRooms.join(' and ')}`);
  }
  assert.equal(offenders.length, 0, `furniture across room boundaries:\n    ${offenders.join('\n    ')}`);
});

// ---------------------------------------------------------------------------
// 4. Furniture does not intersect furniture
// ---------------------------------------------------------------------------

test('no two pieces of furniture intersect', async () => {
  const pieces = await furniture();
  const offenders = [];
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const hit = overlaps(pieces[i], pieces[j]);
      if (hit) offenders.push(`${label(pieces[i])} intersects ${label(pieces[j])} by ${hit.ox.toFixed(1)}x${hit.oz.toFixed(1)}`);
    }
  }
  assert.equal(offenders.length, 0, `overlapping furniture:\n    ${offenders.join('\n    ')}`);
});

// ---------------------------------------------------------------------------
// 5. You do not arrive inside a piece of furniture
// ---------------------------------------------------------------------------

test('the arrival point is clear floor', async () => {
  const pieces = await furniture();
  const CAR = { x0: HOUSE_START.x - 4, x1: HOUSE_START.x + 4, z0: HOUSE_START.z - 4, z1: HOUSE_START.z + 4 };
  const hits = pieces.filter((p) => overlaps(p, CAR));
  assert.equal(hits.length, 0,
    `you arrive at (${HOUSE_START.x}, ${HOUSE_START.z}) inside ${hits.map(label).join(', ')}`);
});

// ---------------------------------------------------------------------------
// 6. The cat does not wake up inside a piece of furniture
// ---------------------------------------------------------------------------
// This one is about the CAT, and it is the version of the bug that reads worst:
// a cat asleep inside a sofa is not a placement nit, it is the animal being
// inside another object. The cat is about 10 long, so a spot needs a 10-wide
// circle of nothing around it, not just its own centre.

test('no cat spot has furniture in it', async () => {
  const pieces = await furniture();
  const CAT_R = 5.2;      // half the cat's length, with a little to spare
  const offenders = [];
  for (const s of CAT_SPOTS) {
    const spot = { x0: s.x - CAT_R, x1: s.x + CAT_R, z0: s.z - CAT_R, z1: s.z + CAT_R };
    for (const p of pieces) {
      const hit = overlaps(p, spot);
      if (hit) offenders.push(`cat spot (${s.x}, ${s.z}) has ${label(p)} in it`);
    }
  }
  assert.equal(offenders.length, 0, `cat spots inside furniture:\n    ${offenders.join('\n    ')}`);
});

// ---------------------------------------------------------------------------
// 7. Furniture is against a wall, unless it is the sort of thing that belongs in
//    the middle of the room
// ---------------------------------------------------------------------------

// Furniture that belongs against a wall by its nature. A wardrobe is a wardrobe
// wherever you put it; a coffee table is a coffee table, but you do expect one in
// the middle of a seating group. Keyed on the helper name the builder tags each
// group with, so this list stays about INTENT and never has to guess from the
// bounding box.
const MUST_BE_ON_A_WALL = new Set([
  'wardrobe', 'shelfRack', 'counterRun', 'fridge', 'stove',
  'toilet', 'sinkUnit', 'tvUnit',
]);

// Furniture that belongs somewhere you walk around, not against a wall.
const LIVES_IN_THE_MIDDLE = new Set([
  'bed', 'sofa', 'chair', 'table', 'tub',
]);

const NEAR_WALL = 3.5;   // close enough to count as against it

// Which room each piece of furniture is standing in.
function roomOf(p) {
  return Object.keys(ROOMS).find((n) => p.cx > ROOMS[n].x0 && p.cx < ROOMS[n].x1
    && p.cz > ROOMS[n].z0 && p.cz < ROOMS[n].z1);
}

// How far the piece is from each of its room's four walls, nearest first.
function wallGaps(p, room) {
  const r = ROOMS[room];
  return Object.entries({
    west: p.x0 - r.x0, east: r.x1 - p.x1,
    south: p.z0 - r.z0, north: r.z1 - p.z1,
  }).sort((a, b) => a[1] - b[1]);
}

test('furniture that goes on walls is pushed against one', async () => {
  // The rule the house is actually laid out to: a wardrobe or a run of
  // cabinets stands ON a wall, not 6 out into the traffic lane. Beds, sofas and
  // tables are meant to float in the middle and are not in this test at all —
  // an earlier version guessed from the bounding box and cheerfully demanded
  // that the dining table be shoved against a wall.
  const pieces = await furniture();
  const offenders = [];
  for (const p of pieces) {
    if (!MUST_BE_ON_A_WALL.has(p.kind)) continue;
    const room = roomOf(p);
    if (!room) continue;
    const [side] = wallGaps(p, room);
    if (side[1] < NEAR_WALL) continue;
    offenders.push(`${label(p)} in ${room} is ${side[1].toFixed(1)} from the ${side[0]} wall`);
  }
  assert.equal(offenders.length, 0, `wall furniture out in the middle of a room:\n    ${offenders.join('\n    ')}`);
});

// ---------------------------------------------------------------------------
// 8. Wall furniture is turned the right way round
// ---------------------------------------------------------------------------
// A bookcase 40 wide and 3 deep against a wall running along X is right. The same
// bookcase turned 90 degrees is a 3-wide pillar standing 40 out from the wall, and
// it does not look like a mistake from across the room — it looks like a bookcase
// that somehow got narrow. This is what catches it.

test('wall furniture is oriented along the wall it is against', async () => {
  const pieces = await furniture();
  const offenders = [];
  for (const p of pieces) {
    // Only the pieces the previous test has already pinned to a wall. Judging
    // the orientation of something floating in the middle of a room is
    // meaningless — there is no wall to be parallel to.
    if (!MUST_BE_ON_A_WALL.has(p.kind)) continue;
    const room = roomOf(p);
    if (!room) continue;
    const [side] = wallGaps(p, room);
    if (side[1] >= NEAR_WALL) continue;
    // Against a north or south wall the long axis runs along X, so it must be
    // the wider of the two. A 1.5 margin, because a square is fine either way.
    if (p.w < 4 || p.d < 4) continue;
    if ((side[0] === 'north' || side[0] === 'south') && p.d > p.w + 1.5) {
      offenders.push(`${label(p)} in ${room} is ${p.d} deep against the ${side[0]} wall — it is turned 90 degrees`);
    }
    if ((side[0] === 'west' || side[0] === 'east') && p.w > p.d + 1.5) {
      offenders.push(`${label(p)} in ${room} is ${p.w} wide against the ${side[0]} wall — it is turned 90 degrees`);
    }
  }
  assert.equal(offenders.length, 0, `wall furniture turned sideways:\n    ${offenders.join('\n    ')}`);
});
