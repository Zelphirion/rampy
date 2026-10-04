// The house has to be SEALED. There is no way out of the front door, so the
// front door is a solid, locked slab on a wall with no hole behind it, and the
// only exit in the building is the dark garage off the kitchen.
//
// This is the exact inverse of what this file used to assert. It used to prove
// the garage door was wound OPEN, because a beckoning light you cannot reach is
// an invitation to nowhere. The dark garage is now inside the house, and the
// front door — the one the player is put down facing away from — is dead.
//
// The checks walk the BUILT scene graph rather than reading the source. The bug
// this exists for is the one that is invisible in the source and fatal in play:
// a shell panel quietly omitted, or a `wall()` call with a `gap` on a wall that
// should have been solid, leaving a hole the width of a car in a wall nobody
// looks at. Grep cannot see that. Colliders can.
//
// Run: node --test src/levels/house/garageDoor.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HOUSE, ROOMS, FRONT_DOOR, HOUSE_EXIT, HOUSE_WALLS, DRIVE } from './layout.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// The real builder, loaded by the shared harness: CDN three swapped for the stub
// in both index.js and the physics.js it imports.
const { addHouse } = await import('./houseHarness.mjs');

let cached = null;
async function house() {
  if (!cached) cached = await addHouse({ add() {} }, {});
  return cached;
}

// Every box mesh in the built house, with its world position and size.
async function houseBoxes() {
  const world = await house();
  const out = [];
  // The stub's Obj3 has no `parent` back-reference, so offsets are accumulated
  // by walking down from the root instead. The geometry is all authored in world
  // coordinates, so this is belt and braces rather than essential.
  const walk = (node, ox, oy, oz) => {
    const x = ox + node.position.x, y = oy + node.position.y, z = oz + node.position.z;
    if (node.isMesh && node.geometry?.kind === 'box') {
      const [w, h, d] = node.geometry.params.map(Number);
      out.push({
        w, h, d, x, y, z,
        y0: y - h / 2, y1: y + h / 2,
        z0: z - d / 2, z1: z + d / 2,
        x0: x - w / 2, x1: x + w / 2,
      });
    }
    for (const c of node.children) walk(c, x, y, z);
  };
  walk(world.group, 0, 0, 0);
  return out;
}

// Every mesh, with its material, so glass can be told apart from plaster. The
// raw geometry params come along too: a plane's width/depth and a sphere's
// radius are the only way to ask about the drive and the hedge, which are
// neither boxes.
async function houseMeshes() {
  const world = await house();
  const out = [];
  const walk = (node, ox, oy, oz) => {
    const x = ox + node.position.x, y = oy + node.position.y, z = oz + node.position.z;
    if (node.isMesh) {
      const p = (node.geometry?.params || []).map(Number);
      out.push({
        kind: node.geometry?.kind, material: node.material, x, y, z,
        planeW: p[0], planeD: p[1], radius: p[0],
      });
    }
    for (const c of node.children) walk(c, x, y, z);
  };
  walk(world.group, 0, 0, 0);
  return out;
}

const CAR_TOP = 3.0;      // roof height of the toy-scale car plus margin
const CLEAR_TOP = CAR_TOP + 0.6;   // the band that must stay empty to drive

// ---------------------------------------------------------------------------
// 1. The shell is continuous. This is the "you cannot get out of it" test.
// ---------------------------------------------------------------------------

// The four shell centre lines. A wall runs along one axis at a constant
// position on the other; `run` is the span it has to cover.
const SHELL = [
  { side: 'east', axis: 'z', at: HOUSE.maxX + HOUSE.wall / 2, a0: HOUSE.minZ, a1: HOUSE.maxZ },
  { side: 'west', axis: 'z', at: HOUSE.minX - HOUSE.wall / 2, a0: HOUSE.minZ, a1: HOUSE.maxZ },
  { side: 'north', axis: 'x', at: HOUSE.maxZ + HOUSE.wall / 2, a0: HOUSE.minX, a1: HOUSE.maxX },
  { side: 'south', axis: 'x', at: HOUSE.minZ - HOUSE.wall / 2, a0: HOUSE.minX, a1: HOUSE.maxX },
];

