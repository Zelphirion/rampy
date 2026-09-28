// Unit tests for the taffy-puller stretch state machine. Run:
//   node --test src/carTaffyMode.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TAFFY_STRETCH_TIME,
  TAFFY_RECOVER_TIME,
  TAFFY_MAX_X,
  TAFFY_MIN_Z,
  createTaffyState,
  getTaffyScale,
  stepTaffyState,
} from './carTaffyMode.mjs';

const EPS = 1e-6;

test('idle state is fully normal scale', () => {
  const s = createTaffyState(false);
  const g = getTaffyScale(s);
  assert.equal(g.sx, 1);
  assert.equal(g.sz, 1);
  assert.equal(s.active, false);
  assert.equal(s.phase, 'normal');
});

test('tripping starts a stretch that grows long + thin over 5s', () => {
  let s = createTaffyState(false);
  s = stepTaffyState(s, 0.016, true);
  assert.equal(s.active, true);
  assert.equal(s.phase, 'stretch');
  assert.equal(s.timer, 0);
  // Mid-stretch, scale is between normal and max.
  s = stepTaffyState(s, 2.5);
  let g = getTaffyScale(s);
  assert.ok(g.sx > 1 && g.sx < TAFFY_MAX_X, `sx ${g.sx} must be growing`);
  assert.ok(g.sz < 1 && g.sz > TAFFY_MIN_Z, `sz ${g.sz} must be thinning`);
  // End of stretch reaches the noodle extremes.
  s = stepTaffyState(s, 2.5);
  assert.equal(s.phase, 'recover');
  g = getTaffyScale(s);
  assert.ok(Math.abs(g.sx - TAFFY_MAX_X) < 0.05, `sx ${g.sx}`);
  assert.ok(Math.abs(g.sz - TAFFY_MIN_Z) < 0.05, `sz ${g.sz}`);
});

test('the stretch clock runs TAFFY_STRETCH_TIME long', () => {
  let s = createTaffyState(false);
  s = stepTaffyState(s, 0.016, true);
  // Drive most of the way but not over the edge.
  s = stepTaffyState(s, TAFFY_STRETCH_TIME - 0.01);
  assert.equal(s.phase, 'stretch');
  // Cross the threshold → recover.
  s = stepTaffyState(s, 0.02);
  assert.equal(s.phase, 'recover');
});

test('re-trip mid-stretch resets the clock and re-elongates', () => {
  let s = createTaffyState(false);
  s = stepTaffyState(s, 0.016, true);
  s = stepTaffyState(s, 3);           // 3s in
  const before = getTaffyScale(s).sx;
  s = stepTaffyState(s, 0.016, true); // bumped again
  assert.equal(s.phase, 'stretch');
  assert.ok(s.timer < 0.1, 'timer must reset on re-trip');
  const after = getTaffyScale(s).sx;
  assert.ok(after < before, 're-trip must restart from the un-stretched size');
});

test('recover snaps back through a spring overshoot and deactivates', () => {
  let s = createTaffyState(false);
  s = stepTaffyState(s, 0.016, true);
  s = stepTaffyState(s, TAFFY_STRETCH_TIME);
  assert.equal(s.phase, 'recover');
  // Halfway through recovery, the spring overshoot nudges the car slightly
  // past normal scale (a quick draw-in) before settling.
  s = stepTaffyState(s, TAFFY_RECOVER_TIME / 2);
  const g = getTaffyScale(s);
  assert.ok(g.sx >= 0.8 && g.sx <= 1.0, 'recover must not collapse the car');
  assert.ok(g.sz >= 0.8 && g.sz <= 1.2, 'recover must not fatten the car');
  // Finish → completely normal again.
  s = stepTaffyState(s, TAFFY_RECOVER_TIME);
  assert.equal(s.active, false);
  assert.equal(s.phase, 'normal');
  const g2 = getTaffyScale(s);
  assert.ok(Math.abs(g2.sx - 1) < EPS);
  assert.ok(Math.abs(g2.sz - 1) < EPS);
});

test('the noodle never goes below the min widths', () => {
  for (let i = 0; i < 600; i++) {
    let s = createTaffyState(false);
    s = stepTaffyState(s, 0.016, true);
    s = stepTaffyState(s, i * 0.016);
    const g = getTaffyScale(s);
    assert.ok(g.sx >= TAFFY_MIN_Z && g.sx <= TAFFY_MAX_X * 1.15, `sx ${g.sx.toFixed(3)} at ${i}`);
    assert.ok(g.sz >= TAFFY_MIN_Z && g.sz <= 1.15, `sz ${g.sz.toFixed(3)} at ${i}`);
  }
});