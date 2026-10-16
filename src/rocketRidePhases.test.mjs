// The boarding-cinematic choreography, tested as a pure timeline
// (src/rocketRidePhases.js), which src/main.js feeds the ride clock:
//
//   1. It is a fixed, ordered, one-shot list of named segments; the lookup
//      clamps cleanly at both ends (no wrap, no gap, no overshoot).
//   2. Every derived value stays inside its legal range the whole way through.
//   3. The story happens in order: the claw closes on the car, the car shrinks,
//      it is set down in the hold and marked attached, the roof seals, the hull
//      erects, taxis, ignites and launches out of sight, then the screen fades.
//
// Run: node --test src/rocketRidePhases.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {  RIDE_SEGMENTS,
  RIDE_CYCLE,
  RIDE_MAX_Y,
  RIDE_CAR_SCALE,
  RIDE_DONE,
  ridePhaseAt,
  rideStateAt,
} from './rocketRidePhases.js';

test('the ride is an ordered one-shot list that sums to RIDE_CYCLE', () => {
  assert.ok(RIDE_SEGMENTS.length >= 8);
  for (const [name, dur] of RIDE_SEGMENTS) {
    assert.equal(typeof name, 'string');
    assert.ok(dur > 0, `${name} must last a positive time`);
  }
  assert.equal(RIDE_SEGMENTS.reduce((a, s) => a + s[1], 0), RIDE_CYCLE);
  assert.equal(RIDE_SEGMENTS[0][0], 'establish');
  assert.equal(RIDE_SEGMENTS[RIDE_SEGMENTS.length - 1][0], 'fade');
});

test('ridePhaseAt clamps at both ends and never lands in a gap', () => {
  const names = new Set(RIDE_SEGMENTS.map(([n]) => n));
  const before = ridePhaseAt(-5);
  assert.equal(before.phase, 'establish');
  assert.equal(before.local, 0);
  const after = ridePhaseAt(RIDE_CYCLE + 50);
  assert.equal(ridePhaseAt(RIDE_CYCLE).phase, 'fade');
  assert.equal(ridePhaseAt(RIDE_CYCLE).local, 1);
  assert.equal(ridePhaseAt(RIDE_CYCLE + 1).local, 1);
  assert.ok(RIDE_DONE(RIDE_CYCLE));
  assert.ok(!RIDE_DONE(RIDE_CYCLE - 1e-6));
  for (let i = 0; i <= 600; i++) {
    const t = (i / 600) * RIDE_CYCLE;
    const { phase, local } = ridePhaseAt(t);
    assert.ok(RIDE_SEGMENTS.some(([n]) => n === phase), `phase "${phase}" is not a segment`);
    assert.ok(local >= 0 && local <= 1.0000001, `local ${local} out of range at t=${t}`);
  }
});

test('every derived value stays in range for the whole ride', () => {
  for (let i = 0; i <= 800; i++) {
    const t = (i / 800) * RIDE_CYCLE;
    const s = rideStateAt(t);
    for (const k of ['grip', 'carScale', 'windowOpen', 'tilt', 'pad', 'plume', 'fade']) {
      assert.ok(s[k] >= 0 && s[k] <= 1, `${k}=${s[k]} out of 0..1 at t=${t}`);
    }
    assert.ok(s.y >= 0 && s.y <= RIDE_MAX_Y, `y=${s.y} out of range at t=${t}`);
  }
});

test('the car is shrunk on the cut, the claw grabs it, and it is set down attached', () => {
  assert.equal(rideStateAt(0).grip, 0, 'claw starts open');
  assert.equal(rideStateAt(0).carScale, RIDE_CAR_SCALE, 'car is already small on the cut');
  assert.ok(RIDE_CAR_SCALE > 0 && RIDE_CAR_SCALE < 1,
    'the shrink keeps the car visible and able to fit the hold');
  const grabEnd = startPhaseEnd('grab');
  assert.ok(rideStateAt(grabEnd - 0.001).grip > 0.99, 'claw is shut by the end of the grab');
  // The car never changes size during the ride: the shrink happened on the cut.
  for (let i = 0; i <= 200; i++) {
    assert.equal(rideStateAt((i / 200) * RIDE_CYCLE).carScale, RIDE_CAR_SCALE,
      'car scale stays constant through the ride');
  }
  assert.equal(rideStateAt(0).attached, false, 'not attached at the start');
  assert.equal(rideStateAt(startPhase('insert')).attached, false, 'not attached until it is set down');
  assert.equal(rideStateAt(startPhaseEnd('insert')).attached, true, 'attached once seated');
});

test('the roof seals, the hull erects, taxes, ignites and launches', () => {
  assert.equal(rideStateAt(startPhase('seal')).windowOpen, 1, 'roof still open before sealing');
  assert.ok(rideStateAt(startPhaseEnd('seal') + 0.001).windowOpen < 0.01, 'roof shut after sealing');
  assert.ok(rideStateAt(startPhase('erect')).tilt < 0.01, 'flat before erecting');
  assert.ok(rideStateAt(startPhase('taxi')).tilt > 0.99, 'upright before taxiing');
  assert.equal(rideStateAt(startPhase('ignite')).pad, 1, 'on the pad as it ignites');
  assert.equal(rideStateAt(startPhase('launch') + RIDE_SEGMENTS.find(([n]) => n === 'launch')[1] * 0.5).plume, 1,
    'main engine burns through the launch');
  const wayUp = rideStateAt(startPhaseEnd('launch') - 0.001);
  assert.ok(wayUp.y > RIDE_MAX_Y * 0.5, 'it is high in the sky by the launch end');
  assert.equal(rideStateAt(RIDE_CYCLE).fade, 1, 'the screen is black at the very end');
});

// helpers built on the segment table -----------------------------------------
function startPhase(name) { let t = 0; for (const [n, d] of RIDE_SEGMENTS) { if (n === name) return t; t += d; } throw new Error(name); }
function startPhaseEnd(name) { let t = 0; for (const [n, d] of RIDE_SEGMENTS) { if (n === name) return t + d; t += d; } throw new Error(name); }

test('altitude only ever rises during the launch: no teleport', () => {
  const launchStart = startPhase('launch');
  let prev = rideStateAt(launchStart).y;
  for (let i = 1; i <= 1000; i++) {
    const s = rideStateAt(launchStart + (i / 1000) * (RIDE_CYCLE - launchStart));
    assert.ok(s.y >= prev - 1e-9, `altitude went backwards at step ${i}`);
    assert.ok(s.y - prev < RIDE_MAX_Y / 12, `altitude jumped at step ${i}: ${prev} -> ${s.y}`);
    prev = s.y;
  }
});