// The one legitimate hole: the dark garage's roller door, on the west wall.
const ROLLER = { axis: 'z', at: HOUSE.minX - HOUSE.wall / 2, a0: HOUSE_EXIT.z0, a1: HOUSE_EXIT.z1 };

// The union of collider spans on one shell line, merged, as sorted intervals.
function coveredSpans(colliders, s) {
  const along = (c) => (s.axis === 'x' ? [c.x - c.halfW, c.x + c.halfW] : [c.z - c.halfD, c.z + c.halfD]);
  const on = (c) => (s.axis === 'x' ? Math.abs(c.z - s.at) : Math.abs(c.x - s.at)) < 0.6;
  const spans = colliders.filter(on).filter((c) => !c.ceiling && !c.soft)
    .map(along).sort((p, q) => p[0] - q[0]);
  const merged = [];
  for (const [a, b] of spans) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1] + 0.01) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  return merged;
}

// The largest uncovered stretch of a shell line, ignoring `hole`, or 0 if the
// line is fully covered. `hole` is the one span that is meant to be open.
function biggestGap(colliders, s, hole = null) {
  const merged = coveredSpans(colliders, s);
  let worst = 0;
  let cursor = s.a0;
  const open = hole && hole.at === s.at && hole.axis === s.axis;
  for (const [a, b] of merged) {
    if (a > cursor) {
      // A gap is a defect unless it is exactly the roller door and nothing else.
      const width = a - cursor;
      if (!open || cursor < hole.a0 - 0.5 || a > hole.a1 + 0.5) worst = Math.max(worst, width);
    }
    cursor = Math.max(cursor, b);
  }
  if (s.a1 > cursor) {
    if (!open || cursor < hole.a0 - 0.5 || s.a1 > hole.a1 + 0.5) worst = Math.max(worst, s.a1 - cursor);
  }
  return worst;
}

test('the shell wall is solid along its whole length except the roller door', async () => {
  // THE test for "you cannot get out of it". A window is not a hole: `window_()`
  // pushes a full-height collider behind the glass, so the wall the car meets is
  // continuous even where you can see out. The one real gap has to be the dark
  // garage's roller door, and it has to be the ONLY one - any other gap means a
  // panel was dropped and the car is on the grass.
  const { colliders } = await house();
  assert.ok(colliders.length > 20, `only ${colliders.length} colliders were built`);
  for (const s of SHELL) {
    const gap = biggestGap(colliders, s, ROLLER);
    assert.ok(gap < 0.5,
      `the ${s.side} shell has a ${gap.toFixed(2)} hole in it, spanning ` +
      `z or x ${s.a0}..${s.a1} at ${s.at}`);
  }
});

test('the roller door is the only opening, and it is on the west wall', async () => {
  // Stated separately, and from the other direction. The coverage test above
  // permits one gap; this pins down where that one gap is, so adding a second
  // opening anywhere cannot pass by being small.
  const { colliders } = await house();
  for (const s of SHELL) {
    const merged = coveredSpans(colliders, s);
    const gaps = [];
    let cursor = s.a0;
    for (const [a, b] of merged) {
      if (a > cursor + 0.5) gaps.push([cursor, a]);
      cursor = Math.max(cursor, b);
    }
    if (s.a1 > cursor + 0.5) gaps.push([cursor, s.a1]);
    for (const [ga, gb] of gaps) {
      const isRoller = s.axis === ROLLER.axis && Math.abs(s.at - ROLLER.at) < 0.6
        && Math.abs(ga - ROLLER.a0) < 0.5 && Math.abs(gb - ROLLER.a1) < 0.5;
      assert.ok(isRoller,
        `the ${s.side} shell has an opening at ${ga}..${gb} that is not the roller door`);
    }
  }
});

