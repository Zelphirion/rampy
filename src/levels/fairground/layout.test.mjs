// Unit tests for the county fair's layout constants.
// Run: node --test src/levels/fairground/layout.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FAIR_GROUND, FAIR_BOUNDS, FAIR_SPAWN, FAIR_RETURN, FAIR_LANE, FAIR_SCATTER,
  FAIR_WALL_INSET, FAIR_WALL_TOP, BOOTHS, FERRIS, PENDULUM, COASTER, TILT, SWINGS,
  fairBoundsColliders, clampInsideFair,
} from './layout.js';

test('the ground is flat, and the spawn sits inside the fence', () => {
  assert.equal(FAIR_GROUND, 0);
  assert.ok(FAIR_BOUNDS.x0 < FAIR_BOUNDS.x1);
  assert.ok(FAIR_BOUNDS.z0 < FAIR_BOUNDS.z1);
  for (const p of [FAIR_SPAWN, FAIR_RETURN]) {
    assert.ok(p.x > FAIR_BOUNDS.x0 && p.x < FAIR_BOUNDS.x1, 'x inside');
    assert.ok(p.z > FAIR_BOUNDS.z0 && p.z < FAIR_BOUNDS.z1, 'z inside');
  }
});

test('a car arrives facing north, at the south end of the midway', () => {
  // forward = (-cos yaw, sin yaw), so yaw = PI/2 points at +Z (north).
  assert.equal(FAIR_SPAWN.yaw, Math.PI / 2);
  const spawn = FAIR_SPAWN;
  for (const ride of [FERRIS, PENDULUM, TILT, SWINGS]) {
    assert.ok(ride.z > spawn.z, 'every ride is north of the arriving car');
  }
  assert.ok(COASTER.stationZ > spawn.z);
});

test('the return gate stands behind the spawn, never on top of it', () => {
  assert.ok(FAIR_RETURN.z < FAIR_SPAWN.z, 'gate is south of the spawn');
  assert.ok(FAIR_SPAWN.z - FAIR_RETURN.z > FAIR_RETURN.halfD + 2,
    'the spawn is clear of the gate trigger box');
});

test('the driving lane is genuinely open: no booth stands in it', () => {
  for (const b of BOOTHS) {
    const inLane = b.x >= FAIR_LANE.x0 && b.x <= FAIR_LANE.x1 &&
      b.z >= FAIR_LANE.z0 && b.z <= FAIR_LANE.z1;
    assert.ok(!inLane, `${b.id} has been placed in the driving lane`);
  }
});

test('every booth is on one side of the lane, and faces it', () => {
  for (const b of BOOTHS) {
    assert.ok(Math.abs(b.x) > FAIR_LANE.x1, `${b.id} should be off the lane`);
    // facing = -PI/2 turns the booth's +Z front to -X; +PI/2 turns it to +X.
    const expected = b.x < 0 ? Math.PI / 2 : -Math.PI / 2;
    assert.equal(b.facing, expected, `${b.id} faces away from the midway`);
  }
});

test('the solid scatter (tubs, cups, bottles) is clear of the lane', () => {
  for (const s of FAIR_SCATTER) {
    if (s.kind === 'popcorn') continue;   // spilled kernels: no collider, may lie anywhere
    assert.ok(Math.abs(s.x) > FAIR_LANE.x1, `${s.kind} at x=${s.x} blocks the lane`);
  }
});

test('the boundary is four tall invisible walls', () => {
  const cols = fairBoundsColliders();
  assert.equal(cols.length, 4);
  for (const c of cols) {
    assert.equal(c.h, FAIR_WALL_TOP);
    assert.equal(c.top, FAIR_WALL_TOP);
    assert.ok(c.h > 100, 'a wall high enough that a thrown car cannot clear it');
  }
});

test('clampInsideFair reports which wall was crossed', () => {
  const inside = clampInsideFair(0, 0);
  assert.equal(inside.x, 0);
  assert.equal(inside.z, 0);
  assert.equal(inside.hitX, 0);
  assert.equal(inside.hitZ, 0);

  const east = clampInsideFair(FAIR_BOUNDS.x1 + 40, 0);
  assert.equal(east.hitX, 1);
  assert.equal(east.x, FAIR_BOUNDS.x1 - FAIR_WALL_INSET);

  const south = clampInsideFair(0, FAIR_BOUNDS.z0 - 40);
  assert.equal(south.hitZ, -1);
  assert.equal(south.z, FAIR_BOUNDS.z0 + FAIR_WALL_INSET);
});

test('every ride is inside the fence, with room to stand', () => {
  for (const r of [FERRIS, PENDULUM, TILT, SWINGS]) {
    assert.ok(r.x > FAIR_BOUNDS.x0 + 20 && r.x < FAIR_BOUNDS.x1 - 20, 'ride clear of the east/west walls');
    assert.ok(r.z > FAIR_BOUNDS.z0 + 20 && r.z < FAIR_BOUNDS.z1 - 20, 'ride clear of the north/south walls');
  }
  // The ferris wheel's rim must not intersect the fence line.
  assert.ok(FERRIS.x - FERRIS.r > FAIR_BOUNDS.x0);
  assert.ok(FERRIS.z + FERRIS.r < FAIR_BOUNDS.z1);
});
