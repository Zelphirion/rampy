// The fire's rules, measured without a renderer.
//
//   Run: node --test src/ash.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASH_CLEAN, ASH_COVERED, ASH_BURNING, ASH_BURN_TIME, ASH_RECOVER, ASH_SOOT,
  makeAsh, inHearth, stepAsh, ashBlack, ashFlakeRate, ashSettled,
} from './ash.js';

// The living-room hearth, in the same numbers the house builder uses.
const HEARTH = { x0: -82, x1: -66, z0: -4, z1: 20 };

test('a car that never goes near the fire stays clean', () => {
  const s = makeAsh();
  for (let i = 0; i < 120; i++) stepAsh(s, false, 1 / 60);
  assert.equal(s.mode, ASH_CLEAN);
  assert.equal(ashBlack(s), 0);
  assert.equal(ashFlakeRate(s), 0);
  assert.ok(ashSettled(s));
});

test('the hearth trigger is caught by the nose, not the centre', () => {
  // Just outside the east edge of the box: the radius is what tips it over.
  assert.ok(!inHearth(HEARTH, -65.5, 8, 0));
  assert.ok(inHearth(HEARTH, -65.5, 8, 1));
  // Well clear on every side.
  assert.ok(!inHearth(HEARTH, -60, 8, 2.2));
  assert.ok(!inHearth(HEARTH, -74, 30, 2.2));
  assert.ok(!inHearth(HEARTH, -74, -12, 2.2));
});

test('driving in makes the car ash-covered, not black', () => {
  const s = makeAsh();
  stepAsh(s, true, 1 / 60);
  assert.equal(s.mode, ASH_COVERED);
  assert.equal(ashBlack(s), ASH_SOOT);
  // Sitting in the hearth does not shed flakes: there is nothing burning off yet.
  assert.equal(ashFlakeRate(s), 0);
});

test('driving out turns the car black and starts the burnout', () => {
  const s = makeAsh();
  stepAsh(s, true, 1 / 60);
  stepAsh(s, false, 1 / 60);
  assert.equal(s.mode, ASH_BURNING);
  assert.equal(s.t, ASH_BURN_TIME);
  assert.equal(ashBlack(s), 1);
  assert.ok(ashFlakeRate(s) > 0);
});

test('the car comes back to its own colour once the burnout is over', () => {
  const s = makeAsh();
  stepAsh(s, true, 1 / 60);
  stepAsh(s, false, 1 / 60);
  let steps = 0;
  while (s.mode !== ASH_CLEAN && steps < 10000) { stepAsh(s, false, 1 / 60); steps++; }
  assert.equal(s.mode, ASH_CLEAN);
  assert.equal(ashBlack(s), 0);
  assert.equal(ashFlakeRate(s), 0);
  assert.ok(ashSettled(s));
  // ASH_BURN_TIME seconds of real time, give or take the frame it started on.
  assert.ok(Math.abs(steps / 60 - ASH_BURN_TIME) < 0.1, `burned for ${steps / 60}s`);
});

test('the recovery is a fade, not a pop', () => {
  const s = makeAsh();
  stepAsh(s, true, 1 / 60);
  stepAsh(s, false, 1 / 60);
  // Pitch black for the first ASH_BURN_TIME - ASH_RECOVER seconds...
  stepAsh(s, false, ASH_BURN_TIME - ASH_RECOVER - 0.5);
  assert.equal(ashBlack(s), 1);
  // ...then the last ASH_RECOVER seconds ramp it back down to 0.
  stepAsh(s, false, 0.5);
  const early = ashBlack(s);
  assert.ok(early > 0.7 && early < 1, `just into the fade should still be nearly black, got ${early}`);
  stepAsh(s, false, ASH_RECOVER * 0.4);
  const half = ashBlack(s);
  assert.ok(half > 0 && half < early, `the fade should be climbing back, got ${half}`);
  stepAsh(s, false, ASH_RECOVER);
  assert.equal(ashBlack(s), 0);
  assert.equal(s.mode, ASH_CLEAN);
});

test('ashBlack and ashFlakeRate never go outside 0..1', () => {
  const s = makeAsh();
  stepAsh(s, true, 1 / 60);
  stepAsh(s, false, 1 / 60);
  for (let i = 0; i < 2000; i++) {
    stepAsh(s, false, 1 / 60);
    assert.ok(ashBlack(s) >= 0 && ashBlack(s) <= 1);
    assert.ok(ashFlakeRate(s) >= 0);
  }
});

test('driving back in mid-burnout re-covers the car and restarts the clock', () => {
  const s = makeAsh();
  stepAsh(s, true, 1 / 60);
  stepAsh(s, false, 1 / 60);
  stepAsh(s, false, 3);
  assert.ok(s.t < ASH_BURN_TIME);
  stepAsh(s, true, 1 / 60);
  assert.equal(s.mode, ASH_COVERED);
  assert.equal(s.t, 0);
  // ...and leaving again gives the full burnout, not the remainder.
  stepAsh(s, false, 1 / 60);
  assert.equal(s.t, ASH_BURN_TIME);
});

test('the flame itself cannot strand the car grey with a dead timer', () => {
  // Sitting in the hearth for a long time must not eat the countdown, or the
  // car would drive out and stay grey forever.
  const s = makeAsh();
  stepAsh(s, true, 1 / 60);
  for (let i = 0; i < 60 * 60; i++) stepAsh(s, true, 1 / 60);
  assert.equal(s.mode, ASH_COVERED);
  assert.equal(s.t, 0);
  stepAsh(s, false, 1 / 60);
  assert.equal(s.mode, ASH_BURNING);
  assert.equal(s.t, ASH_BURN_TIME);
});