test('the front door has no hole behind it, anywhere on the east wall', async () => {
  // The specific thing the player will try. The east wall is where they are put
  // down and where the door is, and it has to be solid from the skirting to the
  // ceiling across the whole width of the door.
  const { colliders } = await house();
  const east = SHELL[0];
  const onEast = colliders.filter((c) => Math.abs(c.x - east.at) < 0.6 && !c.ceiling && !c.soft);
  assert.ok(onEast.length > 0, 'the east shell has no colliders at all');
  for (const c of onEast) {
    const z0 = c.z - c.halfD, z1 = c.z + c.halfD;
    const overlap = Math.min(z1, DOOR_Z1) - Math.max(z0, DOOR_Z0);
    if (overlap > 0.5) {
      assert.ok(c.h >= FRONT_DOOR.h - 0.5,
        `the east shell is only ${c.h} tall across z ${z0.toFixed(1)}..${z1.toFixed(1)}, ` +
        'which leaves a gap over the front door');
    }
  }
});

test('every room boundary is on that wall, so the covered run is the whole house', async () => {
  // Guards the tests above from passing for the wrong reason. If the shell were
  // accidentally built short, the coverage check would be checking less than it
  // claims. The covered span has to reach both ends of the footprint.
  const { colliders } = await house();
  for (const s of SHELL) {
    const merged = coveredSpans(colliders, s);
    const first = merged[0], last = merged[merged.length - 1];
    assert.ok(first[0] <= s.a0 + 0.5,
      `the ${s.side} shell starts at ${first[0]}, inside the ${s.a0} it should cover`);
    assert.ok(last[1] >= s.a1 - 0.5,
      `the ${s.side} shell stops at ${last[1]}, inside the ${s.a1} it should cover`);
  }
});

// ---------------------------------------------------------------------------
// 2. The front door is drawn shut, and locked.
// ---------------------------------------------------------------------------

// The door's own span in z, and the x it is drawn at. It hangs on the room side
// of the east shell, so it is INBOARD of the plaster rather than in the wall.
const DOOR_Z0 = FRONT_DOOR.z0, DOOR_Z1 = FRONT_DOOR.z1;
const DOOR_W = DOOR_Z1 - DOOR_Z0;
const DOOR_Z = (DOOR_Z0 + DOOR_Z1) / 2;

test('the front door is a solid slab across the whole opening', async () => {
  // A shut door, not an open frame and not a hole. It has to cover the full
  // width of the opening and the full height of it, and it has to sit inboard
  // of the shell so it is the thing you see, with masonry behind it.
  const boxes = await houseBoxes();
  const leaf = boxes.filter((b) =>
    Math.abs(b.x1 - (FRONT_DOOR.at - HOUSE.wall / 2 - 0.35)) < 0.6   // the authored leaf plane
    && (b.z1 - b.z0) >= DOOR_W - 1                                        // the whole width
    && b.y0 <= 0.5                                                       // down to the floor
    && b.y1 >= FRONT_DOOR.h - 0.5);                                      // up to the head
  assert.ok(leaf.length > 0, 'nothing is drawn as a door leaf across the opening');
});

test('the front door is locked, not merely shut', async () => {
  // A door that is only shut invites trying it. There is deadbolt, a hasp with
  // a padlock through it, and a chain on, so every one of the things you would
  // try answers no.
  const boxes = await houseBoxes();
  const onDoor = boxes.filter((b) =>
    b.x1 < FRONT_DOOR.at - HOUSE.wall / 2
    && b.x0 > FRONT_DOOR.at - HOUSE.wall / 2 - 4      // hanging on the door, not the room
    && b.z0 >= DOOR_Z0 - 3 && b.z1 <= DOOR_Z1 + 3);
  // Deadbolt, padlock body, chain links, letterbox, knocker: six separate
  // pieces of hardware is the floor here.
  assert.ok(onDoor.length >= 6,
    `only ${onDoor.length} piece(s) of hardware on the front door; it does not read as locked`);
  // The chain has to be high and long enough to look like a chain, not a stud.
  const chain = onDoor.filter((b) => b.y0 > 12 && (b.z1 - b.z0) < 4 && (b.z1 - b.z0) > 1);
  assert.ok(chain.length >= 5, `only ${chain.length} chain link(s) on the door`);
});

