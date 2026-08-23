// Unit tests for the retracting-stair cycle math (TODO task #29).
// Run: node --test src/modules/stairCycle.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STAIR_CYCLE_DEFAULTS,
  stepTau,
  stepExtension,
  stepColliderActive,
} from './stairCycle.js';

const EPS = 1e-9;

test('defaults are sane fractions', () => {
  const { period, outFrac, transFrac } = STAIR_CYCLE_DEFAULTS;
  assert.ok(period > 0);
  assert.ok(transFrac > 0 && outFrac - transFrac > transFrac,
    'hold-out window must be non-empty');
  assert.ok(outFrac < 1);
});

test('stepTau wraps into [0,1) and honours per-index phase offset', () => {
  for (let i = 0; i < 9; i++) {
    for (const t of [0, 1.3, 5.75, 12.4, -2.2]) {
      const tau = stepTau(t, i, { period: 6, phaseStep: 1 / 9 });
      assert.ok(tau >= 0 && tau < 1, `tau=${tau} out of range`);
    }
  }
  // Tier i at time t sits at the same cycle position as tier 0 does
  // i·phaseStep·period LATER (tier i leads tier 0 by that much).
  const period = 6, phaseStep = 1 / 9;
  for (let i = 1; i < 9; i++) {
    for (let t = 0; t < 12; t += 0.37) {
      const a = stepTau(t, i, { period, phaseStep });
      const b = stepTau(t + i * phaseStep * period, 0, { period, phaseStep });
      assert.ok(Math.abs(a - b) < 1e-9 || Math.abs(a - b) > 1 - 1e-9,
        `phase shift mismatch at i=${i} t=${t}: ${a} vs ${b}`);
    }
  }
});

test('stepExtension holds plateaus and eases between them', () => {
  const { outFrac, transFrac } = STAIR_CYCLE_DEFAULTS;
  // Fully retracted plateau.
  assert.equal(stepExtension(0.999), 0);
  assert.equal(stepExtension((outFrac + 1) / 2), 0);
  // Fully extended plateau.
  assert.equal(stepExtension(0.5), 1);
  assert.equal(stepExtension(outFrac - transFrac - EPS), 1);
  // Endpoints of the transitions touch both extremes.
  assert.equal(stepExtension(0), 0);
  assert.equal(stepExtension(transFrac), 1);
  assert.equal(stepExtension(outFrac - transFrac), 1);   // retract ramp starts at full extension
  assert.equal(stepExtension(outFrac), 0);               // retract ramp ends fully retracted
});

test('stepExtension is monotone on each transition and always in [0,1]', () => {
  const N = 400;
  let prev = 0;
  for (let i = 0; i <= N; i++) {
    const tau = i / N;
    const e = stepExtension(tau);
    assert.ok(e >= 0 && e <= 1, `extension ${e} out of range at tau=${tau}`);
    if (tau < 0.12) assert.ok(e >= prev - EPS, 'extend ramp must not fall');
    else if (tau >= 0.6 && tau < 0.72) assert.ok(e <= prev + EPS, 'retract ramp must not rise');
    prev = e;
  }
});

test('collider is active exactly when extension ≥ threshold', () => {
  for (let i = 0; i <= 100; i++) {
    const e = stepExtension(i / 100);
    assert.equal(stepColliderActive(e), e >= 0.5);
  }
  assert.equal(stepColliderActive(0.49), false);
  assert.equal(stepColliderActive(0.5), true);
  assert.equal(stepColliderActive(0.9, 0.95), false);
});

test('phase-offset wave always leaves a climbable band of tiers', () => {
  // The in-game configuration: 9 tiers, phases spread evenly across a cycle.
  const TIERS = 9;
  const opts = { period: 6, phaseStep: 1 / TIERS };
  let minActive = Infinity;
  let maxActive = 0;
  for (let i = 0; i <= 1200; i++) {
    const t = (i / 200) * opts.period;   // two full cycles, fine steps
    let active = 0;
    for (let k = 0; k < TIERS; k++) {
      if (stepColliderActive(stepExtension(stepTau(t, k, opts)))) active++;
    }
    minActive = Math.min(minActive, active);
    maxActive = Math.max(maxActive, active);
  }
  assert.ok(minActive >= 4,
    `wave must always keep ≥4 tiers climbable, saw minimum ${minActive}`);
  assert.ok(maxActive <= TIERS - 2,
    `wave must retract some tiers, saw maximum ${maxActive}`);
});
