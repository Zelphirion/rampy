import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlatCarState, stepFlatCarState, getFlatCarScaleY } from './carFlatMode.mjs';

test('flat car stays low while driving and triggers bounce after 6 seconds', () => {
  let next = createFlatCarState(true);

  for (let i = 0; i < 59; i++) {
    next = stepFlatCarState(next, 0.1, true);
  }

  assert.equal(next.phase, 'flat');
  assert.ok(Math.abs(getFlatCarScaleY(next) - 0.22) < 0.01);

  next = stepFlatCarState(next, 0.1, true);
  assert.equal(next.phase, 'bounce');
  assert.ok(getFlatCarScaleY(next) >= 1.0);
});

test('bounce settles back to normal shape', () => {
  const state = { active: true, phase: 'bounce', timer: 1.0, bounceTotalTime: 1.15, bounceRiseTime: 0.28, bouncePeakScaleY: 2 };
  const next = stepFlatCarState(state, 0.2, true);

  assert.equal(next.phase, 'normal');
  assert.ok(Math.abs(getFlatCarScaleY(next) - 1) < 0.001);
});