test('the front door is not a way out, and not a trigger', async () => {
  assert.equal(FRONT_DOOR.dirX, undefined, 'the front door is a trigger, so it is a way out');
  assert.equal(FRONT_DOOR.mouthX, undefined, 'the front door has a mouth, so it is a way out');
  // The only exit in the house is in the dark garage, and it points west, out
  // through a wall the player never walks past.
  assert.equal(HOUSE_EXIT.dirX, -1, 'the exit no longer points out of the west wall');
  assert.equal(HOUSE_EXIT.dirZ, 0, 'the exit no longer runs along the west wall');
  const g = ROOMS.darkGarage;
  assert.ok(HOUSE_EXIT.x0 >= g.x0 && HOUSE_EXIT.x1 <= g.x1, 'the exit has left the dark garage');
  // The trigger has to start at the shell's inner face, or the car stops short
  // of the hole and sits in the dark garage with nothing happening.
  assert.ok(HOUSE_EXIT.mouthX <= HOUSE.minX + 0.5,
    `the exit mouth is at x ${HOUSE_EXIT.mouthX}, but the shell's inner face is ${HOUSE.minX}`);
  assert.ok(HOUSE_EXIT.mouthX === g.x0, 'the exit mouth is not the dark garage wall');
});

// ---------------------------------------------------------------------------
// 3. The dark garage is the way out, and it is dark.
// ---------------------------------------------------------------------------

// The lane the car actually drives: in through the kitchen doorway, west down
// the middle of the garage, and out through the west wall. The doorway span is
// the source of truth for where the lane is, and the strip is one car wide down
// its centre, because a bench tucked against the north wall is not an obstacle.
//
// The lane starts at the shell's INNER face, not its centre line. The wall at the
// far end is supposed to be there — it is the sealed west wall, and HOUSE_EXIT
// fires when the car reaches its inside face, so the drive ends there rather
// than passing through. Starting the lane at `minX - wall` instead would count
// that wall as an obstruction, and the wall is the one thing in here that must
// never move.
const GARAGE_DOORWAY = HOUSE_WALLS.find((w) => w.axis === 'z'
  && Math.abs(w.at - ROOMS.darkGarage.x1) < 0.01 && w.gap);
const LANE_Z = (GARAGE_DOORWAY.gap.a0 + GARAGE_DOORWAY.gap.a1) / 2;
const CAR_HALF_W = 3;
const LANE_Z0 = LANE_Z - CAR_HALF_W, LANE_Z1 = LANE_Z + CAR_HALF_W;
const LANE_X0 = HOUSE.minX, LANE_X1 = ROOMS.darkGarage.x1 + 1;

test('the drive lane from the kitchen doorway to the exit is clear', async () => {
  // The whole design rests on this: you must be able to drive the length of the
  // garage into the exit. Anything standing in a one-car-wide strip down the
  // middle of the doorway, from the doorway wall to the shell, stops it.
  const boxes = await houseBoxes();
  const inLane = boxes.filter((b) => {
    if (b.z1 <= LANE_Z0 || b.z0 >= LANE_Z1) return false; // beside the lane
    if (b.y0 >= CLEAR_TOP || b.y1 <= 0.4) return false;  // overhead / on the floor
    return b.x1 > LANE_X0 && b.x0 < LANE_X1;             // anywhere along the run
  });
  assert.equal(inLane.length, 0,
    `${inLane.length} object(s) sit in the drive lane, e.g. ` +
    `${inLane[0] ? `${inLane[0].w}x${inLane[0].h}x${inLane[0].d} at (${inLane[0].x}, ${inLane[0].y}, ${inLane[0].z})` : ''}`);
});

test('the whole width of the kitchen/garage doorway is clear', async () => {
  // Stricter than the lane: the full 20-wide opening, so you cannot enter
  // off-centre either. The wall's own jamb trim is excluded by requiring the
  // obstruction to be clear of the wall plane.
  const boxes = await houseBoxes();
  const { a0, a1 } = GARAGE_DOORWAY.gap;
  const blocked = boxes.filter((b) =>
    b.z1 > a0 + 0.6 && b.z0 < a1 - 0.6
    && b.y0 < CLEAR_TOP && b.y1 > 0.4
    && b.x1 > GARAGE_DOORWAY.at - 1.6 && b.x0 < GARAGE_DOORWAY.at + 1.6);
  assert.equal(blocked.length, 0,
    `${blocked.length} object(s) narrow the kitchen/garage doorway, e.g. ` +
    `${blocked[0] ? `${blocked[0].w}x${blocked[0].h}x${blocked[0].d} at (${blocked[0].x}, ${blocked[0].y}, ${blocked[0].z})` : ''}`);
});

