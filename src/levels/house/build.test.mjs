// Runs the real house builder headless.
//
// This is the test that catches the errors a syntax check cannot. The one that
// actually happened: addHouse destructured `wall` out of HOUSE as a wall
// thickness, which shadowed the module-level `function wall(...)` that builds
// wall meshes — so every call became `3(...)` and the level threw "wall is not a
// function" the first time it was built, after the whole city had loaded.
// `node --check` passed, the import passed, and 84 unit tests passed. Only
// calling it found it.
//
// Run: node --test src/levels/house/build.test.mjs
// Run the real house builder headless. The harness (houseHarness.mjs) rewrites
// the CDN three out of both index.js AND the physics.js it imports, because
// patching only the builder died on Node's loader rejecting the `https:`
// specifier one module deeper.
import test from 'node:test';
import assert from 'node:assert/strict';
import { addHouse } from './houseHarness.mjs';
import { ROOMS, CAT_SPOTS } from './layout.js';

const parent = { add() {} };

test('addHouse runs to completion instead of throwing', async () => {
  const world = await addHouse(parent, { catSpots: CAT_SPOTS });
  assert.ok(world && world.group, 'addHouse returned nothing usable');
  // The stub counts nothing, so the real check is simply that it got to the end
  // and handed back the shape main.js destructures.
  for (const k of ['group', 'colliders', 'lights', 'start', 'exit', 'rooms', 'catSpots']) {
    assert.ok(k in world, `addHouse did not return "${k}"`);
  }
});

test('it builds a real set of colliders', async () => {
  const world = await addHouse(parent, {});
  assert.ok(Array.isArray(world.colliders), 'colliders is not an array');
  assert.ok(world.colliders.length > 20,
    `only ${world.colliders.length} colliders were built, which is too few for a walled interior`);
  assert.ok(world.lights.length > 0, 'no lights were built');
});

test('every wall collider is noRoof, or the car can drive on top of it', async () => {
  // House colliders carry h = ceiling height. The physics pass treats a tall
  // collider under the car as a rooftop it may drive along, so without noRoof
  // a 26-tall interior wall becomes a flyable ledge.
  const world = await addHouse(parent, {});
  const walls = world.colliders.filter((c) => !c.ceiling);
  assert.ok(walls.length > 0, 'no wall colliders at all');
  const missing = walls.filter((c) => c.noRoof !== true);
  assert.equal(missing.length, 0,
    `${missing.length} wall collider(s) lack noRoof, e.g. (${missing[0]?.x}, ${missing[0]?.z})`);
});

test('the ceiling is a collider but never blocks driving', async () => {
  const world = await addHouse(parent, {});
  const ceil = world.colliders.filter((c) => c.ceiling);
  assert.ok(ceil.length > 0, 'the roof has no collider at all');
  for (const c of ceil) {
    assert.ok(c.soft, 'the ceiling must be soft or it would block driving');
    assert.ok(c.noRoof, 'the ceiling must be noRoof or it reads as a drivable roof');
  }
});

test('the arrival point is in the foyer, where the car is put down', async () => {
  const world = await addHouse(parent, {});
  const f = ROOMS.foyer;
  assert.ok(world.start.x > f.x0 && world.start.x < f.x1
    && world.start.z > f.z0 && world.start.z < f.z1, 'the arrival point is not in the foyer');
});

test('every cat spot is inside the house and clear of the interior walls', async () => {
  const { HOUSE, HOUSE_WALLS } = await import('./layout.js');
  for (const s of CAT_SPOTS) {
    assert.ok(s.x > HOUSE.minX && s.x < HOUSE.maxX && s.z > HOUSE.minZ && s.z < HOUSE.maxZ,
      `cat spot (${s.x}, ${s.z}) is outside the house`);
    for (const w of HOUSE_WALLS) {
      const inWall = w.axis === 'z'
        ? Math.abs(s.x - w.at) < 2.5 && s.z > w.run0 - 2.5 && s.z < w.run1 + 2.5
        : Math.abs(s.z - w.at) < 2.5 && s.x > w.run0 - 2.5 && s.x < w.run1 + 2.5;
      assert.ok(!inWall, `cat spot (${s.x}, ${s.z}) is inside the wall at ${w.axis}=${w.at}`);
    }
  }
});
