// Runs the real museum builder headless, with the CDN three swapped for the
// local stub (the same resolve hook the house tests use).
//
// Run: node --test src/levels/museum/build.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('../house/threeShim.mjs', import.meta.url);

const {
  buildMuseumWorld, MUSEUM_HALL, MUSEUM_START, MUSEUM_EXIT, MUSEUM_VESTIBULE,
  ATRIUM_EDGE, EXHIBIT, RAMP, BALCONY,
} = await import('./index.js');

function build() {
  return buildMuseumWorld({ add() {} });
}

test('buildMuseumWorld runs to completion and returns the main.js shape', () => {
  const world = build();
  for (const k of ['group', 'colliders', 'lights', 'start', 'exit', 'update', 'surfaceAt', 'onRamp']) {
    assert.ok(k in world, `the builder did not return "${k}"`);
  }
  assert.equal(typeof world.update, 'function');
  world.update(0.016, { x: 0, y: 0, z: 118 });   // must not throw
  assert.equal(world.surfaceAt(0, 100), 0);
  assert.equal(world.surfaceAt(0, -120), EXHIBIT.floorY);
});

test('it builds a real set of colliders and lights', () => {
  const world = build();
  assert.ok(Array.isArray(world.colliders));
  assert.ok(world.colliders.length > 60,
    `only ${world.colliders.length} colliders were built; the hill, balconies, ramp and furniture should all be solid`);
  assert.ok(world.lights.length >= 8, 'not enough lights to read the two-storey building');
});

test('every wall collider is noRoof, or the car drives on top of the walls', () => {
  const world = build();
  const walls = world.colliders.filter((c) => !c.ceiling);
  assert.ok(walls.length > 30);
  const missing = walls.filter((c) => c.noRoof !== true);
  assert.equal(missing.length, 0,
    `${missing.length} wall collider(s) lack noRoof, e.g. (${missing[0]?.x}, ${missing[0]?.z})`);
});

test('the ceiling is soft and noRoof', () => {
  const world = build();
  const ceil = world.colliders.filter((c) => c.ceiling);
  assert.ok(ceil.length > 0, 'the hall has no ceiling collider');
  for (const c of ceil) assert.ok(c.soft && c.noRoof);
});

test('every collider sits inside the building footprint (plus the vestibule)', () => {
  const world = build();
  const m = 10;   // wall thickness plus trim
  const zMax = MUSEUM_VESTIBULE.z1 + m;
  for (const c of world.colliders) {
    if (c.ceiling) continue;
    assert.ok(c.x - c.halfW >= MUSEUM_HALL.minX - m, `collider at x=${c.x} leaks west`);
    assert.ok(c.x + c.halfW <= MUSEUM_HALL.maxX + m, `collider at x=${c.x} leaks east`);
    assert.ok(c.z - c.halfD >= MUSEUM_HALL.minZ - m, `collider at z=${c.z} leaks north`);
    assert.ok(c.z + c.halfD <= zMax, `collider at z=${c.z} leaks south`);
  }
});

test('the floor colliders leave the ramp open', () => {
  const world = build();
  // Nothing solid may stand in the central ramp run.
  const midZ = (RAMP.zTop + RAMP.zBottom) / 2;
  const blocking = world.colliders.filter((c) => !c.ceiling && !c.soft &&
    Math.abs(c.x) < RAMP.halfW && Math.abs(c.z - midZ) < 8);
  assert.equal(blocking.length, 0, 'the ramp is walled off');
});

test('the top of the stairs opens left and right onto the balconies', () => {
  const world = build();
  const zLanding = (RAMP.zTop + ATRIUM_EDGE) / 2;
  for (const x of [-70, -50, -40, 40, 50, 70]) {
    assert.equal(world.surfaceAt(x, zLanding), 0, `no landing floor at (${x}, ${zLanding})`);
    const blocking = world.colliders.filter((c) => !c.ceiling && !c.soft &&
      Math.abs(c.x - x) < 2.5 && c.z - c.halfD < zLanding + 3 && c.z + c.halfD > zLanding - 3);
    assert.equal(blocking.length, 0,
      `a barrier at (${x}, ${zLanding}) stops the car turning onto the balcony`);
  }
});

test('the balconies are open ledges, so the car can fly off them', () => {
  const world = build();
  const edges = world.colliders.filter((c) => !c.ceiling &&
    Math.abs(Math.abs(c.x) - BALCONY.innerX) < 2 && c.z < ATRIUM_EDGE);
  assert.equal(edges.length, 0,
    `${edges.length} collider(s) still fence the balcony edge, e.g. (${edges[0]?.x}, ${edges[0]?.z})`);
  const northEnd = world.colliders.filter((c) => !c.ceiling &&
    Math.abs(c.z - EXHIBIT.northInnerZ) < 2 && c.halfW > 40);
  assert.equal(northEnd.length, 0, 'the far balcony still has a railing across it');
});

test('the start and exit handed back are the plan values', () => {
  const world = build();
  assert.equal(world.start, MUSEUM_START);
  assert.equal(world.exit, MUSEUM_EXIT);
});