test('the dark garage is reachable from the kitchen and from nowhere else', async () => {
  // Its walls: north and west are the shell, south is the hall, east is the
  // kitchen. Exactly one of the four may have a doorway in it. A wall is only
  // this room's boundary if it sits on one of its edges AND runs across the
  // span of that edge — otherwise every wall on the same line counts, and the
  // kitchen/hall and living/hall doorways (which share z = 46 with the
  // garage/hall wall) are counted as if they opened into the garage.
  const g = ROOMS.darkGarage;
  const bounds = [
    { axis: 'z', at: g.x0, from: g.z0, to: g.z1, name: 'west' },
    { axis: 'z', at: g.x1, from: g.z0, to: g.z1, name: 'east' },
    { axis: 'x', at: g.z0, from: g.x0, to: g.x1, name: 'south' },
    { axis: 'x', at: g.z1, from: g.x0, to: g.x1, name: 'north' },
  ];
  const walls = HOUSE_WALLS.filter((w) => {
    const b = bounds.find((b) => b.axis === w.axis && Math.abs(b.at - w.at) < 0.01);
    return b && w.run1 > b.from + 0.01 && w.run0 < b.to - 0.01;   // spans this edge
  });
  // The south wall is listed in two pieces in the layout, so the count of
  // matching walls is not the count of boundaries. Judge by what can be entered.
  const open = walls.filter((w) => w.gap);
  assert.equal(open.length, 1, `the dark garage has ${open.length} doorway(s); it should have exactly one`);
  assert.equal(open[0].at, g.x1, 'the dark garage doorway is not on the kitchen side');
  // ...and the shell sides have to be on the shell, not drawn as interior walls
  // with a gap in them.
  assert.equal(walls.filter((w) => w.at === g.x0 || w.at === g.z1).length, 0,
    'a wall has been authored on top of the dark garage shell');
});

test('the dark garage has no windows and no ceiling light', async () => {
  // Two separate reasons it is dark: no daylight, and no lamp overhead. The only
  // light source in the room is the beckoning clamp lamp, which is asserted
  // separately below.
  const meshes = await houseMeshes();
  // MAT.glass is the only transparent material in the house.
  const glass = meshes.filter((m) => m.material?.transparent === true && m.kind === 'box');
  const onWest = glass.filter((m) => Math.abs(m.x - (HOUSE.minX - HOUSE.wall / 2)) < 1
    && m.z > g0z(ROOMS.darkGarage) - 2 && m.z < ROOMS.darkGarage.z1 + 2);
  const onNorth = glass.filter((m) => Math.abs(m.z - (HOUSE.maxZ + HOUSE.wall / 2)) < 1
    && m.x > ROOMS.darkGarage.x0 - 2 && m.x < ROOMS.darkGarage.x1 + 2);
  assert.equal(onWest.length + onNorth.length, 0,
    'the dark garage has glazing in it, so it is not dark');
});

test('the only light in the dark garage is the beckoning lamp', async () => {
  const { lights } = await house();
  const g = ROOMS.darkGarage;
  const inRoom = lights.filter((l) => l.position.x > g.x0 - 4 && l.position.x < g.x1 + 4
    && l.position.z > g.z0 - 4 && l.position.z < g.z1 + 4);
  assert.equal(inRoom.length, 1,
    `the dark garage has ${inRoom.length} light(s) in it; it should have only the beckoning lamp`);
  // And it has to be a short-range one. A lamp with a huge `distance` lights the
  // whole garage, which defeats the point of it.
  assert.ok(inRoom[0].distance < 100,
    `the beckoning lamp reaches ${inRoom[0].distance}, which is the whole garage`);
});

// Small helper so the window assertion above reads cleanly.
function g0z(r) { return r.z0; }

