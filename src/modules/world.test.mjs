// rectCircleIntersect() is the one function every collision test in the project
// bottoms out in, so it gets its own file.
//
// The disc case is here because it was MISSING, silently, and everything built
// on top of it carried the bug invisibly: a collider carrying `r` instead of
// `halfW`/`halfD` is how every round thing in the game is expressed - reef
// coral, a crab, a bollard, a tree trunk - and `r !== undefined` was simply
// never checked. A disc collider fell through to the rectangle branch, compared
// `halfW` and `halfD` against `undefined`, and returned false forever. So the
// car drove straight through reef coral that was drawn, lit, and plainly in the
// way, and the reef was advertised as an obstacle in its own layout file.
//
// Nothing about that failure says "collision bug". It says "the coral is
// decorative", which is exactly the kind of conclusion you draw and then stop
// investigating.
//
// Run: node --test src/modules/world.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { rectCircleIntersect } from './world.js';

test('a box collider blocks a circle overlapping its face', () => {
  const wall = { x: 0, z: 0, halfW: 10, halfD: 2 };
  assert.ok(rectCircleIntersect(0, 0, wall, 1), 'dead centre is inside');
  assert.ok(rectCircleIntersect(0, 3, wall, 2), 'a radius that reaches the face');
  assert.ok(!rectCircleIntersect(0, 5, wall, 2), 'a radius that clears it');
  assert.ok(!rectCircleIntersect(14, 0, wall, 2), 'clear off the end');
});

test('a disc collider blocks a circle overlapping it - the missing case', () => {
  const disc = { x: 5, z: -5, r: 3 };
  assert.ok(rectCircleIntersect(5, -5, disc, 1), 'dead centre is inside');
  assert.ok(rectCircleIntersect(5 + 3 + 1, -5, disc, 2), 'radius just overlapping');
  assert.ok(rectCircleIntersect(5 + 3, -5, disc, 1), 'exactly touching');
  assert.ok(!rectCircleIntersect(5 + 3 + 2, -5, disc, 1), 'clear of it');
  assert.ok(!rectCircleIntersect(5, -5 + 3 + 2, disc, 1), 'clear of it the other way');
});

test('a disc is judged by its radius, not by rectangle halves', () => {
  // The same disc, described both ways. If `r` is honoured these agree; if the
  // disc falls through to the rectangle branch they cannot both be true, because
  // halfW/halfD are undefined on a pure disc.
  const asDisc = { x: 0, z: 0, r: 4 };
  assert.ok(!rectCircleIntersect(7, 0, asDisc, 1), 'outside a 4-radius disc');
  assert.ok(rectCircleIntersect(3, 0, asDisc, 1), 'inside a 4-radius disc');
  // A very large disc is still just a disc, and it stops being a wall.
  const huge = { x: 0, z: 0, r: 50 };
  assert.ok(rectCircleIntersect(0, 45, huge, 2), 'a big disc reaches a long way');
  assert.ok(!rectCircleIntersect(0, 53, huge, 2), 'and still ends');
});

test('a collider carrying both is treated as the shape it says it is', () => {
  // Only ever the disc, never the union: a coral head with a bounding box around
  // it must not block the corner of the map its box happens to cover.
  const both = { x: 0, z: 0, r: 1, halfW: 30, halfD: 30 };
  assert.ok(!rectCircleIntersect(20, 0, both, 1), 'the box is ignored when r is present');
  assert.ok(rectCircleIntersect(0, 1, both, 1), 'the disc still counts');
});

test('a zero-radius disc is a point, and blocks only what touches it', () => {
  // A point is not "inside nothing" - it is the smallest solid there is, and a
  // circle centred on it is overlapping it.
  const point = { x: 0, z: 0, r: 0 };
  assert.ok(rectCircleIntersect(0, 0, point, 1), 'centred on it, it is touching');
  assert.ok(rectCircleIntersect(0.9, 0, point, 1), 'a radius that reaches it');
  assert.ok(!rectCircleIntersect(1.5, 0, point, 1), 'a radius that does not');
});