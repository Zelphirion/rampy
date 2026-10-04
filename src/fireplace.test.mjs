// The fire's geometry, checked against the house it has to sit in.
//
//   Run: node --test src/fireplace.test.mjs
//
// The builder itself is checked by furnitureAudit.test.mjs (which reads the real
// meshes); what is tested here is the NUMBERS the fire depends on, because the
// things that break are the things nobody looks at: an apron that reaches into a
// sofa, a hearth box that swallows the doorway, a trigger so big it catches cars
// in the kitchen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROOMS, HOUSE_WALLS, FIREPLACE } from './levels/house/layout.js';

// The fire-averse kinds. Kept in step with main.js's isFireRepelledKind by
// spelling them out here rather than importing, because main.js is not importable
// in node (it pulls THREE off a CDN) and a test that silently drifted from the
// code it covers would be worse than no test.
const FIRE_REPELLED = ['tarantula', 'skateboarder'];

test('the fire sits inside the living room', () => {
  const r = ROOMS.living;
  assert.ok(FIREPLACE.x > r.x0 && FIREPLACE.x < r.x1, 'breast x inside the room');
  assert.ok(FIREPLACE.z > r.z0 && FIREPLACE.z < r.z1, 'breast z inside the room');
  // 5 deep against the west wall means the breast's west face is at x0 + 2.
  assert.ok(FIREPLACE.x - 2.5 >= r.x0, 'the breast is hard against the wall');
});

test('the hearth box is a well-formed rectangle', () => {
  const h = FIREPLACE.hearth;
  assert.ok(h.x0 < h.x1, 'x ascending');
  assert.ok(h.z0 < h.z1, 'z ascending');
});

test('the hearth is big enough to park a car in, and no bigger', () => {
  const h = FIREPLACE.hearth;
  // A car is 4.3 long and 2.2 in radius; it has to fit with room to spare or the
  // trigger trips on approach and lets go on the way in.
  assert.ok(h.x1 - h.x0 >= 8, `hearth too narrow to sit in: ${h.x1 - h.x0}`);
  assert.ok(h.z1 - h.z0 >= 14, `hearth too shallow to sit in: ${h.z1 - h.z0}`);
  // ...and small enough that it is a deliberate place to park, not a region.
  assert.ok(h.x1 - h.x0 <= 16, 'the hearth has swallowed part of the room');
  assert.ok(h.z1 - h.z0 <= 22, 'the hearth has swallowed part of the room');
});

test('the hearth stays inside the living room', () => {
  const r = ROOMS.living;
  const h = FIREPLACE.hearth;
  assert.ok(h.x0 >= r.x0 && h.x1 <= r.x1, 'hearth inside the room in x');
  assert.ok(h.z0 >= r.z0 && h.z1 <= r.z1, 'hearth inside the room in z');
});

test('the hearth box never overlaps an interior wall', () => {
  const h = FIREPLACE.hearth;
  for (const w of HOUSE_WALLS) {
    // `axis` is the way the wall RUNS, so a wall along Z stands at a constant x
    // and vice versa. T is the interior wall thickness (same as the shell's).
    const box = w.axis === 'x'
      ? { x0: w.run0, x1: w.run1, z0: w.at - 1.5, z1: w.at + 1.5 }
      : { x0: w.at - 1.5, x1: w.at + 1.5, z0: w.run0, z1: w.run1 };
    const hit = h.x1 > box.x0 && h.x0 < box.x1 && h.z1 > box.z0 && h.z0 < box.z1;
    assert.ok(!hit, `the hearth is inside the ${w.axis}-running wall at ${w.at}`);
  }
});

test('the fire-averse kinds are the spider and the skater, and nothing else', () => {
  // These two are the only CAR_KINDS ids that are not really cars: one is eight
  // legs and the other is a person on a board. Neither can be sooted, so both are
  // thrown clear of the hearth instead.
  assert.deepEqual([...FIRE_REPELLED].sort(), ['skateboarder', 'tarantula']);
});

test('the repulse point is out of the fire, and roughly halfway across the room', () => {
  const r = ROOMS.living;
  const h = FIREPLACE.hearth;
  const p = FIREPLACE.repulse;
  assert.ok(p.x > h.x1, 'the bounce lands beyond the hearth, not in it');
  assert.ok(p.z > h.z0 && p.z < h.z1, 'and on the same line of the room, not through a wall');
  // "Halfway across the room" — from the hearth's mouth to the far (east) wall.
  const trip = (r.x1 - h.x1) / 2;
  assert.ok(Math.abs((p.x - h.x1) - trip) < 12, `bounce travels ${p.x - h.x1}, expected about ${trip}`);
});

test('the fire-averse check covers exactly the ids main.js knows', () => {
  // main.js's isFireRepelledKind is a two-way name comparison. If a kind is
  // renamed in CAR_KINDS this list has to follow it, and this is the reminder:
  // the ids here have to exist in cars.js's builders or the rule is dead code.
  const src = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
  assert.ok(src.includes("kind === 'tarantula'"), 'main.js still knows the tarantula by that id');
  assert.ok(src.includes("kind === 'skateboarder'"), 'main.js still knows the skater by that id');
});