// ---------------------------------------------------------------------------
// 6. The way OUT. The exit shot lets the car roll out of the roller door under
//    its own momentum and only cuts once it is well clear of the building, so
//    there has to be drive under it the whole way — and nothing in the way.
// ---------------------------------------------------------------------------

// How far the car actually gets before the cut. main.js holds the shot for a
// derived time, but the speed and the target are both fixed there; this is the
// same arithmetic, kept honest by reading it back off the geometry.
const EXIT_ROLL = { x0: HOUSE_EXIT.x0, x1: HOUSE_EXIT.mouthX - 14, z: LANE_Z, halfW: CAR_HALF_W };

test('there is a real surface to drive out onto, all the way to the cut', async () => {
  // Without this the car drives out of the door and over the sky, which reads as
  // a bug even though the transition itself works. A decal is not enough: the
  // car has to be standing on something at floor height.
  const meshes = await houseMeshes();
  // Horizontal, at floor level. Every `flat()` plane in the house qualifies,
  // which is fine — the sampling below is what actually has to be covered.
  const slabs = meshes
    .filter((m) => m.kind === 'plane' && Math.abs(m.y) <= 0.35)
    .filter((m) => m.planeW > 0 && m.planeD > 0);

  // Every point of the roll must sit on at least one slab. Sampled across the
  // width and along the run, because a slab that only covers the middle would
  // otherwise pass a single centreline check.
  const gaps = [];
  for (let x = EXIT_ROLL.x0; x >= EXIT_ROLL.x1; x -= 2) {
    for (const s of [-1, 0, 1]) {
      const z = EXIT_ROLL.z + s * EXIT_ROLL.halfW;
      const under = slabs.some((m) => Math.abs(m.x - x) <= m.planeW / 2 + 0.01
        && Math.abs(m.z - z) <= m.planeD / 2 + 0.01);
      if (!under) gaps.push({ x, z });
    }
  }
  assert.equal(gaps.length, 0,
    `the car would drive out over nothing at ${gaps.length} point(s), e.g. ` +
    `${gaps[0] ? `(${gaps[0].x}, ${gaps[0].z})` : ''}`);
});

test('the drive is outside the shell and the hedge is broken for it', async () => {
  // The drive is dressing plus a run surface, so it belongs outside the west
  // wall — inside it would be a slab lying across the garage floor.
  assert.ok(DRIVE.x0 <= HOUSE.minX - HOUSE.wall,
    `the drive only reaches x=${DRIVE.x0}, which does not clear the west shell`);
  assert.ok(DRIVE.x1 > DRIVE.x0 + 5, 'the drive has no length to drive along');
  // The near end has to MEET the garage floor, not stop short of it: the shell
  // is 3 thick, so ending at the outer face leaves a strip of bare grass in the
  // doorway for the car to cross.
  assert.ok(DRIVE.x1 >= HOUSE.minX - 0.01,
    `the drive ends at x=${DRIVE.x1}, short of the garage floor at ${HOUSE.minX}`);
  // It has to span the full width of the door, or the car clips off the edge.
  assert.ok(DRIVE.z0 <= HOUSE_EXIT.z0 && DRIVE.z1 >= HOUSE_EXIT.z1,
    `the drive spans z ${DRIVE.z0}..${DRIVE.z1} but the roller door is ` +
    `z ${HOUSE_EXIT.z0}..${HOUSE_EXIT.z1}`);

  // The hedge ring stands 4.4 wide just outside the walls. If it is not broken
  // where the drive goes, the car stops dead against a bush on its way out — and
  // a sphere is not a box, so this has to look at the round ones too.
  const meshes = await houseMeshes();
  const hedgeLine = HOUSE.minX - 12;
  const across = meshes.filter((m) => {
    const r = m.kind === 'sphere' ? Number(m.radius) : null;
    if (!r) return false;
    if (Math.abs(m.x - hedgeLine) > 1) return false;   // only the west run of the ring
    return m.z + r > DRIVE.z0 && m.z - r < DRIVE.z1;     // overlapping the drive's width
  });
  assert.equal(across.length, 0,
    `${across.length} hedge sphere(s) stand across the drive, e.g. ` +
    `${across[0] ? `at (${across[0].x}, ${across[0].z})` : ''}`);
});
