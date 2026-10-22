// The gate to the deep.
//
// The mermaids, their castle and the wreck all sit BEHIND a blue flag, and
// none of them is in the picture until the player's eye is under the water.
// The flag is not lifted before that either: it hangs limp against its post
// until the first dive, and then it stays up.
//
// This test drives the REAL beach world - the same builders the game uses -
// because the gate is a question about what is actually drawn, and only the
// real scene graph can answer that.
//
// nodeShims.mjs does the two jobs it has to do: it installs the DOM globals
// the level modules touch at import time, and it redirects the CDN three
// import to the local npm copy, so the suite still runs with a plain
// `node --test "src/**/*.test.mjs"` and no special flags.
import '../../objects/nodeShims.mjs';

import test from 'node:test';
import assert from 'node:assert/strict';

const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js');
const { createBeachWorld } = await import('./index.js?v=1800000000003');
const { BEACH_SEA_Y, BEACH_BLUE_FLAG, beachGroundOffsetAt } =
  await import('./layout.js?v=1800000000003');

const BASE = 0.15;
const SURFACE = BASE + BEACH_SEA_Y;

// The world is built once for the whole file: it is the same world the game
// builds, and building it is the expensive part.
const world = createBeachWorld(null, { groundHeight: BASE });

// A car standing on the sand up the beach, well clear of the water.
const CAR = { x: 0, y: BASE, z: 40 };

// One frame of the beach, with the eye (the camera) at the given height.
const tick = (camY, delta = 1 / 60) =>
  world.update(delta, CAR, 2.2, false, null, camY);

const allVisible = () => world.deepObjects.every((o) => o.visible);
const noneVisible = () => world.deepObjects.every((o) => !o.visible);

test('the deep starts shut: nothing drowned is in the picture before the first dive', () => {
  // The world is built with the deep already hidden, so the very first frame -
  // the player standing on the sand - cannot catch a glimpse of the castle.
  assert.equal(world.deepRevealed, false);
  assert.equal(world.flagLifted, false);
  assert.ok(world.deepObjects.length >= 4,
    `the castle, the wreck, the treasure and the mermaids are all behind the flag (${world.deepObjects.length})`);
  assert.ok(noneVisible(), 'none of the deep is drawn');
});

test('an eye above the water sees nothing of the deep, however deep the car is', () => {
  tick(SURFACE + 2);
  assert.equal(world.deepRevealed, false);
  assert.ok(noneVisible(), 'the deep is not drawn');
  assert.equal(world.flagLifted, false, 'the flag is still furled against its post');
});

test('the deep opens for an eye under the water', () => {
  tick(SURFACE - 1);
  assert.equal(world.deepRevealed, true);
  assert.ok(allVisible(), 'the mermaids, the castle and the wreck are all there');
});

test('the flag lifts on the first dive, and stays up', () => {
  tick(SURFACE - 1);
  assert.equal(world.flagLifted, true, 'the flag is up once the eye has been under');
  // Surfacing shuts the deep again - the sea closes over it - but the flag
  // stays where it was raised.
  tick(SURFACE + 2);
  assert.equal(world.deepRevealed, false, 'the deep is shut again');
  assert.ok(noneVisible(), 'and it is not drawn');
  assert.equal(world.flagLifted, true, 'but the flag stays up');
});

test('the flag stands on the sea floor and breaks the surface', () => {
  const F = BEACH_BLUE_FLAG;
  const floor = beachGroundOffsetAt(F.x, F.z);
  assert.ok(floor < BEACH_SEA_Y, 'the post is planted in the sea, not in the sand');
  // Its foot is on the floor, and its top is well clear of the water, so from
  // the beach it is a marker standing out in the sea rather than a thing
  // drowned out of sight.
  const flagGroup = world.blueFlag.group;
  assert.equal(flagGroup.position.y, BASE + floor, 'the post stands on the sea floor');
  const top = flagGroup.position.y + F.poleH;
  assert.ok(top > SURFACE + 3, `the post breaks the surface (top ${top.toFixed(2)})`);
  // The pennant hangs from the spar near the top, so the flag itself is above
  // the water even when it is furled.
  assert.ok(flagGroup.position.y + F.yardY - F.flagW > SURFACE,
    'the furled flag is still above the water');
});

test('the flag hangs limp before the dive, and flies out after it', () => {
  const F = BEACH_BLUE_FLAG;
  const flag = world.blueFlag;
  const group = flag.group;
  group.updateMatrixWorld(true);

  // The far corner of the cloth, in world space. While the flag is furled it
  // hangs DOWN the post; once it is flying it reaches OUT from it.
  const flyCorner = () => {
    group.updateMatrixWorld(true);
    return flag.cloth.localToWorld(new THREE.Vector3(F.flagW, 0, 0));
  };

  // Furled: the cloth falls to the foot of the spar and hangs against the wood.
  for (let i = 0; i < 120; i++) flag.update(1 / 60, false);
  const down = flyCorner();
  assert.ok(down.y < group.position.y + F.yardY - F.flagW * 0.8,
    `the furled flag hangs down the post (${down.y.toFixed(2)})`);
  assert.ok(down.y > SURFACE, 'the furled flag is still above the water');

  // Lifted: the same cloth swings up and reaches out from the post.
  for (let i = 0; i < 240; i++) flag.update(1 / 60, true);
  const out = flyCorner();
  assert.ok(Math.abs(out.y - (group.position.y + F.yardY)) < F.flagH * 0.5,
    `the flying flag reaches out level with the spar (${out.y.toFixed(2)})`);
  assert.ok(out.x > group.position.x + F.flagW * 0.7,
    `the flying flag streams out from the post (${out.x.toFixed(2)})`);
});
