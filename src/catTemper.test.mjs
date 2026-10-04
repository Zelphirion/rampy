// Tests for the cat's temper. Run: node --test src/catTemper.test.mjs
//
// The rule being protected: wake the cat and it chases you and swats you THREE
// times — three, not four, and not "however many fit in the time" — and then it
// loses interest and goes off to find a bed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CAT_MAX_SWIPES, CAT_RISE_TIME, swipeSpent, swipesLeft } from './catTemper.js';

test('the budget is three swats', () => {
  assert.equal(CAT_MAX_SWIPES, 3, 'the cat is not losing interest after three swats');
});

test('the arch is under a second', () => {
  assert.ok(CAT_RISE_TIME > 0 && CAT_RISE_TIME < 1,
    `the arch beat is ${CAT_RISE_TIME}s, which does not read as a beat`);
});

test('the budget is spent on the third swat, not the fourth', () => {
  assert.equal(swipeSpent(0), false, 'it was bored before it started');
  assert.equal(swipeSpent(CAT_MAX_SWIPES - 1), false,
    'it gave up after two — one short of the ask');
  assert.equal(swipeSpent(CAT_MAX_SWIPES), true, 'it was still going after the third swat');
  assert.equal(swipeSpent(CAT_MAX_SWIPES + 1), true);
});

test('swats left counts down and never goes below zero', () => {
  assert.equal(swipesLeft(0), 3);
  assert.equal(swipesLeft(1), 2);
  assert.equal(swipesLeft(2), 1);
  assert.equal(swipesLeft(3), 0);
  assert.equal(swipesLeft(4), 0, 'reported a negative budget after the cat gave up');
});

test('nothing but the count ends it — not distance, not time', () => {
  // The old cat gave up after 25 seconds of chasing, which meant the number of
  // swats you received depended on how fast you drove: keep your distance and
  // you got none, stay alongside and you got a dozen. swipeSpent takes no
  // distance and no time argument at all, and this pins the consequence: across
  // the whole range it flips exactly once, on the third.
  let switches = 0;
  let prev = swipeSpent(0);
  for (let n = 0; n <= CAT_MAX_SWIPES; n++) {
    const now = swipeSpent(n);
    if (now !== prev) switches++;
    prev = now;
  }
  assert.equal(switches, 1, 'the cat changed its mind more than once inside three swats');
});

test('a whole simulated chase hands back control on the third swat', () => {
  // Drive the real call pattern from the cat's update loop at 60fps, with the car
  // parked far away the whole time — the case that used to end the chase early.
  // The cat should keep coming, because it has not managed to swat you yet.
  let awakeFor = 0, riseT = 0, swipes = 0, mode = 'rising', gaveUpAt = null, swipeCd = 0;
  const step = () => {
    const delta = 1 / 60;
    swipeCd = Math.max(0, swipeCd - delta);
    if (mode === 'rising') {
      riseT += delta;
      awakeFor += delta;
      if (swipeSpent(swipes)) mode = 'returning';
      else if (riseT > CAT_RISE_TIME) mode = 'chase';
    } else if (mode === 'chase') {
      awakeFor += delta;
      // No swat ever lands, because the car is 900 units away.
      if (swipeSpent(swipes)) mode = 'returning';
    }
  };
  for (let f = 0; f < 60 * 60; f++) {
    step();
    if (mode === 'returning') { gaveUpAt = awakeFor; break; }
  }
  assert.equal(gaveUpAt, null,
    `the cat gave up after ${gaveUpAt === null ? 0 : gaveUpAt.toFixed(1)}s without ever ` +
    'swatting — distance must not end the chase');
  void swipeCd;
});

test('and it hands back control on the third swat when the car stays in reach', () => {
  // The mirror image: the car is always in range, so the cat gets its three swats
  // and then stops. Spent BEFORE the swat is thrown, which is what makes the count
  // exactly three rather than four — a fourth would leak through the cooldown on
  // the frame after the third.
  const fired = [];
  let awakeFor = 0, riseT = 0, swipes = 0, mode = 'rising', swipeCd = 0;
  for (let f = 0; f < 60 * 60; f++) {
    const delta = 1 / 60;
    awakeFor += delta;
    swipeCd = Math.max(0, swipeCd - delta);
    if (mode === 'rising') {
      riseT += delta;
      if (swipeSpent(swipes)) mode = 'returning';
      else if (riseT > CAT_RISE_TIME) mode = 'chase';
    } else if (mode === 'chase') {
      if (!swipeSpent(swipes) && swipeCd <= 0) {
        swipeCd = 1.9;
        swipes++;
        fired.push(swipes);
        if (swipeSpent(swipes)) mode = 'returning';
      }
    }
    if (mode === 'returning') break;
  }
  assert.deepEqual(fired, [1, 2, 3],
    `the cat threw ${fired.length} swat(s) (${fired.join(', ')}); three is the ask`);
});

test('the arch is not a free swat and does not eat the budget', () => {
  // After the arch the cat must still have all three swats available. If the arch
  // were counted as one, the third actual swat would never arrive.
  assert.equal(swipesLeft(0), CAT_MAX_SWIPES,
    'the arch appears to be spending the swat budget');
});
